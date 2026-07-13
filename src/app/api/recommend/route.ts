import { NextResponse } from "next/server";
import { generateCandidates } from "@/lib/anthropic";
import { verifyBook, fetchCover, isEnglishIsbn } from "@/lib/catalog";
import { verifyLists } from "@/lib/editorial";
import { HAS_ANTHROPIC_KEY, AMAZON_AFFILIATE_TAG } from "@/lib/config";
import type { Recency, Recommendation, ShelfBook } from "@/lib/types";

/** Convert an ISBN-13 (978-prefixed) to its ISBN-10 form, for Amazon /dp/ URLs
 *  which key off ISBN-10 / ASIN. Returns null for anything else. */
function isbn13to10(isbn13: string): string | null {
  const s = isbn13.replace(/[^0-9]/g, "");
  if (!/^978\d{10}$/.test(s)) return null;
  const core = s.slice(3, 12); // 9 significant digits
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(core[i]);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? "X" : String(check));
}

/** Normalise a catalog ISBN to an ISBN-10 when possible (for Amazon /dp/). */
function toIsbn10(isbn: string | null | undefined): string | null {
  if (!isbn) return null;
  const s = isbn.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(s)) return s; // already ISBN-10
  if (/^\d{13}$/.test(s)) return isbn13to10(s);
  return null;
}

// Deep-link straight to the book's own page when we have an English-market ISBN
// from the catalog; fall back to a search otherwise (incl. foreign-edition ISBNs
// that would land on a wrong-language product page).
function amazonUrl(title: string, author: string, isbn?: string | null): string {
  const tagQ = AMAZON_AFFILIATE_TAG ? `?tag=${encodeURIComponent(AMAZON_AFFILIATE_TAG)}` : "";
  const isbn10 = isEnglishIsbn(isbn) ? toIsbn10(isbn) : null;
  if (isbn10) return `https://www.amazon.com/dp/${isbn10}${tagQ}`;
  const q = encodeURIComponent(`${title} ${author}`.trim());
  const tag = AMAZON_AFFILIATE_TAG ? `&tag=${encodeURIComponent(AMAZON_AFFILIATE_TAG)}` : "";
  return `https://www.amazon.com/s?k=${q}${tag}`;
}

function goodreadsUrl(title: string, author: string, isbn?: string | null): string {
  const clean = (isbn || "").replace(/[^0-9Xx]/g, "");
  // Goodreads resolves /book/isbn/<isbn> to the book's own page.
  if (isEnglishIsbn(clean)) return `https://www.goodreads.com/book/isbn/${clean}`;
  return `https://www.goodreads.com/search?q=${encodeURIComponent(`${title} ${author}`.trim())}`;
}

export const runtime = "nodejs";
export const maxDuration = 60;

interface RecommendBody {
  books: ShelfBook[];
  recency: Recency;
  steer?: string;
  exclude?: string[]; // hard exclude: dismissed + already shown this session
  shownBefore?: string[]; // soft novelty signal: shown on past visits
  mood?: string[];
  moodText?: string;
  adventurousness?: "safe" | "balanced" | "surprise";
  profileTags?: string[];
  interested?: string[]; // reading-list books — taste signal, never recommended
}

const PRIZE_CODES = new Set([
  "NobelLaureate",
  "PulitzerWinner",
  "BookerWinner",
  "IntlBooker",
  "WomensPrize",
  "NationalBookAward",
  "NBCC",
  "Costa",
  "HugoAward",
  "NebulaAward",
  "FTBusiness",
  "BaillieGifford",
  "PulitzerHistory",
  "PulitzerBiography",
  "PulitzerNonfiction",
  "WilliamHillSports",
]);

function badgeScore(r: Recommendation): number {
  return r.lists.reduce((s, l) => s + (PRIZE_CODES.has(l) ? 3 : 1), 0);
}

function surnameKey(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z ]+/g, " ").trim().split(" ").filter(Boolean).pop() || ""
  );
}

