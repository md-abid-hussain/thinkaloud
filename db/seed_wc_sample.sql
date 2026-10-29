-- Test fixture: the `wc` challenge, its first concepts, and milestone 1 (Bytes and lines).
-- The tests in db/test run against this file. The live wc curriculum is
-- content/projects/coding-challenges/challenge-wc.yaml, loaded by scripts/import-content.mjs.
-- The expected values come from the checked `learning-java/ccwc` notes. Milestone 1 closes with
-- one teach-back question whose points are each tagged with a concept (decision 8).

begin;

insert into challenge (source, slug, title, source_url, summary, requirements, content_status, reflection_prompt, restate_rubric)
values (
  'coding_challenges', 'challenge-wc', 'Build your own wc',
  'https://codingchallenges.fyi/challenges/challenge-wc',
  'A command-line tool that counts bytes, lines, words and characters in files or standard input.',
  array[
    'Count bytes, lines, words and characters with separate flags',
    'Print lines, words and bytes by default',
    'Read standard input when no file is given'
  ],
  'reviewed',
  'In your own words, how does your design handle bytes, characters and input from a file or a pipe, and what would you change?',
  '[{"id":"r1","point":"The tool counts bytes, lines, words and characters"},{"id":"r2","point":"Each count has its own flag, and with no flag it prints lines, words and bytes"},{"id":"r3","point":"It reads standard input when no file is given"}]'::jsonb
);

insert into concept (slug, name, area_slug, kind, brief, content_status) values
  ('bytes-vs-characters',      'Bytes vs characters',          'text-encodings', 'foundation',
   'A byte is a unit of storage. A character is a unit of text. In UTF-8 one character takes one to four bytes.', 'reviewed'),
  ('explicit-charsets',        'Explicit charsets',            'text-encodings', 'foundation',
   'Decoding bytes needs a named encoding. Relying on a platform default breaks when the tool runs elsewhere.', 'reviewed'),
  ('decoding-across-chunks',   'Decoding across chunk boundaries', 'text-encodings', 'foundation',
   'A chunk of bytes can end in the middle of a character, so a decoder keeps the leftover bytes for the next chunk.', 'reviewed'),
  ('streaming-constant-memory','Streaming in constant memory', 'streams-io',     'foundation',
   'Read input in fixed-size chunks and keep running totals, so memory does not grow with the input.', 'reviewed'),
  ('stdin-vs-file',            'Standard input vs file',       'streams-io',     'foundation',
   'A file and standard input can be treated as the same kind of byte stream, so one loop serves both.', 'reviewed'),
  ('stream-read-contract',     'The read contract',            'streams-io',     'foundation',
   'A read can return fewer bytes than the buffer holds. The returned count says how many are valid, and -1 means the end.', 'reviewed');

insert into concept_edge (from_concept_id, to_concept_id, type)
select a.id, b.id, 'prerequisite'
from concept a, concept b
where (a.slug, b.slug) in (
  ('bytes-vs-characters',  'explicit-charsets'),
  ('explicit-charsets',    'decoding-across-chunks'),
  ('stream-read-contract', 'streaming-constant-memory'),
  ('stream-read-contract', 'decoding-across-chunks')
);

insert into milestone (challenge_id, position, title, summary)
select id, 1, 'Bytes and lines', 'Count bytes and lines of a file or standard input by streaming it in chunks.'
from challenge where slug = 'challenge-wc';

insert into milestone_concept (milestone_id, concept_id)
select m.id, c.id
from milestone m
join challenge ch on ch.id = m.challenge_id and ch.slug = 'challenge-wc'
join concept c on c.slug in ('streaming-constant-memory', 'stdin-vs-file', 'stream-read-contract')
where m.position = 1;

insert into step (milestone_id, position, title, est_minutes)
select m.id, v.position, v.title, 15
from milestone m
join challenge ch on ch.id = m.challenge_id and ch.slug = 'challenge-wc'
cross join (values (1, 'Count bytes in chunks'), (2, 'Count lines'), (3, 'Same code for stdin')) as v(position, title)
where m.position = 1;

insert into task (step_id, role, kind, prompt, answer_key, rubric)
select s.id, v.role, v.kind, v.prompt, v.answer_key::jsonb, v.rubric::jsonb
from step s
join milestone m on m.id = s.milestone_id and m.position = 1
join challenge ch on ch.id = m.challenge_id and ch.slug = 'challenge-wc'
join (values
  (1, 'think', 'predict',
   'A 20,000-byte file and an 8,192-byte buffer: how many reads return data, and how many bytes does each return?',
   '{"match":"numbers_all","expected":[3,8192,8192,3616]}', null),
  (1, 'build', 'build',
   'Make -c print 342190 for the sample test.txt, and 0 for an empty file.', null, null),
  (2, 'think', 'predict',
   'What does a file containing a, a newline, then b, with no trailing newline, report for lines, and why?',
   '{"match":"number_exact","expected":1}', null),
  (2, 'build', 'build',
   'Make -l print 7145 for the sample test.txt.', null, null),
  (3, 'think', 'explain',
   'Explain how one loop serves both a file and standard input.', null,
   '[{"id":"p1","point":"Both are handled as the same kind of byte stream"},{"id":"p2","point":"Only the code that opens the stream differs between a file and standard input"}]'),
  (3, 'build', 'build',
   'Make the tool print 7145 for -l when test.txt is piped in.', null, null)
) as v(position, role, kind, prompt, answer_key, rubric) on v.position = s.position;

insert into question (milestone_id, concept_id, position, prompt, rubric)
select m.id, null, 1,
  'Explain how your tool counts a 10 GB file, or the same data piped in, without running out of memory.',
  '[{"id":"t1","concept":"streaming-constant-memory","point":"Memory stays roughly constant because the input is read in fixed-size chunks and only running totals are kept"},{"id":"t2","concept":"stdin-vs-file","point":"A file and standard input are the same kind of byte stream, and only the code that opens the stream differs"},{"id":"t3","concept":"stream-read-contract","point":"A read can return fewer bytes than the buffer holds, the returned count says how many are valid, and -1 means the end"}]'::jsonb
from milestone m
join challenge ch on ch.id = m.challenge_id and ch.slug = 'challenge-wc'
where m.position = 1;

commit;
