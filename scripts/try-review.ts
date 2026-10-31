/**
 * Runs one sandbox review end to end and prints what the learner would get. Usage:
 *   npm run try-review -- <slug> <repo-url> <step> [--sha SHA] [--base SHA] [--local] [--no-ai]
 * --local uses the Docker image instead of Daytona; --no-ai skips the reviewer (checks only, no model call).
 */
import { setDefaultResultOrder } from "node:dns";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { MODELS, generateModel } from "../lib/agent/models";
import { readMapsWithStaging } from "../lib/content";
import { env } from "../lib/env";
import { modelAsk, type CallLog } from "../lib/gen/ask";
import type { Generated } from "../lib/gen/schema";
import { reviewStep } from "../lib/review/reviewer";
import { daytonaSandbox } from "../lib/sandbox/daytona";
import { dockerSandbox } from "../lib/sandbox/docker";
import { detectBuild, prepare, runStep } from "../lib/sandbox/review";

setDefaultResultOrder("ipv6first");

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : null;
}

async function main() {
  const [slug, repoUrl, stepId] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--sha") && !all[i - 1]?.startsWith("--base"));
  if (!slug || !repoUrl || !stepId) throw new Error("usage: try-review <slug> <repo-url> <step> [--sha SHA] [--base SHA] [--local] [--no-ai]");
  const map = (await readMapsWithStaging(env.contentDir)).find((m) => m.project.slug === slug)!;
  const generated = parse(await readFile(path.join(env.contentDir, "generated", `${slug}.yaml`), "utf8")) as Generated;
  const local = process.argv.includes("--local");
  const started = Date.now();
  const box = local ? await dockerSandbox() : await daytonaSandbox();
  console.log(`sandbox ready (${local ? "docker" : "daytona"}) in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  try {
    await prepare(box, repoUrl, flag("sha"));
    const plan = await detectBuild(box);
    console.log("detected:", JSON.stringify(plan));
    if (!plan.run) throw new Error("couldn't work out a run command");
    const run = await runStep(box, { repoUrl, sha: flag("sha"), base: flag("base"), build: plan.build, run: plan.run, generated, stepId });
    console.log(`head ${run.head.slice(0, 7)} base ${run.base?.slice(0, 7) ?? "(none)"} · build ${run.build ? (run.build.ok ? "ok" : "FAILED") : "none"}`);
    if (run.build && !run.build.ok) console.log(run.build.log);
    console.log(`checks: ${run.check.ok ? "PASS" : "FAIL"}${run.check.error ? ` (${run.check.error})` : ""}`);
    for (const c of run.check.cases) console.log(`  ${c.passed ? "ok  " : "FAIL"} ${c.name}: ${c.detail}${c.passed ? "" : ` | got ${JSON.stringify(c.stdout ?? c.status ?? c.exit)} expected ${JSON.stringify(c.expected ?? c.expected_exit ?? "")}`}`);
    console.log(`diff: ${run.diffStat.split("\n").at(-1)?.trim() ?? ""}`);
    if (!process.argv.includes("--no-ai")) {
      const log: CallLog[] = [];
      const verdict = await reviewStep(modelAsk(generateModel(), log), map, generated, stepId, run);
      console.log(`\nreviewer (${MODELS.generate}, ${log[0]?.input} in / ${log[0]?.output} out, ${((log[0]?.ms ?? 0) / 1000).toFixed(1)} s): ${verdict.passed ? "PASSED" : "NOT YET"}`);
      console.log(`  ${verdict.summary}`);
      for (const p of verdict.problems) console.log(`  - ${p.where ? `${p.where}: ` : ""}${p.what}`);
    }
    console.log(`total ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } finally {
    await box.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
