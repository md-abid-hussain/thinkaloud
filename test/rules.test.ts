import { describe, expect, it } from "vitest";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { ProjectMapSchema } from "@/lib/content";
import { containsCode } from "@/lib/agent/graph";
import { askedQuestion, toHistory } from "@/lib/agent/run";
import { deriveProgress, questionsOf } from "@/lib/progress";
import { normalizeQuote, quoteAppearsIn } from "@/lib/quote";
import type { Message } from "@/lib/repo";
import { normaliseRepoUrl } from "@/lib/review/service";
import { generatedOf, mapOf, maps } from "./helpers";

describe("project maps", () => {
  it("loads and validates every map in content/", async () => {
    const all = await maps();
    const slugs = all.map((m) => m.project.slug);
    expect(slugs).toEqual(expect.arrayContaining(["json-parser", "url-shortener", "wc"]));
    // Every live project went through the gate, so it has a generated layer that fits its map.
    for (const slug of slugs) expect((await generatedOf(slug)).slug).toBe(slug);
  });

  it("rejects a step that uses an unknown concept", async () => {
    const wc = await mapOf("wc");
    const broken = { ...wc, steps: [{ ...wc.steps[0], concepts: ["no-such-concept"] }, ...wc.steps.slice(1)] };
    expect(ProjectMapSchema.safeParse(broken).success).toBe(false);
  });
});

describe("the quote check", () => {
  it("ignores case, curly quotes and spacing", () => {
    expect(normalizeQuote("  It’s   the  RETURNED count ")).toBe("it's the returned count");
    expect(quoteAppearsIn("it's the returned count", "Well, It’s the\nreturned   count, not the buffer size.")).toBe(true);
  });

  it("rejects words the learner didn't say, and quotes too short to be evidence", () => {
    expect(quoteAppearsIn("the decoder keeps the leftover bytes", "I think it just counts bytes")).toBe(false);
    expect(quoteAppearsIn("bytes", "it counts bytes")).toBe(false);
  });
});

describe("progress", () => {
  const none = new Set<string>();
  const input = async (slug: string) => ({
    map: await mapOf(slug),
    generated: await generatedOf(slug),
    answered: none,
    built: none,
    language: "java" as const,
    openQuestion: null,
    repoUrl: null,
    reviewing: null,
  });

  it("counts a step done only when its review passed and its questions are answered, for every project", async () => {
    for (const slug of ["wc", "json-parser", "url-shortener"]) {
      const base = await input(slug);
      const s1 = base.generated.questions.filter((q) => q.step === "s1").map((q) => q.id);
      const s0 = base.generated.questions.filter((q) => q.step === "s0").map((q) => q.id);
      const reviewed = deriveProgress({ ...base, built: new Set(["s0", "s1"]), answered: new Set(s0) });
      expect(reviewed.steps.find((s) => s.id === "s1")).toMatchObject({ built: true, understood: s1.length === 0, done: s1.length === 0 });
      const both = deriveProgress({ ...base, built: new Set(["s0", "s1"]), answered: new Set([...s0, ...s1]) });
      expect(both.steps.find((s) => s.id === "s1")?.done).toBe(true);
      expect(both.currentStep?.id).toBe("s2");
    }
  });

  it("treats concepts used only by optional steps as optional", async () => {
    const p = deriveProgress(await input("url-shortener"));
    expect(p.concepts.find((c) => c.id === "ci-cd")?.optional).toBe(true);
    expect(p.counts.stepsRequired).toBe(4);
  });

  it("says what to do next, in order: language, stage 0, repo, build, review, questions, complete", async () => {
    const base = await input("json-parser");
    const stage0 = base.generated.stage0.questions.map((q) => q.id);
    const all = base.generated.questions.map((q) => q.id);
    const steps = new Set(base.map.steps.map((s) => s.id));
    const at = (o: Partial<Parameters<typeof deriveProgress>[0]>) => deriveProgress({ ...base, ...o }).next.kind;
    expect(at({ language: null })).toBe("choose-language");
    expect(at({})).toBe("stage0");
    expect(at({ answered: new Set(stage0) })).toBe("link-repo");
    // Stage 0 is soft: linking the repo moves on, and it only comes back at the end.
    expect(at({ repoUrl: "https://github.com/a/b" })).toBe("build");
    expect(at({ repoUrl: "https://github.com/a/b", reviewing: "s0" })).toBe("reviewing");
    expect(at({ repoUrl: "https://github.com/a/b", built: new Set(["s0"]) })).toBe("questions");
    expect(at({ repoUrl: "https://github.com/a/b", openQuestion: all[1] })).toBe("answer");
    expect(at({ repoUrl: "https://github.com/a/b", built: steps, answered: new Set(all) })).toBe("stage0");
    expect(at({ repoUrl: "https://github.com/a/b", built: steps, answered: new Set([...all, ...stage0]) })).toBe("complete");
  });
});

describe("the open question", () => {
  it("is the stored question a reply asks, even without ask_question, unless it's already answered", async () => {
    const questions = questionsOf(await generatedOf("wc"));
    const [first, second] = questions.filter((q) => q.step);
    const reply = `Started the review. Meanwhile, here's a question.\n\n${first.prompt}`;
    expect(askedQuestion(reply, questions, new Set())).toBe(first.id);
    expect(askedQuestion(reply, questions, new Set([first.id]))).toBeNull();
    expect(askedQuestion(`${first.prompt} And then: ${second.prompt}`, questions, new Set())).toBe(second.id);
    expect(askedQuestion("How's it going?", questions, new Set())).toBeNull();
  });
});

describe("repo links", () => {
  it("accepts GitHub repo links in the usual shapes and nothing else", () => {
    expect(normaliseRepoUrl("https://github.com/md-abid-hussain/thinkaloud-test-wc")).toBe("https://github.com/md-abid-hussain/thinkaloud-test-wc");
    expect(normaliseRepoUrl("github.com/a/b.git")).toBe("https://github.com/a/b");
    expect(normaliseRepoUrl("https://github.com/a/b/")).toBe("https://github.com/a/b");
    expect(normaliseRepoUrl("https://gitlab.com/a/b")).toBeNull();
    expect(normaliseRepoUrl("https://github.com/a/b/tree/main")).toBeNull();
  });
});

describe("the code rule", () => {
  it("spots fenced code and code-like lines, but allows inline names", () => {
    expect(containsCode("Use a loop:\n```\nwhile (n > 0) {}\n```")).toBe(true);
    expect(containsCode("public static void main")).toBe(true);
    expect(containsCode("Look at `CharsetDecoder` and its `decode` method.")).toBe(false);
  });
});

describe("chat history for the mentor", () => {
  const msg = (id: number, role: Message["role"], text: string, status: Message["status"] = "done"): Message => ({
    id, role, text, status, intent: null, meta: {}, createdAt: "",
  });

  it("keeps learner and mentor turns, skips cards and failed replies, and merges repeats", () => {
    const history = toHistory(
      [
        msg(1, "card", ""),
        msg(2, "learner", "Java"),
        msg(3, "mentor", "Got it.", "done"),
        msg(4, "learner", "done, 342190"),
        msg(5, "mentor", "Something went wrong", "failed"),
        msg(6, "learner", "hello?"),
        msg(7, "mentor", "", "pending"),
      ],
      6,
    );
    expect(history.map((m) => m.constructor.name)).toEqual([HumanMessage.name, AIMessage.name, HumanMessage.name]);
    expect(history[2].content).toBe("done, 342190\n\nhello?");
  });
});
