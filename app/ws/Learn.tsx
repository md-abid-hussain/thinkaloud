"use client";
// Learning before checking: after the lesson, the classes and APIs of the learner's language for this
// milestone's ideas (generated from official docs), then verified references ("Read more").
// While the research run works, it says so and fills in as each idea is saved.
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRun } from "@/lib/client/useRun";

export interface LanguageNote {
  conceptId: string;
  summary: string;
  classes: { name: string; purpose: string; doc?: string }[];
  pitfalls: string[];
  links: { title: string; url: string }[];
}
export interface LearnData {
  language: string | null;
  framework: string | null;
  notes: LanguageNote[];
  references: { conceptId: string; title: string; url: string }[];
  languageRunId: string | null;
  referencesRunId: string | null;
}

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export default function Learn({ data, concepts, open }: { data: LearnData; concepts: { id: string; name: string }[]; open: boolean }) {
  const router = useRouter();
  const lang = useRun(data.languageRunId, () => router.refresh());
  const refs = useRun(data.referencesRunId, () => router.refresh());
  // Refresh when an idea's notes or links are saved, so they appear without waiting for the whole run.
  const saved = [...lang.traces, ...refs.traces].filter((t) => (t as { saved?: boolean }).saved).length;
  const seen = useRef(saved);
  useEffect(() => {
    if (saved > seen.current) router.refresh();
    seen.current = saved;
  }, [saved, router]);

  const name = data.language ? cap(data.language) + (data.framework ? ` with ${cap(data.framework)}` : "") : null;
  const preparing = lang.status === "queued" || lang.status === "running";
  const missing = concepts.filter((c) => !data.notes.some((n) => n.conceptId === c.id));
  const latest = [...lang.traces].reverse().find((t) => t.label)?.label;
  const links = data.references.filter((r, i, a) => a.findIndex((x) => x.url === r.url) === i);

  if (!name && !links.length && !refs.traces.length) return null;
  return (
    <section className="learn" aria-label="Learn before the checks">
      {name && (
        <details className="lang" open={open || preparing}>
          <summary><span className="label"><b>{name}</b> · what you&apos;ll use</span><span className="fine">{data.notes.length} of {concepts.length} ideas ready</span></summary>
          {data.notes.map((n) => {
            const c = concepts.find((x) => x.id === n.conceptId);
            return (
              <article key={n.conceptId} className="lang-note">
                <h3>{c?.name}</h3>
                <p>{n.summary}</p>
                <dl className="apis">
                  {n.classes.map((k) => (
                    <div key={k.name}>
                      <dt>{k.doc ? <a href={k.doc} rel="noopener">{k.name}</a> : k.name}</dt>
                      <dd>{k.purpose}</dd>
                    </div>
                  ))}
                </dl>
                {n.pitfalls.length > 0 && (
                  <>
                    <p className="label"><b>Pitfalls</b></p>
                    <ul>{n.pitfalls.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  </>
                )}
                <p className="fine docs">{n.links.map((l, i) => <span key={l.url}>{i > 0 && " · "}<a href={l.url} rel="noopener">{l.title}</a></span>)}</p>
              </article>
            );
          })}
          {missing.length > 0 && (
            preparing
              ? <p className="preparing" role="status"><span className="wave-dot" aria-hidden="true" />Preparing your {name} notes from the official docs… {latest ? <span className="fine">{latest}</span> : null}</p>
              : <p className="fine">Notes for {missing.map((m) => m.name).join(", ")} aren&apos;t ready. They&apos;re prepared from official docs when you pick a language{data.notes.length ? "" : `; if ${name} has no official-docs list yet, the mentor can still search for you`}.</p>
          )}
          <p className="fine">Generated from official documentation, every link checked. Names only: you write the code.</p>
        </details>
      )}
      {(links.length > 0 || refs.status === "running" || refs.status === "queued") && (
        <div className="refs">
          <p className="label"><b>Read more</b></p>
          {links.length ? (
            <ul>{links.map((l) => <li key={l.url}><a href={l.url} rel="noopener">{l.title}</a> <span className="fine">{host(l.url)}</span></li>)}</ul>
          ) : (
            <p className="preparing" role="status"><span className="wave-dot" aria-hidden="true" />Finding references…</p>
          )}
        </div>
      )}
    </section>
  );
}
