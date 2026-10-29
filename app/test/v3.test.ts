import { test } from "node:test";
import assert from "node:assert/strict";
import { guestOn, one, tx } from "./setup";
import { conceptV3, homeV3, stepV3Extras } from "@/lib/views3";
import { reconcile } from "@/lib/grader";
import { recipes } from "@/vendor/db/support/recipes.mjs";

const json = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);

test("wc in format 3: the home shows a learning map and a build plan with outcomes", async () => {
  const { l } = await guestOn("challenge-wc");
  const h = (await homeV3(l, "challenge-wc"))!;
  assert.ok(h.map.length >= 3 && h.map.every((c) => c.where && c.status === "new"));
  const steps = h.milestones.flatMap((m) => m.steps);
  assert.ok(steps.length > 0 && steps.every((s) => s.outcome && s.concepts.length > 0));
  assert.ok(h.project.doneWhen && h.next.concept && h.next.step);
});

test("a concept page has the lesson, where, references and the explain-back, never the rubric before grading", async () => {
  const { l } = await guestOn("challenge-wc");
  const h = (await homeV3(l, "challenge-wc"))!;
  const c = (await conceptV3(l, "challenge-wc", h.map[0].slug))!;
  assert.ok((c.concept.lesson as any).how_it_works.length > 400);
  assert.ok(c.concept.where.length > 20);
  assert.ok(c.references.length >= 1, "opened references are shown");
  assert.ok(c.explainBack.prompt.length > 20 && c.explainBack.points >= 2);
  assert.equal(c.explainBack.parts, null, "rubric text stays hidden at Standard");
  assert.equal(c.latest, null);
});

test("ticking an outcome marks the step done and its concepts applied; an explain-back with real points explains a concept", async () => {
  const { l, e } = await guestOn("challenge-wc");
  const h = (await homeV3(l, "challenge-wc"))!;
  const step = h.milestones[0].steps[0];
  const ch = (await one<{ id: string }>(`select id from challenge where slug = 'challenge-wc'`))!;
  const x = await stepV3Extras(ch.id, step.id, l);
  assert.ok(x.build && x.outcome && x.concepts.length > 0);

  await tx((q) => recipes(q).outcomeMet(l, e, step.id));
  const after = (await homeV3(l, "challenge-wc"))!;
  assert.equal(after.milestones[0].steps[0].status, "done");
  assert.ok(after.map.some((c) => c.applied), "the concept the step uses is applied");

  const pc = h.map[0];
  const row = (await one<{ explain_rubric: any }>(`select explain_rubric from project_concept where id = $1`, [pc.pcId]))!;
  const rubric = json(row.explain_rubric) as { id: string; point: string }[];
  const body = "UTF-8 writes each code point as one to four bytes, so an accented name needs more bytes than characters.";
  const raw = rubric.map((r) => ({ id: r.id, met: true, quote: "one to four bytes" }));
  const g = reconcile(rubric, raw, body);
  const r = await tx((q) => recipes(q).explainBack(l, e, pc.pcId, body, { points: g.points, model: "test" }));
  assert.equal(r.grade, "met");
  const c = (await conceptV3(l, "challenge-wc", pc.slug))!;
  assert.equal(c.latest!.grade, "met");
  assert.ok(c.latest!.points!.every((p) => p.quote === "one to four bytes"));
  assert.ok(["explained", "applied"].includes(c.concept.status));
});
