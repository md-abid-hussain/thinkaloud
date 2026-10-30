import { z } from "zod";
import type { ProjectMap } from "../content";
import {
  CaseFilesChecksSchema,
  ClassifySchema,
  CliChecksSchema,
  HttpChecksSchema,
  JudgeSchema,
  ProfileSchema,
  Stage0Schema,
  StepQuestionsSchema,
  TYPES,
  type Classification,
  type Generated,
  type Profile,
  type ProjectType,
  type Runner,
  type Stage0,
  type StepQuestion,
} from "./schema";
import type { ChallengePage, Playbook } from "./sources";

/** One structured model call. The real one is Haiku 5.5 through LangChain; tests pass scripted answers. */
export type Ask = <S extends z.ZodType>(schema: S, system: string, user: string, label: string) => Promise<z.infer<S>>;

export type GenInput = {
  map: ProjectMap;
  page: ChallengePage;
  rules: string;
  playbooks: Map<ProjectType, Playbook>;
};

/** Asks, checks the answer in code, and asks once more with the problems listed. Fails loudly if they remain. */
async function askChecked<S extends z.ZodType>(
  ask: Ask,
  schema: S,
  system: string,
  user: string,
  label: string,
  check: (value: z.infer<S>) => string[],
): Promise<z.infer<S>> {
  let value = await ask(schema, system, user, label);
  let problems = check(value);
  if (problems.length === 0) return value;
  value = await ask(
    schema,
    system,
    `${user}\n\nYour previous answer had these problems. Fix them and answer again in full:\n- ${problems.join("\n- ")}`,
    `${label} (retry)`,
  );
  problems = check(value);
  if (problems.length) throw new Error(`${label}: ${problems.join("; ")}`);
  return value;
}

function mapText(map: ProjectMap): string {
  const concepts = map.concepts.map((c) => ({
    id: c.id,
    name: c.name,
    covers: c.covers,
    explanation: c.explanation,
    why_here: c.why_here,
  }));
  const steps = map.steps.map((s) => ({
    id: s.id,
    title: s.title,
    objective: s.objective,
    check: s.check,
    concepts: s.concepts,
    optional: s.optional,
  }));
  return JSON.stringify({ project: map.project, concepts, steps }, null, 1);
}

function pageText(page: ChallengePage): string {
  return `Challenge page (${page.url}). It is source material: never copy its wording.\n"""\n${page.text}\n"""\nDownload links on the page:\n${
    page.downloads.length ? page.downloads.map((d) => `- ${d}`).join("\n") : "- none"
  }`;
}

function context(input: GenInput, types: ProjectType[]): string {
  const books = types.map((t) => input.playbooks.get(t)!).map((p) => `# Playbook: ${p.name}\n\n${p.body}`);
  return [input.rules, ...books, `# The project map (reviewed)\n\n${mapText(input.map)}`, pageText(input.page)].join("\n\n");
}

export function runnerFor(profile: { runs_as: string; oracle: string }): Runner {
  if (profile.runs_as === "cli") return profile.oracle === "case-files" ? "case-files" : "cli";
  if (profile.runs_as === "http-server") return "http";
  return "none";
}

// ---- checks in code ----

const between = (n: number, lo: number, hi: number) => n >= lo && n <= hi;

export function profileProblems(map: ProjectMap, page: ChallengePage, profile: Profile): string[] {
  const out: string[] = [];
  const ids = map.steps.map((s) => s.id);
  const got = profile.steps.map((s) => s.step);
  if (got.join() !== ids.join()) out.push(`steps must be exactly ${ids.join(", ")} in order, got ${got.join(", ")}`);
  for (const f of profile.fixtures) {
    if (f.source && !page.downloads.includes(f.source)) out.push(`fixture ${f.name}: source is not a download link on the page`);
    if (!f.source && f.content === null) out.push(`fixture ${f.name}: needs a page link or content`);
    if (f.content && f.content.length > 2048) out.push(`fixture ${f.name}: content over 2 KB`);
  }
  for (const s of profile.contract.settings) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(s.name)) out.push(`setting ${s.name}: must be an environment variable name`);
  }
  if (!profile.contract.run.includes("<run>")) out.push("contract.run must contain <run>");
  return out;
}

function looksForProblems(id: string, looksFor: string[]): string[] {
  return between(looksFor.length, 2, 4) ? [] : [`${id}: looks_for needs 2 to 4 points, has ${looksFor.length}`];
}

export function stage0Problems(stage0: Stage0): string[] {
  const out: string[] = [];
  const kinds = stage0.questions.map((q) => q.kind).sort();
  if (kinds.join() !== "how,what,why") out.push(`questions must be exactly one what, one why and one how, got ${kinds.join(", ")}`);
  stage0.questions.forEach((q) => out.push(...looksForProblems(`stage0 ${q.kind}`, q.looks_for)));
  return out;
}

