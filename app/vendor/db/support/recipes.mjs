// The write recipes from DATA_MODEL.md section 4, as small functions over SQL.
// The workflow tests run them against the schema. The app's data layer can start from these.

import { json, modelPoints, gradeFor } from './helpers.mjs';
import { keyMatches } from './matching.mjs';

export { keyMatches, numbersIn } from './matching.mjs';

export function recipes(db) {
  const rows = async (text, params) => (await db.query(text, params)).rows;
  const one = async (text, params) => (await rows(text, params))[0];

  const log = (l, e, type, o = {}) =>
    db.query(
      `insert into event (learner_id, enrollment_id, type, step_id, milestone_id, concept_id, answer_id, payload)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [l, e, type, o.step ?? null, o.milestone ?? null, o.concept ?? null, o.answer ?? null, JSON.stringify(o.payload ?? {})]
    );

  async function addAnswer(e, kind, o) {
    const taskId = o.taskId ?? null;
    const questionId = o.questionId ?? null;
    const { n } = await one(
      `select coalesce(max(attempt), 0) + 1 as n from answer
        where enrollment_id = $1 and kind = $2
          and task_id is not distinct from $3::uuid and question_id is not distinct from $4::uuid`,
      [e, kind, taskId, questionId]
    );
    return one(
      `insert into answer (enrollment_id, kind, task_id, question_id, attempt, body, grade, graded_by, model, points, followup_of)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id, attempt`,
      [
        e, kind, taskId, questionId, n, o.body, o.grade ?? 'ungraded', o.gradedBy ?? null, o.model ?? null,
        o.points ? JSON.stringify(o.points) : null, o.followupOf ?? null,
      ]
    );
  }

  const rubricGrade = (rubric, body, o = {}) => {
    const met = o.metCount ?? rubric.length;
    const quote = o.quote ?? body.split(/\s+/).slice(0, 2).join(' ');
    return { grade: gradeFor(met, rubric.length), points: modelPoints(rubric, met, quote) };
  };

  async function upsertConcept(l, conceptId, column) {
    await db.query(
      `insert into concept_state (learner_id, concept_id, ${column}) values ($1, $2, now())
       on conflict (learner_id, concept_id)
       do update set ${column} = coalesce(concept_state.${column}, now()), updated_at = now()`,
      [l, conceptId]
    );
  }

  const app = {
    log,

    async enroll(l, slug, { language = null, framework = null, supportLevel = 'standard' } = {}) {
      const ch = await one(`select id from challenge where slug = $1`, [slug]);
      const e = (await one(
        `insert into enrollment (learner_id, challenge_id, language, framework, support_level) values ($1, $2, $3, $4, $5) returning id`,
        [l, ch.id, language, framework, supportLevel]
      )).id;
      await log(l, e, 'enrolled', { payload: { support_level: supportLevel } });
      if (language) await log(l, e, 'language_set', { payload: { language, framework } });
      return e;
    },

    async setLanguage(l, e, language, framework = null) {
      await db.query(`update enrollment set language = $2, framework = $3 where id = $1`, [e, language, framework]);
      await log(l, e, 'language_set', { payload: { language, framework } });
    },

    async setSupportLevel(l, e, level) {
      await db.query(`update enrollment set support_level = $2 where id = $1`, [e, level]);
      await log(l, e, 'support_level_set', { payload: { level } });
    },

    async linkRepo(l, e, url) {
      await db.query(`update enrollment set repo_url = $2 where id = $1`, [e, url]);
      await log(l, e, 'repo_linked', { payload: { url } });
    },

    async seen(l, e, conceptId) {
      await upsertConcept(l, conceptId, 'seen_at');
      await log(l, e, 'concept_seen', { concept: conceptId });
    },

    async startStep(l, e, stepId) {
      await db.query(
        `insert into step_state (enrollment_id, step_id, status, started_at) values ($1, $2, 'in_progress', now())
         on conflict (enrollment_id, step_id) do update
           set status = 'in_progress', started_at = coalesce(step_state.started_at, now()), updated_at = now()
         where step_state.status <> 'done'`,
        [e, stepId]
      );
      await log(l, e, 'step_started', { step: stepId });
    },

    async park(l, e, stepId, note = null) {
      await db.query(
        `insert into step_state (enrollment_id, step_id, status, parked_note) values ($1, $2, 'parked', $3)
         on conflict (enrollment_id, step_id) do update set status = 'parked', parked_note = $3, updated_at = now()`,
        [e, stepId, note]
      );
      await log(l, e, 'step_parked', { step: stepId });
    },

    async setHelp(l, e, stepId, level) {
      await db.query(
        `insert into step_state (enrollment_id, step_id, status, help_level) values ($1, $2, 'in_progress', $3)
         on conflict (enrollment_id, step_id) do update set help_level = $3, updated_at = now()`,
        [e, stepId, level]
      );
      await log(l, e, 'help_level_set', { step: stepId, payload: { level } });
    },

    async restate(l, e, body, o = {}) {
      const { rubric } = await one(
        `select c.restate_rubric as rubric from enrollment en join challenge c on c.id = en.challenge_id where en.id = $1`, [e]
      );
      const g = rubricGrade(json(rubric), body, o);
      const a = await addAnswer(e, 'restate', { body, grade: g.grade, gradedBy: 'model', model: 'stub', points: g.points });
      await log(l, e, 'answer_graded', { answer: a.id, payload: { grade: g.grade } });
      return g.grade;
    },

    async refreshMilestone(l, e, milestoneId) {
      const p = await one(`select understood from v_milestone_progress where enrollment_id = $1 and milestone_id = $2`, [e, milestoneId]);
      if (!p.understood) return false;
      const was = await one(`select status from milestone_state where enrollment_id = $1 and milestone_id = $2`, [e, milestoneId]);
      if (was?.status !== 'understood') {
        await db.query(
          `insert into milestone_state (enrollment_id, milestone_id, status, understood_at) values ($1, $2, 'understood', now())
           on conflict (enrollment_id, milestone_id) do update set status = 'understood', understood_at = now()`,
          [e, milestoneId]
        );
        await log(l, e, 'milestone_understood', { milestone: milestoneId });
      }
      return true;
    },

    async thinkAnswer(l, e, stepId, body, o = {}) {
      const task = await one(`select * from task where step_id = $1 and role = 'think'`, [stepId]);
      const step = await one(`select milestone_id from step where id = $1`, [stepId]);
      let result;
      if (task.kind === 'predict' || task.kind === 'trace') {
        // The prompt and snippet let the matcher tell a restated question from a second guess.
        const context = `${task.prompt}\n${task.snippet ?? ''}`;
        result = { grade: keyMatches(json(task.answer_key), body, context) ? 'met' : 'not_yet', gradedBy: 'key' };
      } else {
        const g = rubricGrade(json(task.rubric), body, o);
        result = { grade: g.grade, points: g.points, gradedBy: 'model', model: 'stub' };
      }
      const a = await addAnswer(e, 'think', { taskId: task.id, body, ...result });
      await log(l, e, 'answer_graded', { step: stepId, answer: a.id, payload: { grade: result.grade } });
      if (result.grade === 'met') {
        await db.query(
          `insert into step_state (enrollment_id, step_id, status, started_at, done_at) values ($1, $2, 'done', now(), now())
           on conflict (enrollment_id, step_id) do update set status = 'done', done_at = now(), updated_at = now()`,
          [e, stepId]
        );
        await log(l, e, 'step_done', { step: stepId });
        await app.refreshMilestone(l, e, step.milestone_id);
      }
      return result.grade;
    },

    // A teach-back marks the concept of every met point explained, even when the answer is partial.
    // An older gate question without tags marks its own concept, and only when it is met.
    async gateAnswer(l, e, questionId, body, o = {}) {
      const q = await one(`select * from question where id = $1`, [questionId]);
      const rubric = json(q.rubric);
      const g = rubricGrade(rubric, body, o);
      const a = await addAnswer(e, 'gate', {
        questionId, body, grade: g.grade, gradedBy: 'model', model: 'stub', points: g.points, followupOf: o.followupOf,
      });
      await log(l, e, 'answer_graded', { milestone: q.milestone_id, answer: a.id, payload: { grade: g.grade } });
      if (g.grade === 'met') await log(l, e, 'gate_met', { milestone: q.milestone_id, concept: q.concept_id, answer: a.id });

      const explained = new Map();
      for (const p of g.points.filter((p) => p.met)) {
        const slug = rubric.find((r) => r.id === p.id).concept;
        const conceptId = slug
          ? (await one(`select id from concept where slug = $1`, [slug])).id
          : g.grade === 'met' ? q.concept_id : null;
        if (conceptId && !explained.has(conceptId)) explained.set(conceptId, p.quote);
      }
      for (const [conceptId, quote] of explained) {
        await upsertConcept(l, conceptId, 'explained_at');
        await log(l, e, 'concept_explained', { concept: conceptId, answer: a.id });
        await db.query(
          `insert into evidence (learner_id, concept_id, kind, answer_id, quote, confidence) values ($1, $2, 'answer', $3, $4, 'high')`,
          [l, conceptId, a.id, quote]
        );
      }
      if (g.grade === 'met') await app.refreshMilestone(l, e, q.milestone_id);
      return { grade: g.grade, answerId: a.id, explained: [...explained.keys()] };
    },

    async reflect(l, e, body) {
      const a = await addAnswer(e, 'reflection', { body });
      await log(l, e, 'reflection_submitted', { answer: a.id });
      const p = await one(`select understood from v_enrollment_progress where enrollment_id = $1`, [e]);
      if (p.understood) {
        await db.query(`update enrollment set status = 'understood', understood_at = now() where id = $1`, [e]);
        await log(l, e, 'project_understood');
      }
      return p.understood;
    },

    async repoCheck(l, e, { fromSha = null, toSha, messages = [], findings }) {
      const ev = await one(
        `insert into repo_evaluation (enrollment_id, repo_url, from_sha, to_sha, commit_messages, findings)
         select en.id, en.repo_url, $2, $3, $4, $5 from enrollment en where en.id = $1 returning id`,
        [e, fromSha, toSha, JSON.stringify(messages), JSON.stringify(findings)]
      );
      await log(l, e, 'repo_checked', { payload: { to: toSha } });
      for (const f of findings) {
        const c = await one(`select id from concept where slug = $1`, [f.concept]);
        await db.query(
          `insert into evidence (learner_id, concept_id, kind, repo_evaluation_id, commit_sha, file_path, line_start, line_end, confidence)
           values ($1, $2, 'repo', $3, $4, $5, $6, $7, $8)`,
          [l, c.id, ev.id, toSha, f.file, f.lines[0], f.lines[1], f.confidence]
        );
        if (f.applied && f.confidence !== 'low') {
          await upsertConcept(l, c.id, 'applied_at');
          await log(l, e, 'concept_applied', { concept: c.id });
        }
      }
      return ev.id;
    },
  };
  return app;
}
