import { NextResponse } from "next/server";
import { inferTasteProfile } from "@/lib/anthropic";
import { HAS_ANTHROPIC_KEY } from "@/lib/config";
import type { ShelfBook } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/profile { books } → { tags: string[] }
// Infers an editable taste profile from the shelf (optional preview step).
export async function POST(request: Request) {
  if (!HAS_ANTHROPIC_KEY) return NextResponse.json({ tags: [] });
  let books: ShelfBook[] = [];
  try {
    const body = await request.json();
    books = Array.isArray(body.books) ? body.books : [];
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const valid = books.filter((b) => b.title && b.title.trim() && !b.needsTitle);
  if (valid.length < 5) return NextResponse.json({ tags: [] });

  const inputList = valid
    .map((b) => (b.author ? `${b.title} by ${b.author}` : b.title))
    .join("; ");
  try {
    const tags = await inferTasteProfile(inputList);
    return NextResponse.json({ tags });
  } catch {
    return NextResponse.json({ tags: [] });
  }
}
