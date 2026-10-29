// Read models for the learner's pages: project home, a step, a teach-back. Server only.
// Answer keys never leave the server. Rubric point texts are shown only with a grade, except in a Guided
// teach-back, which is split into its points by design (PRODUCT_BRIEF section 5).
import "server-only";
import { one, rows } from "@/lib/db";
import { enrollmentFor, type SupportLevel } from "@/lib/learner";

const json = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

export interface GradedView {
  answerId: string;
  body: string;
  grade: "met" | "partial" | "not_yet" | "ungraded";
  gradedBy: "key" | "model" | null;
  attempt: number;
  disputed: boolean;
  points: { id: string; point: string; concept: string | null; met: boolean; quote: string | null }[] | null;
  createdAt: string;
  feedback: string | null;
  followup: string | null;
}

async function project(slug: string) {
  return one<{ id: string; slug: string; title: string; source_url: string; summary: string; primer: any; restate_rubric: any; reflection_prompt: string; content_status: string }>(
    `select id, slug, title, source_url, summary, primer, restate_rubric, reflection_prompt, content_status from challenge where slug = $1 and content_status <> 'listed'`,
    [slug]
  );
}

/** Every milestone with its steps and the learner's step states, for the rail and the project home. */
export async function milestonesFor(challengeId: string, enrollmentId: string | null) {
  const ms = await rows<{ id: string; position: number; title: string; summary: string; est_minutes: number; question_id: string | null; understood: boolean }>(
    `select m.id, m.position, m.title, m.summary, e.est_minutes, q.id as question_id, coalesce(mp.understood, false) as understood
       from milestone m join v_milestone_estimate e on e.milestone_id = m.id
       left join question q on q.milestone_id = m.id and q.position = 1
       left join v_milestone_progress mp on mp.milestone_id = m.id and mp.enrollment_id = $2
      where m.challenge_id = $1 order by m.position`,
    [challengeId, enrollmentId]
  );
  const steps = await rows<{ id: string; milestone_id: string; position: number; title: string; est_minutes: number; kind: string; status: string; help_level: string; checking: boolean }>(
    `select s.id, s.milestone_id, s.position, s.title, s.est_minutes, t.kind, coalesce(ss.status, 'not_started') as status, coalesce(ss.help_level, 'none') as help_level,
            exists (select 1 from run r where r.enrollment_id = $2 and r.step_id = s.id and r.kind = 'grade' and r.status in ('queued', 'running')) as checking
       from step s join milestone m on m.id = s.milestone_id join task t on t.step_id = s.id and t.role = 'think'
       left join step_state ss on ss.step_id = s.id and ss.enrollment_id = $2
      where m.challenge_id = $1 order by m.position, s.position`,
    [challengeId, enrollmentId]
  );
  const gate = enrollmentId
    ? await rows<{ question_id: string; best: string; checking: boolean }>(
        `select q.id as question_id,
                coalesce((select a.grade from answer a where a.question_id = q.id and a.enrollment_id = $2
                           order by (a.grade = 'met') desc, (a.grade = 'partial') desc, a.created_at desc limit 1), 'none') as best,
                exists (select 1 from run r where r.enrollment_id = $2 and r.question_id = q.id and r.status in ('queued', 'running')) as checking
           from question q join milestone m on m.id = q.milestone_id where m.challenge_id = $1`,
        [challengeId, enrollmentId]
      )
    : [];
  return ms.map((m) => ({
    ...m,
    teachBack: gate.find((g) => g.question_id === m.question_id) ?? { question_id: m.question_id, best: "none", checking: false },
    steps: steps.filter((s) => s.milestone_id === m.id),
  }));
}

export async function conceptsFor(challengeId: string, learnerId: string | null) {
  return rows<{ id: string; slug: string; name: string; brief: string; milestone: number; status: string }>(
    `select c.id, c.slug, c.name, c.brief, min(m.position) as milestone, coalesce(cs.status, 'new') as status
       from milestone m join milestone_concept mc on mc.milestone_id = m.id join concept c on c.id = mc.concept_id
       left join concept_state cs on cs.concept_id = c.id and cs.learner_id = $2
      where m.challenge_id = $1 group by c.id, cs.status order by min(m.position), c.name`,
    [challengeId, learnerId]
  );
}

