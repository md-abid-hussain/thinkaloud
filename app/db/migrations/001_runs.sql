-- App-owned tables. The shared schema lives in ../db (vendor/db) and is never edited here.

-- A run is one model call the learner does not have to wait for: grading an answer, or one mentor turn.
-- The request creates the row and returns its id; a worker in the server process executes it and
-- appends run_event rows (trace lines, text chunks, the result) that the browser follows over SSE.
create table if not exists run (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('grade', 'mentor')),
  status        text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'paused')),
  learner_id    uuid not null references learner (id) on delete cascade,
  enrollment_id uuid references enrollment (id) on delete cascade,
  step_id       uuid references step (id),
  question_id   uuid references question (id),
  input         jsonb not null default '{}',
  result        jsonb,
  error         text,
  attempts      int not null default 0,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);
create index if not exists run_status_idx on run (status, created_at);
create index if not exists run_enrollment_idx on run (enrollment_id, created_at);

create table if not exists run_event (
  id         bigint generated always as identity primary key,
  run_id     uuid not null references run (id) on delete cascade,
  type       text not null check (type in ('status', 'trace', 'text', 'result', 'error')),
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists run_event_run_idx on run_event (run_id, id);

-- What the mentor noticed the learner got wrong, kept across projects. Learner-owned and exported.
create table if not exists misconception (
  id          uuid primary key default gen_random_uuid(),
  learner_id  uuid not null references learner (id) on delete cascade,
  concept_id  uuid references concept (id),
  enrollment_id uuid references enrollment (id) on delete set null,
  note        text not null check (length(btrim(note)) > 0),
  created_at  timestamptz not null default now()
);
create index if not exists misconception_learner_idx on misconception (learner_id, created_at);
