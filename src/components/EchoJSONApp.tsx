"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  type Lang,
  LANG_LABELS,
  LANG_PICK_GREETING,
  PHRASES,
  fieldQuestion,
  isUnclearTranscript,
  isYes,
  matchFieldMultilingual,
  parseLanguage,
  pickVoice,
} from "@/lib/i18n";
import { playCloudTts, stopCloudTts } from "@/lib/tts";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | "init"             // model loading
  | "ready"            // model loaded, waiting for user
  | "await_language"   // asking which language (en / hi / bn)
  | "await_form"       // said greeting, listening for which government service
  | "loading_schema"   // Playwright is extracting the live form's schema
  | "collecting"       // asking & collecting fields one by one (raw speech only)
  | "translating"      // one-time batch translation of all collected answers
  | "await_confirm"    // summarised, listening for yes/no
  | "correction_field" // listening for which field to correct
  | "correction_value" // listening for the corrected value
  | "done";            // session complete

// A field as extracted from a live government (or dummy) form's schema.
type Field = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
};
type ChatMsg = { id: string; role: "agent" | "user"; text: string; isText?: boolean };

let _mid = 0;
const uid = () => `m${++_mid}`;

function pseudoWaveform(seed: string, bars = 18): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(25 + (h % 75));
  }
  return out;
}

// ─── Government Service Directory ──────────────────────────────────────────────
// This is voice-matching metadata only. The backend owns the service -> URL
// mapping (SERVICE_PORTAL_MAP in backend/main.py) and Playwright extracts the
// actual field schema at runtime — nothing about individual fields is
// hardcoded here anymore.

type ServiceDef = { key: string; label: string; match: RegExp };

const SERVICES: ServiceDef[] = [
  {
    key: "ration_card",
    label: "Ration Card",
    match: /\b(ration\s*card|ration)\b|राशन\s*कार्ड|राशन|রেশন\s*কার্ড|রেশন/i,
  },
  {
    key: "voter_id",
    label: "Voter ID",
    match: /\b(voter\s*id|voter\s*card|voter)\b|मतदाता\s*पहचान\s*पत्र|मतदाता|वोटर\s*कार्ड|वोटर|ভোটার\s*আইডি|ভোটার\s*কার্ড|ভোটার/i,
  },
  {
    key: "family_data",
    label: "Family Data Collection",
    match: /\b(family\s*data|family\s*registry|family\s*collection|family\s*form|family|registry|form)\b|परिवार\s*पंजीकरण|परिवार|फैमिली\s*फॉर्म|फैमिली|পারিবারিক\s*তথ্য|পরিবার|ফ্যামিলি\s*ফর্ম|ফ্যামিলি/i,
  },
];

function parseServiceKey(text: string): ServiceDef | null {
  for (const s of SERVICES) {
    if (s.match.test(text)) return s;
  }
  return null;
}

// ─── Dialogue Utilities ───────────────────────────────────────────────────────

