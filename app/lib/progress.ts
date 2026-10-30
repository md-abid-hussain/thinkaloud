import type { Concept, ProjectMap, Step } from "./content";
import type { Generated } from "./gen/schema";

export const LANGUAGES = {
  java: "Java",
  python: "Python",
  node: "Node.js",
} as const;
export type Language = keyof typeof LANGUAGES;

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && value in LANGUAGES;
}

/**
 * A stored question (HANDOFF.md section 2): stage 0 asks what, why and how about the problem; each step asks about its
 * concepts. They come from the generated layer, made once and kept for everyone.
 */
export type Question = {
  id: string;
  kind: "what" | "why" | "how" | null;
  step: string | null;
  concept: string | null;
  prompt: string;
  looksFor: string[];
};

export function questionsOf(generated: Generated | null): Question[] {
  if (!generated) return [];
  return [
    ...generated.stage0.questions.map((q) => ({ id: q.id, kind: q.kind, step: null, concept: null, prompt: q.prompt, looksFor: q.looks_for })),
    ...generated.questions.map((q) => ({ id: q.id, kind: null, step: q.step, concept: q.concept, prompt: q.prompt, looksFor: q.looks_for })),
  ];
}

export type ProgressInput = {
  map: ProjectMap;
  generated: Generated | null;
  /** Question ids with an accepted answer. */
  answered: ReadonlySet<string>;
  /** Step ids whose sandbox review passed. */
  built: ReadonlySet<string>;
  language: Language | null;
  openQuestion: string | null;
  repoUrl: string | null;
  /** The step a review is running for, if any. */
  reviewing: string | null;
};

export type StepProgress = {
  id: string;
  number: number;
  title: string;
  optional: boolean;
  check: "auto" | "partly" | "manual";
  /** The sandbox review passed. */
  built: boolean;
  /** Every question for this step is answered. */
  understood: boolean;
  done: boolean;
  current: boolean;
  questions: { id: string; answered: boolean }[];
};

export type ConceptProgress = {
  id: string;
  name: string;
  /** Every question about it is answered. */
  explained: boolean;
  /** Used only by optional steps, so not needed to finish the project. */
  optional: boolean;
  questions: string[];
};

export type NextAction =
  | { kind: "choose-language"; text: string }
  | { kind: "stage0"; text: string }
  | { kind: "link-repo"; text: string }
  | { kind: "answer"; text: string; question: string }
  | { kind: "reviewing"; text: string; step: string }
  | { kind: "build"; text: string; step: string }
  | { kind: "questions"; text: string; step: string }
  | { kind: "complete"; text: string };

export type Progress = {
  stage0: { done: boolean; questions: { id: string; kind: string; answered: boolean }[] };
  steps: StepProgress[];
  concepts: ConceptProgress[];
  currentStep: Step | null;
  complete: boolean;
  counts: { stepsDone: number; stepsRequired: number; questionsAnswered: number; questionsRequired: number; conceptsExplained: number; conceptsRequired: number };
  next: NextAction;
};

/** The step numbers the learner sees: required steps count from 1, optional steps are named as such. */
export function stepLabel(map: ProjectMap, id: string): string {
  const step = map.steps.find((s) => s.id === id);
  if (!step) return id;
  if (step.optional) return "Optional step";
  return `Step ${map.steps.filter((s) => !s.optional).findIndex((s) => s.id === id) + 1}`;
}

