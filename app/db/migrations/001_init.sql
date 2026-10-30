-- ThinkAloud schema, from PRODUCT_BRIEF.md section 11.

create table project (
  slug       text primary key,
  title      text not null,
  source_url text not null,
  level      text not null check (level in ('beginner', 'intermediate', 'advanced')),
  map        jsonb not null,
  loaded_at  timestamptz not null default now()
);

create table language_layer (
  project    text not null references project (slug) on delete cascade,
  language   text not null check (language in ('java', 'python', 'node')),
  status     text not null check (status in ('building', 'ready', 'failed')),
  layer      jsonb,
  error      text,
  updated_at timestamptz not null default now(),
  primary key (project, language)
);

create table learner (
  id         uuid primary key,
  created_at timestamptz not null default now()
);

create table enrollment (
  id            bigint generated always as identity primary key,
  learner_id    uuid not null references learner (id) on delete cascade,
  project       text not null references project (slug),
  language      text check (language in ('java', 'python', 'node')),
  open_question text,
  created_at    timestamptz not null default now(),
  unique (learner_id, project)
);

-- role: learner and mentor messages, and cards the app inserts from the map (welcome, step, complete).
create table message (
  id            bigint generated always as identity primary key,
  enrollment_id bigint not null references enrollment (id) on delete cascade,
  role          text not null check (role in ('learner', 'mentor', 'card')),
  intent        text check (intent in ('help', 'explaining', 'code')),
  text          text not null default '',
  status        text not null default 'done' check (status in ('pending', 'done', 'failed')),
  meta          jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index message_enrollment_idx on message (enrollment_id, id);
-- At most one mentor reply in flight per enrollment.
create unique index message_one_pending_idx on message (enrollment_id) where status = 'pending';

create table step_done (
  enrollment_id bigint not null references enrollment (id) on delete cascade,
  step_id       text not null,
  evidence      text not null default '',
  message_id    bigint references message (id) on delete set null,
  at            timestamptz not null default now(),
  primary key (enrollment_id, step_id)
);

create table concept_explained (
  enrollment_id bigint not null references enrollment (id) on delete cascade,
  concept_id    text not null,
  quote         text not null,
  message_id    bigint not null references message (id) on delete cascade,
  at            timestamptz not null default now(),
  primary key (enrollment_id, concept_id)
);

-- The same normalisation as lib/quote.ts: lower case, straight quotes, collapsed whitespace.
create function normalize_quote(t text) returns text
  language sql immutable
  as $$ select btrim(regexp_replace(translate(lower(t), '‘’“”', '''''""'), '\s+', ' ', 'g')) $$;

-- Evidence must be the learner's own words: the quote has to appear in the learner message it cites.
create function check_explained_quote() returns trigger
  language plpgsql
  as $$
declare
  source text;
begin
  select m.text into source
    from message m
   where m.id = new.message_id and m.enrollment_id = new.enrollment_id and m.role = 'learner';
  if source is null then
    raise exception 'concept_explained must cite a learner message of the same enrollment';
  end if;
  if length(normalize_quote(new.quote)) < 8
     or position(normalize_quote(new.quote) in normalize_quote(source)) = 0 then
    raise exception 'quote does not appear in the cited learner message';
  end if;
  return new;
end
$$;

create trigger concept_explained_quote
  before insert or update on concept_explained
  for each row execute function check_explained_quote();

create table usage (
  id            bigint generated always as identity primary key,
  learner_id    uuid references learner (id) on delete set null,
  purpose       text not null,
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd      numeric(10, 5) not null default 0,
  at            timestamptz not null default now()
);
create index usage_at_idx on usage (at);
create index usage_learner_idx on usage (learner_id, at);
