// Server-side Claude calls. The LLM is treated strictly as a taste-matching /
// interpretation engine — never as a source of factual book data. Every fact it
// produces (titles, years, list placements) is re-verified against a real
// catalog before it reaches the user.

import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_MODEL } from "./config";
import type { Candidate, EditorialList } from "./types";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

function firstText(message: Anthropic.Message): string {
  for (const block of message.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

/** Pull the first JSON array out of a model response, tolerating fences/prose. */
function extractJsonArray(text: string): any[] {
  let cleaned = text.trim();
  cleaned = cleaned
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON array");
  const arr = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(arr)) throw new Error("not an array");
  return arr;
}

/**
 * Identify a book from a photo of its cover. Returns { title, author } or null
 * if the model can't identify it confidently.
 */
export async function identifyBookFromImage(
  base64Jpeg: string
): Promise<{ title: string; author: string } | null> {
  const message = await getClient().messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: 'What is the title and author of the book shown in this photo of its cover? Respond with ONLY "Title — Author" and nothing else. If you cannot identify it confidently, respond with exactly "UNKNOWN".',
          },
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: base64Jpeg },
          },
        ],
      },
    ],
  });

  const clean = firstText(message).trim();
  if (!clean || clean.toUpperCase().includes("UNKNOWN")) return null;
  const parts = clean.split("—").map((p) => p.trim());
  const title = parts[0] || clean;
  const author = parts[1] || "";
  if (!title) return null;
  return { title, author };
}

/**
 * Typo/description search rescue: given a search string the catalog couldn't
 * match, ask what real, published book the reader most likely meant. Returns a
 * plain "Title Author" string to re-query the catalog, or null.
 */
export async function rescueSearch(query: string): Promise<string | null> {
  const message = await getClient().messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 60,
    messages: [
      {
        role: "user",
        content: `A reader searched a book catalog for: "${query}". This may be misspelled, inexact, or a description of a book. What real, published book did they most likely mean? Respond with ONLY "Title Author" as a plain search string (no quotes, no commentary). If you have no confident guess, respond exactly "UNKNOWN".`,
      },
    ],
  });
  const g = firstText(message).trim();
  if (!g || g.toUpperCase().includes("UNKNOWN")) return null;
  return g;
}

interface CandidateOptions {
  /** "Title by Author; Title2 by Author2" list of the reader's input books. */
  inputList: string;
  /** Hard recency requirement text injected into the prompt. */
  recencyText: string;
  /** Optional steer instruction, e.g. "More fiction". */
  steerText?: string;
  /** Titles already shown, to exclude when re-steering. */
  alreadyShown?: string[];
  /** Titles to explicitly avoid (already shown / owned / disliked). */
  exclude?: string[];
  /** Mood/vibe chips the reader selected (e.g. "fast-paced", "cozy"). */
  mood?: string[];
  /** Free-text mood note (e.g. "set in Japan"). */
  moodText?: string;
  /** How far from the reader's comfort zone to venture. */
  adventurousness?: "safe" | "balanced" | "surprise";
  /** Confirmed taste-profile tags from the preview step. */
  profileTags?: string[];
}

/**
 * Generate ~10 candidate recommendations. Weighted toward editorial-list titles
 * and well-rated books. Output is unverified — the caller must ground every
 * candidate against the catalog and re-check list placement.
 */
