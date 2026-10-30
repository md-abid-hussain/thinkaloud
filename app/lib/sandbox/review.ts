import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Generated } from "../gen/schema";
import { sh, type Sandbox } from "./sandbox";

const REPO = "/work/repo";
const RUNNER = "/opt/thinkaloud/runner.py";
const RESULT_MARK = "@@THINKALOUD@@";
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
/** Files whose diffs say nothing about the learner's thinking. */
const DIFF_EXCLUDES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "*.min.js", "gradlew", "gradlew.bat", "mvnw", "mvnw.cmd", "gradle/wrapper/*", ".mvn/*"];
const MAX_DIFF = 60_000;

export type BuildPlan = { language: string | null; tool: string | null; build: string | null; run: string | null; notes: string[] };

export type CheckCase = { name: string; passed: boolean; detail: string } & Record<string, unknown>;
export type CheckResult = { ok: boolean; error?: string; cases: CheckCase[]; server_log?: string };

export type StepRun = {
  head: string;
  base: string | null;
  build: { ok: boolean; log: string } | null;
  check: CheckResult;
  diffStat: string;
  diff: string;
};

function parseMark<T>(output: string): T {
  const line = output.split("\n").reverse().find((l) => l.startsWith(RESULT_MARK));
  if (!line) throw new Error(`no result from the sandbox harness:\n${output.slice(-2000)}`);
  return JSON.parse(line.slice(RESULT_MARK.length)) as T;
}

function tail(text: string, n = 3000): string {
  return text.length <= n ? text : `...${text.slice(-n)}`;
}

/** Clones the learner's public repo at a commit (default: the latest) and puts the harness beside it. */
export async function prepare(box: Sandbox, repoUrl: string, sha?: string | null): Promise<string> {
  const runner = await readFile(path.resolve(process.cwd(), "sandbox", "runner.py"), "utf8").catch(() =>
    readFile(path.resolve(import.meta.dirname, "..", "..", "sandbox", "runner.py"), "utf8"),
  );
  await box.upload([{ path: RUNNER, content: runner }]);
  // Retried, because a network blip is not a bad repo.
  const clone = await box.exec(
    `for i in 1 2 3; do rm -rf ${REPO}; git clone --quiet ${sh(repoUrl)} ${REPO} && break; sleep $i; done && cd ${REPO} ${sha ? `&& git checkout --quiet ${sh(sha)}` : ""} && git rev-parse HEAD`,
    { timeoutSec: 240, env: { GIT_TERMINAL_PROMPT: "0" } },
  );
  if (clone.exitCode !== 0) throw new Error(`couldn't clone ${repoUrl}: ${tail(clone.output, 600)}`);
  return clone.output.trim().split("\n").at(-1)!;
}

export async function detectBuild(box: Sandbox): Promise<BuildPlan> {
  const result = await box.exec(`python3 ${RUNNER} detect ${REPO}`, { timeoutSec: 60 });
  return parseMark<BuildPlan>(result.output);
}

export async function build(box: Sandbox, command: string | null): Promise<{ ok: boolean; log: string } | null> {
  if (!command) return null;
  const result = await box.exec(command, { cwd: REPO, timeoutSec: 600 });
  return { ok: result.exitCode === 0, log: tail(result.output) };
}

export async function diffSince(box: Sandbox, base: string | null, head: string): Promise<{ stat: string; diff: string }> {
  const from = base ?? EMPTY_TREE;
  const excludes = DIFF_EXCLUDES.map((p) => sh(`:(exclude)${p}`)).join(" ");
  const result = await box.exec(`git diff --stat ${from} ${head} -- . ${excludes} && echo ${RESULT_MARK} && git diff ${from} ${head} -- . ${excludes}`, {
    cwd: REPO,
    timeoutSec: 60,
  });
  const [stat, diff = ""] = result.output.split(`${RESULT_MARK}\n`);
  return { stat: stat.trim(), diff: diff.length > MAX_DIFF ? `${diff.slice(0, MAX_DIFF)}\n... (diff cut at ${MAX_DIFF} characters)` : diff };
}

/** Runs one step's check from the generated layer: the setup check for s0, the step's own check otherwise. */
export async function runCheck(box: Sandbox, generated: Generated, stepId: string, run: string): Promise<CheckResult> {
  const check = generated.checks.find((c) => c.step === stepId) ?? null;
  const spec = {
    step: stepId,
    runner: generated.runner,
    run,
    cwd: REPO,
    fixtures: check || stepId === "s0" ? generated.profile.fixtures : [],
    fixtures_dir: "/work/fixtures",
    check,
    env: Object.fromEntries(generated.profile.contract.settings.map((s) => [s.name, ""]).filter(([name]) => name !== "PORT" && name !== "BASE_URL")),
    allowed_mismatches: (check && "dir" in check ? check.allowed_mismatches : undefined) ?? [],
  };
  await box.upload([{ path: "/work/spec.json", content: JSON.stringify(spec) }]);
  const result = await box.exec(`python3 ${RUNNER} check /work/spec.json`, { timeoutSec: 900 });
  return parseMark<CheckResult>(result.output);
}

/** Everything the reviewer needs for one step: build, check results and the diff since the last approved commit. */
export async function runStep(
  box: Sandbox,
  opts: { repoUrl: string; sha?: string | null; base: string | null; build: string | null; run: string; generated: Generated; stepId: string },
): Promise<StepRun> {
  const head = await prepare(box, opts.repoUrl, opts.sha);
  const { stat, diff } = await diffSince(box, opts.base, head);
  const built = await build(box, opts.build);
  const check: CheckResult =
    built && !built.ok ? { ok: false, error: "the build failed", cases: [] } : await runCheck(box, opts.generated, opts.stepId, opts.run);
  return { head, base: opts.base, build: built, check, diffStat: stat, diff };
}
