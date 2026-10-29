// Runs once when the server starts: load the schema if needed, then resume runs a restart cut off.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { dbReady } = await import("@/lib/db");
  const { recoverRuns } = await import("@/lib/worker");
  try {
    await dbReady();
    await recoverRuns();
  } catch (e) {
    console.error("[boot]", e);
  }
}
