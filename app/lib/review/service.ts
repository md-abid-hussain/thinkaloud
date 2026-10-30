import { generateModel, MODELS } from "../agent/models";
import { one } from "../db";
import { modelAsk, type CallLog } from "../gen/ask";
import type { Ask } from "../gen/generate";
import { createReview, finishReview, loadState, setBuild, syncCards, type ReviewResult } from "../repo";
import { daytonaSandbox } from "../sandbox/daytona";
import { dockerSandbox } from "../sandbox/docker";
import { build, detectBuild, diffSince, prepare, runCheck, type CheckResult, type StepRun } from "../sandbox/review";
import type { Sandbox, SandboxFactory } from "../sandbox/sandbox";
import { checkSpend, recordUsage } from "../spend";
import { reviewStep } from "./reviewer";

/** Sandbox reviews a guest may start in a day. Each one is a Daytona sandbox and a model call. */
export const REVIEWS_PER_DAY = 25;

export type ReviewDeps = { sandbox: SandboxFactory; ask: Ask; calls: CallLog[]; onDone?(reviewId: number): void };

function defaultDeps(): ReviewDeps {
  const calls: CallLog[] = [];
  return { sandbox: process.env.SANDBOX === "docker" ? dockerSandbox : daytonaSandbox, ask: modelAsk(generateModel(), calls), calls };
}

/** GitHub only, public, https: https://github.com/owner/repo, with or without .git or a trailing slash. */
export function normaliseRepoUrl(input: string): string | null {
  const match = input.trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  return match ? `https://github.com/${match[1]}/${match[2]}` : null;
}

/** Asks GitHub whether the repo exists and is public, since the sandbox clones without credentials. */
export async function checkPublicRepo(url: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [, owner, repo] = new URL(url).pathname.split("/");
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "ThinkAloud" },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) return { ok: false, reason: "GitHub can't find that repo. Check the link, and make sure the repo is public." };
    if (!response.ok) return { ok: true }; // rate-limited or down: let the clone decide
    const data = (await response.json()) as { private?: boolean };
    return data.private ? { ok: false, reason: "That repo is private. The sandbox can only clone public repos." } : { ok: true };
  } catch {
    return { ok: true };
  }
}

/** Starts a review of one step in the background. The chat gets a review card when it finishes. */
export async function startReview(enrollmentId: number, stepId: string, deps: ReviewDeps = defaultDeps()): Promise<{ id: number } | { error: string }> {
  const state = await loadState(enrollmentId);
  if (!state.enrollment.repoUrl) return { error: "No repo is linked yet. Ask the learner for their GitHub link." };
  if (!state.generated) return { error: "This project has no sandbox checks yet." };
  if (!state.map.steps.some((s) => s.id === stepId)) return { error: `No step with id ${stepId}.` };
  const spend = await checkSpend(state.enrollment.learnerId);
  if (!spend.ok) return { error: spend.reason };
  const today = await one<{ n: string }>(
    `select count(*) as n from review r join enrollment e on e.id = r.enrollment_id
     where e.learner_id = $1 and r.created_at > now() - interval '1 day'`,
    [state.enrollment.learnerId],
  );
  if (Number(today?.n ?? 0) >= REVIEWS_PER_DAY) return { error: `You've used today's ${REVIEWS_PER_DAY} reviews. Try again tomorrow.` };
  const id = await createReview(enrollmentId, stepId);
  if (id === null) return { error: "A review is already running. Its result will appear in the chat." };
  void runReview(id, enrollmentId, stepId, deps).catch((error) => console.error("review failed", id, error));
  return { id };
}

/** Clone, detect (first time), diff since the last approved commit, build, run the step's check, then the reviewer. */
export async function runReview(id: number, enrollmentId: number, stepId: string, deps: ReviewDeps): Promise<void> {
  let box: Sandbox | null = null;
  try {
    const { enrollment, map, generated } = await loadState(enrollmentId);
    box = await deps.sandbox();
    const head = await prepare(box, enrollment.repoUrl!);
    let buildCmd = enrollment.buildCmd;
    let runCmd = enrollment.runCmd;
    let plan: ReviewResult["plan"] = null;
    if (!runCmd) {
      plan = await detectBuild(box);
      buildCmd = plan.build;
      runCmd = plan.run;
      await setBuild(enrollmentId, { build: buildCmd, run: runCmd, confirmed: false });
    }
    // Only the changes since the last approved review; the whole repo on the first one.
    const base = enrollment.approvedSha;
    const { stat, diff } = await diffSince(box, base, head);
    if (!runCmd) {
      const check: CheckResult = { ok: false, error: "no run command", cases: [] };
      await finishReview(id, {
        status: "failed",
        headSha: head,
        baseSha: base,
        result: { build: null, check, diffStat: stat, plan },
        verdict: {
          passed: false,
          summary: "The sandbox couldn't work out how to run your program.",
          problems: [{ where: null, what: plan?.notes.join(" ") || "Tell the mentor the command that builds your project and the one that runs it." }],
        },
      });
      return;
    }
    const built = await build(box, buildCmd);
    const check: CheckResult = built && !built.ok ? { ok: false, error: "the build failed", cases: [] } : await runCheck(box, generated!, stepId, runCmd);
    const run: StepRun = { head, base, build: built, check, diffStat: stat, diff };
    const before = deps.calls.length;
    const verdict = await reviewStep(deps.ask, map, generated!, stepId, run);
    for (const call of deps.calls.slice(before)) {
      await recordUsage({ learnerId: enrollment.learnerId, purpose: "review", model: MODELS.generate, usage: { input_tokens: call.input, output_tokens: call.output } });
    }
    await finishReview(id, { status: verdict.passed ? "passed" : "failed", headSha: head, baseSha: base, result: { build: built, check, diffStat: stat, plan }, verdict });
  } catch (error) {
    console.error("review error", id, error);
    await finishReview(id, { status: "error", error: error instanceof Error ? error.message.slice(0, 500) : "unknown error" }).catch(() => {});
  } finally {
    await box?.destroy();
    await syncCards(enrollmentId).catch(() => {});
    deps.onDone?.(id);
  }
}
