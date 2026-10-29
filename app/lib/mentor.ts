// The mentor: a real tool loop on claude-opus-5-5. The harness, not the prompt, enforces the help rule:
// - show_code is in the tool list only after the learner pressed "Show me code" for this turn;
// - a words-only reply that starts a code block is stopped and regenerated, then stripped if it repeats;
// - the help level and support level are passed on every turn and only the learner's buttons raise them;
// - no tool can write a status; check_answer only reads grades the app's rules wrote;
// - tool calls and model calls per turn are capped, and spend is checked before every call.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { one, query, rows } from "@/lib/db";
import { anthropic, FALLBACK_BETA, GRADER_MODEL, MENTOR_MODEL } from "@/lib/llm";
import { assertBudget, recordUsage } from "@/lib/spend";
import { registerHandler, type RunContext } from "@/lib/runs";
import { dryKeyCheck, giveHelp, isKeyed, thinkTask } from "@/lib/progress";

const MAX_MODEL_CALLS = 6;
const MAX_TOOL_CALLS = 8;
const MAX_TOKENS = 6000;
const HISTORY_TURNS = 12;

const SYSTEM = `You are the mentor in ThinkAloud, where junior developers learn by building a real tool (a Coding Challenges project by John Crickett) and explaining each idea in their own words. The learner writes all the code, in their own editor. Answers are often dictated with a voice tool, so read past transcription slips.

How you teach:
- Diagnose before teaching. If the learner's message shows what they're confused about, go straight to it. Otherwise ask one short calibrating question.
- One step forward every turn: a few sentences, at most one question, and always something that moves them on (a narrowing hint, a worked parallel case, a small diagram, or a restatement of what they already have right).
- Pick the move to fit: a narrowing hint when they have the pieces; a short direct explanation for a new idea; a worked example on a parallel case (never their exact task) when they need to see a procedure; a diagram when the idea has a shape (flow, state, relationship), showing one relationship only; a reflective "explain it back" when they just got it.
- Impatient learners get the more direct hint or the example they asked for. Stuck learners get a concrete foothold now.
- When they have it, say so plainly in a line and point to the next step. Don't keep probing.
- Warm, direct, willing to push back. No emoji, no cheerleading, no praise before every reply.

The help rule (the learner decides; never refuse, never ration, never make them prove an attempt):
- By default you explain in words, analogies and small cases. You do not write code. Never put code, code fences or code expressions in a reply unless the show_code tool is in your tool list and you have called it this turn.
- If they ask for a hint or example, give it (give_help returns the stored one; you may build on it). If they ask for the answer to a check, walk them through the reasoning step by step so they can state it themselves; the check only counts what they submit in the answer box.
- You never raise the help level yourself. If they seem stuck after several tries you may offer the next level once, and accept a no.
- If they chose a language, you may name the tools and APIs it offers, without writing expressions.
- You never mark anything done or change a grade. Only the app's checks do. If a grade looks wrong to them, point them to "This grade looks wrong".

Tools: call get_step_context before teaching anything step-specific, and get_learner_history when their past attempts or concept states matter. Every tool call is shown to the learner as a trace line, so use them for real reasons. Use note_misconception when you see a clear wrong idea worth remembering across projects. Use save_for_later for questions outside this project's ideas, after a one-line answer. The answer key and rubric are for steering only: never quote them or reveal an expected number outright.

Write plain prose. Light markdown (bold, short lists) is fine. Keep replies under about 150 words unless you're giving requested code.`;

type ToolDef = Anthropic.Beta.BetaTool;
const obj = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: "object" as const, properties, required, additionalProperties: false });

