import { test } from "node:test";
import assert from "node:assert/strict";
import { guestOn, one, stepsOf } from "./setup";
import { _runTool, looksLikeCode, toolsFor } from "@/lib/mentor";


test("show_code is only in the tool list after the learner pressed Show me code", () => {
  assert.ok(!toolsFor(false).some((t) => t.name === "show_code"));
  assert.ok(toolsFor(true).some((t) => t.name === "show_code"));
  for (const name of ["get_step_context", "get_learner_history", "check_answer", "give_help", "draw_diagram", "find_resource", "note_misconception", "save_for_later", "suggest_next"]) {
    assert.ok(toolsFor(false).some((t) => t.name === name), name);
  }
  assert.ok(!toolsFor(false).some((t) => /status|grade|mark/.test(t.name)), "no tool can write a status");
});

test("a words-only reply with code is detected", () => {
  assert.ok(looksLikeCode("Try this:\n```java\nint n = in.read(buf);\n```"));
  assert.ok(looksLikeCode("Here:\n  while (n != -1) {\n"));
  assert.ok(!looksLikeCode("Think of a bucket: each read pours in at most 8 KB, and you count what landed."));
  assert.ok(!looksLikeCode("If the read returns fewer bytes, use that count."));
});

test("show_code refuses when code is locked, and logs code help when unlocked", async () => {
  const { l, e } = await guestOn();
  const step = (await stepsOf())[0];
  const ctx = { learnerId: l, enrollmentId: e, stepId: step.id, language: null, showCode: false };
  const locked = await _runTool(ctx, "show_code", { piece: "the read loop", language: "java" });
  assert.match(JSON.stringify(locked.result), /not asked/);
  const open = await _runTool({ ...ctx, showCode: true }, "show_code", { piece: "the read loop", language: "java" });
  assert.match(open.label, /you asked/);
  const ss = await one<{ help_level: string }>(`select help_level from step_state where enrollment_id = $1 and step_id = $2`, [e, step.id]);
  assert.equal(ss!.help_level, "code");
});

test("mentor tools read the build step with its concepts' lessons, keep memory and never change status", async () => {
  const { l, e } = await guestOn();
  const step = (await stepsOf())[1];
  const ctx = { learnerId: l, enrollmentId: e, stepId: step.id, language: null, showCode: false };
  const sc = await _runTool(ctx, "get_step_context", {});
  const r = sc.result as any;
  assert.equal(r.outcome_to_check, step.outcome);
  assert.ok(r.concepts_this_step_uses.length > 0 && r.concepts_this_step_uses.every((c: any) => c.lesson && c.where_in_this_project));
  const check = await _runTool(ctx, "check_answer", {});
  assert.equal((check.result as any).latest, null);
  await _runTool(ctx, "note_misconception", { concept: "stream-read-contract", text: "Thinks a short read means the input ended" });
  await _runTool(ctx, "save_for_later", { text: "How do pipes work in the kernel?" });
  const hist = await _runTool(ctx, "get_learner_history", {});
  assert.equal((hist.result as any).misconceptions.length, 1);
  const later = await one(`select kind, in_scope from side_item where enrollment_id = $1`, [e]);
  assert.deepEqual(later, { kind: "later", in_scope: false });
  const done = await one(`select count(*)::int as n from step_state where enrollment_id = $1 and status = 'done'`, [e]);
  assert.equal(done!.n, 0);
});
