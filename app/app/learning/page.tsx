import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { currentLearnerId } from "@/lib/learner";
import { yourLearning } from "@/lib/learning";
import "./inner.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your learning · ThinkAloud" };

const STATUS: Record<string, string> = { new: "New", seen: "Seen", explained: "Explained", applied: "Applied" };

export default async function Learning() {
  const l = await currentLearnerId();
  const data = l ? await yourLearning(l) : null;

  if (!data || !data.projects.length) {
    return (
      <>
        <Header variant="inner" current="learning" />
        <div className="wrap pg-inner">
          <main>
            <section className="head">
              <p className="label"><b>Your learning</b></p>
              <h1>Nothing explained yet.</h1>
              <p className="lede">Start a project and explain its first idea. Everything you explain shows up here in your own words.</p>
            </section>
            <div className="empty">
              <h2>Pick a project to begin</h2>
              <p>wc is a good first one: about 45 minutes per milestone, ideas only or in your language.</p>
              <div className="actions"><Link className="btn btn-primary" href="/try/wc">Start wc</Link><Link className="btn btn-ghost" href="/projects">Browse projects</Link></div>
            </div>
          </main>
          <Footer />
        </div>
      </>
    );
  }

  const explained = data.concepts.filter((c) => c.status === "explained" || c.status === "applied");
  const helpUses = data.help.reduce((n, h) => n + h.n, 0);
  const areas = [...new Set(data.concepts.map((c) => c.area))];

  return (
    <>
      <Header variant="inner" current="learning" />
      <div className="wrap pg-inner">
        <main>
          <section className="head">
            <p className="label"><b>Your learning</b>{data.me?.display_name ? ` · ${data.me.display_name}` : " · guest"}</p>
            <h1>What you can explain.</h1>
            <p className="lede">Every idea you've explained, in your own words. It counts in every project that uses it.</p>
            <ul className="facts">
              <li>{data.projects.length} project{data.projects.length === 1 ? "" : "s"}</li>
              <li>{explained.length} idea{explained.length === 1 ? "" : "s"} explained</li>
              <li>{helpUses} help use{helpUses === 1 ? "" : "s"}</li>
            </ul>
            <div className="actions" id="export">
              <a className="btn btn-primary" href="/api/export?format=md">Export learning log</a>
              <a className="btn btn-ghost" href="/api/export?format=json">Download all data (JSON)</a>
            </div>
          </section>

          <section className="sec" aria-labelledby="proj-h">
            <div className="sec-h"><p className="label">In progress</p><h2 id="proj-h">Projects</h2></div>
            <ul className="list">
              {data.projects.map((p) => (
                <li key={p.slug}>
                  <span className="t"><Link href={`/projects/${p.slug}/home`}>{p.title}</Link></span>
                  <span className="fine">{p.status === "understood" ? "Complete" : `${p.milestones_understood} of ${p.milestones_total} milestones`}</span>
                  <p className="sub">{p.steps_done} of {p.steps_total} steps · {p.language ? p.language : "ideas only"} · {p.support_level} support</p>
                  <div className="bar" aria-hidden="true">{Array.from({ length: p.milestones_total }, (_, i) => <span key={i} className={i < p.milestones_understood ? "on" : ""} />)}</div>
                </li>
              ))}
            </ul>
          </section>

          <section className="sec" aria-labelledby="ideas-h">
            <div className="sec-h"><p className="label">By area</p><h2 id="ideas-h">The ideas</h2></div>
            {areas.map((a) => (
              <div key={a}>
                <p className="area">{a}</p>
                <ul className="list">
                  {data.concepts.filter((c) => c.area === a).map((c) => (
                    <li key={c.slug}>
                      <span className="t"><Link href={`/concepts/${c.slug}`}>{c.name}</Link></span>
                      <span className={`st ${c.status}`}>{STATUS[c.status] ?? c.status}</span>
                      {c.quote ? <blockquote>&ldquo;{c.quote}&rdquo;{c.project ? <span className="fine"> · {c.project}</span> : null}</blockquote> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {data.misconceptions.length ? (
            <section className="sec" aria-labelledby="mis-h">
              <div className="sec-h"><p className="label">Noted by the mentor</p><h2 id="mis-h">Things you got wrong along the way</h2></div>
              <ul className="list">
                {data.misconceptions.map((m, i) => (
                  <li key={i}><span className="t">{m.concept ?? "General"}</span><p className="sub">{m.note}</p></li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="sec" aria-labelledby="help-h">
            <div className="sec-h"><p className="label">Help log</p><h2 id="help-h">Help you used</h2></div>
            {data.help.length ? (
              <ul className="list">
                {data.help.map((h, i) => (
                  <li key={i}>
                    <span className="t"><Link href={`/projects/${h.slug}/m/${h.milestone}/s/${h.step}`}>{h.project} {h.milestone}.{h.step} · {h.title}</Link></span>
                    <span className="fine">{h.level === "code" ? "code" : h.level === "example" ? "similar case" : "hint"} × {h.n}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="fine">No help used yet. Asking is fine: help is never rationed.</p>}
          </section>

          {data.later.length ? (
            <section className="sec" aria-labelledby="later-h">
              <div className="sec-h"><p className="label">Later</p><h2 id="later-h">Saved for later</h2></div>
              <ul className="list">
                {data.later.map((x, i) => <li key={i}><span className="t">{x.prompt}</span><span className="fine">{x.project}</span></li>)}
              </ul>
            </section>
          ) : null}
        </main>
        <Footer />
      </div>
    </>
  );
}