// Detect an Anthropic billing / spend-limit / out-of-credit failure so we can
// show a plain message instead of a generic "try again".
function isBudgetError(err: unknown): boolean {
  const e = err as {
    status?: number;
    message?: string;
    type?: string;
    error?: { type?: string; message?: string };
  };
  const type = e?.error?.type || e?.type || "";
  const msg = `${e?.message || ""} ${e?.error?.message || ""}`.toLowerCase();
  return (
    type === "billing_error" ||
    msg.includes("credit balance") ||
    msg.includes("billing") ||
    msg.includes("spend limit") ||
    msg.includes("spending limit") ||
    msg.includes("usage limit") ||
    msg.includes("monthly limit") ||
    msg.includes("quota") ||
    msg.includes("insufficient")
  );
}

// Detect a transient upstream hiccup (model briefly overloaded, rate-limited, a
// 5xx, or a timeout) so we can tell the reader to simply try again in a moment,
// rather than showing the same message we'd use for a real, persistent failure.
function isTransientError(err: unknown): boolean {
  const e = err as {
    status?: number;
    message?: string;
    type?: string;
    error?: { type?: string };
  };
  const status = e?.status ?? 0;
  const type = e?.error?.type || e?.type || "";
  const msg = `${e?.message || ""}`.toLowerCase();
  return (
    status === 429 ||
    status === 529 ||
    (status >= 500 && status <= 599) ||
    type === "overloaded_error" ||
    type === "rate_limit_error" ||
    type === "api_error" ||
    msg.includes("overloaded") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("econnreset") ||
    msg.includes("fetch failed")
  );
}

function recencyPrompt(recency: Recency): { text: string; cutoff: number | null } {
  const yearNow = new Date().getFullYear();
  if (recency === "last3") {
    const cutoff = yearNow - 3;
    return {
      cutoff,
      text: `HARD REQUIREMENT: every recommended book must have been originally published in ${cutoff}, ${cutoff + 1}, ${cutoff + 2}, or ${yearNow}. Do not include anything older under any circumstances.`,
    };
  }
  if (recency === "new12") {
    const cutoff = yearNow - 1;
    const today = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
    return {
      cutoff,
      text: `HARD REQUIREMENT: every recommended book must have been first published within the last 12 months — i.e. in ${yearNow - 1} or ${yearNow} only. Today is ${today}. Prefer the most recent, genuinely real and widely-covered releases you are certain exist. Do not include anything published before ${yearNow - 1}, and do not invent titles to satisfy the date range.`,
    };
  }
  return { cutoff: null, text: "There is no restriction on publication date." };
}

