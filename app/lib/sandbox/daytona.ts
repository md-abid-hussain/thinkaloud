import { Daytona } from "@daytona/sdk";
import { env } from "../env";
import { sh, type Sandbox } from "./sandbox";

/** The snapshot built from app/sandbox/Dockerfile by `npm run sandbox:snapshot`. Bump it when the Dockerfile changes. */
export const SANDBOX_SNAPSHOT = "thinkaloud-sandbox-2";

/** The SDK refuses an endpoint it only finds in .env.local, so both values are passed explicitly. */
export function daytonaClient(): Daytona {
  if (!env.daytonaKey) throw new Error("DAYTONA_API_KEY is not set");
  return new Daytona({ apiKey: env.daytonaKey, apiUrl: env.daytonaUrl });
}

/** A fresh, ephemeral Daytona sandbox per review. */
export async function daytonaSandbox(): Promise<Sandbox> {
  const daytona = daytonaClient();
  const box = await daytona.create(
    { snapshot: SANDBOX_SNAPSHOT, ephemeral: true, autoStopInterval: 20, labels: { app: "thinkaloud" } },
    { timeout: 180 },
  );
  return {
    async exec(command, opts = {}) {
      const result = await box.process.executeCommand(`bash -c ${sh(command)}`, opts.cwd, opts.env, opts.timeoutSec ?? 300);
      return { exitCode: result.exitCode, output: result.result };
    },
    // Through a command rather than the SDK's multipart upload, which times out on some networks (Abid's IPv4 route).
    // The files are small: the harness and a check spec.
    async upload(files) {
      for (const f of files) {
        const b64 = Buffer.from(f.content).toString("base64");
        const dir = f.path.slice(0, f.path.lastIndexOf("/")) || "/";
        const result = await box.process.executeCommand(`bash -c ${sh(`mkdir -p ${sh(dir)} && echo ${b64} | base64 -d > ${sh(f.path)}`)}`, undefined, undefined, 60);
        if (result.exitCode !== 0) throw new Error(`upload ${f.path} failed: ${result.result.slice(0, 300)}`);
      }
    },
    async destroy() {
      await box.delete().catch(() => undefined);
    },
  };
}
