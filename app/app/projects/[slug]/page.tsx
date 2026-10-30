import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { catalog, challengeNumber, inSentence, shortName } from "@/lib/catalog";
import "./overview.css";

export async function generateStaticParams() {
  return (await catalog()).map((m) => ({ slug: m.project.slug }));
}

export async function generateMetadata({ params }: PageProps<"/projects/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const map = (await catalog()).find((m) => m.project.slug === slug);
  return { title: map ? `${shortName(map)} · ThinkAloud` : "ThinkAloud" };
}

export default function ProjectOverview({ params }: PageProps<"/projects/[slug]">) {
  return (
    <Suspense fallback={null}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: PageProps<"/projects/[slug]">["params"] }) {
  const { slug } = await params;
  const maps = await catalog();
  const map = maps.find((m) => m.project.slug === slug);
  if (!map) notFound();

  const { project, concepts, steps } = map;
  const short = shortName(map);
  const n = challengeNumber(slug);
  const required = steps.filter((s) => !s.optional);
  const optional = steps.length - required.length;
  const level = project.level[0].toUpperCase() + project.level.slice(1);
  const facts = [
    n ? `Challenge #${n}` : null,
    level,
    `${concepts.length} concepts`,
    `${required.length} steps${optional ? ` + ${optional} optional` : ""}`,
    "Not yet checked",
  ].filter(Boolean) as string[];
  const challenge = n ? `Coding Challenges #${n}` : "Coding Challenges";
  const start = `/projects/${slug}/learn`;
  const stepNumber = (id: string) => required.findIndex((s) => s.id === id) + 1;

  return (
    <div className="pg-overview">
      <Header variant="inner" current="projects" readyCount={maps.length} />
      <div className="wrap" id="top">
        <div className="page">
          <section className="head" aria-labelledby="page-title">
            <p className="label crumb"><Link href="/projects">Projects</Link><span aria-hidden="true">/</span><b>{short}</b></p>
            <h1 id="page-title">{project.title}</h1>
            <p className="lede">{project.summary}</p>
            <p className="src">From <a href={project.source_url}>{challenge} ↗</a> by <a href="https://x.com/johncrickett">John Crickett</a></p>
            <ul className="facts">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
            <div className="go">
              <Link className="btn btn-primary" href={start}>Start {short}</Link>
              <p className="fine">No sign-up. You tell the mentor your language: Java, Python or Node.js.</p>
            </div>
          </section>

          <section className="sec" aria-labelledby="ideas-h">
            <div className="sec-h">
              <p className="label"><b>What you&apos;ll learn</b> · {concepts.length} concepts</p>
              <h2 id="ideas-h">The concepts behind {short}</h2>
              <p className="fine">In the order the steps use them. Each one links to the best places to learn it, and you explain it in your own words once its steps are built.</p>
            </div>
            <ol className="ideas">
              {concepts.map((c, i) => {
                const usedIn = required.filter((s) => s.concepts.includes(c.id)).map((s) => stepNumber(s.id));
                return (
                  <li className="idea" key={c.id}>
                    <span className="n">{i + 1}</span>
                    <span className="nm">{c.name}</span>
                    <span className="st new">{usedIn.length ? `Step ${usedIn.join(", ")}` : "Optional"}</span>
                    <p className="br">{c.why_here}</p>
                    {c.covers.length > 0 && <p className="fine covers">Covers: {c.covers.join(" · ")}</p>}
                    <p className="fine reads">
                      {c.resources.map((r, k) => (
                        <span key={r.url}>{k > 0 && " · "}<a href={r.url}>{r.title} ↗</a></span>
                      ))}
                    </p>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="sec" aria-labelledby="code-h">
            <div className="sec-h">
              <p className="label"><b>What you&apos;ll build</b> · {required.length} steps</p>
              <h2 id="code-h">Build {short} step by step</h2>
              <p className="fine">Steps of 30 to 60 minutes, in your own editor and language. Each one has a check, so you know when it works.</p>
            </div>
            <ol className="steps">
              {steps.map((s) => {
                const uses = s.concepts.map((id) => concepts.find((c) => c.id === id)?.name).filter((n): n is string => !!n);
                return (
                  <li key={s.id} className="step">
                    <span className="n" aria-hidden="true">{s.optional ? "+" : String(stepNumber(s.id)).padStart(2, "0")}</span>
                    <div className="body">
                      <h3>
                        {s.title}
                        {s.optional && <span className="pill plain">Optional</span>}
                      </h3>
                      <p className="obj">{s.objective}</p>
                      <p className="check">
                        <span className="label"><b>Check</b></span>
                        <span>{s.check}</span>
                      </p>
                      {uses.length > 0 && <p className="fine uses">Concepts: {uses.map(inSentence).join(" · ")}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="end" aria-labelledby="end-h">
            <h2 id="end-h">Ready to start {short}?</h2>
            <Link className="btn btn-primary" href={start}>Start {short}</Link>
          </section>

          <Footer left={<>From <a href={project.source_url}>{challenge} ↗</a> by John Crickett. Notes written in our own words.</>} />
        </div>
      </div>
    </div>
  );
}
