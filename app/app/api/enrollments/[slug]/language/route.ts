import { enrollmentScope, handle, readJson, requireLearner } from "@/lib/api";
import { tx } from "@/lib/db";
import { recipes } from "@/vendor/db/support/recipes.mjs";
import { startLanguageRun } from "@/lib/research";
import { docsFor } from "@/lib/web";

// Pick or change the language (and optional framework). Starts the language notes run when needed.
export const POST = handle(async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const l = await requireLearner();
  const s = await enrollmentScope(l, slug);
  const b = await readJson<{ language?: string | null; framework?: string | null }>(req);
  const language = b.language?.trim().toLowerCase() || null;
  const framework = language ? b.framework?.trim().toLowerCase() || null : null;
  await tx((q) => recipes(q).setLanguage(l, s.enrollment_id, language, framework));
  const runId = await startLanguageRun(l, s.enrollment_id, language, framework);
  return Response.json({ ok: true, language, framework, runId, docs: docsFor(language, framework).length > 0 });
});
