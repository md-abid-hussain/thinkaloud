import { getMap } from "@/lib/content";
import { learningLog } from "@/lib/export";
import { ensureGuest } from "@/lib/guest";
import { getOrCreateEnrollment, loadState } from "@/lib/repo";

/** Downloads the learning log as Markdown. */
export async function GET(_request: Request, ctx: RouteContext<"/api/p/[slug]/export">) {
  const { slug } = await ctx.params;
  if (!(await getMap(slug))) return Response.json({ error: "No such project." }, { status: 404 });
  const enrollment = await getOrCreateEnrollment(await ensureGuest(), slug);
  const markdown = learningLog(await loadState(enrollment.id));
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="thinkaloud-${slug}-learning-log.md"`,
      "Cache-Control": "no-store",
    },
  });
}
