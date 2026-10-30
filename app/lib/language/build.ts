import { getGenerated, getMap } from "../content";
import { MODELS, researchModel } from "../agent/models";
import { env } from "../env";
import { typeGuide } from "../gen/sources";
import type { Language } from "../progress";
import { SEARCH_COST_USD, recordUsage } from "../spend";
import { researchLayer } from "./agent";
import { claimLayerBuild, failLayer, saveLayer } from "./layer";
import { checkLinks, linkupSearch } from "./web";

/**
 * Makes sure a project's study notes exist for a language. The first learner to pick it starts the
 * build in the background; everyone after shares the result. Returns at once.
 */
export function ensureLanguageLayer(project: string, language: Language): void {
  void (async () => {
    if (!(await claimLayerBuild(project, language))) return;
    await buildLayer(project, language);
  })();
}

/** Builds and saves one layer, guided by the project type's playbook. The caller has claimed the build. */
export async function buildLayer(project: string, language: Language): Promise<boolean> {
  try {
    const [map, generated] = await Promise.all([getMap(project), getGenerated(project)]);
    if (!map) throw new Error(`project ${project} not found`);
    const layer = await researchLayer(map, language, {
      model: researchModel(),
      typeGuide: generated ? await typeGuide(env.contentDir, [generated.profile.learns, ...generated.profile.also]) : undefined,
      async search(query, domains) {
        await recordUsage({ learnerId: null, purpose: "language-search", model: "linkup", costUsd: SEARCH_COST_USD });
        return linkupSearch(query, { domains });
      },
      check: (urls) => checkLinks(urls),
      onModelCall(message) {
        void recordUsage({ learnerId: null, purpose: "language", model: MODELS.research, usage: message.usage_metadata });
      },
    });
    await saveLayer(project, language, layer);
    return true;
  } catch (error) {
    console.error("language layer build failed", project, language, error);
    await failLayer(project, language, error instanceof Error ? error.message : String(error));
    return false;
  }
}
