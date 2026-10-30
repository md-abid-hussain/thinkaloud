import { z } from "zod";

/**
 * What the generators produce for one project (HANDOFF.md section 3): a profile, stage 0, step questions and runnable
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
          compare: z.enum(["numbers", "lines", "exact", "exit"]),
          reference: z.array(z.string()).nullable().describe("The real tool's command with the same input, or null"),
          expect_stdout: z.string().nullable(),
          expect_exit: z.number().nullable(),
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
      restart_before: z.boolean().describe("Restart the service before these requests (persistence)"),
      requests: z.array(
        z.object({
          name: z.string(),
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

export type Runner = "cli" | "case-files" | "http" | "none";

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
  checks: CliChecks | CaseFilesChecks | HttpChecks;
  /** First-round versions the relevance check rejected and that were replaced, kept to show what the judge caught. */
  rejected: { id: string; prompt: string; reason: string }[];
};
