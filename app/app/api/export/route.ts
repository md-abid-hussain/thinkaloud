import { handle, requireLearner } from "@/lib/api";
import { exportJson, learningLog } from "@/lib/export";

export const dynamic = "force-dynamic";

// ?format=md (default) downloads learning-log.md; ?format=json downloads every row that is the learner's.
export const GET = handle(async (req: Request) => {
  const l = await requireLearner();
  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "md";
  const day = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    return new Response(JSON.stringify(await exportJson(l), null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="thinkaloud-${day}.json"` },
    });
  }
  return new Response(await learningLog(l), {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="learning-log-${day}.md"` },
  });
});
