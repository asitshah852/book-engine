import { NextResponse } from "next/server";
import {
  findOrCreateAccount,
  getShelf,
  saveShelf,
  getWishlist,
  saveWishlist,
  mergeWishlists,
  getDismissed,
  saveDismissed,
  mergeDismissed,
} from "@/lib/repo";
import { sessionCookie } from "@/lib/session";
import type { ShelfBook, WishlistItem } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/auth/signin { name, books?, wishlist? } → { name, books, wishlist }
//
// Name-only sign-in (prototype stopgap). Any shelf books and wish-list items
// built up while signed out are merged into the account's saved copies.
export async function POST(request: Request) {
  let name = "";
  let incoming: ShelfBook[] = [];
  let incomingWish: WishlistItem[] = [];
  let incomingDismissed: string[] = [];
  try {
    const body = await request.json();
    name = (body.name || "").trim();
    incoming = Array.isArray(body.books) ? body.books : [];
    incomingWish = Array.isArray(body.wishlist) ? body.wishlist : [];
    incomingDismissed = Array.isArray(body.dismissed) ? body.dismissed : [];
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Name required." }, { status: 400 });
  }

  const account = await findOrCreateAccount(name);
  const [saved, savedWish, savedDismissed] = await Promise.all([
    getShelf(account.id),
    getWishlist(account.id),
    getDismissed(account.id),
  ]);

  const existingTitles = new Set(incoming.map((b) => (b.title || "").toLowerCase()));
  const merged = [
    ...incoming.filter((b) => b.title && b.title.trim()),
    ...saved.filter((b) => !existingTitles.has((b.title || "").toLowerCase())),
  ];
  const mergedWish = mergeWishlists(
    incomingWish.filter((i) => i && i.title && i.title.trim()),
    savedWish
  );
  const mergedDismissed = mergeDismissed(
    incomingDismissed.filter((t) => typeof t === "string" && t.trim()),
    savedDismissed
  );

  await Promise.all([
    saveShelf(account.id, merged),
    saveWishlist(account.id, mergedWish),
    saveDismissed(account.id, mergedDismissed),
  ]);
  const [books, wishlist, dismissed] = await Promise.all([
    getShelf(account.id),
    getWishlist(account.id),
    getDismissed(account.id),
  ]);

  const res = NextResponse.json({ name: account.name, books, wishlist, dismissed });
  res.cookies.set(sessionCookie.create(account.id));
  return res;
}
