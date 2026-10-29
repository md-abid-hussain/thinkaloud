import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { currentLearnerId } from "@/lib/learner";
import { conceptPage } from "@/lib/learning";
import MarkSeen from "./MarkSeen";
import Lesson from "@/ws/Lesson";
import "../../learning/inner.css";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { new: "New", seen: "Seen", explained: "Explained", applied: "Applied" };

export default async function Concept({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ from?: string }> }) {
  const { slug } = await params;
  const { from } = await searchParams;
  const l = await currentLearnerId();
  const data = await conceptPage(slug, l);
  if (!data) notFound();
  const { concept: c, link, projects, prereqs, mine } = data;

  return (
    <>
      <Header variant="inner" current="learning" />
      <div className="wrap pg-inner">
        <main>
          <section className="head">
            <p className="label"><b>Idea</b> · {c.area}</p>
            <h1>{c.name}</h1>
            <ul className="facts">
              <li>Used in {projects.length} project{projects.length === 1 ? "" : "s"}</li>
              {mine ? <li>You: {STATUS[mine.status]}</li> : null}
              {c.content_status !== "reviewed" ? <li>Not yet checked</li> : null}
            </ul>
          </section>

          <section className="sec" aria-labelledby="brief-h">
            <div className="sec-h"><p className="label">The brief</p><h2 id="brief-h">In plain words</h2></div>
            <p className="brief">{c.brief}</p>
            <div style={{ marginTop: 24 }}><Lesson concepts={[{ id: c.id, slug: c.slug, name: c.name, lesson: c.lesson }]} open /></div>
            {link ? <p style={{ marginTop: 16 }}><a href={link.url} rel="noopener">{link.title} ↗</a> <span className="fine">verified link</span></p> : null}
            {mine && mine.status === "new" ? <div className="actions"><MarkSeen conceptId={c.id} slug={from ?? null} /></div> : null}
            {mine?.quote ? (
              <div className="mine"><p className="label"><b>In your words</b></p><blockquote>&ldquo;{mine.quote}&rdquo;</blockquote></div>
            ) : null}
            {mine?.notes.map((n) => (
              <div className="mine" key={n.language}><p className="label"><b>{n.language}</b> · language note</p><p className="note">{n.body}</p></div>
            ))}
          </section>

          {prereqs.length ? (
            <section className="sec" aria-labelledby="pre-h">
              <div className="sec-h"><p className="label">Comes after</p><h2 id="pre-h">Ideas to know first</h2></div>
              <ul className="list">{prereqs.map((p) => <li key={p.slug}><span className="t"><Link href={`/concepts/${p.slug}`}>{p.name}</Link></span></li>)}</ul>
            </section>
          ) : null}

          <section className="sec" aria-labelledby="where-h">
            <div className="sec-h"><p className="label">Where you'll meet it</p><h2 id="where-h">Projects</h2></div>
            <ul className="list">
              {projects.map((p) => (
                <li key={p.slug}>
                  <span className="t"><Link href={`/projects/${p.slug}`}>{p.title}</Link></span>
                  <span className="fine">milestone {p.milestone}</span>
                  <p className="sub">{p.milestone_title}</p>
                </li>
              ))}
            </ul>
            <p className="fine" style={{ marginTop: 16 }}>Projects from <a href="https://codingchallenges.fyi/">Coding Challenges</a> by John Crickett.</p>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