async function latestAnswer(enrollmentId: string, where: string, id: string | null, rubric: { id: string; point: string; concept?: string }[] | null): Promise<GradedView | null> {
  const a = await one<any>(
    `select id, body, grade, graded_by, attempt, disputed_at, points, created_at from answer where enrollment_id = $1 and ${where} order by created_at desc, attempt desc limit 1`,
    id ? [enrollmentId, id] : [enrollmentId]
  );
  if (!a) return null;
  const pts = a.points ? json<{ id: string; met: boolean; quote?: string }[]>(a.points) : null;
  // The grader's feedback and follow-up live on the run that produced this answer.
  const run = a.graded_by === "model"
    ? await one<{ result: any }>(`select result from run where enrollment_id = $1 and kind = 'grade' and result->>'answerId' = $2 limit 1`, [enrollmentId, a.id])
    : null;
  const res = run ? json<{ feedback?: string; followup?: string | null }>(run.result) : null;
  return {
    feedback: res?.feedback ?? null, followup: res?.followup ?? null,
    answerId: a.id, body: a.body, grade: a.grade, gradedBy: a.graded_by, attempt: a.attempt, disputed: !!a.disputed_at, createdAt: a.created_at,
    points: pts && rubric ? rubric.map((r) => { const p = pts.find((x) => x.id === r.id); return { id: r.id, point: r.point, concept: r.concept ?? null, met: !!p?.met, quote: p?.quote ?? null }; }) : null,
  };
}

async function pendingRun(enrollmentId: string, column: "step_id" | "question_id" | null, id: string | null, kind = "grade") {
  const r = await one<{ id: string; status: string; body: string | null }>(
    `select id, status, input->>'body' as body from run where enrollment_id = $1 and kind = $2 ${column ? `and ${column} = $3` : "and step_id is null and question_id is null"}
      order by created_at desc limit 1`,
    column ? [enrollmentId, kind, id] : [enrollmentId, kind]
  );
  return r && (r.status === "queued" || r.status === "running" || r.status === "paused") ? r : null;
}

/** Generated language notes and verified references for some concepts, plus the run still preparing them. */
export async function languageLayer(enrollmentId: string, language: string | null, framework: string | null, conceptIds: string[]) {
  const notes = language
    ? await rows<{ concept_id: string; status: string; data: any }>(
        `select concept_id, status, data from concept_language where concept_id = any($1) and language = $2 and framework = $3`,
        [conceptIds, language, framework ?? ""]
      )
    : [];
  const refs = await rows<{ concept_id: string; title: string; url: string }>(
    `select concept_id, title, url from resource where concept_id = any($1) and http_status = 200 and verified_at is not null and language is null order by verified_at`,
    [conceptIds]
  );
  const runs = await rows<{ id: string; kind: string; status: string }>(
    `select distinct on (kind) id, kind, status from run where enrollment_id = $1 and kind in ('language', 'references') order by kind, created_at desc`,
    [enrollmentId]
  );
  const active = (k: string) => runs.find((r) => r.kind === k && (r.status === "queued" || r.status === "running"))?.id ?? null;
  return {
    language, framework,
    notes: notes.filter((n) => n.status === "done").map((n) => ({ conceptId: n.concept_id, ...(typeof n.data === "string" ? JSON.parse(n.data) : n.data) })),
    references: refs.map((r) => ({ conceptId: r.concept_id, title: r.title, url: r.url })),
    languageRunId: active("language"),
    referencesRunId: active("references"),
  };
}

