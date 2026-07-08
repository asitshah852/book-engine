# Deploying the Book Recommendation Engine — FREE tier

This puts the app online for **$0/month** using:

- **Vercel** — free hosting, made for Next.js apps
- **Upstash Redis** — a free little database that keeps everyone's shelves,
  reading lists, and "not interested" lists (Vercel has no saved disk, so data
  needs to live in a database)

Asit's account (37 books + reading list) is **seeded in automatically** — sign
in as "Asit" on the live site and it's all there.

Friends just visit the URL — they never need a Claude account or a key. Your one
Anthropic key powers everyone, and you pay only for that usage (cents per action;
set a cap — see the end).

> Everything below is free. The only thing that costs money is Anthropic usage,
> which you control with a spending limit.

---

## Accounts you'll create (all free)

1. **GitHub** — https://github.com  (stores the code)
2. **Vercel** — https://vercel.com  (runs the app) — sign in *with GitHub*
3. **Upstash** — https://upstash.com  (the free database) — sign in *with GitHub*
4. **Anthropic** — https://console.anthropic.com  (your key — you have this)

---

## Step 1 — Put the code on GitHub

In a terminal, from this folder (`book-recommendation-engine`):

```bash
git init
git add .
git commit -m "Book recommendation engine"
```

On GitHub: **New repository** → name it (e.g. `book-engine`) → **Create**. Copy the
"push an existing repository" lines it shows, e.g.:

```bash
git remote add origin https://github.com/<your-username>/book-engine.git
git branch -M main
git push -u origin main
```

---

## Step 2 — Create the free database (Upstash)

1. Go to https://upstash.com → **Sign in with GitHub**.
2. **Create Database** → give it a name → pick a region near you → **Create**.
   (The free plan is selected by default.)
3. On the database page, find the **REST API** section and copy these two values —
   you'll paste them into Vercel next:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

---

## Step 3 — Deploy on Vercel

1. Go to https://vercel.com → **Sign in with GitHub**.
2. **Add New… → Project** → **Import** your `book-engine` repo.
3. Vercel auto-detects Next.js — leave the build settings as-is.
4. Open **Environment Variables** and add these (Name → Value):
   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your key from console.anthropic.com |
   | `SESSION_SECRET` | any long random string (mash the keyboard) |
   | `UPSTASH_REDIS_REST_URL` | the URL from Step 2 |
   | `UPSTASH_REDIS_REST_TOKEN` | the token from Step 2 |
   | `ANTHROPIC_MODEL` | `claude-opus-4-8` (optional) |
5. Click **Deploy**. First build takes ~2–3 minutes.

You'll get a URL like `https://book-engine.vercel.app` — that's what you share.
Sign in as **Asit** and your books are already there.

---

## Step 4 — Cap your Anthropic spending (do this once)

Because the app is public and runs on your key:

- In **console.anthropic.com → Billing / Limits**, set a **monthly usage limit**
  (e.g. $10–20). It can never exceed that.
- Glance at usage the first few days after sharing.

---

## Updating the app later

Make changes, then:

```bash
git add .
git commit -m "what changed"
git push
```

Vercel redeploys automatically. The database (everyone's data) is untouched.

---

## Cancelling / walking away — all free, nothing to cancel

- Vercel and Upstash free tiers have **no bill** — there's literally nothing to
  cancel. You can delete the Vercel project and the Upstash database anytime with
  a click, or just leave them.
- The only spend is Anthropic usage, which stops the moment people stop using it
  (and is capped by your limit).
- Your data is also backed up in the two CSV files on your Desktop, and Asit's
  account is seeded into the app itself — so nothing is ever lost.

## Good to know

- **Free-tier limits** are generous for a group of friends (Upstash free allows
  plenty of daily operations; Vercel free covers normal personal traffic). If the
  app really takes off, both offer cheap paid tiers — but you'd only hit that with
  real popularity.
- **Privacy:** sign-in is name-only for now — anyone who types "Asit" sees that
  shelf. Fine among trusted friends; tell me when you want real per-person login.
- **Speed:** the very first request after a quiet period may be a little slow
  (the free server "waking up"); after that it's snappy.
