"use client";
// The mentor: an AI agent that helps only when asked. Each turn shows its tool calls first as trace lines,
// then the reply in italic. Code appears only on a turn the learner unlocked with "Show me code".
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { post, type TraceLine } from "@/lib/client/useRun";
import AnswerBox from "./AnswerBox";
import Diagram from "./Diagram";
import Markdown from "./Markdown";
import { useFollow } from "./hooks";
import type { StepData } from "./types";
import { useWs } from "./Workspace";

type Mentor = StepData["mentor"];
interface Live { runId: string; ask: string | null; baseId: number; showCode: boolean }

const ms = (d: unknown) => new Date(d as string).getTime();

export function Trace({ lines }: { lines: TraceLine[] }) {
  if (!lines.length) return null;
  return (
    <>
      <ul className="trace">
        {lines.map((l, i) => <li key={i}><span>{l.label}{l.tool && <> · <code>{l.tool}</code></>}</span></li>)}
      </ul>
      {lines.filter((l) => l.mermaid).map((l, i) => <Diagram key={i} code={l.mermaid!} caption={l.caption} />)}
    </>
  );
}

const EXAMPLES = [
  { t: "Explain the question another way", q: "Can you explain the question another way?" },
  { t: "Which idea is this about?", q: "Which idea is this step about, in plain words?" },
];

export default function MentorPanel({ stepId, mentor, quiet = false }: { stepId: string; mentor: Mentor | null; quiet?: boolean }) {
  const router = useRouter();
  const ws = useWs();
  const messages = useMemo(() => mentor?.messages ?? [], [mentor]);
  const lastId = messages.length ? Number(messages[messages.length - 1].id) : 0;
  const [live, setLive] = useState<Live | null>(mentor?.activeRunId ? { runId: mentor.activeRunId, ask: null, baseId: lastId, showCode: false } : null);
  const [busy, setBusy] = useState(false);

  const run = useFollow(live?.runId ?? null, (st) => {
    if (st.status === "done") { router.refresh(); ws.mentorNew(); }
  });

  // Traces grouped by run, and each stored reply matched to the run that wrote it (the latest run started before it).
  const turns = useMemo(() => {
    const byRun = new Map<string, TraceLine[]>();
    for (const t of mentor?.traces ?? []) {
      const d = (typeof t.data === "string" ? JSON.parse(t.data) : t.data) as TraceLine;
      byRun.set(t.run_id, [...(byRun.get(t.run_id) ?? []), d]);
    }
    const runs = [...(mentor?.runs ?? [])].sort((a, b) => ms(a.created_at) - ms(b.created_at));
    const used = new Set<string>();
    return messages.map((m) => {
      if (m.role !== "assistant") return { m, traces: [] as TraceLine[] };
      const r = runs.filter((x) => !used.has(x.id) && ms(x.created_at) <= ms(m.created_at)).pop();
      if (r) used.add(r.id);
      return { m, traces: r ? byRun.get(r.id) ?? [] : [] };
    });
  }, [mentor, messages]);

  const after = live ? messages.filter((m) => Number(m.id) > live.baseId) : [];
  const liveStored = after.some((m) => m.role === "assistant");
  const askStored = after.some((m) => m.role === "learner");
  useEffect(() => { if (live && liveStored) setLive(null); }, [live, liveStored]);

  const send = async () => {
    const message = ws.askDraft.trim();
    if (!message) { ws.toast("Ask a question first."); document.getElementById("ask-in")?.focus(); return; }
    const showCode = ws.codeUnlocked;
    setBusy(true);
    try {
      const r = await post<{ runId: string }>("/api/mentor", { stepId, message, showCode });
      setLive({ runId: r.runId, ask: message, baseId: lastId, showCode });
      ws.setAskDraft("");
      if (showCode) ws.setCodeUnlocked(false);
    } catch (e) {
      const err = e as Error & { status?: number; data?: { runId?: string } };
      if (err.status === 409 && err.data?.runId) setLive({ runId: err.data.runId, ask: null, baseId: lastId, showCode: false });
      ws.toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const showLive = live && !liveStored;
  const waiting = run.status === "queued" || run.status === "running";
  const stopped = run.status === "paused" || run.status === "failed";

  return (
    <>
      <div className="mentor-h">
        <p className="label"><b>Mentor</b> · AI agent</p>
        <h2>Ask when you want help</h2>
        <p>It reads your answers and the project notes, and uses tools you can see. It never writes your code unless you ask.</p>
      </div>
      <div className="convo" aria-live="polite">
        {quiet && (
          <div className="mt"><p className="idle">The mentor stays quiet while you explain back. Ask if you get stuck. Anything it gives you beyond a hint is noted in your help log.</p></div>
        )}
        {!quiet && ws.gradingPaused && !showLive && (
          <div className="mt"><p className="idle">The mentor may be paused too while the AI model isn&apos;t responding. Hints and similar cases still work, because they&apos;re stored with the step.</p></div>
        )}
        {turns.map(({ m, traces }) => (
          <div className="mt" key={m.id}>
            {m.role === "learner" ? (
              <><p className="who">You</p><p className="said">{m.body}</p></>
            ) : (
              <><p className="who">Mentor</p><Trace lines={traces} /><div className="reply"><Markdown text={m.body} allowCode /></div></>
            )}
          </div>
        ))}
        {showLive && (
          <>
            {live.ask && !askStored && <div className="mt swap"><p className="who">You</p><p className="said">{live.ask}</p></div>}
            <div className="mt swap">
              <p className="who">Mentor{live.showCode && <span className="pill soft">Code unlocked</span>}</p>
              <Trace lines={run.traces} />
              {run.text && <div className="reply"><Markdown text={run.text} allowCode={live.showCode} /></div>}
              {waiting && !run.text && <p className="idle thinking">Thinking…</p>}
              {stopped && (
                <div className="verdict paused">
                  <p><b>The mentor is paused.</b> {run.error?.message ?? "The AI model isn't responding right now."}</p>
                  <p>Hints and similar cases still work, because they&apos;re stored with the step.</p>
                  <div className="offer"><button type="button" className="btn btn-ghost btn-sm" onClick={() => run.retry().catch((e) => ws.toast((e as Error).message))}>Try asking again</button></div>
                </div>
              )}
            </div>
          </>
        )}
        {!quiet && !turns.length && !showLive && (
          <div className="mt">
            <p className="idle">Nothing yet. Ask about the question, an idea, or your own answer. It won&apos;t raise the help level by itself.</p>
            <div className="offer">
              {EXAMPLES.map((x) => <button key={x.t} type="button" className="rung" onClick={() => { ws.setAskDraft(x.q); document.getElementById("ask-in")?.focus(); }}>{x.t}</button>)}
            </div>
          </div>
        )}
      </div>
      <form className="ask" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {ws.codeUnlocked && <p className="fine unlocked">Code unlocked for your next message.</p>}
        <AnswerBox id="ask-in" label="Ask the mentor" variant="ask" value={ws.askDraft} onChange={ws.setAskDraft} onSubmit={send}
          placeholder={quiet ? "Ask if you get stuck" : "Ask about this step"}
          actions={<button type="submit" className="btn btn-ghost btn-sm" disabled={busy || waiting}>Ask</button>} />
      </form>
    </>
  );
}
