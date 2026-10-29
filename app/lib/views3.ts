// Read models for format 3 projects (CONTENT_FORMAT v3): the learning map (concepts with lessons, where they
// show up, references, the learner's language notes and the explain-back) and the build plan (steps with one
// checkable outcome, tagged with the concepts they use).
import "server-only";
import { one, rows } from "@/lib/db";
import { enrollmentFor, type SupportLevel } from "@/lib/learner";
import { languageLayer, milestonesFor, type GradedView } from "@/lib/views";

const json = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

export interface MapConcept {
  pcId: string;
  conceptId: string;
  slug: string;
  name: string;
  brief: string;
  where: string;
  position: number;
  status: string; // new | seen | explained | applied
  explained: boolean;
  applied: boolean;
  best: "met" | "partial" | "not_yet" | "none";
  checking: boolean;
}

export async function projectFormat(slug: string) {
  return (await one<{ content_format: number }>(`select content_format from challenge where slug = $1`, [slug]))?.content_format ?? 1;
}

export async function learningMap(challengeId: string, learnerId: string | null, enrollmentId: string | null): Promise<MapConcept[]> {
  return rows<MapConcept>(
    `select pc.id as "pcId", c.id as "conceptId", c.slug, c.name, c.brief, pc.where_text as "where", pc.position,
            coalesce(cs.status, 'new') as status, cs.explained_at is not null as explained, cs.applied_at is not null as applied,
            coalesce((select a.grade from answer a where a.project_concept_id = pc.id and a.enrollment_id = $3
                       order by (a.grade = 'met') desc, (a.grade = 'partial') desc, a.created_at desc limit 1), 'none') as best,
            exists (select 1 from run r where r.enrollment_id = $3 and r.kind = 'grade' and r.status in ('queued', 'running')
                     and r.input->>'projectConceptId' = pc.id::text) as checking
       from project_concept pc join concept c on c.id = pc.concept_id
       left join concept_state cs on cs.concept_id = c.id and cs.learner_id = $2
      where pc.challenge_id = $1 order by pc.position`,
    [challengeId, learnerId, enrollmentId]
  );
}

async function challenge(slug: string) {
  return one<{ id: string; slug: string; title: string; source_url: string; summary: string; primer: any; reflection_prompt: string; reference_tool: string | null; done_when: string | null; open_checks: string[]; content_status: string; restate_rubric: any }>(
    `select id, slug, title, source_url, summary, primer, reflection_prompt, reference_tool, done_when, open_checks, content_status, restate_rubric
       from challenge where slug = $1 and content_format >= 3`,
    [slug]
  );
}

