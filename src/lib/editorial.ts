// Editorial-list verification.
//
// The single most important product lesson: never let the LLM assert factual
// list membership. The LLM's proposed `lists` are only hints. A badge is shown
// ONLY when the (title, author) pair actually appears in a maintained editorial
// dataset (data/editorial-lists.json), which an operator populates from real,
// licensed sources (NYT Books API, FT/Economist year-end lists).

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { EditorialList } from "./types";

interface EditorialEntry {
  title: string;
  author: string;
  lists: EditorialList[];
}

interface AuthorEntry {
  author: string;
  lists: EditorialList[];
}

interface Dataset {
  entries: EditorialEntry[];
  authors: AuthorEntry[];
}

let cache: Dataset | null = null;

function norm(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics so "Díaz" == "Diaz"
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function load(): Promise<Dataset> {
  if (cache) return cache;
  try {
    const file = path.join(process.cwd(), "data", "editorial-lists.json");
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    cache = {
      entries: Array.isArray(parsed?.entries) ? parsed.entries : [],
      authors: Array.isArray(parsed?.authors) ? parsed.authors : [],
    };
  } catch {
    cache = { entries: [], authors: [] };
  }
  return cache!;
}

/** Author match requires BOTH given-name and surname tokens to line up, so a
 *  shared surname (e.g. a different "Morrison") can't earn an author-level badge. */
function authorMatches(datasetAuthor: string, bookAuthor: string): boolean {
  const d = norm(datasetAuthor);
  const b = norm(bookAuthor);
  if (!d || !b) return false;
  const dTokens = d.split(" ").filter(Boolean);
  const bTokens = new Set(b.split(" ").filter(Boolean));
  const surname = dTokens[dTokens.length - 1];
  const given = dTokens[0];
  if (!bTokens.has(surname)) return false;
  return dTokens.length === 1 || bTokens.has(given);
}

/**
 * Return the editorial lists / prizes a book actually appears on, straight from
 * the maintained dataset. This is authoritative ground truth — the LLM's opinion
 * of a book's awards is never consulted, so a badge can never be hallucinated.
 * Two sources: per-book entries (list/prize for a specific title), and per-author
 * entries (e.g. Nobel Laureate — applies to any book by that author).
 */
export async function verifyLists(
  title: string,
  author: string
): Promise<EditorialList[]> {
  const { entries, authors } = await load();
  const t = norm(title);
  if (!t) return [];
  const lastName = norm(author).split(" ").filter(Boolean).pop() || "";

  const found = new Set<EditorialList>();

  // Union across every matching entry, so the same book can carry awards listed
  // on separate rows (keeps the dataset additive and easy to extend).
  for (const e of entries) {
    const et = norm(e.title);
    const titleMatch = et === t || et.startsWith(t) || t.startsWith(et);
    const authorMatch = !lastName || norm(e.author).includes(lastName);
    if (titleMatch && authorMatch) for (const l of e.lists) found.add(l);
  }

  for (const a of authors) {
    if (authorMatches(a.author, author)) for (const l of a.lists) found.add(l);
  }

  return Array.from(found);
}
