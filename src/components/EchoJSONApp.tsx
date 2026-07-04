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

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | "init"             // model loading
  | "ready"            // model loaded, waiting for user
  | "await_language"   // asking which language (en / hi / bn)
  | "await_form"       // said greeting, listening for form choice
  | "collecting"       // asking & collecting fields one by one
  | "await_confirm"    // summarised, listening for yes/no
  | "correction_field" // listening for which field to correct
  | "correction_value" // listening for the corrected value
  | "done";            // session complete

type Field = { id: string; label: string; placeholder: string };
type Section = { title: string; fields: Field[] };
type FormDef = {
  id: number;
  title: string;
  desc: string;
  icon: string;
  gradient: string;
  sections: Section[];
};
type ChatMsg = { id: string; role: "agent" | "user"; text: string };

let _mid = 0;
const uid = () => `m${++_mid}`;

// ─── Form Definitions ─────────────────────────────────────────────────────────

const FORMS: FormDef[] = [
  {
    id: 1,
    title: "Personal Registration",
    desc: "Identity, contact & address details",
    icon: "fa-id-card",
    gradient: "from-blue-600 to-indigo-600",
    sections: [
      {
        title: "Identity",
        fields: [
          { id: "full_name", label: "Full Name", placeholder: "Enter your full name" },
          { id: "dob", label: "Date of Birth", placeholder: "DD / MM / YYYY" },
          { id: "gender", label: "Gender", placeholder: "Male / Female / Other" },
        ],
      },
      {
        title: "Contact",
        fields: [
          { id: "email", label: "Email Address", placeholder: "you@example.com" },
          { id: "phone", label: "Phone Number", placeholder: "+91 98765 43210" },
        ],
      },
      {
        title: "Address",
        fields: [
          { id: "street", label: "Street / Area", placeholder: "House no., Street, Locality" },
          { id: "city", label: "City", placeholder: "Enter your city" },
          { id: "pincode", label: "PIN Code", placeholder: "6-digit PIN" },
        ],
      },
    ],
  },
  {
    id: 2,
    title: "Medical Appointment",
    desc: "Patient information & booking request",
    icon: "fa-stethoscope",
    gradient: "from-emerald-600 to-teal-600",
    sections: [
      {
        title: "Patient Details",
        fields: [
          { id: "patient_name", label: "Patient Name", placeholder: "Full name of patient" },
          { id: "age", label: "Age", placeholder: "Patient's age" },
          { id: "blood_group", label: "Blood Group", placeholder: "e.g. A+, B−, O+" },
        ],
      },
      {
        title: "Medical Information",
        fields: [
          { id: "condition", label: "Condition / Symptoms", placeholder: "Brief description" },
          { id: "doctor", label: "Preferred Doctor", placeholder: "Doctor name or specialty" },
          { id: "appt_date", label: "Preferred Date", placeholder: "DD / MM / YYYY" },
        ],
      },
      {
        title: "Insurance",
        fields: [
          { id: "insurance_id", label: "Insurance ID", placeholder: "Policy number" },
          { id: "insurer", label: "Provider", placeholder: "Insurance company name" },
        ],
      },
    ],
  },
  {
    id: 3,
    title: "Job Application",
    desc: "Employment application & qualifications",
    icon: "fa-briefcase",
    gradient: "from-amber-600 to-orange-600",
    sections: [
      {
        title: "Applicant",
        fields: [
          { id: "app_name", label: "Full Name", placeholder: "Your legal full name" },
          { id: "app_email", label: "Email", placeholder: "professional@email.com" },
          { id: "app_phone", label: "Phone", placeholder: "+91 XXXXX XXXXX" },
        ],
      },
      {
        title: "Experience",
        fields: [
          { id: "position", label: "Position Applied", placeholder: "Job title or role" },
          { id: "experience", label: "Years of Experience", placeholder: "e.g. 3 years" },
          { id: "company", label: "Current Company", placeholder: "Company name" },
        ],
      },
      {
        title: "Qualifications",
        fields: [
          { id: "education", label: "Highest Education", placeholder: "Degree & institution" },
          { id: "skills", label: "Key Skills", placeholder: "e.g. React, Python, SQL" },
        ],
      },
    ],
  },
  {
    id: 4,
    title: "Travel & Visa",
    desc: "Travel application & visa request form",
    icon: "fa-passport",
    gradient: "from-purple-600 to-pink-600",
    sections: [
      {
        title: "Applicant",
        fields: [
          { id: "trav_name", label: "Full Name", placeholder: "Name as on passport" },
          { id: "passport_no", label: "Passport No.", placeholder: "e.g. P1234567" },
          { id: "nationality", label: "Nationality", placeholder: "Country of citizenship" },
        ],
      },
      {
        title: "Travel Details",
        fields: [
          { id: "destination", label: "Destination", placeholder: "Country to visit" },
          { id: "depart_date", label: "Departure Date", placeholder: "DD / MM / YYYY" },
          { id: "return_date", label: "Return Date", placeholder: "DD / MM / YYYY" },
          { id: "duration", label: "Duration of Stay", placeholder: "e.g. 10 days" },
        ],
      },
      {
        title: "Purpose & Accommodation",
        fields: [
          { id: "purpose", label: "Purpose of Visit", placeholder: "Tourism / Business / Study" },
          { id: "accommodation", label: "Accommodation", placeholder: "Hotel or host address" },
        ],
      },
    ],
  },
];

