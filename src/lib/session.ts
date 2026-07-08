// Signed, httpOnly session cookie. Holds the account id, HMAC-signed with
// SESSION_SECRET so it can't be forged. Structured to be a drop-in place to
// later swap in magic-link / OAuth session issuance.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_SECRET } from "./config";

const COOKIE_NAME = "bre_session";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function sign(value: string): string {
  return createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function serialize(accountId: string): string {
  return `${accountId}.${sign(accountId)}`;
}

function verify(token: string | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx === -1) return null;
  const accountId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(accountId);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return accountId;
}

/** Read the current account id from the request cookies, or null. */
export async function getSessionAccountId(): Promise<string | null> {
  const store = await cookies();
  return verify(store.get(COOKIE_NAME)?.value);
}

export const sessionCookie = {
  name: COOKIE_NAME,
  create(accountId: string) {
    return {
      name: COOKIE_NAME,
      value: serialize(accountId),
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE,
    };
  },
  clear() {
    return {
      name: COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    };
  },
};
