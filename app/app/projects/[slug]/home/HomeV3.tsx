import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { projectHome } from "@/lib/views";
import { homeV3 } from "@/lib/views3";
import { META, shortName } from "@/lib/catalogue";
import { STATUS_WORD, SUPPORT_NAMES } from "@/ws/types";
import Restate from "./Restate";
import Support from "./Support";
import LanguagePick from "./LanguagePick";
import Reflection from "./Reflection";

const HELP: Record<string, string> = { hint: "hint", example: "similar case", code: "code request" };

// Project home for a format 3 project: two tracks linked by concept tags. The learning map (concepts, each
// explained back in your own words) decides Understood; the build plan (steps you tick as met) decides Built.
export default async function HomeV3({ slug, learner }: { slug: string; learner: string }) {
  const h = (await homeV3(learner, slug))!;
  const old = (await projectHome(learner, slug))!;
  const { project: p, enrollment: en } = h;
  const short = shortName(slug, p.title);
  const n = META[slug]?.n;
  const base = `/projects/${slug}`;
  const explained = h.map.filter((c) => c.explained).length;
  const steps = h.milestones.flatMap((m) => m.steps);
  const done = steps.filter((s) => s.status === "done").length;
  const understood = h.milestones.filter((m) => m.understood).length;
  const complete = en?.status === "understood";
  const allUnderstood = h.milestones.length > 0 && understood === h.milestones.length;
  const guided = en?.supportLevel === "guided";
  const facts = [
    `${explained} of ${h.map.length} concepts explained`,
    `${done} of ${steps.length} build steps met`,
    `${understood} of ${h.milestones.length} milestones understood`,
    `${SUPPORT_NAMES[en!.supportLevel]} support`,
    en!.language ?? "Ideas only",
  ];
  const helpLine = h.help.map((x) => `${x.n} ${HELP[x.level] ?? x.level}${x.n === 1 ? "" : "s"}`).join(" · ");

  return (
    <div className="pg-home">
      <Header variant="inner" current="projects" />
      <div className="wrap" id="top">
        <div className="page">
          <section className="head" aria-labelledby="page-title">
            <p className="label crumb"><Link href="/projects">Projects</Link><span aria-hidden="true">/</span><Link href={base}>{short}</Link><span aria-hidden="true">/</span><b>Home</b></p>
            <h1 id="page-title">{p.title}</h1>
            <p className="src">From <a href={p.sourceUrl}>Coding Challenges{n ? ` #${n}` : ""} ↗</a> by John Crickett</p>
            <ul className="facts">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
          </section>

          {complete && (
            <section className="sec card done" aria-labelledby="done-h">
              <p className="label"><b>Project complete</b></p>
              <h2 id="done-h">You explained {short} in your own words</h2>
              <ul className="chips">{h.map.filter((c) => c.explained).map((c) => <li key={c.pcId} className="chip">{c.name}</li>)}</ul>
              <div className="go">
                <Link className="btn btn-primary" href="/learning">See your learning</Link>
                <a className="btn btn-ghost" href="/api/export?format=md" download>Export Markdown</a>
                <a className="btn btn-ghost" href="/api/export?format=json" download>Export JSON</a>
              </div>
            </section>
          )}

          {old.firstVisit ? (
            <section className="card start" aria-labelledby="start-h">
              <p className="label"><b>Start here</b></p>
              <h2 id="start-h">{guided ? "The problem in plain words" : "Restate the project in your own words"}</h2>
              {guided && (
                <dl className="rows">
                  <div><dt>What it is</dt><dd>{p.primer.what}</dd></div>
                  <div><dt>Why it matters</dt><dd>{p.primer.why}</dd></div>
                  <div><dt>A tiny example</dt><dd>{p.primer.example}</dd></div>
                </dl>
              )}
              <div className={guided ? "restate-h" : "restate-h bare"}>
                {guided && <h3>Restate the project in your own words</h3>}
                <p className="fine">Optional. It never blocks anything.</p>
              </div>
              <Restate slug={slug} latest={old.restate} runId={old.restateRunId} autoFocus />
              {h.next.concept && <div className="go"><Link className="btn btn-ghost" href={`${base}/c/${h.next.concept.slug}`}>Start with {h.next.concept.name}</Link></div>}
            </section>
          ) : !complete && (h.next.concept || h.next.step) && (
            <section className="card next-up" aria-labelledby="next-h">
              <p className="label"><b>Next up</b></p>
              <h2 id="next-h">Learn, then build</h2>
              <div className="go">
                {h.next.concept && <Link className="btn btn-primary" href={`${base}/c/${h.next.concept.slug}`}>Explain {h.next.concept.name}</Link>}
                {h.next.step && <Link className="btn btn-ghost" href={`${base}/m/${h.next.step.m}/s/${h.next.step.s}`}>Build {h.next.step.m}.{h.next.step.s} {h.next.step.title}</Link>}
              </div>
            </section>
          )}

          {allUnderstood && !complete && (
            <section className="sec" aria-labelledby="reflect-h">
              <div className="sec-h"><p className="label"><b>Last</b> · not graded</p><h2 id="reflect-h">Look back on {short}</h2></div>
              {p.reflectionPrompt && <p className="q">{p.reflectionPrompt}</p>}
              <Reflection slug={slug} />
            </section>
          )}

          <section className="sec" aria-labelledby="map-h">
            <div className="sec-h"><p className="label">Learning map · {h.map.length} concepts</p><h2 id="map-h">What {short} teaches</h2></div>
            <ol className="map">
              {h.map.map((c) => (
                <li key={c.pcId} className={c.explained ? "done" : ""}>
                  <Link href={`${base}/c/${c.slug}`}>
                    <span className="n">{String(c.position).padStart(2, "0")}</span>
                    <span className="t">{c.name}</span>
                    <span className={`st ${c.status}`}>{c.checking ? "Checking…" : c.best === "partial" && !c.explained ? "Almost" : STATUS_WORD[c.status] ?? c.status}</span>
                    <span className="w">{c.where}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>

          <section className="sec" aria-labelledby="ms-h">
            <div className="sec-h"><p className="label">Build plan · {h.milestones.length} milestones</p><h2 id="ms-h">What you build</h2></div>
            {!en!.language && <p className="fine" style={{ marginBottom: 12 }}>You&apos;re working ideas only, so building is optional. Pick a language below whenever you want to build.</p>}
            <ol className="track">
              {h.milestones.map((m) => (
                <li key={m.id}>
                  <div className="mile-row">
                    <p className="label"><b>Milestone {m.position}</b></p>
                    <h3>{m.title}</h3>
                    <p className="fine">{m.steps.length} steps · {m.estMinutes} min{m.built ? " · built" : ""}{m.understood ? " · understood" : ""}</p>
                  </div>
                  <ol className="slist">
                    {m.steps.map((s) => {
                      const st = s.status === "done" ? "done" : s.status !== "not_started" ? "cur" : "todo";
                      return (
                        <li key={s.id} className={st}>
                          <Link href={`${base}/m/${m.position}/s/${s.position}`}>
                            <span className="ic" aria-hidden="true" />
                            <span className="t">{s.title}</span>
                            <span className="m">{m.position}.{s.position} · {s.estMinutes} min{s.status === "done" ? " · outcome met" : ""} · uses {s.concepts.map((c) => c.name).join(", ")}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ol>
            {(p.doneWhen || p.referenceTool || p.openChecks.length > 0) && (
              <dl className="rows spec">
                {p.doneWhen && <div><dt>Done when</dt><dd>{p.doneWhen}</dd></div>}
                {p.referenceTool && <div><dt>Compare against</dt><dd>{p.referenceTool}</dd></div>}
                {p.openChecks.length > 0 && <div><dt>Settle by experiment</dt><dd><ul>{p.openChecks.map((x) => <li key={x}>{x}</li>)}</ul></dd></div>}
              </dl>
            )}
          </section>

          {!old.firstVisit && (old.restate || old.restateRunId) && (
            <section className="sec" aria-labelledby="restate-h">
              <details className="fold" open={!!old.restateRunId}>
                <summary><span className="label">Your words</span><span id="restate-h" className="fold-t">Your restatement</span></summary>
                <Restate slug={slug} latest={old.restate} runId={old.restateRunId} />
              </details>
            </section>
          )}

          <section className="sec" id="language" aria-labelledby="language-h">
            <div className="sec-h"><p className="label">Optional</p><h2 id="language-h">Your language</h2></div>
            <p className="fine" style={{ marginBottom: 12 }}>Pick one to see the classes and APIs it offers for each concept, from its official docs. Ideas only works too.</p>
            <LanguagePick slug={slug} language={en!.language} framework={en!.framework} />
          </section>

          <section className="sec" id="support" aria-labelledby="support-h">
            <div className="sec-h"><p className="label">Change any time</p><h2 id="support-h">Support level</h2></div>
            <Support slug={slug} level={en!.supportLevel} />
          </section>

          {(helpLine || h.later.length > 0) && (
            <section className="sec" aria-labelledby="log-h">
              <div className="sec-h"><p className="label">Logs</p><h2 id="log-h">Help used and saved for later</h2></div>
              {helpLine && <p className="fine">{helpLine}</p>}
              {h.later.length > 0 && <ul>{h.later.map((x, i) => <li key={i}>{x.prompt}</li>)}</ul>}
            </section>
          )}

          <Footer left={<>{short} · from <a href={p.sourceUrl}>Coding Challenges{n ? ` #${n}` : ""} ↗</a> by John Crickett</>} />
        </div>
      </div>
    </div>
  );
}
