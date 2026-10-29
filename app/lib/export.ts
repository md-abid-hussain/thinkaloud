// The learner's data: a Markdown learning log, and a JSON dump of every row that is theirs.
import "server-only";
import { one, rows, tx } from "@/lib/db";

export async function exportJson(learnerId: string) {
  const core = await one<{ doc: Record<string, unknown> }>(`select export_learner($1) as doc`, [learnerId]);
  const misconception = await rows(`select * from misconception where learner_id = $1 order by created_at`, [learnerId]);
  return { exported_at: new Date().toISOString(), ...(core?.doc ?? {}), misconception };
}

const quote = (s: string) => s.replace(/\s+/g, " ").trim();

export async function learningLog(learnerId: string) {
  const me = await one<{ display_name: string | null; created_at: string }>(`select display_name, created_at from learner where id = $1`, [learnerId]);
  const projects = await rows<any>(
    `select c.title, c.slug, c.source_url, en.id, en.support_level, en.language, en.status, p.milestones_total, p.milestones_understood
       from enrollment en join challenge c on c.id = en.challenge_id join v_enrollment_progress p on p.enrollment_id = en.id
      where en.learner_id = $1 order by en.started_at`, [learnerId]
  );
  const explained = await rows<any>(
    `select c.name, c.slug, ev.quote, ch.title as project, m.position as milestone
       from concept_state cs join concept c on c.id = cs.concept_id
       left join lateral (select e.quote, e.answer_id from evidence e where e.learner_id = cs.learner_id and e.concept_id = cs.concept_id and e.kind = 'answer' order by e.created_at limit 1) ev on true
       left join answer a on a.id = ev.answer_id left join question q on q.id = a.question_id left join milestone m on m.id = q.milestone_id
       left join enrollment en on en.id = a.enrollment_id left join challenge ch on ch.id = en.challenge_id
      where cs.learner_id = $1 and cs.explained_at is not null order by cs.explained_at`, [learnerId]
  );
  const seen = await rows<{ name: string }>(
    `select c.name from concept_state cs join concept c on c.id = cs.concept_id where cs.learner_id = $1 and cs.explained_at is null and cs.seen_at is not null order by c.name`, [learnerId]
  );
  const steps = await rows<any>(
    `select ch.title as project, m.position as milestone, s.position as step, s.title, ss.done_at,
            (select count(*) from answer a join task t on t.id = a.task_id where a.enrollment_id = en.id and t.step_id = s.id)::int as attempts
       from step_state ss join step s on s.id = ss.step_id join milestone m on m.id = s.milestone_id join enrollment en on en.id = ss.enrollment_id
       join challenge ch on ch.id = en.challenge_id where en.learner_id = $1 and ss.status = 'done' order by ss.done_at`, [learnerId]
  );
  const help = await rows<any>(
    `select ch.title as project, m.position as milestone, s.position as step, s.title, e.payload->>'level' as level, count(*)::int as n
       from event e join step s on s.id = e.step_id join milestone m on m.id = s.milestone_id join enrollment en on en.id = e.enrollment_id
       join challenge ch on ch.id = en.challenge_id where e.learner_id = $1 and e.type = 'help_given'
      group by 1, 2, 3, 4, 5 order by 1, 2, 3`, [learnerId]
  );
  const mis = await rows<any>(`select m.note, c.name from misconception m left join concept c on c.id = m.concept_id where m.learner_id = $1 order by m.created_at`, [learnerId]);
  const later = await rows<any>(
    `select si.prompt, ch.title from side_item si join enrollment en on en.id = si.enrollment_id join challenge ch on ch.id = en.challenge_id
      where en.learner_id = $1 and si.kind = 'later' order by si.created_at`, [learnerId]
  );
  const reflections = await rows<any>(
    `select a.body, ch.title from answer a join enrollment en on en.id = a.enrollment_id join challenge ch on ch.id = en.challenge_id
      where en.learner_id = $1 and a.kind = 'reflection' order by a.created_at`, [learnerId]
  );

  const L: string[] = [];
  L.push(`# What I can explain`, ``);
  L.push(`${me?.display_name ? `${me.display_name} · ` : ""}ThinkAloud learning log · exported ${new Date().toISOString().slice(0, 10)}`, ``);
  L.push(`${projects.length} project${projects.length === 1 ? "" : "s"} · ${explained.length} idea${explained.length === 1 ? "" : "s"} explained · ${help.reduce((n, h) => n + h.n, 0)} help uses`, ``);
  L.push(`## Projects`, ``);
  for (const p of projects) {
    L.push(`- **${p.title}** (${p.milestones_understood} of ${p.milestones_total} milestones understood${p.status === "understood" ? ", complete" : ""}). ${p.language ? `Language: ${p.language}. ` : "Ideas only. "}Support: ${p.support_level}. Original challenge: ${p.source_url}`);
  }
  L.push(``, `## Ideas I explained, in my own words`, ``);
  if (!explained.length) L.push(`None yet.`);
  for (const c of explained) {
    L.push(`### ${c.name}`, ``);
    if (c.project) L.push(`${c.project}${c.milestone ? ` · milestone ${c.milestone}` : ""}`, ``);
    if (c.quote) L.push(`> "${quote(c.quote)}"`, ``);
  }
  if (seen.length) L.push(`## Ideas I've read about but not explained yet`, ``, ...seen.map((s) => `- ${s.name}`), ``);
  L.push(`## Steps done`, ``);
  if (!steps.length) L.push(`None yet.`);
  for (const s of steps) L.push(`- ${s.project}, milestone ${s.milestone}, step ${s.step}: ${s.title} (${s.attempts} attempt${s.attempts === 1 ? "" : "s"})`);
  L.push(``, `## Help I used`, ``);
  if (!help.length) L.push(`None.`);
  for (const h of help) L.push(`- ${h.project}, milestone ${h.milestone}, step ${h.step} (${h.title}): ${h.level} × ${h.n}`);
  if (mis.length) L.push(``, `## Things I got wrong along the way`, ``, ...mis.map((m) => `- ${m.name ? `${m.name}: ` : ""}${quote(m.note)}`));
  if (later.length) L.push(``, `## Saved for later`, ``, ...later.map((x) => `- ${quote(x.prompt)} (${x.title})`));
  if (reflections.length) L.push(``, `## Reflections`, ``, ...reflections.flatMap((r) => [`**${r.title}**`, ``, `> ${quote(r.body)}`, ``]));
  L.push(``, `---`, `Projects from Coding Challenges by John Crickett (https://codingchallenges.fyi/). Checked with ThinkAloud.`);
  return L.join("\n") + "\n";
}

/** Deletes every row that belongs to the learner. The event log allows deletes only inside this transaction. */
export async function deleteLearner(learnerId: string) {
  await tx(async (q) => {
    await q.query(`select set_config('app.allow_event_delete', 'on', true)`);
    await q.query(`delete from learner where id = $1`, [learnerId]);
  });
}

