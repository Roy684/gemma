export type Lang = "en" | "hi" | "bn";

export const LANG_LABELS: Record<Lang, string> = {
  en: "English",
  hi: "Hindi",
  bn: "Bengali",
};

export const LANG_BCP47: Record<Lang, string> = {
  en: "en-IN",
  hi: "hi-IN",
  bn: "bn-IN",
};

/** Trilingual language-pick greeting — each line spoken in its own voice */
export const LANG_PICK_GREETING: { text: string; lang: Lang }[] = [
  {
    lang: "en",
    text: "Hello! Which language? English, Hindi, or Bengali?",
  },
  {
    lang: "hi",
    text: "नमस्ते! कौन सी भाषा? अंग्रेज़ी, हिंदी, या बंगाली?",
  },
  {
    lang: "bn",
    text: "হ্যালো! কোন ভাষা? ইংরেজি, হিন্দি, নাকি বাংলা?",
  },
];

export function parseLanguage(text: string): Lang | null {
  const t = text.toLowerCase();
  if (
    /\b(english|angrezi|angreji|inglish|angrez)\b|ইংরেজি|ইংরেজী|अंग्रेज़ी|अंग्रेजी/i.test(
      t
    )
  )
    return "en";
  if (/\b(hindi|hindustani|hind)\b|हिंदी|हिन्दी|हिन्दि|হিন্দি|হিন্দী/i.test(t)) return "hi";
  if (
    /\b(bengali|bangla|bangali|beng)\b|বাংলা|বাঙালি|বেঙ্গালি/i.test(t)
  )
    return "bn";
  return null;
}

export function isYes(text: string, lang: Lang): boolean {
  const t = text.toLowerCase();
  if (lang === "hi") {
    return /\b(haan|ha|han|ji|sahi|theek|thik|submit|yes)\b|ठीक|हाँ|हां|जी|सही|सब\s+ठीक/i.test(
      t
    );
  }
  if (lang === "bn") {
    return /\b(haan|ha|hyan|hyn|thik|submit|yes)\b|ঠিক|হ্যাঁ|হা|জি|সঠিক/i.test(
      t
    );
  }
  return /\b(yes|yeah|yep|yup|correct|right|submit|confirm|go\s+ahead|looks\s+good|all\s+correct|perfect|sure|ok|okay|fine)\b|that.?s\s+(right|correct)/i.test(
    t
  );
}

