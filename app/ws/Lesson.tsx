"use client";
// The concept lesson shown before a milestone's checks (CONTENT_FORMAT v2: teach before you test).
// Open by default for Guided on the milestone's first check, one click away otherwise.
// The lesson's exact shape is set by the content session, so this renders any object of sections tolerantly.
import { useState } from "react";

export interface LessonConcept {
  id: string;
  slug: string;
  name: string;
  lesson: unknown;
}

const LABELS: Record<string, string> = {
  how: "How it works",
  how_it_works: "How it works",
  works: "How it works",
  examples: "Examples",
  example: "Example",
  misconceptions: "Common misconceptions",
  elsewhere: "Where else it shows up",
  where_else: "Where else it shows up",
  shows_up: "Where else it shows up",
};
const ORDER = ["how", "how_it_works", "works", "examples", "example", "misconceptions", "elsewhere", "where_else", "shows_up"];

const label = (k: string) => LABELS[k] ?? k.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

function Value({ v }: { v: unknown }) {
  if (v == null) return null;
  if (typeof v === "string") return <>{v.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</>;
  if (Array.isArray(v)) {
    return (
      <ul>
        {v.map((x, i) => (
          <li key={i}>{typeof x === "string" ? x : x && typeof x === "object" ? Object.values(x as Record<string, unknown>).filter((y) => typeof y === "string").join(": ") : String(x)}</li>
        ))}
      </ul>
    );
  }
  if (typeof v === "object") return <Sections lesson={v as Record<string, unknown>} />;
  return <p>{String(v)}</p>;
}

function Sections({ lesson }: { lesson: Record<string, unknown> }) {
  const keys = Object.keys(lesson).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  return (
    <>
      {keys.map((k) => (
        <div className="lesson-sec" key={k}>
          <p className="label"><b>{label(k)}</b></p>
          <Value v={lesson[k]} />
        </div>
      ))}
    </>
  );
}

export default function Lesson({ concepts, open }: { concepts: LessonConcept[]; open: boolean }) {
  const [shown, setShown] = useState(open);
  const withLesson = concepts.filter((c) => c.lesson);
  if (!withLesson.length) return null;
  return (
    <section className="lesson" aria-label="The idea behind this milestone">
      <button type="button" className="lesson-toggle" aria-expanded={shown} onClick={() => setShown((s) => !s)}>
        <span className="label"><b>Lesson</b> · {withLesson.map((c) => c.name).join(", ")}</span>
        <span className="fine">{shown ? "Hide" : "Read it first"}</span>
      </button>
      {shown &&
        withLesson.map((c) => (
          <article key={c.id} className="lesson-body">
            {withLesson.length > 1 && <h2>{c.name}</h2>}
            {typeof c.lesson === "string" ? <Value v={c.lesson} /> : <Sections lesson={c.lesson as Record<string, unknown>} />}
          </article>
        ))}
    </section>
  );
}
