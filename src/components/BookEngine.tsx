"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CameraIcon,
  ClipboardIcon,
  ExternalLinkIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
} from "./icons";
import type { Book, Recency, Recommendation, ShelfBook, WishlistItem } from "@/lib/types";

const STRIPE_COLORS = [
  "oklch(58% 0.14 258)",
  "oklch(60% 0.13 25)",
  "oklch(58% 0.13 150)",
  "oklch(58% 0.13 320)",
  "oklch(60% 0.12 90)",
];

// Badge display: label + tier (prize winners get the gold ★ treatment).
// Each badge links to the award / list's own page so readers can browse the
// full roll of winners. Wikipedia list-pages are used for the prizes (they hold
// the complete, up-to-date winner + shortlist history); publishers' own hubs for
// the editorial "best books" lists.
const BADGE_META: Record<
  string,
  { label: string; tier: "prize" | "list"; url: string }
> = {
  NobelLaureate: { label: "Nobel Laureate", tier: "prize", url: "https://www.nobelprize.org/prizes/lists/all-nobel-prizes-in-literature/" },
  PulitzerWinner: { label: "Pulitzer Prize", tier: "prize", url: "https://en.wikipedia.org/wiki/Pulitzer_Prize_for_Fiction" },
  BookerWinner: { label: "Booker Prize", tier: "prize", url: "https://en.wikipedia.org/wiki/Booker_Prize" },
  IntlBooker: { label: "International Booker", tier: "prize", url: "https://en.wikipedia.org/wiki/International_Booker_Prize" },
  WomensPrize: { label: "Women's Prize", tier: "prize", url: "https://en.wikipedia.org/wiki/Women%27s_Prize_for_Fiction" },
  NationalBookAward: { label: "National Book Award", tier: "prize", url: "https://en.wikipedia.org/wiki/National_Book_Award_for_Fiction" },
  NBCC: { label: "NBCC Award", tier: "prize", url: "https://en.wikipedia.org/wiki/National_Book_Critics_Circle_Award" },
  Costa: { label: "Costa Book of the Year", tier: "prize", url: "https://en.wikipedia.org/wiki/Costa_Book_Awards" },
  HugoAward: { label: "Hugo Award", tier: "prize", url: "https://en.wikipedia.org/wiki/Hugo_Award_for_Best_Novel" },
  NebulaAward: { label: "Nebula Award", tier: "prize", url: "https://en.wikipedia.org/wiki/Nebula_Award_for_Best_Novel" },
  FTBusiness: { label: "FT Business Book of the Year", tier: "prize", url: "https://en.wikipedia.org/wiki/Financial_Times_and_McKinsey_Business_Book_of_the_Year_Award" },
  BaillieGifford: { label: "Baillie Gifford Prize", tier: "prize", url: "https://en.wikipedia.org/wiki/Baillie_Gifford_Prize" },
  PulitzerHistory: { label: "Pulitzer (History)", tier: "prize", url: "https://en.wikipedia.org/wiki/Pulitzer_Prize_for_History" },
  PulitzerBiography: { label: "Pulitzer (Biography)", tier: "prize", url: "https://en.wikipedia.org/wiki/Pulitzer_Prize_for_Biography" },
  PulitzerNonfiction: { label: "Pulitzer (Nonfiction)", tier: "prize", url: "https://en.wikipedia.org/wiki/Pulitzer_Prize_for_General_Nonfiction" },
  WilliamHillSports: { label: "William Hill Sports Book", tier: "prize", url: "https://en.wikipedia.org/wiki/William_Hill_Sports_Book_of_the_Year" },
  PulitzerFinalist: { label: "Pulitzer Finalist", tier: "list", url: "https://en.wikipedia.org/wiki/Pulitzer_Prize_for_Fiction" },
  BookerShortlist: { label: "Booker Shortlist", tier: "list", url: "https://en.wikipedia.org/wiki/Booker_Prize" },
  NYT: { label: "NYT Best Books", tier: "list", url: "https://www.nytimes.com/spotlight/best-books" },
  FT: { label: "FT Best Books", tier: "list", url: "https://www.ft.com/books" },
  Economist: { label: "Economist Books of the Year", tier: "list", url: "https://www.economist.com/culture" },
};
const BADGE_ORDER = [
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
  "PulitzerFinalist",
  "BookerShortlist",
  "NYT",
  "FT",
  "Economist",
];

// Guest shelf + wish list survive a refresh even when signed out.
const GUEST_KEY = "bre-guest-shelf-v1";
const GUEST_WISH_KEY = "bre-guest-wishlist-v1";
const GUEST_DISMISS_KEY = "bre-guest-dismissed-v1";

const MOOD_CHIPS = [
  "Fast-paced",
  "Beautiful prose",
  "Cozy & comforting",
  "Big ideas",
  "Character-driven",
  "Plot-driven",
  "Funny",
  "Dark & gritty",
  "Uplifting",
  "Thought-provoking",
  "Page-turner",
  "Literary",
  "Tear-jerker",
  "Investing & stock picking",
];

// Suggested taste tags the reader can add to their profile (beyond the inferred set).
const TASTE_OPTIONS = [
  "literary fiction",
  "historical fiction",
  "contemporary fiction",
  "mystery",
  "thriller",
  "crime",
  "sci-fi",
  "fantasy",
  "romance",
  "horror",
  "non-fiction",
  "biography",
  "memoir",
  "history",
  "business",
  "finance",
  "economics",
  "science",
  "philosophy",
  "politics",
  "self-help",
  "true crime",
  "classics",
  "world literature",
  "short stories",
  "essays",
  "character-driven",
  "fast-paced",
  "dark",
  "funny",
  "uplifting",
  "coming-of-age",
];

type Adventurousness = "safe" | "balanced" | "surprise";
const ADVENTURE_OPTS: { id: Adventurousness; label: string; desc: string }[] = [
  { id: "safe", label: "Safe", desc: "Close to what I love" },
  { id: "balanced", label: "Balanced", desc: "A good mix" },
  { id: "surprise", label: "Surprise me", desc: "Broaden my horizons" },
];

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `${Date.now()}-${idCounter}`;
}