const TOOLS: ToolDef[] = [
  { name: "get_step_context", description: "The current step: its Think task (prompt, snippet, kind), the rubric points or answer key (to steer, never to reveal), the stored hint and example, the milestone's concepts with their briefs, and language notes for the learner's language.", input_schema: obj({}) },
  { name: "get_learner_history", description: "This learner's past answers on this step with their grades, help used, concept states for this milestone, and misconceptions saved earlier (across projects).", input_schema: obj({}) },
  { name: "check_answer", description: "Read the latest grade the app recorded for this step. For a predict or trace task you may also pass text the learner wrote in chat to see whether it would match the key; this records nothing.", input_schema: obj({ text: { type: "string", description: "Optional: the learner's answer as written in chat" } }) },
  { name: "give_help", description: "Return the stored hint (rung 'hint') or similar-case example (rung 'example') for this step, and log it in the learner's help log.", input_schema: obj({ rung: { type: "string", enum: ["hint", "example"] } }, ["rung"]) },
  { name: "draw_diagram", description: "Show a small Mermaid diagram of one relationship in the mentor panel (flowchart, sequenceDiagram or stateDiagram). Keep it to about 8 nodes.", input_schema: obj({ mermaid: { type: "string" }, caption: { type: "string" } }, ["mermaid", "caption"]) },
  { name: "find_resource", description: "Look up the verified link for a concept (by concept slug or name). Returns nothing if no verified link exists; never invent links.", input_schema: obj({ concept: { type: "string" } }, ["concept"]) },
  { name: "note_misconception", description: "Save what the learner got wrong about a concept, so later sessions and projects can address it. Short, factual, in third person.", input_schema: obj({ concept: { type: "string", description: "Concept slug or name" }, text: { type: "string" } }, ["text"]) },
  { name: "save_for_later", description: "Park an off-topic question in the learner's Later list. It never counts toward progress.", input_schema: obj({ text: { type: "string" } }, ["text"]) },
  { name: "suggest_next", description: "Find the learner's next unfinished step and the concepts that are ready to learn next.", input_schema: obj({}) },
];
const SHOW_CODE: ToolDef = {
  name: "show_code",
  description: "The learner pressed 'Show me code' for this turn. Call this before writing any code. Then write at most about 30 lines for the exact piece, in one fenced block, followed by a plain-words explanation. A bigger piece is given in parts.",
  input_schema: obj({ piece: { type: "string" }, language: { type: "string" }, part: { type: "integer" } }, ["piece", "language"]),
};

const Inputs = {
  get_step_context: z.object({}).passthrough(),
  get_learner_history: z.object({}).passthrough(),
  check_answer: z.object({ text: z.string().optional() }),
  give_help: z.object({ rung: z.enum(["hint", "example"]) }),
  draw_diagram: z.object({ mermaid: z.string().min(5).max(2000), caption: z.string().max(200) }),
  find_resource: z.object({ concept: z.string() }),
  note_misconception: z.object({ concept: z.string().optional(), text: z.string().min(3).max(500) }),
  save_for_later: z.object({ text: z.string().min(3).max(500) }),
  suggest_next: z.object({}).passthrough(),
  show_code: z.object({ piece: z.string(), language: z.string(), part: z.number().int().optional() }),
} as const;

export interface MentorInput {
  message: string;
  showCode?: boolean;
}

