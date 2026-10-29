import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { overview, readyCount, type ConceptStatus } from "@/lib/catalogue";
import { currentLearnerId, enrollmentFor } from "@/lib/learner";
import { ChoiceLine, StartButton, StartProvider } from "./StartDialog";
import "./overview.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await overview(slug, null);
  return { title: p ? `${p.short} · ThinkAloud` : "ThinkAloud" };
}

const STATUS: Record<ConceptStatus, string> = { new: "New", seen: "Seen", explained: "Explained", applied: "Applied" };

function duration(n: number) {
  const h = Math.floor(n / 60), r = n % 60;
  return "about " + (h ? h + " h" : "") + (r ? (h ? " " : "") + r + " min" : "");
}

export default async function ProjectOverview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const learnerId = await currentLearnerId();
  const [p, enr, ready] = await Promise.all([overview(slug, learnerId), enrollmentFor(learnerId, slug), readyCount()]);
  if (!p) notFound();

  const ideas = p.milestones.reduce((a, m) => a + m.ideas.length, 0);
  const minutes = p.milestones.reduce((a, m) => a + m.minutes, 0);
  const explained = p.milestones.reduce((a, m) => a + m.ideas.filter((i) => i.status === "explained" || i.status === "applied").length, 0);
  const level = p.level ? p.level[0].toUpperCase() + p.level.slice(1) : null;
  const facts = [p.n ? `Challenge #${p.n}` : null, level, `${ideas} ideas in ${p.milestones.length} milestones`, minutes ? duration(minutes) : null, p.reviewed ? "Checked" : "Not yet checked"].filter(Boolean) as string[];
  const enrolled = enr ? { supportLevel: enr.support_level, language: enr.language } : null;
  const challenge = p.n ? `Coding Challenges #${p.n}` : "Coding Challenges";
  let n = 0;

  return (
    <div className="pg-overview">
      <Header variant="inner" current="projects" readyCount={ready} />
      <StartProvider slug={p.slug} short={p.short} enrolled={enrolled} known={explained} ideas={ideas}>
        <div className="wrap" id="top">
          <div className="page">
            <section className="head" aria-labelledby="page-title">
              <p className="label crumb"><Link href="/projects">Projects</Link><span aria-hidden="true">/</span><b>{p.short}</b></p>
              <h1 id="page-title">{p.title}</h1>
              {p.summary && <p className="lede">{p.summary}</p>}
              <p className="src">From <a href={p.sourceUrl}>{challenge} ↗</a> by <a href="https://x.com/johncrickett">John Crickett</a></p>
              <ul className="facts">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
              <div className="go">
                <StartButton />
                <ChoiceLine />
              </div>
            </section>

            {p.primer && (
              <section className="sec" aria-labelledby="primer-h">
                <div className="sec-h"><p className="label">Before you start</p><h2 id="primer-h">The problem in plain words</h2></div>
                <dl className="rows">
                  <div><dt className="label">What it is</dt><dd>{p.primer.what}</dd></div>
                  <div><dt className="label">Why it matters</dt><dd>{p.primer.why}</dd></div>
                  <div><dt className="label"><b>A tiny example</b></dt><dd>{p.primer.example}</dd></div>
                </dl>
              </section>
            )}

            <section className="sec" aria-labelledby="ideas-h">
              <div className="sec-h">
                <p className="label"><b>First</b> · the ideas</p>
                <h2 id="ideas-h">Understand and explain each idea</h2>
                <p className="fine">{ideas} ideas, in the order the milestones teach them. Each milestone ends with explaining its ideas back.{explained ? ` ${explained} already explained.` : ""}</p>
              </div>
              <ol className="track">
                {p.milestones.map((m) => (
                  <li key={m.position}>
                    <div className="mile-row">
                      <p className="label"><b>Milestone {m.position}</b></p>
                      <h3>{m.title}</h3>
                      <p className="fine">{m.steps} steps · {m.minutes} min</p>
                    </div>
                    <ol className="ideas">
                      {m.ideas.map((i) => (
                        <li className="idea" key={i.id}>
                          <span className="n">{++n}</span>
                          <span className="nm">{i.name}</span>
                          <span className={`st ${i.status}`}>{STATUS[i.status]}</span>
                          {i.brief && <p className="br">{i.brief}</p>}
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            </section>

            {p.requirements.length > 0 && (
              <section className="sec" aria-labelledby="code-h">
                <div className="sec-h"><p className="label"><b>Then</b> · the code</p><h2 id="code-h">Build {p.short} in your language</h2><p className="fine">Optional. Pick a language when you start.</p></div>
                <ol className="reqs">{p.requirements.map((r, i) => <li key={i}>{r}</li>)}</ol>
              </section>
            )}

            <section className="end" aria-labelledby="end-h">
              <h2 id="end-h">{enrolled ? `You've started ${p.short}.` : `Ready to start ${p.short}?`}</h2>
              <StartButton />
            </section>

            <Footer left={<>From <a href={p.sourceUrl}>{challenge} ↗</a> by John Crickett. Brief written in our own words.</>} />
          </div>
        </div>
      </StartProvider>
    </div>
  );
}
