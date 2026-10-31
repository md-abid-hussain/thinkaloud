import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { ProjectMap } from "../content";
import { LANGUAGES, stepLabel, type Language, type Question } from "../progress";
import type { ToolLine } from "../repo";

/** The side effects the mentor's tools may cause. run.ts gives the real ones; tests give fakes. */
export type TurnEffects = {
  setLanguage(language: Language): Promise<void>;
  askQuestion(questionId: string): Promise<void>;
  /** Throws when the quote isn't in the learner's message. */
  markAnswered(questionId: string, quote: string): Promise<void>;
  linkRepo(url: string): Promise<{ ok: true; repo: string } | { ok: false; error: string }>;
  setBuild(build: string | null, run: string): Promise<void>;
  requestReview(stepId: string): Promise<{ ok: true } | { ok: false; error: string }>;
};

export type ToolContext = {
  map: ProjectMap;
  questions: Question[];
  effects: TurnEffects;
  /** Called for every tool call, so the chat can show it as a line. */
  onTool(line: ToolLine): void;
};

/** The mentor's tools, bound to one learner's turn. */
export function mentorTools(ctx: ToolContext) {
  const report = (name: string, label: string) => ctx.onTool({ name, label });
  const question = (id: string) => ctx.questions.find((q) => q.id === id);
  const about = (q: Question) =>
    q.kind ? `the problem (${q.kind})` : `${stepLabel(ctx.map, q.step!)}, ${ctx.map.concepts.find((c) => c.id === q.concept)?.name ?? q.concept}`;

  const setLanguage = tool(
    async ({ language }) => {
      await ctx.effects.setLanguage(language);
      report("set_language", `Saved your language: ${LANGUAGES[language]}`);
      return JSON.stringify({ ok: true, language: LANGUAGES[language], note: "The problem card (stage 0) now appears in the chat." });
    },
    {
      name: "set_language",
      description: "Save the language the learner is building in. JavaScript and TypeScript both mean node. Call it once they say which language they use.",
      schema: z.object({ language: z.enum(["java", "python", "node"]) }),
    },
  );

  const askQuestion = tool(
    async ({ question: id }) => {
      const q = question(id);
      if (!q) return JSON.stringify({ ok: false, error: `No question with id ${id}.` });
      await ctx.effects.askQuestion(id);
      report("ask_question", `Asked about ${about(q)}`);
      return JSON.stringify({ ok: true, question: q.prompt, note: "Write this question in your reply as given, then stop." });
    },
    {
      name: "ask_question",
      description: "Record that you're asking one of the stored questions (stage 0 or a step's). Call it right before you write the question.",
      schema: z.object({ question: z.string().describe("Question id, such as p-what or s1-q2") }),
    },
  );

  const markAnswered = tool(
    async ({ question: id, quote }) => {
      const q = question(id);
      if (!q) return JSON.stringify({ ok: false, error: `No question with id ${id}.` });
      try {
        await ctx.effects.markAnswered(id, quote);
      } catch {
        return JSON.stringify({ ok: false, error: "That quote isn't in the learner's latest message. Copy their exact words, at least one full phrase." });
      }
      report("mark_answered", `Answered: ${about(q)}`);
      return JSON.stringify({ ok: true });
    },
    {
      name: "mark_answered",
      description:
        "Accept an answer when the learner's own words cover the main points the question looks for. The quote must be copied exactly from their latest message.",
      schema: z.object({
        question: z.string().describe("Question id"),
        quote: z.string().describe("The exact sentence from the learner's latest message that shows they understood"),
      }),
    },
  );

  const linkRepo = tool(
    async ({ url }) => {
      const result = await ctx.effects.linkRepo(url);
      if (!result.ok) return JSON.stringify(result);
      report("link_repo", `Linked ${result.repo.replace("https://github.com/", "")} and started the setup review`);
      return JSON.stringify({
        ok: true,
        note: "The sandbox is cloning, building and running it. The result arrives as a review card in about a minute, with the build and run commands it found.",
      });
    },
    {
      name: "link_repo",
      description: "Save the learner's public GitHub repo for this project and start the setup review. Call it when they paste their repo link.",
      schema: z.object({ url: z.string().describe("The GitHub link, such as https://github.com/name/repo") }),
    },
  );

  const setBuild = tool(
    async ({ build, run }) => {
      await ctx.effects.setBuild(build, run);
      report("set_build", "Saved how the sandbox builds and runs your code");
      return JSON.stringify({ ok: true, note: "Ask for a review again to use them." });
    },
    {
      name: "set_build",
      description:
        "Save the commands the sandbox uses, when the learner confirms the detected ones or gives their own. run starts the program from the repo's top folder; build may be null.",
      schema: z.object({ build: z.string().nullable(), run: z.string() }),
    },
  );

  const requestReview = tool(
    async ({ step }) => {
      if (!ctx.map.steps.some((s) => s.id === step)) return JSON.stringify({ ok: false, error: `No step with id ${step}.` });
      const result = await ctx.effects.requestReview(step);
      if (!result.ok) return JSON.stringify(result);
      report("request_review", `Started a review of ${stepLabel(ctx.map, step)}`);
      return JSON.stringify({ ok: true, note: "The result arrives as a review card in about a minute. Meanwhile, the step's questions can be answered." });
    },
    {
      name: "request_review",
      description:
        "Start a sandbox review of a step, when the learner says they pushed it or asks for a review. It builds the latest commit, runs the step's check and reviews the changes since the last approved review.",
      schema: z.object({ step: z.string().describe("Step id from the map, such as s1") }),
    },
  );

  return [setLanguage, askQuestion, markAnswered, linkRepo, setBuild, requestReview];
}
