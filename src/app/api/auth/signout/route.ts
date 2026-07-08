import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/session";

export const runtime = "nodejs";

// POST /api/auth/signout → clears the session cookie.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie.clear());
  return res;
}
