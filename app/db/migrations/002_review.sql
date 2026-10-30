-- Stage 0, setup with a GitHub repo, stored questions and sandbox reviews (HANDOFF.md sections 2 and 3).

-- The generated layer for each project: profile, stage 0, step questions and checks (content/generated/<slug>.yaml).
alter table project add column generated jsonb;

-- The learner's repo, and how the sandbox builds and runs it: detected at setup, then confirmed by the learner.
alter table enrollment
  add column repo_url      text,
  add column build_cmd     text,
  add column run_cmd       text,
  add column run_confirmed boolean not null default false,
  -- The commit of the last passed review. The next review reads only the diff since it.
  add column approved_sha  text;

-- open_question now holds a question id from the generated layer (p-what, s1-q2), not a concept id.

-- An accepted answer to a stored question, with the learner's own words as evidence.
create table answer (
  enrollment_id bigint not null references enrollment (id) on delete cascade,
  question_id   text not null,
  quote         text not null,
  message_id    bigint not null references message (id) on delete cascade,
  at            timestamptz not null default now(),
  primary key (enrollment_id, question_id)
);

-- The same rule as concept_explained: the quote must appear in the learner message it cites.
create trigger answer_quote
  before insert or update on answer
  for each row execute function check_explained_quote();

create table review (
  id            bigint generated always as identity primary key,
  enrollment_id bigint not null references enrollment (id) on delete cascade,
  step_id       text not null,
  status        text not null check (status in ('running', 'passed', 'failed', 'error')),
  head_sha      text,
  base_sha      text,
  -- Build, check results and the diff stat from the sandbox; the reviewer's verdict.
  result        jsonb,
  verdict       jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index review_enrollment_idx on review (enrollment_id, id);
-- One review at a time per learner and project.
create unique index review_one_running_idx on review (enrollment_id) where status = 'running';
