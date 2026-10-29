-- ThinkAloud data model, version 0.1 (PostgreSQL 15 or newer)
--
-- Curriculum tables are shared by every learner.
-- Learner tables hold one learner's work.
-- Progress is derived from `event`, the append-only log.
-- `step_state`, `milestone_state` and `concept_state` are caches that the app
-- keeps in step with the log.

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- A rubric is a JSON array of 2 to 4 objects, each with an `id` and a `point`.
create function is_rubric(r jsonb) returns boolean
language sql immutable as $$
  select case
    when r is null or jsonb_typeof(r) <> 'array' then false
    when jsonb_array_length(r) not between 2 and 4 then false
    else not exists (
      select 1 from jsonb_array_elements(r) e
      where jsonb_typeof(e) <> 'object' or not (e ? 'id') or not (e ? 'point')
    )
  end
$$;

-- A primer is {"what", "why", "example", "words": [{"term", "meaning"}]}, with 1 to 6 words.
create function is_primer(p jsonb) returns boolean
language sql immutable as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then false
    when not (p ? 'what' and p ? 'why' and p ? 'example' and p ? 'words') then false
    when jsonb_typeof(p -> 'words') <> 'array' or jsonb_array_length(p -> 'words') not between 1 and 6 then false
    else not exists (
      select 1 from jsonb_array_elements(p -> 'words') w
      where jsonb_typeof(w) <> 'object' or not (w ? 'term') or not (w ? 'meaning')
    )
  end
$$;

-- ---------------------------------------------------------------------------
-- Lookups
-- ---------------------------------------------------------------------------

create table concept_area (
  slug       text primary key,
  name       text not null,
  sort_order int  not null unique
);

create table event_type (
  code        text primary key,
  description text not null
);

-- ---------------------------------------------------------------------------
-- Curriculum (shared)
-- ---------------------------------------------------------------------------

