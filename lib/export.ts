import { LANGUAGES, questionsOf, stepLabel } from "./progress";
import type { EnrollmentState } from "./repo";

/** The learning log: the problem and each concept in the learner's own words, the reviewed steps, and the help used. */
export function learningLog(state: EnrollmentState, now = new Date()): string {
  const { map, generated, progress, enrollment, messages, answers, reviews } = state;
  const questions = questionsOf(generated);
  const quote = (id: string) => answers.get(id)?.quote;
  const lines: string[] = [
    `# Learning log: ${map.project.title}`,
    "",
    `Exported from ThinkAloud on ${now.toISOString().slice(0, 10)}. Project from Coding Challenges by John Crickett: ${map.project.source_url}`,
    "",
    `- Language: ${enrollment.language ? LANGUAGES[enrollment.language] : "not chosen"}`,
    `- Repo: ${enrollment.repoUrl ?? "not linked"}`,
    `- Steps done (review passed and questions answered): ${progress.counts.stepsDone} of ${progress.counts.stepsRequired}`,
    `- Questions answered: ${progress.counts.questionsAnswered} of ${progress.counts.questionsRequired}`,
    `- Status: ${progress.complete ? "complete" : "in progress"}`,
    "",
    "## The problem, in my own words",
    "",
  ];
  for (const q of questions.filter((q) => q.kind)) {
    lines.push(`**${q.prompt}**`, "", quote(q.id) ? `> ${quote(q.id)}` : "_Not answered yet._", "");
  }
  lines.push("## Concepts, in my own words", "");
  for (const concept of map.concepts) {
    const qs = questions.filter((q) => q.concept === concept.id);
    lines.push(`### ${concept.name}`, "");
    for (const q of qs) lines.push(`**${q.prompt}**`, "", quote(q.id) ? `> ${quote(q.id)}` : "_Not answered yet._", "");
    lines.push(`Read: ${concept.resources.map((r) => `[${r.title}](${r.url})`).join(", ")}`, "");
  }
  lines.push("## Steps", "");
  for (const step of progress.steps) {
    const passed = [...reviews].reverse().find((r) => r.stepId === step.id && r.status === "passed");
    lines.push(
      `- [${step.done ? "x" : " "}] ${stepLabel(map, step.id)}: ${step.title}${step.optional ? " (optional)" : ""}${passed ? ` · review passed at ${passed.headSha?.slice(0, 7)}` : ""}`,
    );
  }
  const help = messages.filter((m) => m.role === "learner" && (m.intent === "help" || m.intent === "code"));
  const code = messages.filter((m) => m.role === "mentor" && m.meta.codeShown);
  lines.push(
    "",
    "## Help used",
    "",
    `- Questions and help requests: ${help.length}`,
    `- Times code was shown: ${code.length}`,
    `- Sandbox reviews: ${reviews.filter((r) => r.status !== "running").length}`,
    "",
  );
  for (const m of help.filter((h) => h.intent === "code")) {
    lines.push(`- Asked for code on ${m.createdAt.slice(0, 10)}: "${m.text.slice(0, 120).replace(/\s+/g, " ")}"`);
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
