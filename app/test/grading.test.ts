import { test } from "node:test";
import assert from "node:assert/strict";
import { guestOn, mapOf, one, stepsOf, tx } from "./setup";
import { gradeFor, quoteInAnswer, reconcile } from "@/lib/grader";
import { giveHelp, dispute } from "@/lib/progress";
import { recipes } from "@/vendor/db/support/recipes.mjs";

const json = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);

test("a quote must appear in the answer, ignoring case and spacing", () => {
  const answer = "I read it in   fixed-size Chunks, and reuse the buffer.";
  assert.ok(quoteInAnswer("fixed-size chunks", answer));
  assert.ok(quoteInAnswer("in fixed-size chunks,", answer));
  assert.ok(!quoteInAnswer("fixed size chunks", answer), "a paraphrase is not a quote");
  assert.ok(!quoteInAnswer("", answer));
  assert.ok(!quoteInAnswer(undefined, answer));
});

test("reconcile drops a met point whose quote is not in the answer, and lists every point once", () => {
  const rubric = [{ id: "p1", point: "a" }, { id: "p2", point: "b" }, { id: "p3", point: "c" }];
  const answer = "Memory stays flat because one buffer is reused.";
  const r = reconcile(rubric, [
    { id: "p1", met: true, quote: "one buffer is reused" },
    { id: "p2", met: true, quote: "the file is streamed" }, // invented
    { id: "p9", met: true, quote: "Memory" }, // not a rubric point
  ], answer);
  assert.deepEqual(r.points.map((p) => [p.id, p.met]), [["p1", true], ["p2", false], ["p3", false]]);
  assert.deepEqual(r.dropped, ["p2"]);
  assert.equal(r.grade, "partial");
  assert.equal(gradeFor([{ id: "a", met: true }]), "met");
  assert.equal(gradeFor([{ id: "a", met: false }]), "not_yet");
});

test("an explain-back keeps only real quotes: the reconciled points pass the database trigger, invented ones do not", async () => {
  const { l, e } = await guestOn();
  const [pc] = await mapOf();
  const rubric = json(pc.rubric) as { id: string; point: string }[];
  const body = "UTF-8 stores each code point as one to four bytes, so an accented letter takes two.";
  const raw = rubric.map((r, i) => ({ id: r.id, met: true, quote: i === 0 ? "one to four bytes" : "a sentence the learner never wrote" }));
  const g = reconcile(rubric, raw, body);
  assert.deepEqual(g.points.filter((p) => p.met).map((p) => p.id), [rubric[0].id]);
  const ok = await tx((q) => recipes(q).explainBack(l, e, pc.id, body, { points: g.points, model: "test" }));
  assert.equal(ok.grade, "partial");
  await assert.rejects(() => tx((q) => recipes(q).explainBack(l, e, pc.id, body, { points: raw, model: "test" })), /quote/);
});

test("help is logged and the help level only rises", async () => {
  const { l, e } = await guestOn();
  const step = (await stepsOf())[0];
  const h = await giveHelp(l, e, step.id, "hint", "button");
  assert.ok(h.body, "the stored hint is returned");
  await giveHelp(l, e, step.id, "example", "button");
  await giveHelp(l, e, step.id, "hint", "button");
  const ss = await one<{ help_level: string }>(`select help_level from step_state where enrollment_id = $1 and step_id = $2`, [e, step.id]);
  assert.equal(ss!.help_level, "example");
  const n = await one<{ n: number }>(`select count(*)::int as n from event where enrollment_id = $1 and type = 'help_given'`, [e]);
  assert.equal(n!.n, 3);
});

test("a disputed grade is logged, and only the owner can dispute it", async () => {
  const { l, e } = await guestOn();
  const other = await guestOn();
  const [pc] = await mapOf();
  const a = await tx((q) => recipes(q).explainBack(l, e, pc.id, "Not sure yet.", { metCount: 0 }));
  assert.equal(await dispute(other.l, a.answerId, "not mine"), false);
  assert.equal(await dispute(l, a.answerId, "I think this is right"), true);
  const ev = await one(`select 1 from event where enrollment_id = $1 and type = 'grade_disputed'`, [e]);
  assert.ok(ev);
});
