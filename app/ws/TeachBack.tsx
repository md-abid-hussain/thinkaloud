"use client";
// Teach-back: the workspace state that closes a milestone. One open question (or, in Guided, one box per part),
// graded by rubric with quotes; each met point marks its idea explained. A partial answer gets one follow-up.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { post } from "@/lib/client/useRun";
import AnswerBox, { Wave } from "./AnswerBox";
import { GradePill, Points, RunTurn, Ts, YouTurn } from "./Check";
import { DisputeLink } from "./Dispute";
import { useFollow } from "./hooks";
import { shownFromLatest, type GradeResult, type Shown, type TeachData } from "./types";
import { useWs } from "./Workspace";

export default function TeachBack({ data }: { data: TeachData }) {
  const router = useRouter();
  const ws = useWs();
  const { project, milestone: ms, question: q } = data;
  const base = `/projects/${project.slug}`;
  const parts = q.parts;
  const nextM = data.milestones.find((m) => m.position === ms.position + 1);
  const thisM = data.milestones.find((m) => m.position === ms.position);
  const todo = thisM?.steps.find((s) => s.status !== "done");
  const conceptName = (slug: string | null) => (slug ? q.concepts.find((c) => c.slug === slug)?.name ?? slug : null);

  const [phase, setPhase] = useState<"answer" | "checking" | "shown">(data.runId ? "checking" : data.latest ? "shown" : "answer");
  const [shown, setShown] = useState<Shown | null>(shownFromLatest(data.latest));
  const [followupUsed, setFollowupUsed] = useState(data.followupUsed);
  const [understood, setUnderstood] = useState(data.understood);
  const [runId, setRunId] = useState<string | null>(data.runId);
  const [pending, setPending] = useState<{ body: string; at: number; spoke: number; followupOf: string | null } | null>(null);
  const [draft, setDraft] = useState("");
  const [partDrafts, setPartDrafts] = useState<string[]>(parts ? parts.map(() => "") : []);
  const [adding, setAdding] = useState(false);
  const [addition, setAddition] = useState("");
  const [spoke, setSpoke] = useState(0);
  const [busy, setBusy] = useState(false);
  const [unsure, setUnsure] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const firstRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!data.runId || pending) return;
    try {
      const body = data.runBody ?? sessionStorage.getItem(`ta-run-${data.runId}`);
      if (body) setPending({ body, at: Date.now(), spoke: 0, followupOf: null });
    } catch {}
  }, [data.runId, pending]);
  useEffect(() => {
    const l = data.latest;
    if (l && shown && !shown.body && l.answerId === shown.answerId) setShown({ ...shown, body: l.body });
  }, [data.latest, shown]);
  useEffect(() => { if (data.understood) setUnderstood(true); }, [data.understood]);

  const run = useFollow<GradeResult>(phase === "checking" ? runId : null, (st) => {
    if (st.status === "done" && st.result) {
      const r = st.result;
      setShown({
        body: pending?.body ?? "", grade: r.grade, by: "model", points: r.points, feedback: r.feedback, followup: r.followup,
        answerId: r.answerId, disputed: false, at: Date.now(), spoke: pending?.spoke ?? 0,
      });
      if (pending?.followupOf) setFollowupUsed(true);
      else setFollowupUsed(false);
      if (r.understood) setUnderstood(true);
      setPhase("shown");
      setAdding(false);
      router.refresh();
    }
  });
  const stopped = run.status === "paused" || run.status === "failed";
  useEffect(() => { ws.setGradingPaused(phase === "checking" && stopped); }, [phase, stopped, ws]);

  async function send(body: string, followupOf: string | null) {
    if (!body.trim()) { ws.toast("Say or type your answer first."); return; }
    if (busy) return;
    setBusy(true);
    try {
      const r = await post<{ runId: string }>(`/api/teachback/${q.id}`, followupOf ? { body, followupOf } : { body });
      try { sessionStorage.setItem(`ta-run-${r.runId}`, body); } catch {}
      setPending({ body, at: Date.now(), spoke, followupOf });
      setRunId(r.runId);
      setPhase("checking");
      setSpoke(0);
      router.refresh();
    } catch (e) {
      ws.toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const submitFresh = () => send(parts ? partDrafts.map((p) => p.trim()).filter(Boolean).join("\n\n") : draft.trim(), null);
  const submitAddition = () => {
    if (!shown) return;
    if (!addition.trim()) { ws.toast("Add a sentence first."); return; }
    send(`${shown.body.trim()}\n\n${addition.trim()}`, shown.answerId);
  };

  const edit = (text: string) => {
    if (parts) setPartDrafts(parts.map((_, i) => (i === 0 ? text : "")));
    else setDraft(text);
    setPhase("answer");
    setUnsure(false);
    setTimeout(() => firstRef.current?.focus(), 0);
  };

  const youBody = phase === "checking" ? pending?.body ?? null : shown?.body ?? null;
  const canFollowUp = shown?.grade === "partial" && !followupUsed;

  function verdict(s: Shown) {
    const met = s.points?.filter((p) => p.met) ?? [];
    const missing = s.points?.filter((p) => !p.met) ?? [];
    const names = (list: typeof met) => [...new Set(list.map((p) => conceptName(p.concept)).filter(Boolean))].join(", ");
    if (s.grade === "met") {
      return (
        <>
          <div className="verdict ok">
            {understood
              ? <p><b>Milestone {ms.position} understood.</b> {s.feedback ?? "Every point is in your own words."}</p>
              : <p><b>Every point is in your own words.</b> The milestone closes when its steps are done too.</p>}
          </div>
          <div className="next">
            {understood
              ? nextM ? <Link className="btn btn-primary" href={`${base}/m/${nextM.position}/s/1`}>Start milestone {nextM.position}</Link> : <Link className="btn btn-primary" href={`${base}/home`}>Go to the project home</Link>
              : todo ? <Link className="btn btn-primary" href={`${base}/m/${ms.position}/s/${todo.position}`}>Go to step {ms.position}.{todo.position}</Link> : <Link className="btn btn-primary" href={`${base}/home`}>Go to the project home</Link>}
            <DisputeLink key={s.answerId} answerId={s.answerId} missed={[]} disputed={s.disputed} onToast={ws.toast} />
          </div>
        </>
      );
    }
    return (
      <>
        <div className="verdict">
          <p>
            <b>{met.length ? `${met.length} ${met.length === 1 ? "idea" : "ideas"} explained.` : "None of the points came through yet."}</b>{" "}
            {missing.length > 0 && `${names(missing)} ${missing.length === 1 ? "isn't" : "aren't"} covered yet.`}
          </p>
          {s.feedback && <p>{s.feedback}</p>}
          {canFollowUp && <p>{s.followup ?? "Add what's missing to your answer."}</p>}
          {!canFollowUp && <p>Try again, or press I&apos;m not sure. There&apos;s no limit on tries.</p>}
        </div>
        {adding ? (
          <div className="addon">
            <AnswerBox id="addition" label="Add to your answer" value={addition} onChange={setAddition} onSubmit={submitAddition} autoFocus onDictated={setSpoke}
              placeholder="Add a sentence or two" busy={busy}
              actions={<>
                <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={submitAddition} disabled={busy}>Check my answer</button>
              </>} />
          </div>
        ) : (
          <div className="next">
            {canFollowUp
              ? <button type="button" className="btn btn-primary" onClick={() => { setAdding(true); setAddition(""); }}>Add to my answer</button>
              : <button type="button" className="btn btn-primary" onClick={() => edit(s.body)}>Try again</button>}
            <button type="button" className="btn btn-ghost" onClick={() => setUnsure(true)}>I&apos;m not sure</button>
            <DisputeLink key={s.answerId} answerId={s.answerId} missed={missing.map((p) => p.point)} disputed={s.disputed} onToast={ws.toast} />
          </div>
        )}
      </>
    );
  }

  const unsureCard = unsure && (
    <div className="hcard swap">
      <p className="label"><b>Where to look</b></p>
      <p>This covers {q.concepts.map((c) => c.name).join(", ")}. Each step in this milestone worked on one of them. Reopen a step in the rail, or ask the mentor to put the question another way.</p>
      <div className="acts"><button type="button" className="btn btn-ghost btn-sm" onClick={ws.focusAsk}>Ask the mentor</button></div>
    </div>
  );

  return (
    <>
      <div className="step-h">
        <p className="label"><b>Milestone {ms.position}</b> · explain it back</p>
        <h1>Explain milestone {ms.position} back</h1>
        <ul className="kind">
          <li>{q.concepts.length} {q.concepts.length === 1 ? "idea" : "ideas"}</li>
          {parts && <li>In {parts.length} parts</li>}
          <li>All points needed</li>
          <li>Speak or type</li>
        </ul>
      </div>

      <div className="tx">
        <Ts at={openedAt} />
        <div className="turn">
          <p className="who">Prompt</p>
          <p className="q">{q.prompt}</p>
        </div>

        {phase === "answer" && (
          <>
            <Ts at={null} />
            <div className="turn">
              <p className="who">You · speak or type <Wave heights={[4, 4, 4, 4]} /></p>
              {parts ? (
                <ol className="parts">
                  {parts.map((p, i) => (
                    <li key={p.id}>
                      <p className="label"><b>Part {i + 1}</b> of {parts.length}</p>
                      <p className="pq">{p.point}</p>
                      <AnswerBox id={`part-${i}`} label={`Part ${i + 1}`} value={partDrafts[i]} autoFocus={i === 0} inputRef={i === 0 ? firstRef : undefined}
                        onChange={(v) => setPartDrafts(partDrafts.map((x, j) => (j === i ? v : x)))} onSubmit={submitFresh} onDictated={setSpoke}
                        placeholder="Say it in your own words"
                        actions={i === parts.length - 1 ? <>
                          <button type="button" className="btn btn-ghost" onClick={() => setUnsure(true)}>I&apos;m not sure</button>
                          <button type="button" className="btn btn-primary" onClick={submitFresh} disabled={busy}>Check my answer</button>
                        </> : undefined} />
                    </li>
                  ))}
                </ol>
              ) : (
                <AnswerBox id="answer" label="Your answer" value={draft} onChange={setDraft} onSubmit={submitFresh} autoFocus inputRef={firstRef} onDictated={setSpoke}
                  placeholder="Explain it as you would to a friend" busy={busy}
                  actions={<>
                    <button type="button" className="btn btn-ghost" onClick={() => setUnsure(true)}>I&apos;m not sure</button>
                    <button type="button" className="btn btn-primary" onClick={submitFresh} disabled={busy}>Check my answer</button>
                  </>} />
              )}
              {unsureCard}
            </div>
          </>
        )}

        {phase !== "answer" && youBody !== null && (
          <YouTurn at={phase === "checking" ? pending?.at ?? null : shown!.at} body={youBody}
            points={phase === "shown" ? shown!.points : null} spoke={phase === "checking" ? pending?.spoke ?? 0 : shown!.spoke}
            onEdit={phase === "checking" && !stopped ? undefined : () => edit(youBody)} />
        )}

        {phase === "checking" && (
          <RunTurn at={pending?.at ?? null} status={run.status} traces={run.traces} error={run.error}
            next={<Link className="btn btn-ghost" href={nextM ? `${base}/m/${nextM.position}/s/1` : `${base}/home`}>{nextM ? "Go to the next step" : "Go to the project home"}</Link>}
            onRetry={() => run.retry().catch((e) => ws.toast((e as Error).message))} />
        )}
        {phase === "checking" && youBody === null && stopped && (
          <><span className="ts" /><div className="turn"><p className="fine">Your earlier answer is waiting to be graded. <button type="button" className="linkbtn" onClick={() => edit("")}>Write a new answer</button></p></div></>
        )}

        {phase === "shown" && shown && (
          <>
            <Ts at={shown.at} />
            <div className="turn">
              <p className="who">Check · {shown.points?.filter((p) => p.met).length ?? 0} of {shown.points?.length ?? q.points} points <GradePill grade={shown.grade} /></p>
              {shown.points && <Points points={shown.points} concept={conceptName} />}
              {verdict(shown)}
              {unsureCard}
            </div>
          </>
        )}
      </div>
    </>
  );
}
