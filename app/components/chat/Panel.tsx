"use client";

import { LANGUAGES, stepLabel } from "@/lib/progress";
import type { Review } from "@/lib/repo";
import type { ChatView } from "@/lib/view";

/** The progress rail: stage 0, setup, each step with its review and questions, the concepts, and Export. */
export function Panel({ slug, view }: { slug: string; view: ChatView }) {
  const { map, progress, repo, language } = view;
  const lastReview = (step: string): Review | undefined => [...view.reviews].reverse().find((r) => r.stepId === step);
  const setup = map.steps[0];
  return (
    <aside id="progress-panel" className="rail" aria-label="Your progress">
      <section>
        <h2 className="label">Stages</h2>
        <ol className="stages">
          <li className={progress.stage0.done ? "is-done" : progress.next.kind === "stage0" ? "is-current" : ""}>
            <span className="snum">0</span>
            <span className="stitle">Understand the problem</span>
            <span className="marks" aria-label={`${progress.stage0.questions.filter((q) => q.answered).length} of ${progress.stage0.questions.length} answered`}>
              {progress.stage0.questions.map((q) => (
                <i key={q.id} className={q.answered ? "on" : ""} title={`${q.kind}: ${q.answered ? "answered" : "open"}`} />
              ))}
            </span>
          </li>
          {progress.steps.map((s) => {
            const review = lastReview(s.id);
            const answered = s.questions.filter((q) => q.answered).length;
            return (
              <li key={s.id} className={`${s.done ? "is-done" : ""}${s.current ? " is-current" : ""}${s.optional ? " is-optional" : ""}`}>
                <span className="snum">{s.optional ? "+" : stepLabel(map, s.id).replace("Step ", "")}</span>
                <span className="stitle">{s.title}</span>
                <span className="sstate">
                  <span className={`rv rv-${review?.status ?? (s.built ? "passed" : "none")}`} title="Review">
                    {review?.status === "running" ? "reviewing" : s.built ? "review ✓" : review?.status === "failed" ? "review ✗" : review?.status === "error" ? "review !" : "review"}
                  </span>
                  {s.questions.length > 0 && (
                    <span className={answered === s.questions.length ? "qs on" : "qs"}>
                      q {answered}/{s.questions.length}
                    </span>
                  )}
                </span>
                {s.id === setup?.id && repo.url && (
                  <span className="sdetail">
                    <a href={repo.url} target="_blank" rel="noreferrer">
                      {repo.url.replace("https://github.com/", "")}
                    </a>
                    {repo.run && <code title={repo.run}>{repo.run}</code>}
                  </span>
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
