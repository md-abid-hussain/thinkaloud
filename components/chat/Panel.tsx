"use client";

import { LANGUAGES } from "@/lib/progress";
import type { Review } from "@/lib/repo";
import type { ChatView } from "@/lib/view";

const REVIEW_WORD: Record<Review["status"], string> = {
  running: "Reviewing",
  passed: "Review passed",
  failed: "Review: not yet",
  error: "Review couldn't run",
};

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 6.2 5 8.5l4.5-5" />
    </svg>
  );
}

/** One stop on the path: a dot (done, now or to do), the title, and one line of detail for the current stop only. */
function Stop({ title, state, sub, optional, onClick }: { title: string; state: "done" | "now" | "todo"; sub?: string; optional?: boolean; onClick: () => void }) {
  return (
    <li className={`is-${state}${optional ? " is-optional" : ""}`}>
      <button type="button" className="prow" onClick={onClick} aria-current={state === "now" ? "step" : undefined}>
        <span className="dot">{state === "done" && <Check />}</span>
        <span className="t">
          <span className="stitle">{title}</span>
          {sub && <span className="sub">{sub}</span>}
          <span className="sr">{state === "done" ? ", done" : state === "now" ? ", current" : ""}</span>
        </span>
      </button>
    </li>
  );
}

/**
 * The outline: the path (the problem, setup, each step) as a quiet list of dots, the concepts as one line that opens,
 * and the language and Export at the foot. A stop jumps to its card in the chat.
 */
export function Panel({ slug, view, onJump }: { slug: string; view: ChatView; onJump: (cardId: string) => void }) {
  const { map, progress, repo, language } = view;
  const lastReview = (step: string): Review | undefined => [...view.reviews].reverse().find((r) => r.stepId === step);
  const stage0Answered = progress.stage0.questions.filter((q) => q.answered).length;
  const stage0Now = progress.next.kind === "stage0" || progress.next.kind === "choose-language";
  const { conceptsExplained, conceptsRequired } = progress.counts;
  return (
    <aside id="panel-progress" className="rail" aria-label="Your progress">
      <nav aria-label="Your path">
        <h2 className="o-h">Your path</h2>
        <ol className="path">
          <Stop
            title="Understand the problem"
            state={progress.stage0.done ? "done" : stage0Now ? "now" : "todo"}
            sub={stage0Now ? `${stage0Answered} of ${progress.stage0.questions.length} answered` : undefined}
            onClick={() => onJump("card-stage0")}
          />
          {progress.steps.map((s) => {
            const review = lastReview(s.id);
            const answered = s.questions.filter((q) => q.answered).length;
            const now = s.current && !stage0Now;
            const sub = now
              ? [review ? REVIEW_WORD[review.status] : s.built ? REVIEW_WORD.passed : null, s.questions.length ? `${answered} of ${s.questions.length} explained` : null]
                  .filter(Boolean)
                  .join(" · ")
              : s.optional
                ? "Optional"
                : undefined;
            return (
              <Stop
                key={s.id}
                title={s.title}
                state={s.done ? "done" : now ? "now" : "todo"}
                sub={sub || undefined}
                optional={s.optional}
                onClick={() => onJump(`card-${s.id}`)}
              />
            );
          })}
        </ol>
      </nav>

      <section className="o-concepts" aria-labelledby="concepts-h">
        <h2 className="o-h" id="concepts-h">
          Concepts
        </h2>
        <div className="o-meter" aria-hidden="true">
          {progress.concepts
            .filter((c) => !c.optional)
            .map((c) => (
              <i key={c.id} className={c.explained ? "d" : ""} />
            ))}
        </div>
        <details className="all-concepts">
          <summary>
            {conceptsExplained} of {conceptsRequired} explained · <span className="u">See all</span>
          </summary>
          <ul className="clist">
            {progress.concepts.map((c) => {
              const concept = map.concepts.find((x) => x.id === c.id)!;
              return (
                <li key={c.id} className={c.explained ? "is-done" : ""}>
                  <details>
                    <summary>
                      <i aria-hidden="true" />
                      <span>{c.name}</span>
                      <span className="sr">{c.explained ? ", explained" : ", not explained yet"}</span>
                      {c.optional && <span className="opt">optional</span>}
                    </summary>
                    <ul className="reads">
                      {concept.resources.map((r) => (
                        <li key={r.url}>
                          <a href={r.url} target="_blank" rel="noopener noreferrer">
                            {r.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        </details>
      </section>

      <section className="o-foot" aria-label="Project">
        <p>
          {language ? `Building in ${LANGUAGES[language]}` : "No language yet"}
          {view.layer?.status === "building" && " · looking up notes"}
        </p>
        {repo.url && (
          <a href={repo.url} target="_blank" rel="noopener noreferrer" title={repo.run ? `Runs as: ${repo.run}` : undefined}>
            Your repo ↗
          </a>
        )}
        <a href={`/api/p/${slug}/export`}>Export learning log</a>
      </section>
    </aside>
  );
}
