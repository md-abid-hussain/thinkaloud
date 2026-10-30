import { one } from "@/lib/db";

export async function GET() {
  try {
    const row = await one<{ projects: string }>("select count(*) as projects from project");
    return Response.json({ ok: true, projects: Number(row?.projects ?? 0) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
