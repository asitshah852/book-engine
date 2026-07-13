import { NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/session";
import { getShown, saveShown } from "@/lib/repo";

export const runtime = "nodejs";

// GET /api/shown → { titles } — books this account has been shown before, used
// as a cross-session novelty signal so re-logins surface fresh picks.
export async function GET() {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ titles: [] }, { status: 401 });
  return NextResponse.json({ titles: await getShown(accountId) });
}

// PUT /api/shown { titles } → persists the shown-history (server caps the size).
export async function PUT(request: Request) {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  let titles: string[] = [];
  try {
    const body = await request.json();
    titles = Array.isArray(body.titles) ? body.titles : [];
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  await saveShown(accountId, titles);
  return NextResponse.json({ ok: true });
}
