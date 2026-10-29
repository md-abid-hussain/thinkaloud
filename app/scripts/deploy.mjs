// Pushes the app to Zerops from a clean copy of app/ (no node_modules, .next or local data), because this
// folder is not a git repo and `zcli push --no-git` uploads the working directory as it is.
// Needs `zcli login` done by the owner, and ZEROPS_PROJECT_ID / ZEROPS_SERVICE_ID (the app service) set.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(os.tmpdir(), 'thinkaloud-deploy');
const skip = new Set(['node_modules', '.next', '.data', '.env', '.env.local', 'next-env.d.ts', 'tsconfig.tsbuildinfo']);

execFileSync(process.execPath, [path.join(here, 'scripts', 'sync-db.mjs')], { stdio: 'inherit' });
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(here, out, { recursive: true, filter: (src) => !skip.has(path.basename(src)) || path.dirname(src) !== here });

const { ZEROPS_PROJECT_ID: project, ZEROPS_SERVICE_ID: service } = process.env;
if (!project || !service) {
  console.error('Set ZEROPS_PROJECT_ID and ZEROPS_SERVICE_ID (the app service) first.');
  process.exit(1);
}
const zcli = process.env.ZCLI ?? 'zcli';
execFileSync(zcli, ['push', '--working-dir', out, '--no-git', '--project-id', project, '--service-id', service, '--setup', 'app'], { stdio: 'inherit' });
