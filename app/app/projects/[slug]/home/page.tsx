import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { currentLearnerId } from "@/lib/learner";
import { projectHome } from "@/lib/views";
import { META, shortName } from "@/lib/catalogue";
import { STATUS_WORD, SUPPORT_NAMES } from "@/ws/types";
import Restate from "./Restate";
import Support from "./Support";
import Reflection from "./Reflection";
import "../home.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Project home · ThinkAloud" };

const HELP: Record<string, [string, string]> = { hint: ["hint", "hints"], example: ["similar case", "similar cases"], code: ["code request", "code requests"] };

function tbWord(m: { understood: boolean; teachBack: { best: string; checking: boolean }; steps: { status: string }[] }) {
  if (m.teachBack.checking) return { t: "Checking…", c: "checking" };
  if (m.understood) return { t: "Explained", c: "explained" };
  if (m.teachBack.best === "partial") return { t: "Almost", c: "almost" };
  if (m.teachBack.best === "not_yet") return { t: "Not yet", c: "" };
  return m.steps.every((s) => s.status === "done") ? { t: "Ready", c: "ready" } : { t: "After the steps", c: "" };
}

export default async function ProjectHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const learner = await currentLearnerId();
  const h = await projectHome(learner, slug);
  if (!h || !h.enrollment) redirect(`/projects/${slug}`);
  const { project: p, enrollment: en, milestones } = h;
  const short = shortName(slug, p.title);
  const n = META[slug]?.n;
  const base = `/projects/${slug}`;
  const guided = en.supportLevel === "guided";

  const steps = milestones.flatMap((m) => m.steps);
  const done = steps.filter((s) => s.status === "done").length;
  const mTotal = h.progress?.milestones_total ?? milestones.length;
  const mDone = h.progress?.milestones_understood ?? milestones.filter((m) => m.understood).length;
  const allUnderstood = mTotal > 0 && mDone >= mTotal;
  const complete = !!h.progress?.understood;
  const facts = [`${done} of ${steps.length} steps done`, `${mDone} of ${mTotal} milestones understood`, `${SUPPORT_NAMES[en.supportLevel]} support`, en.language ?? "Ideas only"];

  // Next up: the first unfinished step, or a teach-back that comes first because its steps are all done.
  const nx = h.next;
  const tb = h.nextTeachBack;
  const pickTb = !!tb && (!nx || tb.position <= nx.milestone);
  const nxM = nx ? milestones.find((m) => m.position === nx.milestone) : null;

  const explained = h.concepts.filter((c) => c.status === "explained" || c.status === "applied");
  const helpLine = h.help.filter((x) => HELP[x.level]).map((x) => `${x.n} ${HELP[x.level][x.n === 1 ? 0 : 1]}`);
  const credit = <>From <a href={p.sourceUrl}>Coding Challenges{n ? ` #${n}` : ""} ↗</a> by <a href="https://x.com/johncrickett">John Crickett</a></>;

  const primerRows = p.primer && (
    <>
      <dl className="rows">
        <div><dt className="label">What it is</dt><dd>{p.primer.what}</dd></div>
        <div><dt className="label">Why it matters</dt><dd>{p.primer.why}</dd></div>
        <div><dt className="label"><b>A tiny example</b></dt><dd>{p.primer.example}</dd></div>
      </dl>
      {p.primer.words?.length > 0 && (
        <>
          <p className="label words-h">Words you&apos;ll meet</p>
          <dl className="rows words">
            {p.primer.words.map((w) => <div key={w.term}><dt>{w.term}</dt><dd>{w.meaning}</dd></div>)}
          </dl>
        </>
      )}
    </>
  );

  return (
    <div className="pg-home">
      <Header variant="inner" current="projects" />
      <div className="wrap" id="top">
        <div className="page">
          <section className="head" aria-labelledby="page-title">
            <p className="label crumb"><Link href="/projects">Projects</Link><span aria-hidden="true">/</span><Link href={base}>{short}</Link><span aria-hidden="true">/</span><b>Home</b></p>
            <h1 id="page-title">{p.title}</h1>
            <p className="src">{credit}</p>
            <ul className="facts">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
          </section>

          {complete && (
            <section className="sec card done" aria-labelledby="done-h">
              <p className="label"><b>Project complete</b></p>
              <h2 id="done-h">You explained {short} in your own words</h2>
              {explained.length > 0 && (
                <ul className="chips">{explained.map((c) => <li key={c.id} className="chip">{c.name}</li>)}</ul>
              )}
              <div className="go">
                <Link className="btn btn-primary" href="/learning">See your learning</Link>
                <a className="btn btn-ghost" href="/api/export?format=md" download>Export Markdown</a>
                <a className="btn btn-ghost" href="/api/export?format=json" download>Export JSON</a>
              </div>
            </section>
          )}

          {h.firstVisit ? (
            <section className="card start" aria-labelledby="start-h">
              <p className="label"><b>Start here</b></p>
              <h2 id="start-h">{guided ? "The problem in plain words" : "Restate the project in your own words"}</h2>
              {guided && primerRows}
              <div className={guided ? "restate-h" : "restate-h bare"}>
                {guided && <h3>Restate the project in your own words</h3>}
                <p className="fine">Optional. It never blocks a step.</p>
              </div>
              <Restate slug={slug} latest={h.restate} runId={h.restateRunId} autoFocus />
              {nx && <div className="go"><Link className="btn btn-ghost" href={`${base}/m/${nx.milestone}/s/${nx.position}`}>Go to step {nx.milestone}.{nx.position}</Link></div>}
            </section>
          ) : !complete && (pickTb || nx) && (
            <section className="card next-up" aria-labelledby="next-h">
              <p className="label"><b>Next up</b></p>
              {pickTb ? (
                <>
                  <h2 id="next-h">Explain milestone {tb!.position} back</h2>
                  <p className="fine">{tb!.title} · every step done</p>
                  <div className="go"><Link className="btn btn-primary" href={`${base}/m/${tb!.position}/explain`}>Explain it back</Link></div>
                </>
              ) : (
                <>
                  <h2 id="next-h">{nx!.title}</h2>
                  <p className="fine">Milestone {nx!.milestone} · step {nx!.position} of {nxM?.steps.length ?? "?"} · {nx!.est_minutes} min{nx!.checking ? " · Checking…" : ""}</p>
                  <div className="go"><Link className="btn btn-primary" href={`${base}/m/${nx!.milestone}/s/${nx!.position}`}>{nx!.status === "not_started" ? "Start" : "Continue"} step {nx!.milestone}.{nx!.position}</Link></div>
                </>
              )}
            </section>
          )}

          {allUnderstood && !complete && (
            <section className="sec" aria-labelledby="reflect-h">
              <div className="sec-h"><p className="label"><b>Last</b> · not graded</p><h2 id="reflect-h">Look back on {short}</h2></div>
              {p.reflectionPrompt && <p className="q">{p.reflectionPrompt}</p>}
              <Reflection slug={slug} />
            </section>
          )}

          <section className="sec" aria-labelledby="ms-h">
            <div className="sec-h"><p className="label">{milestones.length} milestones</p><h2 id="ms-h">Steps</h2></div>
            <ol className="track">
              {milestones.map((m) => {
                const w = tbWord(m);
                return (
                  <li key={m.id}>
                    <div className="mile-row">
                      <p className="label"><b>Milestone {m.position}</b></p>
                      <h3>{m.title}</h3>
                      <p className="fine">{m.steps.length} steps · {m.est_minutes} min{m.understood ? " · understood" : ""}</p>
                    </div>
                    <ol className="slist">
                      {m.steps.map((s) => {
                        const st = s.status === "done" ? "done" : s.status !== "not_started" ? "cur" : "todo";
                        return (
                          <li key={s.id} className={st}>
                            <Link href={`${base}/m/${m.position}/s/${s.position}`}>
                              <span className="ic" aria-hidden="true" />
                              <span className="t">{s.title}</span>
                              <span className="m">{m.position}.{s.position} · {s.est_minutes} min{s.checking ? " · Checking…" : s.status === "done" ? " · done" : ""}</span>
                            </Link>
                          </li>
                        );
                      })}
                      <li className={`tb ${m.understood ? "done" : ""}`}>
                        <Link href={`${base}/m/${m.position}/explain`}>
                          <span className="ic" aria-hidden="true" />
                          <span className="t">Explain it back</span>
                          <span className={`st ${w.c}`}>{w.t}</span>
                        </Link>
                      </li>
                    </ol>
                  </li>
                );
              })}
            </ol>
          </section>

          {!h.firstVisit && (h.restate || h.restateRunId) && (
            <section className="sec" aria-labelledby="restate-h">
              <details className="fold" open={!!h.restateRunId}>
                <summary><span className="label">Your words</span><span id="restate-h" className="fold-t">Your restatement</span></summary>
                <Restate slug={slug} latest={h.restate} runId={h.restateRunId} />
              </details>
            </section>
          )}

          {p.primer && !(guided && h.firstVisit) && (
            <section className="sec" aria-labelledby="primer-h">
              <details className="fold" open={guided}>
                <summary><span className="label">Primer</span><span id="primer-h" className="fold-t">The problem in plain words</span></summary>
                {primerRows}
              </details>
            </section>
          )}

          <section className="sec" aria-labelledby="ideas-h">
            <div className="sec-h"><p className="label">{explained.length} of {h.concepts.length} explained</p><h2 id="ideas-h">The ideas</h2></div>
            <ol className="ideas">
              {h.concepts.map((c, i) => (
                <li className="idea" key={c.id}>
                  <span className="n">{i + 1}</span>
                  <span className="nm">{c.name}</span>
                  <span className={`st ${c.status}`}>{STATUS_WORD[c.status] ?? c.status}</span>
                  {c.brief && <p className="br">{c.brief}</p>}
                </li>
              ))}
            </ol>
          </section>

          <section className="sec" id="support" aria-labelledby="support-h">
            <div className="sec-h"><p className="label">Change any time</p><h2 id="support-h">Support level</h2></div>
            <Support slug={slug} level={en.supportLevel} />
          </section>

          <section className="sec" aria-labelledby="log-h">
            <div className="sec-h"><p className="label">Help and side questions</p><h2 id="log-h">Your log</h2></div>
            <dl className="rows">
              <div><dt className="label">Help used</dt><dd>{helpLine.length ? helpLine.join(" · ") : "None yet"}</dd></div>
              <div>
                <dt className="label">Later</dt>
                <dd>
                  {h.later.length ? (
                    <ul className="later">{h.later.map((x) => <li key={x.id}>{x.prompt}</li>)}</ul>
                  ) : "Nothing saved. Off-topic questions to the mentor land here."}
                </dd>
              </div>
              <div><dt className="label">Original</dt><dd>{credit}</dd></div>
            </dl>
          </section>

          <Footer left={<>{short} · from <a href={p.sourceUrl}>Coding Challenges{n ? ` #${n}` : ""} ↗</a> by John Crickett</>} />
        </div>
      </div>
    </div>
  );
}
