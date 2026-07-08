# Deploying the Book Recommendation Engine (public, shared with friends)

This guide gets the app onto the public internet with a **saved disk** (so
accounts, shelves, reading lists, and "not interested" lists persist) and with
**Asit's account already loaded** (seeded from `data/seed-store.json`).

Friends just visit the URL — they never need a Claude account or an API key.
Your one Anthropic key (set as an env var below) powers everyone's requests, and
you pay for that usage.

---

## Before you start — 3 accounts (all free to sign up)

1. **GitHub** — https://github.com  (stores the code)
2. **Render** — https://render.com  (runs the app; the persistent disk is a
   paid add-on, ~US$7/mo — see the cost note at the end)
3. **Anthropic API** — https://console.anthropic.com  (you already have a key)

> Render is recommended because its dashboard is the most click-friendly.
> Railway (https://railway.app) works too — same idea, a "Volume" instead of a
> "Disk".

---

## Step 1 — Put the code on GitHub

From this folder (`book-recommendation-engine`), in a terminal:

```bash
git init
git add .
git commit -m "Book recommendation engine"
```

Then on GitHub: **New repository** → give it a name (e.g. `book-engine`) → **Create**.
GitHub shows a "push an existing repository" box — copy those two lines and run
them, e.g.:

```bash
git remote add origin https://github.com/<your-username>/book-engine.git
git branch -M main
git push -u origin main
```

(You may be asked to sign in to GitHub in the browser the first time.)

---

## Step 2 — Create the web service on Render

1. Render dashboard → **New +** → **Web Service**.
2. **Connect** your GitHub and pick the `book-engine` repo.
3. Fill in:
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** Starter (needed for a disk)
4. Click **Advanced → Add Environment Variable** and add:
   | Key | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your key from console.anthropic.com |
   | `SESSION_SECRET` | any long random string (mash the keyboard) |
   | `DATA_DIR` | `/var/data` |
   | `ANTHROPIC_MODEL` | `claude-opus-4-8` (optional) |
5. Still under Advanced → **Add Disk**:
   - **Name:** `data`
   - **Mount Path:** `/var/data`
   - **Size:** 1 GB is plenty
6. **Create Web Service**. Render builds and deploys (first build ~2–4 min).

When it's live you get a URL like `https://book-engine.onrender.com` — that's
what you share with friends. Sign in as **Asit** and your 37 books + reading
list are already there.

---

## Step 3 — Cap your spending (do this once)

Because the app is public and runs on your key:

- In **console.anthropic.com → Billing / Limits**, set a **monthly usage
  limit** (e.g. $10–20) so it can never surprise you.
- Keep an eye on usage the first few days after sharing.

---

## Updating the app later

Make changes, then:

```bash
git add .
git commit -m "what changed"
git push
```

Render redeploys automatically. The disk (and everyone's data) is untouched by
deploys.

---

## Good to know

- **Data safety:** everything lives on the `/var/data` disk, which survives
  restarts and redeploys. Take an occasional backup by downloading
  `/var/data/store.json` from Render's shell, or ask me to add an in-app export.
- **Privacy:** sign-in is name-only for now — anyone who types "Asit" sees that
  shelf. Fine among trusted friends; tell me when you want real per-person login.
- **Cost:** the app itself is cheap to run. The two costs are (1) Render's
  Starter instance + 1 GB disk (~US$7/mo total) and (2) Anthropic usage (cents
  per action, capped by the limit you set in Step 3).
- **Free alternative:** if you'd rather not pay Render's disk fee, the other
  route is a free managed database (a bit more setup on my side). Say the word
  and I'll switch storage over.
