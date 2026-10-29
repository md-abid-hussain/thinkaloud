"use client";
// The steps rail: project, segmented progress, each milestone with its steps and "Explain it back", then the
// milestone's ideas. Opening an idea's brief marks it seen.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client/useRun";
import type { Milestones } from "./types";
import { STATUS_WORD } from "./types";

export interface RailIdea { id?: string; name: string; brief?: string | null; status: string }

const HELP_WORD: Record<string, string> = { none: "none on this step", hint: "a hint on this step", example: "a similar case on this step", code: "code on this step" };

export default function Rail({ slug, short, title, milestones, current, ideas, milestone, helpLevel }: {
  slug: string; short: string; title: string; milestones: Milestones;
  current: { m: number; s: number } | { m: number; explain: true };
  ideas: RailIdea[]; milestone: number; helpLevel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const all = milestones.flatMap((m) => m.steps.map((s) => ({ m: m.position, s })));
  const done = all.filter((x) => x.s.status === "done").length;
  const isCur = (m: number, s: number) => "s" in current && current.m === m && current.s === s;

  const toggle = (i: RailIdea) => {
    const key = i.id ?? i.name;
    setOpen(open === key ? null : key);
    if (open !== key && i.id && i.status === "new") {
      post(`/api/concepts/${i.id}/seen`, { slug }).then(() => router.refresh()).catch(() => {});
    }
  };

  return (
    <>
      <div className="rail-h">
        <p className="label"><b>{short}</b> · {all.length} steps</p>
        <h2><Link href={`/projects/${slug}/home`}>{title}</Link></h2>
        <div className="bar" aria-label={`Progress: ${done} of ${all.length} steps done`}>
          {all.map((x) => <span key={x.s.id} className={x.s.status === "done" ? "on" : isCur(x.m, x.s.position) ? "cur" : ""} />)}
        </div>
        <p className="fine" style={{ marginTop: 6 }}>{done} of {all.length} steps done</p>
      </div>
      <div>
        {milestones.map((m) => {
          const tbCur = "explain" in current && current.m === m.position;
          const tbState = m.understood ? "done" : tbCur ? "cur" : "todo";
          const tbMeta = m.teachBack.checking ? "Checking…" : m.understood ? "done · understood" : m.teachBack.best === "partial" ? `milestone ${m.position} · almost` : `milestone ${m.position}`;
          return (
            <div className="mgroup" key={m.id}>
              <p className="label"><b>Milestone {m.position}</b></p>
              <h3>{m.title}</h3>
              <ol className="slist">
                {m.steps.map((s) => {
                  const cur = isCur(m.position, s.position);
                  const st = s.status === "done" ? "done" : cur ? "cur" : "todo";
                  return (
                    <li className={st} key={s.id}>
                      <Link href={`/projects/${slug}/m/${m.position}/s/${s.position}`} aria-current={cur ? "step" : undefined}>
                        <span className="ic" aria-hidden="true" />
                        <span>{s.title}<span className="m">{m.position}.{s.position} · {s.est_minutes} min{s.checking ? " · Checking…" : s.status === "done" ? " · done" : ""}</span></span>
                      </Link>
                    </li>
                  );
                })}
                {m.question_id && (
                  <li className={`tb ${tbState}`}>
                    <Link href={`/projects/${slug}/m/${m.position}/explain`} aria-current={tbCur ? "step" : undefined}>
                      <span className="ic" aria-hidden="true" />
                      <span>Explain it back<span className="m">{tbMeta}</span></span>
                    </Link>
                  </li>
                )}
              </ol>
            </div>
          );
        })}
      </div>
      <div className="rail-foot">
        <p className="label">Ideas in milestone {milestone}</p>
        <ul className="ideas-mini">
          {ideas.map((i) => {
            const key = i.id ?? i.name;
            return (
              <li key={key}>
                <span className={`sq ${i.status}`} />
                {i.brief ? (
                  <button type="button" className="idea-btn" aria-expanded={open === key} onClick={() => toggle(i)}>{i.name}</button>
                ) : <span>{i.name}</span>}
                <span className="s">{STATUS_WORD[i.status] ?? i.status}</span>
                {open === key && i.brief && <p className="br">{i.brief}</p>}
              </li>
            );
          })}
        </ul>
        {helpLevel && <p className="fine" style={{ marginTop: 14 }}>Help used: {HELP_WORD[helpLevel] ?? helpLevel}</p>}
      </div>
    </>
  );
}
