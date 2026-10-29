// The app's fixed rules for turning a grade into status. Every write goes through one transaction, with its
// event, as in DATA_MODEL.md section 4. Keyed answers use the shared recipe as it is. Model-graded answers
// follow the same recipe steps, but with the grader's real points (the shared recipe builds stub points for tests).
import "server-only";
import { one, tx, type Q } from "@/lib/db";
import { recipes, keyMatches } from "@/vendor/db/support/recipes.mjs";
import type { GradedPoint, Grade, RubricPoint } from "@/lib/grader";

const json = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

async function addAnswer(
  q: Q,
  e: string,
  kind: "restate" | "think" | "gate" | "reflection",
  o: { taskId?: string; questionId?: string; body: string; grade?: string; gradedBy?: string; model?: string; points?: GradedPoint[]; followupOf?: string | null }
) {
  const { n } = (await q.query<{ n: number }>(
    `select coalesce(max(attempt), 0) + 1 as n from answer
      where enrollment_id = $1 and kind = $2
        and task_id is not distinct from $3::uuid and question_id is not distinct from $4::uuid`,
    [e, kind, o.taskId ?? null, o.questionId ?? null]
  )).rows[0];
  return (await q.query<{ id: string; attempt: number }>(
    `insert into answer (enrollment_id, kind, task_id, question_id, attempt, body, grade, graded_by, model, points, followup_of)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id, attempt`,
    [e, kind, o.taskId ?? null, o.questionId ?? null, n, o.body, o.grade ?? "ungraded", o.gradedBy ?? null, o.model ?? null,
      o.points ? JSON.stringify(o.points) : null, o.followupOf ?? null]
  )).rows[0];
}

async function markStepDone(q: Q, l: string, e: string, stepId: string) {
  const app = recipes(q);
  await q.query(
    `insert into step_state (enrollment_id, step_id, status, started_at, done_at) values ($1, $2, 'done', now(), now())
     on conflict (enrollment_id, step_id) do update set status = 'done', done_at = coalesce(step_state.done_at, now()), updated_at = now()`,
    [e, stepId]
  );
  await app.log(l, e, "step_done", { step: stepId });
  const s = (await q.query<{ milestone_id: string }>(`select milestone_id from step where id = $1`, [stepId])).rows[0];
  await app.refreshMilestone(l, e, s.milestone_id);
}

export interface ThinkTask {
  id: string;
  step_id: string;
  kind: "predict" | "trace" | "spot_bug" | "explain";
  prompt: string;
  snippet: string | null;
  answer_key: unknown;
  rubric: unknown;
}

export async function thinkTask(stepId: string) {
  return one<ThinkTask>(`select * from task where step_id = $1 and role = 'think'`, [stepId]);
}
export const isKeyed = (t: ThinkTask) => t.kind === "predict" || t.kind === "trace";

/** Predict and trace: checked by key at once, no model. Uses the shared recipe unchanged. */
export async function keyedThink(l: string, e: string, stepId: string, body: string) {
  return tx(async (q) => {
    const app = recipes(q);
    const before = (await q.query(`select status from step_state where enrollment_id = $1 and step_id = $2`, [e, stepId])).rows[0];
    if (!before) await app.startStep(l, e, stepId);
    const grade = (await app.thinkAnswer(l, e, stepId, body)) as "met" | "not_yet";
    const a = (await q.query<{ id: string; attempt: number }>(
      `select a.id, a.attempt from answer a join task t on t.id = a.task_id
        where a.enrollment_id = $1 and t.step_id = $2 and t.role = 'think' order by a.created_at desc, a.attempt desc limit 1`,
      [e, stepId]
    )).rows[0];
    return { grade, answerId: a.id, attempt: a.attempt };
  });
}

/** Whether a learner's words would match the key, without recording anything (for the mentor's check tool). */
export function dryKeyCheck(t: ThinkTask, text: string) {
  return keyMatches(json(t.answer_key), text, `${t.prompt}\n${t.snippet ?? ""}`);
}

export async function recordModelThink(l: string, e: string, stepId: string, body: string, g: { grade: Grade; points: GradedPoint[]; model: string }) {
  return tx(async (q) => {
    const app = recipes(q);
    const task = (await q.query<{ id: string }>(`select id from task where step_id = $1 and role = 'think'`, [stepId])).rows[0];
    const before = (await q.query(`select 1 from step_state where enrollment_id = $1 and step_id = $2`, [e, stepId])).rows[0];
    if (!before) await app.startStep(l, e, stepId);
    const a = await addAnswer(q, e, "think", { taskId: task.id, body, grade: g.grade, gradedBy: "model", model: g.model, points: g.points });
    await app.log(l, e, "answer_graded", { step: stepId, answer: a.id, payload: { grade: g.grade } });
    if (g.grade === "met") await markStepDone(q, l, e, stepId);
    return { answerId: a.id, attempt: a.attempt };
  });
}

