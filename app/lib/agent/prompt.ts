import type { ProjectMap } from "../content";
import type { Generated } from "../gen/schema";
import type { LanguageLayer } from "../language/layer";
import { LANGUAGES, questionsOf, stepLabel, type Progress } from "../progress";
import type { Enrollment, Intent, Review } from "../repo";

export { stepLabel };

/**
 * The mentor's system prompt in three blocks, most stable first, so prompt caching can reuse the prefix:
 * 1. how the mentor works (the same for everyone), 2. the project (the same per project),
 * 3. this learner's state and this turn (changes every turn).
 */
export const MENTOR_RULES = `You are the mentor in ThinkAloud. A junior developer is building a Coding Challenges project in their own editor and their own language. They want to understand the concepts underneath and how their language really handles them. You can see the project (concepts, steps, stored questions), their progress, the sandbox reviews of their code, and, once they pick a language, what to study in it.

How a project runs:
0. Understand the problem. The stage 0 card gives a summary and three questions (what, why, how). Once they've read it, ask the questions one at a time. Point out gaps. It's soft: once they move on (link a repo, ask about something else), don't bring stage 0 up again until the steps are done or they ask.
1. Setup. They create a public GitHub repo and paste its link: call link_repo. The setup review clones, builds and runs it, and its card shows the build and run commands it found. Ask once whether those are right, and call set_build with what they confirm or give you.
2. Each step. The step card shows what to build, its concepts and links, and its questions. They learn, build in their editor, push, and ask for a review: call request_review for that step. A step is done when its review passes and its questions are answered. Ask the step's questions when they're ready (the code works, or they ask), one at a time.

How you teach:
- Diagnose before teaching. If their message already shows what they're stuck on, skip ahead. Otherwise ask one short question to find out.
- Move them one step forward every turn: a narrowing hint, a parallel example in words, a restatement of what they already have right, or the right link to read. Never an empty turn.
- Ask at most one question per turn.
- Point to the material instead of rewriting it. The map's links and the language layer's docs are where depth lives.
- Keep replies short: usually under 120 words. Plain, warm, direct. No emoji, no praise before every reply, no cheerleading.
- Be accurate. If you're not sure about an API detail, say so and point to its docs.

The help rule:
- The learner writes the code. You explain, ask and review, in words. You see their code only through review cards or what they paste.
- Give a hint, an example or code whenever they ask, with no reason needed and no limit. Never refuse, ration, or ask them to prove an attempt first.
- Write code only when this turn says "Code allowed: yes". Otherwise name classes, functions and modules in backticks and explain the flow in words, with no code blocks and no pseudo-code.
- When code is allowed: give only the exact piece asked for, at most about 30 lines per part, explain each part briefly, then ask them to explain it back in one line.
- When they're stuck, offer the next level of help (a hint, then an example, then code). Offer, don't impose.

Questions and answers, through your tools only:
- ask_question: right before you ask a stored question. Write it as given.
- mark_answered: when their own words cover the main points the question looks for (its looks_for list). They don't need the same words. Quote the exact sentence from their message that shows it. A partial answer gets one follow-up about the missing point; a recited definition gets a follow-up asking them to apply it to the question's situation.

Reviews:
- request_review: when they say they pushed a step or ask for a review. Only one runs at a time.
- When a review card has arrived, don't repeat it. Help them understand and fix what it found, in words.
- The sandbox brings the challenge's test data itself. Never ask them to commit test files or sample data.
- Reviews can be wrong. When they dispute one, check it against the step's objective and check; if they're right, say so and start the review again.
- Never mark a step done yourself: a passed review and answered questions do that.

Don't repeat the cards. Refer to them instead.
Ids such as s2, s1-q2 or text-encoding are for your tools only. To the learner, use the step labels below (Step 1 is the setup step), the step's title, and the concept's name.`;

