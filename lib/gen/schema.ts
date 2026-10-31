import { z } from "zod";

/**
 * What the generators produce for one project (docs/content.md): a profile, stage 0, step questions and runnable
 * checks. Model-facing schemas stay plain (strings, arrays, enums, nullable) so structured output accepts them; counts
 * and cross-references are checked in code afterwards (`problems` in generate.ts).
 */

export const TYPES = [
  "streams-and-text",
  "language-processing",
  "algorithms-and-data-structures",
  "storage-engines",
  "network-protocols",
  "web-services",
  "developer-tools",
  "interactive",
] as const;
export type ProjectType = (typeof TYPES)[number];

export const RUNS_AS = ["cli", "http-server", "tcp-server", "udp-server", "client", "interactive"] as const;
export const ORACLES = ["real-tool", "page-values", "case-files", "property", "spec", "stub", "none"] as const;

export const ClassifySchema = z.object({
  learns: z.enum(TYPES).describe("The one type that best matches what the learner learns"),
  also: z.array(z.enum(TYPES)).describe("At most one more type, only when a large part of the project teaches it"),
  runs_as: z.enum(RUNS_AS),
  reason: z.string().describe("One sentence: why this type, in terms of the concepts it teaches"),
});

export const ProfileSchema = z.object({
  contract: z.object({
    run: z.string().describe("How the sandbox calls the program. <run> stands for the learner's own run command"),
    input: z.string().describe("Where input comes from: arguments, files, standard input, HTTP requests"),
    output: z.string().describe("What the sandbox reads back: standard output, the exit code, HTTP responses"),
    settings: z.array(
      z.object({
        name: z.string().describe("An environment variable, such as PORT"),
        purpose: z.string(),
        test_value: z
          .string()
          .nullable()
          .describe("The value the sandbox sets while checking, small enough for quick tests (a limit of 5, a window of 2 seconds); null for PORT and BASE_URL, which the sandbox sets itself"),
      }),
    ),
  }),
  oracle: z.enum(ORACLES),
  reference_tool: z.string().nullable().describe("A real tool inside the sandbox to compare with, such as wc, or null"),
  fixtures: z.array(
    z.object({
      name: z.string().describe("A short file or folder name, such as test.txt or tests"),
      source: z.string().nullable().describe("A download link from the page, or null for a small file we write"),
      content: z.string().nullable().describe("The full content of a small file we write (under 2 KB), else null"),
      purpose: z.string(),
    }),
  ),
  steps: z.array(
    z.object({
      step: z.string().describe("The step id from the map, such as s1"),
      check: z.enum(["auto", "partly", "manual"]),
      why: z.string().describe("One short line: what the sandbox can or can't check for this step"),
    }),
  ),
});

const Question = {
  prompt: z.string(),
  looks_for: z.array(z.string()).describe("2 to 4 short points a good answer contains"),
};

export const Stage0Schema = z.object({
  summary: z.string().describe("4 to 6 sentences in our own words: the problem, what goes in and out, what's hard"),
  questions: z.array(z.object({ kind: z.enum(["what", "why", "how"]), ...Question })),
});

export const StepQuestionsSchema = z.object({
  questions: z.array(z.object({ step: z.string().describe("The step id from the map, such as s1"), concept: z.string(), ...Question })),
});

/** cli runner: run the learner's program on fixtures and compare with the real tool or a fixed answer. */
export const CliChecksSchema = z.object({
  checks: z.array(
    z.object({
      step: z.string().describe("The step id from the map, such as s1"),
      cases: z.array(
        z.object({
          name: z.string(),
          args: z.array(z.string()).describe("Arguments after <run>. Write a fixture as {fixture:NAME}"),
          stdin: z.string().nullable().describe("A fixture name to pipe into standard input, or null"),
          compare: z.enum(["numbers", "lines", "contains", "count", "exact", "exit"]).describe("lines and exact compare the whole output; contains checks that the expected lines appear in order (use it for an excerpt); count compares how many lines are printed, for checks the page writes with wc -l"),
          reference: z.array(z.string()).nullable().describe("The real tool's command with the same input, or null"),
          expect_stdout: z.string().nullable(),
          expect_exit: z.number().nullable().describe("The exit code the page asks for; -1 means any non-zero, when the page only says it fails"),
        }),
      ),
    }),
  ),
});

