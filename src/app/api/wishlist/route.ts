import { NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/session";
import { getWishlist, saveWishlist } from "@/lib/repo";
import type { WishlistItem } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/wishlist → { items } for the signed-in account.
export async function GET() {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ items: [] }, { status: 401 });
  return NextResponse.json({ items: await getWishlist(accountId) });
}

// PUT /api/wishlist { items } → persists the signed-in account's wish list.
export async function PUT(request: Request) {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  let items: WishlistItem[] = [];
  try {
    const body = await request.json();
    items = Array.isArray(body.items) ? body.items : [];
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  await saveWishlist(accountId, items);
  return NextResponse.json({ ok: true });
}