const json = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
const CODE = /```|^\s*(for|while|if|def|function|public|private|int|let|const|var|return)\b[^\n]*[({:=;]\s*$/m;

interface Ctx {
  learnerId: string;
  enrollmentId: string;
  stepId: string;
  language: string | null;
  showCode: boolean;
}

async function conceptBySlugOrName(s: string) {
  return one<{ id: string; slug: string; name: string }>(
    `select id, slug, name from concept where slug = $1 or lower(name) = lower($1) limit 1`, [s.trim()]
  );
}

async function runTool(c: Ctx, name: string, input: any): Promise<{ result: unknown; label: string; extra?: Record<string, unknown> }> {
  switch (name) {
    case "get_step_context": {
      const s = await one<any>(
        `select s.title, s.est_minutes, s.position, m.id as milestone_id, m.title as milestone, m.position as milestone_position, ch.title as project
           from step s join milestone m on m.id = s.milestone_id join challenge ch on ch.id = m.challenge_id where s.id = $1`, [c.stepId]
      );
      const t = await thinkTask(c.stepId);
      const build = await one<{ prompt: string }>(`select prompt from task where step_id = $1 and role = 'build'`, [c.stepId]);
      const hints = await rows<{ level: string; body: string }>(`select level, body from hint where step_id = $1 and language in ('', coalesce($2, ''))`, [c.stepId, c.language]);
      const concepts = await rows<{ id: string; slug: string; name: string; brief: string }>(
        `select c.id, c.slug, c.name, c.brief from milestone_concept mc join concept c on c.id = mc.concept_id where mc.milestone_id = $1 order by c.name`, [s.milestone_id]
      );
      const notes = c.language
        ? await rows(`select c.slug, n.body from language_note n join concept c on c.id = n.concept_id where n.concept_id = any($1) and n.language = $2`, [concepts.map((x) => x.id), c.language])
        : [];
      return {
        label: `Read step ${s.position} and ${concepts.length} concept briefs`,
        result: {
          project: s.project, milestone: `${s.milestone_position}. ${s.milestone}`, step: `${s.position}. ${s.title}`, est_minutes: s.est_minutes,
          think: t && { kind: t.kind, prompt: t.prompt, snippet: t.snippet, answer_key_for_steering_only: t.answer_key, rubric_for_steering_only: t.rubric },
          build: c.language ? build?.prompt ?? null : "hidden: the learner works concept-only",
          stored_help: hints, concepts: concepts.map(({ slug, name, brief }) => ({ slug, name, brief })), language: c.language, language_notes: notes,
        },
      };
    }
    case "get_learner_history": {
      const attempts = await rows<any>(
        `select a.attempt, a.body, a.grade, a.points, a.created_at from answer a join task t on t.id = a.task_id
          where a.enrollment_id = $1 and t.step_id = $2 order by a.created_at`, [c.enrollmentId, c.stepId]
      );
      const help = await rows(`select payload->>'level' as level, created_at from event where enrollment_id = $1 and step_id = $2 and type = 'help_given' order by id`, [c.enrollmentId, c.stepId]);
      const concepts = await rows(
        `select c.slug, c.name, coalesce(cs.status, 'new') as status from step s join milestone_concept mc on mc.milestone_id = s.milestone_id
           join concept c on c.id = mc.concept_id left join concept_state cs on cs.concept_id = c.id and cs.learner_id = $2 where s.id = $1`, [c.stepId, c.learnerId]
      );
      const mis = await rows(`select c.slug as concept, m.note, m.created_at from misconception m left join concept c on c.id = m.concept_id where m.learner_id = $1 order by m.created_at desc limit 8`, [c.learnerId]);
      const summaries = await rows<{ project: string; summary: string }>(
        `select ch.title as project, ss.summary from session_summary ss join enrollment en on en.id = ss.enrollment_id join challenge ch on ch.id = en.challenge_id
          where en.learner_id = $1 order by ss.created_at desc limit 3`, [c.learnerId]
      );
      return {
        label: attempts.length ? `Looked at your ${attempts.length} attempt${attempts.length === 1 ? "" : "s"}` : "Looked at your history (no attempts yet)",
        result: { attempts: attempts.map((a) => ({ ...a, body: String(a.body).slice(0, 800) })), help_used: help, concepts, misconceptions: mis, recent_session_summaries: summaries },
      };
    }
    case "check_answer": {
      const t = await thinkTask(c.stepId);
      const latest = await one<any>(
        `select a.attempt, a.grade, a.points, a.body from answer a join task t on t.id = a.task_id where a.enrollment_id = $1 and t.step_id = $2 order by a.created_at desc limit 1`,
        [c.enrollmentId, c.stepId]
      );
      const pending = await one(`select 1 from run where enrollment_id = $1 and step_id = $2 and kind = 'grade' and status in ('queued', 'running')`, [c.enrollmentId, c.stepId]);
      const dry = input.text && t && isKeyed(t) ? { would_match_key: dryKeyCheck(t, input.text), note: "Nothing recorded. The learner must submit it in the answer box for it to count." } : undefined;
      return { label: latest ? `Checked your latest answer (attempt ${latest.attempt})` : "Checked for a graded answer", result: { latest: latest ?? null, grading_in_progress: !!pending, dry_run: dry } };
    }
    case "give_help": {
      const h = await giveHelp(c.learnerId, c.enrollmentId, c.stepId, input.rung, "mentor", c.language);
      return { label: input.rung === "hint" ? "Gave the step's hint" : "Gave a similar case", result: { [input.rung]: h.body ?? "No stored text for this step; explain in your own words." } };
    }
    case "draw_diagram":
      return { label: "Drew a diagram", result: { shown: true }, extra: { mermaid: input.mermaid, caption: input.caption } };
    case "find_resource": {
      const con = await conceptBySlugOrName(input.concept);
      const r = con ? await one<{ title: string; url: string }>(`select title, url from resource where concept_id = $1 and http_status = 200 and verified_at is not null order by verified_at desc limit 1`, [con.id]) : null;
      return { label: r ? `Found a verified link for ${con!.name}` : "Looked for a verified link (none)", result: r ?? { none: true } };
    }
    case "note_misconception": {
      const con = input.concept ? await conceptBySlugOrName(input.concept) : null;
      await query(`insert into misconception (learner_id, concept_id, enrollment_id, note) values ($1, $2, $3, $4)`, [c.learnerId, con?.id ?? null, c.enrollmentId, input.text]);
      return { label: `Noted a misconception${con ? ` about ${con.name}` : ""}`, result: { saved: true } };
    }
    case "save_for_later": {
      await query(`insert into side_item (enrollment_id, kind, prompt, in_scope) values ($1, 'later', $2, false)`, [c.enrollmentId, input.text]);
      await query(`insert into event (learner_id, enrollment_id, type, step_id, payload) values ($1, $2, 'side_item_added', $3, $4)`, [c.learnerId, c.enrollmentId, c.stepId, JSON.stringify({ kind: "later" })]);
      return { label: "Saved a question to your Later list", result: { saved: true } };
    }
    case "suggest_next": {
      const next = await one(
        `select m.position as milestone, s.position as step, s.title from enrollment en join milestone m on m.challenge_id = en.challenge_id join step s on s.milestone_id = m.id
           left join step_state ss on ss.step_id = s.id and ss.enrollment_id = en.id where en.id = $1 and coalesce(ss.status, 'not_started') <> 'done'
          order by m.position, s.position limit 1`, [c.enrollmentId]
      );
      const ready = await rows(
        `select c.slug, c.name from enrollment en join v_challenge_concept vc on vc.challenge_id = en.challenge_id join concept c on c.id = vc.concept_id
           left join concept_state cs on cs.concept_id = c.id and cs.learner_id = en.learner_id
          where en.id = $1 and cs.explained_at is null
            and not exists (select 1 from concept_edge e left join concept_state p on p.concept_id = e.from_concept_id and p.learner_id = en.learner_id
                             where e.to_concept_id = c.id and e.type = 'prerequisite' and p.explained_at is null)
          order by c.name limit 5`, [c.enrollmentId]
      );
      return { label: "Looked at what comes next", result: { next_step: next ?? "every step is done", concepts_ready: ready } };
    }
    case "show_code": {
      if (!c.showCode) return { label: "Code is locked until you ask", result: { error: "Not available: the learner has not asked for code." } };
      await giveHelp(c.learnerId, c.enrollmentId, c.stepId, "code", "mentor_show_code", c.language);
      return {
        label: `Wrote code for ${input.piece} (you asked)`,
        result: { ok: true, rule: "At most about 30 lines in one fenced block, then explain it in plain words. If the piece is bigger, give this part and offer the next.", part: input.part ?? 1 },
      };
    }
  }
  return { label: `Unknown tool ${name}`, result: { error: "unknown tool" } };
}

async function mentorRun(ctx: RunContext) {
  const { run } = ctx;
  const input = run.input as MentorInput;
  const en = await one<{ language: string | null; support_level: string }>(`select language, support_level from enrollment where id = $1`, [run.enrollment_id]);
  const ss = await one<{ help_level: string }>(`select help_level from step_state where enrollment_id = $1 and step_id = $2`, [run.enrollment_id, run.step_id]);
  const c: Ctx = { learnerId: run.learner_id, enrollmentId: run.enrollment_id!, stepId: run.step_id!, language: en?.language ?? null, showCode: !!input.showCode };

  // Recent turns for this enrollment, oldest first. The learner's new message is already stored.
  const history = (await rows<{ role: string; body: string }>(
    `select role, body from (select id, role, body from message where enrollment_id = $1 order by id desc limit $2) t order by id`,
    [c.enrollmentId, HISTORY_TURNS]
  )).filter((m, i, a) => !(i === a.length - 1 && m.role === "learner")); // the latest learner turn is rebuilt below with the app state
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of history) {
    const role = m.role === "learner" ? "user" : "assistant";
    if (!messages.length && role === "assistant") continue;
    const last = messages[messages.length - 1];
    if (last?.role === role) last.content = `${last.content}\n\n${m.body}`;
    else messages.push({ role, content: m.body });
  }
  const state = `[App state, set by the learner's buttons, not by you] support level: ${en?.support_level}; help level on this step: ${ss?.help_level ?? "none"}; language: ${c.language ?? "none (ideas only)"}; code: ${c.showCode ? "UNLOCKED for this turn (the learner pressed Show me code)" : "locked, words only"}.`;
  const userTurn = `${state}\n\nLearner: ${input.message}`;
  messages.push({ role: "user", content: userTurn });

  const tools = toolsFor(c.showCode);
  let toolCalls = 0;
  let reply = "";
  let regenerated = false;
  const diagrams: Record<string, unknown>[] = [];

  // Text deltas are batched into run_event rows so a reload can replay them.
  let buf = "";
  let flushAt = 0;
  const flush = async () => { if (buf) { const d = buf; buf = ""; await ctx.emit("text", { delta: d }); } };

  for (let call = 0; call < MAX_MODEL_CALLS; call++) {
    await assertBudget(c.learnerId);
    const lastCall = call === MAX_MODEL_CALLS - 1 || toolCalls >= MAX_TOOL_CALLS;
    const stream = anthropic().beta.messages.stream({
      model: MENTOR_MODEL,
      max_tokens: MAX_TOKENS,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools,
      tool_choice: lastCall ? { type: "none" } : { type: "auto" },
      messages,
    });
    let turnText = "";
    let codeSeen = false;
    stream.on("text", (delta) => {
      turnText += delta;
      if (!c.showCode && !regenerated && CODE.test(turnText)) {
        codeSeen = true;
        stream.abort();
        return;
      }
      buf += delta;
      if (Date.now() > flushAt) { flushAt = Date.now() + 150; void flush(); }
    });
    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await stream.finalMessage();
    } catch (e) {
      if (!codeSeen) throw e;
      // Words-only turn started a code block: discard it and regenerate once with a reminder.
      regenerated = true;
      buf = "";
      await ctx.emit("text", { reset: true });
      await ctx.emit("trace", { label: "Rewrote a reply in words only" });
      const last = messages[messages.length - 1];
      const reminder = "[Harness] Your last reply started a code block. Code is locked for this turn. Answer again in words, analogies and small cases only.";
      if (typeof last.content === "string") last.content = `${last.content}\n\n${reminder}`;
      else (last.content as Anthropic.Beta.BetaContentBlockParam[]).push({ type: "text", text: reminder });
      continue;
    }
    await flush();
    await recordUsage({ learnerId: c.learnerId, enrollmentId: c.enrollmentId, purpose: "tutor", model: msg.model ?? MENTOR_MODEL }, msg.usage);

    if (msg.stop_reason === "refusal") {
      reply += turnText || "I can't help with that one. Try asking about the step in a different way.";
      break;
    }
    const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    reply += turnText;
    if (!uses.length || msg.stop_reason !== "tool_use") break;
    if (msg.stop_reason === "tool_use" && turnText) reply += "\n\n";

    messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      toolCalls++;
      const schema = Inputs[u.name as keyof typeof Inputs];
      const parsed = schema?.safeParse(u.input);
      if (!schema || !parsed?.success || toolCalls > MAX_TOOL_CALLS || (u.name === "show_code" && !c.showCode)) {
        const why = !schema ? "unknown tool" : toolCalls > MAX_TOOL_CALLS ? "tool call limit for this turn reached; answer now" : u.name === "show_code" ? "code is locked" : "invalid input";
        results.push({ type: "tool_result", tool_use_id: u.id, is_error: true, content: why });
        continue;
      }
      const out = await runTool(c, u.name, parsed.data);
      if (out.extra) diagrams.push(out.extra);
      await ctx.emit("trace", { tool: u.name, label: out.label, ...out.extra });
      results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out.result) });
    }
    messages.push({ role: "user", content: results });
  }

  // A second code block in a words-only turn is removed rather than shown.
  if (!c.showCode && CODE.test(reply)) {
    reply = reply.replace(/```[\s\S]*?(```|$)/g, "(code removed: press Show me code if you want it)");
    await ctx.emit("text", { reset: true });
    await ctx.emit("text", { delta: reply });
  }
  reply = reply.trim() || "I've looked at the step. What would you like to work through first?";
  await query(`insert into message (enrollment_id, step_id, role, body) values ($1, $2, 'assistant', $3)`, [c.enrollmentId, c.stepId, reply]);
  await summariseIfDue(c).catch((e) => console.error("[mentor summary]", e));
  return { reply, diagrams, toolCalls, regenerated, codeUnlocked: c.showCode };
}

