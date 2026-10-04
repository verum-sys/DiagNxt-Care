/** Briefing demo narratives for New Case — 3 scenarios × 3 native language variants. */

export type DemoCaseId = 'case1' | 'case2' | 'case3';
export type DemoLang = 'en' | 'hinglish' | 'hindi';

export const DEMO_CASE_TEXT: Record<DemoLang, Record<DemoCaseId, string>> = {
  en: {
    case1:
      'I am registering Kamla today. She is 42 from Rampur village. I am referring her to the district hospital for a screening test. She is ready to go.',
    case2:
      'I referred Sunita to the CHC yesterday for a follow-up check. She is 35, from Rampur village. The CHC has accepted the referral. They said she can come on Tuesday, but the appointment is not confirmed yet.',
    case3:
      'We referred Reena two weeks ago for a screening test. She was supposed to go to the district hospital on Monday. The hospital had accepted the referral, but we still do not know whether she reached the hospital or not.',
  },
  hinglish: {
    case1:
      'Aaj main Kamla ko register kar rahi hoon. Woh 42 saal ki hain, Rampur gaon se. Maine screening test ke liye district hospital mein refer kiya. Woh jaane ko taiyar hain.',
    case2:
      'Sunita ko kal CHC refer kiya tha, 35 saal, Rampur gaon. CHC ne referral accept kar liya hai. Unhone bola hai ki woh Tuesday ko aa sakti hai, lekin appointment abhi confirm nahi hua.',
    case3:
      'Reena ko do hafte pehle screening test ke liye refer kiya tha. Somvar ko district hospital jana tha. Hospital ne referral accept kar liya tha, lekin abhi tak pata nahi ki woh hospital pahunchi ya nahi.',
  },
  hindi: {
    case1:
      'आज मैं कमला का पंजीकरण कर रही हूँ। वह 42 वर्ष की हैं, रामपुर गाँव से। मैं उन्हें जाँच के लिए जिला अस्पताल रेफर कर रही हूँ। वह जाने को तैयार हैं।',
    case2:
      'मैंने कल सुनीता, 35 वर्ष, रामपुर गाँव, को सीएचसी रेफर किया। सीएचसी ने रेफरल स्वीकार कर लिया है। उन्होंने कहा कि वह मंगलवार को आ सकती है, लेकिन अपॉइंटमेंट अभी पुष्टि नहीं हुई।',
    case3:
      'रीना को दो हफ़्ते पहले जाँच के लिए रेफर किया था। सोमवार को जिला अस्पताल में जाना था। अस्पताल ने रेफरल स्वीकार किया था, लेकिन अभी तक यह जानकारी नहीं मिली कि वह अस्पताल पहुँची या नहीं।',
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
