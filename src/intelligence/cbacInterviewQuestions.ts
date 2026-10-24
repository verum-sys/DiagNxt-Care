import type { Lang } from '../i18n';
import type { Sex } from '../db/types';

export interface InterviewQuestion {
  id: string;
  field: string;
  slide: 'A' | 'B' | 'C' | 'D' | 'REFERRAL';
  promptEn: string;
  promptHi: string;
  hintEn: string;
  hintHi: string;
  optionsEn?: string[];
  optionsHi?: string[];
  sampleResponses: string[];
}

export const CBAC_INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'name',
    field: 'name',
    slide: 'A',
    promptEn: 'What is the patient\'s full name?',
    promptHi: 'मरीज़ का पूरा नाम क्या है?',
    hintEn: 'e.g. "Sunita Devi" or "My name is Sunita Devi"',
    hintHi: 'उदा. "सुनीता देवी"',
    sampleResponses: ['Sunita Devi', 'सुनीता देवी', 'Meena Devi', 'Ramesh Mahto'],
  },
  {
    id: 'age',
    field: 'age',
    slide: 'A',
    promptEn: 'What is your age in years?',
    promptHi: 'आपकी उम्र कितने वर्ष है?',
    hintEn: 'e.g. "26 years" (Automatically selects 0-29 age bracket)',
    hintHi: 'उदा. "26 साल"',
    optionsEn: ['0-29 yrs (0 pts)', '30-39 yrs (1 pt)', '40-49 yrs (2 pts)', '50-59 yrs (3 pts)', '60+ yrs (4 pts)'],
    optionsHi: ['0-29 वर्ष (0 अंक)', '30-39 वर्ष (1 अंक)', '40-49 वर्ष (2 अंक)', '50-59 वर्ष (3 अंक)', '60+ वर्ष (4 अंक)'],
    sampleResponses: ['26 years', '26', '52', '68 years old'],
  },
  {
    id: 'sex',
    field: 'sex',
    slide: 'A',
    promptEn: 'Are you female or male?',
    promptHi: 'क्या आप महिला हैं या पुरुष?',
    hintEn: 'Adapts waist standards and unlocks women-specific screening',
    hintHi: 'कमर के माप और महिला जांच को सक्षम करता है',
    optionsEn: ['Female', 'Male', 'Other'],
    optionsHi: ['महिला', 'पुरुष', 'अन्य'],
    sampleResponses: ['Female', 'महिला', 'Male', 'पुरुष'],
  },
  {
    id: 'waist',
    field: 'waist',
    slide: 'A',
    promptEn: 'What is your waist measurement in centimeters?',
    promptHi: 'आपकी कमर का माप कितने सेंटीमीटर है?',
    hintEn: 'e.g. "76 cm" (Auto-classified according to gender standards)',
    hintHi: 'उदा. "76 सेंटीमीटर"',
    optionsEn: ['80 cm or less (0 pts)', '81-90 cm (1 pt)', 'More than 90 cm (2 pts)'],
    optionsHi: ['80 सेमी या कम (0 अंक)', '81-90 सेमी (1 अंक)', '90 सेमी से अधिक (2 अंक)'],
    sampleResponses: ['76 cm', '76 सेंटीमीटर', '85 cm', '94 cm'],
  },
  {
    id: 'smoke',
    field: 'smoke',
    slide: 'A',
    promptEn: 'Do you consume smoke or smokeless tobacco like bidi, cigarettes, or gutka?',
    promptHi: 'क्या आप बीड़ी, सिगरेट, गुटखा या खैनी का सेवन करते हैं?',
    hintEn: 'Never, used to smoke, or daily use',
    hintHi: 'कभी नहीं, कभी-कभी, या रोज़ाना',
    optionsEn: ['Never (0 pts)', 'Past / Sometimes (1 pt)', 'Daily consumption (2 pts)'],
    optionsHi: ['कभी नहीं (0 अंक)', 'कभी-कभी (1 अंक)', 'प्रतिदिन (2 अंक)'],
    sampleResponses: ['Never smokes', 'कभी नहीं', 'Daily gutka', 'No tobacco'],
  },
  {
    id: 'alcohol',
    field: 'alcohol',
    slide: 'A',
    promptEn: 'Do you consume alcohol or liquor daily?',
    promptHi: 'क्या आप शराब या मदिरा का सेवन करते हैं?',
    hintEn: 'No (0 pts) or Daily (1 pt)',
    hintHi: 'नहीं (0 अंक) या प्रतिदिन (1 अंक)',
    optionsEn: ['No / Never (0 pts)', 'Yes, Daily (1 pt)'],
    optionsHi: ['नहीं (0 अंक)', 'हाँ, प्रतिदिन (1 अंक)'],
    sampleResponses: ['No alcohol', 'शराब नहीं पीते', 'No', 'Daily'],
  },
  {
    id: 'physicalActivity',
    field: 'physicalActivity',
    slide: 'A',
    promptEn: 'Do you do at least 150 minutes of physical activity or walking each week?',
    promptHi: 'क्या आप सप्ताह में कम से कम 150 मिनट शारीरिक व्यायाम, पैदल चलना या खेती करते हैं?',
    hintEn: 'At least 150 min (0 pts) or Less (1 pt)',
    hintHi: 'कम से कम 150 मिनट (0 अंक) या कम (1 अंक)',
    optionsEn: ['At least 150 min/week (0 pts)', 'Less than 150 min/week (1 pt)'],
    optionsHi: ['कम से कम 150 मिनट/हफ़्ता (0 अंक)', '150 मिनट से कम (1 अंक)'],
    sampleResponses: ['Walks daily', 'रोज़ाना टहलते हैं', 'Active', 'Sedentary, no exercise'],
  },
  {
    id: 'familyHistory',
    field: 'familyHistory',
    slide: 'A',
    promptEn: 'Does any family member (parents or siblings) suffer from high blood pressure, diabetes, or heart disease?',
    promptHi: 'क्या आपके परिवार में किसी को उच्च रक्तचाप, शुगर/डायबिटीज या दिल की बीमारी है?',
    hintEn: 'No (0 pts) or Yes (2 pts)',
    hintHi: 'नहीं (0 अंक) या हाँ (2 अंक)',
    optionsEn: ['No (0 pts)', 'Yes (2 pts)'],
    optionsHi: ['नहीं (0 अंक)', 'हाँ (2 अंक)'],
    sampleResponses: ['No family history', 'परिवार में कोई नहीं', 'Mother has diabetes', 'Yes, high BP'],
  },
  {
    id: 'cough_tb',
    field: 'cough_tb',
    slide: 'B',
    promptEn: 'Have you been coughing for more than 2 weeks, or coughing blood in sputum?',
    promptHi: 'क्या आपको दो हफ्ते से अधिक से खांसी है, या बलगम में खून आता है?',
    hintEn: 'Critical TB suspect indicator',
    hintHi: 'टीबी जांच का मुख्य संकेत',
    optionsEn: ['No cough', 'Coughing > 2 weeks', 'Blood in sputum'],
    optionsHi: ['खांसी नहीं है', '2 हफ्ते से अधिक से खांसी', 'बलगम में खून'],
    sampleResponses: ['Coughing for 3 weeks', '3 हफ्ते से खांसी है', 'No cough', 'Blood in sputum'],
  },
  {
    id: 'women_symptoms',
    field: 'women_symptoms',
    slide: 'B',
    promptEn: 'Do you feel any lump in your breast, or bleeding after menopause/between periods?',
    promptHi: 'क्या स्तन में कोई गांठ या माहवारी के बीच/मेनोपॉज के बाद असामान्य रक्तस्राव है?',
    hintEn: 'Women-specific cancer warning signs (Part B2)',
    hintHi: 'महिलाओं के लिए विशिष्ट लक्षण (भाग B2)',
    optionsEn: ['No symptoms', 'Lump in breast', 'Irregular bleeding'],
    optionsHi: ['कोई लक्षण नहीं', 'स्तन में गांठ', 'असामान्य रक्तस्राव'],
    sampleResponses: ['No symptoms', 'कोई समस्या नहीं', 'Lump in breast', 'Bleeding between periods'],
  },
  {
    id: 'cooking_fuel',
    field: 'cooking_fuel',
    slide: 'C',
    promptEn: 'What type of fuel do you use at home for cooking?',
    promptHi: 'आप घर में खाना पकाने के लिए किस ईंधन का उपयोग करते हैं?',
    hintEn: 'Firewood, cow dung cake, coal, or clean LPG cylinder',
    hintHi: 'लकड़ी/चूल्हा, उपला, कोयला, या गैस सिलेंडर',
    optionsEn: ['LPG Clean Fuel', 'Firewood / Chulha', 'Cow dung cake', 'Coal'],
    optionsHi: ['एलपीजी गैस', 'लकड़ी / चूल्हा', 'गोबर का उपला', 'कोयला'],
    sampleResponses: ['Firewood cooking', 'लकड़ी और चूल्हा', 'LPG cylinder', 'Cow dung cake and firewood'],
  },
  {
    id: 'phq1_interest', field: 'phq1_interest', slide: 'D',
    promptEn: 'Over the last 2 weeks, how often have you had little interest or pleasure in doing things?',
    promptHi: 'पिछले 2 हफ़्तों में कितनी बार किसी काम में मन नहीं लगा या खुशी नहीं मिली?',
    hintEn: 'Choose how often this happened.', hintHi: 'बताएं ऐसा कितनी बार हुआ।',
    sampleResponses: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
  },
  {
    id: 'phq2_mood',
    field: 'phq2_mood',
    slide: 'D',
    promptEn: 'Over the last 2 weeks, how often have you felt down, depressed, or hopeless?',
    promptHi: 'पिछले 2 हफ़्तों में आप कितनी बार उदास या निराश महसूस कर रहे थे?',
    hintEn: 'PHQ-2 Mental Health Screening (Score > 3 indicates CHO/MO referral)',
    hintHi: 'मानसिक स्वास्थ्य स्क्रीनिंग (3 अंक से अधिक पर रेफरल)',
    optionsEn: ['Not at all (0 pts)', 'Several days (1 pt)', 'More than half days (2 pts)', 'Nearly every day (3 pts)'],
    optionsHi: ['बिल्कुल नहीं (0 अंक)', 'कई दिन (1 अंक)', 'आधे से अधिक दिन (2 अंक)', 'लगभग हर दिन (3 अंक)'],
    sampleResponses: ['Feeling down several days', 'कुछ दिनों से मन उदास है', 'Not at all', 'Depressed nearly every day'],
  },
];

export function getQuestionText(q: InterviewQuestion, lang: Lang): string {
  return lang === 'hi' ? q.promptHi : q.promptEn;
}

export function getQuestionHint(q: InterviewQuestion, lang: Lang): string {
  return lang === 'hi' ? q.hintHi : q.hintEn;
}

/** Keep the interview and form applicability consistent. */
export function getApplicableInterviewQuestions(sex: Sex | ''): InterviewQuestion[] {
  return CBAC_INTERVIEW_QUESTIONS.filter(question => question.id !== 'women_symptoms' || sex === 'F');
}
