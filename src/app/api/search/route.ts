import { NextResponse } from "next/server";
import { searchBooks } from "@/lib/catalog";
import { rescueSearch } from "@/lib/anthropic";
import { HAS_ANTHROPIC_KEY } from "@/lib/config";

export const runtime = "nodejs";

// GET /api/search?q=...  → { results: Book[] }
//
// Pipeline: query the real catalog first. If nothing matches, ask the LLM what
// real book the reader probably meant (handles typos / descriptions), then
// re-query the catalog. Only catalog-verified books ever come back.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 3) return NextResponse.json({ results: [] });

  try {
    let results = await searchBooks(q);

    if (results.length === 0 && HAS_ANTHROPIC_KEY) {
      const guess = await rescueSearch(q);
      if (guess) {
        results = await searchBooks(guess);
      }
    }

    return NextResponse.json({ results: results.slice(0, 5) });
  } catch (err) {
    console.error("search error", err);
    return NextResponse.json({ results: [] });
  }
}
