// Persistence layer behind a small repository interface.
//
// The prototype used localStorage; production needs server-side accounts + a DB.
// This ships a file-backed store (data/store.json) so the app runs with zero
// external infrastructure. It is intentionally isolated behind these functions:
// swapping in Postgres/SQLite means reimplementing this file only.
//
// Auth note: name-only sign-in is carried over from the prototype as a stopgap.
// The account model and signed session cookie (see session.ts) are structured so
// this can be upgraded to passwordless/magic-link auth without touching the UI.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ShelfBook, WishlistItem } from "./types";

interface Account {
  id: string;
  name: string;
  createdAt: number;
}

interface StoredShelf {
  books: ShelfBook[];
  updatedAt: number;
}

interface StoredWishlist {
  items: WishlistItem[];
  updatedAt: number;
}

interface StoredDismissed {
  titles: string[];
  updatedAt: number;
}

interface StoreShape {
  accounts: Account[];
  shelves: Record<string, StoredShelf>; // keyed by account id
  wishlists: Record<string, StoredWishlist>; // keyed by account id
  dismissed: Record<string, StoredDismissed>; // "not interested" titles, keyed by account id
}

// Writable data lives in DATA_DIR — point this at a host's persistent disk in
// production (e.g. DATA_DIR=/var/data). Defaults to the project's data folder
// for local development.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
// Read-only seed bundled with the app. On first run (empty disk) the store is
// initialised from this, so a fresh deployment already contains seeded accounts.
const SEED_FILE = path.join(process.cwd(), "data", "seed-store.json");

// Serialize writes to avoid clobbering under concurrent requests.
let writeChain: Promise<void> = Promise.resolve();

async function readStore(): Promise<StoreShape> {
  let raw: string;
  try {
    raw = await readFile(STORE_FILE, "utf8");
  } catch {
    // No live store yet — fall back to the bundled seed (first deploy).
    try {
      raw = await readFile(SEED_FILE, "utf8");
    } catch {
      return { accounts: [], shelves: {}, wishlists: {}, dismissed: {} };
    }
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      shelves: parsed.shelves && typeof parsed.shelves === "object" ? parsed.shelves : {},
      wishlists: parsed.wishlists && typeof parsed.wishlists === "object" ? parsed.wishlists : {},
      dismissed: parsed.dismissed && typeof parsed.dismissed === "object" ? parsed.dismissed : {},
    };
  } catch {
    return { accounts: [], shelves: {}, wishlists: {}, dismissed: {} };
  }
}

async function writeStore(store: StoreShape): Promise<void> {
  const run = async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
  };
  writeChain = writeChain.then(run, run);
  return writeChain;
}

function normName(name: string): string {
  return name.trim().toLowerCase();
}

/** Find or create an account for a name (case-insensitive). Returns its id. */
export async function findOrCreateAccount(name: string): Promise<Account> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("name required");
  const store = await readStore();
  const existing = store.accounts.find(
    (a) => normName(a.name) === normName(trimmed)
  );
  if (existing) return existing;
  const account: Account = {
    id: randomUUID(),
    name: trimmed,
    createdAt: Date.now(),
  };
  store.accounts.push(account);
  await writeStore(store);
  return account;
}

export async function getAccount(id: string): Promise<Account | null> {
  const store = await readStore();
  return store.accounts.find((a) => a.id === id) || null;
}

export async function getShelf(accountId: string): Promise<ShelfBook[]> {
  const store = await readStore();
  return store.shelves[accountId]?.books || [];
}

export async function saveShelf(
  accountId: string,
  books: ShelfBook[]
): Promise<void> {
  const store = await readStore();
  // Persist only valid, titled books. Strip data: URL photos (too large / are
  // regenerated from the catalog); keep remote cover URLs.
  const clean: ShelfBook[] = books
    .filter((b) => b.title && b.title.trim() && !b.needsTitle)
    .map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author || "",
      year: b.year ?? null,
      photo: b.photo && !b.photo.startsWith("data:") ? b.photo : null,
    }));
  store.shelves[accountId] = { books: clean, updatedAt: Date.now() };
  await writeStore(store);
}

export async function getWishlist(accountId: string): Promise<WishlistItem[]> {
  const store = await readStore();
  return store.wishlists[accountId]?.items || [];
}

export async function saveWishlist(
  accountId: string,
  items: WishlistItem[]
): Promise<void> {
  const store = await readStore();
  const clean: WishlistItem[] = (items || [])
    .filter((i) => i && i.title && i.title.trim())
    .map((i) => ({
      title: i.title,
      author: i.author || "",
      year: i.year ?? null,
      coverUrl: i.coverUrl && !i.coverUrl.startsWith("data:") ? i.coverUrl : null,
      amazonUrl: i.amazonUrl || "",
      goodreadsUrl: i.goodreadsUrl || "",
      lists: Array.isArray(i.lists) ? i.lists : [],
    }));
  store.wishlists[accountId] = { items: clean, updatedAt: Date.now() };
  await writeStore(store);
}

/** Merge two wish lists (case-insensitive title dedupe), preserving order. */
export function mergeWishlists(
  a: WishlistItem[],
  b: WishlistItem[]
): WishlistItem[] {
  const seen = new Set(a.map((i) => (i.title || "").toLowerCase()));
  return [...a, ...b.filter((i) => !seen.has((i.title || "").toLowerCase()))];
}

export async function getDismissed(accountId: string): Promise<string[]> {
  const store = await readStore();
  return store.dismissed[accountId]?.titles || [];
}

export async function saveDismissed(
  accountId: string,
  titles: string[]
): Promise<void> {
  const store = await readStore();
  const seen = new Set<string>();
  const clean = (titles || [])
    .filter((t) => typeof t === "string" && t.trim())
    .filter((t) => {
      const k = t.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  store.dismissed[accountId] = { titles: clean, updatedAt: Date.now() };
  await writeStore(store);
}

/** Union two "not interested" title lists (case-insensitive). */
export function mergeDismissed(a: string[], b: string[]): string[] {
  const seen = new Set(a.map((t) => t.toLowerCase()));
  return [...a, ...b.filter((t) => !seen.has(t.toLowerCase()))];
}