/** Localised agent phrases — kept short to reduce TTS time */
export const PHRASES = {
  langChoiceAgain: {
    en: "Say English, Hindi, or Bengali.",
    hi: "अंग्रेज़ी, हिंदी, या बंगाली कहें।",
    bn: "ইংরেজি, হিন্দি, বা বাংলা বলুন।",
  },
  langSelected: {
    en: (l: string) => `${l} selected.`,
    hi: (l: string) => `${l} चुना गया।`,
    bn: (l: string) => `${l} বেছে নেওয়া হয়েছে।`,
  },
  formGreeting: {
    en: "Which service? Say Ration Card, Voter ID, Family Form, or Benefit Application.",
    hi: "कौन सी सेवा? राशन कार्ड, वोटर आईडी, फैमिली फॉर्म, या बेनेफिट एप्लीकेशन कहें।",
    bn: "কোন পরিষেবা? রেশন কার্ড, ভোটার আইডি, ফ্যামিলি ফর্ম, বা বেনিফিট অ্যাপ্লিকেশন বলুন।",
  },
  formChoiceAgain: {
    en: "Say Ration Card, Voter ID, Family Form, or Benefit Application.",
    hi: "राशन कार्ड, वोटर आईडी, फैमिली फॉर्म, या बेनेफिट एप्लीकेशन कहें।",
    bn: "রেশন কার্ড, ভোটার আইডি, ফ্যামিলি ফর্ম, বা বেনিফিট অ্যাপ্লিকেশন বলুন।",
  },
  loadingSchema: {
    en: (title: string) => `Opening ${title} form…`,
    hi: (title: string) => `${title} फॉर्म खुल रहा है…`,
    bn: (title: string) => `${title} ফর্ম খোলা হচ্ছে…`,
  },
  schemaLoadFailed: {
    en: "Couldn't open that form. Please try again.",
    hi: "फॉर्म नहीं खुला। दोबारा कोशिश करें।",
    bn: "ফর্ম খুলতে পারিনি। আবার চেষ্টা করুন।",
  },
  translatingEntities: {
    en: "Thanks! One moment while I convert your answers to English.",
    hi: "धन्यवाद! एक क्षण रुकें, आपके उत्तर अंग्रेज़ी में बदले जा रहे हैं।",
    bn: "ধন্যবাদ! একটু অপেক্ষা করুন, আপনার উত্তরগুলো ইংরেজিতে রূপান্তর করা হচ্ছে।",
  },
  openingForm: {
    en: (_num: number, title: string, field: string) =>
      `${title}. ${field}`,
    hi: (_num: number, title: string, field: string) =>
      `${title}। ${field}`,
    bn: (_num: number, title: string, field: string) =>
      `${title}। ${field}`,
  },
  gotItNext: {
    en: (field: string) => `OK. ${field}`,
    hi: (field: string) => `ठीक है। ${field}`,
    bn: (field: string) => `ঠিক আছে। ${field}`,
  },
  didntCatch: {
    en: "Please repeat.",
    hi: "दोबारा बोलें।",
    bn: "আবার বলুন।",
  },
  summaryIntro: {
    en: (title: string, lines: string) =>
      `${title}: ${lines}. Correct? Say yes to submit, or name a field to change.`,
    hi: (title: string, lines: string) =>
      `${title}: ${lines}। सही है? हाँ कहें या कोई फ़ील्ड बदलें।`,
    bn: (title: string, lines: string) =>
      `${title}: ${lines}। ঠিক আছে? হ্যাঁ বলুন বা কোনো ক্ষেত্র পরিবর্তন করুন।`,
  },
  submitSuccess: {
    en: "Submitted! Session complete.",
    hi: "जमा हो गया! सत्र समाप्त।",
    bn: "জমা হয়েছে! সেশন শেষ।",
  },
  correctWhichField: {
    en: "Which field to correct?",
    hi: "कौन सा फ़ील्ड सुधारें?",
    bn: "কোন ক্ষেত্র সংশোধন করবেন?",
  },
  correctWhatValue: {
    en: (label: string) => `New ${label}?`,
    hi: (label: string) => `नया ${label}?`,
    bn: (label: string) => `নতুন ${label}?`,
  },
  fieldNotMatched: {
    en: "Field not found. Say a field name.",
    hi: "फ़ील्ड नहीं मिला। फ़ील्ड का नाम बताएँ।",
    bn: "ক্ষেত্র পাওয়া যায়নি। ক্ষেত্রের নাম বলুন।",
  },
  updatedField: {
    en: (label: string, value: string) => `${label}: "${value}".`,
    hi: (label: string, value: string) => `${label}: "${value}"।`,
    bn: (label: string, value: string) => `${label}: "${value}"।`,
  },
  notProvided: {
    en: "not provided",
    hi: "नहीं दिया",
    bn: "দেওয়া হয়নি",
  },
  /** Fix 2: spoken when user's answer doesn't match a field's fixed option list */
  invalidOption: {
    en: (label: string, opts: string) =>
      `That's not a valid choice for ${label}. Please say one of: ${opts}.`,
    hi: (label: string, opts: string) =>
      `${label} के लिए यह विकल्प सही नहीं है। कृपया इनमें से एक कहें: ${opts}।`,
    bn: (label: string, opts: string) =>
      `${label}-এর জন্য এটি সঠিক বিকল্প নয়। দয়া করে বলুন: ${opts}।`,
  },
};

