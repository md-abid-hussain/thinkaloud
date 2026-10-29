import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await one<{ ready: number; total: number }>(
      `select count(*) filter (where content_status <> 'listed')::int as ready, count(*)::int as total from challenge`
    );
    return Response.json({ ok: true, projects: r });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
