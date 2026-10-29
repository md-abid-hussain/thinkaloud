import { requireLearner } from "@/lib/api";
import { eventsAfter, runBus, runFor } from "@/lib/worker";

export const dynamic = "force-dynamic";

const FINAL = new Set(["done", "failed", "paused"]);

// Server-sent events for one run. Resumes after Last-Event-ID (or ?after=), replays what was missed,
// then follows live until the run is done, failed or paused. Closing the page never cancels the run.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const learnerId = await requireLearner().catch(() => null);
  if (!learnerId) return Response.json({ error: "Start a project first." }, { status: 401 });
  const run = await runFor(id, learnerId);
  if (!run) return Response.json({ error: "Not found." }, { status: 404 });
  const url = new URL(req.url);
  let last = Number(req.headers.get("last-event-id") ?? url.searchParams.get("after") ?? 0) || 0;
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let wake: (() => void) | null = null;
      const onEvent = () => wake?.();
      runBus.on(id, onEvent);
      const abort = () => { closed = true; wake?.(); };
      req.signal.addEventListener("abort", abort);
      const send = (s: string) => { if (!closed) controller.enqueue(enc.encode(s)); };
      send("retry: 2000\n\n");
      try {
        while (!closed) {
          const evs = await eventsAfter(id, last);
          let finished = false;
          for (const ev of evs) {
            last = Number(ev.id);
            send(`id: ${ev.id}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`);
            if (ev.type === "status" && FINAL.has(ev.data.status)) finished = true;
          }
          if (finished) { send("event: end\ndata: {}\n\n"); break; }
          // Wait for the worker to append, or 15 s for a heartbeat.
          await new Promise<void>((r) => { wake = r; setTimeout(r, 15000); });
          wake = null;
          send(": ping\n\n");
        }
      } catch (e) {
        console.error("[sse]", e);
      } finally {
        runBus.off(id, onEvent);
        req.signal.removeEventListener("abort", abort);
        try { controller.close(); } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}
