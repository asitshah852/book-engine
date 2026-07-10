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

/** Surname (last token) of an author name, normalised. */
function surname(name: string): string {
  return norm(name).split(" ").filter(Boolean).pop() || "";
}

// Third-party study aids — summaries, workbooks, study guides, "key takeaways",
// etc. — clutter catalog search for popular books and are never what a reader
// means when they type a title. Detect them by tell-tale title phrases and by
// the handful of presses that mass-produce them, so we can drop them.
const AID_TITLE_RE =
  /\b(summary|summaries|study guide|studyguide|workbook|sparknotes|cliffs?\s?notes|instaread|macat|quicklet|brief read|key takeaways|conversation starters|reading group guide|study companion|unofficial (guide|companion)|analysis of|review and analysis|trivia (quiz|book)|sidekick)\b/i;
const AID_AUTHOR_RE =
  /(instaread|macat|supersummary|super summary|irb media|book tigers|bookrags|quickread|quick read|milkyway media|summareads|readtrepreneur|everest media|sabi shepherd|zip reads|ant hive media|knowledge tree|save time summaries)/i;

function isStudyAid(b: Book): boolean {
  return AID_TITLE_RE.test(b.title || "") || AID_AUTHOR_RE.test(b.author || "");
}

/** De-duplicate a merged book list by normalised title + author surname,
 *  keeping the first (higher-ranked) occurrence. */
export function dedupeBooks(books: Book[]): Book[] {
  const seen = new Set<string>();
  const out: Book[] = [];
  for (const b of books) {
    const key = norm(b.title) + "|" + surname(b.author);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

/**
 * How well a catalog result matches what the reader typed. Rewards title-word
 * coverage (forgiving of partial / out-of-order words), exact and prefix hits,
 * author-name matches (so typing just an author works), and popularity (so the
 * famous edition wins over an obscure reprint). Higher is better; ~55+ is a
 * confident match. Exported so the search route can tell a strong hit from a
 * weak one and decide whether to invoke the typo-rescue.
 */
export function relevanceScore(query: string, b: Book): number {
  const qNorm = norm(query);
  const qWords = significantWords(query);
  const t = norm(b.title);
  const a = norm(b.author);
  let score = 0;

  if (qWords.length) {
    const titleHits = qWords.filter((w) => t.includes(w)).length;
    score += (titleHits / qWords.length) * 100;
    const authorHits = qWords.filter((w) => a.includes(w)).length;
    score += (authorHits / qWords.length) * 45;
  } else if (qNorm && t.includes(qNorm)) {
    score += 60;
  }

  if (t === qNorm) score += 60;
  else if (t.startsWith(qNorm)) score += 30;
  else if (qNorm && t.includes(qNorm)) score += 15;

  if (b.coverUrl) score += 8;
  score += Math.min(30, Math.log10((b.ratingsCount || 0) + 1) * 10); // popularity
  if (b.year) score += 2;

  // "<Title> by <Author>" in the title itself is the hallmark of a summary /
  // guide edition (real books don't name their author in the title). Penalise
  // it — a genuine "Death by ..." title still wins on exact-match + popularity.
  if (/\bby\s+[a-z]/i.test(b.title || "")) score -= 30;
  return score;
}

/** Best relevance score across a result set (0 if empty). */
export function topRelevance(query: string, books: Book[]): number {
  return books.reduce((m, b) => Math.max(m, relevanceScore(query, b)), 0);
}

/**
 * Free-text catalog search. Queries Google Books and Open Library together and
 * merges them, then ranks by relevance + popularity so the edition the reader
 * most likely means comes first — tolerant of partial titles, out-of-order
 * words, and just-an-author searches. (Misspellings that still return junk are
 * handled a layer up by the LLM typo-rescue in the search route.)
 */
export async function searchBooks(
  query: string,
  preferAuthor?: string
): Promise<Book[]> {
  const [g, o] = await Promise.all([
    googleSearch(query).catch(() => [] as Book[]),
    openLibrarySearch({ q: query }).catch(() => [] as Book[]),
  ]);

  // When we know the intended author (from the typo-rescue), editions actually
  // written by them decisively beat critic-authored studies of the same title.
  const wantAuthor = surname(preferAuthor || "");

  const merged = dedupeBooks([...g, ...o]);
  // Combine our relevance score with the catalog's own ordering: Google / Open
  // Library already surface the canonical, popular edition near the top, which
  // rescues ranking when rating counts are missing. Earlier = a bigger nudge.
  const combined = new Map<Book, number>();
  merged.forEach((b, i) =>
    combined.set(
      b,
      relevanceScore(query, b) +
        Math.max(0, 16 - i * 2) +
        (wantAuthor && surname(b.author) === wantAuthor ? 90 : 0)
    )
  );
  // Drop third-party study aids when real editions exist (keep them only as a
  // last resort so a search never comes back empty).
  const real = merged.filter((b) => !isStudyAid(b));
  const pool = real.length ? real : merged;
  pool.sort((a, b) => (combined.get(b) || 0) - (combined.get(a) || 0));
  return pool.slice(0, 7);
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