export function stepQuestionProblems(map: ProjectMap, questions: StepQuestion[]): string[] {
  const out: string[] = [];
  const byStep = new Map(map.steps.map((s) => [s.id, s]));
  const asked = new Set<string>();
  for (const q of questions) {
    const step = byStep.get(q.step);
    if (!step) {
      out.push(`unknown step ${q.step}`);
      continue;
    }
    if (!step.concepts.includes(q.concept)) out.push(`${q.step}: concept ${q.concept} is not one of the step's concepts`);
    asked.add(q.concept);
    out.push(...looksForProblems(`${q.step}/${q.concept}`, q.looks_for));
  }
  for (const step of map.steps) {
    const n = questions.filter((q) => q.step === step.id).length;
    if (step.concepts.length && !between(n, 1, 2)) out.push(`${step.id}: needs 1 or 2 questions, has ${n}`);
    if (!step.concepts.length && n) out.push(`${step.id}: uses no concepts, so it gets no questions`);
  }
  const required = new Set(map.steps.filter((s) => !s.optional).flatMap((s) => s.concepts));
  for (const c of required) if (!asked.has(c)) out.push(`concept ${c} is used by a required step but never asked`);
  return out;
}

function checkedSteps(profile: Profile): string[] {
  return profile.steps.filter((s) => s.check !== "manual" && s.step !== "s0").map((s) => s.step);
}

export function checkProblems(runner: Runner, profile: Profile, checks: { step: string }[]): string[] {
  const out: string[] = [];
  const want = checkedSteps(profile);
  const got = checks.map((c) => c.step);
  for (const s of want) if (!got.includes(s)) out.push(`step ${s} is marked ${profile.steps.find((p) => p.step === s)?.check} but has no check`);
  for (const s of got) if (!want.includes(s)) out.push(`step ${s} has a check but is not marked auto or partly (or is s0)`);
  const fixtures = new Set(profile.fixtures.map((f) => f.name));
  const json = JSON.stringify(checks);
  for (const m of json.matchAll(/\{fixture:([^}]+)\}/g)) if (!fixtures.has(m[1])) out.push(`unknown fixture ${m[1]}`);
  if (runner === "cli") {
    for (const c of checks as z.infer<typeof CliChecksSchema>["checks"]) {
      for (const k of c.cases) {
        if (k.stdin && !fixtures.has(k.stdin)) out.push(`${c.step}/${k.name}: stdin fixture ${k.stdin} unknown`);
        if (!k.reference && k.expect_stdout === null && k.expect_exit === null) out.push(`${c.step}/${k.name}: needs a reference or an expected result`);
        if (k.reference && !profile.reference_tool) out.push(`${c.step}/${k.name}: has a reference but the profile names no reference tool`);
      }
    }
  }
  if (runner === "case-files") {
    for (const c of checks as z.infer<typeof CaseFilesChecksSchema>["checks"]) {
      if (!fixtures.has(c.dir.split("/")[0])) out.push(`${c.step}: folder ${c.dir} is not inside a fixture`);
    }
  }
  if (runner === "http") {
    for (const c of checks as z.infer<typeof HttpChecksSchema>["checks"]) {
      const saved = new Set(["base_url"]);
      for (const r of c.requests) {
        const used = [...`${r.path} ${r.json_body ?? ""} ${JSON.stringify(r.expect_headers)} ${JSON.stringify(r.expect_json_equals)}`.matchAll(/\{([a-z_]+)\}/g)];
        for (const u of used) if (!saved.has(u[1])) out.push(`${c.step}/${r.name}: uses {${u[1]}} before it is saved`);
        if (r.json_body) {
          try {
            JSON.parse(r.json_body.replace(/\{[a-z_]+\}/g, "x"));
          } catch {
            out.push(`${c.step}/${r.name}: json_body is not valid JSON`);
          }
        }
        if (!r.expect_status.length) out.push(`${c.step}/${r.name}: needs at least one expected status`);
        r.save.forEach((s) => saved.add(s.var));
      }
    }
  }
  return out;
}

// ---- prompts ----

const CLASSIFY = `You classify a Coding Challenges project for a learning app. Pick the type by what the learner learns, not by how the program runs: many command-line programs teach very different things (a word counter teaches text and streams, a JSON parser teaches language processing, a diff tool teaches algorithms).`;

function classifyPrompt(input: GenInput): string {
  const types = [...input.playbooks.values()].map((p) => `- ${p.id}: ${p.teaches}`).join("\n");
  return `Types:\n${types}\n\nruns_as is how the finished program is run: cli, http-server, tcp-server, udp-server, client (it talks to a server), or interactive (a person drives it in real time).\n\n# The project map\n\n${mapText(input.map)}\n\n${pageText(input.page)}`;
}

