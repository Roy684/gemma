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
    text: "Good morning! Which language would you prefer? English, Hindi, or Bengali?",
  },
  {
    lang: "hi",
    text: "सुप्रभात! आप कौन सी भाषा चुनना चाहेंगे? अंग्रेज़ी, हिंदी, या बंगाली?",
  },
  {
    lang: "bn",
    text: "সুপ্রভাত! আপনি কোন ভাষা বেছে নেবেন? ইংরেজি, হিন্দি, নাকি বাংলা?",
  },
];

export function parseLanguage(text: string): Lang | null {
  const t = text.toLowerCase();
  if (
    /\b(english|angrezi|angreji|inglish|ইংরেজি|ইংরেজী|अंग्रेज़ी|अंग्रेजी|angrez)\b/i.test(
      t
    )
  )
    return "en";
  if (/\b(hindi|hindustani|hind|हिंदी|हिन्दी|हिन्दि|হিন্দি|হিন্দী)\b/i.test(t)) return "hi";
  if (
    /\b(bengali|bangla|bangali|beng|বাংলা|বাঙালি|বেঙ্গালি)\b/i.test(t)
  )
    return "bn";
  return null;
}

export function isYes(text: string, lang: Lang): boolean {
  const t = text.toLowerCase();
  if (lang === "hi") {
    return /\b(haan|ha|han|ji|sahi|theek|thik|ठीक|हाँ|हां|जी|सही|सब\s+ठीक|submit|yes)\b/i.test(
      t
    );
  }
  if (lang === "bn") {
    return /\b(haan|ha|hyan|hyn|thik|ঠিক|হ্যাঁ|হা|জি|সঠিক|submit|yes)\b/i.test(
      t
    );
  }
  return /\b(yes|yeah|yep|yup|correct|right|submit|confirm|go\s+ahead|looks\s+good|all\s+correct|perfect|sure|ok|okay|fine|that.?s\s+(right|correct))\b/i.test(
    t
  );
}

