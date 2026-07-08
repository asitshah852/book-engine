// Real book-catalog access — the grounding layer of the verification pipeline.
//
// Everything selectable or recommendable must come back from a real catalog.
// Primary source: Google Books (server-side, optionally keyed). Fallbacks:
// Open Library, and iTunes for cover art. The LLM is never a source of factual
// book data — only a taste-matching / typo-rescue engine (see anthropic.ts).

import { GOOGLE_BOOKS_API_KEY } from "./config";
import type { Book } from "./types";

const FETCH_TIMEOUT_MS = 5000;

async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "BookRecommendationEngine/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Lowercase, strip diacritics + punctuation, collapse whitespace. */
function norm(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set(["the", "a", "an", "and", "of", "for", "to", "in"]);

/** Significant title words (skip articles/short words). */
function significantWords(title: string): string[] {
  return norm(title)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Strict title+author match: at least 70% of significant title words present,
 * AND the author's surname present. Guards against ever attaching the wrong
 * book's data (cover, year, ISBN) to a title.
 */
function isStrongMatch(
  wantTitle: string,
  wantAuthor: string,
  candTitle: string,
  candAuthor: string
): boolean {
  const words = significantWords(wantTitle);
  const ct = norm(candTitle);
  const titleOk =
    words.length === 0
      ? ct.includes(norm(wantTitle))
      : words.filter((w) => ct.includes(w)).length >=
        Math.ceil(words.length * 0.7);
  const wantLast = norm(wantAuthor).split(" ").filter(Boolean).pop();
  const authorOk = !wantLast || norm(candAuthor).includes(wantLast);
  return titleOk && authorOk;
}

function yearFromDate(published?: string): number | null {
  if (!published) return null;
  const m = String(published).match(/\d{4}/);
  return m ? Number(m[0]) : null;
}

function upgradeGoogleCover(url?: string): string | null {
  if (!url) return null;
  // Google Books thumbnails come over http and with zoom=1; upgrade both.
  return url.replace(/^http:/, "https:").replace(/&zoom=\d/, "&zoom=1");
}

// ── Google Books ───────────────────────────────────────────────────────────

interface GoogleVolume {
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    averageRating?: number;
    ratingsCount?: number;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: { type?: string; identifier?: string }[];
  };
}

function googleUrl(params: Record<string, string>): string {
  const u = new URLSearchParams({ country: "US", maxResults: "10", ...params });
  if (GOOGLE_BOOKS_API_KEY) u.set("key", GOOGLE_BOOKS_API_KEY);
  return "https://www.googleapis.com/books/v1/volumes?" + u.toString();
}

function volumeToBook(v: GoogleVolume): Book | null {
  const info = v.volumeInfo;
  if (!info?.title) return null;
  const isbn =
    info.industryIdentifiers?.find((i) => i.type === "ISBN_13")?.identifier ||
    info.industryIdentifiers?.find((i) => i.type === "ISBN_10")?.identifier ||
    null;
  return {
    title: info.title,
    author: (info.authors || [])[0] || "",
    year: yearFromDate(info.publishedDate),
    isbn,
    coverUrl: upgradeGoogleCover(info.imageLinks?.thumbnail),
    rating: info.averageRating ?? null,
    ratingsCount: info.ratingsCount ?? null,
  };
}

async function googleSearch(query: string): Promise<Book[]> {
  const data = await fetchJson(googleUrl({ q: query }));
  const items: GoogleVolume[] = data.items || [];
  const seen = new Set<string>();
  const out: Book[] = [];
  for (const v of items) {
    const b = volumeToBook(v);
    if (!b) continue;
    const key = (b.title + "|" + b.author).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

// ── Open Library (fallback) ─────────────────────────────────────────────────

async function openLibrarySearch(
  params: Record<string, string>
): Promise<Book[]> {
  const u = new URLSearchParams({
    limit: "10",
    fields: "title,author_name,first_publish_year,cover_i,isbn",
    ...params,
  });
  const data = await fetchJson("https://openlibrary.org/search.json?" + u.toString());
  const docs: any[] = data.docs || [];
  const seen = new Set<string>();
  const out: Book[] = [];
  for (const d of docs) {
    if (!d.title) continue;
    const author = (d.author_name || [])[0] || "";
    const key = (d.title + "|" + author).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: d.title,
      author,
      year: d.first_publish_year || null,
      isbn: (d.isbn || [])[0] || null,
      coverUrl: d.cover_i
        ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`
        : null,
    });
  }
  return out;
}

// ── iTunes (cover fallback) ─────────────────────────────────────────────────

async function itunesCover(title: string, author: string): Promise<string | null> {
  const u = new URLSearchParams({
    term: `${title} ${author}`.trim(),
    media: "ebook",
    limit: "8",
    country: "US",
  });
  const data = await fetchJson("https://itunes.apple.com/search?" + u.toString());
  for (const cand of data.results || []) {
    if (
      cand.artworkUrl100 &&
      isStrongMatch(title, author, cand.trackName || "", cand.artistName || "")
    ) {
      return String(cand.artworkUrl100).replace("100x100", "400x400");
    }
  }
  return null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Free-text catalog search. Google Books first, Open Library on failure/empty. */
export async function searchBooks(query: string): Promise<Book[]> {
  try {
    const g = await googleSearch(query);
    if (g.length > 0) return g.slice(0, 5);
  } catch {
    /* fall through to Open Library */
  }
  try {
    return (await openLibrarySearch({ q: query })).slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * Verify a specific (title, author) against a real catalog. Returns the
 * canonical catalog entry (with cover, year, ISBN) or null if not found or if
 * it fails the recency cutoff. This is what drops LLM hallucinations.
 */
export async function verifyBook(
  title: string,
  author: string,
  cutoffYear: number | null
): Promise<Book | null> {
  const candidates: Book[] = [];
  try {
    const q = author
      ? `intitle:${title} inauthor:${author}`
      : `intitle:${title}`;
    candidates.push(...(await googleSearch(q)));
  } catch {
    /* try open library */
  }
  if (candidates.length === 0) {
    try {
      candidates.push(
        ...(await openLibrarySearch({ title, author: author || "" }))
      );
    } catch {
      /* none */
    }
  }

  // Prefer a clean single edition over box sets / omnibus / "3 Books Collection".
  const isBoxSet = (t: string) =>
    /\b(box(ed)? set|omnibus|collection set|complete (series|collection|novels)|\d+\s*books?\s*(collection|set|box))\b/i.test(
      t
    );
  const strong = candidates.filter((b) => isStrongMatch(title, author, b.title, b.author));
  const match = strong.find((b) => !isBoxSet(b.title)) || strong[0];
  if (!match) return null;
  if (cutoffYear && match.year && match.year < cutoffYear) return null;
  return match;
}

/**
 * Best-effort cover art for a (title, author) with strict matching so the wrong
 * book's cover never shows. Used for recommendation covers and shelf refresh.
 */
export async function fetchCover(
  title: string,
  author: string
): Promise<string | null> {
  try {
    const g = await googleSearch(
      author ? `intitle:${title} inauthor:${author}` : `intitle:${title}`
    );
    const m = g.find(
      (b) => b.coverUrl && isStrongMatch(title, author, b.title, b.author)
    );
    if (m?.coverUrl) return m.coverUrl;
  } catch {
    /* try itunes */
  }
  try {
    return await itunesCover(title, author);
  } catch {
    return null;
  }
}
