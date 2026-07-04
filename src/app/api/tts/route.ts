import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/tts?lang=bn&text=...
 *
 * Proxies a request to Google Translate TTS and streams the MP3 back to the
 * browser.  Using a server-side proxy avoids CORS issues and lets us add
 * proper headers without exposing an API key (Google Translate TTS for short
 * texts does not require a key when accessed via the unofficial endpoint).
 */

const TTS_LANG: Record<string, string> = {
  bn: "bn",
  hi: "hi",
  en: "en",
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lang = searchParams.get("lang") ?? "en";
  const text = searchParams.get("text") ?? "";

  if (!text.trim()) {
    return new NextResponse("Missing text", { status: 400 });
  }

  const tl = TTS_LANG[lang] ?? lang;
  const ttsUrl =
    `https://translate.google.com/translate_tts` +
    `?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(text.slice(0, 200))}`;

  try {
    const upstream = await fetch(ttsUrl, {
      headers: {
        // Google requires a browser-like User-Agent for the unofficial endpoint
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://translate.google.com/",
      },
    });

    if (!upstream.ok) {
      return new NextResponse(`TTS upstream error: ${upstream.status}`, {
        status: 502,
      });
    }

    const audio = await upstream.arrayBuffer();

    return new NextResponse(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[/api/tts] fetch failed:", err);
    return new NextResponse("TTS fetch failed", { status: 500 });
  }
}
