import { one, pool } from "./db";
import { env } from "./env";

/** US dollars per million tokens (input, output), from the Claude pricing table on 2026-10-30. */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};
/** Linkup's standard search, per call. */
export const SEARCH_COST_USD = 0.006;

export type TokenUsage = { input_tokens?: number; output_tokens?: number };

export function costOf(model: string, usage: TokenUsage): number {
  const price = PRICES[model];
  if (!price) return 0;
  return ((usage.input_tokens ?? 0) * price.input + (usage.output_tokens ?? 0) * price.output) / 1_000_000;
}

export async function recordUsage(entry: {
  learnerId: string | null;
  purpose: string;
  model: string;
  usage?: TokenUsage;
  costUsd?: number;
}): Promise<void> {
  const cost = entry.costUsd ?? costOf(entry.model, entry.usage ?? {});
  await pool().query(
    `insert into usage (learner_id, purpose, model, input_tokens, output_tokens, cost_usd)
     values ($1, $2, $3, $4, $5, $6)`,
    [entry.learnerId, entry.purpose, entry.model, entry.usage?.input_tokens ?? 0, entry.usage?.output_tokens ?? 0, cost],
  );
}

/** Whether model calls may run now: under the daily total cap, and under this guest's daily cap. */
export async function checkSpend(learnerId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const totals = await one<{ day: string; guest: string }>(
    `select coalesce(sum(cost_usd), 0) as day,
            coalesce(sum(cost_usd) filter (where learner_id = $1), 0) as guest
       from usage where at > now() - interval '1 day'`,
    [learnerId],
  );
  if (Number(totals?.day ?? 0) >= env.dailyCapUsd) {
    return { ok: false, reason: "ThinkAloud has reached its daily limit for model calls. Your message is saved; try again tomorrow." };
  }
  if (Number(totals?.guest ?? 0) >= env.guestDailyCapUsd) {
    return { ok: false, reason: "You've reached today's limit for mentor replies. Your message is saved, and your progress is kept." };
  }
  return { ok: true };
}
