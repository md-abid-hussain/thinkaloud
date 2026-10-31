import { describe, expect, it, vi } from "vitest";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { buildTurnGraph, textOf } from "@/lib/agent/graph";
import { mentorTools, type TurnEffects } from "@/lib/agent/tools";
import { questionsOf } from "@/lib/progress";
import type { Intent, ToolLine } from "@/lib/repo";
import { ScriptedModel, generatedOf, mapOf, toolCall } from "./helpers";

async function setup(script: AIMessage[], intent: Intent = "help") {
  const map = await mapOf("wc");
  const questions = questionsOf(await generatedOf("wc"));
  const lines = questions.find((q) => q.concept === "lines-and-line-endings")!;
  const effects: TurnEffects = {
    setLanguage: vi.fn(async () => {}),
    askQuestion: vi.fn(async () => {}),
    markAnswered: vi.fn(async (_q: string, quote: string) => {
      if (!quote.includes("newline")) throw new Error("quote not found");
    }),
    linkRepo: vi.fn(async (url: string) =>
      url.includes("github.com") ? ({ ok: true, repo: "https://github.com/a/ccwc" } as const) : ({ ok: false, error: "That isn't a GitHub repo link." } as const),
    ),
    setBuild: vi.fn(async () => {}),
    requestReview: vi.fn(async () => ({ ok: true }) as const),
  };
  const toolLines: ToolLine[] = [];
  const model = new ScriptedModel(script);
  const systems: Intent[] = [];
  const graph = buildTurnGraph({
    classify: async () => intent,
    mentor: model,
    tools: mentorTools({ map, questions, effects, onTool: (l) => toolLines.push(l) }),
    system: async (i) => {
      systems.push(i);
      return new SystemMessage("system");
    },
  });
  return { graph, effects, lines: toolLines, model, systems, question: lines };
}

describe("a mentor turn", () => {
  it("starts a review when the learner says they pushed, then asks a stored question", async () => {
    const t = await setup([]);
    const s = await setup([
      toolCall("request_review", { step: "s2" }),
      toolCall("ask_question", { question: t.question.id }),
      new AIMessage(`Started. Meanwhile: ${t.question.prompt}`),
    ]);
    const out = await s.graph.invoke({ messages: [] });
    expect(s.effects.requestReview).toHaveBeenCalledWith("s2");
    expect(s.effects.askQuestion).toHaveBeenCalledWith(t.question.id);
    expect(s.lines.map((l) => l.name)).toEqual(["request_review", "ask_question"]);
    expect(s.lines[0].label).toBe("Started a review of Step 3");
    // The tool hands back the stored question, so the mentor asks it as written.
    const askResult = out.messages.filter((m) => m.getType() === "tool")[1];
    expect(String(askResult.content)).toContain(JSON.stringify(t.question.prompt).slice(1, 40));
    expect(out.modelCalls).toBe(3);
    // Append-only: one system prompt for the whole turn, and each call extends the previous one.
    expect(s.systems).toEqual(["help"]);
    const [first, second, third] = s.model.calls.map((c) => c.messages.length);
    expect([first, second, third]).toEqual([1, 3, 5]);
  });

  it("tells the mentor when a quote isn't the learner's words, so it can try again", async () => {
    const probe = await setup([]);
    const t = await setup(
      [
        toolCall("mark_answered", { question: probe.question.id, quote: "made-up words" }),
        toolCall("mark_answered", { question: probe.question.id, quote: "wc counts newline characters" }),
        new AIMessage("That's it."),
      ],
      "explaining",
    );
    const out = await t.graph.invoke({ messages: [] });
    expect(t.effects.markAnswered).toHaveBeenCalledTimes(2);
    const firstResult = out.messages.find((m) => m.getType() === "tool");
    expect(String(firstResult?.content)).toMatch(/isn't in the learner's latest message/);
    expect(t.lines.map((l) => l.label)).toEqual(["Answered: Step 3, What a line is, and line endings"]);
  });

  it("passes a bad repo link back to the mentor instead of saving it", async () => {
    const t = await setup([toolCall("link_repo", { url: "https://gitlab.com/a/b" }), new AIMessage("That link isn't GitHub.")]);
    const out = await t.graph.invoke({ messages: [] });
    expect(String(out.messages.find((m) => m.getType() === "tool")?.content)).toMatch(/isn't a GitHub repo link/);
    expect(t.lines).toEqual([]);
  });

  it("rewrites a reply that contains code when code wasn't asked for", async () => {
    const t = await setup([new AIMessage("Try this:\n```\nwhile (read() != -1) count++;\n```"), new AIMessage("Loop until the read reports the end.")]);
    const out = await t.graph.invoke({ messages: [] });
    expect(t.systems).toEqual(["help"]);
    const secondCall = t.model.calls[1].messages.map((m) => textOf(m));
    expect(secondCall.some((m) => m.includes("while (read()"))).toBe(false);
    expect(secondCall.at(-1)).toMatch(/Note from the app/);
    expect(textOf(out.messages.at(-1))).toBe("Loop until the read reports the end.");
  });

  it("lets code through when the learner asked for it", async () => {
    const t = await setup([new AIMessage("```\nint n = in.read(buf);\n```\nThe read returns how many bytes it filled.")], "code");
    const out = await t.graph.invoke({ messages: [] });
    expect(t.systems).toEqual(["code"]);
    expect(textOf(out.messages.at(-1))).toMatch(/```/);
  });

  it("stops calling tools at the call limit and forces a final answer", async () => {
    const probe = await setup([]);
    const ask = () => toolCall("ask_question", { question: probe.question.id });
    const t = await setup([ask(), ask(), ask(), new AIMessage("Here's my question.")]);
    const out = await t.graph.invoke({ messages: [] });
    expect(out.modelCalls).toBe(4);
    expect(t.model.calls.at(-1)?.toolChoice).toBe("none");
  });

  it("rejects ids the project doesn't have", async () => {
    const t = await setup([toolCall("request_review", { step: "s99" }), toolCall("ask_question", { question: "s9-q99" }), new AIMessage("Which step do you mean?")]);
    const out = await t.graph.invoke({ messages: [] });
    expect(t.effects.requestReview).not.toHaveBeenCalled();
    expect(t.effects.askQuestion).not.toHaveBeenCalled();
    const results = out.messages.filter((m) => m.getType() === "tool").map((m) => String(m.content));
    expect(results[0]).toMatch(/No step with id s99/);
    expect(results[1]).toMatch(/No question with id s9-q99/);
  });
});
