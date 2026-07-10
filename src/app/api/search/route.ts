import { NextResponse } from "next/server";
import { searchBooks, dedupeBooks, topRelevance } from "@/lib/catalog";
import { rescueSearch } from "@/lib/anthropic";
import { HAS_ANTHROPIC_KEY } from "@/lib/config";

export const runtime = "nodejs";

// A confident catalog hit scores well above this; below it, we treat the result
// set as weak and let the LLM propose what real book the reader probably meant.
const WEAK_MATCH_THRESHOLD = 55;

// GET /api/search?q=...  → { results: Book[] }
//
// Pipeline: query the real catalog (Google Books + Open Library, merged and
// ranked). If nothing matches — OR the best match is weak (a likely misspelling
// that still returned junk) — ask the LLM what real book the reader probably
// meant (handles typos / half-titles / descriptions), re-query the catalog, and
// surface those corrected hits first. Only catalog-verified books ever return.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    let results = await searchBooks(q);
    const weak = results.length === 0 || topRelevance(q, results) < WEAK_MATCH_THRESHOLD;

    if (weak && HAS_ANTHROPIC_KEY) {
      const guess = await rescueSearch(q);
      const guessQuery = guess ? `${guess.title} ${guess.author}`.trim() : "";
      if (guessQuery && guessQuery.toLowerCase() !== q.toLowerCase()) {
        // Re-query with the corrected title, boosting the guessed real author so
        // the genuine edition beats critic-authored studies of the same title.
        const rescued = await searchBooks(guessQuery, guess!.author);
        // Corrected-query hits lead; keep any original matches after them.
        if (rescued.length) results = dedupeBooks([...rescued, ...results]);
      }
    }

    return NextResponse.json({ results: results.slice(0, 6) });
  } catch (err) {
    console.error("search error", err);
    return NextResponse.json({ results: [] });
  }
}