create table challenge (
  id                uuid primary key default gen_random_uuid(),
  source            text not null check (source in ('coding_challenges', 'roadmap_sh')),
  slug              text not null,
  title             text not null,
  source_url        text not null,
  level             text check (level in ('beginner', 'intermediate', 'advanced')),
  summary           text,                       -- in our own words
  requirements      text[] not null default '{}', -- "what it needs to do", in our own words
  restate_rubric    jsonb check (restate_rubric is null or is_rubric(restate_rubric)),
  reflection_prompt text,
  primer            jsonb check (primer is null or is_primer(primer)),  -- plain language for a newcomer
  figure_kind       text check (figure_kind in (                        -- the landing figure, drawn by the app
                      'stream', 'columns', 'match', 'sort', 'diff', 'states', 'tokens', 'tape', 'tree',
                      'bits', 'hash', 'net', 'bucket', 'log', 'kv', 'short', 'pages')),
  content_status    text not null default 'listed'
                    check (content_status in ('listed', 'generated', 'reviewed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source, slug)
);

create table concept (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  area_slug      text not null references concept_area (slug),
  kind           text not null check (kind in ('foundation', 'language', 'framework')),
  language       text check (language is null or language = lower(language)),
  framework      text check (framework is null or framework = lower(framework)),
  brief          text,
  content_status text not null default 'generated'
                 check (content_status in ('generated', 'reviewed')),
  created_at     timestamptz not null default now(),
  check (
    (kind = 'foundation' and language is null and framework is null) or
    (kind = 'language'   and language is not null and framework is null) or
    (kind = 'framework'  and language is not null and framework is not null)
  )
);
create index concept_area_idx on concept (area_slug);

-- The graph. For 'prerequisite', from_concept_id is a prerequisite of to_concept_id.
-- For 'related' the pair is stored once, smaller id first.
create table concept_edge (
  from_concept_id uuid not null references concept (id) on delete cascade,
  to_concept_id   uuid not null references concept (id) on delete cascade,
  type            text not null check (type in ('prerequisite', 'related')),
  primary key (from_concept_id, to_concept_id, type),
  check (from_concept_id <> to_concept_id),
  check (type <> 'related' or from_concept_id < to_concept_id)
);
create index concept_edge_to_idx on concept_edge (to_concept_id);

create function reject_prerequisite_cycle() returns trigger
language plpgsql as $$
begin
  if new.type = 'prerequisite' then
    -- Two sessions adding opposite edges at once could each pass the check below.
    perform pg_advisory_xact_lock(727001);
  end if;
  if new.type = 'prerequisite' and exists (
    with recursive downstream (id) as (
      select new.to_concept_id
      union
      select e.to_concept_id
      from concept_edge e
      join downstream d on e.from_concept_id = d.id
      where e.type = 'prerequisite'
    )
    select 1 from downstream where id = new.from_concept_id
  ) then
    raise exception 'prerequisite cycle: % -> %', new.from_concept_id, new.to_concept_id;
  end if;
  return new;
end
$$;

create trigger concept_edge_no_cycle
  before insert or update on concept_edge
  for each row execute function reject_prerequisite_cycle();

create table milestone (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenge (id) on delete cascade,
  position     int  not null check (position > 0),
  title        text not null,
  summary      text,
  unique (challenge_id, position),
  unique (id, challenge_id)
);

-- Concepts a milestone covers.
create table milestone_concept (
  milestone_id uuid not null references milestone (id) on delete cascade,
  concept_id   uuid not null references concept (id),
  primary key (milestone_id, concept_id)
);
create index milestone_concept_concept_idx on milestone_concept (concept_id);

create table step (
  id           uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references milestone (id) on delete cascade,
  position     int  not null check (position > 0),
  title        text not null,
  est_minutes  int  not null check (est_minutes between 5 and 60),
  unique (milestone_id, position)
);

-- Each step has one Think task (decides completion) and at most one Build task (optional).
-- answer_key shape: {"match": "number_exact" | "numbers_all" | "text_ci", "expected": ...}
-- rubric shape:     [{"id": "p1", "point": "..."}, ...]
create table task (
  id         uuid primary key default gen_random_uuid(),
  step_id    uuid not null references step (id) on delete cascade,
  role       text not null check (role in ('think', 'build')),
  kind       text not null check (kind in ('predict', 'trace', 'spot_bug', 'explain', 'build')),
  prompt     text not null,
  snippet    text,
  answer_key jsonb,
  rubric     jsonb,
  unique (step_id, role),
  check (
    (role = 'think' and kind in ('predict', 'trace', 'spot_bug', 'explain')) or
    (role = 'build' and kind = 'build')
  ),
  check (kind not in ('predict', 'trace') or answer_key is not null),
  check (answer_key is null or (
    jsonb_typeof(answer_key) = 'object' and answer_key ? 'match' and answer_key ? 'expected'
    and answer_key ->> 'match' in ('number_exact', 'numbers_all', 'text_ci')
  )),
  check (kind not in ('explain', 'spot_bug') or is_rubric(rubric)),
  check (kind <> 'spot_bug' or snippet is not null),
  check (kind <> 'build' or (answer_key is null and rubric is null))
);

-- Static help, written once with the curriculum and shown to everyone who asks.
-- level 'hint' is a nudge, level 'example' is a similar case that is not the learner's own code.
-- language '' means the text applies to every language.
create table hint (
  step_id        uuid not null references step (id) on delete cascade,
  level          text not null check (level in ('hint', 'example')),
  language       text not null default '' check (language = lower(language)),
  body           text not null check (length(btrim(body)) > 0),
  content_status text not null default 'generated' check (content_status in ('generated', 'reviewed')),
  created_at     timestamptz not null default now(),
  primary key (step_id, level, language)
);

-- The milestone's closing question. In v1 a milestone has one teach-back question whose rubric
-- points each carry a `concept` slug, and concept_id is null. The older shape, up to three
-- questions with one concept each, still loads. The composite key keeps concept_id inside the
-- milestone, and question_concepts_check does the same for the tags on the points.
create table question (
  id           uuid primary key default gen_random_uuid(),
  milestone_id uuid not null,
  concept_id   uuid,
  position     int  not null check (position between 1 and 3),
  prompt       text not null,
  rubric       jsonb not null check (is_rubric(rubric)),
  unique (milestone_id, position),
  foreign key (milestone_id) references milestone (id) on delete cascade,
  foreign key (milestone_id, concept_id) references milestone_concept (milestone_id, concept_id)
);

-- Every concept tag on a rubric point must name a concept the milestone covers, and a question
-- without its own concept must tag every point, so each met point can mark a concept explained.
create function check_question_concepts() returns trigger
language plpgsql as $$
declare
  untagged int;
  outside  text;
begin
  select count(*) into untagged
    from jsonb_array_elements(new.rubric) r
   where coalesce(r ->> 'concept', '') = '';
  if new.concept_id is null and untagged > 0 then
    raise exception 'a question without a concept must tag every rubric point with one';
  end if;
  select r ->> 'concept' into outside
    from jsonb_array_elements(new.rubric) r
   where coalesce(r ->> 'concept', '') <> ''
     and not exists (select 1 from milestone_concept mc join concept c on c.id = mc.concept_id
                      where mc.milestone_id = new.milestone_id and c.slug = r ->> 'concept')
   limit 1;
  if outside is not null then
    raise exception 'rubric point concept % is not one the milestone covers', outside;
  end if;
  return new;
end
$$;

create trigger question_concepts_check
  before insert or update on question
  for each row execute function check_question_concepts();

-- Links are shown only when http_status = 200 and verified_at is set.
create table resource (
  id          uuid primary key default gen_random_uuid(),
  concept_id  uuid not null references concept (id) on delete cascade,
  title       text not null,
  url         text not null,
  language    text check (language is null or language = lower(language)),
  framework   text check (framework is null or framework = lower(framework)),
  http_status int,
  verified_at timestamptz,
  unique (concept_id, url),
  check (framework is null or language is not null)
);

-- Language and framework notes for a concept, generated on first use and cached.
-- framework = '' means no framework.
create table language_note (
  concept_id     uuid not null references concept (id) on delete cascade,
  language       text not null check (language = lower(language)),
  framework      text not null default '' check (framework = lower(framework)),
  body           text not null,
  content_status text not null default 'generated'
                 check (content_status in ('generated', 'reviewed')),
  created_at     timestamptz not null default now(),
  primary key (concept_id, language, framework)
);

-- ---------------------------------------------------------------------------
-- Learners
-- ---------------------------------------------------------------------------

create table learner (
  id                uuid primary key default gen_random_uuid(),
  display_name      text,
  email             text check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  email_verified_at timestamptz,
  created_at        timestamptz not null default now(),
  client_hash       text,  -- salted hash of the caller's address, for spend limits across guest IDs
  last_seen_at      timestamptz not null default now()
);
create unique index learner_email_uniq on learner (lower(email)) where email is not null;
create index learner_client_idx on learner (client_hash) where client_hash is not null;

create table enrollment (
  id            uuid primary key default gen_random_uuid(),
  learner_id    uuid not null references learner (id) on delete cascade,
  challenge_id  uuid not null references challenge (id),
  language      text check (language is null or language = lower(language)),
  framework     text check (framework is null or framework = lower(framework)),
  support_level text not null default 'standard' check (support_level in ('guided', 'standard', 'independent')),
  repo_url      text check (repo_url is null or
                            repo_url ~ '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?$'),
  status        text not null default 'active' check (status in ('active', 'understood', 'abandoned')),
  started_at    timestamptz not null default now(),
  understood_at timestamptz,
  built_at      timestamptz,
  unique (learner_id, challenge_id),
  check (framework is null or language is not null),
  check (repo_url is null or language is not null)
);
create index enrollment_challenge_idx on enrollment (challenge_id);

-- Cache: one row per enrollment and step once the learner has touched it.
-- help_level is the highest level the learner has allowed on this step.
create table step_state (
  enrollment_id  uuid not null references enrollment (id) on delete cascade,
  step_id        uuid not null references step (id),
  status         text not null default 'not_started'
                 check (status in ('not_started', 'in_progress', 'done', 'parked')),
  help_level     text not null default 'none' check (help_level in ('none', 'hint', 'example', 'code')),
  started_at     timestamptz,
  done_at        timestamptz,
  active_seconds int not null default 0 check (active_seconds >= 0),
  parked_note    text,
  updated_at     timestamptz not null default now(),
  primary key (enrollment_id, step_id)
);

create table milestone_state (
  enrollment_id uuid not null references enrollment (id) on delete cascade,
  milestone_id  uuid not null references milestone (id),
  status        text not null default 'not_started'
                check (status in ('not_started', 'in_progress', 'understood')),
  understood_at timestamptz,
  built_at      timestamptz,
  primary key (enrollment_id, milestone_id)
);

-- Per learner, not per enrollment, so a concept explained in one project counts in every project.
-- No row means the concept is new. The status is derived from the timestamps, so it cannot
-- disagree with them. 'applied' needs both timestamps, and code seen before the learner has
-- explained the concept only counts as 'seen'.
create table concept_state (
  learner_id   uuid not null references learner (id) on delete cascade,
  concept_id   uuid not null references concept (id),
  seen_at      timestamptz,
  explained_at timestamptz,
  applied_at   timestamptz,
  status       text generated always as (
    case
      when explained_at is not null and applied_at is not null then 'applied'
      when explained_at is not null then 'explained'
      when seen_at is not null or applied_at is not null then 'seen'
      else 'new'
    end
  ) stored,
  updated_at   timestamptz not null default now(),
  primary key (learner_id, concept_id)
);
create index concept_state_concept_idx on concept_state (concept_id);

-- Everything the learner writes that is graded or kept.
-- points shape: [{"id": "p1", "met": true, "quote": "..."}]
create table answer (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollment (id) on delete cascade,
  kind          text not null check (kind in ('restate', 'think', 'gate', 'reflection')),
  task_id       uuid references task (id),
  question_id   uuid references question (id),
  attempt       int  not null default 1 check (attempt > 0),
  body          text not null check (length(btrim(body)) > 0),
  grade         text not null default 'ungraded'
                check (grade in ('met', 'partial', 'not_yet', 'ungraded')),
  points        jsonb,
  graded_by     text check (graded_by in ('key', 'model')),
  model         text,
  followup_of   uuid references answer (id),
  disputed_at   timestamptz,
  dispute_note  text,
  created_at    timestamptz not null default now(),
  check (
    (kind = 'think' and task_id is not null and question_id is null) or
    (kind = 'gate'  and question_id is not null and task_id is null) or
    (kind in ('restate', 'reflection') and task_id is null and question_id is null)
  ),
  check (kind <> 'reflection' or grade = 'ungraded'),
  check (grade = 'ungraded' or graded_by is not null),
  check (graded_by is distinct from 'model' or model is not null),
  check (graded_by is distinct from 'key' or grade in ('met', 'not_yet'))
);
create unique index answer_attempt_uniq on answer (
  enrollment_id, kind,
  coalesce(task_id, question_id, '00000000-0000-0000-0000-000000000000'::uuid),
  attempt
);
create index answer_question_idx on answer (question_id) where question_id is not null;
create index answer_task_idx on answer (task_id) where task_id is not null;
create index answer_followup_idx on answer (followup_of) where followup_of is not null;

-- Model grading must agree with the rubric, and every point it claims as met must be backed by
-- a real quote from the answer. Predict and trace tasks are graded by key (in the app), never by
-- the model. Explain and spot-the-bug tasks, gate questions and restate answers use a rubric.
create function check_answer_grading() returns trigger
language plpgsql as $$
declare
  task_kind  text;
  rubric     jsonb;
  total      int;
  met        int := 0;
  p          jsonb;
  norm_body  text := lower(regexp_replace(new.body, '\s+', ' ', 'g'));
  norm_quote text;
  expected   text;
begin
  if new.graded_by is distinct from 'model' and new.points is not null then
    raise exception 'points belong to model grading only';
  end if;

  if new.kind = 'think' and new.graded_by is not null then
    select t.kind into task_kind from task t where t.id = new.task_id;
    if task_kind in ('predict', 'trace') and new.graded_by <> 'key' then
      raise exception '% tasks are graded by key, not by the model', task_kind;
    end if;
    if task_kind in ('explain', 'spot_bug') and new.graded_by <> 'model' then
      raise exception '% tasks are graded by rubric, not by key', task_kind;
    end if;
  elsif new.kind in ('gate', 'restate') and new.graded_by = 'key' then
    raise exception '% answers are graded by rubric, not by key', new.kind;
  end if;

  if new.graded_by is distinct from 'model' then
    return new;
  end if;

  rubric := case new.kind
    when 'think'   then (select t.rubric from task t where t.id = new.task_id)
    when 'gate'    then (select q.rubric from question q where q.id = new.question_id)
    when 'restate' then (select c.restate_rubric
                           from enrollment e join challenge c on c.id = e.challenge_id
                          where e.id = new.enrollment_id)
  end;
  if rubric is null then
    raise exception 'there is no rubric to grade this answer against';
  end if;
  if new.points is null or jsonb_typeof(new.points) <> 'array' then
    raise exception 'model grading needs a points array';
  end if;

  total := jsonb_array_length(rubric);
  if jsonb_array_length(new.points) <> total or exists (
    select 1 from jsonb_array_elements(rubric) r
    where (select count(*) from jsonb_array_elements(new.points) x where x ->> 'id' = r ->> 'id') <> 1
  ) then
    raise exception 'points must list every rubric point exactly once';
  end if;

  for p in select * from jsonb_array_elements(new.points) loop
    if coalesce((p ->> 'met')::boolean, false) then
      met := met + 1;
      norm_quote := lower(regexp_replace(btrim(coalesce(p ->> 'quote', '')), '\s+', ' ', 'g'));
      if norm_quote = '' or position(norm_quote in norm_body) = 0 then
        raise exception 'the quote for point % is not in the answer', p ->> 'id';
      end if;
    end if;
  end loop;

  expected := case when met = total then 'met' when met = 0 then 'not_yet' else 'partial' end;
  if new.grade <> expected then
    raise exception 'grade % does not match the points (% of % met)', new.grade, met, total;
  end if;
  return new;
end
$$;

create trigger answer_grading_check
  before insert or update on answer
  for each row execute function check_answer_grading();

-- findings shape: [{"concept_slug": "...", "applied": true, "file": "...", "lines": [10, 24],
--                   "confidence": "high", "note": "..."}]
create table repo_evaluation (
  id              uuid primary key default gen_random_uuid(),
  enrollment_id   uuid not null references enrollment (id) on delete cascade,
  repo_url        text not null,
  from_sha        text,
  to_sha          text not null,
  commit_messages jsonb not null default '[]',
  findings        jsonb not null default '[]',
  summary         text,
  model           text,
  created_at      timestamptz not null default now(),
  unique (enrollment_id, to_sha)
);

-- Why a concept is marked explained or applied: the learner's own words or a place in the repo.
create table evidence (
  id                 uuid primary key default gen_random_uuid(),
  learner_id         uuid not null references learner (id) on delete cascade,
  concept_id         uuid not null references concept (id),
  kind               text not null check (kind in ('answer', 'repo')),
  answer_id          uuid references answer (id) on delete cascade,
  repo_evaluation_id uuid references repo_evaluation (id) on delete cascade,
  quote              text,
  commit_sha         text,
  file_path          text,
  line_start         int,
  line_end           int,
  confidence         text check (confidence in ('high', 'medium', 'low')),
  created_at         timestamptz not null default now(),
  check (
    (kind = 'answer' and answer_id is not null and repo_evaluation_id is null) or
    (kind = 'repo' and repo_evaluation_id is not null and answer_id is null)
  ),
  check (line_end is null or (line_start is not null and line_end >= line_start))
);
create index evidence_learner_concept_idx on evidence (learner_id, concept_id);
create index evidence_answer_idx on evidence (answer_id) where answer_id is not null;
create index evidence_repo_evaluation_idx on evidence (repo_evaluation_id) where repo_evaluation_id is not null;

-- The append-only log. Progress is computed from it.
create table event (
  id            bigint generated always as identity primary key,
  learner_id    uuid not null references learner (id) on delete cascade,
  enrollment_id uuid references enrollment (id) on delete cascade,
  type          text not null references event_type (code),
  step_id       uuid references step (id),
  milestone_id  uuid references milestone (id),
  concept_id    uuid references concept (id),
  answer_id     uuid references answer (id) on delete cascade,
  payload       jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index event_enrollment_idx on event (enrollment_id, id);
create index event_learner_idx on event (learner_id, id);
create index event_type_idx on event (type, created_at);
create index event_answer_idx on event (answer_id) where answer_id is not null;

-- Updates are never allowed. Deletes are allowed only inside a transaction that sets
-- `app.allow_event_delete = 'on'`, which is how "delete my data" works.
create function event_append_only() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'event is append-only';
  end if;
  if coalesce(current_setting('app.allow_event_delete', true), '') <> 'on' then
    raise exception 'event is append-only';
  end if;
  return old;
end
$$;

create trigger event_no_update before update on event
  for each row execute function event_append_only();
create trigger event_no_delete before delete on event
  for each row execute function event_append_only();

create function event_no_truncate() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.allow_event_delete', true), '') <> 'on' then
    raise exception 'event is append-only';
  end if;
  return null;
end
$$;

create trigger event_no_truncate before truncate on event
  for each statement execute function event_no_truncate();

-- Side lane. Never counts toward progress.
--   question: an in-scope question that was answered
--   later:    an off-concept topic, parked
--   extra:    a topic the learner added to the track as an optional Extra step
create table side_item (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollment (id) on delete cascade,
  kind          text not null check (kind in ('question', 'later', 'extra')),
  prompt        text not null,
  response      text,
  concept_id    uuid references concept (id),
  in_scope      boolean not null,
  status        text not null default 'open' check (status in ('open', 'done')),
  created_at    timestamptz not null default now(),
  done_at       timestamptz,
  check (kind <> 'question' or in_scope),
  check (kind <> 'later' or not in_scope),
  check (done_at is null or status = 'done')
);
create index side_item_enrollment_idx on side_item (enrollment_id);

create table session_summary (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollment (id) on delete cascade,
  summary       text not null,
  covers_from   timestamptz not null,
  covers_to     timestamptz not null,
  created_at    timestamptz not null default now(),
  check (covers_to >= covers_from)
);
create index session_summary_enrollment_idx on session_summary (enrollment_id, created_at);

-- Recent conversation turns, passed to the model. Older turns are replaced by session_summary.
create table message (
  id            bigint generated always as identity primary key,
  enrollment_id uuid not null references enrollment (id) on delete cascade,
  step_id       uuid references step (id),
  role          text not null check (role in ('learner', 'assistant')),
  body          text not null,
  created_at    timestamptz not null default now()
);
create index message_enrollment_idx on message (enrollment_id, id);

-- For the daily spend cap and the per-guest limits.
create table llm_usage (
  id            bigint generated always as identity primary key,
  learner_id    uuid references learner (id) on delete set null,
  enrollment_id uuid references enrollment (id) on delete set null,
  purpose       text not null check (purpose in ('tutor', 'grade', 'generate', 'repo_review', 'summarise')),
  provider      text not null,
  model         text not null,
  input_tokens  int not null check (input_tokens >= 0),
  output_tokens int not null check (output_tokens >= 0),
  cost_usd      numeric(10, 6) not null check (cost_usd >= 0),
  created_at    timestamptz not null default now()
);
create index llm_usage_day_idx on llm_usage (created_at);
create index llm_usage_learner_idx on llm_usage (learner_id, created_at);
create index llm_usage_enrollment_idx on llm_usage (enrollment_id) where enrollment_id is not null;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

create view v_challenge_concept as
  select distinct m.challenge_id, mc.concept_id
  from milestone m
  join milestone_concept mc on mc.milestone_id = m.id;

create view v_milestone_estimate as
  select m.id as milestone_id,
         count(s.id)::int as steps,
         coalesce(sum(s.est_minutes), 0)::int as est_minutes
  from milestone m
  left join step s on s.milestone_id = m.id
  group by m.id;

-- A milestone is understood when every step is done and its teach-back (or every gate question) has a 'met' answer.
create view v_milestone_progress as
  select p.*,
         (p.steps_total > 0 and p.steps_done = p.steps_total
            and p.gate_total > 0 and p.gate_met = p.gate_total) as understood
  from (
    select en.id as enrollment_id,
           m.id  as milestone_id,
           (select count(*) from step s where s.milestone_id = m.id)::int as steps_total,
           (select count(*) from step s
              join step_state ss on ss.step_id = s.id and ss.enrollment_id = en.id
             where s.milestone_id = m.id and ss.status = 'done')::int as steps_done,
           (select count(*) from question q where q.milestone_id = m.id)::int as gate_total,
           (select count(*) from question q
             where q.milestone_id = m.id
               and exists (select 1 from answer a
                            where a.enrollment_id = en.id
                              and a.question_id = q.id
                              and a.grade = 'met'))::int as gate_met
    from enrollment en
    join milestone m on m.challenge_id = en.challenge_id
  ) p;

create view v_help_log as
  select e.enrollment_id, e.step_id, e.type, e.payload ->> 'level' as level, e.created_at
  from event e
  where e.type in ('help_offered', 'help_level_set', 'help_given');

-- A project is understood when every milestone is understood and a reflection has been submitted.
-- A parked step keeps its milestone from being understood until the step is done.
create view v_enrollment_progress as
  select en.id as enrollment_id,
         count(mp.milestone_id)::int as milestones_total,
         (count(*) filter (where mp.understood))::int as milestones_understood,
         exists (select 1 from answer a where a.enrollment_id = en.id and a.kind = 'reflection')
           as reflection_submitted,
         (count(mp.milestone_id) > 0
            and count(*) filter (where mp.understood) = count(mp.milestone_id)
            and exists (select 1 from answer a where a.enrollment_id = en.id and a.kind = 'reflection'))
           as understood
  from enrollment en
  left join v_milestone_progress mp on mp.enrollment_id = en.id
  group by en.id;

-- Everything that belongs to one learner, as one JSON document. A test checks that every table
-- with a learner_id or enrollment_id column appears here.
create function export_learner(p_learner uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'learner',         (select to_jsonb(x) from learner x where x.id = p_learner),
    'enrollment',      (select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at), '[]'::jsonb)
                          from enrollment x where x.learner_id = p_learner),
    'concept_state',   (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                          from concept_state x where x.learner_id = p_learner),
    'evidence',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb)
                          from evidence x where x.learner_id = p_learner),
    'event',           (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
                          from event x where x.learner_id = p_learner),
    'llm_usage',       (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
                          from llm_usage x where x.learner_id = p_learner),
    'step_state',      (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                          from step_state x join enrollment e on e.id = x.enrollment_id
                         where e.learner_id = p_learner),
    'milestone_state', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                          from milestone_state x join enrollment e on e.id = x.enrollment_id
                         where e.learner_id = p_learner),
    'answer',          (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb)
                          from answer x join enrollment e on e.id = x.enrollment_id
                         where e.learner_id = p_learner),
    'repo_evaluation', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb)
                          from repo_evaluation x join enrollment e on e.id = x.enrollment_id
                         where e.learner_id = p_learner),
    'side_item',       (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb)
                          from side_item x join enrollment e on e.id = x.enrollment_id
                         where e.learner_id = p_learner),
    'session_summary', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb)
                          from session_summary x join enrollment e on e.id = x.enrollment_id
                         where e.learner_id = p_learner),
    'message',         (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
                          from message x join enrollment e on e.id = x.enrollment_id
                         where e.learner_id = p_learner)
  )
$$;

commit;
