"use client";
// "Restate the project in your own words": optional, graded by rubric, never blocks a step.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { post } from "@/lib/client/useRun";
import AnswerBox from "@/ws/AnswerBox";
import { GradePill, Points } from "@/ws/Check";
import { Evidence } from "@/ws/evidence";
import { useFollow } from "@/ws/hooks";
import type { GradeResult, GradedView, ResultPoint } from "@/ws/types";

interface Shown { body: string; grade: string; points: ResultPoint[] | null; feedback: string | null }

export default function Restate({ slug, latest, runId: initialRun, autoFocus }: { slug: string; latest: GradedView | null; runId: string | null; autoFocus?: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"answer" | "checking" | "shown">(initialRun ? "checking" : latest ? "shown" : "answer");
  const [shown, setShown] = useState<Shown | null>(latest ? { body: latest.body, grade: latest.grade, points: latest.points, feedback: null } : null);
  const [runId, setRunId] = useState(initialRun);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!initialRun || pending !== null) return;
    try { const b = sessionStorage.getItem(`ta-run-${initialRun}`); if (b) setPending(b); } catch {}
  }, [initialRun, pending]);

  const run = useFollow<GradeResult>(phase === "checking" ? runId : null, (st) => {
    if (st.status === "done" && st.result) {
      setShown({ body: pending ?? latest?.body ?? "", grade: st.result.grade, points: st.result.points, feedback: st.result.feedback });
      setPhase("shown");
      router.refresh();
    }
  });
  const stopped = run.status === "paused" || run.status === "failed";

  const send = async () => {
    const body = draft.trim();
    if (!body) { setErr("Say or type it first."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await post<{ runId: string }>("/api/restate", { slug, body });
      try { sessionStorage.setItem(`ta-run-${r.runId}`, body); } catch {}
      setPending(body);
      setRunId(r.runId);
      setPhase("checking");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (phase === "answer") {
    return (
      <div className="restate">
        <AnswerBox id="restate" label="Restate the project in your own words" value={draft} onChange={setDraft} onSubmit={send} autoFocus={autoFocus}
          placeholder="What does the tool do, and what would count as done?" busy={busy}
          actions={<button type="button" className="btn btn-primary" onClick={send} disabled={busy}>Check my words</button>} />
        {err && <p className="err">{err}</p>}
      </div>
    );
  }

  const body = phase === "checking" ? pending : shown?.body ?? null;
  const met = shown?.points?.filter((p) => p.met).length ?? 0;
  return (
    <div className="restate">
      {body && <p className="said"><Evidence body={body} points={phase === "shown" ? shown?.points ?? null : null} /></p>}
      {phase === "checking" ? (
        <>
          <p className="who">Check <GradePill grade={stopped ? "paused" : "checking"} /></p>
          {stopped ? (
            <>
              <div className="verdict paused"><p><b>Your words are saved.</b> {run.error?.message ?? "Grading needs the AI grader, which isn't responding right now."} You can start the steps anyway.</p></div>
              <div className="next"><button type="button" className="btn btn-ghost btn-sm" onClick={() => run.retry().catch((e) => setErr((e as Error).message))}>Try grading again</button></div>
            </>
          ) : (
            <div className="verdict paused"><p><b>Checking your words.</b> You can start the steps while it runs.</p></div>
          )}
        </>
      ) : shown && (
        <>
          <p className="who">Check · {met} of {shown.points?.length ?? 0} points <GradePill grade={shown.grade as "met"} /></p>
          {shown.points && <Points points={shown.points} />}
          {shown.feedback && <div className="verdict"><p>{shown.feedback}</p></div>}
          <div className="next"><button type="button" className="linkbtn" onClick={() => { setDraft(shown.body); setPhase("answer"); }}>Restate it again</button></div>
        </>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
