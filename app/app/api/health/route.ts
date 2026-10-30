import { one } from "@/lib/db";
import { env } from "@/lib/env";
import { sandboxBackend } from "@/lib/review/service";

/** Liveness, plus where reviews would run, so a deploy can confirm Daytona is configured. */
export async function GET() {
  const sandbox = { backend: sandboxBackend(), daytonaKey: Boolean(env.daytonaKey) };
  try {
    const row = await one<{ projects: string }>("select count(*) as projects from project");
    return Response.json({ ok: true, projects: Number(row?.projects ?? 0), sandbox }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, sandbox }, { status: 503 });
  }
}
