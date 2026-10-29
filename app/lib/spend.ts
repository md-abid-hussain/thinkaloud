// Spend tracking and caps. Every model call is written to llm_usage; grading and the mentor check the caps
// first and pause (never error) when one is reached. Keyed checks and stored hints cost nothing.
import "server-only";
import { one, query } from "@/lib/db";
import { ModelUnavailable } from "@/lib/llm";

// US dollars per million tokens: input, output, cache read. Cache writes cost 1.25x input.
const PRICES: Record<string, [number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-sonnet-5-5": [2, 10, 0.2],
  "claude-opus-4-8": [5, 25, 0.5],
};

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function costOf(model: string, u: Usage) {
  const [i, o, r] = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  return (u.input_tokens * i + write * i * 1.25 + read * r + u.output_tokens * o) / 1e6;
}

// An unset or empty variable means the default.
const usd = (v: string | undefined, fallback: number) => (v && v.trim() && Number.isFinite(Number(v)) ? Number(v) : fallback);
export const caps = () => ({
  daily: usd(process.env.DAILY_CAP_USD, 20),
  guest: usd(process.env.GUEST_DAILY_CAP_USD, 1.5),
});

export async function recordUsage(
  o: { learnerId: string | null; enrollmentId: string | null; purpose: "tutor" | "grade" | "summarise" | "generate"; model: string },
  u: Usage
) {
  const input = u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  await query(
    `insert into llm_usage (learner_id, enrollment_id, purpose, provider, model, input_tokens, output_tokens, cost_usd)
     values ($1, $2, $3, 'anthropic', $4, $5, $6, $7)`,
    [o.learnerId, o.enrollmentId, o.purpose, o.model, input, u.output_tokens, costOf(o.model, u).toFixed(6)]
  );
}

/** Spend today (UTC) in total and for this learner, counting other guest ids from the same client. */
export async function spentToday(learnerId: string) {
  const r = await one<{ total: string; mine: string }>(
    `select coalesce(sum(u.cost_usd), 0) as total,
            coalesce(sum(u.cost_usd) filter (
              where u.learner_id = $1
                 or u.learner_id in (select x.id from learner x join learner me on me.id = $1
                                      where me.client_hash is not null and x.client_hash = me.client_hash)), 0) as mine
       from llm_usage u
      where u.created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')`,
    [learnerId]
  );
  return { total: Number(r?.total ?? 0), mine: Number(r?.mine ?? 0) };
}

export async function assertBudget(learnerId: string) {
  const { daily, guest } = caps();
  const s = await spentToday(learnerId);
  if (s.total >= daily) throw new ModelUnavailable("Today's spend cap for AI checks is reached. They resume tomorrow.", "cap");
  if (s.mine >= guest) throw new ModelUnavailable("You've used today's AI checks. Keyed checks and hints still work.", "guest_cap");
}
