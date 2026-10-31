import { z } from "zod";
import type { ProjectMap } from "../content";
import {
  CaseFilesChecksSchema,
  ClassifySchema,
  CliChecksSchema,
  ClientChecksSchema,
  HttpChecksSchema,
  JudgeSchema,
  ScriptChecksSchema,
  SocketChecksSchema,
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
  /** Lists the files inside a zip fixture, so checks can name them. The script passes zipEntries; tests leave it out. */
  listZip?: (source: string) => Promise<string[] | null>;
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

/**
 * The sandbox runner for a project. Algorithms, storage and developer tools always use the script runner: their steps
 * need properties (a round trip, a permutation, data that survives a restart), and a script can still compare with a
 * real tool through cmp.
 */
export function runnerFor(profile: { runs_as: string; oracle: string; learns?: string }): Runner {
  const propertyTypes = ["algorithms-and-data-structures", "storage-engines", "developer-tools"];
  if (profile.runs_as === "cli" && (profile.oracle === "property" || propertyTypes.includes(profile.learns ?? ""))) return "script";
  if (profile.runs_as === "cli") return profile.oracle === "case-files" ? "case-files" : "cli";
  if (profile.runs_as === "http-server") return "http";
  if (profile.runs_as === "tcp-server" || profile.runs_as === "udp-server") return "socket";
  if (profile.runs_as === "client") return "client";
  return "none";
}

const CHECK_SCHEMAS = {
  cli: CliChecksSchema,
  "case-files": CaseFilesChecksSchema,
  script: ScriptChecksSchema,
  http: HttpChecksSchema,
  socket: SocketChecksSchema,
  client: ClientChecksSchema,
};

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
    const most = step.concepts.length >= 3 ? 3 : 2;
    // A step may ask nothing when each of its concepts is asked at another step (a concept is usually asked once).
    const coveredElsewhere = step.concepts.every((c) => questions.some((q) => q.concept === c && q.step !== step.id));
    if (step.concepts.length && n > most) out.push(`${step.id}: at most ${most} questions, has ${n}`);
    if (step.concepts.length && n === 0 && !coveredElsewhere) out.push(`${step.id}: needs a question, or its concepts asked at another step`);
    if (!step.concepts.length && n) out.push(`${step.id}: uses no concepts, so it gets no questions`);
  }
  const required = new Set(map.steps.filter((s) => !s.optional).flatMap((s) => s.concepts));
  for (const c of required) if (!asked.has(c)) out.push(`concept ${c} is used by a required step but never asked`);
  return out;
}

/**
 * What checks may name as {fixture:...}: a small file we write, a downloaded file, or a file or folder inside a
 * downloaded zip (the sandbox extracts zip members by their own paths).
 */
