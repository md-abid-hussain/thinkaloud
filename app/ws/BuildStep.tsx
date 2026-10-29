"use client";
// A format 3 build step: what to build, the one checkable outcome, the concepts it uses, hints and the mentor.
// The app can't run the learner's code, so the learner ticks "Outcome met" when their build does what it says.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client/useRun";
import { useWs } from "./Workspace";
import Learn, { type LearnData } from "./Learn";
import { STATUS_WORD } from "./types";

type Rung = "hint" | "example";

export interface BuildStepData {
  slug: string;
  stepId: string;
  milestone: { position: number; title: string; steps: number };
  step: { position: number; title: string; estMinutes: number; status: string };
  build: string | null;
  outcome: string | null;
  concepts: { id: string; slug: string; name: string; brief: string; where: string; status: string }[];
  hints: { hint: boolean; example: boolean };
  language: LearnData;
  hasLanguage: boolean;
  next: { m: number; s: number } | null;
}

export default function BuildStep({ d }: { d: BuildStepData }) {
  const router = useRouter();
  const ws = useWs();
  const [help, setHelp] = useState<{ rung: Rung; body: string | null } | null>(null);
  const [confirmCode, setConfirmCode] = useState(false);
  const [done, setDone] = useState(d.step.status === "done");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    post(`/api/steps/${d.stepId}/start`).catch(() => {});
  }, [d.stepId]);

  const openHelp = async (rung: Rung) => {
    try {
      const r = await post<{ body: string | null }>(`/api/steps/${d.stepId}/help`, { rung });
      setHelp({ rung, body: r.body });
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const unlockCode = async () => {
    await post(`/api/steps/${d.stepId}/help`, { rung: "code" }).catch(() => {});
    ws.setCodeUnlocked(true);
    setConfirmCode(false);
    ws.focusAsk();
    ws.toast("Code is unlocked for your next question to the mentor.");
  };
  const outcomeMet = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await post<{ built: boolean }>(`/api/steps/${d.stepId}/outcome`);
      setDone(true);
      ws.toast(r.built ? `Milestone ${d.milestone.position} is built.` : "Outcome met. Its concepts are marked applied.");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const nextHref = d.next ? `/projects/${d.slug}/m/${d.next.m}/s/${d.next.s}` : `/projects/${d.slug}/home`;

  return (
    <>
      <div className="step-h">
        <p className="label"><b>Milestone {d.milestone.position} · {d.milestone.title}</b> · build step {d.step.position} of {d.milestone.steps}</p>
        <h1>{d.step.title}</h1>
        <ul className="kind">
          <li>Build</li>
          <li>about {d.step.estMinutes} min</li>
          <li>{d.hasLanguage ? "Done when you tick the outcome" : "Optional while you work ideas only"}</li>
        </ul>
      </div>

      <div className="build-card">
        <p className="label"><b>Build</b></p>
        <p>{d.build}</p>
      </div>

      <div className={`outcome-card${done ? " met" : ""}`}>
        <p className="label"><b>Outcome</b> · one check</p>
        <p>{d.outcome}</p>
        <div className="acts">
          {done ? (
            <>
              <span className="pill ok">Outcome met</span>
              <Link className="btn btn-primary" href={nextHref}>{d.next ? "Go to the next step" : "Back to the project"}</Link>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={outcomeMet} disabled={busy}>Outcome met</button>
          )}
        </div>
        {!done && <p className="fine">Run it on your machine. The app can&apos;t run your code, so this is your call.</p>}
        {err && <p className="err" role="alert">{err}</p>}
      </div>

      <div className="uses">
        <p className="label"><b>Concepts this step uses</b></p>
        <ul>
          {d.concepts.map((c) => (
            <li key={c.id}>
              <Link href={`/projects/${d.slug}/c/${c.slug}`}>{c.name}</Link> <span className={`st ${c.status}`}>{STATUS_WORD[c.status] ?? c.status}</span>
              <p className="fine">{c.where}</p>
            </li>
          ))}
        </ul>
      </div>

      <Learn data={d.language} concepts={d.concepts.map((c) => ({ id: c.id, name: c.name }))} open={false} />

      <div className="help" aria-label="Help">
        <p className="label"><b>Help</b> · least to most, never rationed</p>
        <div className="ladder-btns">
          {d.hints.hint && <button type="button" className="pillbtn" onClick={() => openHelp("hint")}>1 · Hint</button>}
          {d.hints.example && <button type="button" className="pillbtn" onClick={() => openHelp("example")}>2 · Similar case</button>}
          <button type="button" className="pillbtn" onClick={() => ws.focusAsk()}>3 · Ask the mentor</button>
          <button type="button" className="pillbtn" onClick={() => setConfirmCode(true)}>More help · Show me code</button>
        </div>
        {help && (
          <div className="hcard">
            <p className="label"><b>{help.rung === "hint" ? "Hint" : "Similar case"}</b></p>
            <p>{help.body ?? "There's no stored text for this step. Ask the mentor."}</p>
            <p className="fine">{help.rung === "hint" ? "Counts as help used." : "Noted in your help log."}</p>
          </div>
        )}
        {confirmCode && (
          <div className="hcard code">
            <p>The mentor will write the code for this step&apos;s exact piece, about 30 lines at a time, and explain each part. It&apos;s noted in your help log.</p>
            <div className="acts">
              <button type="button" className="btn btn-primary" onClick={unlockCode}>Show me code</button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmCode(false)}>Not now</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