/** Per-field question prompts in each language — short form */
export const FIELD_QUESTIONS: Record<Lang, Record<string, string>> = {
  en: {
    full_name: "Full name?",
    dob: "Date of birth? (DD/MM/YYYY)",
    gender: "Gender?",
    email: "Email?",
    phone: "Phone number?",
    street: "Street or area?",
    city: "City?",
    pincode: "PIN code?",
    patient_name: "Patient name?",
    age: "Age?",
    blood_group: "Blood group?",
    condition: "Condition or symptoms?",
    doctor: "Preferred doctor?",
    appt_date: "Appointment date?",
    insurance_id: "Insurance ID?",
    insurer: "Insurance provider?",
    app_name: "Full name?",
    app_email: "Email?",
    app_phone: "Phone?",
    position: "Position applied for?",
    experience: "Years of experience?",
    company: "Current company?",
    education: "Highest education?",
    skills: "Key skills?",
    trav_name: "Name as on passport?",
    passport_no: "Passport number?",
    nationality: "Nationality?",
    destination: "Destination country?",
    depart_date: "Departure date?",
    return_date: "Return date?",
    duration: "Duration of stay?",
    purpose: "Purpose of visit?",
    accommodation: "Accommodation?",
  },
  hi: {
    full_name: "पूरा नाम?",
    dob: "जन्म तिथि? (DD/MM/YYYY)",
    gender: "लिंग?",
    email: "ईमेल?",
    phone: "फ़ोन नंबर?",
    street: "गली या इलाका?",
    city: "शहर?",
    pincode: "पिन कोड?",
    patient_name: "मरीज़ का नाम?",
    age: "उम्र?",
    blood_group: "रक्त समूह?",
    condition: "बीमारी या लक्षण?",
    doctor: "पसंदीदा डॉक्टर?",
    appt_date: "अपॉइंटमेंट की तारीख?",
    insurance_id: "बीमा आईडी?",
    insurer: "बीमा प्रदाता?",
    app_name: "पूरा नाम?",
    app_email: "ईमेल?",
    app_phone: "फ़ोन?",
    position: "किस पद के लिए?",
    experience: "कितने साल का अनुभव?",
    company: "वर्तमान कंपनी?",
    education: "सर्वोच्च शिक्षा?",
    skills: "मुख्य कौशल?",
    trav_name: "पासपोर्ट पर नाम?",
    passport_no: "पासपोर्ट नंबर?",
    nationality: "राष्ट्रीयता?",
    destination: "गंतव्य देश?",
    depart_date: "प्रस्थान तिथि?",
    return_date: "वापसी तिथि?",
    duration: "रहने की अवधि?",
    purpose: "यात्रा का उद्देश्य?",
    accommodation: "आवास?",
  },
  bn: {
    full_name: "পুরো নাম?",
    dob: "জন্ম তারিখ? (DD/MM/YYYY)",
    gender: "লিঙ্গ?",
    email: "ইমেইল?",
    phone: "ফোন নম্বর?",
    street: "রাস্তা বা এলাকা?",
    city: "শহর?",
    pincode: "পিন কোড?",
    patient_name: "রোগীর নাম?",
    age: "বয়স?",
    blood_group: "রক্তের গ্রুপ?",
    condition: "রোগ বা লক্ষণ?",
    doctor: "পছন্দের ডাক্তার?",
    appt_date: "অ্যাপয়েন্টমেন্টের তারিখ?",
    insurance_id: "বীমা আইডি?",
    insurer: "বীমা প্রদানকারী?",
    app_name: "পুরো নাম?",
    app_email: "ইমেইল?",
    app_phone: "ফোন?",
    position: "কোন পদের জন্য?",
    experience: "কত বছরের অভিজ্ঞতা?",
    company: "বর্তমান কোম্পানি?",
    education: "সর্বোচ্চ শিক্ষা?",
    skills: "মূল দক্ষতা?",
    trav_name: "পাসপোর্টে নাম?",
    passport_no: "পাসপোর্ট নম্বর?",
    nationality: "জাতীয়তা?",
    destination: "গন্তব্য দেশ?",
    depart_date: "প্রস্থানের তারিখ?",
    return_date: "ফেরার তারিখ?",
    duration: "থাকার সময়কাল?",
    purpose: "ভ্রমণের উদ্দেশ্য?",
    accommodation: "থাকার ব্যবস্থা?",
  },
};

/** Field label aliases for correction matching in Hindi/Bengali */
export const FIELD_ALIASES: Record<string, string[]> = {
  full_name: ["name", "naam", "नाम", "নাম", "full name", "pura naam", "পুরো নাম"],
  dob: ["date of birth", "birth", "janm", "জন্ম", "जन्म", "birthday"],
  gender: ["gender", "ling", "লিঙ্গ", "लिंग", "male", "female"],
  email: ["email", "mail", "ईमेल", "ইমেইল"],
  phone: ["phone", "mobile", "number", "फोन", "ফোন", "नंबर"],
  city: ["city", "shehar", "शहर", "শহর"],
  street: ["street", "area", "address", "pata", "ঠিকানা", "पता"],
  pincode: ["pin", "pincode", "zip", "पिन", "পিন"],
  patient_name: ["patient", "mariiz", "রোগী", "मरीज"],
  age: ["age", "umar", "বয়স", "उम्र"],
  blood_group: ["blood", "rakht", "রক্ত", "रक्त"],
  condition: ["condition", "symptom", "bimari", "রোগ", "बीमारी"],
  doctor: ["doctor", "daktar", "ডাক্তার", "डॉक्टर"],
  appt_date: ["appointment", "date", "tarikh", "তারিখ", "तारीख"],
  insurance_id: ["insurance id", "policy", "बीमा", "বীমা"],
  insurer: ["insurer", "provider", "company"],
  position: ["position", "job", "role", "pad", "পদ", "पद"],
  experience: ["experience", "anubhav", "অভিজ্ঞতা", "अनुभव"],
  company: ["company", "kompani", "কোম্পানি", "कंपनी"],
  education: ["education", "degree", "shiksha", "শিক্ষা", "शिक्षा"],
  skills: ["skills", "kaushal", "দক্ষতা", "कौशल"],
  passport_no: ["passport", "পাসপোর্ট", "पासपोर्ट"],
  nationality: ["nationality", "desh", "জাতীয়তা", "राष्ट्रीयता"],
  destination: ["destination", "country", "desh", "দেশ", "देश"],
  depart_date: ["departure", "depart", "প্রস্থান", "प्रस्थान"],
  return_date: ["return", "ফেরা", "वापसी"],
  duration: ["duration", "stay", "থাকা", "ठहरना"],
  purpose: ["purpose", "udeshya", "উদ্দেশ্য", "उद्देश्य"],
  accommodation: ["accommodation", "hotel", "আবাস", "आवास"],
};

