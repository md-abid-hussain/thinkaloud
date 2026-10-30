import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { ensureLanguageLayer } from "../language/build";
import { getLayer } from "../language/layer";
import { questionsOf, type Question } from "../progress";
import { normalizeQuote } from "../quote";
import {
  finishMessage,
  loadState,
  markAnswered,
  setBuild,
  setIntent,
  setLanguage,
  setOpenQuestion,
  setRepo,
  syncCards,
  type Message,
  type ToolLine,
} from "../repo";
import { checkPublicRepo, normaliseRepoUrl, startReview } from "../review/service";
import { checkSpend, recordUsage, type TokenUsage } from "../spend";
import { openTurnStream } from "./bus";
import { buildTurnGraph, containsCode, textOf } from "./graph";
import { classifyIntent } from "./intent";
import { MODELS, intentModel, mentorModel } from "./models";
import { MENTOR_RULES, projectBlock, turnBlock } from "./prompt";
import { mentorTools, type TurnEffects } from "./tools";

const HISTORY_LIMIT = 30;
const FAILED_TEXT = "The mentor couldn't reply just now. Send your message again.";

/** Learner and mentor messages up to the new one, as alternating chat turns. Cards and failed replies are left out. */
export function toHistory(messages: Message[], uptoId: number): BaseMessage[] {
  const turns: { role: "learner" | "mentor"; text: string }[] = [];
  for (const m of messages) {
    if (m.id > uptoId) break;
    if (m.role === "card" || m.status !== "done" || !m.text.trim()) continue;
    const role = m.role as "learner" | "mentor";
    const last = turns.at(-1);
    if (last && last.role === role) last.text += `\n\n${m.text}`;
    else turns.push({ role, text: m.text });
  }
  while (turns[0]?.role === "mentor") turns.shift();
  return turns.slice(-HISTORY_LIMIT).map((t) => (t.role === "learner" ? new HumanMessage(t.text) : new AIMessage(t.text)));
}

/** The unanswered stored question a reply asks, matched on the start of its wording; the last one asked wins. */
export function askedQuestion(text: string, questions: Question[], answered: ReadonlySet<string>): string | null {
  const flat = (s: string) => normalizeQuote(s).replace(/[^a-z0-9 ]/g, "");
  const reply = flat(text);
  let best: { id: string; at: number } | null = null;
  for (const q of questions) {
    if (answered.has(q.id)) continue;
    const at = reply.lastIndexOf(flat(q.prompt).slice(0, 60));
    if (at >= 0 && (!best || at > best.at)) best = { id: q.id, at };
  }
  return best?.id ?? null;
}

/** Starts a turn in the background. The request that sent the message returns at once; the reply outlives the page. */
export function startTurn(args: { enrollmentId: number; learnerMessageId: number; mentorMessageId: number }): void {
  void runTurn(args).catch((error) => console.error("turn failed", args, error));
}

