import { NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/session";
import { getShelf, saveShelf } from "@/lib/repo";
import type { ShelfBook } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/shelf → { books } for the signed-in account.
export async function GET() {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ books: [] }, { status: 401 });
  return NextResponse.json({ books: await getShelf(accountId) });
}

// PUT /api/shelf { books } → persists the signed-in account's shelf.
export async function PUT(request: Request) {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  let books: ShelfBook[] = [];
  try {
    const body = await request.json();
    books = Array.isArray(body.books) ? body.books : [];
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  await saveShelf(accountId, books);
  return NextResponse.json({ ok: true });
}