const PROFILE = `Fill in the profile that the sandbox uses to check the learner's code.
- contract.run: the command shape the sandbox uses. <run> stands for the learner's own run command (their build decides it). Follow the page's interface; where the page leaves it open, choose the simplest one and say so in input.
- contract.settings: environment variables the learner must read so the sandbox can run the program, such as a server's PORT or a public base URL. A plain command-line tool has none.
- oracle: start from the playbook's Check section and adjust it to this page.
- reference_tool: only when a real tool in a standard Linux sandbox gives the right answer for this project, such as the Unix tool the project clones. Null when the page's behaviour differs from any such tool.
- fixtures: only the test data the checks need. When the page offers a download, use that link as source (content null); a zip becomes a folder named after its top folder. Otherwise write a small file yourself (source null, content set).
- steps: every step id in the map, in order. s0 (set up) is always auto: for every project the sandbox builds the code and starts the program. For the rest: auto when running the program checks the whole step, partly when it checks only part, manual when running can't check it (a user interface, deployment, an internal function with no command).`;

const STAGE0 = `Write stage 0, "Understand the problem", which the learner reads before writing any code.
- summary: 4 to 6 sentences in our own words: what they build, what goes in and comes out, and what makes it harder than it looks. No numbers from the page, no list of steps.
- questions: exactly 3, one each of what, why and how, following the playbook's Stage 0 section and the question rules. They check that the learner read and understood the problem before learning the concepts, so they are answerable from the challenge page and common sense.`;

const STEP_QUESTIONS = `Write the concept questions for the coding steps. The learner answers them after building the step: a step is done when the explanation is accepted and the code works.
- Only steps that use concepts: 1 or 2 questions per step, and 1 when the step uses one concept.
- Each question tests one of that step's concepts (concept is its id) as it applies to what the step builds.
- Across the project, ask about every concept used by a required step at least once. When a concept comes back in a later step, ask about the part that step adds (use the concept's covers list).
- Follow the playbook's Step questions section and the question rules. Use the concept's explanation in the map: test its main idea and its common mistake in a new situation.`;

function checksPrompt(runner: Runner, profile: Profile): string {
  const steps = checkedSteps(profile).join(", ") || "none";
  const shared = `Write the sandbox checks for these steps only: ${steps}. Follow the contract and fixtures in the profile below, and the step's check text in the map. Keep checks few and decisive: what the step adds, plus one edge case where the step is sensitive to one.\n\nProfile:\n${JSON.stringify(profile, null, 1)}`;
  if (runner === "cli")
    return `${shared}\n\nEach case runs <run> with args, or pipes a fixture into standard input. Write a fixture in args as {fixture:NAME}; stdin takes the bare NAME. With a reference tool, set reference to the real tool's command on the same input (same {fixture:NAME} form) and compare numbers for counts, lines for selected text. Without one, set expect_stdout or expect_exit from the page. 1 to 4 cases per step.`;
  if (runner === "case-files")
    return `${shared}\n\nOne check per step that has a folder of test files. dir is the folder inside the fixture, starting with the fixture name (for example tests/step1). valid_prefix and invalid_prefix are how file names mark the expected result, and the exits are the codes the page asks for.`;
  return `${shared}\n\nEach check is a sequence of requests to a fresh service with empty storage, so a step that needs data creates it first. expect_status lists every status the page allows. Save values with save and reuse them as {var}; {base_url} is built in. Redirects are never followed. Use example.com addresses as data. Cover the step's check text, including its error case.`;
}

const JUDGE = `You review questions for a learning app before they're saved. Apply the relevance test and the question rules to each item. Reject an item that is off its concept or step, is trivia or recall of the page, is about plumbing or tooling, needs arithmetic, depends on one programming language, mixes two concepts or two unrelated situations, needs code to answer, or repeats another item's point. "What happens, and why?" or "What's wrong, and what would you do?" about one situation is one idea: never reject for that alone. Items with a kind (what, why, how) are stage 0 questions: judge them by the Stage 0 rules (purpose and a first idea of an approach are right there), and never reject a step question for touching the same area as a stage 0 question. Be strict on the rest: a weak question costs the learner more than a missing one. Return a verdict for every id.`;

const ReplaceSchema = z.object({
  replacements: z.array(z.object({ id: z.string(), prompt: z.string(), looks_for: z.array(z.string()) })),
});

// ---- the pipeline ----