/** case-files runner: run the program on every file in a folder; the expected exit code comes from the file name. */
export const CaseFilesChecksSchema = z.object({
  checks: z.array(
    z.object({
      step: z.string().describe("The step id from the map, such as s1"),
      dir: z.string().describe("A folder inside a fixture, such as tests/step1"),
      valid_prefix: z.string(),
      valid_exit: z.number(),
      invalid_prefix: z.string(),
      invalid_exit: z.number(),
    }),
  ),
});

/** http runner: start the service on PORT, send requests in order, compare status, headers and JSON fields. */
export const HttpChecksSchema = z.object({
  checks: z.array(
    z.object({
      step: z.string().describe("The step id from the map, such as s1"),
      start_args: z.array(z.string()).describe("Arguments after <run> when starting the service, such as {fixture:www}; usually none"),
      env: z.array(z.object({ name: z.string(), value: z.string() })).describe("Settings from the contract with a different value for this step only; usually none"),
      restart_before: z.boolean().describe("Restart the service before these requests (persistence)"),
      idle_clients: z.number().describe("Connections opened first that send half a request and stay idle while the requests run, to show one slow client doesn't block the rest; 0 for none"),
      requests: z.array(
        z.object({
          name: z.string(),
          wait_ms: z.number().describe("Pause before this request, for windows and expiry; 0 for none"),
          method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
          path: z.string().describe("May use {var} saved from an earlier response"),
          json_body: z.string().nullable().describe("The JSON body as text, or null"),
          expect_status: z.array(z.number()).describe("Every status the step accepts"),
          expect_headers: z.array(z.object({ name: z.string(), contains: z.string() })),
          expect_json_fields: z.array(z.string()),
          expect_json_equals: z.array(z.object({ field: z.string(), value: z.string() })),
          expect_body_contains: z.string().nullable(),
          save: z.array(z.object({ var: z.string(), from_json_field: z.string() })),
        }),
      ),
    }),
  ),
});

export const JudgeSchema = z.object({
  verdicts: z.array(
    z.object({
      id: z.string(),
      keep: z.boolean(),
      reason: z.string().describe("One sentence. For a reject, name the rule it breaks"),
    }),
  ),
});

export type Classification = z.infer<typeof ClassifySchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type Stage0 = z.infer<typeof Stage0Schema>;
export type StepQuestion = z.infer<typeof StepQuestionsSchema>["questions"][number];
export type CliChecks = z.infer<typeof CliChecksSchema>["checks"];
/** allowed_mismatches is written by `npm run validate-checks -- --oracle`: files where the suite and the current
 * specification (an independent reference implementation) disagree, which a learner may answer either way. */
export type CaseFilesChecks = (z.infer<typeof CaseFilesChecksSchema>["checks"][number] & { allowed_mismatches?: string[] })[];
export type HttpChecks = z.infer<typeof HttpChecksSchema>["checks"];

/**
 * script runner, for property checks: a short sequence of shell commands per step (compress, decompress, compare; set,
 * then get in a new process; build a site, then test the files). {tmp} is a fresh folder for the step.
 */
export const ScriptChecksSchema = z.object({
  checks: z.array(
    z.object({
      step: z.string().describe("The step id from the map, such as s1"),
      commands: z.array(
        z.object({
          name: z.string(),
          run: z.string().describe("A bash command. <run> is the learner's program; use {fixture:NAME} and {tmp}/file for paths"),
          stdin: z.string().nullable().describe("A fixture name to pipe into standard input, or null"),
          expect_exit: z.number().nullable().describe("The exit code; -1 means any non-zero"),
          stdout_contains: z.array(z.string()),
          stdout_not_contains: z.array(z.string()),
        }),
      ),
    }),
  ),
});

export type ScriptChecks = z.infer<typeof ScriptChecksSchema>["checks"];

