/**
 * Cloud TTS helper — fetches audio from /api/tts (Google Translate TTS proxy)
 * and plays it through an HTML Audio element.
 *
 * Using an Audio element instead of Web Speech API gives us reliable Bengali
 * playback without depending on OS voice pack availability.
 */

/**
 * Fetch audio from the /api/tts proxy and play it.
 * The audioRef allows the caller to stop/cancel playback (e.g. on reset).
 *
 * @param text      Text to speak (max 200 chars enforced server-side)
 * @param lang      Language code ("bn" | "hi" | "en")
 * @param audioRef  Ref to an HTMLAudioElement so callers can cancel
 * @returns         Promise that resolves when playback finishes (or rejects on error)
 */
export async function playCloudTts(
  text: string,
  lang: string,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>
): Promise<void> {
  // Stop any previous cloud TTS that is still playing
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.src = "";
    audioRef.current = null;
  }

  const url = `/api/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(text.slice(0, 200))}`;

  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onended = () => {
      audioRef.current = null;
      resolve();
    };
    audio.onerror = () => {
      audioRef.current = null;
      reject(new Error("Cloud TTS playback error"));
    };

    audio.play().catch((err) => {
      audioRef.current = null;
      reject(err);
    });
  });
}

/**
 * Stop cloud TTS immediately (used during session reset).
 */
export function stopCloudTts(
  audioRef: React.MutableRefObject<HTMLAudioElement | null>
): void {
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.src = "";
    audioRef.current = null;
  }
}
