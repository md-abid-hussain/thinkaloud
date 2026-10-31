import { getTurnStream, type TurnEvent } from "@/lib/agent/bus";
import { currentGuest } from "@/lib/guest";
import { finishMessage, getEnrollment, getMessage } from "@/lib/repo";

/**
 * Server-sent events for one mentor reply. A browser that connects late, or reconnects, gets every event
 * so far. A finished reply is sent as a single "done". Leaving the page doesn't stop the reply.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/messages/[id]/stream">) {
  const id = Number((await ctx.params).id);
  const guest = await currentGuest();
  const message = Number.isInteger(id) ? await getMessage(id) : null;
  const enrollment = message ? await getEnrollment(message.enrollmentId) : null;
  if (!message || !guest || enrollment?.learnerId !== guest || message.role !== "mentor") {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const frame = (event: TurnEvent) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  const live = getTurnStream(id);

  if (message.status !== "pending" || !live) {
    if (message.status === "pending") {
      // The server restarted while this reply was running, so nothing is producing it any more.
      await finishMessage(id, { text: "The mentor stopped before finishing. Send your message again.", status: "failed", meta: {} });
    }
    const status = message.status === "done" ? "done" : "failed";
    return new Response(frame({ type: "done", status }), { headers: sseHeaders });
  }

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
      const unsubscribe = live.subscribe((event) => {
        controller.enqueue(frame(event));
        if (event.type === "done") queueMicrotask(close);
      });
      request.signal.addEventListener("abort", close);
    },
  });
  return new Response(body, { headers: sseHeaders });
}

const sseHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};