export function projectBlock(map: ProjectMap, generated: Generated | null): string {
  const concepts = map.concepts
    .map((c) =>
      [
        `### ${c.name} (id: ${c.id})`,
        c.covers.length ? `Covers: ${c.covers.join("; ")}` : "",
        `Why here: ${c.why_here}`,
        `Note: ${c.explanation}`,
        `Links: ${c.resources.map((r) => `${r.title} <${r.url}>`).join("; ")}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  const questions = questionsOf(generated);
  const qText = (stepId: string | null) =>
    questions
      .filter((q) => (stepId ? q.step === stepId : q.kind))
      .map((q) => `  - Question ${q.id}${q.concept ? ` (${q.concept})` : ` (${q.kind})`}: ${q.prompt}\n    Looks for: ${q.looksFor.join(" · ")}`)
      .join("\n");
  const steps = map.steps
    .map((s) => {
      const check = generated?.profile.steps.find((p) => p.step === s.id);
      return `- ${stepLabel(map, s.id)} (id ${s.id}): ${s.title}. Objective: ${s.objective} Check: ${s.check} Concepts: ${s.concepts.join(", ") || "none"}. Sandbox check: ${check ? `${check.check}, ${check.why}` : "none"}\n${qText(s.id)}`;
    })
    .join("\n");
  const contract = generated
    ? `## How the sandbox runs their code\n${generated.profile.contract.run}\nInput: ${generated.profile.contract.input}\nOutput: ${generated.profile.contract.output}${
        generated.profile.contract.settings.length ? `\nSettings it passes: ${generated.profile.contract.settings.map((s) => `${s.name} (${s.purpose})`).join("; ")}` : ""
      }\n`
    : "";
  return `# Project: ${map.project.title} (${map.project.level})
${map.project.summary}
Original challenge: ${map.project.source_url}

## Stage 0: understand the problem
${generated?.stage0.summary ?? "(no stage 0 for this project)"}
${qText(null)}

${contract}
## Concepts
${concepts}

## Steps
${steps}`;
}

function reviewLine(map: ProjectMap, r: Review): string {
  if (r.status === "running") return `${stepLabel(map, r.stepId)}: running now`;
  if (r.status === "error") return `${stepLabel(map, r.stepId)}: the sandbox failed (${r.error ?? "unknown"}); they can ask again`;
  const v = r.verdict;
  return `${stepLabel(map, r.stepId)} at ${r.headSha?.slice(0, 7)}: ${r.status}. ${v?.summary ?? ""}${v?.problems.length ? ` Problems: ${v.problems.map((p) => `${p.where ? `${p.where}: ` : ""}${p.what}`).join(" | ")}` : ""}`;
}

export function turnBlock(s: {
  map: ProjectMap;
  generated: Generated | null;
  progress: Progress;
  enrollment: Enrollment;
  reviews: Review[];
  answered: string[];
  layer: LanguageLayer | null;
  layerStatus: string | null;
  intent: Intent;
}): string {
  const { map, progress, enrollment } = s;
  const open = enrollment.openQuestion ? questionsOf(s.generated).find((q) => q.id === enrollment.openQuestion) : null;
  const lastReviews = [...new Map(s.reviews.map((r) => [r.stepId, r])).values()].slice(-3);
  const lines = [
    "# This learner, now",
    `Language: ${enrollment.language ? LANGUAGES[enrollment.language] : "not chosen yet. Ask them which one, if they haven't said."}`,
    `Stage 0 questions answered: ${progress.stage0.questions.filter((q) => q.answered).map((q) => q.id).join(", ") || "none"} of ${progress.stage0.questions.length}`,
    `Repo: ${enrollment.repoUrl ?? "not linked yet"}`,
    `Build and run: ${enrollment.runCmd ? `build \`${enrollment.buildCmd ?? "none"}\`, run \`${enrollment.runCmd}\` (${enrollment.runConfirmed ? "confirmed by the learner" : "detected, not confirmed yet"})` : "not known yet"}`,
    `Current step: ${progress.currentStep ? `${stepLabel(map, progress.currentStep.id)}, ${progress.currentStep.title} (id ${progress.currentStep.id})` : "none, all required steps are done"}`,
    `Steps: ${progress.steps.map((st) => `${st.id} ${st.built ? "review passed" : "not reviewed"}, ${st.understood ? "questions answered" : "questions open"}`).join("; ")}`,
    `Questions answered: ${s.answered.join(", ") || "none"}`,
    `Reviews: ${lastReviews.length ? lastReviews.map((r) => reviewLine(map, r)).join("\n  ") : "none yet"}`,
    `Open question: ${open ? `${open.id}: ${open.prompt}` : "none"}`,
    `Project complete: ${progress.complete ? "yes" : "no"}`,
  ];
  if (enrollment.language) {
    if (s.layer) lines.push("", `# What to study in ${LANGUAGES[enrollment.language]}`, layerSummary(s.layer));
    else lines.push("", `The ${LANGUAGES[enrollment.language]} study notes are ${s.layerStatus === "failed" ? "unavailable" : "still being looked up"}. Name the main classes or modules yourself if they ask.`);
  }
  lines.push(
    "",
    "# This turn",
    `The learner's message is labelled: ${s.intent === "explaining" ? "Explaining" : s.intent === "code" ? "Code" : "Help"}`,
    `Code allowed: ${s.intent === "code" ? "yes" : "no"}`,
  );
  return lines.join("\n");
}

function layerSummary(layer: LanguageLayer): string {
  return layer.concepts
    .map((c) => `- ${c.concept}: ${c.in_this_language} Study: ${c.study.map((i) => `${i.name} <${i.url}>`).join(", ") || "none"}`)
    .join("\n");
}
