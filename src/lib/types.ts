// Shared domain types for the Book Recommendation Engine.

export type Recency = "anytime" | "last3" | "new12";

export type EditorialList =
  | "NYT"
  | "FT"
  | "Economist"
  | "BookerWinner"
  | "BookerShortlist"
  | "PulitzerWinner"
  | "PulitzerFinalist"
  | "WomensPrize"
  | "NationalBookAward"
  | "HugoAward"
  | "NebulaAward"
  | "NobelLaureate"
  | "IntlBooker"
  | "NBCC"
  | "Costa"
  | "FTBusiness"
  | "BaillieGifford"
  | "PulitzerHistory"
  | "PulitzerBiography"
  | "PulitzerNonfiction"
  | "WilliamHillSports";

/** A canonical, catalog-verified book entity. */
export interface Book {
  title: string;
  author: string;
  year: number | null;
  isbn?: string | null;
  coverUrl?: string | null;
  /** BCP-47 language code from the catalog (e.g. "en"), used to prefer the
   *  English edition when capturing ISBNs for store links. */
  language?: string | null;
  /** Real reader rating signal (Google Books), used only for ranking — never asserted in UI. */
  rating?: number | null;
  ratingsCount?: number | null;
}

/** A book on the user's shelf (client-side shape, persisted server-side). */
export interface ShelfBook {
  id: string;
  title: string;
  author: string;
  year: number | null;
  /** Remote cover URL, or a data: URL for a user photo (data URLs are stripped before persistence). */
  photo: string | null;
  needsTitle?: boolean;
  identifying?: boolean;
}

/** A finished recommendation shown on the results screen. */
export interface Recommendation {
  title: string;
  author: string;
  year: number | null;
  why: string;
  /** Only lists confirmed against real editorial data — never the raw LLM claim. */
  lists: EditorialList[];
  coverUrl: string | null;
  isbn?: string | null;
  amazonUrl: string;
  goodreadsUrl: string;
}

/** A saved wish-list book (for future reading / purchase). Persisted per account. */
export interface WishlistItem {
  title: string;
  author: string;
  year: number | null;
  coverUrl: string | null;
  isbn?: string | null;
  amazonUrl: string;
  goodreadsUrl: string;
  lists: EditorialList[];
}

/** Raw candidate produced by the LLM before verification. */
export interface Candidate {
  title: string;
  author: string;
  year: number | null;
  why: string;
  lists: EditorialList[];
}