/**
 * socket runner, for servers that speak a protocol on TCP or UDP: start the server on PORT and send exact bytes. With
 * several clients, all of them connect first and the last one talks first, so a server that serves one client at a
 * time never answers it.
 */
export const SocketChecksSchema = z.object({
  checks: z.array(
    z.object({
      step: z.string().describe("The step id from the map, such as s1"),
      start_args: z.array(z.string()).describe("Arguments after <run> when starting the server, such as {fixture:data}; usually none"),
      env: z.array(z.object({ name: z.string(), value: z.string() })).describe("Settings from the contract with a different value for this step only; usually none"),
      conversations: z.array(
        z.object({
          name: z.string(),
          transport: z.enum(["tcp", "udp"]),
          clients: z.number().describe("How many clients connect before anything is sent; each sends every message. 1 unless the step is about many clients"),
          restart_before: z.boolean().describe("Restart the server before this conversation (data that must survive a restart)"),
          messages: z.array(
            z.object({
              send: z.string().describe("The exact text sent, with \\r\\n wherever the protocol needs it"),
              split: z.boolean().describe("Send it in two writes a moment apart, to test framing"),
              wait_ms: z.number().describe("Pause before sending, for expiry; 0 for none"),
              expect: z.string().describe("The exact reply, or the part of it that must appear; empty when no reply is expected"),
              compare: z.enum(["exact", "contains"]),
            }),
          ),
        }),
      ),
    }),
  ),
});

export type SocketChecks = z.infer<typeof SocketChecksSchema>["checks"];

/**
 * client runner, for programs that talk to a server: each command runs against a stub server in the sandbox, which
 * records what it receives and answers with a fixed reply. Nothing goes to the public internet.
 */
export const ClientChecksSchema = z.object({
  checks: z.array(
    z.object({
      step: z.string().describe("The step id from the map, such as s1"),
      commands: z.array(
        z.object({
          name: z.string(),
          transport: z.enum(["tcp", "udp"]),
          replies: z
            .array(z.string())
            .describe("What the stub sends back: the first request gets the first reply, the second the second, and the last repeats. Usually one. Text, or hex bytes when reply_hex is true"),
          reply_hex: z.boolean().describe("replies are hex; inside one {req:A:B} copies request bytes A up to but not including B (a 2-byte ID at the start is {req:0:2}), and {req:A:} copies from A to the end"),
          run: z.string().describe("A bash command. <run> is the learner's program; {stub} is the stub's host:port, also {stub_host} and {stub_port}"),
          expect_exit: z.number().nullable().describe("The exit code; -1 means any non-zero"),
          stdout_contains: z.array(z.string()).describe("Text standard output must contain (the data)"),
          output_contains: z.array(z.string()).describe("Text that must appear in standard output or standard error (diagnostics)"),
          received_contains: z.array(z.string()).describe("Text the request must contain, such as a request line or a header"),
          received_hex_contains: z.array(z.string()).describe("Hex bytes the request must contain, for binary protocols"),
        }),
      ),
    }),
  ),
});

export type ClientChecks = z.infer<typeof ClientChecksSchema>["checks"];

export type Runner = "cli" | "case-files" | "http" | "script" | "socket" | "client" | "none";

/** The generated layer for one project, kept beside the reviewed map in content/generated/<slug>.yaml. */
export type Generated = {
  slug: string;
  status: "draft" | "approved";
  generated_at: string;
  model: string;
  profile: Classification & Profile;
  stage0: { summary: string; questions: (Stage0["questions"][number] & { id: string; flag?: string })[] };
  /** `flag` holds the relevance check's reason when an item failed it twice; Abid decides. */
  questions: (StepQuestion & { id: string; flag?: string })[];
  runner: Runner;
  checks: CliChecks | CaseFilesChecks | HttpChecks | ScriptChecks | SocketChecks | ClientChecks;
  /** First-round versions the relevance check rejected and that were replaced, kept to show what the judge caught. */
  rejected: { id: string; prompt: string; reason: string }[];
};