// POST /api/recommend → { results: Recommendation[] } | { error }
//
// LLM proposes 10 candidates → each is verified against the real catalog and the
// recency cutoff → editorial-list claims are checked against maintained data →
// covers are attached from the catalog → top 5 verified survivors returned.
export async function POST(request: Request) {
  if (!HAS_ANTHROPIC_KEY) {
    return NextResponse.json(
      { error: "The recommendation service is not configured. Set ANTHROPIC_API_KEY." },
      { status: 503 }
    );
  }

  let body: RecommendBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const validBooks = (body.books || []).filter((b) => b.title && b.title.trim());
  if (validBooks.length < 5) {
    return NextResponse.json(
      { error: "Add at least 5 books first." },
      { status: 400 }
    );
  }

  const inputList = validBooks
    .map((b) => (b.author ? `${b.title} by ${b.author}` : b.title))
    .join("; ");
  const { text: recencyText, cutoff } = recencyPrompt(body.recency);
  const excluded = new Set(
    [...validBooks.map((b) => b.title), ...(body.exclude || [])].map((t) =>
      t.toLowerCase()
    )
  );

  try {
    let candidates = await generateCandidates({
      inputList,
      recencyText,
      steerText: body.steer,
      exclude: body.exclude,
      shownBefore: body.shownBefore,
      mood: body.mood,
      moodText: body.moodText,
      adventurousness: body.adventurousness,
      profileTags: body.profileTags,
      interested: body.interested,
    });

    // Enforce the recency cutoff on the model's own claimed year first.
    if (cutoff) {
      candidates = candidates.filter((c) => c.year && c.year >= cutoff);
    }

    interface Scored {
      rec: Recommendation;
      rating: number | null;
      ratingsCount: number | null;
    }

    // Verify each candidate against the real catalog (drops hallucinations),
    // re-check the recency cutoff against the catalog's first-publish year, and
    // confirm editorial-list membership. Also capture the real reader rating.
    const checked = await Promise.all(
      candidates.slice(0, 10).map(async (c): Promise<Scored | null> => {
        if (excluded.has(c.title.toLowerCase())) return null;
        const doc = await verifyBook(c.title, c.author, cutoff);
        if (!doc) return null;
        if (excluded.has(doc.title.toLowerCase())) return null;

        const lists = await verifyLists(doc.title, doc.author || c.author);
        const coverUrl = doc.coverUrl || (await fetchCover(doc.title, doc.author || c.author));

        const author = doc.author || c.author || "";
        return {
          rec: {
            title: doc.title,
            author,
            year: doc.year ?? c.year,
            why: c.why,
            lists,
            coverUrl: coverUrl || null,
            isbn: doc.isbn ?? null,
            amazonUrl: amazonUrl(doc.title, author, doc.isbn),
            goodreadsUrl: goodreadsUrl(doc.title, author, doc.isbn),
          },
          rating: doc.rating ?? null,
          ratingsCount: doc.ratingsCount ?? null,
        };
      })
    );

    let scored = checked.filter((x): x is Scored => x !== null);

    // Real-ratings quality gate: drop books with a clearly low reader rating when
    // there are enough votes to trust it. Books lacking rating data are kept.
    scored = scored.filter(
      (x) => !(x.rating != null && x.rating < 3.5 && (x.ratingsCount ?? 0) >= 20)
    );

    // Weighting: award badges first (prizes heaviest), then real reader rating,
    // then how widely-rated the book is. Stable ties preserve the LLM taste order.
    scored.sort(
      (a, b) =>
        badgeScore(b.rec) - badgeScore(a.rec) ||
        (b.rating ?? 0) - (a.rating ?? 0) ||
        (b.ratingsCount ?? 0) - (a.ratingsCount ?? 0)
    );

    // Variety: at most one book per author in the final five.
    const results: Recommendation[] = [];
    const usedAuthors = new Set<string>();
    for (const x of scored) {
      const key = surnameKey(x.rec.author);
      if (key && usedAuthors.has(key)) continue;
      usedAuthors.add(key);
      results.push(x.rec);
      if (results.length >= 5) break;
    }
    // Backfill if the one-per-author rule left us short of five.
    if (results.length < 5) {
      for (const x of scored) {
        if (!results.includes(x.rec)) {
          results.push(x.rec);
          if (results.length >= 5) break;
        }
      }
    }

    if (results.length === 0) {
      // Distinguish "no verifiable books in this window" (a legitimate outcome
      // for a narrow recency + niche taste) from a transient failure. We never
      // pad with unverified books, so guide the reader to a wider window.
      const message =
        body.recency === "new12"
          ? "We couldn't confirm 5 brand-new releases (published in the last 12 months) that match your taste — recent niche titles often aren't in the catalog yet. Try “Last 3 years” or “Anytime” for more picks."
          : body.recency === "last3"
            ? "We couldn't confirm enough books from the last 3 years that match your taste. Try “Anytime” for more picks."
            : "Couldn't verify enough books just now. Please try again.";
      return NextResponse.json({ error: message }, { status: 200 });
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("recommend error", err);
    if (isBudgetError(err)) {
      return NextResponse.json(
        { error: "Monthly spend limit hit — please tell Asit to buy more tokens." },
        { status: 200 }
      );
    }
    if (isTransientError(err)) {
      return NextResponse.json(
        { error: "Claude is briefly busy right now — please tap the button again in a few seconds." },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { error: "Couldn't generate recommendations just now. Please try again." },
      { status: 502 }
    );
  }
}