/** Localised agent phrases */
export const PHRASES = {
  langChoiceAgain: {
    en: "I didn't catch that. Please say English, Hindi, or Bengali.",
    hi: "मुझे समझ नहीं आया। कृपया अंग्रेज़ी, हिंदी, या बंगाली कहें।",
    bn: "আমি বুঝতে পারিনি। দয়া করে ইংরেজি, হিন্দি, বা বাংলা বলুন।",
  },
  langSelected: {
    en: (l: string) => `Great! I will speak in ${l}.`,
    hi: (l: string) => `बहुत अच्छा! मैं ${l} में बात करूँगा।`,
    bn: (l: string) => `দারুণ! আমি ${l}-তে কথা বলব।`,
  },
  formGreeting: {
    en: "Which form would you like to open? Form 1: Personal Registration, Form 2: Medical Appointment, Form 3: Job Application, or Form 4: Travel and Visa.",
    hi: "आप कौन सा फॉर्म खोलना चाहेंगे? फॉर्म 1: व्यक्तिगत पंजीकरण, फॉर्म 2: चिकित्सा अपॉइंटमेंट, फॉर्म 3: नौकरी आवेदन, या फॉर्म 4: यात्रा और वीज़ा।",
    bn: "আপনি কোন ফর্ম খুলতে চান? ফর্ম 1: ব্যক্তিগত নিবন্ধন, ফর্ম 2: চিকিৎসা অ্যাপয়েন্টমেন্ট, ফর্ম 3: চাকরির আবেদন, বা ফর্ম 4: ভ্রমণ ও ভিসা।",
  },
  formChoiceAgain: {
    en: "I didn't catch which form. Please say Form 1, 2, 3, or 4.",
    hi: "मुझे फॉर्म समझ नहीं आया। कृपया फॉर्म 1, 2, 3, या 4 कहें।",
    bn: "আমি ফর্মটি বুঝতে পারিনি। দয়া করে ফর্ম 1, 2, 3, বা 4 বলুন।",
  },
  openingForm: {
    en: (num: number, title: string, field: string) =>
      `Opening Form ${num}, ${title}. Let's get started. ${field}`,
    hi: (num: number, title: string, field: string) =>
      `फॉर्म ${num}, ${title} खोला जा रहा है। चलिए शुरू करते हैं। ${field}`,
    bn: (num: number, title: string, field: string) =>
      `ফর্ম ${num}, ${title} খোলা হচ্ছে। চলুন শুরু করি। ${field}`,
  },
  gotItNext: {
    en: (field: string) => `Got it. ${field}`,
    hi: (field: string) => `ठीक है। ${field}`,
    bn: (field: string) => `ঠিক আছে। ${field}`,
  },
  didntCatch: {
    en: "Sorry, I didn't catch that. Please try again.",
    hi: "माफ़ कीजिए, मुझे समझ नहीं आया। कृपया फिर से बोलें।",
    bn: "দুঃখিত, আমি বুঝতে পারিনি। দয়া করে আবার বলুন।",
  },
  summaryIntro: {
    en: (title: string, lines: string) =>
      `Here is a summary of your ${title}. ${lines}. Does everything look correct? Say yes to submit, or tell me which field to change.`,
    hi: (title: string, lines: string) =>
      `यहाँ आपके ${title} का सारांश है। ${lines}। क्या सब कुछ सही है? जमा करने के लिए हाँ कहें, या बताएँ कौन सा फ़ील्ड बदलना है।`,
    bn: (title: string, lines: string) =>
      `এখানে আপনার ${title}-এর সারাংশ। ${lines}। সব কিছু ঠিক আছে? জমা দিতে হ্যাঁ বলুন, অথবা কোন ক্ষেত্র পরিবর্তন করতে চান বলুন।`,
  },
  submitSuccess: {
    en: "Form submitted successfully! Thank you. Your session is now complete.",
    hi: "फॉर्म सफलतापूर्वक जमा हो गया! धन्यवाद। आपका सत्र समाप्त हो गया है।",
    bn: "ফর্ম সফলভাবে জমা হয়েছে! ধন্যবাদ। আপনার সেশন শেষ হয়েছে।",
  },
  correctWhichField: {
    en: "Which field would you like to correct? Please say the field name clearly.",
    hi: "आप कौन सा फ़ील्ड सुधारना चाहेंगे? कृपया फ़ील्ड का नाम स्पष्ट रूप से बताएँ।",
    bn: "আপনি কোন ক্ষেত্র সংশোধন করতে চান? দয়া করে ক্ষেত্রের নাম স্পষ্টভাবে বলুন।",
  },
  correctWhatValue: {
    en: (label: string) => `What should ${label} be?`,
    hi: (label: string) => `${label} क्या होना चाहिए?`,
    bn: (label: string) => `${label} কী হওয়া উচিত?`,
  },
  fieldNotMatched: {
    en: "I couldn't match that to a field. Please say a field name like Full Name, City, or Email.",
    hi: "मुझे वह फ़ील्ड नहीं मिला। कृपया पूरा नाम, शहर, या ईमेल जैसा कोई नाम बताएँ।",
    bn: "আমি সেই ক্ষেত্রটি খুঁজে পাইনি। দয়া করে পুরো নাম, শহর, বা ইমেইলের মতো কোনো নাম বলুন।",
  },
  updatedField: {
    en: (label: string, value: string) => `Updated ${label} to "${value}".`,
    hi: (label: string, value: string) => `${label} को "${value}" में अपडेट किया।`,
    bn: (label: string, value: string) => `${label} "${value}"-তে আপডেট করা হয়েছে।`,
  },
  notProvided: {
    en: "not provided",
    hi: "दिया नहीं गया",
    bn: "প্রদান করা হয়নি",
  },
};