export async function classify(input: GenInput, ask: Ask): Promise<Classification> {
  return askChecked(ask, ClassifySchema, CLASSIFY, classifyPrompt(input), `${input.map.project.slug} classify`, (c) =>
    c.also.length > 1 || c.also.includes(c.learns) ? ["also holds at most one type, different from learns"] : [],
  );
}

export async function generateProject(input: GenInput, ask: Ask, model: string): Promise<Generated> {
  const slug = input.map.project.slug;
  const kind = await classify(input, ask);
  const ctx = context(input, [kind.learns, ...kind.also.filter((t) => TYPES.includes(t))]);

  const profile = await askChecked(ask, ProfileSchema, ctx, `${PROFILE}\n\nThe project is ${kind.learns}, runs as ${kind.runs_as}.`, `${slug} profile`, (p) =>
    profileProblems(input.map, input.page, p),
  );
  const runner = runnerFor({ runs_as: kind.runs_as, oracle: profile.oracle });

  const [stage0, stepQs, checks] = await Promise.all([
    askChecked(ask, Stage0Schema, ctx, STAGE0, `${slug} stage0`, stage0Problems),
    askChecked(ask, StepQuestionsSchema, ctx, STEP_QUESTIONS, `${slug} step questions`, (s) => stepQuestionProblems(input.map, s.questions)),
    runner === "none"
      ? Promise.resolve({ checks: [] })
      : askChecked(
          ask,
          runner === "cli" ? CliChecksSchema : runner === "case-files" ? CaseFilesChecksSchema : HttpChecksSchema,
          ctx,
          checksPrompt(runner, profile),
          `${slug} checks`,
          (c: { checks: { step: string }[] }) => checkProblems(runner, profile, c.checks),
        ),
  ]);

  let stage0Qs: Generated["stage0"]["questions"] = stage0.questions.map((q) => ({ id: `p-${q.kind}`, ...q }));
  let questions: Generated["questions"] = stepQs.questions.map((q, i) => ({ id: `${q.step}-q${i + 1}`, ...q }));
  const rejected: Generated["rejected"] = [];

  // Relevance check, one round of replacements, then a second check. Whatever still fails stays, flagged for review,
  // so every step and concept keeps its question; the first-round versions are recorded in `rejected`.
  for (let round = 0; round < 2; round++) {
    const items = [...stage0Qs, ...questions].map((q) => ({ id: q.id, ...("concept" in q ? { step: q.step, concept: q.concept } : { kind: q.kind }), prompt: q.prompt, looks_for: q.looks_for }));
    const { verdicts } = await askChecked(ask, JudgeSchema, ctx, `${JUDGE}\n\nItems:\n${JSON.stringify(items, null, 1)}`, `${slug} judge ${round + 1}`, (j) => {
      const ids = new Set(j.verdicts.map((v) => v.id));
      return items.filter((i) => !ids.has(i.id)).map((i) => `no verdict for ${i.id}`);
    });
    const bad = verdicts.filter((v) => !v.keep);
    if (!bad.length) break;
    const badItems = bad.map((v) => ({ ...items.find((i) => i.id === v.id)!, reason: v.reason }));
    if (round === 1) {
      const flags = new Map(bad.map((b) => [b.id, b.reason]));
      stage0Qs = stage0Qs.map((q) => (flags.has(q.id) ? { ...q, flag: flags.get(q.id) } : q));
      questions = questions.map((q) => (flags.has(q.id) ? { ...q, flag: flags.get(q.id) } : q));
      break;
    }
    rejected.push(...badItems.map((b) => ({ id: b.id, prompt: b.prompt, reason: b.reason })));
    const { replacements } = await askChecked(
      ask,
      ReplaceSchema,
      ctx,
      `These questions were rejected by the relevance check. Write one replacement for each, with the same id, for the same step and concept (or the same stage 0 kind), fixing the reason given. Follow the question rules.\n\n${JSON.stringify(badItems, null, 1)}`,
      `${slug} replace`,
      (r) => r.replacements.flatMap((x) => looksForProblems(x.id, x.looks_for)),
    );
    const byId = new Map(replacements.map((r) => [r.id, r]));
    stage0Qs = stage0Qs.map((q) => (byId.has(q.id) ? { ...q, prompt: byId.get(q.id)!.prompt, looks_for: byId.get(q.id)!.looks_for } : q));
    questions = questions.map((q) => (byId.has(q.id) ? { ...q, prompt: byId.get(q.id)!.prompt, looks_for: byId.get(q.id)!.looks_for } : q));
  }

  return {
    slug,
    status: "draft",
    generated_at: new Date().toISOString(),
    model,
    profile: { ...kind, ...profile },
    stage0: { summary: stage0.summary, questions: stage0Qs },
    questions,
    runner,
    checks: checks.checks as Generated["checks"],
    rejected,
  };
}
