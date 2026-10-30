import type { Db } from "./db";
import { one, pool, rows, tx } from "./db";
import { getGenerated, getMap, type ProjectMap } from "./content";
import type { Generated } from "./gen/schema";
import { deriveProgress, isLanguage, type Language, type Progress } from "./progress";
import { quoteAppearsIn } from "./quote";
import type { Verdict } from "./review/reviewer";
import type { CheckResult } from "./sandbox/review";

export type Intent = "help" | "explaining" | "code";
export type Role = "learner" | "mentor" | "card";
export type MessageStatus = "pending" | "done" | "failed";

export type ToolLine = { name: string; label: string };
export type CardMeta =
  | { kind: "welcome" }
  | { kind: "stage0" }
  | { kind: "setup" }
  | { kind: "step"; step: string }
  | { kind: "review"; review: number }
  | { kind: "complete" };
export type MessageMeta = { tools?: ToolLine[]; codeShown?: boolean; card?: CardMeta; error?: string };

export type Message = {
  id: number;
  role: Role;
  intent: Intent | null;
  text: string;
  status: MessageStatus;
  meta: MessageMeta;
  createdAt: string;
};

export type Enrollment = {
  id: number;
  learnerId: string;
  project: string;
  language: Language | null;
  /** A question id from the generated layer, while the mentor waits for the answer. */
  openQuestion: string | null;
  repoUrl: string | null;
  buildCmd: string | null;
  runCmd: string | null;
  runConfirmed: boolean;
  approvedSha: string | null;
};

export type Answer = { questionId: string; quote: string; messageId: number };

/** What the learner sees of a review: the build, the check results, the diff size and the reviewer's verdict. */
export type ReviewResult = {
  build: { ok: boolean; log: string } | null;
  check: CheckResult;
  diffStat: string;
  plan: { language: string | null; build: string | null; run: string | null; notes: string[] } | null;
};

