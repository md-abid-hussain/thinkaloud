import type { ProjectMap } from "./content";
import type { Generated } from "./gen/schema";
import { ensureLanguageLayer } from "./language/build";
import { getLayer, type LanguageLayer, type LayerStatus } from "./language/layer";
import { questionsOf, type Language, type Progress, type Question } from "./progress";
import { getOrCreateEnrollment, loadState, syncCards, type Answer, type Message, type Review } from "./repo";

/** Everything the chat page needs, in one response. Checks and fixtures stay on the server. */
export type ChatView = {
  map: ProjectMap;
  stage0Summary: string | null;
  contract: Generated["profile"]["contract"] | null;
  questions: Question[];
  language: Language | null;
  openQuestion: string | null;
  repo: { url: string | null; build: string | null; run: string | null; confirmed: boolean };
  messages: Message[];
  answers: Answer[];
  reviews: Review[];
  progress: Progress;
  layer: { status: LayerStatus; data: LanguageLayer | null } | null;
  pending: number | null;
  reviewing: boolean;
};

export async function chatView(learnerId: string, slug: string): Promise<ChatView> {
  const enrollment = await getOrCreateEnrollment(learnerId, slug);
  // A review that finished since the last turn may have moved the next step on; its card belongs in the chat now.
  // The state is loaded once, and again only when a card was added.
  let state = await loadState(enrollment.id);
  if (await syncCards(enrollment.id, state)) state = await loadState(enrollment.id);
  let layer = state.enrollment.language ? await getLayer(slug, state.enrollment.language) : null;
  // A language without study notes (never built, or the last build failed) starts a build in the background.
  if (state.enrollment.language && (!layer || layer.status === "failed")) {
    ensureLanguageLayer(slug, state.enrollment.language);
    layer = { status: "building", layer: null, error: null };
  }
  const e = state.enrollment;
  return {
    map: state.map,
    stage0Summary: state.generated?.stage0.summary ?? null,
    contract: state.generated?.profile.contract ?? null,
    questions: questionsOf(state.generated),
    language: e.language,
    openQuestion: e.openQuestion,
    repo: { url: e.repoUrl, build: e.buildCmd, run: e.runCmd, confirmed: e.runConfirmed },
    messages: state.messages,
    answers: [...state.answers.values()],
    reviews: state.reviews,
    progress: state.progress,
    layer: layer ? { status: layer.status, data: layer.layer } : null,
    pending: state.messages.find((m) => m.status === "pending")?.id ?? null,
    reviewing: state.reviews.some((r) => r.status === "running"),
  };
}
