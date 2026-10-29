// Copies the shared database files from ../db into vendor/db, so the app builds and deploys from app/ alone.
// ../db stays the source of truth (owned by the content session). Never edit vendor/db by hand.
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../db');
const dest = path.resolve(here, '../vendor/db');

if (!existsSync(src)) {
  // On the build server only app/ is uploaded, and vendor/db was synced before the push.
  if (existsSync(dest)) process.exit(0);
  console.error('sync-db: ../db is missing and there is no vendor/db copy');
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(path.join(dest, 'support'), { recursive: true });
for (const f of ['schema.sql', 'seed_reference.sql', 'seed_challenges.sql', 'seed_content.sql', 'seed_wc_sample.sql']) {
  cpSync(path.join(src, f), path.join(dest, f));
}
for (const f of ['recipes.mjs', 'helpers.mjs', 'matching.mjs']) {
  cpSync(path.join(src, 'support', f), path.join(dest, 'support', f));
}
console.log('sync-db: copied schema, seeds and support from ../db');
