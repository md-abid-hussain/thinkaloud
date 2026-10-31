import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";
import { ensureLearner } from "./repo";

const COOKIE = "ta_guest";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The guest's ID from the cookie, or null. Read-only, so it works anywhere on the server. */
export async function currentGuest(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  return value && UUID.test(value) ? value : null;
}

/** The guest's ID, creating the guest and its cookie on the first visit. Only in route handlers. */
export async function ensureGuest(): Promise<string> {
  const existing = await currentGuest();
  const id = existing ?? randomUUID();
  await ensureLearner(id);
  if (!existing) {
    (await cookies()).set(COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProduction,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return id;
}