export async function projectHome(learnerId: string | null, slug: string) {
  const ch = await project(slug);
  if (!ch) return null;
  const en = await enrollmentFor(learnerId, slug);
  const milestones = await milestonesFor(ch.id, en?.id ?? null);
  const concepts = await conceptsFor(ch.id, learnerId);
  const restate = en ? await latestAnswer(en.id, `kind = 'restate'`, null, json(ch.restate_rubric)) : null;
  const restateRun = en ? await pendingRun(en.id, null, null) : null;
  const next = milestones.flatMap((m) => m.steps.map((s) => ({ ...s, milestone: m.position }))).find((s) => s.status !== "done") ?? null;
  const nextTeachBack = milestones.find((m) => m.steps.every((s) => s.status === "done") && !m.understood) ?? null;
  const progress = en ? await one<{ milestones_total: number; milestones_understood: number; reflection_submitted: boolean; understood: boolean }>(
    `select milestones_total, milestones_understood, reflection_submitted, understood from v_enrollment_progress where enrollment_id = $1`, [en.id]
  ) : null;
  const help = en ? await rows<{ level: string; n: number }>(
    `select payload->>'level' as level, count(*)::int as n from event where enrollment_id = $1 and type = 'help_given' group by 1`, [en.id]
  ) : [];
  const later = en ? await rows<{ id: string; prompt: string; created_at: string }>(
    `select id, prompt, created_at from side_item where enrollment_id = $1 and kind = 'later' order by created_at desc`, [en.id]
  ) : [];
  const started = en ? !!(await one(`select 1 from step_state where enrollment_id = $1 limit 1`, [en.id])) || !!restate : false;
  return {
    project: { slug: ch.slug, title: ch.title, sourceUrl: ch.source_url, summary: ch.summary, primer: json<{ what: string; why: string; example: string; words: { term: string; meaning: string }[] }>(ch.primer), reflectionPrompt: ch.reflection_prompt, reviewed: ch.content_status === "reviewed" },
    enrollment: en ? { id: en.id, supportLevel: en.support_level as SupportLevel, language: en.language, framework: en.framework, status: en.status } : null,
    milestones, concepts, restate, restateRunId: restateRun?.id ?? null, restatePaused: restateRun?.status === "paused", restateRunBody: restateRun?.body ?? null,
    next, nextTeachBack: nextTeachBack ? { position: nextTeachBack.position, title: nextTeachBack.title } : null,
    progress, help, later, firstVisit: !started,
  };
}

export async function stepView(learnerId: string, slug: string, m: number, s: number) {
  const ch = await project(slug);
  const en = await enrollmentFor(learnerId, slug);
  if (!ch || !en) return null;
  const step = await one<{ id: string; title: string; est_minutes: number; position: number; milestone_id: string; milestone_title: string }>(
    `select s.id, s.title, s.est_minutes, s.position, m.id as milestone_id, m.title as milestone_title
       from step s join milestone m on m.id = s.milestone_id where m.challenge_id = $1 and m.position = $2 and s.position = $3`,
    [ch.id, m, s]
  );
  if (!step) return null;
  const think = await one<{ kind: string; prompt: string; snippet: string | null; rubric: any }>(`select kind, prompt, snippet, rubric from task where step_id = $1 and role = 'think'`, [step.id]);
  const build = en.language ? await one<{ prompt: string }>(`select prompt from task where step_id = $1 and role = 'build'`, [step.id]) : null;
  const hasHint = await rows<{ level: string }>(`select distinct level from hint where step_id = $1`, [step.id]);
  const milestones = await milestonesFor(ch.id, en.id);
  const concepts = (await conceptsFor(ch.id, learnerId)).filter((c) => c.milestone === m);
  const milestoneConcepts = await rows<{ id: string; slug: string; name: string; brief: string; status: string; lesson: unknown }>(
    `select c.id, c.slug, c.name, c.brief, coalesce(cs.status, 'new') as status, to_jsonb(c) -> 'lesson' as lesson from milestone_concept mc join concept c on c.id = mc.concept_id
       left join concept_state cs on cs.concept_id = c.id and cs.learner_id = $2 where mc.milestone_id = $1 order by c.name`,
    [step.milestone_id, learnerId]
  );
  const ss = await one<{ status: string; help_level: string }>(`select status, help_level from step_state where enrollment_id = $1 and step_id = $2`, [en.id, step.id]);
  const keyed = think?.kind === "predict" || think?.kind === "trace";
  const latest = await latestAnswer(en.id, `kind = 'think' and task_id = (select id from task where step_id = $2 and role = 'think')`, step.id, keyed ? null : json(think?.rubric));
  const run = await pendingRun(en.id, "step_id", step.id);
  const wrongTries = (await one<{ n: number }>(
    `select count(*)::int as n from answer a join task t on t.id = a.task_id where a.enrollment_id = $1 and t.step_id = $2 and a.grade <> 'met'`, [en.id, step.id]
  ))!.n;
  const messages = await rows<{ id: string; role: string; body: string; step_id: string | null; created_at: string }>(
    `select id::text, role, body, step_id, created_at from (select * from message where enrollment_id = $1 order by id desc limit 30) t order by id`, [en.id]
  );
  const mentorRun = await one<{ id: string; status: string }>(
    `select id, status from run where enrollment_id = $1 and kind = 'mentor' order by created_at desc limit 1`, [en.id]
  );
  const traces = await rows<{ run_id: string; data: any }>(
    `select r.id as run_id, ev.data from run r join run_event ev on ev.run_id = r.id
      where r.enrollment_id = $1 and r.kind = 'mentor' and ev.type = 'trace' and r.created_at > now() - interval '7 days' order by ev.id`, [en.id]
  );
  const mentorRuns = await rows<{ id: string; created_at: string; status: string }>(
    `select id, created_at, status from run where enrollment_id = $1 and kind = 'mentor' order by created_at desc limit 15`, [en.id]
  );
  const all = milestones.flatMap((x) => x.steps.map((y) => ({ m: x.position, s: y.position })));
  const idx = all.findIndex((x) => x.m === m && x.s === s);
  return {
    project: { slug: ch.slug, title: ch.title, sourceUrl: ch.source_url },
    enrollment: { id: en.id, supportLevel: en.support_level as SupportLevel, language: en.language, framework: en.framework },
    milestone: { id: step.milestone_id, position: m, title: step.milestone_title, steps: milestones.find((x) => x.position === m)?.steps.length ?? 0 },
    step: { id: step.id, position: s, title: step.title, estMinutes: step.est_minutes, status: ss?.status ?? "not_started", helpLevel: ss?.help_level ?? "none" },
    think: think ? { kind: think.kind, prompt: think.prompt, snippet: think.snippet, gradedBy: keyed ? "key" : "rubric", points: keyed ? null : json<unknown[]>(think.rubric).length } : null,
    build: build?.prompt ?? null,
    help: { hint: hasHint.some((h) => h.level === "hint"), example: hasHint.some((h) => h.level === "example") },
    latest, runId: run?.id ?? null, runPaused: run?.status === "paused", runBody: run?.body ?? null, wrongTries,
    milestones, concepts: milestoneConcepts.length ? milestoneConcepts : concepts,
    language: await languageLayer(en.id, en.language, en.framework, milestoneConcepts.map((c) => c.id)),
    // Concept lessons (CONTENT_FORMAT v2). to_jsonb keeps this working before the column exists.
    lessons: milestoneConcepts.filter((c) => c.lesson).map(({ id, slug, name, lesson }) => ({ id, slug, name, lesson })),
    mentor: { messages, traces, runs: mentorRuns, activeRunId: mentorRun && (mentorRun.status === "queued" || mentorRun.status === "running") ? mentorRun.id : null },
    prev: idx > 0 ? all[idx - 1] : null,
    next: idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null,
  };
}

