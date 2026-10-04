/** Briefing demo narratives for New Case — 3 scenarios × 3 native language variants. */

export type DemoCaseId = 'case1' | 'case2' | 'case3';
export type DemoLang = 'en' | 'hinglish' | 'hindi';

/** New Case “Try an example”: one scenario per language (not three cases per language). */
export const DEMO_CASE_BY_LANG: Record<DemoLang, DemoCaseId> = {
  en: 'case1',
  hinglish: 'case2',
  hindi: 'case3',
};

export const DEMO_LANG_ORDER: DemoLang[] = ['en', 'hinglish', 'hindi'];

export function demoTextForLang(lang: DemoLang): string {
  return DEMO_CASE_TEXT[lang][DEMO_CASE_BY_LANG[lang]];
}

export const DEMO_CASE_TEXT: Record<DemoLang, Record<DemoCaseId, string>> = {
  en: {
    case1:
      'Initial Oral screening completed for Mrs Mary Sharma, 38 years, from House 12 Rampur village, phone 98765 43210. Key finding positive, referral required yes. I referred her to Sadar district hospital yesterday for urgent follow-up. She said she would go next week.',
    case2:
      'Sunita Devi is 42 years old, female, from house 45 Rampur village, phone 9876543210. NCD screening completed — key finding needs review, referral required yes. I referred her to Bero CHC yesterday for an urgent NCD follow-up. She will go, but we have not heard back from the hospital yet.',
    case3:
      'Reena was supposed to go to the district hospital on Monday. The hospital had accepted the referral, but we still do not know whether she reached the hospital or not.',
  },
  hinglish: {
    case1:
      'Mary Sharma, 38 saal — oral screening complete ho gayi, House 12 Rampur gaon, phone 9876543210. Key finding positive, referral required yes. Maine kal Sadar district hospital mein urgent follow-up ke liye refer kiya. Woh agle hafte jayegi.',
    case2:
      'Sunita Devi, 42 saal, mahila, Rampur gaon house 45, phone 9876543210. NCD screening completed — key finding needs review, referral required yes. Maine kal Bero CHC refer kiya, urgent NCD follow-up ke liye. Woh jayegi, par hospital se abhi koi jawab nahi aaya.',
    case3:
      'Reena ko somvar ko jila aspatal mein jana tha. Aspatal ne referral accept kar liya tha, lekin abhi tak yeh jaankari nahi mili ki woh aspatal pahunchi ya nahi.',
  },
  hindi: {
    case1:
      'श्रीमती मैरी शर्मा, 38 वर्ष, मकान 12 रामपुर गाँव, फ़ोन 9876543210। प्रारंभिक मुंह की जाँच पूरी, key finding positive, referral required yes। मैंने कल Sadar district hospital में tatkal follow-up के लिए रेफर किया। वह अगले हफ़्ते जाएगी।',
    case2:
      'सुनीता देवी, 42 वर्ष, महिला, रामपुर गाँव मकान 45, फ़ोन 9876543210। NCD screening completed — key finding needs review, referral required yes। मैंने कल Bero CHC में tatkal NCD follow-up के लिए रेफर किया। वह जाएगी, लेकिन अस्पताल से अभी कोई जवाब नहीं आया।',
    case3:
      'रीना को जिला अस्पताल में सोमवार को जाना था। अस्पताल ने रेफरल स्वीकार किया था, लेकिन अभी तक यह जानकारी नहीं मिली कि वह अस्पताल पहुंची या नहीं।',
  },
};

/** All demo strings (for “is this the example text?” checks). */
export function allDemoCaseTexts(): string[] {
  return (Object.keys(DEMO_CASE_TEXT) as DemoLang[]).flatMap((lang) =>
    (Object.keys(DEMO_CASE_TEXT[lang]) as DemoCaseId[]).map((id) => DEMO_CASE_TEXT[lang][id]),
  );
}

/** @deprecated Use DEMO_CASE_TEXT — kept for tests that picked one string per lang. */
export const EXAMPLES = {
  en: DEMO_CASE_TEXT.en.case1,
  hinglish: DEMO_CASE_TEXT.hinglish.case1,
  hindi: DEMO_CASE_TEXT.hindi.case1,
};
