import { enrollmentScope, handle, readJson, requireLearner, text } from "@/lib/api";
import { reflect } from "@/lib/progress";

export const POST = handle(async (req: Request) => {
  const l = await requireLearner();
  const b = await readJson<{ slug?: string; body?: string }>(req);
  const s = await enrollmentScope(l, String(b.slug ?? ""));
  const understood = await reflect(l, s.enrollment_id, text(b.body));
  return Response.json({ ok: true, understood });
});
