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
import { Redis } from "@upstash/redis";
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

// Storage backend selection:
//  • If UPSTASH_REDIS_REST_URL + _TOKEN are set (production on a serverless host
//    like Vercel), the whole store lives in one Redis key.
//  • Otherwise it's a JSON file under DATA_DIR (local dev / disk-backed hosts).
// Either way, a fresh/empty store is initialised from the bundled seed, so a new
// deployment already contains the seeded account(s).
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;
const STORE_KEY = "bre:store";

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const SEED_FILE = path.join(process.cwd(), "data", "seed-store.json");

// Serialize file writes to avoid clobbering under concurrent requests.
let writeChain: Promise<void> = Promise.resolve();

function normalize(parsed: unknown): StoreShape {
  const p = (parsed || {}) as Partial<StoreShape>;
  return {
    accounts: Array.isArray(p.accounts) ? p.accounts : [],
    shelves: p.shelves && typeof p.shelves === "object" ? p.shelves : {},
    wishlists: p.wishlists && typeof p.wishlists === "object" ? p.wishlists : {},
    dismissed: p.dismissed && typeof p.dismissed === "object" ? p.dismissed : {},
  };
}

async function readBackend(): Promise<unknown | null> {
  if (redis) {
    const v = await redis.get<StoreShape>(STORE_KEY);
    return v ?? null;
  }
  try {
    return JSON.parse(await readFile(STORE_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function readSeed(): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(SEED_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function readStore(): Promise<StoreShape> {
  const data = (await readBackend()) ?? (await readSeed());
  return normalize(data);
}

async function writeStore(store: StoreShape): Promise<void> {
  if (redis) {
    await redis.set(STORE_KEY, store);
    return;
  }
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

export interface OperatorUser {
  name: string;
  createdAt: number;
  /** Most recent shelf / reading-list write, or null if they never saved. */
  lastActive: number | null;
  shelfCount: number;
  wishlistCount: number;
}

/** Operator view: every account that has ever signed in, with light activity. */
export async function getOperatorStats(): Promise<{
  totalUsers: number;
  users: OperatorUser[];
}> {
  const store = await readStore();
  const users: OperatorUser[] = store.accounts
    .map((a) => {
      const shelf = store.shelves[a.id];
      const wish = store.wishlists[a.id];
      const times = [shelf?.updatedAt, wish?.updatedAt].filter(
        (t): t is number => typeof t === "number"
      );
      return {
        name: a.name,
        createdAt: a.createdAt,
        lastActive: times.length ? Math.max(...times) : null,
        shelfCount: shelf?.books.length || 0,
        wishlistCount: wish?.items.length || 0,
      };
    })
    .sort((x, y) => y.createdAt - x.createdAt);
  return { totalUsers: users.length, users };
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
