import { z } from "zod";
import type { ProjectMap } from "../content";
import type { Ask } from "../gen/generate";
import type { Generated } from "../gen/schema";
import type { StepRun } from "../sandbox/review";

/**
 * The reviewer sub-agent: its own small context, so the mentor's stays small. It reads only the
 * diff since the last approved review, the build and the check results, and returns pass or fail with the problems in
 * words. It never writes code, and it doesn't judge design.
 */
export const VerdictSchema = z.object({
  passed: z.boolean(),
  summary: z.string().describe("One or two sentences to the learner, in plain words"),
  problems: z
    .array(
      z.object({
        where: z.string().nullable().describe("A file, and a function or area when it helps; null when it's about behaviour"),
        what: z.string().describe("What's wrong or missing, in words. No code, no fix written as code"),
      }),
    )
    .describe("At most 3, most important first. Empty when passed"),
});
export type Verdict = z.infer<typeof VerdictSchema>;

const SYSTEM = `You review one step of a junior developer's project for a learning app. You see only what changed since their last approved review, plus the build and the automatic check results from a sandbox.

How to decide:
- The step passes when its behaviour works: the build succeeds, and every automatic check passed. When the step is marked partly or manual, the diff must also show the part the checks can't see.
- Fail when a check failed, the build failed, or the diff shows the result is faked: hard-coded to the test files or special-cased to pass the checks.
- Judge only what the code and the checks can show. Work done outside the repo (installing tools, downloading the challenge's test files or sample data, reading docs) isn't visible and isn't required in the repo: the sandbox brings its own test data. Never fail a step for it.
- Don't judge design, style, naming or structure. Don't ask for tests unless the step is about tests. Don't ask for features beyond the step.

How to write:
- Plain words, to the learner, short. Name the file and the area when it helps them find it.
- Never write code, and never write a fix as code. Describe what's wrong and what the program should do instead.
- When a check failed, explain the likely cause from the check's output and the diff, in words.
- At most 3 problems, most important first.`;

export function reviewPrompt(map: ProjectMap, generated: Generated, stepId: string, run: StepRun): string {
  const step = map.steps.find((s) => s.id === stepId)!;
  const prof = generated.profile.steps.find((s) => s.step === stepId);
  const concepts = map.concepts.filter((c) => step.concepts.includes(c.id)).map((c) => c.name);
  const cases = run.check.cases.map((c) => ({ ...c, stdout: c.stdout ? String(c.stdout).slice(0, 300) : undefined }));
  const later = map.steps.slice(map.steps.indexOf(step) + 1).map((s) => `${s.id} ${s.title}: ${s.objective}`);
  return [
    `Project: ${map.project.title}. Step ${step.id}, "${step.title}".`,
    `What the step must do: ${step.objective}`,
    `How you know it works: ${step.check}`,
    later.length ? `Later steps, out of scope for this review (never ask for them yet):\n- ${later.join("\n- ")}` : "",
    `Checked automatically: ${prof?.check ?? "manual"}${prof?.why ? ` (${prof.why})` : ""}.`,
    concepts.length ? `Concepts it uses: ${concepts.join(", ")}.` : "",
    `How the sandbox runs the program: ${generated.profile.contract.run}`,
    run.build ? `Build: ${run.build.ok ? "succeeded" : `FAILED\n${run.build.log}`}` : "Build: no build step.",
    `Check results (${run.check.ok ? "all passed" : "NOT all passed"}):\n${run.check.error ? `${run.check.error}\n` : ""}${JSON.stringify(cases, null, 1)}`,
    run.check.server_log ? `Program log (tail):\n${run.check.server_log}` : "",
    `Changes ${run.base ? `since the last approved review (${run.base.slice(0, 7)})` : "(first review: the whole repo)"} up to ${run.head.slice(0, 7)}:\n${run.diffStat}\n\n${run.diff || "(no changes)"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function reviewStep(ask: Ask, map: ProjectMap, generated: Generated, stepId: string, run: StepRun): Promise<Verdict> {
  const verdict = await ask(VerdictSchema, SYSTEM, reviewPrompt(map, generated, stepId, run), `review ${map.project.slug} ${stepId}`);
  // The checks are the floor: a failed build or check can never pass, whatever the reviewer says.
  const mustFail = (run.build && !run.build.ok) || !run.check.ok;
  return mustFail && verdict.passed ? { ...verdict, passed: false } : verdict;
}
