# Book Recommendation Engine

A production web app that gives readers **5 verified, taste-matched book
recommendations** based on a shelf of 5+ books they've loved. Built with
Next.js (App Router) + React + TypeScript, with all LLM and catalog work done
server-side.

This is a production recreation of the design handoff in
`../Book Recommendation Engine.dc.html`. The UI is high-fidelity to that
reference; the backend implements the verification pipeline the prototype could
only approximate client-side.

## The core principle: never trust the LLM for facts

Raw LLM output invents books, reviews, and list placements. Here the model is
used **only** as a taste-matching / interpretation engine. Everything factual is
grounded in real data:

1. **Search** — queries a real catalog (Google Books → Open Library). If nothing
   matches, the LLM is asked what real book the reader *probably meant* (typos,
   descriptions), then the catalog is re-queried. Only catalog-verified books are
   selectable. (`src/lib/catalog.ts`, `src/app/api/search`)
2. **Recommendations** — the LLM proposes 10 candidates; each is verified against
   the catalog, filtered by the recency cutoff (enforced twice), and only the top
   5 survivors are returned. (`src/app/api/recommend`)
3. **Editorial badges** — the LLM's claimed NYT/FT/Economist placements are
   **only** honored when the book appears in a maintained dataset
   (`data/editorial-lists.json`). (`src/lib/editorial.ts`)
4. **Covers** — strict title+author matching (≥70% of significant title words AND
   the author surname). A possibly-wrong cover is never shown; the neutral
   placeholder is used instead. (`src/lib/catalog.ts`)
5. **Cover-photo identification** — vision identifies the book, then the result is
   grounded against the catalog. (`src/app/api/identify`)

## Getting started

```bash
cd book-recommendation-engine
npm install
cp .env.example .env.local     # then fill in ANTHROPIC_API_KEY + SESSION_SECRET
npm run dev                     # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

### Environment

| Variable                | Required | Purpose                                                        |
| ----------------------- | -------- | -------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`     | yes      | Recommendations, cover-photo vision, typo/description rescue.  |
| `SESSION_SECRET`        | yes      | Signs the session cookie.                                      |
| `ANTHROPIC_MODEL`       | no       | Defaults to `claude-opus-4-8`.                                 |
| `GOOGLE_BOOKS_API_KEY`  | no       | Higher Google Books quota; falls back to Open Library.         |
| `AMAZON_AFFILIATE_TAG`  | no       | Appended to Amazon product links.                              |

Without `ANTHROPIC_API_KEY`, catalog search still works (no typo rescue) and the
recommend/identify endpoints degrade gracefully.

## Architecture

```
src/
  app/
    page.tsx, layout.tsx, globals.css   # shell + design tokens
    api/
      search/      GET   catalog search + LLM typo rescue
      recommend/   POST  LLM candidates → verify → recency → covers → badges → top 5
      identify/    POST  vision cover ID → catalog grounding
      cover/       GET   strict-matched cover art (shelf backfill / refresh)
      auth/        me · signin · signout      (name-only accounts, signed cookie)
      shelf/       GET/PUT server-side shelf persistence
  components/
    BookEngine.tsx    the full wizard (client) — ports every prototype rule
    icons.tsx
  lib/
    catalog.ts   Google Books + Open Library + iTunes, strict cover matcher
    anthropic.ts server-side Claude calls (identify, rescue, candidates)
    editorial.ts editorial-list verification against maintained data
    repo.ts      accounts + shelves (file-backed; swap for a real DB)
    session.ts   signed httpOnly session cookie
    types.ts, config.ts
data/
  editorial-lists.json   operator-maintained list membership (sample data)
  store.json             file-backed accounts/shelves (gitignored, created at runtime)
```

## Production notes / where to take it next

The following are deliberately pragmatic so the app runs with zero external
infrastructure. Each is isolated for a clean upgrade:

- **Accounts** — name-only sign-in (prototype stopgap) with a signed, server-side
  session cookie and server-stored shelves. `src/lib/session.ts` and `repo.ts`
  are structured to swap in passwordless/magic-link auth and a real database
  (Postgres/SQLite) without touching the UI.
- **Editorial lists** — badges are driven entirely by `data/editorial-lists.json`
  (seeded with real NYT selections as a sample). Replace with licensed feeds: NYT
  Books API, FT/Economist year-end lists.
- **Ratings** — Google Books `averageRating` is used as a ranking signal only,
  never asserted in the UI. Wire in Amazon PA-API / licensed ratings for display.
- **Product links** — Amazon search links with an optional affiliate tag; upgrade
  to PA-API for real ASIN product pages.
- **Persistence** — file-backed JSON store behind `repo.ts`. Replace with a DB for
  multi-instance deployments.
