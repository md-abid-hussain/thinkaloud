"use client";
// The step as a transcript: the Think prompt, the learner's answer, the check, then the help ladder and the Build fold.
// Predict and trace answers are checked by key at once. Explain and spot-the-bug answers start a grade run the
// learner can leave; coming back follows the same run.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { post } from "@/lib/client/useRun";
import AnswerBox, { Wave } from "./AnswerBox";
import { GradePill, Points, RunTurn, Ts, YouTurn } from "./Check";
import { DisputeLink } from "./Dispute";
import { useFollow } from "./hooks";
import { shownFromLatest, type GradeResult, type Shown, type StepData } from "./types";
import { useWs } from "./Workspace";

const KIND: Record<string, { t: string; ph: string }> = {
  predict: { t: "Predict the output", ph: "Say what it reports, and why" },
  trace: { t: "Trace it", ph: "Walk through it in order, and say what each part gives" },
  spot_bug: { t: "Spot the bug", ph: "Name each problem, and say what you would change" },
  explain: { t: "Explain in words", ph: "Explain it in your own words" },
};

type Rung = "hint" | "example" | "code";
interface Card { kind: Rung; body: string | null | undefined }

export default function StepPane({ data }: { data: StepData }) {
  const router = useRouter();
  const ws = useWs();
  const { project, milestone: ms, step, think } = data;
  const keyed = think?.gradedBy === "key";
  const base = `/projects/${project.slug}`;
  const sameM = !!data.next && data.next.m === ms.position;
  const nextHref = sameM ? `${base}/m/${ms.position}/s/${data.next!.s}` : `${base}/m/${ms.position}/explain`;
  const nextLabel = sameM ? `Go to step ${ms.position}.${data.next!.s}` : `Explain milestone ${ms.position} back`;

  const [phase, setPhase] = useState<"answer" | "checking" | "shown">(data.runId ? "checking" : data.latest ? "shown" : "answer");
  const [shown, setShown] = useState<Shown | null>(shownFromLatest(data.latest));
  const [runId, setRunId] = useState<string | null>(data.runId);
  const [pending, setPending] = useState<{ body: string; at: number; spoke: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [spoke, setSpoke] = useState(0);
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(data.wrongTries);
  const [card, setCard] = useState<Card | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [moreOpen, setMoreOpen] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const got = useRef<Partial<Record<Rung, string | null>>>({});
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const moreRef = useRef<HTMLSpanElement>(null);
  const tries = Math.max(wrong, data.wrongTries);

  // Log step_started once on open.
  useEffect(() => { post(`/api/steps/${step.id}/start`).catch(() => {}); }, [step.id]);

  // A run from an earlier visit: its answer text was kept in this tab, if it was sent from here.
  useEffect(() => {
    if (!data.runId || pending) return;
    try {
      const body = data.runBody ?? sessionStorage.getItem(`ta-run-${data.runId}`);
      if (body) setPending({ body, at: Date.now(), spoke: 0 });
    } catch {}
  }, [data.runId, pending]);

  const afterGrade = (grade: string) => {
    if (grade === "met") return;
    setWrong((w) => Math.max(w, data.wrongTries) + 1);
    if (data.enrollment.supportLevel === "guided" && data.help.hint) openHelp("hint");
  };

  const run = useFollow<GradeResult>(phase === "checking" ? runId : null, (st) => {
    if (st.status === "done" && st.result) {
      const r = st.result;
      setShown({
        body: pending?.body ?? draft, grade: r.grade, by: "model", points: r.points, feedback: r.feedback, followup: r.followup,
        answerId: r.answerId, disputed: false, at: Date.now(), spoke: pending?.spoke ?? 0,
      });
      setPhase("shown");
      afterGrade(r.grade);
      router.refresh();
    }
  });
  // A result for a run sent from another tab has no local text: take it from the stored answer once it arrives.
  useEffect(() => {
    const l = data.latest;
    if (l && shown && !shown.body && l.answerId === shown.answerId) setShown({ ...shown, body: l.body });
  }, [data.latest, shown]);
  const stopped = run.status === "paused" || run.status === "failed";
  useEffect(() => { ws.setGradingPaused(phase === "checking" && stopped); }, [phase, stopped, ws]);

  // Close More help on Escape or a click outside it.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMoreOpen(false); (moreRef.current?.querySelector("button") as HTMLElement | null)?.focus(); } };
    const onClick = (e: MouseEvent) => { if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick); };
  }, [moreOpen]);

  async function openHelp(kind: Rung, via?: "not_sure") {
    setMoreOpen(false);
    if (kind === "code") { setCard({ kind, body: null }); return; }
    if (card?.kind === kind && !via) { setCard(null); return; }
    if (kind in got.current) { setCard({ kind, body: got.current[kind] }); return; }
    setCard({ kind, body: undefined });
    try {
      const r = await post<{ body: string | null }>(`/api/steps/${step.id}/help`, { rung: via ?? kind });
      got.current[kind] = r.body;
      setCard({ kind, body: r.body });
      router.refresh();
    } catch (e) {
      setCard(null);
      ws.toast((e as Error).message);
    }
  }

  async function unlockCode() {
    try {
      await post(`/api/steps/${step.id}/help`, { rung: "code" });
      ws.setCodeUnlocked(true);
      if (!ws.askDraft.trim()) ws.setAskDraft("Show me code for this step.");
      setCard(null);
      ws.focusAsk();
      router.refresh();
    } catch (e) {
      ws.toast((e as Error).message);
    }
  }

  async function check() {
    const body = draft.trim();
    if (!body) { ws.toast("Say or type your answer first."); answerRef.current?.focus(); return; }
    if (busy) return;
    setBusy(true);
    try {
      const r = await post<{ mode: "key"; grade: "met" | "not_yet"; answerId: string } | { mode: "run"; runId: string }>(`/api/steps/${step.id}/answer`, { body });
      if (r.mode === "key") {
        setShown({ body, grade: r.grade, by: "key", points: null, feedback: null, followup: null, answerId: r.answerId, disputed: false, at: Date.now(), spoke });
        setPhase("shown");
        afterGrade(r.grade);
      } else {
        try { sessionStorage.setItem(`ta-run-${r.runId}`, body); } catch {}
        setPending({ body, at: Date.now(), spoke });
        setRunId(r.runId);
        setPhase("checking");
      }
      setSpoke(0);
      router.refresh();
    } catch (e) {
      ws.toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const edit = (text: string) => {
    setDraft(text);
    setPhase("answer");
    setTimeout(() => {
      const el = answerRef.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 0);
  };

  const unsure = () => openHelp("hint", "not_sure");
  const kind = KIND[think?.kind ?? "explain"] ?? KIND.explain;
  const snippetLines = think?.snippet ? think.snippet.replace(/\n$/, "").split("\n").length : 0;

  // Event-driven offers: a hint after the first wrong or partial attempt, a similar case after the second.
  // Independent gets help only when asked.
  const offer = phase === "shown" && shown && shown.grade !== "met" && !card && data.enrollment.supportLevel !== "independent"
    ? tries >= 2 && data.help.example && !dismissed.example ? "example" as const
      : tries >= 1 && data.help.hint && !dismissed.hint ? "hint" as const : null
    : null;

  function checkTurn(s: Shown) {
    const total = s.points?.length ?? 0;
    const met = s.points?.filter((p) => p.met).length ?? 0;
    const missed = s.points?.filter((p) => !p.met).map((p) => p.point) ?? [];
    return (
      <>
        <Ts at={s.at} />
        <div className="turn">
          <p className="who">Check · {s.by === "key" ? "answer key" : `${met} of ${total} points`} <GradePill grade={s.grade} /></p>
          {s.points && <Points points={s.points} />}
          {s.grade === "met" ? (
            <div className="verdict ok">
              <p><b>Step done.</b> {s.feedback ?? (s.by === "key" ? "That matches the answer key." : "Every point is in your own words.")}{!sameM && " Next, explain the milestone back in your own words."}</p>
            </div>
          ) : s.grade === "partial" ? (
            <div className="verdict">
              <p><b>Almost.</b> {s.feedback ?? `${met} of ${total} points came through.`}</p>
              {s.followup && <p>{s.followup}</p>}
            </div>
          ) : (
            <div className="verdict">
              <p><b>{s.by === "key" ? "Not yet." : met ? `${met} of ${total} points came through.` : "None of the points came through yet."}</b> {s.feedback ?? (s.by === "key" ? "That doesn't match the answer key." : "")}</p>
              <p>Try again, or press I&apos;m not sure for a hint. There&apos;s no limit on tries.</p>
            </div>
          )}
          <div className="next">
            {s.grade === "met" ? (
              <Link className="btn btn-primary" href={nextHref}>{nextLabel}</Link>
            ) : (
              <>
                <button type="button" className="btn btn-primary" onClick={() => edit(s.grade === "partial" ? s.body + " " : s.body)}>{s.grade === "partial" ? "Add to my answer" : "Try again"}</button>
                <button type="button" className="btn btn-ghost" onClick={unsure}>I&apos;m not sure</button>
              </>
            )}
            <DisputeLink key={s.answerId} answerId={s.answerId} missed={missed} disputed={s.disputed} onToast={ws.toast} />
          </div>
          {offer && (
            <div className="offer">
              <span className="fine">{offer === "hint" ? "Want a hint? It's in words, not code." : "Want a similar case? It's not your code."}</span>
              <button type="button" className="rung" onClick={() => openHelp(offer)}><span className="lv">{offer === "hint" ? 1 : 2}</span>{offer === "hint" ? "Show the hint" : "Show a similar case"}</button>
              <button type="button" className="rung" onClick={() => setDismissed({ ...dismissed, [offer]: true })}>No thanks</button>
            </div>
          )}
        </div>
      </>
    );
  }

  const nextLink = <Link className="btn btn-ghost" href={sameM ? nextHref : `${base}/m/${ms.position}/explain`}>{sameM ? "Go to the next step" : "Go to Explain it back"}</Link>;
  const youBody = phase === "checking" ? pending?.body ?? null : shown?.body ?? null;

  return (
    <>
      <div className="step-h">
        <p className="label"><b>Milestone {ms.position}</b> · step {step.position} of {ms.steps}</p>
        <h1>{step.title}</h1>
        <ul className="kind">
          <li>{kind.t}</li>
          <li>about {step.estMinutes} min</li>
          <li>{keyed ? "Checked at once against an answer key" : "Graded by rubric, with your words as evidence"}</li>
        </ul>
      </div>

      <div className="tx">
        <Ts at={openedAt} />
        <div className="turn">
          <p className="who">Prompt</p>
          <p className="q">{think?.prompt ?? "This step has no question yet."}</p>
          {think?.snippet && (
            <div className="snippet">
              <div className="cap"><span className="label">Read this, don&apos;t copy it</span><span className="fine">{snippetLines} {snippetLines === 1 ? "line" : "lines"}</span></div>
              <pre>{think.snippet.replace(/\n$/, "")}</pre>
            </div>
          )}
        </div>

        {phase === "answer" && (
          <>
            <Ts at={null} />
            <div className="turn">
              <p className="who">You · speak or type <Wave heights={[4, 4, 4, 4]} /></p>
              <AnswerBox id="answer" label="Your answer" value={draft} onChange={setDraft} onSubmit={check} placeholder={kind.ph} autoFocus inputRef={answerRef}
                busy={busy} onDictated={setSpoke}
                actions={<>
                  <button type="button" className="btn btn-ghost" onClick={unsure}>I&apos;m not sure</button>
                  <button type="button" className="btn btn-primary" onClick={check} disabled={busy}>Check my answer</button>
                </>} />
            </div>
          </>
        )}

        {phase !== "answer" && youBody !== null && (
          <YouTurn at={phase === "checking" ? pending?.at ?? null : shown!.at} body={youBody}
            points={phase === "shown" ? shown!.points : null} spoke={phase === "checking" ? pending?.spoke ?? 0 : shown!.spoke}
            onEdit={phase === "checking" && !stopped ? undefined : () => edit(youBody)} />
        )}

        {phase === "checking" && (
          <RunTurn at={pending?.at ?? null} status={run.status} traces={run.traces} error={run.error} next={nextLink}
            onRetry={() => run.retry().catch((e) => ws.toast((e as Error).message))} />
        )}
        {phase === "checking" && youBody === null && stopped && (
          <><span className="ts" /><div className="turn"><p className="fine">Your earlier answer is waiting to be graded. <button type="button" className="linkbtn" onClick={() => edit("")}>Write a new answer</button></p></div></>
        )}

        {phase === "shown" && shown && checkTurn(shown)}
      </div>

      <div className="help">
        <p className="label">Help, from least to most</p>
        <div className="ladder">
          {data.help.hint && <button type="button" className="rung" aria-expanded={card?.kind === "hint"} onClick={() => openHelp("hint")}><span className="lv">1</span>Hint</button>}
          {data.help.example && <button type="button" className="rung" aria-expanded={card?.kind === "example"} onClick={() => openHelp("example")}><span className="lv">2</span>Similar case</button>}
          <button type="button" className="rung" onClick={ws.focusAsk}><span className="lv">3</span>Ask the mentor</button>
          <span className="more" ref={moreRef}>
            <button type="button" className="rung" aria-expanded={moreOpen} aria-haspopup="true" onClick={(e) => { e.stopPropagation(); setMoreOpen(!moreOpen); }}>More help</button>
            {moreOpen && (
              <span className="more-menu">
                <button type="button" autoFocus onClick={() => openHelp("code")}>Show me code<small>Code for this exact piece, in short explained parts</small></button>
              </span>
            )}
          </span>
        </div>
        <div aria-live="polite">
          {card?.kind === "hint" && (
            <div className="hcard swap">
              <p className="label"><b>Hint</b></p>
              <p>{card.body === undefined ? "Getting the hint…" : card.body ?? "There's no stored hint for this step. Ask the mentor to put the question another way."}</p>
              <p className="fine">Counted as help used. Try again whenever you&apos;re ready.</p>
            </div>
          )}
          {card?.kind === "example" && (
            <div className="hcard swap">
              <p className="label"><b>Similar case</b> · not your code</p>
              <p>{card.body === undefined ? "Getting a similar case…" : card.body ?? "There's no stored similar case for this step. Ask the mentor for one."}</p>
              <p className="fine">Noted in your help log. You still explain the idea back yourself.</p>
            </div>
          )}
          {card?.kind === "code" && (
            <div className="hcard code swap" role="group" aria-label="Show me code">
              <p className="label"><b>Show me code</b> · only because you asked</p>
              <p>The mentor will write code for this exact piece{data.enrollment.language ? ` in ${data.enrollment.language}` : ""}, in short explained parts of about 30 lines, for you to read and type. It&apos;s noted in your help log, and you still explain the idea back in your own words.</p>
              <div className="acts">
                <button type="button" className="btn btn-primary btn-sm" onClick={unlockCode}>Show me code</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCard(null)}>Not now</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {data.build && (
        <details className="build">
          <summary>Build it in {data.enrollment.language} · optional</summary>
          <p>{data.build}</p>
          <p className="fine">Checked on your machine, not here. The step finishes on your {keyed ? "answer" : "explanation"}.</p>
        </details>
      )}
    </>
  );
}
