"use client";
// Pieces shared by the step and the teach-back transcripts: the Check turn's points, its pill, the run states
// (checking and grading paused), and the "You" turn after checking.
import type { ReactNode } from "react";
import type { TraceLine } from "@/lib/client/useRun";
import { Evidence } from "./evidence";
import { Wave } from "./AnswerBox";
import { clock, useMounted } from "./hooks";
import type { ResultPoint, Shown } from "./types";

export function Ts({ at }: { at: number | null }) {
  const mounted = useMounted();
  return <span className="ts">{mounted && at ? clock(at) : ""}</span>;
}

export function GradePill({ grade }: { grade: Shown["grade"] | "paused" | "checking" }) {
  if (grade === "met") return <span className="pill ok">Right</span>;
  if (grade === "partial") return <span className="pill soft">Almost</span>;
  if (grade === "paused") return <span className="pill plain">Grading paused</span>;
  if (grade === "checking") return <span className="pill plain">Checking…</span>;
  if (grade === "ungraded") return <span className="pill plain">Saved</span>;
  return <span className="pill plain">Not yet</span>;
}

export function Points({ points, concept }: { points: ResultPoint[]; concept?: (slug: string | null) => string | null }) {
  return (
    <ul className="points">
      {points.map((p, i) => {
        const name = concept?.(p.concept);
        return (
          <li key={p.id} className={p.met ? "met" : ""}>
            <span className="tick" aria-label={p.met ? "Covered" : "Not yet covered"}>{p.met ? "✓" : i + 1}</span>
            <span>{p.point}</span>
            {name && <span className="cn">{name} · {p.met ? "explained" : "not yet"}</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function YouTurn({ at, body, points, spoke, onEdit, editLabel = "Edit my answer" }: {
  at: number | null; body: string; points: ResultPoint[] | null; spoke: number; onEdit?: () => void; editLabel?: string;
}) {
  return (
    <>
      <Ts at={at} />
      <div className="turn">
        <p className="who">{spoke ? <>You · spoke for about {spoke} s <Wave /></> : "You"}</p>
        <p className="said"><Evidence body={body} points={points} /></p>
        {onEdit && <div className="next" style={{ marginTop: 10 }}><button type="button" className="linkbtn" onClick={onEdit}>{editLabel}</button></div>}
      </div>
    </>
  );
}

/** The Check turn while a grade run is queued, running, paused or failed. */
export function RunTurn({ at, status, traces, error, onRetry, next }: {
  at: number | null; status: string; traces: TraceLine[]; error: { message: string } | null; onRetry: () => void; next: ReactNode;
}) {
  const stopped = status === "paused" || status === "failed";
  return (
    <>
      <Ts at={at} />
      <div className="turn">
        <p className="who">Check <GradePill grade={stopped ? "paused" : "checking"} /></p>
        {!stopped ? (
          <>
            {traces.length > 0 && <ul className="trace">{traces.map((t, i) => <li key={i}><span>{t.label}{t.tool && <> · <code>{t.tool}</code></>}</span></li>)}</ul>}
            <div className="verdict paused checking">
              <p><b>Checking your answer against the rubric.</b> You can leave this page. The result will be here when you come back.</p>
            </div>
          </>
        ) : (
          <>
            <div className="verdict paused">
              <p><b>Your answer is saved.</b> {error?.message ?? "Grading needs the AI grader, which isn't responding right now."} Steps with an answer key still check as normal.</p>
              <p>Try again in a minute, or move on and come back.</p>
            </div>
            <div className="next">
              <button type="button" className="btn btn-primary" onClick={onRetry}>Try grading again</button>
              {next}
            </div>
          </>
        )}
      </div>
    </>
  );
}