export function fixturePaths(profile: Profile): Set<string> {
  const paths = new Set<string>();
  for (const f of profile.fixtures as (Profile["fixtures"][number] & { files?: string[] })[]) {
    // A written file's name may be a path (www/index.html); its folders count too. A zip adds its own paths.
    for (const file of f.files ?? [f.name]) {
      paths.add(file);
      const parts = file.split("/");
      for (let i = 1; i < parts.length; i++) paths.add(parts.slice(0, i).join("/"));
    }
  }
  return paths;
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
  const fixtures = fixturePaths(profile);
  const json = JSON.stringify([checks, profile.contract.settings]);
  for (const m of json.matchAll(/\{fixture:([^}]+)\}/g)) if (!fixtures.has(m[1])) out.push(`unknown fixture ${m[1]}`);
  const settings = new Set(profile.contract.settings.map((s) => s.name));
  for (const c of checks as { step: string; env?: { name: string }[] }[])
    for (const e of c.env ?? []) if (!settings.has(e.name)) out.push(`${c.step}: env ${e.name} is not a setting in the contract`);
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
      if (!fixtures.has(c.dir)) out.push(`${c.step}: folder ${c.dir} is not inside a fixture`);
    }
  }
  if (runner === "script") {
    for (const c of checks as z.infer<typeof ScriptChecksSchema>["checks"]) {
      if (!c.commands.some((k) => k.run.includes("<run>"))) out.push(`${c.step}: no command runs the learner's program (<run>)`);
      for (const k of c.commands) {
        if (k.stdin && !fixtures.has(k.stdin)) out.push(`${c.step}/${k.name}: stdin fixture ${k.stdin} unknown`);
        if (k.expect_exit === null && !k.stdout_contains.length && !k.stdout_not_contains.length) out.push(`${c.step}/${k.name}: expects nothing`);
      }
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
  if (runner === "socket") {
    for (const c of checks as z.infer<typeof SocketChecksSchema>["checks"]) {
      for (const v of c.conversations) {
        if (v.clients < 1 || v.clients > 10) out.push(`${c.step}/${v.name}: clients must be 1 to 10`);
        if (!v.messages.some((m) => m.expect)) out.push(`${c.step}/${v.name}: expects no reply at all`);
        if (v.transport === "udp" && v.messages.some((m) => m.split)) out.push(`${c.step}/${v.name}: a UDP datagram can't be split`);
      }
    }
  }
  if (runner === "client") {
    for (const c of checks as z.infer<typeof ClientChecksSchema>["checks"]) {
      for (const k of c.commands) {
        if (!k.run.includes("<run>")) out.push(`${c.step}/${k.name}: doesn't run the learner's program (<run>)`);
        if (!/\{stub(_host|_port)?\}/.test(k.run)) out.push(`${c.step}/${k.name}: doesn't point the program at the stub ({stub})`);
        if (!k.replies.length) out.push(`${c.step}/${k.name}: needs at least one reply`);
        for (const [i, reply] of k.replies.entries()) {
          const which = `${c.step}/${k.name}: reply ${i + 1}`;
          if (k.reply_hex && !/^([0-9a-fA-F\s]|\{req:\d+:\d*\})*$/.test(reply)) out.push(`${which} is not hex with {req:A:B} slices`);
          if (k.reply_hex && reply.replace(/\{req:\d+:\d*\}|\s/g, "").length % 2) out.push(`${which} has an odd number of hex digits`);
          const http = !k.reply_hex && /^HTTP\/1\.[01] \d{3}/.test(reply) ? reply.split("\r\n\r\n") : null;
          const length = http && /^content-length:\s*(\d+)\s*$/im.exec(http[0]);
          if (http && http.length < 2) out.push(`${which}: an HTTP reply needs \\r\\n line endings and an empty line before the body`);
          else if (http && length && Buffer.byteLength(http.slice(1).join("\r\n\r\n")) !== Number(length[1]))
            out.push(`${which}: Content-Length ${length[1]} doesn't match the body's ${Buffer.byteLength(http.slice(1).join("\r\n\r\n"))} bytes`);
        }
        for (const h of k.received_hex_contains) if (!/^[0-9a-fA-F\s]+$/.test(h) || h.replace(/\s/g, "").length % 2) out.push(`${c.step}/${k.name}: ${h} is not whole hex bytes`);
        if (k.expect_exit === null && ![k.stdout_contains, k.output_contains, k.received_contains, k.received_hex_contains].some((l) => l.length))
          out.push(`${c.step}/${k.name}: expects nothing`);
      }
    }
  }
  return out;
}

// ---- prompts ----

const CLASSIFY = `You classify a Coding Challenges project for a learning app. Pick the type by what the learner learns, not by how the program runs: many command-line programs teach very different things (a word counter teaches text and streams, a JSON parser teaches language processing, a diff tool teaches algorithms).`;

function classifyPrompt(input: GenInput): string {
  const types = [...input.playbooks.values()].map((p) => `- ${p.id}: ${p.teaches}`).join("\n");
  return `Types:\n${types}\n\nruns_as is how the finished program is run: cli, http-server, tcp-server, udp-server, client (it talks to a server over the network, even when started from the command line, as curl or a DNS lookup tool is), or interactive (a person drives it in real time).\n\n# The project map\n\n${mapText(input.map)}\n\n${pageText(input.page)}`;
}

const PROFILE = `Fill in the profile that the sandbox uses to check the learner's code.
- contract.run: the command shape the sandbox uses. <run> stands for the learner's own run command (their build decides it). Follow the page's interface; where the page leaves it open, choose the simplest one and say so in input.
- contract.settings: environment variables the learner must read so the sandbox can run the program, such as a server's PORT or a public base URL. A plain command-line tool has none. Give each a test_value the sandbox sets while checking, small enough for quick checks (a limit of 5, a window of 2 seconds); a setting that points at test data names the fixture as {fixture:NAME} (test files are kept apart from the learner's repo); null for PORT and BASE_URL, which the sandbox sets itself.
- The sandbox is one Linux machine running one copy of the program at a time, with one client address, no database or cache server, and checks never use the internet (a client talks to a stub server the sandbox starts). A step that needs more (a store shared by several instances, a browser, a second machine, a public server) is manual.
- oracle: start from the playbook's Check section and adjust it to this page.
- reference_tool: only when a real tool in a standard Linux sandbox gives the right answer for this project, such as the Unix tool the project clones. Null when the page's behaviour differs from any such tool.
- fixtures: only the test data the checks need. When the page offers a download, use that link as source (content null); the sandbox extracts a zip's files by their paths inside the zip, and you'll see those paths when writing the checks. Otherwise write a small file yourself (source null, content set).
- steps: every step id in the map, in order. s0 (set up) is always auto: for every project the sandbox builds the code and starts the program. For the rest: auto when running the program checks the whole step, partly when it checks only part, manual when running can't check it (a user interface, deployment, an internal function with no command). When the page checks an early step through an intermediate output (counts, a table, a parsed form), the contract may include a command that prints it, so that step is checkable as soon as it's built; otherwise the step is manual. A step is auto or partly only when running the program as it is at the end of that step gives a result a check can compare (an output, a reply, a file); a step that builds an internal piece first used by a later step's command, or a server step before the server answers anything, is manual. When a later step replaces a step's behaviour (an echo that later becomes an interpreter, a server that first answers every request the same way and later serves files), that earlier step can't share a command with the later ones: give it its own command in the contract, or for a server a setting that picks the behaviour (each step's check sets it), or mark it manual.`;

const STAGE0 = `Write stage 0, "Understand the problem", which the learner reads before writing any code.
- summary: 4 to 6 sentences in our own words: what they build, what goes in and comes out, and what makes it harder than it looks. No numbers from the page, no list of steps.
- questions: exactly 3, one each of what, why and how, following the playbook's Stage 0 section and the question rules. They check that the learner read and understood the problem before learning the concepts, so they are answerable from the challenge page and common sense.`;

const STEP_QUESTIONS = `Write the concept questions for the coding steps. The learner answers them after building the step: a step is done when the explanation is accepted and the code works.
- Only steps that use concepts. Prefer one question per step; add a second (up to 3 when the step uses 3 or more concepts) only for a genuinely different idea, never a second angle on the same point. A step that uses one concept gets 1.
- Each question tests one of that step's concepts (concept is its id) as it applies to what the step builds.
- Across the project, ask about every concept used by a required step at least once. A concept that appears on several steps is usually asked once, at the step where it matters most; ask again at a later step only for a clearly different part (use the concept's covers list). A step whose concepts are all asked elsewhere may have no question.
- Follow the playbook's Step questions section and the question rules. Use the concept's explanation in the map: test its main idea and its common mistake in a new situation.`;

function checksPrompt(runner: Runner, profile: Profile): string {
  const steps = checkedSteps(profile).join(", ") || "none";
  const shared = `Write the sandbox checks for these steps only: ${steps}. Follow the contract and fixtures in the profile below, and the step's check text in the map. Keep checks few and decisive: what the step adds, plus one edge case where the step is sensitive to one. Never re-test an earlier step's behaviour in a later step: a step that lets the learner change earlier behaviour is never held to the old one. Every expected output comes from the page itself or from a real tool run in the sandbox as the reference; never write an expected output for behaviour the page doesn't show. A step's check may use only what the learner has built by the end of that step, never a command or feature from a later step. A learner may build ahead, so every check must pass both at the end of its step and on the finished program: when a later step changes behaviour (keeping some comments, running instead of echoing, sending a request instead of printing it), an earlier step's check uses only behaviour that survives (for a client, the request the stub records), and avoids the inputs that later step treats differently. A check relies only on what the contract states: never assume file names, a folder layout or output wording the contract leaves open. Each command must finish within 60 seconds and some languages take a second to start, so a command runs the program at most about 20 times. A downloaded zip is extracted by its own paths: name a file inside it by that path, as listed in the fixture's files (for example {fixture:sample.tsv}), never by the zip's name. Checks follow the contract exactly, including its failures: never expect success from a command the contract says fails (such as checking before the data file exists). Answers that are right only with high probability (a Bloom filter's false positives, a random sample) are never checked one item at a time: check a rate over many items, with a bound well inside what the contract allows. The sandbox has bash, coreutils (od, cmp, dd, head, tail, wc, sort, seq), grep, sed, awk, diff, bc, curl and python3, but not xxd, hexdump, jq or nc: read bytes with od or python3.\n\nProfile:\n${JSON.stringify(profile, null, 1)}`;
  if (runner === "cli")
    return `${shared}\n\nEach case runs <run> with args, or pipes a fixture into standard input. Write a fixture in args as {fixture:NAME}; stdin takes the bare NAME. With a reference tool, set reference to the real tool's command on the same input (same {fixture:NAME} form) and compare numbers for counts, lines for selected text. Without one, set expect_stdout or expect_exit from the page. When you expect only part of the output, use compare contains with those lines; lines and exact compare the whole output. When the page counts output lines (piping into wc -l), use compare count with the number as expect_stdout. The program runs from the learner's repo folder, so always name the files or folders it reads as {fixture:...}, never the current folder or a shell wildcard. Paths under the test folder are compared relative to it, so expect output as the page shows it when run from inside that folder. 1 to 4 cases per step.`;
  if (runner === "script")
    return `${shared}

Each check is a short sequence of bash commands, each started in the learner's repo folder. <run> is the learner's program and works from any folder; write fixtures as {fixture:NAME}. Never create files in the repo folder: anything the program or a command makes goes under {tmp} (a fresh folder per step), so a command that runs the program inside a folder it made starts with cd {tmp}/name. Check properties, not one exact output: a round trip gives back the input (finish with a cmp or diff command that must exit 0), a value set in one run comes back in the next, the files a build makes exist and contain what they should. Each command expects an exit code, text in standard output, or text that must not be there; text that must not be there is text no heading or message could contain. 2 to 6 commands per step.`;
  if (runner === "socket")
    return `${shared}

Each check starts the server on PORT (with start_args and env when set) and runs conversations: a client sends exact text and compares the reply, exact for a whole reply and contains for part of one. Write the protocol's bytes exactly, with \\r\\n wherever the protocol needs it. split sends a message in two writes, to test that the server waits for a whole message. clients above 1 opens that many connections before anything is sent, for a step about many clients at once. restart_before restarts the server, for data that must survive. wait_ms pauses before a message, for expiry; give anything timed room on a slow machine (a lifetime of at least a second, a wait well past it). Expected replies come from the page or the protocol's specification. 1 to 4 conversations per step.`;
  if (runner === "client")
    return `${shared}

Each command runs the learner's client against a stub server the sandbox starts, on a port it picks; nothing else listens, so every address a command uses is the stub's. Point the program at it the way the contract allows, with {stub} (host:port), {stub_host} or {stub_port}: for example <run> http://{stub}/get, or a setting given on the command line. The stub records what the program sends and answers its requests with replies in order (the last one repeats), so write each reply complete and well formed, as a real server would send it (an HTTP response whose Content-Length matches its body; a binary message whose counts match the records that follow). For a binary protocol set reply_hex and write replies in hex; {req:A:B} copies request bytes A up to but not including B into one, such as an ID the reply must repeat (a 2-byte ID is {req:0:2}). Count every field's bytes so the message matches its own header. Several replies let one stub play several servers in turn (a root server's referral, then the next server's answer); any address a reply hands out must be the stub's own. Every reply must be one a careful client following the map's concepts would trust: it answers the question that was asked, and it only vouches for what that server is responsible for (a DNS server gives glue only for names inside its own zone). Check what the program sent (received_contains, received_hex_contains), what it printed (stdout_contains for data, output_contains for diagnostics that may go to either stream) and its exit code. Expected output must be something only a correct answer contains: an address the program also prints for other reasons (the stub's own 127.0.0.1) proves nothing, so a final answer carries a value of its own. 1 to 4 commands per step.`;
  if (runner === "case-files")
    return `${shared}\n\nOne check per step that has a folder of test files. dir is the folder inside the fixture, starting with the fixture name (for example tests/step1). valid_prefix and invalid_prefix are how file names mark the expected result, and the exits are the codes the page asks for.`;
  return `${shared}\n\nEach check is a sequence of requests to a fresh service with empty storage, so a step that needs data creates it first. expect_status lists every status the page allows. Save values with save and reuse them as {var}; {base_url} is built in. Redirects are never followed. Use example.com addresses as data. Cover the step's check text, including its error case. start_args passes arguments when the service starts, such as a folder of files to serve ({fixture:www}); env gives a contract setting a different value for this step only. Requests come from one client address, one after another: wait_ms pauses before a request (to let a window pass), and idle_clients holds slow connections open while the requests run, for a step about many clients.`;
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
  for (const f of profile.fixtures as (Profile["fixtures"][number] & { files?: string[] })[]) {
    const files = f.source && input.listZip ? await input.listZip(f.source) : null;
    if (files) f.files = files;
  }
  const runner = runnerFor({ runs_as: kind.runs_as, oracle: profile.oracle, learns: kind.learns });

  const [stage0, stepQs, checks] = await Promise.all([
    askChecked(ask, Stage0Schema, ctx, STAGE0, `${slug} stage0`, stage0Problems),
    askChecked(ask, StepQuestionsSchema, ctx, STEP_QUESTIONS, `${slug} step questions`, (s) => stepQuestionProblems(input.map, s.questions)),
    runner === "none"
      ? Promise.resolve({ checks: [] })
      : askChecked(
          ask,
          CHECK_SCHEMAS[runner] as z.ZodType<{ checks: { step: string }[] }>,
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
