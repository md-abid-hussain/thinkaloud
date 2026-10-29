import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../support/helpers.mjs';

const t = await open();
after(() => t.close());
const { rows } = t;

// Foreign keys to curriculum rows that are never deleted. An index would only help reverse lookups.
const ACCEPTED_WITHOUT_INDEX = new Set([
  'event.concept_id',
  'evidence.concept_id',
  'event.milestone_id',
  'event.step_id',
  'message.step_id',
  'milestone_state.milestone_id',
  'side_item.concept_id',
  'step_state.step_id',
]);

test('every foreign key column has an index that starts with it, apart from the accepted list', async () => {
  const missing = await rows(`
    select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
     order by 1, 2`);
  const unexpected = missing.map((r) => `${r.tbl}.${r.col}`).filter((name) => !ACCEPTED_WITHOUT_INDEX.has(name));
  assert.deepEqual(unexpected, [], 'add an index, or add the column to the accepted list with a reason');
});

test('every table has a primary key', async () => {
  const none = await rows(`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'p')`);
  assert.deepEqual(none, []);
});