/** Project home, format 3: both tracks and the progress. */
export async function homeV3(learnerId: string | null, slug: string) {
  const ch = await challenge(slug);
  if (!ch) return null;
  const en = await enrollmentFor(learnerId, slug);
  const map = await learningMap(ch.id, learnerId, en?.id ?? null);
  const milestones = await milestonesFor(ch.id, en?.id ?? null);
  const stepConcepts = await rows<{ step_id: string; slug: string; name: string }>(
    `select sc.step_id, c.slug, c.name from step_concept sc join concept c on c.id = sc.concept_id
       join step s on s.id = sc.step_id join milestone m on m.id = s.milestone_id where m.challenge_id = $1 order by c.name`,
    [ch.id]
  );
  const progress = en ? await one<{ milestones_total: number; milestones_understood: number; reflection_submitted: boolean; understood: boolean }>(
    `select milestones_total, milestones_understood, reflection_submitted, understood from v_enrollment_progress where enrollment_id = $1`, [en.id]
  ) : null;
  const restate = en ? await one<{ grade: string; body: string }>(`select grade, body from answer where enrollment_id = $1 and kind = 'restate' order by created_at desc limit 1`, [en.id]) : null;
  const restateRun = en ? await one<{ id: string; status: string }>(
    `select id, status from run where enrollment_id = $1 and kind = 'grade' and input->>'target' = 'restate' order by created_at desc limit 1`, [en.id]
  ) : null;
  const help = en ? await rows<{ level: string; n: number }>(
    `select payload->>'level' as level, count(*)::int as n from event where enrollment_id = $1 and type = 'help_given' group by 1`, [en.id]
  ) : [];
  const later = en ? await rows<{ prompt: string }>(`select prompt from side_item where enrollment_id = $1 and kind = 'later' order by created_at desc`, [en.id]) : [];
  const allSteps = milestones.flatMap((m) => m.steps.map((s) => ({ ...s, m: m.position })));
  const nextStep = allSteps.find((s) => s.status !== "done") ?? null;
  const nextConcept = map.find((c) => !c.explained) ?? null;
  return {
    project: {
      slug: ch.slug, title: ch.title, sourceUrl: ch.source_url, summary: ch.summary, reviewed: ch.content_status === "reviewed",
      primer: json<{ what: string; why: string; example: string; words: { term: string; meaning: string }[] }>(ch.primer),
      referenceTool: ch.reference_tool, doneWhen: ch.done_when, openChecks: ch.open_checks ?? [], reflectionPrompt: ch.reflection_prompt,
    },
    enrollment: en ? { id: en.id, supportLevel: en.support_level as SupportLevel, language: en.language, framework: en.framework, status: en.status } : null,
    map,
    milestones: milestones.map((m) => ({
      id: m.id, position: m.position, title: m.title, summary: m.summary, estMinutes: m.est_minutes, understood: m.understood, built: m.built,
      steps: m.steps.map((s) => ({ id: s.id, position: s.position, title: s.title, estMinutes: s.est_minutes, outcome: s.outcome, status: s.status, concepts: stepConcepts.filter((c) => c.step_id === s.id).map(({ slug, name }) => ({ slug, name })) })),
    })),
    progress,
    restate: restate ?? null,
    restateRunId: restateRun && ["queued", "running", "paused"].includes(restateRun.status) ? restateRun.id : null,
    help, later,
    next: { step: nextStep ? { m: nextStep.m, s: nextStep.position, title: nextStep.title } : null, concept: nextConcept ? { slug: nextConcept.slug, name: nextConcept.name } : null },
  };
}