function norm(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function BookEngine() {
  // step: 1 add books · 2 recency · 3 loading/error · 4 results
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [books, setBooks] = useState<ShelfBook[]>([]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Book[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [recency, setRecency] = useState<Recency | null>(null);
  const [results, setResults] = useState<Recommendation[]>([]);
  const [recError, setRecError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [pasteArmed, setPasteArmed] = useState(false);
  const [refreshingCovers, setRefreshingCovers] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [addedTitles, setAddedTitles] = useState<string[]>([]);
  const [dismissedTitles, setDismissedTitles] = useState<string[]>([]);
  // Books recommended on PAST visits (persisted per account) — a soft novelty
  // signal so each login surfaces mostly-fresh picks.
  const [shownHistory, setShownHistory] = useState<string[]>([]);
  const [likedTitles, setLikedTitles] = useState<string[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  // Step 2 preference controls
  const [mood, setMood] = useState<string[]>([]);
  const [moodText, setMoodText] = useState("");
  const [adventurousness, setAdventurousness] = useState<Adventurousness>("balanced");
  const [profileTags, setProfileTags] = useState<string[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileDraft, setProfileDraft] = useState("");
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [wishlistOpen, setWishlistOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pasteZoneRef = useRef<HTMLDivElement | null>(null);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pasteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);
  const booksRef = useRef(books);
  const stepRef = useRef(step);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersisted = useRef<ShelfBook[] | null>(null);
  const persistWishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedWish = useRef<WishlistItem[] | null>(null);
  const persistDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedDismiss = useRef<string[] | null>(null);
  const persistShownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedShown = useRef<string[] | null>(null);
  // Every recommendation title shown this session — excluded from future picks
  // so refreshing / "show me more" never repeats the same books.
  const seenRef = useRef<Set<string>>(new Set());

  booksRef.current = books;
  stepRef.current = step;

  const yearNow = new Date().getFullYear();

  // ── Duplicate detection (subtitle-tolerant) ────────────────────────────
  const isDuplicate = useCallback((title: string): boolean => {
    const t = norm(title);
    if (!t) return false;
    return booksRef.current.some((b) => {
      const bt = norm(b.title);
      return bt && (bt === t || bt.startsWith(t) || t.startsWith(bt));
    });
  }, []);

  // ── Cover backfill for catalog books lacking one ────────────────────────
  const backfillCovers = useCallback(async (targets: ShelfBook[]) => {
    for (const b of targets) {
      if (b.photo || !b.title) continue;
      try {
        const res = await fetch(
          `/api/cover?title=${encodeURIComponent(b.title)}&author=${encodeURIComponent(b.author || "")}`
        );
        const data = await res.json();
        if (data.coverUrl) {
          setBooks((s) =>
            s.map((x) => (x.id === b.id ? { ...x, photo: data.coverUrl } : x))
          );
        }
      } catch {
        /* placeholder stays */
      }
    }
  }, []);

  // ── Mount: restore session + wire document paste ────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let signedIn = false;
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (cancelled) return;
        if (data.name) {
          signedIn = true;
          setProfileName(data.name);
          const restored: ShelfBook[] = (data.books || []).map((b: ShelfBook) => ({
            ...b,
            id: b.id || newId(),
          }));
          lastPersisted.current = restored;
          setBooks(restored);
          backfillCovers(restored.filter((b) => !b.photo));
          const wl: WishlistItem[] = Array.isArray(data.wishlist) ? data.wishlist : [];
          lastPersistedWish.current = wl;
          setWishlist(wl);
          const dis: string[] = Array.isArray(data.dismissed) ? data.dismissed : [];
          lastPersistedDismiss.current = dis;
          setDismissedTitles(dis);
          // Soft novelty only — do NOT add to seenRef (the hard exclude), so a
          // great past pick can still occasionally resurface.
          const shownPrev: string[] = Array.isArray(data.shown) ? data.shown : [];
          lastPersistedShown.current = shownPrev;
          setShownHistory(shownPrev);
        }
      } catch {
        /* signed out — fall through to the local guest shelf */
      }
      // Signed out = a clean, empty session on purpose. We do NOT restore a
      // shelf/reading list from this browser, so nothing lingers for the next
      // person and sign-out always leaves a blank slate. Data persists only for
      // signed-in accounts, server-side. (Clear any legacy guest cache.)
      if (!signedIn && !cancelled) {
        try {
          localStorage.removeItem(GUEST_KEY);
          localStorage.removeItem(GUEST_WISH_KEY);
          localStorage.removeItem(GUEST_DISMISS_KEY);
        } catch {
          /* ignore */
        }
      }
      hydratedRef.current = true;
    })();

    document.addEventListener("paste", handlePaste);
    // Accept a dropped image anywhere on the page during step 1, and stop the
    // browser from navigating away to open the file.
    document.addEventListener("dragover", handleDocDragOver);
    document.addEventListener("drop", handleDocDrop);
    return () => {
      cancelled = true;
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("dragover", handleDocDragOver);
      document.removeEventListener("drop", handleDocDrop);
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the paste target focused while armed so right-click → Paste lands on it.
  useEffect(() => {
    if (pasteArmed) pasteZoneRef.current?.focus();
  }, [pasteArmed]);

  // ── Persist shelf server-side when signed in ────────────────────────────
  useEffect(() => {
    if (!profileName) return;
    if (books === lastPersisted.current) return;
    lastPersisted.current = books;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      fetch("/api/shelf", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ books }),
      }).catch(() => {});
    }, 500);
  }, [books, profileName]);

  // Persist the wish list server-side — signed-in accounts only (no guest cache).
  useEffect(() => {
    if (!hydratedRef.current || !profileName) return;
    if (wishlist === lastPersistedWish.current) return;
    lastPersistedWish.current = wishlist;
    if (persistWishTimer.current) clearTimeout(persistWishTimer.current);
    persistWishTimer.current = setTimeout(() => {
      fetch("/api/wishlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: wishlist }),
      }).catch(() => {});
    }, 500);
  }, [wishlist, profileName]);

  // Persist the "not interested" list server-side — signed-in accounts only.
  useEffect(() => {
    if (!hydratedRef.current || !profileName) return;
    if (dismissedTitles === lastPersistedDismiss.current) return;
    lastPersistedDismiss.current = dismissedTitles;
    if (persistDismissTimer.current) clearTimeout(persistDismissTimer.current);
    persistDismissTimer.current = setTimeout(() => {
      fetch("/api/dismissed", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titles: dismissedTitles }),
      }).catch(() => {});
    }, 500);
  }, [dismissedTitles, profileName]);

  // Persist the cross-session shown-history server-side — signed-in accounts only.
  useEffect(() => {
    if (!hydratedRef.current || !profileName) return;
    if (shownHistory === lastPersistedShown.current) return;
    lastPersistedShown.current = shownHistory;
    if (persistShownTimer.current) clearTimeout(persistShownTimer.current);
    persistShownTimer.current = setTimeout(() => {
      fetch("/api/shown", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titles: shownHistory }),
      }).catch(() => {});
    }, 800);
  }, [shownHistory, profileName]);

  // ── Search ──────────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    const seq = ++searchSeq.current;
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (seq !== searchSeq.current) return; // stale
      setSearchResults((data.results || []).slice(0, 6));
    } catch {
      if (seq !== searchSeq.current) return;
      setSearchResults([]);
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    setSearchResults(null);
    setSearching(false);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    searchTimer.current = setTimeout(() => runSearch(trimmed), 320);
  };

  const addBookFromMatch = (match: Book) => {
    if (isDuplicate(match.title)) {
      setQuery("");
      setSearchResults(null);
      setSearching(false);
      setCameraError(`"${match.title}" is already on your shelf.`);
      return;
    }
    setBooks((s) => [
      {
        id: newId(),
        title: match.title,
        author: match.author,
        year: match.year,
        photo: match.coverUrl || null,
        needsTitle: false,
      },
      ...s,
    ]);
    setQuery("");
    setSearchResults(null);
    setSearching(false);
    setCameraError(null);
  };

  const removeBook = (id: string) =>
    setBooks((s) => s.filter((b) => b.id !== id));

  const updateBookDraft = (id: string, val: string) =>
    setBooks((s) => s.map((b) => (b.id === id ? { ...b, title: val } : b)));

  const clearShelf = () => setBooks([]);

  const refreshCovers = async () => {
    if (refreshingCovers) return;
    setRefreshingCovers(true);
    // Drop remote covers (keep user photos) so backfill re-fetches with the strict matcher.
    const cleared = booksRef.current.map((b) =>
      b.photo && !b.photo.startsWith("data:") ? { ...b, photo: null } : b
    );
    setBooks(cleared);
    await backfillCovers(cleared.filter((b) => !b.photo && !b.needsTitle));
    setRefreshingCovers(false);
  };

  // ── Image → identify ────────────────────────────────────────────────────
  const identifyBook = async (id: string, dataURL: string) => {
    setIdentifying(true);
    try {
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataURL }),
      });
      const data = await res.json();
      if (data.unknown || !data.title) {
        setBooks((s) =>
          s.map((b) =>
            b.id === id ? { ...b, needsTitle: true, identifying: false } : b
          )
        );
        return;
      }
      // Identified a book already on the shelf → drop the photo card, notify.
      const dup = booksRef.current.some(
        (b) => b.id !== id && b.title && sameTitle(b.title, data.title)
      );
      if (dup) {
        setBooks((s) => s.filter((b) => b.id !== id));
        setCameraError(`"${data.title}" is already on your shelf.`);
        return;
      }
      setBooks((s) =>
        s.map((b) =>
          b.id === id
            ? {
                ...b,
                title: data.title,
                author: data.author || "",
                year: data.year ?? null,
                photo: data.coverUrl || b.photo,
                identifying: false,
              }
            : b
        )
      );
    } catch {
      setBooks((s) =>
        s.map((b) =>
          b.id === id ? { ...b, needsTitle: true, identifying: false } : b
        )
      );
    } finally {
      setIdentifying(false);
    }
  };

  const processImageFile = (file: File | null | undefined) => {
    if (pasteTimer.current) clearTimeout(pasteTimer.current);
    setPasteArmed(false);
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Downscale so the vision request stays small (≤900px).
        const maxDim = 900;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataURL = canvas.toDataURL("image/jpeg", 0.85);
        const id = newId();
        setBooks((s) => [
          { id, title: "", author: "", year: null, photo: dataURL, needsTitle: false, identifying: true },
          ...s,
        ]);
        identifyBook(id, dataURL);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: ClipboardEvent) => {
    if (stepRef.current !== 1) return;
    const cd = e.clipboardData;
    if (!cd) return;
    for (const item of Array.from(cd.items || [])) {
      if (item.type && item.type.startsWith("image/")) {
        processImageFile(item.getAsFile());
        return;
      }
    }
    for (const f of Array.from(cd.files || [])) {
      if (f.type && f.type.startsWith("image/")) {
        processImageFile(f);
        return;
      }
    }
  };

  const armPaste = async () => {
    setPasteArmed(true);
    if (pasteTimer.current) clearTimeout(pasteTimer.current);
    pasteTimer.current = setTimeout(() => setPasteArmed(false), 12000);
    // Best case: read the clipboard image directly so a single click pastes it
    // (no Ctrl+V needed). Falls back to armed mode if unsupported/denied.
    try {
      const clip = navigator.clipboard as unknown as {
        read?: () => Promise<
          { types: string[]; getType: (t: string) => Promise<Blob> }[]
        >;
      };
      if (clip?.read) {
        const items = await clip.read();
        for (const item of items) {
          const type = item.types.find((t) => t.startsWith("image/"));
          if (type) {
            const blob = await item.getType(type);
            processImageFile(new File([blob], "pasted.png", { type }));
            return;
          }
        }
      }
    } catch {
      /* fall back to Ctrl+V / right-click → Paste */
    }
  };

  // Right-click → Paste (and Ctrl+V) landing on the focused paste target.
  const handleTilePaste = (e: React.ClipboardEvent) => {
    const cd = e.clipboardData;
    for (const item of Array.from(cd.items || [])) {
      if (item.type && item.type.startsWith("image/")) {
        e.preventDefault();
        processImageFile(item.getAsFile());
        return;
      }
    }
    for (const f of Array.from(cd.files || [])) {
      if (f.type && f.type.startsWith("image/")) {
        e.preventDefault();
        processImageFile(f);
        return;
      }
    }
  };

  const handleDocDragOver = (e: DragEvent) => {
    if (stepRef.current !== 1) return;
    e.preventDefault();
    setDragActive(true);
    // dragover fires continuously while hovering; when it stops (leave/drop),
    // this timer fires and hides the overlay.
    if (dragTimer.current) clearTimeout(dragTimer.current);
    dragTimer.current = setTimeout(() => setDragActive(false), 160);
  };
  const handleDocDrop = (e: DragEvent) => {
    if (dragTimer.current) clearTimeout(dragTimer.current);
    setDragActive(false);
    if (stepRef.current !== 1) return;
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) processImageFile(file);
  };

  // ── Add a recommendation to the shelf / mark it already read ────────────
  const addToShelf = (rec: Recommendation) => {
    setAddedTitles((a) => (a.includes(rec.title) ? a : [...a, rec.title]));
    if (isDuplicate(rec.title)) return;
    setBooks((s) => [
      {
        id: newId(),
        title: rec.title,
        author: rec.author,
        year: rec.year,
        photo: rec.coverUrl || null,
        needsTitle: false,
      },
      ...s,
    ]);
  };

  const isWished = (title: string) =>
    wishlist.some((w) => w.title.toLowerCase() === title.toLowerCase());

  const addToWishlist = (rec: Recommendation) => {
    setWishlist((w) =>
      w.some((x) => x.title.toLowerCase() === rec.title.toLowerCase())
        ? w
        : [
            {
              title: rec.title,
              author: rec.author,
              year: rec.year,
              coverUrl: rec.coverUrl,
              isbn: rec.isbn ?? null,
              amazonUrl: rec.amazonUrl,
              goodreadsUrl: rec.goodreadsUrl,
              lists: rec.lists,
            },
            ...w,
          ]
    );
  };

  const removeFromWishlist = (title: string) =>
    setWishlist((w) => w.filter((x) => x.title.toLowerCase() !== title.toLowerCase()));

  const thumbUp = (rec: Recommendation) => {
    setLikedTitles((l) =>
      l.includes(rec.title) ? l.filter((t) => t !== rec.title) : [...l, rec.title]
    );
  };

  const thumbDown = (rec: Recommendation) => {
    setDismissedTitles((d) => (d.includes(rec.title) ? d : [...d, rec.title]));
    setLikedTitles((l) => l.filter((t) => t !== rec.title));
    setResults((rs) => rs.filter((r) => r.title !== rec.title));
  };

  // Remember every title shown this session so future picks never repeat them.
  const recordSeen = (recs: Recommendation[]) => {
    for (const r of recs) seenRef.current.add((r.title || "").toLowerCase());
  };

  // Append shown titles to the account's cross-session history (persisted) so
  // future logins lean toward fresh picks. Kept to the most recent ~300.
  const recordShown = (recs: Recommendation[]) => {
    if (!profileName) return; // only meaningful for a saved account
    const titles = recs.map((r) => r.title).filter(Boolean);
    if (!titles.length) return;
    setShownHistory((prev) => {
      const combined = [...prev, ...titles];
      const seen = new Set<string>();
      const out: string[] = [];
      // Walk newest→oldest, keeping the most recent occurrence of each title.
      for (let i = combined.length - 1; i >= 0; i--) {
        const t = combined[i];
        const k = (t || "").toLowerCase();
        if (!t || seen.has(k)) continue;
        seen.add(k);
        out.unshift(t);
      }
      return out.slice(-300);
    });
  };

  // Fetch more picks and append them (no starting over). Excludes everything
  // already shown or thumbed-down; liked picks feed back in as extra taste.
  const loadMore = async (steer?: string) => {
    if (loadingMore || !recency) return;
    setLoadingMore(true);
    setMoreError(null);
    const shelf = booksRef.current.filter((b) => b.title && b.title.trim() && !b.needsTitle);
    const likedExtras = results
      .filter((r) => likedTitles.includes(r.title))
      .map((r) => ({ id: newId(), title: r.title, author: r.author, year: r.year, photo: null }));
    const shownTitles = results.map((r) => r.title);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          books: [...shelf, ...likedExtras],
          recency,
          steer,
          exclude: [...dismissedTitles, ...wishlist.map((w) => w.title), ...Array.from(seenRef.current), ...shownTitles],
          ...prefs(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.results || data.results.length === 0) {
        setMoreError(
          data.error || "No more matches right now — try a different tweak or Start over."
        );
      } else {
        recordSeen(data.results as Recommendation[]);
        recordShown(data.results as Recommendation[]);
        setResults((rs) => {
          const seen = new Set(rs.map((r) => r.title.toLowerCase()));
          const fresh = (data.results as Recommendation[]).filter(
            (r) => !seen.has(r.title.toLowerCase())
          );
          return [...rs, ...fresh];
        });
      }
    } catch {
      setMoreError("Couldn't load more just now. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  };

  // Replace the current picks with a whole new set (like turning to a fresh
  // shelf), excluding everything already seen this session so nothing repeats.
  const refreshPicks = async () => {
    if (refreshing || loadingMore || !recency) return;
    setRefreshing(true);
    setMoreError(null);
    const shelf = booksRef.current.filter((b) => b.title && b.title.trim() && !b.needsTitle);
    const likedExtras = results
      .filter((r) => likedTitles.includes(r.title))
      .map((r) => ({ id: newId(), title: r.title, author: r.author, year: r.year, photo: null }));
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          books: [...shelf, ...likedExtras],
          recency,
          exclude: [...dismissedTitles, ...wishlist.map((w) => w.title), ...Array.from(seenRef.current)],
          ...prefs(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.results || data.results.length === 0) {
        setMoreError(
          data.error || "No fresh picks left right now — try a category below or Start over."
        );
      } else {
        recordSeen(data.results as Recommendation[]);
        recordShown(data.results as Recommendation[]);
        setResults(data.results);
        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setMoreError("Couldn't refresh just now. Please try again.");
    } finally {
      setRefreshing(false);
    }
  };

  const triggerUpload = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileRef.current?.click();
  };

  // ── Spreadsheet / list import ───────────────────────────────────────────
  // Delimited (CSV/TSV) parser that respects quoted fields.
  const parseDelimited = (text: string): string[][] => {
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    const delim = firstLine.includes("\t") ? "\t" : ",";
    const rows: string[][] = [];
    let row: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
        } else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === delim) { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows;
  };

  // Turn a grid of cells into {title, author} rows — detects a header row and
  // title/author columns, and falls back to "Title by Author" in one column.
  const parseBookRows = (grid: unknown[][]): { title: string; author: string }[] => {
    const clean = (grid || []).map((r) =>
      Array.isArray(r) ? r.map((c) => (c == null ? "" : String(c).trim())) : []
    );
    if (!clean.length) return [];
    const first = clean[0] || [];
    const lower = first.map((c) => c.toLowerCase());
    const findCol = (keys: string[]) =>
      lower.findIndex((c) => keys.some((k) => c === k || c.includes(k)));
    const tIdx = findCol(["title", "book", "name"]);
    const aIdx = findCol(["author", "writer"]);
    let titleCol = 0;
    let authorCol = first.length > 1 ? 1 : -1;
    let start = 0;
    if (tIdx !== -1 || aIdx !== -1) {
      titleCol = tIdx !== -1 ? tIdx : 0;
      authorCol = aIdx;
      start = 1;
    }
    const out: { title: string; author: string }[] = [];
    for (let i = start; i < clean.length; i++) {
      const r = clean[i];
      if (!r || !r.length) continue;
      let title = (r[titleCol] || "").trim();
      let author = authorCol >= 0 ? (r[authorCol] || "").trim() : "";
      if (!title) title = (r[0] || "").trim();
      // Single-column lists often read "Title by Author" / "Title - Author".
      if (!author && authorCol < 0) {
        const m = title.match(/^(.+?)\s+(?:by|-|—|–)\s+(.+)$/i);
        if (m && m[1] && m[2]) { title = m[1].trim(); author = m[2].trim(); }
      }
      if (title) out.push({ title, author });
    }
    return out;
  };

  const processBookListFile = async (file: File) => {
    setCameraError(null);
    setImportNote(null);
    setImporting(true);
    try {
      let grid: unknown[][] = [];
      const name = file.name.toLowerCase();
      const isText =
        /\.(csv|tsv|txt)$/.test(name) ||
        file.type === "text/csv" ||
        file.type === "text/plain";
      if (isText) {
        grid = parseDelimited(await file.text());
      } else {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        grid = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          blankrows: false,
          defval: "",
        }) as unknown[][];
      }
      const parsed = parseBookRows(grid);
      if (!parsed.length) {
        setCameraError(
          "Couldn't find any titles in that file — make sure one column holds the book titles."
        );
        return;
      }
      const seen = new Set<string>();
      const toAdd: ShelfBook[] = [];
      for (const p of parsed) {
        const key = p.title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (isDuplicate(p.title)) continue;
        toAdd.push({
          id: newId(),
          title: p.title,
          author: p.author,
          year: null,
          photo: null,
          needsTitle: false,
        });
      }
      if (!toAdd.length) {
        setImportNote("Those titles are already on your shelf.");
        return;
      }
      const capped = toAdd.slice(0, 200);
      setBooks((s) => [...capped, ...s]);
      const n = capped.length;
      setImportNote(`Added ${n} book${n > 1 ? "s" : ""} from ${file.name} — fetching covers…`);
      await backfillCovers(capped);
      setImportNote(`Added ${n} book${n > 1 ? "s" : ""} from ${file.name}.`);
    } catch {
      setCameraError(
        "Couldn't read that file. Use a .csv or .xlsx with a column of book titles (an Author column is optional)."
      );
    } finally {
      setImporting(false);
    }
  };

  // Route a dropped / chosen file: a cover image goes to the photo flow; a
  // spreadsheet / CSV goes to the list importer.
  const routeFile = (file: File | null | undefined) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    const isList =
      /\.(csv|tsv|txt|xlsx|xls|ods)$/.test(name) ||
      /csv|excel|spreadsheet|officedocument\.spreadsheet|text\/plain/.test(file.type);
    const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic|bmp)$/.test(name);
    if (isList && !isImage) processBookListFile(file);
    else processImageFile(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    routeFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    routeFile(e.dataTransfer?.files?.[0]);
  };

  // ── Camera ────────────────────────────────────────────────────────────
  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const openCamera = () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera not available on this device. Type titles below instead.");
      return;
    }
    setCameraOpen(true);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        setCameraOpen(false);
        setCameraError("Camera access was denied. You can still type titles below.");
      });
  };

  const closeCamera = () => {
    stopStream();
    setCameraOpen(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataURL = canvas.toDataURL("image/jpeg", 0.85);
    const id = newId();
    setBooks((s) => [
      { id, title: "", author: "", year: null, photo: dataURL, needsTitle: false, identifying: true },
      ...s,
    ]);
    stopStream();
    setCameraOpen(false);
    identifyBook(id, dataURL);
  };

  // ── Account ─────────────────────────────────────────────────────────────
  const submitName = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = nameDraft.trim();
    if (!name) return;
    setShowNamePrompt(false);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, books: booksRef.current, wishlist, dismissed: dismissedTitles }),
      });
      const data = await res.json();
      if (data.name) {
        setProfileName(data.name);
        const merged: ShelfBook[] = (data.books || []).map((b: ShelfBook) => ({
          ...b,
          id: b.id || newId(),
        }));
        lastPersisted.current = merged;
        setBooks(merged);
        backfillCovers(merged.filter((b) => !b.photo));
        const wl: WishlistItem[] = Array.isArray(data.wishlist) ? data.wishlist : [];
        lastPersistedWish.current = wl;
        setWishlist(wl);
        const dis: string[] = Array.isArray(data.dismissed) ? data.dismissed : [];
        lastPersistedDismiss.current = dis;
        setDismissedTitles(dis);
        const shownPrev: string[] = Array.isArray(data.shown) ? data.shown : [];
        lastPersistedShown.current = shownPrev;
        setShownHistory(shownPrev);
      }
    } catch {
      /* ignore */
    }
  };

  const signOut = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      /* ignore */
    }
    // Clear any guest copies in this browser, then hard-reload to a completely
    // fresh, empty state. A reload guarantees nothing lingers from the signed-in
    // session: the app re-mounts, sees no login cookie, and finds no guest data,
    // so the next person on this device starts from a blank slate. (Asit's data
    // stays safe on the server and comes back on the next sign-in.)
    try {
      localStorage.removeItem(GUEST_KEY);
      localStorage.removeItem(GUEST_WISH_KEY);
      localStorage.removeItem(GUEST_DISMISS_KEY);
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined") window.location.reload();
  };

  // ── Recommendations ─────────────────────────────────────────────────────
  const generate = async (steer?: string) => {
    if (!recency) return;
    setStep(3);
    setRecError(null);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          books: booksRef.current.filter((b) => b.title && b.title.trim() && !b.needsTitle),
          recency,
          steer,
          // Never re-suggest a dismissed book, or anything already shown this
          // session — so each run brings genuinely new titles.
          exclude: [...dismissedTitles, ...wishlist.map((w) => w.title), ...Array.from(seenRef.current)],
          ...prefs(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.results || data.results.length === 0) {
        setRecError(data.error || "Couldn't generate recommendations just now. Please try again.");
        setStep(3);
        return;
      }
      recordSeen(data.results);
      recordShown(data.results);
      setResults(data.results);
      setStep(4);
    } catch {
      setRecError("Couldn't generate recommendations just now. Please try again.");
      setStep(3);
    }
  };

  // ── Step 2 preference handlers ──────────────────────────────────────────
  const toggleMood = (m: string) =>
    setMood((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  const loadProfile = async () => {
    if (profileLoading) return;
    setProfileLoading(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          books: booksRef.current.filter((b) => b.title && b.title.trim() && !b.needsTitle),
        }),
      });
      const data = await res.json();
      setProfileTags(Array.isArray(data.tags) ? data.tags : []);
    } catch {
      setProfileTags([]);
    } finally {
      setProfileLoaded(true);
      setProfileLoading(false);
    }
  };

  const addProfileTag = (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (!t) return;
    setProfileTags((s) => (s.includes(t) ? s : [...s, t]));
  };
  const submitProfileDraft = (e: React.FormEvent) => {
    e.preventDefault();
    addProfileTag(profileDraft);
    setProfileDraft("");
  };

  // Preference payload shared by generate() and loadMore().
  const prefs = () => ({
    mood,
    moodText: moodText.trim(),
    adventurousness,
    profileTags,
    // Soft novelty: books shown on past visits — bias toward fresh picks.
    shownBefore: shownHistory,
    // Reading-list books are an interest signal — feed them into the taste read
    // (they're also excluded from results, below, so they're never suggested).
    interested: wishlist.map((w) => (w.author ? `${w.title} by ${w.author}` : w.title)),
  });

  const restart = () => {
    stopStream();
    setStep(1);
    setQuery("");
    setRecency(null);
    setCameraOpen(false);
    setCameraError(null);
    setResults([]);
    setRecError(null);
    setSearchResults(null);
    setSearching(false);
    setAddedTitles([]);
    // Keep dismissedTitles — a thumbs-down book should never come back.
    setLikedTitles([]);
    setMoreError(null);
    setLoadingMore(false);
    setRefreshing(false);
    seenRef.current.clear();
    setMood([]);
    setMoodText("");
    setAdventurousness("balanced");
    setProfileTags([]);
    setProfileLoaded(false);
    setProfileDraft("");
  };

  // ── Derived view state ──────────────────────────────────────────────────
  const validCount = books.filter((b) => b.title && b.title.trim() && !b.needsTitle).length;
  const continueDisabled = validCount < 5;
  const trimmedQuery = query.trim();
  const showSearchPanel = trimmedQuery.length >= 2 && (searching || searchResults !== null);
  const hasSearchResults = showSearchPanel && !searching && !!searchResults && searchResults.length > 0;
  const noMatches = showSearchPanel && !searching && !!searchResults && searchResults.length === 0;
  const inputBookCount = books.filter((b) => !b.needsTitle && b.title).length;

  const recencyLabelMap: Record<Recency, string> = {
    anytime: "Any publication date",
    last3: "Published in the last 3 years",
    new12: "New releases from the last 12 months",
  };
  const recencySummary = recency ? recencyLabelMap[recency] : "Any publication date";

  const recencyOptions: { id: Recency; title: string; desc: string }[] = [
    { id: "anytime", title: "Anytime", desc: "Any publication date" },
    { id: "last3", title: "Last 3 years", desc: `Published since ${yearNow - 3}` },
    { id: "new12", title: "New releases", desc: "Published in the last 12 months" },
  ];

  const genreChips = [
    "More fiction",
    "More non-fiction",
    "More biographies & memoirs",
    "More sports",
    "More music",
    "More film & media",
    "More business & finance",
    "More mystery & thriller",
    "More sci-fi & fantasy",
    "More history",
  ];

  const stepDefs = [
    { num: 1, label: "Add books" },
    { num: 2, label: "Preferences" },
    { num: 3, label: "Results" },
  ];
  const activeIdx = step >= 3 ? 3 : step;

  const isLoading = step === 3 && !recError;
  const hasRecError = step === 3 && !!recError;
  const readingListTitle = profileName ? `${profileName}'s reading list` : "Your reading list";

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "clamp(28px, 8vw, 56px) clamp(14px, 4vw, 24px) 80px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 640 }}>
        {/* Account bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 18,
            minHeight: 30,
          }}
        >
          <button
            onClick={() => setWishlistOpen(true)}
            style={{
              border: "1.5px solid oklch(85% 0 0)",
              background: "oklch(100% 0 0)",
              color: "oklch(35% 0 0)",
              fontSize: 12.5,
              fontWeight: 600,
              padding: "7px 12px",
              borderRadius: 7,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "inherit",
            }}
          >
            <span style={{ color: "oklch(52% 0.16 258)" }}>♥</span> {readingListTitle}
            {wishlist.length > 0 ? ` (${wishlist.length})` : ""}
          </button>
          {profileName ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "oklch(46% 0 0)" }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "oklch(52% 0.16 258)",
                  color: "oklch(100% 0 0)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {(profileName || "?").trim().charAt(0).toUpperCase()}
              </div>
              <span>
                <strong style={{ color: "oklch(25% 0 0)" }}>{profileName}</strong>&rsquo;s bookshelf
              </span>
              <span onClick={signOut} style={{ cursor: "pointer", color: "oklch(55% 0 0)", textDecoration: "underline" }}>
                sign out
              </span>
            </div>
          ) : showNamePrompt ? (
            <form onSubmit={submitName} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Your name"
                autoFocus
                style={{
                  border: "1.5px solid oklch(85% 0 0)",
                  borderRadius: 7,
                  padding: "6px 10px",
                  fontSize: 13,
                  fontFamily: "inherit",
                  outline: "none",
                  width: 140,
                }}
              />
              <button
                type="submit"
                style={{
                  border: "none",
                  background: "oklch(20% 0 0)",
                  color: "oklch(100% 0 0)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  padding: "7px 12px",
                  borderRadius: 7,
                  cursor: "pointer",
                }}
              >
                Save
              </button>
              <span
                onClick={() => setShowNamePrompt(false)}
                style={{ cursor: "pointer", fontSize: 13, color: "oklch(55% 0 0)" }}
              >
                ✕
              </span>
            </form>
          ) : (
            <button
              onClick={() => {
                setShowNamePrompt(true);
                setNameDraft("");
              }}
              style={{
                border: "1.5px solid oklch(85% 0 0)",
                background: "oklch(100% 0 0)",
                color: "oklch(35% 0 0)",
                fontSize: 12.5,
                fontWeight: 600,
                padding: "7px 12px",
                borderRadius: 7,
                cursor: "pointer",
              }}
            >
              Sign in to save your data. No password needed
            </button>
          )}
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 40 }}>
          {stepDefs.map((d, i) => {
            const active = d.num === activeIdx;
            const done = d.num < activeIdx;
            const last = i === stepDefs.length - 1;
            return (
              <div
                key={d.num}
                style={{ display: "flex", alignItems: "center", gap: 8, flex: last ? 0 : 1 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      flex: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 600,
                      background: active || done ? "oklch(52% 0.16 258)" : "oklch(100% 0 0)",
                      color: active || done ? "oklch(100% 0 0)" : "oklch(55% 0 0)",
                      border: `1.5px solid ${active || done ? "oklch(52% 0.16 258)" : "oklch(85% 0 0)"}`,
                      transition: "all .2s",
                    }}
                  >
                    {d.num}
                  </div>
                  <div
                    className={active ? "bre-step-label bre-step-label-active" : "bre-step-label"}
                    style={{
                      fontSize: 13,
                      color: active ? "oklch(20% 0 0)" : "oklch(55% 0 0)",
                      fontWeight: active ? 600 : 400,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {d.label}
                  </div>
                </div>
                {!last && (
                  <div
                    style={{
                      flex: 1,
                      height: 1.5,
                      background: done ? "oklch(52% 0.16 258)" : "oklch(87% 0 0)",
                      margin: "0 4px",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div style={{ animation: "bre-fade .3s ease" }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-.01em" }}>
              Books you have read and loved
            </h1>
            <p style={{ fontSize: 15, color: "oklch(46% 0 0)", margin: "0 0 28px", lineHeight: 1.5 }}>
              Add at least 5 books you&apos;ve loved — snap a photo of the cover or type the title. The more you add, the
              sharper your recommendations.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
              {/* Camera tile */}
              <div
                onClick={openCamera}
                className="bre-tile"
                style={{
                  flex: "none",
                  width: 120,
                  height: 96,
                  border: "1.5px dashed oklch(80% 0 0)",
                  borderRadius: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  cursor: "pointer",
                  color: "oklch(46% 0 0)",
                }}
              >
                <CameraIcon />
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>Take a photo</div>
              </div>

              {/* Paste / drop tile */}
              <div
                onClick={armPaste}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="bre-tile"
                style={{
                  flex: "none",
                  width: 130,
                  height: 96,
                  border: `1.5px dashed ${pasteArmed ? "oklch(52% 0.16 258)" : "oklch(80% 0 0)"}`,
                  borderRadius: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  cursor: "pointer",
                  color: pasteArmed ? "oklch(52% 0.16 258)" : "oklch(46% 0 0)",
                  textAlign: "center",
                  padding: "0 8px",
                  position: "relative",
                }}
              >
                {pasteArmed ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>Now paste!</div>
                    <div style={{ fontSize: 10.5, lineHeight: 1.35 }}>Ctrl/Cmd + V or right-click → Paste</div>
                    <div
                      ref={pasteZoneRef}
                      contentEditable
                      suppressContentEditableWarning
                      onPaste={handleTilePaste}
                      onInput={(ev) => {
                        (ev.target as HTMLElement).textContent = "";
                      }}
                      onClick={(ev) => ev.stopPropagation()}
                      style={{
                        position: "absolute",
                        inset: 0,
                        outline: "none",
                        color: "transparent",
                        caretColor: "transparent",
                        cursor: "pointer",
                      }}
                    />
                  </>
                ) : (
                  <>
                    <ClipboardIcon />
                    <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3 }}>Drop a cover or a book list</div>
                    <div onClick={triggerUpload} style={{ fontSize: 10.5, textDecoration: "underline", lineHeight: 1.3 }}>
                      browse files (image, CSV, Excel)
                    </div>
                  </>
                )}
              </div>
              <input
                type="file"
                accept="image/*,.csv,.tsv,.txt,.xlsx,.xls,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                ref={fileRef}
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />

              {/* Search box — drops to its own full-width row on narrow screens */}
              <div
                style={{
                  flex: "1 1 240px",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 8,
                  border: "1.5px solid oklch(89% 0 0)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  background: "oklch(100% 0 0)",
                }}
              >
                <div style={{ fontSize: 12.5, color: "oklch(46% 0 0)", fontWeight: 500 }}>Or search a title</div>
                <input
                  value={query}
                  onChange={handleQueryChange}
                  placeholder="e.g. Project Hail Mary"
                  style={{
                    border: "none",
                    outline: "none",
                    fontSize: 14.5,
                    fontFamily: "inherit",
                    color: "oklch(20% 0 0)",
                    background: "transparent",
                    width: "100%",
                  }}
                />

                {showSearchPanel && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      marginTop: 6,
                      background: "oklch(100% 0 0)",
                      border: "1.5px solid oklch(89% 0 0)",
                      borderRadius: 10,
                      boxShadow: "0 8px 24px oklch(0% 0 0 / 0.08)",
                      zIndex: 10,
                      overflow: "hidden",
                    }}
                  >
                    {searching && (
                      <div style={{ padding: "14px 16px", fontSize: 13, color: "oklch(50% 0 0)" }}>Searching…</div>
                    )}
                    {noMatches && (
                      <div style={{ padding: "14px 16px", fontSize: 13, color: "oklch(50% 0 0)" }}>
                        No matching books found. Check the spelling or try the author&apos;s name.
                      </div>
                    )}
                    {hasSearchResults &&
                      searchResults!.map((m, i) => (
                        <div
                          key={`${m.title}-${i}`}
                          onClick={() => addBookFromMatch(m)}
                          className="bre-search-row"
                          style={{
                            padding: "8px 16px",
                            cursor: "pointer",
                            borderTop: "1px solid oklch(93% 0 0)",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 26,
                              height: 38,
                              flex: "none",
                              borderRadius: 3,
                              backgroundColor: "oklch(90% 0 0)",
                              backgroundImage: m.coverUrl ? `url("${m.coverUrl}")` : "none",
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 600,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {m.title}
                            </div>
                            <div style={{ fontSize: 12.5, color: "oklch(50% 0 0)" }}>
                              {m.author} · {m.year ?? "—"}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {cameraError && (
              <div style={{ fontSize: 13, color: "oklch(52% 0.18 25)", marginBottom: 16 }}>{cameraError}</div>
            )}

            {(importing || importNote) && (
              <div
                style={{
                  fontSize: 13,
                  color: "oklch(45% 0.09 150)",
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {importing && (
                  <span
                    style={{
                      width: 13,
                      height: 13,
                      border: "2px solid oklch(80% 0.05 150)",
                      borderTopColor: "oklch(45% 0.13 150)",
                      borderRadius: "50%",
                      display: "inline-block",
                      animation: "bre-spin .7s linear infinite",
                    }}
                  />
                )}
                {importNote || "Reading your list…"}
              </div>
            )}

            {/* Shelf header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "oklch(46% 0 0)",
                    textTransform: "uppercase",
                    letterSpacing: ".04em",
                  }}
                >
                  {profileName ? `${profileName}’s bookshelf` : "Your books"}
                </div>
                {books.length > 0 && (
                  <span style={{ display: "inline-flex", gap: 12 }}>
                    <span
                      onClick={refreshCovers}
                      style={{ fontSize: 12, color: "oklch(55% 0 0)", cursor: "pointer", textDecoration: "underline" }}
                    >
                      {refreshingCovers ? "refreshing covers…" : "refresh covers"}
                    </span>
                    <span
                      onClick={clearShelf}
                      style={{ fontSize: 12, color: "oklch(55% 0 0)", cursor: "pointer", textDecoration: "underline" }}
                    >
                      clear shelf
                    </span>
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: validCount >= 5 ? "oklch(45% 0.13 150)" : "oklch(50% 0 0)",
                }}
              >
                {validCount} of 5 minimum
              </div>
            </div>

            {/* Shelf grid */}
            {books.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: 12,
                  marginBottom: 28,
                }}
              >
                {books.map((b) => {
                  const hasTitle = !b.needsTitle && !!b.title;
                  const initials = (b.title || "?").trim().slice(0, 2).toUpperCase() || "?";
                  return (
                    <div
                      key={b.id}
                      style={{
                        border: "1.5px solid oklch(89% 0 0)",
                        borderRadius: 10,
                        background: "oklch(100% 0 0)",
                        padding: 12,
                        display: "flex",
                        gap: 12,
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          width: 48,
                          height: 70,
                          flex: "none",
                          borderRadius: 5,
                          overflow: "hidden",
                          background: b.photo ? "transparent" : "oklch(55% 0.05 258)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          position: "relative",
                        }}
                      >
                        {b.photo ? (
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              backgroundImage: `url("${b.photo}")`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: 13, fontWeight: 700, color: "oklch(100% 0 0)" }}>{initials}</span>
                        )}
                        {b.identifying && (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              background: "oklch(0% 0 0 / 0.45)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <div
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: "50%",
                                border: "2.5px solid oklch(100% 0 0 / 0.35)",
                                borderTopColor: "oklch(100% 0 0)",
                                animation: "bre-spin .8s linear infinite",
                              }}
                            />
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {b.needsTitle ? (
                          <input
                            value={b.title}
                            onChange={(e) => updateBookDraft(b.id, e.target.value)}
                            placeholder="Type the title..."
                            style={{
                              width: "100%",
                              border: "none",
                              borderBottom: "1.5px solid oklch(80% 0 0)",
                              outline: "none",
                              fontSize: 13,
                              fontFamily: "inherit",
                              paddingBottom: 2,
                              background: "transparent",
                            }}
                          />
                        ) : (
                          <>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 600,
                                lineHeight: 1.3,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                display: "-webkit-box",
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: "vertical",
                                paddingRight: 14,
                              }}
                            >
                              {b.title}
                            </div>
                            <div style={{ fontSize: 12.5, color: "oklch(50% 0 0)", marginTop: 3 }}>
                              {b.author || (b.identifying ? "Identifying…" : "")}
                            </div>
                          </>
                        )}
                      </div>
                      <div
                        onClick={() => removeBook(b.id)}
                        className="bre-remove"
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          color: "oklch(55% 0 0)",
                          cursor: "pointer",
                          background: "oklch(96% 0 0)",
                        }}
                      >
                        ×
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => setStep(2)}
              disabled={continueDisabled}
              style={{
                border: "none",
                background: continueDisabled ? "oklch(85% 0 0)" : "oklch(20% 0 0)",
                color: "oklch(100% 0 0)",
                fontSize: 15,
                fontWeight: 600,
                padding: "13px 22px",
                borderRadius: 9,
                cursor: continueDisabled ? "not-allowed" : "pointer",
                width: "100%",
              }}
            >
              Continue
            </button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div style={{ animation: "bre-fade .3s ease" }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-.01em" }}>
              Fine-tune your picks
            </h1>
            <p style={{ fontSize: 15, color: "oklch(46% 0 0)", margin: "0 0 28px", lineHeight: 1.5 }}>
              Set how recent, the mood, and how adventurous you&apos;d like your recommendations — all optional except the date range.
            </p>

            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "oklch(46% 0 0)",
                textTransform: "uppercase",
                letterSpacing: ".04em",
                marginBottom: 10,
              }}
            >
              How recent?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
              {recencyOptions.map((o) => {
                const selected = recency === o.id;
                return (
                  <div
                    key={o.id}
                    onClick={() => setRecency(o.id)}
                    style={{
                      border: `1.5px solid ${selected ? "oklch(52% 0.16 258)" : "oklch(89% 0 0)"}`,
                      background: selected ? "oklch(96% 0.02 258)" : "oklch(100% 0 0)",
                      borderRadius: 10,
                      padding: "16px 18px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "all .15s",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 15.5,
                          fontWeight: 600,
                          color: selected ? "oklch(30% 0.05 258)" : "oklch(20% 0 0)",
                        }}
                      >
                        {o.title}
                      </div>
                      <div style={{ fontSize: 13, color: "oklch(50% 0 0)", marginTop: 3 }}>{o.desc}</div>
                    </div>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        border: `1.5px solid ${selected ? "oklch(52% 0.16 258)" : "oklch(80% 0 0)"}`,
                        flex: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {selected && (
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "oklch(52% 0.16 258)" }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mood / vibe */}
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "oklch(46% 0 0)",
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                  marginBottom: 10,
                }}
              >
                In the mood for?{" "}
                <span style={{ textTransform: "none", fontWeight: 500, color: "oklch(60% 0 0)" }}>
                  optional
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {MOOD_CHIPS.map((m) => {
                  const on = mood.includes(m);
                  return (
                    <button
                      key={m}
                      onClick={() => toggleMood(m)}
                      style={{
                        border: `1.5px solid ${on ? "oklch(52% 0.16 258)" : "oklch(87% 0 0)"}`,
                        background: on ? "oklch(96% 0.02 258)" : "oklch(100% 0 0)",
                        color: on ? "oklch(42% 0.16 258)" : "oklch(35% 0 0)",
                        fontSize: 13,
                        fontWeight: on ? 600 : 500,
                        padding: "7px 13px",
                        borderRadius: 999,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all .15s",
                      }}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
              <input
                value={moodText}
                onChange={(e) => setMoodText(e.target.value)}
                placeholder="Anything specific? e.g. set in Japan, like a warm hug"
                style={{
                  width: "100%",
                  border: "1.5px solid oklch(89% 0 0)",
                  borderRadius: 10,
                  padding: "11px 14px",
                  fontSize: 14,
                  fontFamily: "inherit",
                  outline: "none",
                  background: "oklch(100% 0 0)",
                  color: "oklch(20% 0 0)",
                }}
              />
            </div>

            {/* Adventurousness */}
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "oklch(46% 0 0)",
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                  marginBottom: 10,
                }}
              >
                How adventurous?
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {ADVENTURE_OPTS.map((o) => {
                  const on = adventurousness === o.id;
                  return (
                    <button
                      key={o.id}
                      onClick={() => setAdventurousness(o.id)}
                      style={{
                        flex: 1,
                        border: `1.5px solid ${on ? "oklch(52% 0.16 258)" : "oklch(89% 0 0)"}`,
                        background: on ? "oklch(96% 0.02 258)" : "oklch(100% 0 0)",
                        borderRadius: 10,
                        padding: "12px 8px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "center",
                        transition: "all .15s",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: on ? "oklch(30% 0.05 258)" : "oklch(20% 0 0)",
                        }}
                      >
                        {o.label}
                      </div>
                      <div style={{ fontSize: 12, color: "oklch(50% 0 0)", marginTop: 2 }}>{o.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Taste profile (optional) */}
            <div style={{ marginBottom: 32 }}>
              {!profileLoaded ? (
                <span
                  onClick={loadProfile}
                  style={{
                    fontSize: 13,
                    color: "oklch(52% 0.16 258)",
                    cursor: profileLoading ? "default" : "pointer",
                    textDecoration: profileLoading ? "none" : "underline",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {profileLoading && (
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: "2px solid oklch(80% 0 0)",
                        borderTopColor: "oklch(52% 0.16 258)",
                        animation: "bre-spin .8s linear infinite",
                      }}
                    />
                  )}
                  {profileLoading ? "Reading your taste…" : "Preview my taste profile (optional)"}
                </span>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "oklch(46% 0 0)",
                      textTransform: "uppercase",
                      letterSpacing: ".04em",
                      marginBottom: 10,
                    }}
                  >
                    Your taste profile{" "}
                    <span style={{ textTransform: "none", fontWeight: 500, color: "oklch(60% 0 0)" }}>
                      tap to remove · add more below
                    </span>
                  </div>

                  {profileTags.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                      {profileTags.map((t) => (
                        <button
                          key={t}
                          onClick={() => setProfileTags((s) => s.filter((x) => x !== t))}
                          style={{
                            border: "1.5px solid oklch(52% 0.16 258)",
                            background: "oklch(96% 0.02 258)",
                            color: "oklch(42% 0.16 258)",
                            fontSize: 13,
                            fontWeight: 500,
                            padding: "6px 12px",
                            borderRadius: 999,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          {t}
                          <span style={{ fontSize: 12, opacity: 0.7 }}>✕</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={{ fontSize: 12.5, color: "oklch(55% 0 0)", marginBottom: 8 }}>
                    Add more:
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {TASTE_OPTIONS.filter((t) => !profileTags.includes(t)).map((t) => (
                      <button
                        key={t}
                        onClick={() => addProfileTag(t)}
                        className="bre-chip"
                        style={{
                          border: "1.5px solid oklch(87% 0 0)",
                          background: "oklch(100% 0 0)",
                          color: "oklch(40% 0 0)",
                          fontSize: 13,
                          fontWeight: 500,
                          padding: "6px 12px",
                          borderRadius: 999,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        + {t}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={submitProfileDraft} style={{ display: "flex", gap: 8 }}>
                    <input
                      value={profileDraft}
                      onChange={(e) => setProfileDraft(e.target.value)}
                      placeholder="Add your own… e.g. space opera, cli-fi"
                      style={{
                        flex: 1,
                        border: "1.5px solid oklch(89% 0 0)",
                        borderRadius: 8,
                        padding: "9px 12px",
                        fontSize: 13.5,
                        fontFamily: "inherit",
                        outline: "none",
                        background: "oklch(100% 0 0)",
                        color: "oklch(20% 0 0)",
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        border: "none",
                        background: "oklch(20% 0 0)",
                        color: "oklch(100% 0 0)",
                        fontSize: 13,
                        fontWeight: 600,
                        padding: "0 16px",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Add
                    </button>
                  </form>
                </>
              )}
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  border: "1.5px solid oklch(85% 0 0)",
                  background: "oklch(100% 0 0)",
                  color: "oklch(30% 0 0)",
                  fontSize: 15,
                  fontWeight: 600,
                  padding: "13px 22px",
                  borderRadius: 9,
                  cursor: "pointer",
                }}
              >
                Back
              </button>
              <button
                onClick={() => generate()}
                disabled={!recency}
                style={{
                  flex: 1,
                  border: "none",
                  background: !recency ? "oklch(85% 0 0)" : "oklch(20% 0 0)",
                  color: "oklch(100% 0 0)",
                  fontSize: 15,
                  fontWeight: 600,
                  padding: "13px 22px",
                  borderRadius: 9,
                  cursor: !recency ? "not-allowed" : "pointer",
                }}
              >
                Get my recommendations
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "100px 0",
              animation: "bre-fade .3s ease",
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                border: "3px solid oklch(90% 0 0)",
                borderTopColor: "oklch(52% 0.16 258)",
                animation: "bre-spin .8s linear infinite",
                marginBottom: 20,
              }}
            />
            <div style={{ fontSize: 15, color: "oklch(46% 0 0)" }}>Reading between the lines of your shelf...</div>
          </div>
        )}

        {/* Error */}
        {hasRecError && (
          <div style={{ textAlign: "center", padding: "60px 0", animation: "bre-fade .3s ease" }}>
            <div style={{ fontSize: 15, color: "oklch(52% 0.18 25)", marginBottom: 20, lineHeight: 1.5, maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>
              {recError}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => {
                  setRecError(null);
                  setStep(2);
                }}
                style={{
                  border: "1.5px solid oklch(85% 0 0)",
                  background: "oklch(100% 0 0)",
                  color: "oklch(30% 0 0)",
                  fontSize: 14,
                  fontWeight: 600,
                  padding: "11px 20px",
                  borderRadius: 9,
                  cursor: "pointer",
                }}
              >
                Change window
              </button>
              <button
                onClick={() => generate()}
                style={{
                  border: "none",
                  background: "oklch(20% 0 0)",
                  color: "oklch(100% 0 0)",
                  fontSize: 14,
                  fontWeight: 600,
                  padding: "11px 20px",
                  borderRadius: 9,
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: results */}
        {step === 4 && (
          <div style={{ animation: "bre-fade .3s ease" }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-.01em" }}>
              Your next 5 books
            </h1>
            <p style={{ fontSize: 15, color: "oklch(46% 0 0)", margin: "0 0 16px", lineHeight: 1.5 }}>
              {recencySummary}, based on the {inputBookCount} books you shared.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <button
                onClick={refreshPicks}
                disabled={refreshing || loadingMore}
                style={{
                  border: "1.5px solid oklch(85% 0 0)",
                  background: "oklch(100% 0 0)",
                  color: refreshing ? "oklch(55% 0 0)" : "oklch(30% 0 0)",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: 999,
                  cursor: refreshing ? "default" : "pointer",
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {refreshing && (
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      border: "2px solid oklch(80% 0 0)",
                      borderTopColor: "oklch(52% 0.16 258)",
                      animation: "bre-spin .8s linear infinite",
                    }}
                  />
                )}
                {refreshing ? "Pulling a fresh set…" : "↻ Refresh — a whole new set"}
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 32 }}>
              {results.map((rec, i) => (
                <div
                  key={`${rec.title}-${i}`}
                  style={{
                    border: "1.5px solid oklch(89% 0 0)",
                    borderRadius: 12,
                    background: "oklch(100% 0 0)",
                    padding: 18,
                    display: "flex",
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 82,
                      flex: "none",
                      borderRadius: 6,
                      overflow: "hidden",
                      background: STRIPE_COLORS[i % STRIPE_COLORS.length],
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {rec.coverUrl ? (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          backgroundImage: `url("${rec.coverUrl}")`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          fontFamily: "ui-monospace, Menlo, monospace",
                          fontSize: 9,
                          color: "oklch(100% 0 0 / 0.85)",
                          letterSpacing: ".02em",
                        }}
                      >
                        cover
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 16.5, fontWeight: 700 }}>{rec.title}</div>
                      <div style={{ fontSize: 12.5, color: "oklch(55% 0 0)", flex: "none" }}>{rec.year ?? ""}</div>
                    </div>
                    <div style={{ fontSize: 13.5, color: "oklch(46% 0 0)", marginTop: 2 }}>{rec.author}</div>
                    {rec.lists.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {[...rec.lists]
                          .sort((a, b) => BADGE_ORDER.indexOf(a) - BADGE_ORDER.indexOf(b))
                          .map((l) => {
                            const meta = BADGE_META[l] || { label: l, tier: "list" as const, url: "" };
                            const prize = meta.tier === "prize";
                            return (
                              <a
                                key={l}
                                href={meta.url || undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`See the full ${meta.label} list →`}
                                style={{
                                  fontSize: 11,
                                  fontWeight: prize ? 700 : 600,
                                  letterSpacing: ".02em",
                                  padding: "3px 9px",
                                  borderRadius: 999,
                                  background: prize ? "oklch(90% 0.07 90)" : "oklch(94% 0.03 90)",
                                  color: prize ? "oklch(38% 0.11 70)" : "oklch(45% 0.09 70)",
                                  border: prize ? "1px solid oklch(80% 0.09 80)" : "1px solid transparent",
                                  textDecoration: "none",
                                  cursor: meta.url ? "pointer" : "default",
                                }}
                              >
                                {prize ? "★ " : ""}
                                {meta.label}
                              </a>
                            );
                          })}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: ".07em",
                        textTransform: "uppercase",
                        color: "oklch(58% 0.06 70)",
                        marginTop: 12,
                      }}
                    >
                      Bookseller&apos;s note
                    </div>
                    <div
                      style={{
                        fontSize: 13.5,
                        color: "oklch(33% 0 0)",
                        marginTop: 3,
                        lineHeight: 1.55,
                        fontStyle: "italic",
                      }}
                    >
                      {rec.why}
                    </div>
                    <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                      <a
                        href={rec.amazonUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600 }}
                      >
                        View on Amazon
                        <ExternalLinkIcon />
                      </a>
                      <a
                        href={rec.goodreadsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600 }}
                      >
                        Goodreads reviews
                        <ExternalLinkIcon />
                      </a>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                      {(() => {
                        const liked = likedTitles.includes(rec.title);
                        return (
                          <button
                            onClick={() => thumbUp(rec)}
                            title="I like this pick"
                            aria-label="I like this pick"
                            style={{
                              width: 34,
                              height: 30,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: `1.5px solid ${liked ? "oklch(52% 0.16 258)" : "oklch(87% 0 0)"}`,
                              background: liked ? "oklch(96% 0.02 258)" : "oklch(100% 0 0)",
                              color: liked ? "oklch(52% 0.16 258)" : "oklch(50% 0 0)",
                              borderRadius: 7,
                              cursor: "pointer",
                            }}
                          >
                            <ThumbsUpIcon />
                          </button>
                        );
                      })()}
                      <button
                        onClick={() => thumbDown(rec)}
                        title="Don't show this again"
                        aria-label="Don't show this again"
                        className="bre-thumbdown"
                        style={{
                          width: 34,
                          height: 30,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1.5px solid oklch(87% 0 0)",
                          background: "oklch(100% 0 0)",
                          color: "oklch(50% 0 0)",
                          borderRadius: 7,
                          cursor: "pointer",
                        }}
                      >
                        <ThumbsDownIcon />
                      </button>
                      <div style={{ width: 1, height: 20, background: "oklch(90% 0 0)", margin: "0 2px" }} />
                      {(() => {
                        const added = addedTitles.includes(rec.title) || isDuplicate(rec.title);
                        return (
                          <button
                            onClick={() => addToShelf(rec)}
                            disabled={added}
                            style={{
                              border: `1.5px solid ${added ? "oklch(45% 0.13 150)" : "oklch(52% 0.16 258)"}`,
                              background: "oklch(100% 0 0)",
                              color: added ? "oklch(45% 0.13 150)" : "oklch(52% 0.16 258)",
                              fontSize: 12.5,
                              fontWeight: 600,
                              padding: "6px 12px",
                              borderRadius: 7,
                              cursor: added ? "default" : "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {added ? "✓ On your shelf" : "+ Add to shelf"}
                          </button>
                        );
                      })()}
                      {(() => {
                        const wished = isWished(rec.title);
                        return (
                          <button
                            onClick={() => addToWishlist(rec)}
                            disabled={wished}
                            style={{
                              border: `1.5px solid ${wished ? "oklch(52% 0.16 258)" : "oklch(87% 0 0)"}`,
                              background: wished ? "oklch(96% 0.02 258)" : "oklch(100% 0 0)",
                              color: wished ? "oklch(42% 0.16 258)" : "oklch(35% 0 0)",
                              fontSize: 12.5,
                              fontWeight: 600,
                              padding: "6px 12px",
                              borderRadius: 7,
                              cursor: wished ? "default" : "pointer",
                              fontFamily: "inherit",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                            }}
                          >
                            {wished ? "♥ On reading list" : "♡ Reading list"}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {moreError && (
              <div style={{ fontSize: 13, color: "oklch(52% 0.18 25)", marginBottom: 14, lineHeight: 1.5 }}>
                {moreError}
              </div>
            )}
            <button
              onClick={() => loadMore()}
              disabled={loadingMore}
              style={{
                border: "1.5px solid oklch(85% 0 0)",
                background: "oklch(100% 0 0)",
                color: loadingMore ? "oklch(55% 0 0)" : "oklch(30% 0 0)",
                fontSize: 14.5,
                fontWeight: 600,
                padding: "12px 20px",
                borderRadius: 9,
                cursor: loadingMore ? "default" : "pointer",
                width: "100%",
                marginBottom: 24,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              {loadingMore && (
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    border: "2.5px solid oklch(80% 0 0)",
                    borderTopColor: "oklch(52% 0.16 258)",
                    animation: "bre-spin .8s linear infinite",
                  }}
                />
              )}
              {loadingMore ? "Finding more…" : "Show me more picks"}
            </button>

            <div style={{ borderTop: "1.5px solid oklch(91% 0 0)", paddingTop: 20, marginBottom: 24 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "oklch(46% 0 0)",
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                  marginBottom: 10,
                }}
              >
                Or add more by category
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {genreChips.map((label) => (
                  <button
                    key={label}
                    onClick={() => loadMore(label)}
                    disabled={loadingMore}
                    className="bre-chip"
                    style={{
                      border: "1.5px solid oklch(87% 0 0)",
                      background: "oklch(100% 0 0)",
                      color: "oklch(35% 0 0)",
                      fontSize: 13,
                      fontWeight: 500,
                      padding: "8px 14px",
                      borderRadius: 999,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setStep(2)}
                style={{
                  flex: 1,
                  border: "1.5px solid oklch(85% 0 0)",
                  background: "oklch(100% 0 0)",
                  color: "oklch(30% 0 0)",
                  fontSize: 14.5,
                  fontWeight: 600,
                  padding: "12px 20px",
                  borderRadius: 9,
                  cursor: "pointer",
                }}
              >
                ← Back to options
              </button>
              <button
                onClick={restart}
                style={{
                  flex: 1,
                  border: "1.5px solid oklch(85% 0 0)",
                  background: "oklch(100% 0 0)",
                  color: "oklch(30% 0 0)",
                  fontSize: 14.5,
                  fontWeight: 600,
                  padding: "12px 20px",
                  borderRadius: 9,
                  cursor: "pointer",
                }}
              >
                Start over
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: "oklch(55% 0 0)", textAlign: "center", margin: "10px 0 0" }}>
              &ldquo;Back to options&rdquo; keeps your picks so you can adjust recency or mood &middot; &ldquo;Start over&rdquo; returns to your shelf. Your books are always kept.
            </p>
          </div>
        )}
      </div>

      {/* Camera modal */}
      {cameraOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "oklch(0% 0 0 / 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            animation: "bre-fade .2s ease",
          }}
        >
          <div
            style={{
              background: "oklch(12% 0 0)",
              borderRadius: 16,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              width: "min(90vw, 480px)",
            }}
          >
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: "oklch(95% 0 0)", fontSize: 14, fontWeight: 600 }}>Photograph a book cover</div>
              <div onClick={closeCamera} style={{ color: "oklch(75% 0 0)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>
                ×
              </div>
            </div>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{ width: "100%", borderRadius: 10, background: "#000", maxHeight: "60vh", objectFit: "cover" }}
            />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            <button
              onClick={capturePhoto}
              disabled={identifying}
              style={{
                border: "none",
                background: "oklch(100% 0 0)",
                color: "oklch(15% 0 0)",
                fontSize: 14,
                fontWeight: 700,
                padding: "12px 26px",
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              {identifying ? "Identifying…" : "Capture"}
            </button>
          </div>
        </div>
      )}

      {/* Full-page drop overlay — clear feedback that a drag is being accepted */}
      {dragActive && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "oklch(52% 0.16 258 / 0.10)",
            backdropFilter: "blur(1px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 40,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              border: "2.5px dashed oklch(52% 0.16 258)",
              borderRadius: 16,
              background: "oklch(100% 0 0 / 0.9)",
              color: "oklch(42% 0.16 258)",
              fontSize: 16,
              fontWeight: 600,
              padding: "28px 40px",
            }}
          >
            Drop the cover to add it
          </div>
        </div>
      )}

      {/* Wish list modal */}
      {wishlistOpen && (
        <div
          onClick={() => setWishlistOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "oklch(0% 0 0 / 0.5)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            zIndex: 60,
            padding: "clamp(20px, 7vw, 56px) clamp(14px, 4vw, 24px)",
            overflowY: "auto",
            animation: "bre-fade .2s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "oklch(100% 0 0)",
              borderRadius: 14,
              width: "100%",
              maxWidth: 560,
              boxShadow: "0 12px 40px oklch(0% 0 0 / 0.18)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 20px",
                borderBottom: "1.5px solid oklch(91% 0 0)",
              }}
            >
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{readingListTitle}</div>
                <div style={{ fontSize: 12.5, color: "oklch(55% 0 0)", marginTop: 2 }}>
                  {profileName
                    ? `Saved to ${profileName}'s account`
                    : "Saved in this browser — sign in to keep it across devices"}
                </div>
              </div>
              <div
                onClick={() => setWishlistOpen(false)}
                style={{ cursor: "pointer", fontSize: 22, color: "oklch(55% 0 0)", lineHeight: 1 }}
              >
                ×
              </div>
            </div>

            <div style={{ padding: wishlist.length ? "0" : "44px 24px" }}>
              {wishlist.length === 0 ? (
                <div style={{ textAlign: "center", color: "oklch(50% 0 0)", fontSize: 14, lineHeight: 1.6 }}>
                  Nothing here yet. On your results, tap{" "}
                  <strong style={{ color: "oklch(42% 0.16 258)" }}>♡ Reading list</strong> on any book to
                  save it for later.
                </div>
              ) : (
                wishlist.map((w, i) => (
                  <div
                    key={`${w.title}-${i}`}
                    style={{
                      display: "flex",
                      gap: 14,
                      padding: "14px 20px",
                      borderTop: i > 0 ? "1px solid oklch(94% 0 0)" : "none",
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 64,
                        flex: "none",
                        borderRadius: 5,
                        overflow: "hidden",
                        background: w.coverUrl ? "transparent" : "oklch(55% 0.05 258)",
                        backgroundImage: w.coverUrl ? `url("${w.coverUrl}")` : "none",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {!w.coverUrl && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: "oklch(100% 0 0)" }}>
                          {(w.title || "?").slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{w.title}</div>
                      <div style={{ fontSize: 13, color: "oklch(46% 0 0)", marginTop: 1 }}>
                        {w.author}
                        {w.year ? ` · ${w.year}` : ""}
                      </div>
                      {w.lists && w.lists.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                          {[...w.lists]
                            .sort((a, b) => BADGE_ORDER.indexOf(a) - BADGE_ORDER.indexOf(b))
                            .slice(0, 3)
                            .map((l) => {
                              const meta = BADGE_META[l] || { label: l, tier: "list" as const, url: "" };
                              const prize = meta.tier === "prize";
                              return (
                                <a
                                  key={l}
                                  href={meta.url || undefined}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={`See the full ${meta.label} list →`}
                                  style={{
                                    fontSize: 10.5,
                                    fontWeight: prize ? 700 : 600,
                                    padding: "2px 7px",
                                    borderRadius: 999,
                                    background: prize ? "oklch(90% 0.07 90)" : "oklch(94% 0.03 90)",
                                    color: prize ? "oklch(38% 0.11 70)" : "oklch(45% 0.09 70)",
                                    textDecoration: "none",
                                    cursor: meta.url ? "pointer" : "default",
                                  }}
                                >
                                  {prize ? "★ " : ""}
                                  {meta.label}
                                </a>
                              );
                            })}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                        <a
                          href={w.amazonUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          Buy on Amazon
                          <ExternalLinkIcon />
                        </a>
                        <a
                          href={w.goodreadsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          Goodreads
                          <ExternalLinkIcon />
                        </a>
                      </div>
                    </div>
                    <div
                      onClick={() => removeFromWishlist(w.title)}
                      className="bre-remove"
                      title="Remove from reading list"
                      style={{
                        width: 20,
                        height: 20,
                        flex: "none",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        color: "oklch(55% 0 0)",
                        cursor: "pointer",
                        background: "oklch(96% 0 0)",
                        alignSelf: "flex-start",
                      }}
                    >
                      ×
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Subtitle-tolerant title equality, for de-duping vision results.
function sameTitle(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.startsWith(nb) || nb.startsWith(na);
}
