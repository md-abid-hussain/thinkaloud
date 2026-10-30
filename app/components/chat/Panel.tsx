"use client";

import { LANGUAGES, stepLabel } from "@/lib/progress";
import type { Review } from "@/lib/repo";
import type { ChatView } from "@/lib/view";

const REVIEW_CHIP: Record<Review["status"], [string, string]> = {
  running: ["run", "Reviewing"],
  passed: ["ok", "Reviewed"],
  failed: ["soft", "Not yet"],
  error: ["soft", "Review failed"],
};

/**
 * The progress rail: stage 0, setup, each step with its review and questions, the concepts, and Export.
 * A row jumps to its card in the chat.
 */
export function Panel({ slug, view, onJump }: { slug: string; view: ChatView; onJump: (cardId: string) => void }) {
  const { map, progress, repo, language } = view;
  const lastReview = (step: string): Review | undefined => [...view.reviews].reverse().find((r) => r.stepId === step);
  const setup = map.steps[0];
  const stage0Answered = progress.stage0.questions.filter((q) => q.answered).length;
  return (
    <aside id="panel-progress" className="rail" aria-label="Your progress">
      <section>
        <h2 className="label">Stages</h2>
        <ol className="stages">
          <li className={progress.stage0.done ? "is-done" : progress.next.kind === "stage0" ? "is-current" : ""}>
            <button type="button" className="srow" onClick={() => onJump("card-stage0")}>
              <span className="snum">0</span>
              <span className="stitle">Understand the problem</span>
              <span className="chips">
                <span className={`chip-s ${stage0Answered === progress.stage0.questions.length ? "ok" : ""}`}>
                  Questions {stage0Answered}/{progress.stage0.questions.length}
                </span>
              </span>
            </button>
          </li>
          {progress.steps.map((s) => {
            const review = lastReview(s.id);
            const [tone, word] = review ? REVIEW_CHIP[review.status] : s.built ? REVIEW_CHIP.passed : ["", ""];
            const answered = s.questions.filter((q) => q.answered).length;
            return (
              <li key={s.id} className={`${s.done ? "is-done" : ""}${s.current ? " is-current" : ""}${s.optional ? " is-optional" : ""}`}>
                <button type="button" className="srow" onClick={() => onJump(`card-${s.id}`)} aria-current={s.current ? "step" : undefined}>
                  <span className="snum">{s.optional ? "+" : stepLabel(map, s.id).replace("Step ", "")}</span>
                  <span className="stitle">{s.title}</span>
                  {(word || s.questions.length > 0) && (
                    <span className="chips">
                      {word && <span className={`chip-s ${tone}`}>{word}</span>}
                      {s.questions.length > 0 && (
                        <span className={`chip-s ${answered === s.questions.length ? "ok" : ""}`}>
                          Questions {answered}/{s.questions.length}
                        </span>
                      )}
                    </span>
                  )}
                </button>
                {s.id === setup?.id && repo.url && (
                  <a className="sdetail" href={repo.url} target="_blank" rel="noreferrer" title={repo.run ? `Runs as: ${repo.run}` : undefined}>
                    {repo.url.replace("https://github.com/", "")} ↗
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <h2 className="label">Concepts</h2>
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
                        <a href={r.url} target="_blank" rel="noreferrer">
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
      </section>

      <section className="rail-foot">
        <p className="fine">
          {language ? `Building in ${LANGUAGES[language]}` : "No language yet"}
          {view.layer?.status === "building" && " · looking up notes"}
        </p>
        <p className="fine">
          {progress.counts.stepsDone} of {progress.counts.stepsRequired} steps done · {progress.counts.questionsAnswered} of {progress.counts.questionsRequired} answered
        </p>
        <a className="btn btn-sm btn-ghost" href={`/api/p/${slug}/export`}>
          Export learning log
        </a>
      </section>
    </aside>
  );
}
