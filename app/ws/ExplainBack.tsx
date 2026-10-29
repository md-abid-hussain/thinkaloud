"use client";
// A concept's explain-back (format 3): one open question, answered in the learner's own words, graded by rubric in
// the background. The grader's verbatim quotes are highlighted inside the answer. Met marks the concept explained.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { post, useRun } from "@/lib/client/useRun";
import AnswerBox from "./AnswerBox";
import { GradePill, Points } from "./Check";
import { Evidence } from "./evidence";
import { DisputeLink } from "./Dispute";
import type { GradedView, ResultPoint } from "./types";

interface Props {
  pcId: string;
  conceptId: string;
  slug: string;
  prompt: string;
  points: number;
  parts: { id: string; point: string }[] | null;
  latest: GradedView | null;
  runId: string | null;
  runBody: string | null;
}

export default function ExplainBack(p: Props) {
  const router = useRouter();
  const [runId, setRunId] = useState(p.runId);
  const [body, setBody] = useState<string | null>(p.runBody);
  const [draft, setDraft] = useState("");
  const [parts, setParts] = useState<string[]>(p.parts ? p.parts.map(() => "") : []);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState(!p.latest && !p.runId);
  const run = useRun<{ grade: "met" | "partial" | "not_yet"; points: ResultPoint[]; feedback: string; followup: string | null; answerId: string }>(runId, () => router.refresh());

  // Opening the concept counts as reading its lesson.
  useEffect(() => {
    post(`/api/concepts/${p.conceptId}/seen`, { slug: p.slug }).catch(() => {});
  }, [p.conceptId, p.slug]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const submit = async () => {
    const text = p.parts ? parts.map((x) => x.trim()).filter(Boolean).join("\n\n") : draft.trim();
    if (!text) return setErr("Write or say your answer first.");
    setErr(null);
    try {
      const r = await post<{ runId: string }>(`/api/explain/${p.pcId}`, { body: text });
      setBody(text);
      setRunId(r.runId);
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const live = run.result && run.status === "done" ? run.result : null;
  const shown = live
    ? { body: body ?? "", grade: live.grade, points: live.points, feedback: live.feedback, followup: live.followup, answerId: live.answerId, disputed: false }
    : p.latest && !runId
      ? { body: p.latest.body, grade: p.latest.grade, points: p.latest.points ?? [], feedback: p.latest.feedback, followup: p.latest.followup, answerId: p.latest.answerId, disputed: p.latest.disputed }
      : null;
  const checking = runId && (run.status === "queued" || run.status === "running");
  const paused = runId && (run.status === "paused" || run.status === "failed");

  return (
    <section className="explain" aria-labelledby="eb-h">
      <p className="label"><b>Explain it back</b> · {p.points} points · in your own words</p>
      <h2 id="eb-h" className="eb-q">{p.prompt}</h2>

      {editing && !checking && (
        <>
          {p.parts ? (
            p.parts.map((part, i) => (
              <div key={part.id} className="part">
                <p className="fine">{i + 1}. {part.point}</p>
                <AnswerBox id={`part-${i}`} label={`Part ${i + 1}`} value={parts[i]} autoFocus={i === 0}
                  onChange={(v) => setParts(parts.map((x, j) => (j === i ? v : x)))} onSubmit={submit} />
              </div>
            ))
          ) : (
            <AnswerBox id="explain" label="Your answer" value={draft} onChange={setDraft} onSubmit={submit} autoFocus
              actions={<button type="button" className="btn btn-primary" onClick={submit}>Check my answer</button>} />
          )}
          {p.parts && <div className="acts"><button type="button" className="btn btn-primary" onClick={submit}>Check my answer</button></div>}
          {err && <p className="err" role="alert">{err}</p>}
        </>
      )}

      {(checking || paused) && (
        <div className="verdict wait">
          <p className="who"><GradePill grade={paused ? "paused" : "checking"} /></p>
          {body && <p className="you">{body}</p>}
          {checking && <p className="fine">{run.traces.at(-1)?.label ?? "Checking your answer against the points…"} You can leave this page; the result will be here.</p>}
          {paused && (
            <>
              <p>{run.error?.message ?? "Grading is paused."} Your answer is saved.</p>
              <div className="acts">
                <button type="button" className="btn btn-primary" onClick={async () => { await post(`/api/runs/${runId}/retry`).catch(() => {}); setRunId(null); setTimeout(() => setRunId(runId), 0); }}>Try grading again</button>
                <button type="button" className="btn btn-ghost" onClick={() => { setRunId(null); setEditing(true); setDraft(body ?? ""); }}>Edit my answer</button>
              </div>
            </>
          )}
        </div>
      )}

      {shown && !checking && !paused && !editing && (
        <div className="result">
          <p className="who">You</p>
          <p className="you"><Evidence body={shown.body} points={shown.points} /></p>
          <p className="who">Check · {shown.points.filter((x) => x.met).length} of {shown.points.length} points <GradePill grade={shown.grade} /></p>
          <Points points={shown.points} />
          <div className={`verdict ${shown.grade === "met" ? "ok" : ""}`}>
            {shown.grade === "met" ? <p><b>Explained.</b> {shown.feedback}</p> : <p>{shown.feedback}</p>}
            {shown.grade !== "met" && shown.followup && <p><i>{shown.followup}</i></p>}
            <div className="acts">
              {shown.grade !== "met" && <button type="button" className="btn btn-primary" onClick={() => { setDraft(shown.body); setEditing(true); }}>Add to my answer</button>}
              <button type="button" className="btn btn-ghost" onClick={() => { setDraft(""); setEditing(true); }}>Answer again</button>
              <DisputeLink answerId={shown.answerId} missed={shown.points.filter((x) => !x.met).map((x) => x.point)} disputed={shown.disputed} onToast={setToast} />
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </section>
  );
}