/** A teach-back: each met point marks its concept explained (even when partial), with the quote as evidence. */
export async function recordGate(
  l: string, e: string, questionId: string, body: string,
  g: { grade: Grade; points: GradedPoint[]; model: string }, followupOf: string | null
) {
  return tx(async (q) => {
    const app = recipes(q);
    const qu = (await q.query<{ milestone_id: string; concept_id: string | null; rubric: unknown }>(`select * from question where id = $1`, [questionId])).rows[0];
    const rubric = json<RubricPoint[]>(qu.rubric);
    const a = await addAnswer(q, e, "gate", { questionId, body, grade: g.grade, gradedBy: "model", model: g.model, points: g.points, followupOf });
    await app.log(l, e, "answer_graded", { milestone: qu.milestone_id, answer: a.id, payload: { grade: g.grade } });
    if (g.grade === "met") await app.log(l, e, "gate_met", { milestone: qu.milestone_id, concept: qu.concept_id, answer: a.id });

    const explained = new Map<string, string>();
    for (const p of g.points.filter((p) => p.met)) {
      const slug = rubric.find((r) => r.id === p.id)?.concept;
      const conceptId = slug
        ? (await q.query<{ id: string }>(`select id from concept where slug = $1`, [slug])).rows[0]?.id
        : g.grade === "met" ? qu.concept_id : null;
      if (conceptId && !explained.has(conceptId)) explained.set(conceptId, p.quote!);
    }
    for (const [conceptId, quote] of explained) {
      await q.query(
        `insert into concept_state (learner_id, concept_id, explained_at) values ($1, $2, now())
         on conflict (learner_id, concept_id) do update set explained_at = coalesce(concept_state.explained_at, now()), updated_at = now()`,
        [l, conceptId]
      );
      await app.log(l, e, "concept_explained", { concept: conceptId, answer: a.id });
      await q.query(
        `insert into evidence (learner_id, concept_id, kind, answer_id, quote, confidence) values ($1, $2, 'answer', $3, $4, 'high')`,
        [l, conceptId, a.id, quote]
      );
    }
    let understood = false;
    if (g.grade === "met") understood = await app.refreshMilestone(l, e, qu.milestone_id);
    return { answerId: a.id, attempt: a.attempt, explained: [...explained.keys()], understood };
  });
}

export async function recordRestate(l: string, e: string, body: string, g: { grade: Grade; points: GradedPoint[]; model: string }) {
  return tx(async (q) => {
    const app = recipes(q);
    const a = await addAnswer(q, e, "restate", { body, grade: g.grade, gradedBy: "model", model: g.model, points: g.points });
    await app.log(l, e, "answer_graded", { answer: a.id, payload: { grade: g.grade, kind: "restate" } });
    return { answerId: a.id, attempt: a.attempt };
  });
}

export async function reflect(l: string, e: string, body: string) {
  return tx(async (q) => (await recipes(q).reflect(l, e, body)) as boolean);
}

const LEVELS = ["none", "hint", "example", "code"] as const;
export type HelpRung = "hint" | "example" | "code";

/** Help is never refused. Each use is logged; the step's help level only ever rises, by the learner's choice. */
export async function giveHelp(l: string, e: string, stepId: string, rung: HelpRung, via: string, language: string | null = null) {
  return tx(async (q) => {
    const app = recipes(q);
    const cur = (await q.query<{ help_level: string }>(`select help_level from step_state where enrollment_id = $1 and step_id = $2`, [e, stepId])).rows[0];
    if (!cur) await app.startStep(l, e, stepId);
    if (LEVELS.indexOf(rung) > LEVELS.indexOf((cur?.help_level ?? "none") as (typeof LEVELS)[number])) await app.setHelp(l, e, stepId, rung);
    await app.log(l, e, "help_given", { step: stepId, payload: { level: rung, via } });
    if (rung === "code") return { body: null };
    const h = (await q.query<{ body: string }>(
      `select body from hint where step_id = $1 and level = $2 and language in ('', coalesce($3, '')) order by language desc limit 1`,
      [stepId, rung, language]
    )).rows[0];
    return { body: h?.body ?? null };
  });
}

export async function startStep(l: string, e: string, stepId: string) {
  const s = await one(`select status from step_state where enrollment_id = $1 and step_id = $2`, [e, stepId]);
  if (s) return;
  await tx((q) => recipes(q).startStep(l, e, stepId));
}

export async function setSupportLevel(l: string, e: string, level: string) {
  await tx((q) => recipes(q).setSupportLevel(l, e, level));
}

export async function dispute(l: string, answerId: string, note: string | null) {
  return tx(async (q) => {
    const a = (await q.query<{ enrollment_id: string }>(
      `update answer a set disputed_at = now(), dispute_note = $3
         from enrollment en where a.id = $1 and en.id = a.enrollment_id and en.learner_id = $2 returning a.enrollment_id`,
      [answerId, l, note]
    )).rows[0];
    if (!a) return false;
    await recipes(q).log(l, a.enrollment_id, "grade_disputed", { answer: answerId, payload: { note } });
    return true;
  });
}

export async function markSeen(l: string, e: string | null, conceptId: string) {
  await tx((q) => recipes(q).seen(l, e, conceptId));
}


