import { spawn } from "node:child_process";
import path from "node:path";
import { sh, type Sandbox } from "./sandbox";

export const LOCAL_IMAGE = "thinkaloud-sandbox";

function docker(args: string[], input?: Buffer | string, timeoutMs = 600_000): Promise<{ code: number; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 137, out });
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

/** A local container from the same image as the Daytona snapshot (npm run sandbox:image). */
export async function dockerSandbox(image = LOCAL_IMAGE): Promise<Sandbox> {
  const started = await docker(["run", "-d", "--rm", image, "sleep", "7200"]);
  if (started.code !== 0) throw new Error(`docker run failed: ${started.out}`);
  const id = started.out.trim().split("\n").at(-1)!;
  return {
    async exec(command, opts = {}) {
      const env = Object.entries(opts.env ?? {}).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
      const timeout = opts.timeoutSec ?? 300;
      const result = await docker(["exec", ...(opts.cwd ? ["-w", opts.cwd] : []), ...env, id, "timeout", String(timeout), "bash", "-c", command], undefined, (timeout + 30) * 1000);
      return { exitCode: result.code, output: result.out };
    },
    async upload(files) {
      for (const f of files) {
        const result = await docker(["exec", "-i", id, "bash", "-c", `mkdir -p ${sh(path.posix.dirname(f.path))} && cat > ${sh(f.path)}`], f.content);
        if (result.code !== 0) throw new Error(`upload ${f.path} failed: ${result.out}`);
      }
    },
    async destroy() {
      await docker(["rm", "-f", id]).catch(() => undefined);
    },
  };
}
