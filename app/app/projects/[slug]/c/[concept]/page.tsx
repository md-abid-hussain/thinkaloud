import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentLearnerId } from "@/lib/learner";
import { conceptV3 } from "@/lib/views3";
import { shortName } from "@/lib/catalogue";
import Lesson from "@/ws/Lesson";
import Learn from "@/ws/Learn";
import ExplainBack from "@/ws/ExplainBack";
import { WsFooter, WsHeader } from "../../m/WsFrame";
import { STATUS_WORD } from "@/ws/types";
import "../../workspace.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Concept · ThinkAloud" };

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

// A concept in a format 3 project, learning first: the lesson, where it shows up here, what to read, the
// learner's language (when chosen), then the explain-back, the one graded check for the concept.
export default async function ConceptPage({ params }: { params: Promise<{ slug: string; concept: string }> }) {
  const { slug, concept } = await params;
  const learner = await currentLearnerId();
  const d = await conceptV3(learner, slug, concept);
  if (!d) redirect(`/projects/${slug}`);
  if (!d.enrollment) redirect(`/projects/${slug}`);
  const short = shortName(slug, d.project.title);
  const c = d.concept;
  const i = d.map.findIndex((x) => x.slug === c.slug);
  const prev = i > 0 ? d.map[i - 1] : null;
  const next = i < d.map.length - 1 ? d.map[i + 1] : null;

  return (
    <div className="pg-ws">
      <WsHeader />
      <div className="ctx"><div className="ctx-in">
        <nav className="crumb" aria-label="You are here">
          <Link href={`/projects/${slug}/home`}>{short}</Link><span aria-hidden="true">/</span>
          <span>Learning map</span><span aria-hidden="true">/</span><span aria-current="page">{c.name}</span>
        </nav>
      </div></div>
      <div className="wrap">
        <main className="concept-page">
          <div className="step-h">
            <p className="label"><b>Concept {c.position} of {d.map.length}</b> · {c.area} · {STATUS_WORD[c.status] ?? c.status}{c.reviewed ? "" : " · not yet checked"}</p>
            <h1>{c.name}</h1>
            <p className="lede">{c.brief}</p>
          </div>

          <div className="where">
            <p className="label"><b>Where it shows up in {short}</b></p>
            <p>{c.where}</p>
          </div>

          <Lesson concepts={[{ id: c.id, slug: c.slug, name: c.name, lesson: c.lesson }]} open />

          {d.references.length > 0 && (
            <div className="refs read">
              <p className="label"><b>Read</b></p>
              <ul>
                {d.references.map((r) => (
                  <li key={r.url}><a href={r.url} rel="noopener">{r.title}</a> <span className="fine">{host(r.url)}{r.opened ? " · opened and checked" : " · link verified"}</span></li>
                ))}
              </ul>
            </div>
          )}

          {d.language && d.language.language && (
            <Learn data={d.language} concepts={[{ id: c.id, name: c.name }]} open />
          )}
          {!d.enrollment.language && (
            <p className="fine">Pick a language on the <Link href={`/projects/${slug}/home#language`}>project home</Link> to see the classes and APIs it offers for this idea.</p>
          )}

          <ExplainBack pcId={c.pcId} conceptId={c.id} slug={slug} prompt={d.explainBack.prompt} points={d.explainBack.points} parts={d.explainBack.parts}
            latest={d.latest} runId={d.runId} runBody={d.runBody} />

          {d.steps.length > 0 && (
            <div className="used">
              <p className="label"><b>Build steps that use it</b></p>
              <ul>{d.steps.map((s) => <li key={`${s.m}.${s.s}`}><Link href={`/projects/${slug}/m/${s.m}/s/${s.s}`}>{s.m}.{s.s} {s.title}</Link> <span className="fine">{s.status === "done" ? "outcome met" : ""}</span></li>)}</ul>
            </div>
          )}

          <nav className="pager" aria-label="Concepts">
            {prev ? <Link className="btn btn-ghost" href={`/projects/${slug}/c/${prev.slug}`}>← {prev.name}</Link> : <span />}
            {next ? <Link className="btn btn-ghost" href={`/projects/${slug}/c/${next.slug}`}>{next.name} →</Link> : <Link className="btn btn-ghost" href={`/projects/${slug}/home`}>Back to {short}</Link>}
          </nav>
          <WsFooter slug={slug} short={short} sourceUrl={d.project.sourceUrl} />
        </main>
      </div>
    </div>
  );
}
