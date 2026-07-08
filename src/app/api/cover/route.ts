import { NextResponse } from "next/server";
import { fetchCover } from "@/lib/catalog";

export const runtime = "nodejs";

// GET /api/cover?title=&author=  → { coverUrl: string | null }
// Strict-matched cover art; used to backfill shelf covers and for "refresh covers".
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") || "").trim();
  const author = (searchParams.get("author") || "").trim();
  if (!title) return NextResponse.json({ coverUrl: null });
  try {
    const coverUrl = await fetchCover(title, author);
    return NextResponse.json({ coverUrl });
  } catch {
    return NextResponse.json({ coverUrl: null });
  }
}
