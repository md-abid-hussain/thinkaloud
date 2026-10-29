import { handle, requireLearner } from "@/lib/api";
import { one } from "@/lib/db";
import { markSeen } from "@/lib/progress";

// "I've read this" on a concept brief. The slug ties the event to a project when the learner is in one.
export const POST = handle(async (req: Request, { params }: { params: Promise<{ conceptId: string }> }) => {
  const { conceptId } = await params;
  const l = await requireLearner();
  const b = ((await req.json().catch(() => ({}))) ?? {}) as { slug?: string };
  const en = b.slug
    ? await one<{ id: string }>(`select en.id from enrollment en join challenge c on c.id = en.challenge_id where en.learner_id = $1 and c.slug = $2`, [l, b.slug])
    : null;
  await markSeen(l, en?.id ?? null, conceptId);
  return Response.json({ ok: true });
});