export type Review = {
  id: number;
  stepId: string;
  status: "running" | "passed" | "failed" | "error";
  headSha: string | null;
  baseSha: string | null;
  result: ReviewResult | null;
  verdict: Verdict | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type EnrollmentState = {
  enrollment: Enrollment;
  map: ProjectMap;
  generated: Generated | null;
  messages: Message[];
  answers: Map<string, Answer>;
  reviews: Review[];
  built: Set<string>;
  progress: Progress;
};

type EnrollmentRow = {
  id: string;
  learner_id: string;
  project: string;
  language: string | null;
  open_question: string | null;
  repo_url: string | null;
  build_cmd: string | null;
  run_cmd: string | null;
  run_confirmed: boolean;
  approved_sha: string | null;
};
type MessageRow = { id: string; role: Role; intent: Intent | null; text: string; status: MessageStatus; meta: MessageMeta; created_at: Date };
type ReviewRow = {
  id: string;
  step_id: string;
  status: Review["status"];
  head_sha: string | null;
  base_sha: string | null;
  result: ReviewResult | null;
  verdict: Verdict | null;
  error: string | null;
  created_at: Date;
  finished_at: Date | null;
};

function toEnrollment(r: EnrollmentRow): Enrollment {
  return {
    id: Number(r.id),
    learnerId: r.learner_id,
    project: r.project,
    language: isLanguage(r.language) ? r.language : null,
    openQuestion: r.open_question,
    repoUrl: r.repo_url,
    buildCmd: r.build_cmd,
    runCmd: r.run_cmd,
    runConfirmed: r.run_confirmed,
    approvedSha: r.approved_sha,
  };
}

function toMessage(r: MessageRow): Message {
  return {
    id: Number(r.id),
    role: r.role,
    intent: r.intent,
    text: r.text,
    status: r.status,
    meta: r.meta ?? {},
    createdAt: r.created_at.toISOString(),
  };
}

function toReview(r: ReviewRow): Review {
  return {
    id: Number(r.id),
    stepId: r.step_id,
    status: r.status,
    headSha: r.head_sha,
    baseSha: r.base_sha,
    result: r.result,
    verdict: r.verdict,
    error: r.error,
    createdAt: r.created_at.toISOString(),
    finishedAt: r.finished_at?.toISOString() ?? null,
  };
}

const MESSAGE_COLUMNS = "id, role, intent, text, status, meta, created_at";

export async function ensureLearner(id: string, db: Db = pool()): Promise<void> {
  await db.query("insert into learner (id) values ($1) on conflict (id) do nothing", [id]);
}

/** Finds or starts the learner's enrollment. A new one gets the welcome card straight away. */
export async function getOrCreateEnrollment(learnerId: string, project: string): Promise<Enrollment> {
  const existing = await one<EnrollmentRow>(
    "select * from enrollment where learner_id = $1 and project = $2",
    [learnerId, project],
  );
  if (existing) return toEnrollment(existing);
  return tx(async (client) => {
    await ensureLearner(learnerId, client);
    const created = await one<EnrollmentRow>(
      `insert into enrollment (learner_id, project) values ($1, $2)
       on conflict (learner_id, project) do update set project = excluded.project
       returning *, (xmax = 0) as inserted`,
      [learnerId, project],
      client,
    );
    const row = created as EnrollmentRow & { inserted: boolean };
    if (row.inserted) {
      await insertMessage(Number(row.id), { role: "card", meta: { card: { kind: "welcome" } } }, client);
    }
    return toEnrollment(row);
  });
}

export async function getEnrollment(id: number, db: Db = pool()): Promise<Enrollment | null> {
  const row = await one<EnrollmentRow>("select * from enrollment where id = $1", [id], db);
  return row ? toEnrollment(row) : null;
}

export async function insertMessage(
  enrollmentId: number,
  m: { role: Role; text?: string; status?: MessageStatus; intent?: Intent | null; meta?: MessageMeta },
  db: Db = pool(),
): Promise<Message> {
  const row = await one<MessageRow>(
    `insert into message (enrollment_id, role, text, status, intent, meta)
     values ($1, $2, $3, $4, $5, $6) returning ${MESSAGE_COLUMNS}`,
    [enrollmentId, m.role, m.text ?? "", m.status ?? "done", m.intent ?? null, JSON.stringify(m.meta ?? {})],
    db,
  );
  return toMessage(row!);
}

export async function getMessage(id: number, db: Db = pool()): Promise<(Message & { enrollmentId: number }) | null> {
  const row = await one<MessageRow & { enrollment_id: string }>(
    `select ${MESSAGE_COLUMNS}, enrollment_id from message where id = $1`,
    [id],
    db,
  );
  return row ? { ...toMessage(row), enrollmentId: Number(row.enrollment_id) } : null;
}

export async function setIntent(messageId: number, intent: Intent): Promise<void> {
  await pool().query("update message set intent = $2 where id = $1", [messageId, intent]);
}

export async function finishMessage(
  id: number,
  update: { text: string; status: "done" | "failed"; meta: MessageMeta },
): Promise<void> {
  await pool().query("update message set text = $2, status = $3, meta = $4 where id = $1", [
    id,
    update.text,
    update.status,
    JSON.stringify(update.meta),
  ]);
}

export async function setLanguage(enrollmentId: number, language: Language): Promise<void> {
  await pool().query("update enrollment set language = $2 where id = $1", [enrollmentId, language]);
}

export async function setOpenQuestion(enrollmentId: number, questionId: string | null): Promise<void> {
  await pool().query("update enrollment set open_question = $2 where id = $1", [enrollmentId, questionId]);
}

/** A new repo starts over: its build and run commands are detected again, and nothing is approved yet. */
export async function setRepo(enrollmentId: number, repoUrl: string): Promise<void> {
  await pool().query(
    `update enrollment set repo_url = $2, build_cmd = null, run_cmd = null, run_confirmed = false, approved_sha = null
     where id = $1 and repo_url is distinct from $2`,
    [enrollmentId, repoUrl],
  );
}

export async function setBuild(enrollmentId: number, cmds: { build: string | null; run: string | null; confirmed: boolean }): Promise<void> {
  await pool().query("update enrollment set build_cmd = $2, run_cmd = $3, run_confirmed = $4 where id = $1", [
    enrollmentId,
    cmds.build,
    cmds.run,
    cmds.confirmed,
  ]);
}

export class QuoteNotFound extends Error {}

/** Records an accepted answer. The quote must appear in the learner message it cites (checked here and in the database). */
export async function markAnswered(
  enrollmentId: number,
  questionId: string,
  quote: string,
  learnerMessage: { id: number; text: string },
): Promise<void> {
  if (!quoteAppearsIn(quote, learnerMessage.text)) throw new QuoteNotFound(quote);
  await tx(async (client) => {
    await client.query(
      `insert into answer (enrollment_id, question_id, quote, message_id) values ($1, $2, $3, $4)
       on conflict (enrollment_id, question_id) do update set quote = excluded.quote, message_id = excluded.message_id, at = now()`,
      [enrollmentId, questionId, quote.trim(), learnerMessage.id],
    );
    await client.query("update enrollment set open_question = null where id = $1 and open_question = $2", [enrollmentId, questionId]);
  });
}

/** Starts a review record, or returns null when one is already running for this learner and project. */
export async function createReview(enrollmentId: number, stepId: string): Promise<number | null> {
  try {
    const row = await one<{ id: string }>(
      "insert into review (enrollment_id, step_id, status) values ($1, $2, 'running') returning id",
      [enrollmentId, stepId],
    );
    return Number(row!.id);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return null;
    throw error;
  }
}

export async function getReview(id: number): Promise<(Review & { enrollmentId: number }) | null> {
  const row = await one<ReviewRow & { enrollment_id: string }>("select * from review where id = $1", [id]);
  return row ? { ...toReview(row), enrollmentId: Number(row.enrollment_id) } : null;
}

/**
 * Finishes a review. A pass marks the step built and moves the approved commit, so the next review reads only the
 * diff since this one. Either way a review card goes into the chat.
 */
export async function finishReview(
  id: number,
  done: { status: "passed" | "failed" | "error"; headSha?: string | null; baseSha?: string | null; result?: ReviewResult | null; verdict?: Verdict | null; error?: string | null },
): Promise<void> {
  await tx(async (client) => {
    const row = await one<{ enrollment_id: string; step_id: string }>(
      `update review set status = $2, head_sha = $3, base_sha = $4, result = $5, verdict = $6, error = $7, finished_at = now()
       where id = $1 returning enrollment_id, step_id`,
      [id, done.status, done.headSha ?? null, done.baseSha ?? null, done.result ? JSON.stringify(done.result) : null, done.verdict ? JSON.stringify(done.verdict) : null, done.error ?? null],
      client,
    );
    if (!row) return;
    const enrollmentId = Number(row.enrollment_id);
    if (done.status === "passed") {
      await client.query(
        `insert into step_done (enrollment_id, step_id, evidence) values ($1, $2, $3)
         on conflict (enrollment_id, step_id) do update set evidence = excluded.evidence, at = now()`,
        [enrollmentId, row.step_id, `review ${id} at ${done.headSha?.slice(0, 7) ?? "?"}`],
      );
      await client.query("update enrollment set approved_sha = $2 where id = $1", [enrollmentId, done.headSha ?? null]);
    }
    await insertMessage(enrollmentId, { role: "card", meta: { card: { kind: "review", review: id } } }, client);
  });
}

export async function loadState(enrollmentId: number): Promise<EnrollmentState> {
  const enrollment = await getEnrollment(enrollmentId);
  if (!enrollment) throw new Error(`enrollment ${enrollmentId} not found`);
  const [map, generated] = await Promise.all([getMap(enrollment.project), getGenerated(enrollment.project)]);
  if (!map) throw new Error(`project ${enrollment.project} not found`);
  const [messageRows, doneRows, answerRows, reviewRows] = await Promise.all([
    rows<MessageRow>(`select ${MESSAGE_COLUMNS} from message where enrollment_id = $1 order by id`, [enrollmentId]),
    rows<{ step_id: string }>("select step_id from step_done where enrollment_id = $1", [enrollmentId]),
    rows<{ question_id: string; quote: string; message_id: string }>(
      "select question_id, quote, message_id from answer where enrollment_id = $1",
      [enrollmentId],
    ),
    rows<ReviewRow>("select * from review where enrollment_id = $1 order by id", [enrollmentId]),
  ]);
  const built = new Set(doneRows.map((r) => r.step_id));
  const answers = new Map(answerRows.map((r) => [r.question_id, { questionId: r.question_id, quote: r.quote, messageId: Number(r.message_id) }]));
  const reviews = reviewRows.map(toReview);
  const progress = deriveProgress({
    map,
    generated,
    answered: new Set(answers.keys()),
    built,
    language: enrollment.language,
    openQuestion: enrollment.openQuestion,
    repoUrl: enrollment.repoUrl,
    reviewing: reviews.find((r) => r.status === "running")?.stepId ?? null,
  });
  return { enrollment, map, generated, messages: messageRows.map(toMessage), answers, reviews, built, progress };
}

/**
 * Keeps the cards in step with progress: once a language is chosen, stage 0; then setup (once stage 0 is answered or
 * a repo is linked); then the current step; and the completion card. Safe to call after every turn and review.
 */
export async function syncCards(enrollmentId: number): Promise<boolean> {
  const state = await loadState(enrollmentId);
  const hasCard = (match: (c: CardMeta) => boolean) =>
    state.messages.some((m) => m.role === "card" && m.meta.card && match(m.meta.card));
  const add = async (card: CardMeta) => {
    await insertMessage(enrollmentId, { role: "card", meta: { card } });
    added = true;
  };
  let added = false;
  const { enrollment, progress, map } = state;
  if (!enrollment.language) return false;
  if (state.generated && !hasCard((c) => c.kind === "stage0")) await add({ kind: "stage0" });
  const setupStep = map.steps[0]?.id;
  if ((progress.stage0.done || enrollment.repoUrl) && !hasCard((c) => c.kind === "setup")) await add({ kind: "setup" });
  // The step to build next: the first required step without a passed review. Questions can trail behind it.
  const frontier = progress.steps.find((s) => !s.optional && !s.built);
  if (enrollment.repoUrl && frontier && frontier.id !== setupStep && !hasCard((c) => c.kind === "step" && c.step === frontier.id)) {
    await add({ kind: "step", step: frontier.id });
  }
  if (progress.complete && !hasCard((c) => c.kind === "complete")) await add({ kind: "complete" });
  return added;
}