/** Per-field question prompts in each language */
export const FIELD_QUESTIONS: Record<Lang, Record<string, string>> = {
  en: {
    full_name: "What is your Full Name?",
    dob: "What is your Date of Birth?",
    gender: "What is your Gender?",
    email: "What is your Email Address?",
    phone: "What is your Phone Number?",
    street: "What is your Street or Area?",
    city: "What is your City?",
    pincode: "What is your PIN Code?",
    patient_name: "What is the Patient Name?",
    age: "What is the Patient's Age?",
    blood_group: "What is the Blood Group?",
    condition: "What is the Condition or Symptoms?",
    doctor: "Who is the Preferred Doctor?",
    appt_date: "What is the Preferred Appointment Date?",
    insurance_id: "What is the Insurance ID?",
    insurer: "What is the Insurance Provider?",
    app_name: "What is your Full Name?",
    app_email: "What is your Email?",
    app_phone: "What is your Phone Number?",
    position: "What Position are you applying for?",
    experience: "How many Years of Experience do you have?",
    company: "What is your Current Company?",
    education: "What is your Highest Education?",
    skills: "What are your Key Skills?",
    trav_name: "What is your Full Name as on passport?",
    passport_no: "What is your Passport Number?",
    nationality: "What is your Nationality?",
    destination: "What is your Destination country?",
    depart_date: "What is your Departure Date?",
    return_date: "What is your Return Date?",
    duration: "What is the Duration of Stay?",
    purpose: "What is the Purpose of Visit?",
    accommodation: "What is your Accommodation?",
  },
  hi: {
    full_name: "आपका पूरा नाम क्या है?",
    dob: "आपकी जन्म तिथि क्या है?",
    gender: "आपका लिंग क्या है?",
    email: "आपका ईमेल पता क्या है?",
    phone: "आपका फ़ोन नंबर क्या है?",
    street: "आपकी गली या इलाका क्या है?",
    city: "आपका शहर कौन सा है?",
    pincode: "आपका पिन कोड क्या है?",
    patient_name: "मरीज़ का नाम क्या है?",
    age: "मरीज़ की उम्र क्या है?",
    blood_group: "रक्त समूह क्या है?",
    condition: "बीमारी या लक्षण क्या हैं?",
    doctor: "पसंदीदा डॉक्टर कौन हैं?",
    appt_date: "पसंदीदा अपॉइंटमेंट की तारीख क्या है?",
    insurance_id: "बीमा आईडी क्या है?",
    insurer: "बीमा प्रदाता कौन है?",
    app_name: "आपका पूरा नाम क्या है?",
    app_email: "आपका ईमेल क्या है?",
    app_phone: "आपका फ़ोन नंबर क्या है?",
    position: "आप किस पद के लिए आवेदन कर रहे हैं?",
    experience: "आपके कितने वर्षों का अनुभव है?",
    company: "आपकी वर्तमान कंपनी क्या है?",
    education: "आपकी उच्चतम शिक्षा क्या है?",
    skills: "आपके मुख्य कौशल क्या हैं?",
    trav_name: "पासपोर्ट पर आपका पूरा नाम क्या है?",
    passport_no: "आपका पासपोर्ट नंबर क्या है?",
    nationality: "आपकी राष्ट्रीयता क्या है?",
    destination: "आप किस देश जा रहे हैं?",
    depart_date: "प्रस्थान की तारीख क्या है?",
    return_date: "वापसी की तारीख क्या है?",
    duration: "ठहरने की अवधि कितनी है?",
    purpose: "यात्रा का उद्देश्य क्या है?",
    accommodation: "आपका आवास क्या है?",
  },
  bn: {
    full_name: "আপনার পুরো নাম কী?",
    dob: "আপনার জন্ম তারিখ কী?",
    gender: "আপনার লিঙ্গ কী?",
    email: "আপনার ইমেইল ঠিকানা কী?",
    phone: "আপনার ফোন নম্বর কী?",
    street: "আপনার রাস্তা বা এলাকা কী?",
    city: "আপনার শহর কোনটি?",
    pincode: "আপনার পিন কোড কী?",
    patient_name: "রোগীর নাম কী?",
    age: "রোগীর বয়স কত?",
    blood_group: "রক্তের গ্রুপ কী?",
    condition: "রোগ বা লক্ষণ কী?",
    doctor: "পছন্দের ডাক্তার কে?",
    appt_date: "পছন্দের অ্যাপয়েন্টমেন্টের তারিখ কী?",
    insurance_id: "বীমা আইডি কী?",
    insurer: "বীমা প্রদানকারী কে?",
    app_name: "আপনার পুরো নাম কী?",
    app_email: "আপনার ইমেইল কী?",
    app_phone: "আপনার ফোন নম্বর কী?",
    position: "আপনি কোন পদের জন্য আবেদন করছেন?",
    experience: "আপনার কত বছরের অভিজ্ঞতা?",
    company: "আপনার বর্তমান কোম্পানি কী?",
    education: "আপনার সর্বোচ্চ শিক্ষা কী?",
    skills: "আপনার মূল দক্ষতা কী?",
    trav_name: "পাসপোর্টে আপনার পুরো নাম কী?",
    passport_no: "আপনার পাসপোর্ট নম্বর কী?",
    nationality: "আপনার জাতীয়তা কী?",
    destination: "আপনি কোন দেশে যাচ্ছেন?",
    depart_date: "প্রস্থানের তারিখ কী?",
    return_date: "ফেরার তারিখ কী?",
    duration: "থাকার সময়কাল কত?",
    purpose: "ভ্রমণের উদ্দেশ্য কী?",
    accommodation: "আপনার থাকার ব্যবস্থা কী?",
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

export function fieldQuestion(lang: Lang, fieldId: string, fallbackLabel: string): string {
  return FIELD_QUESTIONS[lang][fieldId] ?? `What is your ${fallbackLabel}?`;
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

  const langPrefixes: Record<Lang, string[]> = {
    en: ["en-IN", "en-GB", "en-US", "en-AU", "en"],
    hi: ["hi-IN", "hi"],
    bn: ["bn-IN", "bn-BD", "bn"],
  };

  const namePatterns: Record<Lang, RegExp | null> = {
    en: null,
    hi: /hindi|swara|heera|neerja/i,
    bn: /bengali|bangla|bashkar|bani|madhur.*bn|bn-/i,
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

  // Google online voices often work when OS lacks Bengali/Hindi packs
  if (lang === "bn" || lang === "hi") {
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
