"use client";

import type { Concept, ProjectMap, Step } from "@/lib/content";
import type { LanguageLayer, LayerStatus } from "@/lib/language/layer";
import { LANGUAGES, stepLabel, type Language, type Progress, type Question } from "@/lib/progress";
import type { Review } from "@/lib/repo";
import type { ChatView } from "@/lib/view";

const KIND_LABEL = { what: "What", why: "Why", how: "How" } as const;

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A long summary reads better as two paragraphs: split at the sentence boundary nearest the middle. */
function paragraphs(text: string): string[] {
  if (text.length < 420) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) ?? [text];
  let length = 0;
  const cut = sentences.findIndex((s) => (length += s.length) >= text.length / 2) + 1;
  if (cut <= 0 || cut >= sentences.length) return [text];
  return [sentences.slice(0, cut).join("").trim(), sentences.slice(cut).join("").trim()];
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** The first card: what the project is, what you'll learn, how it works, and the first thing to do. */
export function WelcomeCard({ map, language, onPickLanguage }: { map: ProjectMap; language: Language | null; onPickLanguage: (language: Language) => void }) {
  return (
    <article className="page-card welcome" aria-label="About this project">
      <p className="eyebrow">Your project · {capital(map.project.level)}</p>
      <h2 className="ctitle">{map.project.title}</h2>
      <p className="lede">{map.project.summary}</p>
      <div className="cols">
        <section>
          <h3 className="h3">What you&apos;ll learn</h3>
          <ul className="plain-list">
            {map.concepts.map((c) => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="h3">How it works</h3>
          <ol className="plain-list">
            <li>Understand the problem: read it, then answer three questions.</li>
            <li>Set up a public GitHub repo. The sandbox builds and runs it.</li>
            <li>For each step: build it, push, ask for a review, and answer its questions in your own words.</li>
          </ol>
        </section>
      </div>
      {language ? (
        <p className="picked">
          Building in <strong>{LANGUAGES[language]}</strong>.
        </p>
      ) : (
        <div className="pick">
          <p>Which language are you building in?</p>
          <div className="pick-row">
            {(Object.keys(LANGUAGES) as Language[]).map((l) => (
              <button key={l} type="button" className="btn btn-sm btn-ghost" onClick={() => onPickLanguage(l)}>
                {LANGUAGES[l]}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="source">
        Original challenge:{" "}
        <a href={map.project.source_url} target="_blank" rel="noreferrer">
          {map.project.source_url.replace(/^https:\/\//, "")}
        </a>{" "}
        by John Crickett
      </p>
    </article>
  );
}

/** Stored questions: what each one is about, whether it's answered, and the question itself. */
function QuestionList({
  questions,
  answered,
  label,
  tag,
  done,
}: {
  questions: Question[];
  answered: Set<string>;
  label: (q: Question) => string;
  tag?: boolean;
  done: string;
}) {
  if (!questions.length) return null;
  return (
    <ol className="qs">
      {questions.map((q) => (
        <li key={q.id} className={`q${answered.has(q.id) ? " is-answered" : ""}`}>
          <div className="q-top">
            <span className={tag ? "q-tag" : "q-c"}>{label(q)}</span>
            <span className="q-state">{answered.has(q.id) ? done : "Not yet"}</span>
          </div>
          <p>{q.prompt}</p>
        </li>
      ))}
    </ol>
  );
}

/** Before you build: the problem in our words and three questions that show the learner read and understood it. */
export function Stage0Card({ view, onSend }: { view: ChatView; onSend: (text: string) => void }) {
  const answered = new Set(view.answers.map((a) => a.questionId));
  const questions = view.questions.filter((q) => q.kind);
  const done = questions.every((q) => answered.has(q.id));
  return (
    <article className="page-card stage0" aria-label="Understand the problem">
      <div className="card-head">
        <p className="eyebrow">Before you build</p>
        {done && <span className="pill ok">Done</span>}
      </div>
      <h2 className="ctitle">What you&apos;re building</h2>
      {view.stage0Summary && (
        <div className="summary">
          {paragraphs(view.stage0Summary).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
      <h3 className="h3">Answer in your own words</h3>
      <QuestionList questions={questions} answered={answered} label={(q) => KIND_LABEL[q.kind!]} tag done="Answered" />
      {!done && (
        <div className="card-actions">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => onSend("I've read it. Ask me the questions about the problem.")}>
            Ask me these
          </button>
          <span className="fine">Or go straight to setup. You can answer later.</span>
        </div>
      )}
    </article>
  );
}

/** Step 1, set up: the repo link, how the sandbox will run the program, and the step's question. */
export function SetupCard({ view, step }: { view: ChatView; step: Step }) {
  const answered = new Set(view.answers.map((a) => a.questionId));
  const status = view.progress.steps.find((s) => s.id === step.id);
  const c = view.contract;
  return (
    <article className="page-card step" aria-label="Set up">
      <div className="card-head">
        <p className="eyebrow">
          {stepLabel(view.map, step.id)} of {view.progress.counts.stepsRequired}
        </p>
        {status?.built && <span className="pill ok">Runs in the sandbox</span>}
      </div>
      <h2 className="ctitle">{step.title}</h2>
      <p className="lede">{step.objective}</p>
      <dl className="facts-box">
        <div>
          <dt className="k">Repo</dt>
          <dd>
            {view.repo.url ? (
              <a href={view.repo.url} target="_blank" rel="noreferrer" className="mono">
                {view.repo.url.replace("https://github.com/", "")}
              </a>
            ) : (
              "Create a public GitHub repo, push your first commit, and paste its link in the chat."
            )}
          </dd>
        </div>
        {c && (
          <div>
            <dt className="k">The sandbox runs</dt>
            <dd>
              <code className="cmd">{c.run}</code>
              {c.settings.length > 0 && (
                <span className="fine block">
                  Read {c.settings.map((s) => s.name).join(" and ")} from the environment: {c.settings.map((s) => s.purpose.toLowerCase()).join("; ")}.
                </span>
              )}
            </dd>
          </div>
        )}
        {view.repo.run && (
          <div>
            <dt className="k">Your commands</dt>
            <dd>
              {view.repo.build && (
                <>
                  <code className="cmd">{view.repo.build}</code>
                  <br />
                </>
              )}
              <code className="cmd">{view.repo.run}</code>
              <span className="fine block">{view.repo.confirmed ? "Confirmed by you." : "Detected by the sandbox. Tell the mentor if it's wrong."}</span>
            </dd>
          </div>
        )}
      </dl>
      <QuestionList questions={view.questions.filter((q) => q.step === step.id)} answered={answered} label={(q) => conceptName(view.map, q.concept)} done="Explained" />
    </article>
  );
}

const conceptName = (map: ProjectMap, id: string | null) => map.concepts.find((c) => c.id === id)?.name.split(":")[0] ?? "Explain";

const CHECKED_BY = {
  auto: "The sandbox runs your code and checks it.",
  partly: "The sandbox checks part of it; the reviewer reads the rest.",
  manual: "The reviewer reads your changes.",
} as const;

/**
 * A step, as a page to read: what to build and when it works, its concepts (with links and language notes), and its
 * questions. The actions live in the box at the bottom, so the card doesn't repeat them.
 */
export function StepCard({
  view,
  step,
  layer,
  language,
}: {
  view: ChatView;
  step: Step;
  layer: { status: LayerStatus; data: LanguageLayer | null } | null;
  language: Language | null;
}) {
  const { map, progress } = view;
  const status = progress.steps.find((s) => s.id === step.id);
  const concepts = step.concepts.map((id) => map.concepts.find((c) => c.id === id)).filter((c): c is Concept => !!c);
  const answered = new Set(view.answers.map((a) => a.questionId));
  return (
    <article className="page-card step" aria-label={`Step: ${step.title}`}>
      <div className="card-head">
        <p className="eyebrow">
          {stepLabel(map, step.id)}
          {!step.optional && ` of ${progress.counts.stepsRequired}`}
        </p>
        <span className="pills">
          {status?.built && <span className="pill ok">Review passed</span>}
          {status?.understood && status.questions.length > 0 && <span className="pill ok">Questions answered</span>}
        </span>
      </div>
      <h2 className="ctitle">{step.title}</h2>
      <p className="lede">{step.objective}</p>
      <div className="works">
        <p className="k">Works when</p>
        <p>{step.check}</p>
        <p className="fine">{CHECKED_BY[status?.check ?? "manual"]}</p>
      </div>
      {concepts.length > 0 && (
        <section className="concepts" aria-label="Concepts in this step">
          <h3 className="h3">Concepts in this step</h3>
          <div className="concept-list">
            {concepts.map((c) => (
              <ConceptBlock key={c.id} concept={c} notes={layer?.data?.concepts.find((n) => n.concept === c.id) ?? null} language={language} />
            ))}
          </div>
        </section>
      )}
      {language && layer && layer.status !== "ready" && (
        <p className="quiet loading">
          {layer.status === "failed" ? `The ${LANGUAGES[language]} notes couldn't be loaded. Ask the mentor` : `Looking up how ${LANGUAGES[language]} handles these concepts`}
        </p>
      )}
      {status && status.questions.length > 0 && (
        <>
          <h3 className="h3">Explain in your own words</h3>
          <QuestionList questions={view.questions.filter((q) => q.step === step.id)} answered={answered} label={(q) => conceptName(map, q.concept)} done="Explained" />
        </>
      )}
    </article>
  );
}

/** A concept folded to its name and why it's here. Open, it reads: the idea, its parts, the language notes, then links. */
function ConceptBlock({ concept, notes, language }: { concept: Concept; notes: LanguageLayer["concepts"][number] | null; language: Language | null }) {
  return (
    <details className="concept">
      <summary>
        <h4>{concept.name}</h4>
        <span className="chev" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6l4 4 4-4" />
          </svg>
        </span>
        <span className="why">{concept.why_here}</span>
      </summary>
      <div className="concept-body">
        <div className="note-body">
          {concept.explanation.split(/\n\s*\n/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        {concept.covers.length > 0 && (
          <p className="covers">
            {concept.covers.map((part) => (
              <span key={part}>{part}</span>
            ))}
          </p>
        )}
        {notes && language && (
          <div className="in-lang">
            <p className="k">In {LANGUAGES[language]}</p>
            <p>{notes.in_this_language}</p>
            {(notes.study.length > 0 || notes.guides.length > 0) && (
              <ul className="api">
                {notes.study.map((item) => (
                  <li key={item.url + item.name}>
                    <a href={item.url} target="_blank" rel="noreferrer">
                      <code>{item.name}</code>
                    </a>{" "}
                    {item.why}
                  </li>
                ))}
                {notes.guides.map((g) => (
                  <li key={g.url}>
                    <a href={g.url} target="_blank" rel="noreferrer">
                      {g.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {concept.resources.length > 0 && (
          <div>
            <p className="k">Read more</p>
            <ul className="reads">
              {concept.resources.map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.title}
                  </a>
                  <span className="src">{host(r.url)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

const REVIEW_BADGE = {
  running: ["plain", "Running"],
  passed: ["ok", "Passed"],
  failed: ["warn", "Not yet"],
  error: ["plain", "Couldn't run"],
} as const;

const Tick = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 6.2 5 8.5l4.5-5" />
  </svg>
);
const Cross = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" />
  </svg>
);

/** A sandbox review: the verdict in words, the checks with the failed ones first, and what to fix. */
export function ReviewCard({ map, review }: { map: ProjectMap; review: Review }) {
  const [tone, word] = REVIEW_BADGE[review.status];
  const cases = review.result?.check.cases ?? [];
  const passed = cases.filter((c) => c.passed).length;
  const shown = [...cases].sort((a, b) => Number(a.passed) - Number(b.passed)).slice(0, 12);
  const plan = review.result?.plan;
  const changed = review.result?.diffStat?.split("\n").at(-1)?.trim();
  return (
    <article className={`review is-${review.status}`} aria-label={`Review of ${stepLabel(map, review.stepId)}`}>
      <div className="r-head">
        <span className={`badge ${tone}`}>{word}</span>
        <h3 className="r-title">Review of {stepLabel(map, review.stepId).toLowerCase()}</h3>
        {cases.length > 0 && (
          <span className="r-meta">
            {passed} of {cases.length} checks passed
          </span>
        )}
      </div>
      {review.verdict && <p className="verdict">{review.verdict.summary}</p>}
      {review.status === "error" && <p className="verdict">The sandbox couldn&apos;t finish this review ({review.error}). Ask for it again.</p>}
      {review.result?.build && !review.result.build.ok && (
        <details className="note" open>
          <summary>The build failed</summary>
          <pre className="log">{review.result.build.log}</pre>
        </details>
      )}
      {shown.length > 0 && (
        <ul className="checks">
          {shown.map((c) => (
            <li key={c.name} className={c.passed ? "pass" : "fail"}>
              <span className="ck">{c.passed ? <Tick /> : <Cross />}</span>
              <span className="cname">
                <span className="sr">{c.passed ? "Passed: " : "Not passed: "}</span>
                {c.name}
                {!c.passed && c.detail && <span className="detail">{c.detail}</span>}
              </span>
            </li>
          ))}
          {cases.length > 12 && (
            <li className="more">
              {cases.length - 12} more, {cases.slice(12).filter((c) => !c.passed).length} not passed
            </li>
          )}
        </ul>
      )}
      {review.verdict && review.verdict.problems.length > 0 && (
        <div>
          <p className="k">To fix</p>
          <ol className="problems">
            {review.verdict.problems.map((p, i) => (
              <li key={i}>
                {p.where && <span className="where">{p.where}</span>}
                <span>{p.what}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {plan?.run && (
        <p className="fine plan">
          Built with <code>{plan.build ?? "no build step"}</code>, ran with <code>{plan.run}</code>. Not right? Tell the mentor the commands.
        </p>
      )}
      {changed && (
        <p className="fine">
          {changed}
          {review.baseSha ? " since your last approved review" : " (first review)"}
        </p>
      )}
    </article>
  );
}

export function CompleteCard({ slug, progress }: { slug: string; progress: Progress }) {
  return (
    <article className="page-card complete" aria-label="Project complete">
      <p className="eyebrow">Done</p>
      <h2 className="ctitle">Project complete</h2>
      <p>
        All {progress.counts.stepsRequired} steps passed their reviews, and you answered all {progress.counts.questionsRequired} questions in your own words. Your
        learning log has every answer, the links you learned from, and the help you used.
      </p>
      <a className="btn btn-primary" href={`/api/p/${slug}/export`}>
        Export learning log
      </a>
    </article>
  );
}
