import { test } from "node:test";
import assert from "node:assert/strict";
import { guestOn, one, rows, waitFor } from "./setup";
import { createRun, eventsAfter, recoverRuns, registerHandler, retryRun } from "@/lib/runs";
import { ModelUnavailable } from "@/lib/llm";
import { assertBudget, recordUsage } from "@/lib/spend";

const statusOf = async (id: string) => (await one<{ status: string }>(`select status from run where id = $1`, [id]))!.status;

test("a run executes in the background and its events replay in order", async () => {
  registerHandler("mentor", async (ctx) => {
    await ctx.emit("trace", { label: "Read step 1" });
    await ctx.emit("text", { delta: "Hello" });
    return { reply: "Hello" };
  });
  const { l, e } = await guestOn();
  const id = await createRun({ kind: "mentor", learnerId: l, enrollmentId: e, input: { message: "hi" } });
  await waitFor(async () => (await statusOf(id)) === "done");
  const evs = await eventsAfter(id, 0);
  assert.deepEqual(evs.map((x) => (x.type === "status" ? `status:${x.data.status}` : x.type)), [
    "status:queued", "status:running", "trace", "text", "result", "status:done",
  ]);
  const later = await eventsAfter(id, Number(evs[2].id));
  assert.equal(later.length, 3, "resuming after an event id replays only what came after");
});

test("a run stopped by the spend cap is paused, not failed, and can be retried", async () => {
  let calls = 0;
  registerHandler("grade", async () => {
    calls++;
    if (calls === 1) throw new ModelUnavailable("cap", "cap");
    return { grade: "met" };
  });
  const { l, e } = await guestOn();
  const id = await createRun({ kind: "grade", learnerId: l, enrollmentId: e, input: { target: "restate", body: "x" } });
  await waitFor(async () => (await statusOf(id)) === "paused");
  const err = (await eventsAfter(id, 0)).find((x) => x.type === "error");
  assert.equal(err!.data.reason, "cap");
  assert.ok(await retryRun(id, l));
  await waitFor(async () => (await statusOf(id)) === "done");
  assert.equal(await retryRun(id, l), false, "a finished run cannot be retried");
});

test("on boot, interrupted runs are retried once, then paused", async () => {
  registerHandler("grade", async () => ({ ok: true }));
  const { l } = await guestOn();
  const fresh = (await one<{ id: string }>(`insert into run (kind, status, learner_id, attempts) values ('grade', 'running', $1, 1) returning id`, [l]))!.id;
  const tired = (await one<{ id: string }>(`insert into run (kind, status, learner_id, attempts) values ('grade', 'running', $1, 2) returning id`, [l]))!.id;
  await recoverRuns();
  await waitFor(async () => (await statusOf(fresh)) === "done");
  assert.equal(await statusOf(tired), "paused");
});

test("the guest cap pauses AI checks once a learner's spend for the day reaches it", async () => {
  process.env.GUEST_DAILY_CAP_USD = "0.01";
  const { l, e } = await guestOn();
  await assertBudget(l);
  await recordUsage({ learnerId: l, enrollmentId: e, purpose: "grade", model: "claude-sonnet-5-5" }, { input_tokens: 2000, output_tokens: 1000 });
  await assert.rejects(() => assertBudget(l), (err: unknown) => err instanceof ModelUnavailable && err.reason === "guest_cap");
  const other = await guestOn();
  await assertBudget(other.l); // another guest is unaffected
  delete process.env.GUEST_DAILY_CAP_USD;
  const u = await rows(`select cost_usd from llm_usage where learner_id = $1`, [l]);
  assert.equal(Number(u[0].cost_usd), 0.014);
});
