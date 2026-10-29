import { test } from "node:test";
import assert from "node:assert/strict";
import { guestOn, one, rows, stepsOf } from "./setup";
import { gradeFor, quoteInAnswer, reconcile } from "@/lib/grader";
import { keyedThink, recordGate, recordModelThink, giveHelp, dispute } from "@/lib/progress";

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

test("keyed steps are checked by key with no model, and a right answer marks the step done", async () => {
  const { l, e } = await guestOn();
  const keyed = (await stepsOf()).find((s) => s.kind === "predict" || s.kind === "trace")!;
  const key = json(keyed.answer_key);
  const wrong = await keyedThink(l, e, keyed.id, "no idea, maybe a lot");
  assert.equal(wrong.grade, "not_yet");
  const right = await keyedThink(l, e, keyed.id, `It is ${Array.isArray(key.expected) ? key.expected.join(" then ") : key.expected}.`);
  assert.equal(right.grade, "met");
  assert.equal(right.attempt, 2, "unlimited retries, numbered");
  const ss = await one<{ status: string }>(`select status from step_state where enrollment_id = $1 and step_id = $2`, [e, keyed.id]);
  assert.equal(ss!.status, "done");
  const a = await one<{ graded_by: string; points: unknown }>(`select graded_by, points from answer where id = $1`, [right.answerId]);
  assert.deepEqual([a!.graded_by, a!.points], ["key", null]);
});

test("a model grade with an invented quote is rejected by the database trigger", async () => {
  const { l, e } = await guestOn();
  const explain = (await stepsOf()).find((s) => s.kind === "explain" || s.kind === "spot_bug")!;
  const rubric = json(explain.rubric) as { id: string }[];
  const body = "Both a file and stdin are byte streams, so one loop reads either.";
  const points = rubric.map((r, i) => (i === 0 ? { id: r.id, met: true, quote: "not in the answer at all" } : { id: r.id, met: false }));
  await assert.rejects(() => recordModelThink(l, e, explain.id, body, { grade: "partial", points, model: "test" }), /quote/);
  const good = rubric.map((r) => ({ id: r.id, met: true, quote: "one loop reads either" }));
  const saved = await recordModelThink(l, e, explain.id, body, { grade: "met", points: good, model: "test" });
  assert.ok(saved.answerId);
  const ss = await one<{ status: string }>(`select status from step_state where enrollment_id = $1 and step_id = $2`, [e, explain.id]);
  assert.equal(ss!.status, "done");
});

test("a partial teach-back still marks the concept of each met point explained, with the quote as evidence", async () => {
  const { l, e } = await guestOn();
  const q = (await rows<{ id: string; rubric: any }>(
    `select q.id, q.rubric from question q join milestone m on m.id = q.milestone_id join challenge c on c.id = m.challenge_id
      where c.slug = 'challenge-wc' and m.position = 1`
  ))[0];
  const rubric = json(q.rubric) as { id: string; concept: string }[];
  const body = "Memory stays flat because I read fixed chunks into one buffer.";
  const points = rubric.map((r, i) => (i === 0 ? { id: r.id, met: true, quote: "read fixed chunks into one buffer" } : { id: r.id, met: false }));
  const r = await recordGate(l, e, q.id, body, { grade: "partial", points, model: "test" }, null);
  assert.equal(r.explained.length, 1);
  assert.equal(r.understood, false);
  const ev = await one<{ quote: string; slug: string }>(
    `select e.quote, c.slug from evidence e join concept c on c.id = e.concept_id where e.learner_id = $1`, [l]
  );
  assert.deepEqual(ev, { quote: "read fixed chunks into one buffer", slug: rubric[0].concept });
});

test("help is logged and the help level only rises", async () => {
  const { l, e } = await guestOn();
  const step = (await stepsOf())[0];
  const h = await giveHelp(l, e, step.id, "hint", "not_sure");
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
  const keyed = (await stepsOf()).find((s) => s.kind === "predict" || s.kind === "trace")!;
  const a = await keyedThink(l, e, keyed.id, "zero");
  assert.equal(await dispute(other.l, a.answerId, "not mine"), false);
  assert.equal(await dispute(l, a.answerId, "I think this is right"), true);
  const ev = await one(`select 1 from event where enrollment_id = $1 and type = 'grade_disputed'`, [e]);
  assert.ok(ev);
});