export async function generateCandidates(
  opts: CandidateOptions
): Promise<Candidate[]> {
  let steer = "";
  if (opts.steerText) {
    steer = `\n\nThey asked to steer the new set: ${opts.steerText}.`;
  }

  let avoid = "";
  const excludeList = Array.from(new Set(opts.exclude || [])).filter(Boolean);
  if (excludeList.length) {
    avoid = `\n\nThe reader has already seen or owns these — do NOT recommend any of them again: ${excludeList.join("; ")}.`;
  }

  let profile = "";
  if (opts.profileTags && opts.profileTags.length) {
    profile = `\n\nThe reader confirms their taste includes: ${opts.profileTags.join(", ")}. Lean into these.`;
  }

  let mood = "";
  const moodBits = [
    ...(opts.mood || []),
    ...(opts.moodText && opts.moodText.trim() ? [opts.moodText.trim()] : []),
  ];
  if (moodBits.length) {
    mood = `\n\nRight now the reader is in the mood for: ${moodBits.join("; ")}. Weight your picks toward this mood.`;
  }

  let adventure = "";
  if (opts.adventurousness === "safe") {
    adventure =
      "\n\nStay close to the reader's demonstrated taste: reliable, broadly loved books very similar to what they already enjoy. Avoid risky or experimental choices.";
  } else if (opts.adventurousness === "surprise") {
    adventure =
      "\n\nBe adventurous: include several unexpected, horizon-broadening choices — excellent books in adjacent genres, styles, or traditions the reader may not have discovered — while still plausibly matching their taste.";
  }

  const variety =
    "\n\nEnsure variety across the 10: do NOT include more than one book by the same author, and vary sub-genre, era, and tone.";

  const prompt = `A reader has enjoyed these books: ${opts.inputList}.\n\n${opts.recencyText}${profile}${mood}${adventure}${steer}${avoid}${variety}\n\nRecommend exactly 10 different real, published books they have not already mentioned that they would likely enjoy next, matching their taste, best matches first. Only recommend well-known books you are certain really exist.\n\nQuality bar: strongly prefer acclaimed, award-recognized books — winners or shortlisted/finalist titles for major literary prizes (the Booker Prize, International Booker, Pulitzer Prize, National Book Award, National Book Critics Circle Award, Women's Prize for Fiction, Costa/Whitbread, and — for science fiction & fantasy — the Hugo and Nebula Awards), books by Nobel Literature laureates, and books featured on major editorial reading lists (New York Times Notable / Best Books of the Year, Financial Times Best Books of the Year, The Economist Books of the Year) — and books that are widely well-rated by readers (roughly a 4+ average on Goodreads). Avoid obscure or poorly reviewed titles.\n\nFor each, write a short reason referencing one of their specific input books by name where natural.\n\nRespond with ONLY a valid JSON array (no markdown fences, no commentary) of exactly 10 objects, each with keys: "title" (string), "author" (string), "year" (number, best-known original publication year), "why" (string, max 160 characters, second person "you"), "lists" (array of strings, subset of ["NYT","FT","Economist"] — ONLY lists you are confident actually featured this book; empty array if none or unsure).`;

  const message = await getClient().messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 2048,
    system:
      "You are a precise book recommendation engine. You only output valid JSON when asked to.",
    messages: [{ role: "user", content: prompt }],
  });

  const arr = extractJsonArray(firstText(message));
  const allowedLists: EditorialList[] = ["NYT", "FT", "Economist"];
  return arr
    .filter((c) => c && typeof c.title === "string")
    .map((c) => ({
      title: String(c.title),
      author: typeof c.author === "string" ? c.author : "",
      year: c.year ? Number(c.year) : null,
      why: typeof c.why === "string" ? c.why : "",
      lists: Array.isArray(c.lists)
        ? c.lists.filter((l: any): l is EditorialList => allowedLists.includes(l))
        : [],
    }));
}

/**
 * Infer a short, editable taste profile (genres / themes / style) from the
 * reader's shelf. Shown for confirmation before generating; the confirmed tags
 * feed back into generateCandidates.
 */
export async function inferTasteProfile(inputList: string): Promise<string[]> {
  const message = await getClient().messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `A reader enjoyed these books: ${inputList}.\n\nDescribe their reading taste in 4 to 7 short tags covering genres, themes, and style (for example: "literary fiction", "character-driven", "historical", "dark humor", "fast-paced thrillers"). Respond with ONLY a JSON array of short lowercase tag strings, no commentary.`,
      },
    ],
  });
  try {
    const arr = extractJsonArray(firstText(message));
    return arr
      .filter((t) => typeof t === "string" && t.trim())
      .map((t) => String(t).trim().toLowerCase())
      .slice(0, 7);
  } catch {
    return [];
  }
}
