import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

let db;
before(async () => {
  db = new PGlite();
  for (const file of ['schema.sql', 'seed_reference.sql', 'seed_wc_sample.sql', 'seed_challenges.sql']) {
    await db.exec(read(file));
  }
});
after(async () => {
  await db.close();
});

const one = async (text, params) => (await db.query(text, params)).rows[0];

test('all 134 projects are listed, split 109 and 25', async () => {
  const counts = (await db.query(`select source, count(*)::int n from challenge group by source order by source`)).rows;
  assert.deepEqual(counts, [
    { source: 'coding_challenges', n: 109 },
    { source: 'roadmap_sh', n: 25 },
  ]);
});

test('the reviewed wc sample is not overwritten by the list import', async () => {
  const wc = await one(`select title, content_status, summary from challenge where slug = 'challenge-wc'`);
  assert.equal(wc.title, 'Build your own wc');
  assert.equal(wc.content_status, 'reviewed');
  assert.ok(wc.summary);
});

test('only roadmap.sh projects have a level, and every link points at the source site', async () => {
  assert.equal((await one(`select count(*)::int n from challenge where source = 'coding_challenges' and level is not null`)).n, 0);
  assert.equal((await one(`select count(*)::int n from challenge where source = 'roadmap_sh' and level is null`)).n, 0);
  assert.equal(
    (await one(
      `select count(*)::int n from challenge
        where (source = 'roadmap_sh' and source_url not like 'https://roadmap.sh/projects/%')
           or (source = 'coding_challenges' and source_url not like 'https://codingchallenges.fyi/challenges/%')`
    )).n,
    0
  );
});

test('listed projects have no curriculum until they are opened', async () => {
  const listed = await one(`select count(*)::int n from challenge where content_status = 'listed'`);
  assert.equal(listed.n, 133);
  assert.equal((await one(`select count(*)::int n from milestone`)).n, 1);
});