const GENERIC_FIELD_QUESTION: Record<Lang, (label: string) => string> = {
  en: (label) => `${label}?`,
  hi: (label) => `${label}?`,
  bn: (label) => `${label}?`,
};

/**
 * Question for a form field. Fields extracted at runtime from a government
 * portal's schema won't have a pre-written entry in FIELD_QUESTIONS, so this
 * always falls back to a generic templated question built from the label
 * the schema itself gave us (e.g. "aadhaar_number" -> "Aadhaar Number").
 */
export function fieldQuestion(lang: Lang, fieldId: string, fallbackLabel: string): string {
  const cleaned = fallbackLabel.replace(/[*:]/g, "").replace(/\s*\(Required\)/gi, "").trim();
  return FIELD_QUESTIONS[lang][fieldId] ?? GENERIC_FIELD_QUESTION[lang](cleaned);
}

export function matchFieldMultilingual(
  text: string,
  fields: { id: string; label: string }[]
): { id: string; label: string } | null {
  const t = text.toLowerCase();
  for (const f of fields) {
    const aliases = FIELD_ALIASES[f.id] ?? [];
    if (aliases.some((a) => t.includes(a.toLowerCase()))) return f;
    const words = f.label
      .toLowerCase()
      .split(/[\s/.,()]+/)
      .filter((w) => w.length > 2);
    if (words.some((w) => t.includes(w))) return f;
  }
  return null;
}

export function pickVoice(lang: Lang, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined;

  // Fix 3: Bengali voice clarity — prefer Microsoft Kalpana/Nabanita/Hemant/Pradeep Online (Natural)
  // or Google বাংলা (Bangla/Bengali) voices over robotic offline desktop system voices.
  if (lang === "bn") {
    const bnPriority = [
      /kalpana.*online/i,              // Microsoft Kalpana Online (Natural) bn-IN (Excellent Female)
      /nabanita.*online/i,             // Microsoft Nabanita Online (Natural) bn-BD (Excellent Female)
      /google.*bangla/i,               // Google বাংলা
      /google.*bengali/i,
      /google.*বাংলা/i,
      /hemant.*online/i,               // Microsoft Hemant Online (Natural) bn-IN (Male)
      /pradeep.*online/i,              // Microsoft Pradeep Online (Natural) bn-BD (Male)
      /microsoft.*bengali.*online/i,
      /online.*natural/i,              // any other online natural Bengali voice
      /kalpana/i,                      // offline Kalpana
      /nabanita/i,
      /anindya/i,
      /hemant/i,
    ];
    for (const pattern of bnPriority) {
      const v = voices.find((v) => pattern.test(v.name) || pattern.test(v.lang));
      if (v) return v;
    }
    // Generic fallback to any bn-IN, then bn-BD
    const byExact = voices.find((v) => v.lang === "bn-IN");
    if (byExact) return byExact;
    const byBD = voices.find((v) => v.lang === "bn-BD");
    if (byBD) return byBD;
    return voices.find((v) => v.lang.toLowerCase().startsWith("bn"));
  }

  const langPrefixes: Record<Lang, string[]> = {
    en: ["en-IN", "en-GB", "en-US", "en-AU", "en"],
    hi: ["hi-IN", "hi"],
    bn: ["bn-IN", "bn-BD", "bn"],
  };

  const namePatterns: Record<Lang, RegExp | null> = {
    en: null,
    hi: /hindi|swara|heera|neerja/i,
    bn: null, // handled above
  };

  for (const prefix of langPrefixes[lang]) {
    const exact = voices.find((v) => v.lang === prefix);
    if (exact) return exact;
  }

  const base = langPrefixes[lang][langPrefixes[lang].length - 1];
  const byLang = voices.find((v) => v.lang.toLowerCase().startsWith(base));
  if (byLang) return byLang;

  const pattern = namePatterns[lang];
  if (pattern) {
    const byName = voices.find((v) => pattern.test(v.name) || pattern.test(v.lang));
    if (byName) return byName;
  }

  // Google online voices often work when OS lacks Hindi packs
  if (lang === "hi") {
    const google = voices.find(
      (v) => /google/i.test(v.name) && v.lang.toLowerCase().startsWith(lang)
    );
    if (google) return google;
  }

  return undefined;
}

/** True when transcription is too weak to act on */
export function isUnclearTranscript(text: string): boolean {
  const t = text.trim();
  if (!t || t === "[unclear]") return true;
  if (/^\[.*\]$/.test(t)) return true;
  if (t.length < 2) return true;
  return false;
}

