// Durable runs: a grade or a mentor turn that keeps going when the learner leaves the page.
// The request inserts a queued run and returns its id; this worker executes it in the server process and
// appends run_event rows, which /api/runs/[id]/events streams over SSE and can replay after a reload.
import "server-only";
import { EventEmitter } from "node:events";
import { one, query, rows } from "@/lib/db";
import { ModelUnavailable } from "@/lib/llm";

export type RunKind = "grade" | "mentor";
export type RunStatus = "queued" | "running" | "done" | "failed" | "paused";
export interface Run {
  id: string;
  kind: RunKind;
  status: RunStatus;
  learner_id: string;
  enrollment_id: string | null;
  step_id: string | null;
  question_id: string | null;
  input: any;
  result: any;
  error: string | null;
  attempts: number;
}
export interface RunContext {
  run: Run;
  emit(type: "trace" | "text", data: Record<string, unknown>): Promise<void>;
}
type Handler = (ctx: RunContext) => Promise<Record<string, unknown>>;

interface WorkerState { bus: EventEmitter; handlers: Map<RunKind, Handler>; active: number; queue: string[] }
const g = globalThis as unknown as { __taRuns?: WorkerState };
const fresh: WorkerState = { bus: new EventEmitter().setMaxListeners(0), handlers: new Map(), active: 0, queue: [] };
const state: WorkerState = (g.__taRuns ??= fresh);
const MAX_ACTIVE = 4;
export const MAX_ATTEMPTS = 2;

export function registerHandler(kind: RunKind, h: Handler) {
  state.handlers.set(kind, h);
}
export const runBus = state.bus;

export async function appendEvent(runId: string, type: string, data: Record<string, unknown>) {
  const r = await one<{ id: string }>(
    `insert into run_event (run_id, type, data) values ($1, $2, $3) returning id`,
    [runId, type, JSON.stringify(data)]
  );
  state.bus.emit(runId, Number(r!.id));
}

export async function createRun(o: {
  kind: RunKind;
  learnerId: string;
  enrollmentId?: string | null;
  stepId?: string | null;
  questionId?: string | null;
  input: Record<string, unknown>;
}) {
  const r = await one<{ id: string }>(
    `insert into run (kind, learner_id, enrollment_id, step_id, question_id, input) values ($1, $2, $3, $4, $5, $6) returning id`,
    [o.kind, o.learnerId, o.enrollmentId ?? null, o.stepId ?? null, o.questionId ?? null, JSON.stringify(o.input)]
  );
  await appendEvent(r!.id, "status", { status: "queued" });
  kick(r!.id);
  return r!.id;
}

export function kick(runId: string) {
  state.queue.push(runId);
  setImmediate(pump);
}

function pump() {
  while (state.active < MAX_ACTIVE && state.queue.length) {
    const id = state.queue.shift()!;
    state.active++;
    execute(id).finally(() => {
      state.active--;
      setImmediate(pump);
    });
  }
}

async function execute(runId: string) {
  const run = await one<Run>(
    `update run set status = 'running', started_at = now(), attempts = attempts + 1
      where id = $1 and status = 'queued' returning *`,
    [runId]
  );
  if (!run) return; // already taken, finished or cancelled
  await appendEvent(runId, "status", { status: "running" });
  const handler = state.handlers.get(run.kind);
  try {
    if (!handler) throw new Error(`no handler for ${run.kind}`);
    const result = await handler({ run, emit: (type, data) => appendEvent(runId, type, data) });
    await query(`update run set status = 'done', result = $2, finished_at = now() where id = $1`, [runId, JSON.stringify(result)]);
    await appendEvent(runId, "result", result);
    await appendEvent(runId, "status", { status: "done" });
  } catch (e) {
    const paused = e instanceof ModelUnavailable || isTransient(e);
    const reason = e instanceof ModelUnavailable ? e.reason : paused ? "api" : "error";
    const message =
      e instanceof ModelUnavailable ? e.message : paused ? "The checker is unavailable right now." : "Something went wrong while checking.";
    console.error(`[run ${runId}]`, e);
    await query(`update run set status = $2, error = $3, finished_at = now() where id = $1`, [
      runId, paused ? "paused" : "failed", String(e).slice(0, 2000),
    ]);
    await appendEvent(runId, "error", { reason, message });
    await appendEvent(runId, "status", { status: paused ? "paused" : "failed", reason });
  }
}

function isTransient(e: unknown) {
  const status = (e as { status?: number })?.status;
  if (typeof status !== "number") return (e as { name?: string })?.name === "APIConnectionError";
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

/** Puts a paused or failed run back in the queue. */
export async function retryRun(runId: string, learnerId: string) {
  const r = await one(
    `update run set status = 'queued', error = null where id = $1 and learner_id = $2 and status in ('paused', 'failed') returning id`,
    [runId, learnerId]
  );
  if (!r) return false;
  await appendEvent(runId, "status", { status: "queued" });
  kick(runId);
  return true;
}

/** On boot: runs cut off by a restart are retried once, then paused with a retry button. */
export async function recoverRuns() {
  const stuck = await rows<{ id: string; attempts: number }>(`select id, attempts from run where status in ('queued', 'running')`);
  for (const r of stuck) {
    if (r.attempts < MAX_ATTEMPTS) {
      await query(`update run set status = 'queued' where id = $1`, [r.id]);
      kick(r.id);
    } else {
      await query(`update run set status = 'paused', error = 'interrupted by a restart', finished_at = now() where id = $1`, [r.id]);
      await appendEvent(r.id, "error", { reason: "api", message: "Checking was interrupted. Try again." });
      await appendEvent(r.id, "status", { status: "paused", reason: "api" });
    }
  }
  if (stuck.length) console.log(`[runs] recovered ${stuck.length} run(s)`);
}

export async function runFor(runId: string, learnerId: string) {
  return one<Run>(`select * from run where id = $1 and learner_id = $2`, [runId, learnerId]);
}
export async function eventsAfter(runId: string, after: number) {
  return rows<{ id: string; type: string; data: any }>(
    `select e.id::text as id, e.type, e.data from run_event e where e.run_id = $1 and e.id > $2 order by e.id`,
    [runId, after]
  );
}