export async function teachBackView(learnerId: string, slug: string, m: number) {
  const ch = await project(slug);
  const en = await enrollmentFor(learnerId, slug);
  if (!ch || !en) return null;
  const q = await one<{ id: string; prompt: string; rubric: any; milestone_id: string; title: string }>(
    `select q.id, q.prompt, q.rubric, m.id as milestone_id, m.title from question q join milestone m on m.id = q.milestone_id
      where m.challenge_id = $1 and m.position = $2 order by q.position limit 1`,
    [ch.id, m]
  );
  if (!q) return null;
  const rubric = json<{ id: string; point: string; concept: string }[]>(q.rubric);
  const names = await rows<{ slug: string; name: string; status: string }>(
    `select c.slug, c.name, coalesce(cs.status, 'new') as status from concept c left join concept_state cs on cs.concept_id = c.id and cs.learner_id = $2 where c.slug = any($1)`,
    [rubric.map((r) => r.concept), learnerId]
  );
  const latest = await latestAnswer(en.id, `kind = 'gate' and question_id = $2`, q.id, rubric);
  const run = await pendingRun(en.id, "question_id", q.id);
  const followupUsed = latest ? !!(await one(`select 1 from answer where id = $1 and followup_of is not null`, [latest.answerId])) : false;
  const milestones = await milestonesFor(ch.id, en.id);
  return {
    project: { slug: ch.slug, title: ch.title, sourceUrl: ch.source_url },
    enrollment: { id: en.id, supportLevel: en.support_level as SupportLevel, language: en.language },
    milestone: { id: q.milestone_id, position: m, title: q.title },
    question: {
      id: q.id, prompt: q.prompt, points: rubric.length,
      concepts: rubric.map((r) => ({ slug: r.concept, name: names.find((n) => n.slug === r.concept)?.name ?? r.concept, status: names.find((n) => n.slug === r.concept)?.status ?? "new" })),
      // Guided splits the teach-back into its parts, one box each.
      parts: en.support_level === "guided" ? rubric.map((r) => ({ id: r.id, point: r.point })) : null,
    },
    latest, followupUsed, runId: run?.id ?? null, runPaused: run?.status === "paused", runBody: run?.body ?? null,
    milestones,
    understood: milestones.find((x) => x.position === m)?.understood ?? false,
  };
}