// Memory across sessions: every 12 messages, a short summary of what the learner understood, struggled with
// and asked, kept in session_summary. get_learner_history returns the latest ones from all their projects.
async function summariseIfDue(c: Ctx) {
  const since = await one<{ covers_to: string | null }>(`select max(covers_to) as covers_to from session_summary where enrollment_id = $1`, [c.enrollmentId]);
  const msgs = await rows<{ role: string; body: string; created_at: string }>(
    `select role, body, created_at from message where enrollment_id = $1 and created_at > coalesce($2::timestamptz, '-infinity') order by id`,
    [c.enrollmentId, since?.covers_to ?? null]
  );
  if (msgs.length < 12) return;
  await assertBudget(c.learnerId);
  const res = await anthropic().messages.create({
    model: GRADER_MODEL,
    max_tokens: 1500,
    output_config: { effort: "low" },
    system: "Summarise a tutoring conversation for the tutor's own memory in at most 80 words: what the learner now understands, what they struggled with or got wrong, what kind of help worked, and open questions. Third person, plain words, no code.",
    messages: [{ role: "user", content: msgs.map((m) => `${m.role === "learner" ? "Learner" : "Mentor"}: ${m.body.slice(0, 1200)}`).join("\n\n") }],
  });
  await recordUsage({ learnerId: c.learnerId, enrollmentId: c.enrollmentId, purpose: "summarise", model: res.model ?? GRADER_MODEL }, res.usage);
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
  if (!text) return;
  await query(`insert into session_summary (enrollment_id, summary, covers_from, covers_to) values ($1, $2, $3, $4)`, [c.enrollmentId, text, msgs[0].created_at, msgs[msgs.length - 1].created_at]);
}

registerHandler("mentor", mentorRun);

/** The tool list for a turn. show_code exists only when the learner pressed "Show me code". */
export function toolsFor(showCode: boolean) {
  return showCode ? [...TOOLS, SHOW_CODE] : TOOLS;
}
export const looksLikeCode = (s: string) => CODE.test(s);
export { runTool as _runTool };