function buildSummary(
  title: string,
  fields: Field[],
  data: Record<string, string>,
  lang: Lang
): string {
  const np = PHRASES.notProvided[lang];
  const lines = fields
    .map((f) => `${f.label}: ${data[f.id] || np}`)
    .join(". ");
  return PHRASES.summaryIntro[lang](title, lines);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EchoJSONApp() {
  // ── ML model refs ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processorRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const StreamerRef = useRef<any>(null);
  const modelLoadedRef = useRef(false);

  // ── Audio refs ──────────────────────────────────────────────────────────────
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  // Background waveform canvas (shown on the ready-state landing page)
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const bgRafRef = useRef<number>(0);
  // Session ID — incremented on every reset to invalidate stale recorder callbacks
  const sessionIdRef = useRef(0);
  const cloudAudioRef = useRef<HTMLAudioElement | null>(null);

  // ── Dialogue state refs (used inside callbacks – no stale closures) ────────
  const phaseRef = useRef<Phase>("init");
  const langRef = useRef<Lang | null>(null);
  const serviceKeyRef = useRef<string | null>(null);
  const serviceTitleRef = useRef<string>("");
  // Portal URL for the currently active service, returned by /api/schema.
  const targetUrlRef = useRef<string>("");
  // Field schema extracted live from the target form by the Playwright backend.
  const schemaFieldsRef = useRef<Field[]>([]);
  // Raw, untranslated spoken answers collected turn-by-turn (native script).
  // Translated to English in ONE batch call when collection finishes —
  // not per turn — to keep the live conversation fast.
  const rawDataRef = useRef<Record<string, string>>({});
  const dataRef = useRef<Record<string, string>>({});
  const fieldIdxRef = useRef<number>(0);
  const corrFieldRef = useRef<Field | null>(null);
  // ID of field currently being filled (drives real-time streaming into form)
  const activeFieldIdRef = useRef<string | null>(null);

  // ── React state (for rendering) ────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("init");
  const [lang, setLang] = useState<Lang | null>(null);
  const [serviceTitle, setServiceTitle] = useState<string>("");
  const [schemaFields, setSchemaFields] = useState<Field[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [fieldIdx, setFieldIdx] = useState(0);
  const [corrFieldId, setCorrFieldId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceDef | null>(null);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCaptchaModal, setShowCaptchaModal] = useState(false);
  const [captchaChecked, setCaptchaChecked] = useState(false);
  const [captchaSpinning, setCaptchaSpinning] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [dlPct, setDlPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const syncPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const addMsg = useCallback((role: "agent" | "user", text: string, isText = false) => {
    setChat((prev) => [...prev, { id: uid(), role, text, isText }]);
  }, []);

  // ── TTS ─────────────────────────────────────────────────────────────────────

  const speakText = useCallback((text: string, speakLang: Lang, onDone?: () => void) => {
    const sessionId = sessionIdRef.current;

    // Bengali: browser voices are unreliable/poor on Windows — use cloud Google Translate TTS proxy
    if (speakLang === "bn") {
      window.speechSynthesis?.cancel();
      stopCloudTts(cloudAudioRef);
      setAgentSpeaking(true);

      let spoken = text.replace(/\{[^}]*\}/g, "").trim();
      // Lowercase to prevent Google TTS from spelling out acronyms letter-by-letter
      spoken = spoken.toLowerCase();
      if (!spoken) {
        setAgentSpeaking(false);
        onDone?.();
        return;
      }

      const finish = () => {
        setAgentSpeaking(false);
        if (sessionIdRef.current === sessionId) {
          onDone?.();
        }
      };

      playCloudTts(spoken, "bn", cloudAudioRef)
        .then(finish)
        .catch(finish);
      return;
    }

    if (!window.speechSynthesis) {
      onDone?.();
      return;
    }
    window.speechSynthesis.cancel();
    const spoken = text.replace(/\{[^}]*\}/g, "").trim();
    if (!spoken) {
      onDone?.();
      return;
    }

    const utt = new SpeechSynthesisUtterance(spoken);
    utt.rate = 1.05;
    utt.lang = speakLang === "en" ? "en-IN" : "hi-IN";

    const voices =
      voicesRef.current.length > 0
        ? voicesRef.current
        : window.speechSynthesis.getVoices();
    const voice = pickVoice(speakLang, voices);
    if (voice) {
      utt.voice = voice;
      utt.lang = voice.lang;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setAgentSpeaking(false);
      // Guard: only execute callback if session is still active and has not been reset
      if (sessionIdRef.current === sessionId) {
        onDone?.();
      }
    };

    setAgentSpeaking(true);
    utt.onend = finish;
    utt.onerror = finish;

    // Chrome often drops speech fired immediately after cancel()
    window.setTimeout(() => {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utt);
    }, 80);
  }, []);

  /** Speak multiple lines sequentially, each in its own language voice */
  const speakSequence = useCallback(
    (parts: { text: string; lang: Lang }[], onDone?: () => void) => {
      const sessionId = sessionIdRef.current;
      if (!parts.length) {
        if (sessionIdRef.current === sessionId) {
          onDone?.();
        }
        return;
      }
      let i = 0;
      const next = () => {
        if (sessionIdRef.current !== sessionId) return;
        if (i >= parts.length) {
          onDone?.();
          return;
        }
        const part = parts[i++];
        speakText(part.text, part.lang, () => {
          window.setTimeout(() => {
            if (sessionIdRef.current === sessionId) {
              next();
            }
          }, 150);
        });
      };
      next();
    },
    [speakText]
  );

  // ── Audio Visualiser ────────────────────────────────────────────────────────

  const drawViz = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvas.parentElement?.clientWidth ?? 300;
    canvas.height = canvas.parentElement?.clientHeight ?? 100;

    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);

    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      analyser.getByteFrequencyData(data);
      ctx.fillStyle = "rgba(9,13,22,0.4)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const bw = (canvas.width / bufLen) * 2.5;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const bh = (data[i] / 255) * canvas.height * 0.75;
        const g = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - bh);
        g.addColorStop(0, "rgba(99,102,241,0.15)");
        g.addColorStop(1, "rgba(168,85,247,0.6)");
        ctx.fillStyle = g;
        ctx.fillRect(x, canvas.height - bh, bw - 1, bh);
        x += bw;
      }
    };
    frame();
  }, []);

  // ── Background Waveform (ready-state landing) ────────────────────────────────

  const drawWaveformBackground = useCallback(() => {
    // Re-read bgCanvasRef on every frame so the animation seamlessly continues
    // when the canvas element is replaced during a phase transition.
    let t = 0;
    const render = () => {
      bgRafRef.current = requestAnimationFrame(render);
      const canvas = bgCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      // Light gray base
      ctx.fillStyle = "#dde4ec";
      ctx.fillRect(0, 0, w, h);
      // Subtle grid
      ctx.strokeStyle = "rgba(160,175,190,0.35)";
      ctx.lineWidth = 0.5;
      const g = 35;
      for (let x = 0; x < w; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      t += 0.008;
      // Animated sine-wave layers
      const waves: { yFrac: number; amp: number; freq: number; speed: number; color: string; lw: number }[] = [
        { yFrac: 0.18, amp: 50, freq: 0.007, speed: 0.9,  color: "rgba(34,197,94,0.22)",   lw: 2.5 },
        { yFrac: 0.38, amp: 32, freq: 0.011, speed: 0.5,  color: "rgba(34,197,94,0.15)",   lw: 2   },
        { yFrac: 0.55, amp: 60, freq: 0.006, speed: 0.7,  color: "rgba(34,197,94,0.18)",   lw: 2.5 },
        { yFrac: 0.75, amp: 28, freq: 0.013, speed: 1.1,  color: "rgba(34,197,94,0.10)",   lw: 1.5 },
        { yFrac: 0.30, amp: 22, freq: 0.009, speed: 0.4,  color: "rgba(100,149,237,0.08)", lw: 1.5 },
        { yFrac: 0.68, amp: 38, freq: 0.008, speed: 0.6,  color: "rgba(100,149,237,0.07)", lw: 1   },
      ];
      waves.forEach(({ yFrac, amp, freq, speed, color, lw }) => {
        const cy = h * yFrac;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const y = cy + Math.sin(x * freq + t * speed) * amp;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.stroke();
      });
    };
    render();
  }, []);

  // ── Transcription ────────────────────────────────────────────────────────────

  const transcribeAudio = useCallback(
    async (chunks: Blob[]): Promise<string> => {
      const processor = processorRef.current;
      const model = modelRef.current;
      const Streamer = StreamerRef.current;
      if (!processor || !model || !Streamer || chunks.length === 0) return "";

      try {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const ab = await blob.arrayBuffer();
        const tmpCtx = new AudioContext();
        const orig = await tmpCtx.decodeAudioData(ab);
        const rate = 16000;
        const offCtx = new OfflineAudioContext(
          1,
          Math.round(orig.duration * rate),
          rate
        );
        const src = offCtx.createBufferSource();
        src.buffer = orig;
        src.connect(offCtx.destination);
        src.start();
        const res = await offCtx.startRendering();
        const f32 = res.getChannelData(0);

        // Fix 1: produce output in the user's chosen language/script so chat
        // bubbles always display text the user can read.
        const curLang = langRef.current;
        const scriptHint =
          curLang === "hi"
            ? "in Hindi using Devanagari script"
            : curLang === "bn"
              ? "in Bengali using Bengali (Bangla) script"
              : "in English";
        const instruction = `Transcribe the audio exactly ${scriptHint}. Return ONLY the verbatim spoken words, no annotations or commentary.`;

        const msgs = [
          {
            role: "user",
            content: [
              { type: "audio" },
              { type: "text", text: instruction },
            ],
          },
        ];
        const prompt = processor.apply_chat_template(msgs, {
          add_generation_prompt: true,
        });
        const inputs = await processor(prompt, null, f32, {
          add_special_tokens: false,
        });

        let out = "";
        const streamer = new Streamer(processor.tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true,
          callback_function: (chunk: string) => {
            out += chunk;
          },
        });
        await model.generate({
          ...inputs,
          max_new_tokens: 150,
          temperature: 0.1,
          do_sample: false,
          streamer,
        });
        return out.trim() || "[unclear]";
      } catch (err) {
        console.warn("Transcription error", err);
        return "[unclear]";
      }
    },
    []
  );

  /** Translate spoken text to English via Gemma (text-only) */
  const translateToEnglish = useCallback(async (text: string): Promise<string> => {
    const processor = processorRef.current;
    const model = modelRef.current;
    const Streamer = StreamerRef.current;
    if (!processor || !model || !Streamer) return text;

    try {
      const msgs = [
        {
          role: "user",
          content: `Translate the following to English. Return ONLY the English translation, nothing else:\n\n${text}`,
        },
      ];
      const prompt = processor.apply_chat_template(msgs, {
        add_generation_prompt: true,
      });
      const inputs = await processor(prompt, null, null, {
        add_special_tokens: false,
      });
      let out = "";
      const streamer = new Streamer(processor.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (chunk: string) => {
          out += chunk;
        },
      });
      await model.generate({
        ...inputs,
        max_new_tokens: 120,
        temperature: 0.1,
        do_sample: false,
        streamer,
      });
      return out.trim() || text;
    } catch {
      return text;
    }
  }, []);

  /**
   * Uses Gemma text inference to extract only the relevant entity value from a
   * natural-language user response for a given form field.
   * e.g. "my name is Mahika" → "Mahika" for field label "Full Name".
   * Streams extracted tokens into the live form field via onToken.
   * Fix #3: always returns English Roman-script value, regardless of input language.
   */
  /**
   * Fix 2: extractEntity now accepts an optional list of valid options.
   * When options are provided (dropdown / radio / select fields), the prompt
   * tells Gemma to pick exactly one option from the list — preventing blank
   * or invalid values that the form rejects.
   */
  const extractEntity = useCallback(
    async (
      rawText: string,
      fieldLabel: string,
      options?: string[],
      onToken?: (partial: string) => void,
      placeholder?: string
    ): Promise<string> => {
      const processor = processorRef.current;
      const model = modelRef.current;
      const Streamer = StreamerRef.current;
      if (!processor || !model || !Streamer) return translateToEnglish(rawText);

      try {
        // Build a prompt that is option-aware when the field has a fixed list
        let promptContent: string;
        if (options && options.length > 0) {
          const optionList = options.map((o) => `"${o}"`).join(", ");
          promptContent = `The user is answering the form field "${fieldLabel}". The ONLY valid options are: ${optionList}.\nLook at the user's response and select the SINGLE best matching option. Return ONLY that exact option text, nothing else.\n\nUser said: "${rawText}"\n\nSelected option:`;
        } else {
          const formatHint = placeholder ? ` It must strictly match this format: ${placeholder}.` : "";
          promptContent = `Extract only the value for the field "${fieldLabel}" from this user response. Return ONLY that value in English using Roman script. No extra words, no punctuation.${formatHint}\n\nUser said: "${rawText}"\n\nExtracted value:`;
        }

        const msgs = [{ role: "user", content: promptContent }];
        const prompt = processor.apply_chat_template(msgs, {
          add_generation_prompt: true,
        });
        const inputs = await processor(prompt, null, null, {
          add_special_tokens: false,
        });
        let out = "";
        const streamer = new Streamer(processor.tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true,
          callback_function: (chunk: string) => {
            out += chunk;
            onToken?.(out.trim());
          },
        });
        await model.generate({
          ...inputs,
          max_new_tokens: options && options.length > 0 ? 15 : 30,
          temperature: 0.05,
          do_sample: false,
          streamer,
        });
        return out.trim() || rawText;
      } catch {
        return rawText;
      }
    },
    [translateToEnglish]
  );

  /**
   * Batch-translates every collected raw answer to English in ONE Gemma call,
   * instead of translating/extracting after every single turn. This is the
   * only translation step in the whole flow — it runs once, right after the
   * last field is answered and before the confirmation summary is shown.
   */
  const translateAndExtractEntities = useCallback(
    async (
      fields: Field[],
      raw: Record<string, string>
    ): Promise<Record<string, string>> => {
      const processor = processorRef.current;
      const model = modelRef.current;
      const Streamer = StreamerRef.current;

      const fallbackPerField = async (): Promise<Record<string, string>> => {
        const result: Record<string, string> = {};
        for (const f of fields) {
          const spoken = raw[f.id] ?? "";
          result[f.id] = spoken
            ? await extractEntity(spoken, f.label, f.options, undefined, f.placeholder)
            : "";
        }
        return result;
      };

      if (!processor || !model || !Streamer) return fallbackPerField();

      try {
        const fieldLines = fields
          .map((f, i) => {
            const spoken = raw[f.id] ?? "";
            const optsPart =
              f.options && f.options.length > 0
                ? ` Valid options: ${f.options.map((o) => `"${o}"`).join(", ")}.`
                : "";
            const formatHint = f.placeholder ? ` Format required: ${f.placeholder}.` : "";
            return `${i + 1}. id: "${f.id}", label: "${f.label}", spoken answer: "${spoken}".${optsPart}${formatHint}`;
          })
          .join("\n");

        const promptContent = `You are helping fill an English government form. Below are form fields with what the applicant spoke aloud, possibly in Hindi or Bengali. For each field, output the correct value to enter in English (Roman script). If "Valid options" are given for a field, output EXACTLY one of those options, matching the applicant's intent. Respond with STRICT JSON only — a single object mapping each field id to its English value. No markdown, no code fences, no commentary.

Fields:
${fieldLines}

JSON:`;

        const msgs = [{ role: "user", content: promptContent }];
        const prompt = processor.apply_chat_template(msgs, {
          add_generation_prompt: true,
        });
        const inputs = await processor(prompt, null, null, {
          add_special_tokens: false,
        });

        let out = "";
        const streamer = new Streamer(processor.tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true,
          callback_function: (chunk: string) => {
            out += chunk;
          },
        });
        await model.generate({
          ...inputs,
          max_new_tokens: Math.max(200, fields.length * 40),
          temperature: 0.05,
          do_sample: false,
          streamer,
        });

        const match = out.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("No JSON object found in batch translation output");
        const parsed = JSON.parse(match[0]);

        const result: Record<string, string> = {};
        for (const f of fields) {
          const v = parsed[f.id];
          result[f.id] =
            typeof v === "string" && v.trim() ? v.trim() : raw[f.id] ?? "";
        }
        return result;
      } catch (err) {
        console.warn(
          "Batch entity translation failed, falling back to per-field extraction",
          err
        );
        return fallbackPerField();
      }
    },
    [extractEntity]
  );

  /**
   * Fix: Uses Gemma to intelligently understand long confirmations and 
   * fuzzy field names (e.g. "Father's name" -> "father_husband_name").
   */
  const analyzeConfirmation = useCallback(
    async (
      rawText: string,
      fields: Field[]
    ): Promise<{ isConfirm: boolean; fieldId: string | null }> => {
      const processor = processorRef.current;
      const model = modelRef.current;
      const Streamer = StreamerRef.current;

      const fallback = () => ({
        isConfirm: isYes(rawText, langRef.current ?? "en"),
        fieldId: matchFieldMultilingual(rawText, fields)?.id ?? null,
      });

      if (!processor || !model || !Streamer) return fallback();

      try {
        const fieldLines = fields
          .map((f) => `- id: "${f.id}", label: "${f.label}"`)
          .join("\n");

        const promptContent = `The user is reviewing a form. Analyze their spoken response and output STRICT JSON with two keys:
"confirm": boolean (true if they are confirming/agreeing/saying yes to everything, false if they are rejecting/saying no/asking to change something)
"fieldId": string or null (if they want to change a field, output the exact 'id' of the matching field from the list below. Otherwise output null).

Fields:
${fieldLines}

User said: "${rawText}"

JSON:`;

        const msgs = [{ role: "user", content: promptContent }];
        const prompt = processor.apply_chat_template(msgs, {
          add_generation_prompt: true,
        });
        const inputs = await processor(prompt, null, null, {
          add_special_tokens: false,
        });

        let out = "";
        const streamer = new Streamer(processor.tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true,
          callback_function: (chunk: string) => {
            out += chunk;
          },
        });
        await model.generate({
          ...inputs,
          max_new_tokens: 60,
          temperature: 0.1,
          do_sample: false,
          streamer,
        });

        const match = out.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("No JSON object found");
        const parsed = JSON.parse(match[0]);
        return {
          isConfirm: !!parsed.confirm,
          fieldId: typeof parsed.fieldId === "string" ? parsed.fieldId : null,
        };
      } catch (err) {
        console.warn("Confirmation analysis failed", err);
        return fallback();
      }
    },
    []
  );

  // ── Forward refs to break circular dependency ──────────────────────────────
  const processTxRef = useRef<
    ((rawText: string, englishText: string) => Promise<void>) | null
  >(null);
  const startRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const submitFormRef = useRef<(() => Promise<void>) | null>(null);

  // ── Recording ────────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (!modelLoadedRef.current) return;
    const sessionId = sessionIdRef.current; // capture — if reset fires, this won't match
    cancelAnimationFrame(rafRef.current);
    setIsRecording(true);
    audioChunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(
        "Microphone access denied. Please allow microphone access and try again."
      );
      setIsRecording(false);
      return;
    }

    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    analyserRef.current = audioCtxRef.current.createAnalyser();
    analyserRef.current.fftSize = 256;
    audioCtxRef.current
      .createMediaStreamSource(stream)
      .connect(analyserRef.current);
    drawViz();

    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      // Fix #1: guard against session reset — if session changed, discard result
      if (sessionIdRef.current !== sessionId) return;

      cancelAnimationFrame(rafRef.current);
      setIsRecording(false);
      setIsTranscribing(true);

      // Transcribe verbatim in the user's native language. This is the only
      // Gemma call that runs on every turn — no per-turn translation or
      // entity extraction anymore, to keep the live conversation fast.
      const rawText = await transcribeAudio(audioChunksRef.current);
      if (sessionIdRef.current !== sessionId) return; // re-check after async
      addMsg("user", rawText);

      // During the main collection loop, the raw spoken answer is stored
      // as-is (see processTranscription's "collecting" branch) and every
      // field is translated/extracted together in ONE batch call once the
      // last field is answered — not here, not per turn.
      //
      // A one-off correction after confirmation is the only case where we
      // still extract immediately: it's a single field, not part of the
      // fast conversational loop, and the summary needs to reflect it right
      // away.
      let englishText = rawText;
      const fieldId = activeFieldIdRef.current;
      if (
        phaseRef.current === "correction_value" &&
        fieldId &&
        rawText &&
        rawText !== "[unclear]"
      ) {
        const field = schemaFieldsRef.current.find((f) => f.id === fieldId);
        englishText = await extractEntity(
          rawText,
          field?.label ?? fieldId,
          field?.options,
          (partial) => {
            if (sessionIdRef.current === sessionId) {
              setFormData((prev) => ({ ...prev, [fieldId]: partial }));
            }
          },
          field?.placeholder
        );
        if (sessionIdRef.current !== sessionId) return;
        setFormData((prev) => ({ ...prev, [fieldId]: englishText }));
      }

      setIsTranscribing(false);
      await processTxRef.current?.(rawText, englishText);
    };

    // Silence detection — wait for real speech, then a longer pause before stopping
    const THRESH = 0.012;
    const SILENCE_MS = 2800;
    const MIN_RECORD_MS = 900;
    const MAX_RECORD_MS = 30000;
    const recordStart = Date.now();
    let silStart: number | null = null;
    let hadSpeech = false;
    let stopped = false;

    const checkSilence = () => {
      if (stopped || !analyserRef.current || recorder.state === "inactive")
        return;

      if (Date.now() - recordStart >= MAX_RECORD_MS) {
        stopped = true;
        recorder.stop();
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const d = new Float32Array(analyserRef.current.fftSize);
      analyserRef.current.getFloatTimeDomainData(d);
      let rms = 0;
      for (const s of d) rms += s * s;
      rms = Math.sqrt(rms / d.length);

      if (rms >= THRESH) {
        hadSpeech = true;
        silStart = null;
      } else if (hadSpeech && Date.now() - recordStart >= MIN_RECORD_MS) {
        if (!silStart) silStart = Date.now();
        else if (Date.now() - silStart > SILENCE_MS) {
          stopped = true;
          recorder.stop();
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
      }
      requestAnimationFrame(checkSilence);
    };

    recorder.start();
    checkSilence();
  }, [addMsg, drawViz, transcribeAudio, extractEntity]);

  startRecordingRef.current = startRecording;

  // ── Schema Extraction (Playwright reads the live/dummy government form) ─────
  // Talks to backend/main.py's /api/schema, which navigates to the portal URL
  // mapped for this service and returns {id, label, type, required, options}
  // for every field it finds on the page — nothing about the fields is
  // hardcoded on the frontend.
  const fetchServiceSchema = useCallback(
    async (service: ServiceDef): Promise<boolean> => {
      try {
        const res = await fetch("/api/schema", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service: service.key }),
        });
        if (!res.ok) throw new Error(`Schema request failed: ${res.status}`);
        const json = await res.json();
        const fields: Field[] = json.fields ?? [];
        if (!fields.length) throw new Error("Empty schema returned");

        serviceKeyRef.current = service.key;
        serviceTitleRef.current = json.title ?? service.label;
        targetUrlRef.current = json.url;
        schemaFieldsRef.current = fields;
        rawDataRef.current = {};
        dataRef.current = {};
        fieldIdxRef.current = 0;
        activeFieldIdRef.current = fields[0].id;

        setServiceTitle(json.title ?? service.label);
        setSchemaFields(fields);
        setFormData({});
        setFieldIdx(0);
        return true;
      } catch (err) {
        console.error("Schema extraction failed", err);
        return false;
      }
    },
    []
  );

  const initiateServiceSelection = useCallback((service: ServiceDef) => {
    window.speechSynthesis?.cancel();
    stopCloudTts(cloudAudioRef);
    setIsRecording(false);
    setAgentSpeaking(false);

    setSelectedService(service);
    setShowOpenModal(true);
    setShowCaptchaModal(false);
    setCaptchaChecked(false);
    setCaptchaSpinning(false);
  }, []);

  const handleCaptchaClick = useCallback(() => {
    if (captchaChecked || captchaSpinning) return;
    setCaptchaSpinning(true);
    setTimeout(() => {
      setCaptchaSpinning(false);
      setCaptchaChecked(true);
    }, 1200);
  }, [captchaChecked, captchaSpinning]);

  const confirmAndLoadService = useCallback(async () => {
    setShowCaptchaModal(false);
    if (!selectedService) return;

    const service = selectedService;
    setSelectedService(null);

    // If language not chosen yet, pick English by default then open form
    const l = langRef.current ?? "en";
    if (!langRef.current) {
      langRef.current = "en";
      setLang("en");
    }

    corrFieldRef.current = null;
    setCorrFieldId(null);

    const loadingMsg = PHRASES.loadingSchema[l](service.label);
    addMsg("agent", loadingMsg);
    syncPhase("loading_schema");
    speakText(loadingMsg, l);

    const ok = await fetchServiceSchema(service);
    if (!ok) {
      const resp = PHRASES.schemaLoadFailed[l];
      addMsg("agent", resp);
      syncPhase("ready");
      speakText(resp, l);
      return;
    }

    const fields = schemaFieldsRef.current;
    const q = fieldQuestion(l, fields[0].id, fields[0].label);
    const resp = PHRASES.openingForm[l](1, serviceTitleRef.current, q);
    addMsg("agent", resp);
    syncPhase("collecting");
    speakText(resp, l, () => startRecordingRef.current?.());
  }, [selectedService, fetchServiceSchema, speakText, addMsg, syncPhase]);

  // ── Dialogue State Machine ───────────────────────────────────────────────────

  const processTranscription = useCallback(
    async (rawText: string, englishText: string) => {
      const phase = phaseRef.current;
      const l = langRef.current ?? "en";

      // ── Language selection ──
      if (phase === "await_language") {
        if (isUnclearTranscript(rawText)) {
          const resp = PHRASES.didntCatch.en;
          addMsg("agent", resp);
          speakSequence(LANG_PICK_GREETING, () => startRecordingRef.current?.());
          return;
        }
        const picked = parseLanguage(rawText);
        if (picked) {
          langRef.current = picked;
          setLang(picked);
          const label = LANG_LABELS[picked];
          const resp = PHRASES.langSelected[picked](label);
          addMsg("agent", resp);
          speakText(resp, picked, () => {
            const formGreeting = PHRASES.formGreeting[picked];
            addMsg("agent", formGreeting);
            syncPhase("await_form");
            speakText(formGreeting, picked, () => startRecordingRef.current?.());
          });
        } else {
          const resp = PHRASES.langChoiceAgain.en;
          addMsg("agent", resp);
          speakSequence(LANG_PICK_GREETING, () => startRecordingRef.current?.());
        }
        return;
      }

      // ── Government service selection ──
      if (phase === "await_form") {
        if (isUnclearTranscript(rawText)) {
          const resp = `${PHRASES.didntCatch[l]} ${PHRASES.formChoiceAgain[l]}`;
          addMsg("agent", resp);
          speakText(resp, l, () => startRecordingRef.current?.());
          return;
        }
        const service = parseServiceKey(rawText);
        if (!service) {
          const resp = PHRASES.formChoiceAgain[l];
          addMsg("agent", resp);
          speakText(resp, l, () => startRecordingRef.current?.());
          return;
        }

        initiateServiceSelection(service);
        return;
      }

      // ── Field collection (entity extracted → English stored in form) ──
      if (phase === "collecting") {
        const fields = schemaFieldsRef.current;
        const idx = fieldIdxRef.current;
        const field = fields[idx];

        // No translation/extraction happens here — just a cheap, local
        // check that something was actually said. The real entity
        // extraction (and option matching) happens once, for every field
        // at once, right after the last question is answered.
        if (isUnclearTranscript(rawText)) {
          const q = fieldQuestion(l, field.id, field.label);
          const resp = `${PHRASES.didntCatch[l]} ${q}`;
          addMsg("agent", resp);
          activeFieldIdRef.current = field.id;
          speakText(resp, l, () => startRecordingRef.current?.());
          return;
        }

        const newRaw = { ...rawDataRef.current, [field.id]: rawText };
        rawDataRef.current = newRaw;

        const nextIdx = idx + 1;
        if (nextIdx < fields.length) {
          fieldIdxRef.current = nextIdx;
          activeFieldIdRef.current = fields[nextIdx].id;
          setFieldIdx(nextIdx);
          const q = fieldQuestion(l, fields[nextIdx].id, fields[nextIdx].label);
          const resp = PHRASES.gotItNext[l](q);
          addMsg("agent", resp);
          speakText(resp, l, () => startRecordingRef.current?.());
          return;
        }

        // Last field answered — this is the ONE point where every collected
        // answer gets translated/normalized to English, in a single Gemma
        // call, instead of on every turn.
        fieldIdxRef.current = fields.length;
        activeFieldIdRef.current = null;
        setFieldIdx(fields.length);
        syncPhase("translating");
        const loadingMsg = PHRASES.translatingEntities[l];
        addMsg("agent", loadingMsg);
        speakText(loadingMsg, l);

        const translated = await translateAndExtractEntities(fields, newRaw);
        dataRef.current = translated;
        setFormData(translated);

        const summary = buildSummary(serviceTitleRef.current, fields, translated, l);
        addMsg("agent", summary, true);
        syncPhase("await_confirm");
        speakText(summary, l, () => startRecordingRef.current?.());
        return;
      }

      // ── Confirmation ──
      // ── Confirmation ──
      if (phase === "await_confirm") {
        if (isUnclearTranscript(rawText)) {
          const resp = PHRASES.didntCatch[l];
          addMsg("agent", resp);
          speakText(resp, l, () => startRecordingRef.current?.());
          return;
        }

        const analysis = await analyzeConfirmation(rawText, schemaFieldsRef.current);

        if (analysis.isConfirm) {
          const resp = PHRASES.submitSuccess[l];
          addMsg("agent", resp, true);
          syncPhase("done");
          activeFieldIdRef.current = null;
          speakText(resp, l);
          await submitFormRef.current?.();
        } else if (analysis.fieldId) {
          const fullField = schemaFieldsRef.current.find((f) => f.id === analysis.fieldId);
          if (fullField) {
            corrFieldRef.current = fullField;
            activeFieldIdRef.current = fullField.id;
            setCorrFieldId(fullField.id);
            const resp = PHRASES.correctWhatValue[l](fullField.label);
            addMsg("agent", resp);
            syncPhase("correction_value");
            speakText(resp, l, () => startRecordingRef.current?.());
            return;
          }
        }

        // They said "No" but didn't specify a field, or the field wasn't found
        if (!analysis.isConfirm) {
          const resp = PHRASES.correctWhichField[l];
          addMsg("agent", resp);
          syncPhase("correction_field");
          speakText(resp, l, () => startRecordingRef.current?.());
        }
        return;
      }

      // ── Correction: which field ──
      if (phase === "correction_field") {
        const fields = schemaFieldsRef.current;
        const analysis = await analyzeConfirmation(rawText, fields);

        if (analysis.fieldId) {
          const fullField = fields.find((f) => f.id === analysis.fieldId);
          if (fullField) {
            corrFieldRef.current = fullField;
            activeFieldIdRef.current = fullField.id;
            setCorrFieldId(fullField.id);
            const resp = PHRASES.correctWhatValue[l](fullField.label);
            addMsg("agent", resp);
            syncPhase("correction_value");
            speakText(resp, l, () => startRecordingRef.current?.());
            return;
          }
        }

        const resp = PHRASES.fieldNotMatched[l];
        addMsg("agent", resp);
        speakText(resp, l, () => startRecordingRef.current?.());
        return;
      }

      // ── Correction: new value (entity extracted → English) ──
      if (phase === "correction_value") {
        const field = corrFieldRef.current!;
        if (isUnclearTranscript(englishText)) {
          activeFieldIdRef.current = field.id;
          const resp = `${PHRASES.didntCatch[l]} ${PHRASES.correctWhatValue[l](field.label)}`;
          addMsg("agent", resp);
          speakText(resp, l, () => startRecordingRef.current?.());
          return;
        }

        // Fix 2: same options validation for correction phase
        let effectiveEnglish = englishText;
        if (field.options && field.options.length > 0) {
          const normalized = field.options.find(
            (o) => o.toLowerCase() === englishText.toLowerCase().trim()
          );
          if (!normalized) {
            const optionsList = field.options.slice(0, 5).join(", ");
            const resp = PHRASES.invalidOption[l](field.label, optionsList);
            addMsg("agent", resp);
            activeFieldIdRef.current = field.id;
            speakText(resp, l, () => startRecordingRef.current?.());
            return;
          }
          effectiveEnglish = normalized;
        }

        const fields = schemaFieldsRef.current;
        const newData = { ...dataRef.current, [field.id]: effectiveEnglish };
        dataRef.current = newData;
        setFormData({ ...newData });
        corrFieldRef.current = null;
        activeFieldIdRef.current = null;
        setCorrFieldId(null);
        const summary = buildSummary(serviceTitleRef.current, fields, newData, l);
        const resp = `${PHRASES.updatedField[l](field.label, effectiveEnglish)} ${summary}`;
        addMsg("agent", resp, true);
        syncPhase("await_confirm");
        speakText(resp, l, () => startRecordingRef.current?.());
        return;
      }
    },
    [addMsg, speakSequence, speakText, syncPhase, fetchServiceSchema, translateAndExtractEntities, analyzeConfirmation, initiateServiceSelection]
  );

  useEffect(() => {
    processTxRef.current = processTranscription;
  }, [processTranscription]);

  // ── Backend Submission ───────────────────────────────────────────────────────

  const submitForm = useCallback(async () => {
    const url = targetUrlRef.current;
    if (!url) return;
    try {
      // Step 9+10 of the architecture: send the confirmed JSON to Playwright,
      // which maps it onto the field IDs it extracted from this same URL.
      await fetch("/api/fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          data: dataRef.current,
        }),
      });
    } catch (err) {
      console.error("Submit failed", err);
    }
  }, []);

  useEffect(() => {
    submitFormRef.current = submitForm;
  }, [submitForm]);

  // ── Model Loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const HF =
          "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";
        const {
          env,
          AutoProcessor,
          Gemma4ForConditionalGeneration,
          TextStreamer,
        } = await import(/* webpackIgnore: true */ HF);

        StreamerRef.current = TextStreamer;
        env.allowLocalModels = false;

        const id = "onnx-community/gemma-4-E2B-it-ONNX";
        const pMap = new Map<string, { l: number; t: number }>();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const progress_callback = (d: any) => {
          if (d.status === "progress" && d.total) {
            pMap.set(d.file, { l: d.loaded ?? 0, t: d.total });
            let l = 0,
              t = 0;
            pMap.forEach((v) => {
              l += v.l;
              t += v.t;
            });
            if (t > 0) setDlPct(Math.round((l / t) * 100));
          }
        };

        processorRef.current = await AutoProcessor.from_pretrained(id, {
          progress_callback,
        });
        modelRef.current = await Gemma4ForConditionalGeneration.from_pretrained(
          id,
          { dtype: "q4f16", device: "webgpu", progress_callback }
        );

        modelLoadedRef.current = true;
        syncPhase("ready");
      } catch (err) {
        setError(
          `Model load failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })();
  }, [syncPhase]);

  // Preload TTS voices (needed for Hindi/Bengali on some browsers)
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const refreshVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    refreshVoices();
    window.speechSynthesis.onvoiceschanged = refreshVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // Waveform background: starts once on mount and runs for the entire session.
  // Because drawWaveformBackground reads bgCanvasRef.current every frame, it
  // automatically picks up the new canvas element when a phase transition swaps
  // the rendered canvas (ready-state early-return ↔ main render).
  useEffect(() => {
    const id = window.setTimeout(drawWaveformBackground, 60);
    return () => {
      window.clearTimeout(id);
      cancelAnimationFrame(bgRafRef.current);
    };
  }, [drawWaveformBackground]);

  // ── Session Controls ─────────────────────────────────────────────────────────

  const handleStartSession = useCallback(() => {
    if (phaseRef.current !== "ready") return;
    const combined = LANG_PICK_GREETING.map((p) => p.text).join("\n\n");
    addMsg("agent", combined);
    syncPhase("await_language");
    speakSequence(LANG_PICK_GREETING, () => startRecordingRef.current?.());
  }, [addMsg, speakSequence, syncPhase]);

  const handleFormCardClick = useCallback(
    async (key: string) => {
      const p = phaseRef.current;
      if (
        !modelLoadedRef.current ||
        p === "collecting" ||
        p === "loading_schema" ||
        p === "await_confirm" ||
        p === "correction_field" ||
        p === "correction_value" ||
        p === "done" ||
        p === "await_language"
      )
        return;

      const service = SERVICES.find((s) => s.key === key);
      if (!service) return;

      initiateServiceSelection(service);
    },
    [initiateServiceSelection]
  );

  const handleReset = useCallback(() => {
    sessionIdRef.current += 1;
    window.speechSynthesis?.cancel();
    stopCloudTts(cloudAudioRef);
    cancelAnimationFrame(rafRef.current);
    try {
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop();
      }
    } catch {
      // ignore
    }
    serviceKeyRef.current = null;
    serviceTitleRef.current = "";
    targetUrlRef.current = "";
    schemaFieldsRef.current = [];
    langRef.current = null;
    rawDataRef.current = {};
    dataRef.current = {};
    fieldIdxRef.current = 0;
    corrFieldRef.current = null;
    activeFieldIdRef.current = null;
    setServiceTitle("");
    setSchemaFields([]);
    setLang(null);
    setFormData({});
    setFieldIdx(0);
    setCorrFieldId(null);
    setChat([]);
    setIsRecording(false);
    setIsTranscribing(false);
    setAgentSpeaking(false);
    syncPhase("ready");
  }, [syncPhase]);

  // ── Derived state for render ──────────────────────────────────────────────────

  const allFields = schemaFields;
  const hasActiveForm = allFields.length > 0;
  const currField = phase === "collecting" ? (allFields[fieldIdx] ?? null) : null;

  const statusLabel = (() => {
    if (phase === "init") return "Loading Model";
    if (isRecording) return "Listening";
    if (isTranscribing) return "Processing";
    if (agentSpeaking) return "Speaking";
    if (phase === "done") return "Session Complete";
    if (phase === "await_confirm") return "Awaiting Confirmation";
    if (phase === "await_language") return "Choose Language";
    if (phase === "loading_schema") return "Reading Form Fields";
    if (phase === "translating") return "Translating Answers";
    if (phase === "ready") return "Ready";
    return "Standby";
  })();

  const dotColor = (() => {
    if (phase === "init") return "bg-amber-500";
    if (isRecording) return "bg-red-500";
    if (isTranscribing) return "bg-indigo-500";
    if (agentSpeaking) return "bg-blue-500";
    if (phase === "done") return "bg-emerald-500";
    return "bg-emerald-500";
  })();

  const centerButtonLabel = (() => {
    if (phase === "init") return "Loading";
    if (phase === "ready") return "Start";
    if (phase === "done") return "New Session";
    if (isRecording) return "Listening";
    if (isTranscribing) return "Thinking";
    if (phase === "translating") return "Translating";
    if (agentSpeaking) return "Speaking";
    return "Active";
  })();

  const centerButtonDisabled =
    phase === "init" || phase === "translating" || isTranscribing;

  const handleCenterButton = useCallback(() => {
    if (phaseRef.current === "ready") handleStartSession();
    else if (phaseRef.current === "done") handleReset();
    else if (
      !isRecording &&
      !agentSpeaking &&
      !isTranscribing &&
      phaseRef.current !== "init" &&
      phaseRef.current !== "translating"
    ) {
      startRecordingRef.current?.();
    }
  }, [handleStartSession, handleReset, isRecording, agentSpeaking, isTranscribing]);

  const glassCard =
    "rounded-2xl shadow-lg backdrop-blur-[14px] border border-white/65";
  const glassStyle = {
    background: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(14px)",
    border: "1px solid rgba(255,255,255,0.65)",
  } as const;

  const sessionHint = (() => {
    if (phase === "init") return "Loading model, please wait…";
    if (phase === "ready") return "Click Start or select a service to begin voice automation.";
    if (phase === "await_language")
      return isRecording
        ? "Listening — say English, Hindi, or Bengali"
        : agentSpeaking
          ? "Agent speaking…"
          : "Preparing language selection…";
    if (phase === "await_form")
      return isRecording
        ? "Listening — say Ration Card or Voter ID"
        : agentSpeaking
          ? "Agent speaking…"
          : "Preparing…";
    if (phase === "collecting" && currField)
      return isRecording
        ? `Listening — ${currField.label}`
        : agentSpeaking
          ? "Agent speaking…"
          : `Next: ${currField.label}`;
    if (phase === "translating") return "Translating your answers to English…";
    if (phase === "await_confirm")
      return isRecording
        ? "Listening — say Yes to submit or name a field to correct"
        : agentSpeaking
          ? "Agent speaking…"
          : "Say yes to submit, or name a field to correct";
    if (phase === "correction_field" || phase === "correction_value")
      return isRecording ? "Listening…" : agentSpeaking ? "Agent speaking…" : "Ready";
    if (phase === "done") return "Session complete — click New Session to start over";
    return "";
  })();

  // ── Render ────────────────────────────────────────────────────────────────────

  const showLargeMic = phase === "ready" || (chat.length === 0 && phase !== "init");

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: "#dde4ec" }}>
      {/* Waveform canvas – shared with the ready-state early return via bgCanvasRef */}
      <canvas ref={bgCanvasRef} className="absolute inset-0 w-full h-full" />

      <div className="relative z-10 flex flex-col h-full">
        {/* ── Header ── */}
        <header className="flex justify-between items-center px-6 py-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-end gap-[3px] h-7">
              {[4, 7, 5, 9, 6, 8, 5, 7].map((h, i) => (
                <div key={i} className="w-[3px] rounded-full bg-slate-700" style={{ height: `${h * 3}px` }} />
              ))}
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">EchoJSON</h1>
          </div>
          <div className="flex items-center gap-2">
            {lang && (
              <span className="text-[10px] uppercase font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 border border-green-300">
                {LANG_LABELS[lang]}
              </span>
            )}
            {phase !== "init" && (
              <button
                onClick={handleReset}
                className={`text-xs px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${
                  phase === "done"
                    ? "bg-white/70 hover:bg-white border-slate-300 text-slate-600 hover:text-slate-800"
                    : "bg-red-50 hover:bg-red-100 border-red-200 text-red-600 hover:text-red-700"
                }`}
              >
                <i className={`fa-solid ${phase === "done" ? "fa-rotate-left" : "fa-stop"}`} />
                {phase === "done" ? "New Session" : "Stop Session"}
              </button>
            )}
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm"
              style={
                phase === "ready"
                  ? { background: "rgba(220,252,231,0.8)", borderColor: "rgba(134,239,172,0.7)" }
                  : { background: "rgba(255,255,255,0.80)", borderColor: "rgba(203,213,225,0.8)" }
              }
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inset-0 rounded-full opacity-75 ${dotColor}`} />
                <span className={`relative rounded-full h-2.5 w-2.5 ${dotColor}`} />
              </span>
              <span className={`text-xs font-medium ${phase === "ready" ? "text-green-700 font-semibold" : "text-slate-600"}`}>
                {phase === "ready" ? "System Ready" : statusLabel}
              </span>
            </div>
          </div>
        </header>

        {/* ── Error ── */}
        {error && (
          <div className="mx-6 mb-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl flex items-start gap-3">
            <i className="fa-solid fa-circle-exclamation text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs flex-1">{error}</p>
            <button type="button" onClick={() => setError(null)}>
              <i className="fa-solid fa-xmark text-red-400 hover:text-red-500" />
            </button>
          </div>
        )}

        {/* ── Main: unified 3-column layout ── */}
        <main className="flex-1 flex items-stretch gap-4 px-8 pb-8 min-h-0 overflow-hidden">

          {/* Left — Getting Started */}
          <div className={`${glassCard} p-6 flex flex-col gap-4 w-[270px] shrink-0`} style={glassStyle}>
            <h2 className="text-lg font-bold text-slate-800">Getting Started</h2>
            {phase === "init" ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold text-slate-700">Downloading Gemma 4 E2B</span>
                  <span className="font-mono text-green-600">{dlPct}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-green-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${dlPct}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400">
                  Downloading ~1.5 GB model. It will be cached in your browser for future sessions.
                </p>
              </>
            ) : (
              <>
                <ol className="space-y-3 text-sm text-slate-600 flex-1">
                  {[
                    "Choose Language: English, Hindi, Bengali",
                    "Say Service Name (e.g., Ration Card)",
                    "Answer Voice Prompts",
                    'Confirm Summary with \u201cYes\u201d',
                    "Correct Errors anytime",
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="text-[11px] text-slate-400 font-mono mt-0.5 shrink-0">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <div
                  className="flex items-center justify-between rounded-xl px-3 py-2.5"
                  style={{ border: "1px solid rgba(203,213,225,0.8)", background: "rgba(255,255,255,0.55)" }}
                >
                  <span className="text-sm text-slate-600">
                    {lang ? `Language: ${LANG_LABELS[lang]}` : "Language: English, Hindi, Bengali"}
                  </span>
                  <i className="fa-solid fa-chevron-down text-slate-400 text-xs" />
                </div>
                {phase === "ready" && (
                  <button
                    type="button"
                    onClick={handleStartSession}
                    className="w-full bg-green-500 hover:bg-green-600 active:scale-95 text-white font-bold rounded-xl py-3 transition-all duration-150 shadow-md"
                    style={{ boxShadow: "0 4px 14px rgba(34,197,94,0.35)" }}
                  >
                    Start Session
                  </button>
                )}
              </>
            )}
          </div>

          {/* Center — Live Session (transcriptions + Start) */}
          <div className={`${glassCard} p-6 flex flex-col gap-3 flex-1 min-w-0 relative overflow-hidden`} style={glassStyle}>
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none rounded-2xl"
            />
            <h2 className="text-lg font-bold text-slate-800 shrink-0">Live Session</h2>

            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 relative z-10">
              {showLargeMic && (
                <div className="flex items-center justify-center py-4 shrink-0">
                  <div className="relative flex flex-col items-center scale-90">
                    {(isRecording || agentSpeaking) && (
                      <div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[55%] w-40 h-40 rounded-full border border-green-400/30 animate-ping"
                        style={{ animationDuration: "2.8s" }}
                      />
                    )}
                    <div
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[55%] w-32 h-32 rounded-full"
                      style={{ background: "radial-gradient(circle, rgba(34,197,94,0.18) 0%, transparent 70%)" }}
                    />
                    <div className="relative z-10 flex flex-col items-center">
                      <div
                        className="w-[64px] h-[78px] rounded-t-[36px] rounded-b-[6px] relative shadow-2xl overflow-hidden"
                        style={{ background: "linear-gradient(145deg, #cdd5dc 0%, #9aaab5 40%, #78909c 70%, #8fa0aa 100%)" }}
                      >
                        <div
                          className="absolute inset-[6px] rounded-t-[30px]"
                          style={{
                            backgroundImage:
                              "repeating-linear-gradient(0deg,rgba(0,0,0,0.07) 0,rgba(0,0,0,0.07) 1px,transparent 1px,transparent 7px)," +
                              "repeating-linear-gradient(90deg,rgba(0,0,0,0.07) 0,rgba(0,0,0,0.07) 1px,transparent 1px,transparent 7px)",
                          }}
                        />
                        <div className="absolute top-3 left-3 w-3 h-8 rounded-full blur-[4px]" style={{ background: "rgba(255,255,255,0.32)" }} />
                      </div>
                      <div className="w-[9px] h-5 rounded-sm" style={{ background: "linear-gradient(to bottom, #78909c, #546e7a)" }} />
                      <div className="w-9 h-[3px] rounded-full" style={{ background: "#546e7a" }} />
                      <div className="w-[52px] h-[6px] rounded-full mt-1 shadow-md" style={{ background: "linear-gradient(to right, #78909c, #b0bec5, #78909c)" }} />
                    </div>
                  </div>
                </div>
              )}

              {chat.length === 0 && phase !== "ready" && phase !== "init" && (
                <p className="text-sm text-slate-400 italic text-center py-2">Waiting for conversation…</p>
              )}

              {chat.map((msg) => {
                const isUser = msg.role === "user";
                if (msg.isText) {
                  return (
                    <div key={msg.id} className={isUser ? "flex justify-end" : "flex justify-start"}>
                      <div
                        className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isUser
                            ? "bg-green-500 text-white rounded-br-md"
                            : "bg-white/80 border border-slate-200 text-slate-700 rounded-bl-md shadow-sm"
                        }`}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1">
                          {isUser ? "You" : "Agent"}
                        </p>
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                      </div>
                    </div>
                  );
                }

                // Render as WhatsApp style voice note bubble
                const bars = pseudoWaveform(msg.id);
                const durationSec = Math.max(
                  1,
                  Math.min(28, Math.round(msg.text.length / 13))
                );
                return (
                  <div key={msg.id} className={isUser ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-full max-w-[80%] ${
                        isUser
                          ? "bg-green-500 text-white rounded-tr-xl rounded-l-full rounded-br-sm shadow-sm"
                          : "bg-white border border-slate-200 text-slate-700 rounded-tl-xl rounded-r-full rounded-bl-sm shadow-sm"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        isUser ? "bg-white/20 text-white" : "bg-green-50 text-green-600"
                      }`}>
                        <i className="fa-solid fa-play text-xs pl-[2px]" />
                      </div>
                      
                      <div className="flex items-end gap-[2px] h-5 shrink-0 select-none">
                        {bars.map((h: number, idx: number) => (
                          <span
                            key={idx}
                            className={`w-[2px] rounded-full ${
                              isUser ? "bg-white/80" : "bg-slate-400"
                            }`}
                            style={{ height: `${h}%` }}
                          />
                        ))}
                      </div>

                      <span className={`text-[10px] font-mono shrink-0 ${isUser ? "text-white/70" : "text-slate-400"}`}>
                        0:{durationSec < 10 ? `0${durationSec}` : durationSec}
                      </span>

                      <i
                        className={`fa-solid ${
                          isUser ? "fa-microphone" : "fa-robot"
                        } text-[10px] shrink-0 opacity-60`}
                      />
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            <div className="shrink-0 flex flex-col items-center gap-2 relative z-10">
              <button
                type="button"
                disabled={centerButtonDisabled}
                onClick={handleCenterButton}
                className={`font-bold rounded-full px-12 py-2.5 text-base transition-all duration-150 shadow-lg active:scale-95 ${
                  centerButtonDisabled
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                    : isRecording
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : phase === "done"
                        ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                        : "bg-green-500 hover:bg-green-600 text-white"
                }`}
                style={
                  centerButtonDisabled
                    ? undefined
                    : { boxShadow: isRecording ? "0 4px 18px rgba(239,68,68,0.35)" : "0 4px 18px rgba(34,197,94,0.40)" }
                }
              >
                {centerButtonLabel}
              </button>
              <p className="text-sm text-slate-500 text-center max-w-sm">{sessionHint}</p>
            </div>
          </div>

          {/* Right — Services or form */}
          <div className={`shrink-0 min-h-0 overflow-y-auto ${hasActiveForm ? "flex-1 min-w-0" : "w-[310px]"}`}>
            {phase === "loading_schema" ? (
              <div className={`${glassCard} h-full flex flex-col items-center justify-center gap-4 p-8 text-center`} style={glassStyle}>
                <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                  <i className="fa-solid fa-spinner fa-spin text-2xl text-green-500" />
                </div>
                <p className="text-sm font-semibold text-slate-700">
                  Reading {serviceTitle || "form"} fields from the portal…
                </p>
                <p className="text-xs text-slate-400">Playwright is extracting labels, IDs, and field types live.</p>
              </div>
            ) : hasActiveForm ? (
              <div className={`${glassCard} overflow-hidden flex flex-col h-full`} style={glassStyle}>
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-5 py-4 flex items-center gap-3 shrink-0">
                  <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                    <i className="fa-solid fa-file-lines text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Live Portal Schema</p>
                    <h2 className="text-sm font-bold text-white">{serviceTitle}</h2>
                    {lang && lang !== "en" && (
                      <p className="text-[9px] text-white/50 mt-0.5">Voice: {LANG_LABELS[lang]} · Form filled in English</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-white/60 font-mono">
                      {Math.min(fieldIdx, allFields.length)}/{allFields.length}
                    </p>
                    <div className="w-20 h-1 bg-white/20 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-white/70 rounded-full transition-all duration-500"
                        style={{ width: `${Math.round((Math.min(fieldIdx, allFields.length) / allFields.length) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {allFields.map((field) => {
                      const value = formData[field.id];
                      const isActive = currField?.id === field.id && phase === "collecting";
                      const isBeingCorrected = corrFieldId === field.id && phase === "correction_value";
                      const isFilled = !!value;
                      return (
                        <div
                          key={field.id}
                          className={`rounded-xl border p-3 transition-all duration-300 ${
                            isActive || isBeingCorrected
                              ? "border-green-400/60 bg-green-50 shadow-sm"
                              : isFilled
                                ? "border-emerald-300/50 bg-emerald-50/60"
                                : "border-slate-200/60 bg-white/60"
                          }`}
                        >
                          <label
                            className={`block text-[10px] font-bold uppercase tracking-wider mb-1.5 ${
                              isActive || isBeingCorrected ? "text-green-600" : isFilled ? "text-emerald-600" : "text-slate-400"
                            }`}
                          >
                            {field.label}
                            {(isActive || isBeingCorrected) && <span className="ml-1.5 animate-pulse">●</span>}
                          </label>
                          <div className={`text-xs font-mono leading-snug min-h-[18px] ${isFilled ? "text-slate-700" : "text-slate-400 italic"}`}>
                            {isFilled ? value : field.placeholder || `#${field.id}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {phase === "done" && (
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
                      <i className="fa-solid fa-circle-check text-emerald-500 text-2xl flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-700">Form Submitted Successfully</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Session data exists only in memory and is cleared when you start a new session.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 content-start">
                {SERVICES.map((s, i) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => handleFormCardClick(s.key)}
                    disabled={phase === "init"}
                    className={`${glassCard} p-4 text-left flex flex-col gap-1 transition-all duration-150${
                      i === 2 ? " col-span-2" : ""
                    } ${phase === "init" ? "opacity-40 cursor-not-allowed" : "hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] cursor-pointer"}`}
                    style={glassStyle}
                  >
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-2 ${i === 0 ? "bg-blue-100" : i === 1 ? "bg-teal-100" : "bg-indigo-100"}`}>
                      <i className={`fa-solid fa-file-lines text-lg ${i === 0 ? "text-blue-600" : i === 1 ? "text-teal-600" : "text-indigo-600"}`} />
                    </div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Government Services</p>
                    <h3 className="text-sm font-bold text-slate-800 leading-snug">{s.label}</h3>
                    <p className="text-[11px] text-slate-500 leading-relaxed">Fields are read live via Playwright.</p>
                    <div
                      className="mt-2 self-start text-xs font-medium text-slate-600 rounded-lg px-3 py-1.5"
                      style={{ border: "1px solid rgba(203,213,225,0.9)", background: "rgba(255,255,255,0.5)" }}
                    >
                      {i === 2 ? "Start Session" : "Action Session"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Pop-up Modal 1: Open Form notification */}
      {showOpenModal && selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full mx-4 shadow-2xl border border-slate-100 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                <i className="fa-solid fa-circle-info text-xl" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">{selectedService.label} Form</h3>
                <p className="text-[10px] uppercase font-bold tracking-wide text-slate-400">Portal Request</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              A security verification layer has been detected on the portal. Please click <strong>Open</strong> to view the security check interface.
            </p>
            <div className="flex gap-3 justify-end mt-2">
              <button
                type="button"
                onClick={() => {
                  setShowOpenModal(false);
                  setSelectedService(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOpenModal(false);
                  setShowCaptchaModal(true);
                }}
                className="px-6 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-md shadow-blue-500/20 active:scale-95"
              >
                Open
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up Modal 2: ReCAPTCHA Mimic with OK button */}
      {showCaptchaModal && selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full mx-4 shadow-2xl border border-slate-100 flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                <i className="fa-solid fa-shield-halved text-xl" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Portal Verification</h3>
                <p className="text-[10px] uppercase font-bold tracking-wide text-slate-400">Security Check</p>
              </div>
            </div>

            {/* Google ReCAPTCHA Mimic */}
            <div 
              onClick={handleCaptchaClick}
              className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex items-center justify-between shadow-inner cursor-pointer hover:bg-slate-100/50 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-6 h-6 rounded border border-slate-300 bg-white flex items-center justify-center select-none shrink-0 shadow-sm">
                  {captchaSpinning && (
                    <i className="fa-solid fa-circle-notch fa-spin text-xs text-blue-500" />
                  )}
                  {captchaChecked && (
                    <i className="fa-solid fa-check text-green-600 text-sm font-bold" />
                  )}
                </div>
                <span className="text-xs font-semibold text-slate-700 select-none">I&apos;m not a robot</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 opacity-80 shrink-0 text-slate-400">
                <i className="fa-solid fa-arrows-spin text-lg text-blue-500 animate-spin" style={{ animationDuration: '4s' }} />
                <span className="text-[7px] tracking-wider uppercase font-bold">Secure</span>
                <span className="text-[6px]">reCAPTCHA</span>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowCaptchaModal(false);
                  setSelectedService(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!captchaChecked}
                onClick={confirmAndLoadService}
                className={`px-6 py-2 rounded-xl text-xs font-bold text-white transition-all duration-150 ${
                  !captchaChecked
                    ? "bg-slate-300 cursor-not-allowed shadow-none"
                    : "bg-green-600 hover:bg-green-700 active:scale-95 shadow-md shadow-green-500/20"
                }`}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


