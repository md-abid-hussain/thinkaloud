import { enrollmentScope, handle, HttpError, readJson, requireLearner } from "@/lib/api";
import { SUPPORT_LEVELS, type SupportLevel } from "@/lib/learner";
import { setSupportLevel } from "@/lib/progress";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const l = await requireLearner();
  const s = await enrollmentScope(l, slug);
  const { level } = await readJson<{ level?: string }>(req);
  if (!SUPPORT_LEVELS.includes(level as SupportLevel)) throw new HttpError(400, "Unknown support level.");
  await setSupportLevel(l, s.enrollment_id, level!);
  return Response.json({ ok: true, level });
});
