/** Runs once when the server starts: apply migrations, load the maps, and clear turns a restart interrupted. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { migrate } = await import("./lib/migrate");
  const { readMaps, loadMaps } = await import("./lib/content");
  const { pool } = await import("./lib/db");

  const ran = await migrate();
  if (ran.length) console.log(`[thinkaloud] applied migrations: ${ran.join(", ")}`);
  const maps = await readMaps();
  await loadMaps(maps);
  console.log(`[thinkaloud] loaded ${maps.length} project maps: ${maps.map((m) => m.project.slug).join(", ")}`);
  const interrupted = await pool().query(
    `update message set status = 'failed', text = 'The server restarted before the mentor finished. Send your message again.'
     where status = 'pending'`,
  );
  if (interrupted.rowCount) console.log(`[thinkaloud] marked ${interrupted.rowCount} interrupted replies as failed`);
  // A review a restart interrupted gets a card saying so; the learner asks again.
  const { finishReview } = await import("./lib/repo");
  const stuck = await pool().query<{ id: string }>("select id from review where status = 'running'");
  for (const r of stuck.rows) await finishReview(Number(r.id), { status: "error", error: "The server restarted during the review." });
}
