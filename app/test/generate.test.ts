import { describe, expect, it } from "vitest";
import { checkProblems, profileProblems, runnerFor, stage0Problems, stepQuestionProblems } from "@/lib/gen/generate";
import type { Generated } from "@/lib/gen/schema";
import { pageFromHtml } from "@/lib/gen/sources";
import { reviewPrompt, reviewStep, type Verdict } from "@/lib/review/reviewer";
import type { StepRun } from "@/lib/sandbox/review";
import { generatedOf, mapOf } from "./helpers";

const SLUGS = ["wc", "json-parser", "url-shortener"] as const;

describe("the generated layers, one project of each type", () => {
  it("classify the three projects into three different types and runners", async () => {
    const kinds = await Promise.all(SLUGS.map(async (s) => ((g) => [g.profile.learns, g.runner])(await generatedOf(s))));
    expect(kinds).toEqual([
      ["streams-and-text", "cli"],
      ["language-processing", "case-files"],
      ["web-services", "http"],
    ]);
  });

  it("pass every check the generator applies", async () => {
    for (const slug of SLUGS) {
      const [map, g] = [await mapOf(slug), await generatedOf(slug)];
      const page = { url: map.project.source_url, text: "", downloads: g.profile.fixtures.flatMap((f) => (f.source ? [f.source] : [])) };
      expect(profileProblems(map, page, g.profile), slug).toEqual([]);
      expect(stage0Problems(g.stage0), slug).toEqual([]);
      expect(stepQuestionProblems(map, g.questions), slug).toEqual([]);
      expect(checkProblems(g.runner, g.profile, g.checks), slug).toEqual([]);
    }
  });
});

describe("the checks in code catch broken generator output", () => {
  it("in profiles, stage 0 and questions", async () => {
    const [map, g] = [await mapOf("wc"), await generatedOf("wc")];
    const page = { url: "", text: "", downloads: [] };
    expect(profileProblems(map, page, { ...g.profile, steps: g.profile.steps.slice(1) })).toContain(
      `steps must be exactly ${map.steps.map((s) => s.id).join(", ")} in order, got ${map.steps.slice(1).map((s) => s.id).join(", ")}`,
    );
    expect(profileProblems(map, page, g.profile).some((p) => p.includes("is not a download link on the page"))).toBe(true);
    expect(stage0Problems({ ...g.stage0, questions: g.stage0.questions.slice(0, 2) })[0]).toMatch(/exactly one what, one why and one how/);
    const wrongConcept = g.questions.map((q, i) => (i === 0 ? { ...q, concept: "no-such-concept" } : q));
    expect(stepQuestionProblems(map, wrongConcept)[0]).toMatch(/is not one of the step's concepts/);
  });

  it("in checks for each runner", async () => {
    const [wc, json, url] = await Promise.all(SLUGS.map(generatedOf));
    const cli = wc.checks as Extract<Generated["checks"][number], { cases: unknown }>[];
    const noExpectation = cli.map((c, i) => (i === 0 ? { ...c, cases: [{ ...c.cases[0], reference: null, expect_stdout: null, expect_exit: null }] } : c));
    expect(checkProblems("cli", wc.profile, noExpectation).join()).toMatch(/needs a reference or an expected result/);
    const files = json.checks.map((c, i) => (i === 0 ? { ...c, dir: "nowhere/step1" } : c));
    expect(checkProblems("case-files", json.profile, files).join()).toMatch(/is not inside a fixture/);
    const http = url.checks as Extract<Generated["checks"][number], { requests: unknown }>[];
    const early = http.map((c, i) => (i === 0 ? { ...c, requests: [{ ...c.requests[0], path: "/{key}" }, ...c.requests.slice(1)] } : c));
    expect(checkProblems("http", url.profile, early).join()).toMatch(/uses \{key\} before it is saved/);
    expect(checkProblems("http", url.profile, http.slice(1)).join()).toMatch(/has no check/);
  });

  it("pick the runner from how the program runs and where the right answer comes from", () => {
    expect(runnerFor({ runs_as: "cli", oracle: "real-tool" })).toBe("cli");
    expect(runnerFor({ runs_as: "cli", oracle: "case-files" })).toBe("case-files");
    expect(runnerFor({ runs_as: "http-server", oracle: "spec" })).toBe("http");
    expect(runnerFor({ runs_as: "interactive", oracle: "none" })).toBe("none");
  });

  it("read a challenge page's text and its download links", () => {
    const page = pageFromHtml(
      "https://example.com",
      `<html><main><h2>Step 1</h2><p>Get the <a href="https://www.dropbox.com/s/x/tests.zip?dl=0">tests</a> &amp; run them.</p><script>x()</script></main></html>`,
    );
    expect(page.downloads).toEqual(["https://www.dropbox.com/s/x/tests.zip?dl=0"]);
    expect(page.text).toContain("Get the tests & run them.");
    expect(page.text).not.toContain("x()");
  });
});

describe("the reviewer", () => {
  const run = (ok: boolean): StepRun => ({
    head: "8f40185aaaa",
    base: "3b7ded8aaaa",
    build: { ok: true, log: "" },
    check: { ok, cases: [{ name: "sample line count", passed: ok, detail: ok ? "matches the reference" : "differs from the reference (numbers)" }] },
    diffStat: "1 file changed",
    diff: "+ bytes += n;",
  });

  it("can never pass a step whose checks failed, whatever the model says", async () => {
    const [map, g] = [await mapOf("wc"), await generatedOf("wc")];
    const lenient: Verdict = { passed: true, summary: "Looks fine.", problems: [] };
    const ask = (async () => lenient) as never;
    expect((await reviewStep(ask, map, g, "s2", run(false))).passed).toBe(false);
    expect((await reviewStep(ask, map, g, "s2", run(true))).passed).toBe(true);
  });

  it("is told what the step asks, the results, the diff, and which later steps are out of scope", async () => {
    const [map, g] = [await mapOf("wc"), await generatedOf("wc")];
    const prompt = reviewPrompt(map, g, "s2", run(false));
    expect(prompt).toContain('Step s2, "Count lines"');
    expect(prompt).toContain("NOT all passed");
    expect(prompt).toContain("+ bytes += n;");
    expect(prompt).toMatch(/out of scope[\s\S]*s6 Read from standard input/);
    expect(prompt).not.toMatch(/out of scope[\s\S]*s1 Count bytes/);
  });
});
