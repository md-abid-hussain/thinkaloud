/**
 * Runs every step's check from content/generated/<slug>.yaml against a reference, in one sandbox with one build. A
 * generated check is trusted only when a correct solution passes it. Usage:
 *   npm run validate-checks -- <slug> <repo-url>                       a reference repo on GitHub
 *   npm run validate-checks -- <slug> --dir content/reference/<slug> a local reference solution
 *   npm run validate-checks -- <slug> --run "cut"                       the real tool as the reference
 * Options: --run and --build set the commands instead of detecting them; --local uses Docker instead of Daytona;
 * --oracle "<command>" runs an independent implementation of the current specification (for JSON: "python3 -m
 * json.tool") over every case-files folder first, and records the files where it disagrees with the file names as
 * allowed_mismatches in the generated layer. Run it again after every `npm run generate`.
 */
import { setDefaultResultOrder } from "node:dns";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";
import { env } from "../lib/env";
import type { CaseFilesChecks, Generated } from "../lib/gen/schema";
import { daytonaSandbox } from "../lib/sandbox/daytona";
import { dockerSandbox } from "../lib/sandbox/docker";
import { build, detectBuild, prepare, prepareLocal, runCheck } from "../lib/sandbox/review";

setDefaultResultOrder("ipv6first");

const OPTIONS = ["--oracle", "--dir", "--run", "--build"];

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : null;
}

async function readTree(dir: string, base = dir): Promise<{ path: string; content: Buffer }[]> {
  const out: { path: string; content: Buffer }[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", "target", "__pycache__", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await readTree(full, base)));
    else out.push({ path: path.relative(base, full).split(path.sep).join("/"), content: await readFile(full) });
  }
  return out;
}

async function main() {
  const oracle = flag("oracle");
  const [slug, repoUrl] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !OPTIONS.includes(all[i - 1]));
  const file = path.join(env.contentDir, "generated", `${slug}.yaml`);
  const raw = await readFile(file, "utf8");
  const generated = parse(raw) as Generated;
  const box = process.argv.includes("--local") ? await dockerSandbox() : await daytonaSandbox();
  let failed = 0;
  try {
    const dir = flag("dir");
    if (repoUrl) await prepare(box, repoUrl);
    else await prepareLocal(box, dir ? await readTree(path.resolve(dir)) : []);
    if (oracle && generated.runner === "case-files") {
      for (const check of generated.checks as CaseFilesChecks) {
        check.allowed_mismatches = [];
        const result = await runCheck(box, generated, check.step, oracle);
        check.allowed_mismatches = result.cases.filter((c) => !c.passed).map((c) => path.posix.basename(c.name));
        console.log(`  oracle ${check.step}: ${check.allowed_mismatches.length ? `disagrees on ${check.allowed_mismatches.join(", ")}` : "agrees with every file"}`);
      }
      const header = raw.split("\n").filter((l) => l.startsWith("#")).join("\n");
      await writeFile(file, `${header}\n${stringify(generated, { lineWidth: 118 })}`);
    }
    const plan = flag("run") ? { language: null, tool: "given", build: flag("build"), run: flag("run"), notes: [] } : await detectBuild(box);
    const built = await build(box, plan.build);
    console.log(`${slug}: ${plan.language ?? "-"}/${plan.tool} · run ${plan.run} · build ${built ? (built.ok ? "ok" : "FAILED") : "none"}`);
    if (built && !built.ok) throw new Error(built.log);
    if (!plan.run) throw new Error("no run command: pass --run");
    for (const step of ["s0", ...generated.checks.map((c) => c.step)]) {
      const result = await runCheck(box, generated, step, plan.run);
      const bad = result.cases.filter((c) => !c.passed);
      console.log(`  ${result.ok ? "ok  " : "FAIL"} ${step}: ${result.cases.length - bad.length}/${result.cases.length}${result.error ? ` ${result.error}` : ""}`);
      for (const c of bad) console.log(`       ${c.name}: ${c.detail} | got ${JSON.stringify(c.stdout ?? c.status ?? c.exit)} expected ${JSON.stringify(c.expected ?? c.expected_exit ?? "")}`);
      if (!result.ok) failed++;
    }
  } finally {
    await box.destroy();
  }
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
