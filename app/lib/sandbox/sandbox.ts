/**
 * A place to build and run a learner's code. Two backends with the same behaviour: Daytona in production
 * (daytona.ts) and a local Docker container for development and tests (docker.ts). Both use the image from
 * app/sandbox/Dockerfile, and everything project-specific runs through app/sandbox/runner.py inside it.
 */
export type ExecResult = { exitCode: number; output: string };

export interface Sandbox {
  /** Runs a bash command. Output is stdout and stderr together. */
  exec(command: string, opts?: { cwd?: string; env?: Record<string, string>; timeoutSec?: number }): Promise<ExecResult>;
  upload(files: { path: string; content: string | Buffer }[]): Promise<void>;
  destroy(): Promise<void>;
}

export type SandboxFactory = () => Promise<Sandbox>;

/** Quotes a string for bash. */
export function sh(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
