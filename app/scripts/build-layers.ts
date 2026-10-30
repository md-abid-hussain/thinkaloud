/**
 * Rebuilds the language notes for projects and languages, three at a time, so learners never wait for them. From app/:
 *   npm run build-layers -- wc json-parser url-shortener
 * Uses the research agent on Opus 5.5 with Linkup search (about $0.40 a layer). Needs the database running.
 */
import { setDefaultResultOrder } from "node:dns";
import { loadMaps, readMaps } from "../lib/content";
import { closePool, pool } from "../lib/db";
import { env } from "../lib/env";
import { buildLayer } from "../lib/language/build";
import { LANGUAGES, type Language } from "../lib/progress";

setDefaultResultOrder("ipv6first");

async function main() {
  const slugs = process.argv.slice(2);
  await loadMaps(await readMaps(env.contentDir));
  const jobs = slugs.flatMap((slug) => (Object.keys(LANGUAGES) as Language[]).map((language) => ({ slug, language })));
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < jobs.length) {
        const { slug, language } = jobs[next++];
        await pool().query(
          `insert into language_layer (project, language, status) values ($1, $2, 'building')
           on conflict (project, language) do update set status = 'building', layer = null, error = null, updated_at = now()`,
          [slug, language],
        );
        const started = Date.now();
        const ok = await buildLayer(slug, language);
        console.log(`${ok ? "ok  " : "FAIL"} ${slug} ${language} (${Math.round((Date.now() - started) / 1000)} s)`);
      }
    }),
  );
  const spend = await pool().query<{ usd: string }>("select round(sum(cost_usd)::numeric, 3) as usd from usage where purpose like 'language%' and at > now() - interval '1 hour'");
  console.log(`language notes spend in the last hour: $${spend.rows[0]?.usd ?? 0}`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
