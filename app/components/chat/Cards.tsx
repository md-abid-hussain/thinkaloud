"use client";

import type { Concept, ProjectMap, Step } from "@/lib/content";
import type { LanguageLayer, LayerStatus } from "@/lib/language/layer";
import { LANGUAGES, stepLabel, type Language, type Progress, type Question } from "@/lib/progress";
import type { Review } from "@/lib/repo";
import type { ChatView } from "@/lib/view";

const KIND_LABEL = { what: "What", why: "Why", how: "How" } as const;

/** The first card: what the project is, what you'll learn, how it works, and the first thing to do. */
export function WelcomeCard({ map, language, onPickLanguage }: { map: ProjectMap; language: Language | null; onPickLanguage: (language: Language) => void }) {
  return (
    <article className="card-msg welcome" aria-label="About this project">
      <p className="label">
        Your project · <b>{map.project.level}</b>
      </p>
      <h2>{map.project.title}</h2>
      <p className="summary">{map.project.summary}</p>
      <div className="cols">
        <section>
          <h3 className="label">What you&apos;ll learn</h3>
          <ul className="concept-names">
            {map.concepts.map((c) => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="label">How it works</h3>
          <ol className="howto">
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

function QuestionList({ questions, answered, label }: { questions: Question[]; answered: Set<string>; label: (q: Question) => string }) {
  if (!questions.length) return null;
  return (
    <ol className="qlist">
      {questions.map((q) => (
        <li key={q.id} className={answered.has(q.id) ? "is-answered" : ""}>
          <span className="qk">{label(q)}</span>
          <span className="qp">{q.prompt}</span>
          {answered.has(q.id) && <span className="pill ok">Answered</span>}
        </li>
      ))}
    </ol>
  );
}

/** Stage 0: the problem in our words and three questions that show the learner read and understood it. */
export function Stage0Card({ view, onSend }: { view: ChatView; onSend: (text: string) => void }) {
  const answered = new Set(view.answers.map((a) => a.questionId));
  const questions = view.questions.filter((q) => q.kind);
  const done = questions.every((q) => answered.has(q.id));
  return (
    <article className="card-msg stage0" aria-label="Understand the problem">
      <div className="card-head">
        <p className="label">
          Stage 0 · <b>understand the problem</b>
        </p>
        {done && <span className="pill ok">Done</span>}
      </div>
      <h2>What you&apos;re building</h2>
      <p className="summary">{view.stage0Summary}</p>
      <h3 className="label">Answer in your own words</h3>
      <QuestionList questions={questions} answered={answered} label={(q) => KIND_LABEL[q.kind!]} />
      {!done && (
        <div className="card-actions">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onSend("I've read it. Ask me the questions about the problem.")}>
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
    <article className="card-msg step" aria-label="Set up">
      <div className="card-head">
        <p className="label">{stepLabel(view.map, step.id)} · set up</p>
        {status?.built && <span className="pill ok">Runs in the sandbox</span>}
      </div>
      <h2>{step.title}</h2>
      <dl className="rows">
        <div>
          <dt className="label">Build</dt>
          <dd>{step.objective}</dd>
        </div>
        <div>
          <dt className="label">Repo</dt>
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
            <dt className="label">Sandbox</dt>
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
            <dt className="label">Runs as</dt>
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
      <QuestionList questions={view.questions.filter((q) => q.step === step.id)} answered={answered} label={() => "Explain"} />
    </article>
  );
}

const CHECKED_BY = {
  auto: "The sandbox runs your code and checks it",
  partly: "The sandbox checks part of it; the reviewer reads the rest",
  manual: "The reviewer reads your changes",
} as const;

/** A step: what to build, how it's checked, its concepts with links and language notes, and its questions. */
export function StepCard({
  view,
  step,
  layer,
  language,
  onSend,
}: {
  view: ChatView;
  step: Step;
  layer: { status: LayerStatus; data: LanguageLayer | null } | null;
  language: Language | null;
  onSend: (text: string) => void;
}) {
  const { map, progress } = view;
  const status = progress.steps.find((s) => s.id === step.id);
  const concepts = step.concepts.map((id) => map.concepts.find((c) => c.id === id)).filter((c): c is Concept => !!c);
  const answered = new Set(view.answers.map((a) => a.questionId));
  const label = stepLabel(map, step.id);
  return (
    <article className="card-msg step" aria-label={`Step: ${step.title}`}>
      <div className="card-head">
        <p className="label">
          {label}
          {!step.optional && ` of ${progress.counts.stepsRequired}`}
        </p>
        <span className="pills">
          {status?.built && <span className="pill ok">Review passed</span>}
          {status?.understood && status.questions.length > 0 && <span className="pill ok">Questions answered</span>}
        </span>
      </div>
      <h2>{step.title}</h2>
      <dl className="rows">
        <div>
          <dt className="label">Build</dt>
          <dd>{step.objective}</dd>
        </div>
        <div>
          <dt className="label">Works when</dt>
          <dd>{step.check}</dd>
        </div>
        <div>
          <dt className="label">Checked</dt>
          <dd>{CHECKED_BY[status?.check ?? "manual"]}</dd>
        </div>
      </dl>
      {concepts.length > 0 && (
        <section className="concepts">
          <h3 className="label">Concepts in this step</h3>
          {concepts.map((c) => (
            <ConceptBlock key={c.id} concept={c} notes={layer?.data?.concepts.find((n) => n.concept === c.id) ?? null} language={language} />
          ))}
        </section>
      )}
      {language && layer && layer.status !== "ready" && (
        <p className="quiet loading">
          {layer.status === "failed" ? `The ${LANGUAGES[language]} notes couldn't be loaded. Ask the mentor` : `Looking up how ${LANGUAGES[language]} handles these concepts`}
        </p>
      )}
      {status && status.questions.length > 0 && (
        <>
          <h3 className="label qhead">Explain in your own words</h3>
          <QuestionList questions={view.questions.filter((q) => q.step === step.id)} answered={answered} label={() => "Explain"} />
        </>
      )}
      {!status?.done && (
        <div className="card-actions">
          {!status?.built && (
            <button type="button" className="btn btn-sm btn-primary" disabled={view.reviewing} onClick={() => onSend(`I pushed ${label}. Please review it.`)}>
              Review my code
            </button>
          )}
          {status && !status.understood && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => onSend(`Ask me ${label}'s questions.`)}>
              Ask me the questions
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function ConceptBlock({ concept, notes, language }: { concept: Concept; notes: LanguageLayer["concepts"][number] | null; language: Language | null }) {
  return (
    <div className="concept">
      <h4>{concept.name}</h4>
      <p className="why">{concept.why_here}</p>
      {concept.covers.length > 0 && (
        <p className="covers">
          {concept.covers.map((part) => (
            <span key={part} className="chip">
              {part}
            </span>
          ))}
        </p>
      )}
      <ul className="reads">
        {concept.resources.map((r) => (
          <li key={r.url}>
            <a href={r.url} target="_blank" rel="noreferrer">
              {r.title}
            </a>
          </li>
        ))}
      </ul>
      {notes && language && (
        <div className="in-lang">
          <p className="label">In {LANGUAGES[language]}</p>
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
      <details className="note">
        <summary>Read the short note</summary>
        <div className="note-body">
          {concept.explanation.split(/\n\s*\n/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </details>
    </div>
  );
}

const REVIEW_PILL = {
  running: ["plain", "Running"],
  passed: ["ok", "Passed"],
  failed: ["soft", "Not yet"],
  error: ["plain", "Couldn't run"],
} as const;

/** A sandbox review: the reviewer's verdict in words, the checks, and what to fix. */
export function ReviewCard({ map, review }: { map: ProjectMap; review: Review }) {
  const [tone, word] = REVIEW_PILL[review.status];
  const cases = review.result?.check.cases ?? [];
  const passed = cases.filter((c) => c.passed).length;
  const plan = review.result?.plan;
  return (
    <article className={`card-msg review is-${review.status}`} aria-label={`Review of ${stepLabel(map, review.stepId)}`}>
      <div className="card-head">
        <p className="label">
          Review · {stepLabel(map, review.stepId)}
          {review.headSha && <span className="mono"> · {review.headSha.slice(0, 7)}</span>}
        </p>
        <span className={`pill ${tone}`}>{word}</span>
      </div>
      {review.verdict && <p className="verdict">{review.verdict.summary}</p>}
      {review.status === "error" && <p className="verdict">The sandbox couldn&apos;t finish this review ({review.error}). Ask for it again.</p>}
      {review.result?.build && !review.result.build.ok && (
        <details className="note" open>
          <summary>The build failed</summary>
          <pre className="log">{review.result.build.log}</pre>
        </details>
      )}
      {cases.length > 0 && (
        <>
          <p className="label">
            Checks · {passed} of {cases.length}
          </p>
          <ul className="points">
            {cases.slice(0, 12).map((c) => (
              <li key={c.name} className={c.passed ? "met" : "missed"}>
                <span className="pname">{c.name}</span>
                {!c.passed && <span className="pdetail">{c.detail}</span>}
              </li>
            ))}
            {cases.length > 12 && <li className="more">{cases.length - 12} more, {cases.slice(12).filter((c) => !c.passed).length} not passed</li>}
          </ul>
        </>
      )}
      {review.verdict && review.verdict.problems.length > 0 && (
        <>
          <p className="label">To fix</p>
          <ol className="problems">
            {review.verdict.problems.map((p, i) => (
              <li key={i}>
                {p.where && <span className="where">{p.where}</span>}
                <span>{p.what}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {plan?.run && (
        <p className="fine plan">
          Built with <code>{plan.build ?? "no build step"}</code>, ran with <code>{plan.run}</code>. Not right? Tell the mentor the commands.
        </p>
      )}
      {review.result?.diffStat && <p className="fine">{review.result.diffStat.split("\n").at(-1)?.trim()}{review.baseSha ? ` since ${review.baseSha.slice(0, 7)}` : " (first review)"}</p>}
    </article>
  );
}

export function CompleteCard({ slug, progress }: { slug: string; progress: Progress }) {
  return (
    <article className="card-msg complete" aria-label="Project complete">
      <p className="label">
        <b>Done</b>
      </p>
      <h2>Project complete</h2>
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
