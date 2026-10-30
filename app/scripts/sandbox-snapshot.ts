/**
 * Creates the Daytona snapshot every review starts from, built from app/sandbox/Dockerfile (the same file as the local
 * Docker image). Run once, and again after the Dockerfile changes (bump SANDBOX_SNAPSHOT in lib/sandbox/daytona.ts):
 *   npm run sandbox:snapshot
 */
import path from "node:path";
import { Image } from "@daytona/sdk";
import { SANDBOX_SNAPSHOT, daytonaClient } from "../lib/sandbox/daytona";

async function main() {
  const daytona = daytonaClient();
  try {
    const existing = await daytona.snapshot.get(SANDBOX_SNAPSHOT);
    console.log(`${SANDBOX_SNAPSHOT} already exists (${existing.state})`);
    return;
  } catch {
    // not there yet: build it
  }
  const image = Image.fromDockerfile(path.resolve(import.meta.dirname, "..", "sandbox", "Dockerfile"));
  const snapshot = await daytona.snapshot.create(
    { name: SANDBOX_SNAPSHOT, image, resources: { cpu: 2, memory: 4, disk: 8 } },
    { onLogs: (chunk) => process.stdout.write(chunk), timeout: 0 },
  );
  console.log(`\ncreated ${snapshot.name}: ${snapshot.state}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