/** A concept inside a format 3 project: lesson, where, references, language notes, explain-back. */
export async function conceptV3(learnerId: string | null, slug: string, conceptSlug: string) {
  const ch = await challenge(slug);
  if (!ch) return null;
  const en = await enrollmentFor(learnerId, slug);
  const c = await one<{ pcId: string; id: string; slug: string; name: string; brief: string; lesson: unknown; area: string; where: string; prompt: string; rubric: unknown; position: number; content_status: string }>(
    `select pc.id as "pcId", c.id, c.slug, c.name, c.brief, c.lesson, a.name as area, pc.where_text as "where", pc.explain_prompt as prompt,
            pc.explain_rubric as rubric, pc.position, c.content_status
       from project_concept pc join concept c on c.id = pc.concept_id join concept_area a on a.slug = c.area_slug
      where pc.challenge_id = $1 and c.slug = $2`,
    [ch.id, conceptSlug]
  );
  if (!c) return null;
  const map = await learningMap(ch.id, learnerId, en?.id ?? null);
  const refs = await rows<{ title: string; url: string; opened: boolean; generated: boolean }>(
    `select title, url, opened, (verified_at is not null and not opened) as generated from resource
      where concept_id = $1 and language is null and (opened or (http_status = 200 and verified_at is not null)) order by opened desc, title`,
    [c.id]
  );
  const steps = await rows<{ m: number; s: number; title: string; status: string }>(
    `select m.position as m, s.position as s, s.title, coalesce(ss.status, 'not_started') as status
       from step_concept sc join step s on s.id = sc.step_id join milestone m on m.id = s.milestone_id
       left join step_state ss on ss.step_id = s.id and ss.enrollment_id = $3
      where sc.concept_id = $1 and m.challenge_id = $2 order by m.position, s.position`,
    [c.id, ch.id, en?.id ?? null]
  );
  const rubric = json<{ id: string; point: string }[]>(c.rubric);
  let latest: GradedView | null = null;
  let run: { id: string; status: string; body: string | null } | null = null;
  let feedback: { feedback: string | null; followup: string | null } = { feedback: null, followup: null };
  if (en) {
    const a = await one<any>(
      `select id, body, grade, graded_by, attempt, disputed_at, points, created_at from answer where enrollment_id = $1 and project_concept_id = $2 order by created_at desc, attempt desc limit 1`,
      [en.id, c.pcId]
    );
    if (a) {
      const pts = a.points ? json<{ id: string; met: boolean; quote?: string }[]>(a.points) : [];
      const res = await one<{ result: any }>(`select result from run where enrollment_id = $1 and kind = 'grade' and result->>'answerId' = $2 limit 1`, [en.id, a.id]);
      const r = res ? json<{ feedback?: string; followup?: string | null }>(res.result) : null;
      feedback = { feedback: r?.feedback ?? null, followup: r?.followup ?? null };
      latest = {
        answerId: a.id, body: a.body, grade: a.grade, gradedBy: a.graded_by, attempt: a.attempt, disputed: !!a.disputed_at, createdAt: a.created_at,
        points: rubric.map((x) => { const p = pts.find((y) => y.id === x.id); return { id: x.id, point: x.point, concept: null, met: !!p?.met, quote: p?.quote ?? null }; }),
        ...feedback,
      };
    }
    const r = await one<{ id: string; status: string; body: string | null }>(
      `select id, status, input->>'body' as body from run where enrollment_id = $1 and kind = 'grade' and input->>'projectConceptId' = $2 order by created_at desc limit 1`,
      [en.id, c.pcId]
    );
    run = r && ["queued", "running", "paused"].includes(r.status) ? r : null;
  }
  const status = map.find((x) => x.pcId === c.pcId)?.status ?? "new";
  return {
    project: { slug: ch.slug, title: ch.title, sourceUrl: ch.source_url },
    enrollment: en ? { id: en.id, supportLevel: en.support_level as SupportLevel, language: en.language, framework: en.framework } : null,
    concept: { pcId: c.pcId, id: c.id, slug: c.slug, name: c.name, brief: c.brief, lesson: c.lesson, area: c.area, where: c.where, position: c.position, status, reviewed: c.content_status === "reviewed" },
    explainBack: { prompt: c.prompt, points: rubric.length, parts: en?.support_level === "guided" ? rubric : null },
    latest, runId: run?.id ?? null, runPaused: run?.status === "paused", runBody: run?.body ?? null,
    references: refs,
    language: en ? await languageLayer(en.id, en.language, en.framework, [c.id]) : null,
    steps,
    map: map.map(({ slug, name, status, position }) => ({ slug, name, status, position })),
  };
}

/** The extra a format 3 step needs: its build, outcome and the concepts it uses (with lessons and where). */
export async function stepV3Extras(challengeId: string, stepId: string, learnerId: string) {
  const build = await one<{ prompt: string }>(`select prompt from task where step_id = $1 and role = 'build'`, [stepId]);
  const outcome = await one<{ outcome: string | null }>(`select outcome from step where id = $1`, [stepId]);
  const concepts = await rows<{ id: string; slug: string; name: string; brief: string; where: string; status: string }>(
    `select c.id, c.slug, c.name, c.brief, pc.where_text as "where", coalesce(cs.status, 'new') as status
       from step_concept sc join concept c on c.id = sc.concept_id
       join project_concept pc on pc.concept_id = c.id and pc.challenge_id = $2
       left join concept_state cs on cs.concept_id = c.id and cs.learner_id = $3
      where sc.step_id = $1 order by pc.position`,
    [stepId, challengeId, learnerId]
  );
  const hints = await rows<{ level: string; body: string }>(`select level, body from hint where step_id = $1 and language = ''`, [stepId]);
  return { build: build?.prompt ?? null, outcome: outcome?.outcome ?? null, concepts, hints: { hint: hints.some((h) => h.level === "hint"), example: hints.some((h) => h.level === "example") } };
}