/** Everything about progress that is worked out rather than stored. */
export function deriveProgress(input: ProgressInput): Progress {
  const { map, generated, answered, built } = input;
  const questions = questionsOf(generated);
  const stage0Qs = questions.filter((q) => q.kind);
  const stage0 = {
    questions: stage0Qs.map((q) => ({ id: q.id, kind: q.kind!, answered: answered.has(q.id) })),
    done: stage0Qs.every((q) => answered.has(q.id)),
  };

  const checkOf = (id: string) => generated?.profile.steps.find((s) => s.step === id)?.check ?? "manual";
  const stepRows = map.steps.map((s, i) => {
    const qs = questions.filter((q) => q.step === s.id).map((q) => ({ id: q.id, answered: answered.has(q.id) }));
    const understood = qs.every((q) => q.answered);
    return { id: s.id, number: i, title: s.title, optional: s.optional, check: checkOf(s.id), built: built.has(s.id), understood, done: built.has(s.id) && understood, questions: qs };
  });
  const currentStep = map.steps.find((s, i) => !s.optional && !stepRows[i].done) ?? null;
  const steps: StepProgress[] = stepRows.map((s) => ({ ...s, current: currentStep?.id === s.id }));

  const requiredSteps = new Set(map.steps.filter((s) => !s.optional).map((s) => s.id));
  const concepts: ConceptProgress[] = map.concepts.map((c) => {
    const qs = questions.filter((q) => q.concept === c.id).map((q) => q.id);
    return {
      id: c.id,
      name: c.name,
      explained: qs.length > 0 && qs.every((id) => answered.has(id)),
      optional: !map.steps.some((s) => requiredSteps.has(s.id) && s.concepts.includes(c.id)),
      questions: qs,
    };
  });

  const requiredQs = questions.filter((q) => q.kind || (q.step && requiredSteps.has(q.step)));
  const counts = {
    stepsDone: steps.filter((s) => !s.optional && s.done).length,
    stepsRequired: steps.filter((s) => !s.optional).length,
    questionsAnswered: requiredQs.filter((q) => answered.has(q.id)).length,
    questionsRequired: requiredQs.length,
    conceptsExplained: concepts.filter((c) => !c.optional && c.explained).length,
    conceptsRequired: concepts.filter((c) => !c.optional).length,
  };
  const complete = counts.stepsDone === counts.stepsRequired && stage0.done;

  return { stage0, steps, concepts, currentStep, complete, counts, next: nextAction(input, { stage0, steps, currentStep, complete, counts }, questions) };
}

function nextAction(
  input: ProgressInput,
  s: Pick<Progress, "stage0" | "steps" | "currentStep" | "complete" | "counts">,
  questions: Question[],
): NextAction {
  const { map } = input;
  const conceptName = (id: string | null) => map.concepts.find((c: Concept) => c.id === id)?.name ?? "";

  if (s.complete) return { kind: "complete", text: "Project complete. Export your learning log from the progress panel." };
  if (!input.language) {
    return { kind: "choose-language", text: "Tell the mentor which language you're building in: Java, Python or Node.js." };
  }
  const open = input.openQuestion ? questions.find((q) => q.id === input.openQuestion) : null;
  if (open) {
    const about = open.kind ? "the problem" : `“${conceptName(open.concept)}”`;
    return { kind: "answer", question: open.id, text: `Answer the mentor's question on ${about} in your own words.` };
  }
  if (!s.stage0.done && !input.repoUrl) {
    return { kind: "stage0", text: "Read the problem, then answer its three questions in your own words. Ask anything first." };
  }
  if (!input.repoUrl) {
    return { kind: "link-repo", text: "Create a public GitHub repo for your project and paste its link here." };
  }
  if (input.reviewing) {
    return { kind: "reviewing", step: input.reviewing, text: `Reviewing ${stepLabel(map, input.reviewing)} in the sandbox. It takes about a minute.` };
  }
  const step = s.currentStep ? s.steps.find((st) => st.id === s.currentStep!.id)! : null;
  if (step && !step.built) {
    return {
      kind: "build",
      step: step.id,
      text: `${stepLabel(map, step.id)} of ${s.counts.stepsRequired}: ${step.title}. Build it, push, and ask for a review.`,
    };
  }
  if (step && !step.understood) {
    const nextToBuild = s.steps.find((st) => !st.optional && !st.built);
    return {
      kind: "questions",
      step: step.id,
      text: `${stepLabel(map, step.id)} works. Answer its questions to finish it (say "ask me")${nextToBuild ? `, or start on ${stepLabel(map, nextToBuild.id)}` : ""}.`,
    };
  }
  return { kind: "stage0", text: `Last thing: answer the three questions about the problem. Say "ask me".` };
}
