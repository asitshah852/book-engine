import { NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/session";
import { getDismissed, saveDismissed } from "@/lib/repo";

export const runtime = "nodejs";

// GET /api/dismissed → { titles } — the signed-in account's "not interested" list.
export async function GET() {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ titles: [] }, { status: 401 });
  return NextResponse.json({ titles: await getDismissed(accountId) });
}

// PUT /api/dismissed { titles } → persists the "not interested" list.
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
  await saveDismissed(accountId, titles);
  return NextResponse.json({ ok: true });
}