// ─── Dialogue Utilities ───────────────────────────────────────────────────────

function flatFields(form: FormDef): Field[] {
  return form.sections.flatMap((s) => s.fields);
}

function parseFormNum(text: string): number | null {
  const t = text.toLowerCase();
  if (/\b(1|one|first|personal|registration|एक|पहला|প্রথম|ek|ekota)\b/.test(t)) return 1;
  if (/\b(2|two|second|medical|appointment|दो|दूसरा|দুই|দ্বিতীয়|dui)\b/.test(t)) return 2;
  if (/\b(3|three|third|job|employment|application|तीन|तीसरा|তিন|তৃতীয়|tin)\b/.test(t)) return 3;
  if (/\b(4|four|fourth|travel|visa|passport|चार|चौथा|চার|চতুর্থ|char)\b/.test(t)) return 4;
  return null;
}

function buildSummary(
  form: FormDef,
  data: Record<string, string>,
  lang: Lang
): string {
  const fields = flatFields(form);
  const np = PHRASES.notProvided[lang];
  const lines = fields
    .map((f) => `${f.label}: ${data[f.id] || np}`)
    .join(". ");
  return PHRASES.summaryIntro[lang](form.title, lines);
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

  // ── Dialogue state refs (used inside callbacks – no stale closures) ────────
  const phaseRef = useRef<Phase>("init");
  const langRef = useRef<Lang | null>(null);
  const formIdRef = useRef<number | null>(null);
  const dataRef = useRef<Record<string, string>>({});
  const fieldIdxRef = useRef<number>(0);
  const corrFieldRef = useRef<Field | null>(null);
  // ID of field currently being filled (drives real-time streaming into form)
  const activeFieldIdRef = useRef<string | null>(null);

  // ── React state (for rendering) ────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("init");
  const [lang, setLang] = useState<Lang | null>(null);
  const [formId, setFormId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [fieldIdx, setFieldIdx] = useState(0);
  const [corrFieldId, setCorrFieldId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [isRecording, setIsRecording] = useState(false);
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

  const addMsg = useCallback((role: "agent" | "user", text: string) => {
    setChat((prev) => [...prev, { id: uid(), role, text }]);
  }, []);

  // ── TTS ─────────────────────────────────────────────────────────────────────

  const speakText = useCallback((text: string, speakLang: Lang, onDone?: () => void) => {
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
    utt.rate = speakLang === "bn" ? 0.95 : 1.05;
    utt.lang = speakLang === "en" ? "en-IN" : speakLang === "hi" ? "hi-IN" : "bn-IN";

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
      onDone?.();
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
      if (!parts.length) {
        onDone?.();
        return;
      }
      let i = 0;
      const next = () => {
        if (i >= parts.length) {
          onDone?.();
          return;
        }
        const part = parts[i++];
        speakText(part.text, part.lang, () => {
          window.setTimeout(next, 150);
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

  // ── Transcription ────────────────────────────────────────────────────────────

  const transcribeAudio = useCallback(
    async (
      chunks: Blob[],
      options?: { toEnglish?: boolean; onToken?: (partial: string) => void }
    ): Promise<string> => {
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

        const instruction = options?.toEnglish
          ? "Transcribe the audio and translate it to English. Return ONLY the English text, no annotations or commentary."
          : "Transcribe the audio exactly. Return ONLY the verbatim spoken words, no annotations or commentary.";

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
            options?.onToken?.(out.trim());
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

  /** Translate spoken text to English via Gemma (text-only fallback) */
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

  // ── Forward refs to break circular dependency ──────────────────────────────
  const processTxRef = useRef<
    ((rawText: string, englishText: string) => Promise<void>) | null
  >(null);
  const startRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const submitFormRef = useRef<(() => Promise<void>) | null>(null);

  // ── Recording ────────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (!modelLoadedRef.current) return;
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
      cancelAnimationFrame(rafRef.current);
      setIsRecording(false);
      setIsTranscribing(true);

      const fieldId = activeFieldIdRef.current;
      const needsEnglish =
        !!fieldId &&
        (phaseRef.current === "collecting" ||
          phaseRef.current === "correction_value");

      // Transcribe; stream English directly into form field when collecting
      const rawText = await transcribeAudio(audioChunksRef.current, {
        toEnglish: needsEnglish,
        onToken: fieldId
          ? (partial) => {
              setFormData((prev) => ({ ...prev, [fieldId]: partial }));
            }
          : undefined,
      });

      addMsg("user", rawText);

      // Form fields are always stored in English (transcribe already translated when needsEnglish)
      let englishText = rawText;
      if (
        needsEnglish &&
        langRef.current &&
        langRef.current !== "en" &&
        rawText &&
        rawText !== "[unclear]"
      ) {
        // Fallback: refine translation if audio step returned non-Latin script
        if (/[\u0900-\u097F\u0980-\u09FF]/.test(rawText)) {
          englishText = await translateToEnglish(rawText);
          if (fieldId) {
            setFormData((prev) => ({ ...prev, [fieldId]: englishText }));
          }
        }
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
  }, [addMsg, drawViz, transcribeAudio, translateToEnglish]);

  startRecordingRef.current = startRecording;

  // ── Dialogue State Machine ───────────────────────────────────────────────────

  const processTranscription = useCallback(
    async (rawText: string, englishText: string) => {
      const phase = phaseRef.current;
      const fId = formIdRef.current;
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

      // ── Form selection ──
      if (phase === "await_form") {
        if (isUnclearTranscript(rawText)) {
          const resp = `${PHRASES.didntCatch[l]} ${PHRASES.formChoiceAgain[l]}`;
          addMsg("agent", resp);
          speakText(resp, l, () => startRecordingRef.current?.());
          return;
        }
        const num = parseFormNum(rawText);
        if (num !== null) {
          const form = FORMS.find((f) => f.id === num)!;
          const fields = flatFields(form);
          formIdRef.current = num;
          dataRef.current = {};
          fieldIdxRef.current = 0;
          activeFieldIdRef.current = fields[0].id;
          setFormId(num);
          setFormData({});
          setFieldIdx(0);
          const q = fieldQuestion(l, fields[0].id, fields[0].label);
          const resp = PHRASES.openingForm[l](num, form.title, q);
          addMsg("agent", resp);
          syncPhase("collecting");
          speakText(resp, l, () => startRecordingRef.current?.());
        } else {
          const resp = PHRASES.formChoiceAgain[l];
          addMsg("agent", resp);
          speakText(resp, l, () => startRecordingRef.current?.());
        }
        return;
      }

      // ── Field collection (store English in form) ──
      if (phase === "collecting") {
        const form = FORMS.find((f) => f.id === fId)!;
        const fields = flatFields(form);
        const idx = fieldIdxRef.current;
        const field = fields[idx];

        if (isUnclearTranscript(englishText)) {
          activeFieldIdRef.current = field.id;
          setFormData((prev) => {
            const next = { ...prev };
            delete next[field.id];
            return next;
          });
          const q = fieldQuestion(l, field.id, field.label);
          const resp = `${PHRASES.didntCatch[l]} ${q}`;
          addMsg("agent", resp);
          activeFieldIdRef.current = field.id;
          speakText(resp, l, () => startRecordingRef.current?.());
          return;
        }

        const newData = { ...dataRef.current, [field.id]: englishText };
        dataRef.current = newData;
        setFormData({ ...newData });

        const nextIdx = idx + 1;
        if (nextIdx < fields.length) {
          fieldIdxRef.current = nextIdx;
          activeFieldIdRef.current = fields[nextIdx].id;
          setFieldIdx(nextIdx);
          const q = fieldQuestion(l, fields[nextIdx].id, fields[nextIdx].label);
          const resp = PHRASES.gotItNext[l](q);
          addMsg("agent", resp);
          speakText(resp, l, () => startRecordingRef.current?.());
        } else {
          fieldIdxRef.current = fields.length;
          activeFieldIdRef.current = null;
          setFieldIdx(fields.length);
          const summary = buildSummary(form, newData, l);
          addMsg("agent", summary);
          syncPhase("await_confirm");
          speakText(summary, l, () => startRecordingRef.current?.());
        }
        return;
      }

      // ── Confirmation ──
      if (phase === "await_confirm") {
        if (isUnclearTranscript(rawText)) {
          const resp = PHRASES.didntCatch[l];
          addMsg("agent", resp);
          speakText(resp, l, () => startRecordingRef.current?.());
          return;
        }
        if (isYes(rawText, l)) {
          const resp = PHRASES.submitSuccess[l];
          addMsg("agent", resp);
          syncPhase("done");
          activeFieldIdRef.current = null;
          speakText(resp, l);
          await submitFormRef.current?.();
        } else {
          const resp = PHRASES.correctWhichField[l];
          addMsg("agent", resp);
          syncPhase("correction_field");
          speakText(resp, l, () => startRecordingRef.current?.());
        }
        return;
      }

      // ── Correction: which field ──
      if (phase === "correction_field") {
        const form = FORMS.find((f) => f.id === fId)!;
        const fields = flatFields(form);
        const matched = matchFieldMultilingual(rawText, fields);
        if (matched) {
          const fullField = fields.find((f) => f.id === matched.id)!;
          corrFieldRef.current = fullField;
          activeFieldIdRef.current = fullField.id;
          setCorrFieldId(fullField.id);
          const resp = PHRASES.correctWhatValue[l](fullField.label);
          addMsg("agent", resp);
          syncPhase("correction_value");
          speakText(resp, l, () => startRecordingRef.current?.());
        } else {
          const resp = PHRASES.fieldNotMatched[l];
          addMsg("agent", resp);
          speakText(resp, l, () => startRecordingRef.current?.());
        }
        return;
      }

      // ── Correction: new value (store English) ──
      if (phase === "correction_value") {
        const field = corrFieldRef.current!;
        if (isUnclearTranscript(englishText)) {
          activeFieldIdRef.current = field.id;
          const resp = `${PHRASES.didntCatch[l]} ${PHRASES.correctWhatValue[l](field.label)}`;
          addMsg("agent", resp);
          speakText(resp, l, () => startRecordingRef.current?.());
          return;
        }
        const form = FORMS.find((f) => f.id === fId)!;
        const newData = { ...dataRef.current, [field.id]: englishText };
        dataRef.current = newData;
        setFormData({ ...newData });
        corrFieldRef.current = null;
        activeFieldIdRef.current = null;
        setCorrFieldId(null);
        const summary = buildSummary(form, newData, l);
        const resp = `${PHRASES.updatedField[l](field.label, englishText)} ${summary}`;
        addMsg("agent", resp);
        syncPhase("await_confirm");
        speakText(resp, l, () => startRecordingRef.current?.());
        return;
      }
    },
    [addMsg, speakSequence, speakText, syncPhase]
  );

  useEffect(() => {
    processTxRef.current = processTranscription;
  }, [processTranscription]);

  // ── Backend Submission ───────────────────────────────────────────────────────

  const submitForm = useCallback(async () => {
    const fId = formIdRef.current;
    const form = FORMS.find((f) => f.id === fId);
    if (!form) return;
    try {
      await fetch("/api/fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_id: fId,
          form_title: form.title,
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

  // ── Session Controls ─────────────────────────────────────────────────────────

  const handleStartSession = useCallback(() => {
    if (phaseRef.current !== "ready") return;
    const combined = LANG_PICK_GREETING.map((p) => p.text).join("\n\n");
    addMsg("agent", combined);
    syncPhase("await_language");
    speakSequence(LANG_PICK_GREETING, () => startRecordingRef.current?.());
  }, [addMsg, speakSequence, syncPhase]);

  const handleFormCardClick = useCallback(
    (id: number) => {
      const p = phaseRef.current;
      if (
        !modelLoadedRef.current ||
        p === "collecting" ||
        p === "await_confirm" ||
        p === "correction_field" ||
        p === "correction_value" ||
        p === "done" ||
        p === "await_language"
      )
        return;

      // If language not chosen yet, pick English by default then open form
      const l = langRef.current ?? "en";
      if (!langRef.current) {
        langRef.current = "en";
        setLang("en");
      }

      const form = FORMS.find((f) => f.id === id)!;
      const fields = flatFields(form);
      formIdRef.current = id;
      dataRef.current = {};
      fieldIdxRef.current = 0;
      activeFieldIdRef.current = fields[0].id;
      corrFieldRef.current = null;
      setFormId(id);
      setFormData({});
      setFieldIdx(0);
      setCorrFieldId(null);

      const q = fieldQuestion(l, fields[0].id, fields[0].label);
      const resp = PHRASES.openingForm[l](id, form.title, q);
      addMsg("agent", resp);
      syncPhase("collecting");
      speakText(resp, l, () => startRecordingRef.current?.());
    },
    [addMsg, speakText, syncPhase]
  );

  const handleReset = useCallback(() => {
    window.speechSynthesis?.cancel();
    cancelAnimationFrame(rafRef.current);
    try {
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop();
      }
    } catch {
      // ignore
    }
    formIdRef.current = null;
    langRef.current = null;
    dataRef.current = {};
    fieldIdxRef.current = 0;
    corrFieldRef.current = null;
    activeFieldIdRef.current = null;
    setFormId(null);
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

  const activeForm = FORMS.find((f) => f.id === formId) ?? null;
  const allFields = activeForm ? flatFields(activeForm) : [];
  const currField = phase === "collecting" ? (allFields[fieldIdx] ?? null) : null;

  const statusLabel = (() => {
    if (phase === "init") return "Loading Model";
    if (isRecording) return "Listening";
    if (isTranscribing) return "Processing";
    if (agentSpeaking) return "Speaking";
    if (phase === "done") return "Session Complete";
    if (phase === "await_confirm") return "Awaiting Confirmation";
    if (phase === "await_language") return "Choose Language";
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

  const micIcon = (() => {
    if (phase === "init" || isTranscribing) return "fa-spinner animate-spin";
    if (isRecording) return "fa-microphone-lines animate-pulse";
    if (agentSpeaking) return "fa-volume-high animate-pulse";
    if (phase === "done") return "fa-check";
    return "fa-microphone";
  })();

  const micLabel = (() => {
    if (phase === "init") return "Loading";
    if (isRecording) return "Listening";
    if (isTranscribing) return "Thinking";
    if (agentSpeaking) return "Speaking";
    if (phase === "done") return "Done";
    if (phase === "ready") return "Start";
    return "Auto";
  })();

  const micDisabled =
    phase === "init" || isTranscribing || agentSpeaking || isRecording;
  const micClickable = phase === "ready";

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Background glow */}
      <div className="glow-sphere w-96 h-96 bg-brand-500 -top-24 -left-24 animate-pulse-slow" />
      <div
        className="glow-sphere w-[500px] h-[500px] bg-purple-500 -bottom-32 -right-32 animate-pulse-slow"
        style={{ animationDelay: "1.5s" }}
      />

      <div className="flex-1 flex flex-col max-w-7xl w-full mx-auto px-4 py-6 gap-5">
        {/* ── Header ── */}
        <header className="flex justify-between items-center border-b border-slate-800/60 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <i className="fa-solid fa-microphone-lines text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
                EchoJSON
              </h1>
              <p className="text-[11px] text-slate-400">
                Voice-Driven Form Automation · On-Device WebGPU
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lang && (
              <span className="text-[10px] uppercase font-semibold px-2 py-1 rounded bg-brand-500/10 text-brand-300 border border-brand-500/20">
                {LANG_LABELS[lang]}
              </span>
            )}
            {phase !== "init" && phase !== "ready" && (
              <button
                onClick={handleReset}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-slate-300 hover:text-white transition flex items-center gap-1.5"
              >
                <i className="fa-solid fa-rotate-left" /> New Session
              </button>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700/80">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className={`animate-ping absolute inset-0 rounded-full opacity-75 ${dotColor}`}
                />
                <span className={`relative rounded-full h-2.5 w-2.5 ${dotColor}`} />
              </span>
              <span className="text-xs font-medium text-slate-300">
                {statusLabel}
              </span>
            </div>
          </div>
        </header>

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-200 px-4 py-3 rounded-2xl flex items-start gap-3">
            <i className="fa-solid fa-circle-exclamation text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs flex-1">{error}</p>
            <button type="button" onClick={() => setError(null)}>
              <i className="fa-solid fa-xmark text-red-400 hover:text-red-300" />
            </button>
          </div>
        )}

        {/* ── Main ── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* ── Left: Voice panel ── */}
          <aside className="lg:col-span-2 flex flex-col gap-4">
            {/* Download progress */}
            {phase === "init" && (
              <div className="glass-panel rounded-3xl p-5">
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-semibold text-white">
                    Downloading Gemma 4 E2B
                  </span>
                  <span className="text-xs text-brand-400 font-mono">
                    {dlPct}%
                  </span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-brand-600 to-purple-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${dlPct}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
                  Downloading ~1.5 GB model. It will be cached in your browser
                  for future sessions.
                </p>
              </div>
            )}

            {/* How it works card */}
            {(phase === "ready" || phase === "await_language" || phase === "await_form") && (
              <div className="glass-panel rounded-3xl p-5">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-2">
                  <i className="fa-solid fa-wand-magic-sparkles text-brand-500" />
                  How it works
                </h2>
                <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li>Click <strong className="text-slate-300">Start</strong> — agent asks in English, Hindi &amp; Bengali which language you prefer</li>
                  <li>Say <strong className="text-slate-300">Hindi</strong>, <strong className="text-slate-300">English</strong>, or <strong className="text-slate-300">Bengali</strong> — entire conversation continues in that language</li>
                  <li>Pick a form and answer each field by voice — your speech is translated to <strong className="text-slate-300">English</strong> in the form</li>
                  <li>Agent reads back a summary; say <strong className="text-slate-300">&quot;Yes&quot;</strong> / <strong className="text-slate-300">हाँ</strong> / <strong className="text-slate-300">হ্যাঁ</strong> to submit</li>
                  <li>Name any field to correct it — session data clears on reset</li>
                </ol>
              </div>
            )}

            {/* Chat transcript */}
            <div
              className="glass-panel rounded-3xl flex flex-col overflow-hidden flex-1"
              style={{ minHeight: "240px" }}
            >
              <div className="px-4 py-3 border-b border-slate-800/60">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Voice Conversation
                </p>
              </div>
              <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-2.5">
                {chat.length === 0 && (
                  <p className="text-xs text-slate-500 italic text-center py-6">
                    {phase === "init"
                      ? "Loading model…"
                      : "Click Start or select a form to begin"}
                  </p>
                )}
                {chat.map((msg) => (
                  <div
                    key={msg.id}
                    className={
                      msg.role === "user" ? "flex justify-end" : "flex justify-start"
                    }
                  >
                    <div
                      className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "bg-gradient-to-tr from-brand-600 to-purple-600 text-white rounded-br-sm"
                          : "bg-slate-800/80 border border-slate-700/40 text-slate-200 rounded-bl-sm"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Mic button + visualiser */}
            <div
              className="glass-panel rounded-3xl p-5 flex flex-col items-center gap-3 relative overflow-hidden"
              style={{ minHeight: "150px" }}
            >
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full opacity-[0.12] pointer-events-none rounded-3xl"
              />
              <div className="z-10 flex flex-col items-center gap-3 w-full">
                <p className="text-[11px] text-slate-400 text-center font-medium min-h-[14px]">
                  {phase === "init" && "Loading model, please wait…"}
                  {phase === "ready" && "Press Start — choose English, Hindi, or Bengali"}
                  {phase === "await_language" &&
                    (isRecording
                      ? "Listening — say English, Hindi, or Bengali"
                      : agentSpeaking
                      ? "Agent speaking in 3 languages…"
                      : "Preparing…")}
                  {phase === "await_form" &&
                    (isRecording
                      ? "Listening — say Form 1, 2, 3, or 4"
                      : agentSpeaking
                      ? "Agent speaking…"
                      : "Preparing…")}
                  {phase === "collecting" &&
                    currField &&
                    (isRecording
                      ? `Listening — ${currField.label}`
                      : agentSpeaking
                      ? "Agent speaking…"
                      : `Next field: ${currField.label}`)}
                  {phase === "await_confirm" &&
                    (isRecording
                      ? "Listening — say Yes to submit or name a field to correct"
                      : agentSpeaking
                      ? "Agent speaking…"
                      : "Say yes to submit, or name a field to correct")}
                  {(phase === "correction_field" ||
                    phase === "correction_value") &&
                    (isRecording
                      ? "Listening…"
                      : agentSpeaking
                      ? "Agent speaking…"
                      : "Ready")}
                  {phase === "done" &&
                    "Session complete — click New Session to start over"}
                </p>

                <button
                  type="button"
                  disabled={micDisabled && !isRecording && !agentSpeaking}
                  onClick={micClickable ? handleStartSession : undefined}
                  className={`relative w-20 h-20 rounded-full flex flex-col items-center justify-center gap-1 shadow-2xl transition duration-150 select-none ${
                    isRecording
                      ? "bg-gradient-to-tr from-red-600 to-red-700 text-white shadow-red-600/30 cursor-default"
                      : isTranscribing
                      ? "bg-slate-700 text-slate-400 cursor-wait"
                      : agentSpeaking
                      ? "bg-gradient-to-tr from-blue-600 to-indigo-700 text-white cursor-default"
                      : phase === "done"
                      ? "bg-emerald-700 text-white cursor-default"
                      : phase === "init"
                      ? "bg-slate-800 text-slate-500 cursor-not-allowed opacity-60"
                      : "bg-gradient-to-tr from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white cursor-pointer active:scale-95"
                  }`}
                >
                  <i className={`fa-solid ${micIcon} text-xl`} />
                  <span className="text-[9px] font-bold uppercase tracking-wider">
                    {micLabel}
                  </span>
                  {isRecording && (
                    <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ripple" />
                  )}
                </button>
              </div>
            </div>
          </aside>

          {/* ── Right: Form panel ── */}
          <section className="lg:col-span-3 flex flex-col gap-4">
            {!activeForm ? (
              /* 2×2 form card grid */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                {FORMS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleFormCardClick(f.id)}
                    disabled={phase === "init"}
                    className={`glass-panel rounded-3xl p-5 text-left flex flex-col gap-3 border border-slate-800/80 transition-all duration-200 ${
                      phase === "init"
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:border-slate-600/60 hover:scale-[1.015] active:scale-[0.985] cursor-pointer"
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${f.gradient} flex items-center justify-center shadow-lg`}
                    >
                      <i className={`fa-solid ${f.icon} text-white text-xl`} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                        Form {f.id}
                      </p>
                      <h3 className="text-sm font-bold text-white">{f.title}</h3>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {f.desc}
                      </p>
                    </div>
                    <div className="mt-auto pt-2.5 border-t border-slate-800/40 flex items-center justify-between text-[10px] text-slate-500">
                      <span>
                        <i className="fa-solid fa-layer-group mr-1.5" />
                        {f.sections.length} sections
                      </span>
                      <span>
                        <i className="fa-solid fa-bars mr-1.5" />
                        {flatFields(f).length} fields
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              /* Active form being filled */
              <div className="glass-panel rounded-3xl overflow-hidden flex flex-col flex-1">
                {/* Form header with gradient */}
                <div
                  className={`bg-gradient-to-r ${activeForm.gradient} px-5 py-4 flex items-center gap-3`}
                >
                  <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                    <i className={`fa-solid ${activeForm.icon} text-white`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                      Form {activeForm.id}
                    </p>
                    <h2 className="text-sm font-bold text-white">
                      {activeForm.title}
                    </h2>
                    {lang && lang !== "en" && (
                      <p className="text-[9px] text-white/50 mt-0.5">
                        Voice: {LANG_LABELS[lang]} · Form filled in English
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-white/60 font-mono">
                      {Math.min(fieldIdx, allFields.length)}/{allFields.length}
                    </p>
                    <div className="w-20 h-1 bg-white/20 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-white/70 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.round(
                            (Math.min(fieldIdx, allFields.length) /
                              allFields.length) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Sections + fields */}
                <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
                  {activeForm.sections.map((section) => (
                    <div key={section.title}>
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                        <span className="h-px flex-1 bg-slate-800/60" />
                        {section.title}
                        <span className="h-px flex-1 bg-slate-800/60" />
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {section.fields.map((field) => {
                          const value = formData[field.id];
                          const isActive =
                            currField?.id === field.id &&
                            phase === "collecting";
                          const isBeingCorrected =
                            corrFieldId === field.id &&
                            phase === "correction_value";
                          const isFilled = !!value;

                          return (
                            <div
                              key={field.id}
                              className={`rounded-xl border p-3 transition-all duration-300 ${
                                isActive || isBeingCorrected
                                  ? "border-brand-500/60 bg-brand-500/10 shadow-sm shadow-brand-500/10"
                                  : isFilled
                                  ? "border-emerald-500/25 bg-emerald-500/5"
                                  : "border-slate-800/50 bg-slate-900/30"
                              }`}
                            >
                              <label
                                className={`block text-[10px] font-bold uppercase tracking-wider mb-1.5 ${
                                  isActive || isBeingCorrected
                                    ? "text-brand-400"
                                    : isFilled
                                    ? "text-emerald-400"
                                    : "text-slate-600"
                                }`}
                              >
                                {field.label}
                                {(isActive || isBeingCorrected) && (
                                  <span className="ml-1.5 animate-pulse">
                                    ●
                                  </span>
                                )}
                              </label>
                              <div
                                className={`text-xs font-mono leading-snug min-h-[18px] ${
                                  isFilled
                                    ? "text-slate-100"
                                    : "text-slate-600 italic"
                                }`}
                              >
                                {isFilled ? value : field.placeholder}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Done state */}
                  {phase === "done" && (
                    <div className="mt-1 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
                      <i className="fa-solid fa-circle-check text-emerald-400 text-2xl flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-300">
                          Form Submitted Successfully
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Session data exists only in memory and is cleared when
                          you start a new session.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-700 pt-4 border-t border-slate-800/30">
          EchoJSON · On-device WebGPU · Gemma 4 E2B · Session-scoped · No data
          persisted
        </footer>
      </div>
    </>
  );
}
