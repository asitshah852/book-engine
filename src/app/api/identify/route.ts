import { NextResponse } from "next/server";
import { identifyBookFromImage } from "@/lib/anthropic";
import { verifyBook, fetchCover } from "@/lib/catalog";
import { HAS_ANTHROPIC_KEY } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 45;

// POST /api/identify { image: base64JpegNoPrefix }
//   → { title, author, year, coverUrl } | { unknown: true }
//
// Vision identifies the cover; the result is then grounded against the catalog
// so we return a canonical title + a reliable cover (never the raw LLM claim).
export async function POST(request: Request) {
  if (!HAS_ANTHROPIC_KEY) {
    return NextResponse.json({ unknown: true });
  }

  let image: string;
  try {
    const body = await request.json();
    image = (body.image || "").replace(/^data:[^,]+,/, "");
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!image) return NextResponse.json({ unknown: true });

  try {
    const identified = await identifyBookFromImage(image);
    if (!identified) return NextResponse.json({ unknown: true });

    // Ground the identification against the catalog for a canonical entry.
    const verified = await verifyBook(identified.title, identified.author, null);
    if (verified) {
      return NextResponse.json({
        title: verified.title,
        author: verified.author || identified.author,
        year: verified.year,
        coverUrl:
          verified.coverUrl ||
          (await fetchCover(verified.title, verified.author || identified.author)),
      });
    }

    // Vision was confident but the catalog didn't confirm — return the raw guess
    // so the user can keep or correct it.
    return NextResponse.json({
      title: identified.title,
      author: identified.author,
      year: null,
      coverUrl: await fetchCover(identified.title, identified.author),
    });
  } catch (err) {
    console.error("identify error", err);
    return NextResponse.json({ unknown: true });
  }
}
