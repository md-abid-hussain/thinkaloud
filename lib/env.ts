import path from "node:path";

function numberFrom(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Server configuration, read on use so tests can set variables before calling. */
export const env = {
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "postgres://thinkaloud:thinkaloud@localhost:5433/thinkaloud";
  },
  get anthropicKey() {
    return process.env.ANTHROPIC_API_KEY || undefined;
  },
  get linkupKey() {
    return process.env.LINKUP_API_KEY || undefined;
  },
  get daytonaKey() {
    return process.env.DAYTONA_API_KEY || undefined;
  },
  get daytonaUrl() {
    return process.env.DAYTONA_API_URL || "https://app.daytona.io/api";
  },
  get dailyCapUsd() {
    return numberFrom(process.env.DAILY_CAP_USD, 20);
  },
  get guestDailyCapUsd() {
    return numberFrom(process.env.GUEST_DAILY_CAP_USD, 1.5);
  },
  get contentDir() {
    return process.env.CONTENT_DIR ?? path.resolve(process.cwd(), "content");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};
