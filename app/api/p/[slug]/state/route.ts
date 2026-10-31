import { getMap } from "@/lib/content";
import { ensureGuest } from "@/lib/guest";
import { chatView } from "@/lib/view";

/** The chat page's data. Starts the guest and the enrollment on the first visit. */
export async function GET(_request: Request, ctx: RouteContext<"/api/p/[slug]/state">) {
  const { slug } = await ctx.params;
  if (!(await getMap(slug))) return Response.json({ error: "No such project." }, { status: 404 });
  const learnerId = await ensureGuest();
  return Response.json(await chatView(learnerId, slug), { headers: { "Cache-Control": "no-store" } });
}
