// Grade runs: the background job that grades an explain, spot-the-bug, restate or teach-back answer and then
// applies the app's rules. Keyed answers never come here (see keyedThink in progress.ts).
import "server-only";
import { one } from "@/lib/db";
import { gradeAnswer, type RubricPoint } from "@/lib/grader";
import { recordGate, recordModelThink, recordRestate } from "@/lib/progress";
import { registerHandler, type RunContext } from "@/lib/runs";

const json = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

export type GradeTarget = "think" | "gate" | "restate";
export interface GradeInput {
  target: GradeTarget;
  body: string;
  followupOf?: string | null;
}

async function context(ctx: RunContext) {
  const { run } = ctx;
  const input = run.input as GradeInput;
  if (input.target === "think") {
    const t = await one<{ kind: string; prompt: string; snippet: string | null; rubric: unknown }>(
      `select kind, prompt, snippet, rubric from task where step_id = $1 and role = 'think'`, [run.step_id]
    );
    return { what: t!.kind === "spot_bug" ? "a spot-the-bug task" : "a step's explain task", prompt: t!.prompt, snippet: t!.snippet, rubric: json<RubricPoint[]>(t!.rubric) };
  }
  if (input.target === "gate") {
    const q = await one<{ prompt: string; rubric: unknown }>(`select prompt, rubric from question where id = $1`, [run.question_id]);
    return { what: "the milestone teach-back, where the learner explains the milestone's ideas back", prompt: q!.prompt, snippet: null, rubric: json<RubricPoint[]>(q!.rubric) };
  }
  const c = await one<{ title: string; restate_rubric: unknown }>(
    `select c.title, c.restate_rubric from enrollment en join challenge c on c.id = en.challenge_id where en.id = $1`, [run.enrollment_id]
  );
  return {
    what: "a restatement of the project in the learner's own words, before they start",
    prompt: `Restate the project "${c!.title}" in your own words: what does the tool do, and what must it handle?`,
    snippet: null,
    rubric: json<RubricPoint[]>(c!.restate_rubric),
  };
}

async function gradeRun(ctx: RunContext) {
  const { run } = ctx;
  const input = run.input as GradeInput;
  const c = await context(ctx);
  await ctx.emit("trace", { label: `Read the rubric (${c.rubric.length} points)` });
  const g = await gradeAnswer({
    learnerId: run.learner_id, enrollmentId: run.enrollment_id, what: c.what, prompt: c.prompt, snippet: c.snippet, rubric: c.rubric, answer: input.body,
  });
  await ctx.emit("trace", { label: `Checked ${g.points.filter((p) => p.met).length} quote(s) against your words` });

  let saved: { answerId: string; attempt: number; explained?: string[]; understood?: boolean };
  if (input.target === "think") saved = await recordModelThink(run.learner_id, run.enrollment_id!, run.step_id!, input.body, g);
  else if (input.target === "gate") saved = await recordGate(run.learner_id, run.enrollment_id!, run.question_id!, input.body, g, input.followupOf ?? null);
  else saved = await recordRestate(run.learner_id, run.enrollment_id!, input.body, g);

  return {
    target: input.target,
    grade: g.grade,
    answerId: saved.answerId,
    attempt: saved.attempt,
    points: c.rubric.map((r) => {
      const p = g.points.find((x) => x.id === r.id)!;
      return { id: r.id, point: r.point, concept: r.concept ?? null, met: p.met, quote: p.quote ?? null, why: g.why[r.id] ?? null };
    }),
    feedback: g.feedback,
    // One follow-up for a partial teach-back; a follow-up answer gets no second one.
    followup: input.target === "gate" && g.grade === "partial" && input.followupOf ? null : g.followup,
    explained: saved.explained ?? [],
    understood: saved.understood ?? false,
  };
}

registerHandler("grade", gradeRun);