export async function runTurn({
  enrollmentId,
  learnerMessageId,
  mentorMessageId,
}: {
  enrollmentId: number;
  learnerMessageId: number;
  mentorMessageId: number;
}): Promise<void> {
  const stream = openTurnStream(mentorMessageId);
  const tools: ToolLine[] = [];
  try {
    const state = await loadState(enrollmentId);
    const { enrollment, map } = state;
    const learnerMessage = state.messages.find((m) => m.id === learnerMessageId);
    if (!learnerMessage) throw new Error("learner message not found");

    const spend = await checkSpend(enrollment.learnerId);
    if (!spend.ok) {
      stream.publish({ type: "delta", text: spend.reason });
      await finishMessage(mentorMessageId, { text: spend.reason, status: "done", meta: {} });
      stream.publish({ type: "done", status: "done" });
      return;
    }

    const questions = questionsOf(state.generated);
    const effects: TurnEffects = {
      async setLanguage(language) {
        await setLanguage(enrollmentId, language);
        ensureLanguageLayer(map.project.slug, language);
        await syncCards(enrollmentId);
      },
      askQuestion: (questionId) => setOpenQuestion(enrollmentId, questionId),
      markAnswered: (questionId, quote) => markAnswered(enrollmentId, questionId, quote, { id: learnerMessage.id, text: learnerMessage.text }),
      async linkRepo(url) {
        const repo = normaliseRepoUrl(url);
        if (!repo) return { ok: false, error: "That isn't a GitHub repo link. It should look like https://github.com/name/repo." };
        const visible = await checkPublicRepo(repo);
        if (!visible.ok) return { ok: false, error: visible.reason };
        await setRepo(enrollmentId, repo);
        // Linking the repo moves on from stage 0, so an unanswered stage 0 question stops being the next thing to do.
        if (questions.find((q) => q.id === enrollment.openQuestion)?.kind) await setOpenQuestion(enrollmentId, null);
        await syncCards(enrollmentId);
        const started = await startReview(enrollmentId, map.steps[0].id);
        return "error" in started ? { ok: false, error: started.error } : { ok: true, repo };
      },
      setBuild: (build, run) => setBuild(enrollmentId, { build, run, confirmed: true }),
      async requestReview(stepId) {
        const started = await startReview(enrollmentId, stepId);
        return "error" in started ? { ok: false, error: started.error } : { ok: true };
      },
    };

    const lastMentor = [...state.messages].reverse().find((m) => m.role === "mentor" && m.id < learnerMessageId && m.text);
    const graph = buildTurnGraph({
      async classify() {
        const open = questions.find((q) => q.id === enrollment.openQuestion);
        const result = await classifyIntent(intentModel(), {
          text: learnerMessage.text,
          openQuestion: open ? open.prompt : null,
          lastMentorText: lastMentor?.text ?? null,
        });
        if (result.raw) {
          await recordUsage({ learnerId: enrollment.learnerId, purpose: "intent", model: MODELS.intent, usage: result.raw.usage_metadata });
        }
        await setIntent(learnerMessageId, result.intent);
        stream.publish({ type: "intent", intent: result.intent });
        return result.intent;
      },
      mentor: mentorModel(),
      tools: mentorTools({
        map,
        questions,
        effects,
        onTool(line) {
          tools.push(line);
          stream.publish({ type: "tool", line });
        },
      }),
      async system(intent) {
        const fresh = await loadState(enrollmentId);
        const layer = fresh.enrollment.language ? await getLayer(map.project.slug, fresh.enrollment.language) : null;
        return new SystemMessage({
          content: [
            { type: "text", text: MENTOR_RULES, cache_control: { type: "ephemeral" } },
            { type: "text", text: projectBlock(map, fresh.generated), cache_control: { type: "ephemeral" } },
            {
              type: "text",
              text: turnBlock({
                map,
                generated: fresh.generated,
                progress: fresh.progress,
                enrollment: fresh.enrollment,
                reviews: fresh.reviews,
                answered: [...fresh.answers.keys()],
                layer: layer?.layer ?? null,
                layerStatus: layer?.status ?? null,
                intent,
              }),
            },
          ],
        });
      },
    });

    // Each model call is one segment; segments are joined with a blank line.
    const segments: string[] = [];
    let segment = "";
    let intent = "help";
    const events = await graph.stream(
      { messages: toHistory(state.messages, learnerMessageId) },
      { streamMode: ["messages", "updates"], recursionLimit: 25 },
    );
    for await (const [mode, payload] of events as AsyncIterable<[string, unknown]>) {
      if (mode === "messages") {
        const [chunk, meta] = payload as [BaseMessage, { langgraph_node?: string }];
        if (meta.langgraph_node !== "mentor") continue;
        const delta = textOf(chunk);
        if (!delta) continue;
        if (!segment && segments.length) stream.publish({ type: "delta", text: "\n\n" });
        segment += delta;
        stream.publish({ type: "delta", text: delta });
        continue;
      }
      const update = payload as Record<string, { messages?: BaseMessage[]; intent?: string; rewrite?: boolean }>;
      if (update.classify?.intent) intent = update.classify.intent;
      const reply = update.mentor?.messages?.[0];
      if (reply) {
        await recordUsage({
          learnerId: enrollment.learnerId,
          purpose: "mentor",
          model: MODELS.mentor,
          usage: (reply as AIMessage).usage_metadata as TokenUsage | undefined,
        });
        if (segment.trim()) segments.push(segment.trim());
        segment = "";
      }
      if (update.guard?.rewrite) {
        segments.length = 0;
        stream.publish({ type: "reset" });
      }
    }

    let text = segments.join("\n\n");
    if (!text && !tools.length) text = "I couldn't answer that one. Try asking it another way.";
    await finishMessage(mentorMessageId, {
      text,
      status: "done",
      meta: { tools, codeShown: intent === "code" && containsCode(text) },
    });
    // The app, not the mentor, keeps the open question right: a reply that asks a stored question opens it, even when
    // the mentor forgot to call ask_question.
    const asked = askedQuestion(text, questions, new Set((await loadState(enrollmentId)).answers.keys()));
    if (asked) await setOpenQuestion(enrollmentId, asked);
    await syncCards(enrollmentId);
    stream.publish({ type: "done", status: "done" });
  } catch (error) {
    console.error("mentor turn failed", error);
    await finishMessage(mentorMessageId, {
      text: FAILED_TEXT,
      status: "failed",
      meta: { tools, error: error instanceof Error ? error.message.slice(0, 300) : "unknown error" },
    }).catch(() => {});
    stream.publish({ type: "done", status: "failed" });
  }
}
