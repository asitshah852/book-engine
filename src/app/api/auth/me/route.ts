import { NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/session";
import { getAccount, getShelf, getWishlist, getDismissed, getShown } from "@/lib/repo";

export const runtime = "nodejs";

// GET /api/auth/me → { name, books, wishlist, dismissed, shown } | { name: null }
export async function GET() {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ name: null });
  const account = await getAccount(accountId);
  if (!account) return NextResponse.json({ name: null });
  const [books, wishlist, dismissed, shown] = await Promise.all([
    getShelf(accountId),
    getWishlist(accountId),
    getDismissed(accountId),
    getShown(accountId),
  ]);
  return NextResponse.json({ name: account.name, books, wishlist, dismissed, shown });
}
