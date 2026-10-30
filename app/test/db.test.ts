import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadMaps } from "@/lib/content";
import { closePool, pool } from "@/lib/db";
import { learningLog } from "@/lib/export";
import {
  QuoteNotFound,
  createReview,
  finishReview,
  getOrCreateEnrollment,
  insertMessage,
  loadState,
  markAnswered,
  setLanguage,
  setRepo,
  syncCards,
} from "@/lib/repo";
import { checkSpend, recordUsage } from "@/lib/spend";
import { CONTENT_DIR, generatedOf, maps, resetDb } from "./helpers";

const LEARNER = "00000000-0000-4000-8000-000000000001";
const passedCheck = { ok: true, cases: [{ name: "the program starts", passed: true, detail: "started" }] };

beforeAll(async () => {
  await resetDb();
  await loadMaps(await maps(), pool(), CONTENT_DIR);
});
afterAll(closePool);

describe("an enrollment, start to end", () => {
  it("starts with the welcome card, then stage 0 once the language is set, then setup once the repo is linked", async () => {
    const e = await getOrCreateEnrollment(LEARNER, "wc");
    expect((await getOrCreateEnrollment(LEARNER, "wc")).id).toBe(e.id);
    expect((await loadState(e.id)).messages.map((m) => m.meta.card?.kind)).toEqual(["welcome"]);

    await syncCards(e.id);
    expect((await loadState(e.id)).messages).toHaveLength(1);

    await setLanguage(e.id, "java");
    await syncCards(e.id);
    expect((await loadState(e.id)).messages.at(-1)?.meta.card).toEqual({ kind: "stage0" });

    await setRepo(e.id, "https://github.com/md-abid-hussain/thinkaloud-test-wc");
    await syncCards(e.id);
    const state = await loadState(e.id);
    expect(state.messages.map((m) => m.meta.card?.kind)).toEqual(["welcome", "stage0", "setup"]);
    expect(state.progress.next.kind).toBe("build");
  });

  it("records answers, and only accepts the learner's own words", async () => {
    const e = await getOrCreateEnrollment(LEARNER, "wc");
    const q = (await generatedOf("wc")).questions.find((x) => x.concept === "lines-and-line-endings")!;
    const said = await insertMessage(e.id, { role: "learner", text: "wc counts newline characters, so a last line with no newline isn't counted." });
    await expect(markAnswered(e.id, q.id, "it counts lines of text", said)).rejects.toBeInstanceOf(QuoteNotFound);
    await markAnswered(e.id, q.id, "wc counts newline characters", said);
    const state = await loadState(e.id);
    expect(state.answers.get(q.id)?.quote).toBe("wc counts newline characters");
    expect(state.progress.steps.find((s) => s.id === q.step)?.questions.find((x) => x.id === q.id)?.answered).toBe(true);
  });

  it("enforces the quote rule in the database too", async () => {
    const e = await getOrCreateEnrollment(LEARNER, "wc");
    const said = await insertMessage(e.id, { role: "learner", text: "I have no idea" });
    await expect(
      pool().query("insert into answer (enrollment_id, question_id, quote, message_id) values ($1, 's1-q2', 'bytes are not characters', $2)", [e.id, said.id]),
    ).rejects.toThrow(/quote does not appear/);
  });

  it("runs one review at a time, and a pass marks the step built, moves the approved commit and posts a card", async () => {
    const e = await getOrCreateEnrollment(LEARNER, "wc");
    const id = await createReview(e.id, "s0");
    expect(id).not.toBeNull();
    expect(await createReview(e.id, "s1")).toBeNull();
    expect((await loadState(e.id)).progress.next.kind).toBe("reviewing");

    await finishReview(id!, {
      status: "passed",
      headSha: "3b7ded8aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      baseSha: null,
      result: { build: { ok: true, log: "" }, check: passedCheck, diffStat: "4 files changed", plan: null },
      verdict: { passed: true, summary: "It builds and starts.", problems: [] },
    });
    const state = await loadState(e.id);
    expect(state.built.has("s0")).toBe(true);
    expect(state.enrollment.approvedSha).toBe("3b7ded8aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(state.messages.at(-1)?.meta.card).toEqual({ kind: "review", review: id });
    expect(state.reviews.at(-1)?.status).toBe("passed");

    // A failed review posts its card but changes nothing else.
    const second = await createReview(e.id, "s1");
    await finishReview(second!, { status: "failed", headSha: "8f40185", baseSha: "3b7ded8", verdict: { passed: false, summary: "Not yet.", problems: [{ where: null, what: "-c is missing" }] } });
    const after = await loadState(e.id);
    expect(after.built.has("s1")).toBe(false);
    expect(after.enrollment.approvedSha).toBe("3b7ded8aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("allows only one mentor reply in flight", async () => {
    const e = await getOrCreateEnrollment(LEARNER, "json-parser");
    await insertMessage(e.id, { role: "mentor", status: "pending" });
    await expect(insertMessage(e.id, { role: "mentor", status: "pending" })).rejects.toThrow();
  });

  it("exports a learning log with the learner's words and the reviews", async () => {
    const e = await getOrCreateEnrollment(LEARNER, "wc");
    const log = learningLog(await loadState(e.id), new Date("2026-10-30T12:00:00Z"));
    expect(log).toContain("# Learning log: Build your own wc");
    expect(log).toContain("> wc counts newline characters");
    expect(log).toContain("review passed at 3b7ded8");
    expect(log).toContain("Language: Java");
    expect(log).toContain("Repo: https://github.com/md-abid-hussain/thinkaloud-test-wc");
  });
});

describe("spend caps", () => {
  it("pauses a guest who has reached the daily cap", async () => {
    expect((await checkSpend(LEARNER)).ok).toBe(true);
    await recordUsage({ learnerId: LEARNER, purpose: "mentor", model: "claude-opus-5-5", costUsd: 5 });
    const result = await checkSpend(LEARNER);
    expect(result.ok).toBe(false);
  });
});
