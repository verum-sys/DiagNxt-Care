import { classifyAge, classifyWaist, parseCbacText, type SmartParseResult } from './cbacIntelligence';
import { parseInterviewNumber } from '../voice/interviewRecognition';
import type { Sex } from '../db/types';

export type InterviewAnswerResult = { ok: true; updates: SmartParseResult } | { ok: false; error: string };
/** Parse only the field being asked. Never run unrestricted demographic extraction on an answer. */
export function parseCbacInterviewAnswer(question: string, answer: string, sex: Sex | '' = ''): InterviewAnswerResult {
  const text = answer.trim();
  const lower = text.toLowerCase();
  const updates: SmartParseResult = { generalUpdates: {}, partAUpdates: {}, partBUpdates: {}, partCUpdates: {}, partDUpdates: {}, explanations: [] };
  const fail = (error: string): InterviewAnswerResult => ({ ok: false, error });
  const no = /^(?:no|none|never|no alcohol|no tobacco|no family history|no cough|no symptoms|not at all|नहीं|कभी नहीं|कोई समस्या नहीं|परिवार में कोई नहीं)[.!]?$/i.test(text);
  const yes = /^(?:yes|हाँ|हां|haan|han)[.!]?$/i.test(text);
  switch (question) {
    case 'name': {
      const name = text.replace(/^(?:my name is|patient(?:'s)? name is|name is|मेरा नाम)\s+/i, '').trim();
      if (name.length < 2 || /\d|\b(?:waist|waste|age|years?|cm|centimeters?)\b/i.test(name)) return fail('Please give the patient’s name for this question.');
      updates.generalUpdates.name = name;
      break;
    }
    case 'age': {
      if (/\b(?:waist|waste|kamar|cms?|centimet(?:er|re)s?|inches?|weight|kilograms?|kg)\b|कमर|सेंटीमीटर/i.test(text)) return fail('This is the age question. Give age in years; waist measurements belong in the waist question.');
      const age = parseInterviewNumber(text, 120);
      if (age === undefined) return fail('Please give an age between 0 and 120 years, for example 26.');
      updates.generalUpdates.age = age;
      updates.partAUpdates.ageScore = classifyAge(age);
      break;
    }
    case 'sex': {
      // Homophones are normalized only for the sex question, never for names or other answers.
      const normalized = lower.replace(/\b(?:femail|fee[ -]?male|fem[ -]ale)\b/g, 'female');
      if (/\b(?:not|isn.t|aren.t)\b|नहीं/.test(normalized)) return fail('Please confirm the patient’s sex directly: female, male, or other.');
      const matches = [
        /\b(?:female|woman|girl|mahila|aurat|f)\b|महिला|स्त्री/.test(normalized) && 'F',
        /\b(?:male|mail|man|boy|purush|admi|m)\b|पुरुष|आदमी|मेल/.test(normalized) && 'M',
        /\b(?:other|o)\b|अन्य/.test(normalized) && 'O',
      ].filter(Boolean) as Sex[];
      if (matches.length !== 1) return fail('Please confirm one answer: female, male, or other.');
      updates.generalUpdates.sex = matches[0];
      break;
    }
    case 'waist': {
      if (/\b(?:age|years?|yrs?|old|inches?|weight|kg|weeks?|days?|minutes?)\b|उम्र|साल/i.test(text)) return fail('Please give the waist measurement in centimeters, for example 90 cm.');
      const measurement = text.replace(/\b(?:my|the|waist|waste|waistline|measurement|measures?|is|of|around|cms?|centimet(?:er|re)s?)\b/gi, '').replace(/कमर|मेरी|मेरा|माप|सेंटीमीटर|सेमी|है/g, '').trim();
      const waist = parseInterviewNumber(measurement, 250);
      if (waist === undefined || waist < 40) return fail('Please give a waist measurement between 40 and 250 cm.');
      updates.partAUpdates.waistCm = waist;
      updates.partAUpdates.waistScore = classifyWaist(waist, sex);
      break;
    }
    case 'smoke': {
      if (no || /never|non.?smoker|no tobacco|does not smoke|नहीं|कभी नहीं/i.test(text)) updates.partAUpdates.smokeScore = 0;
      else if (/past|used to|quit|sometimes|occasionally|कभी.?कभी/i.test(text)) updates.partAUpdates.smokeScore = 1;
      else if (/daily|every day|रोज|प्रतिदिन/i.test(text)) updates.partAUpdates.smokeScore = 2;
      else return fail('Please specify tobacco use: never, past/sometimes, or daily.');
      break;
    }
    case 'alcohol': {
      if (no || /no alcohol|never|doesn.t drink|नहीं/i.test(text)) updates.partAUpdates.alcoholScore = 0;
      else if (yes || /daily|every day|रोज|प्रतिदिन/i.test(text)) updates.partAUpdates.alcoholScore = 1;
      else return fail('Please answer whether alcohol is consumed daily: yes or no.');
      break;
    }
    case 'physicalActivity': {
      if (no || /sedentary|inactive|no exercise|less than 150|कम|नहीं/i.test(text)) updates.partAUpdates.physicalActivityScore = 1;
      else if (yes || /active|walks daily|exercise|150|रोज|व्यायाम/i.test(text)) updates.partAUpdates.physicalActivityScore = 0;
      else return fail('Please answer whether you do at least 150 minutes of activity each week.');
      break;
    }
    case 'familyHistory': {
      if (no || /no family history|कोई नहीं/i.test(text)) updates.partAUpdates.familyHistoryScore = 0;
      else if (yes || /family history|mother|father|sibling|parents|high bp|diabetes|heart disease|माता|पिता|परिवार/i.test(text)) updates.partAUpdates.familyHistoryScore = 2;
      else return fail('Please answer yes or no about family history.');
      break;
    }
    case 'cough_tb':
    case 'women_symptoms': {
      if (question === 'women_symptoms' && sex !== 'F') return fail('This question is not applicable to the selected patient.');
      const keys = question === 'cough_tb' ? ['cough_two_weeks', 'blood_in_sputum'] : ['breast_lump', 'bleeding_between_periods', 'bleeding_after_menopause'];
      if (no) for (const key of keys) updates.partBUpdates[key] = false;
      else {
        const parsed = parseCbacText(text, sex);
        for (const key of keys) if (parsed.partBUpdates[key] !== undefined) updates.partBUpdates[key] = parsed.partBUpdates[key];
        if (question === 'cough_tb' && /(?:[23२३]|दो|तीन)\s*(?:हफ्त|सप्ताह).*खांसी|खांसी.*(?:[23२३]|दो|तीन)\s*(?:हफ्त|सप्ताह)/.test(text)) updates.partBUpdates.cough_two_weeks = true;
        if (question === 'women_symptoms' && /between periods|माहवारी के बीच/i.test(text)) { updates.partBUpdates.bleeding_between_periods = true; delete updates.partBUpdates.bleeding_after_menopause; }
        if (!Object.keys(updates.partBUpdates).length) return fail('Please specify the symptom, or answer no symptoms.');
      }
      break;
    }
    case 'cooking_fuel': {
      const fuels = parseCbacText(text, sex).partCUpdates.cookingFuel || [];
      if (/लकड़ी|चूल्हा/.test(text)) fuels.push('firewood');
      if (/गोबर|उपला/.test(text)) fuels.push('cow_dung_cake');
      if (/गैस|एलपीजी/.test(text)) fuels.push('lpg');
      if (!fuels.length) return fail('Please specify cooking fuel, such as LPG, firewood, coal, or cow dung cake.');
      updates.partCUpdates.cookingFuel = Array.from(new Set(fuels));
      break;
    }
    case 'phq1_interest':
    case 'phq2_mood': {
      let frequency: number | undefined;
      if (no || /not at all|बिल्कुल नहीं/i.test(text)) frequency = 0;
      else if (/nearly every day|every day|लगभग हर दिन|रोज/i.test(text)) frequency = 3;
      else if (/more than half|आधे से अधिक/i.test(text)) frequency = 2;
      else if (/several days|कई दिन|कुछ दिन/i.test(text)) frequency = 1;
      else if (/^[0-3]$/.test(lower)) frequency = Number(lower);
      if (frequency === undefined) return fail('Please answer not at all, several days, more than half the days, or nearly every day.');
      if (question === 'phq1_interest') updates.partDUpdates.phq1Score = frequency;
      else updates.partDUpdates.phq2Score = frequency;
      break;
    }
    default: return fail('This question is not supported. Use the form field to record your answer.');
  }
  updates.explanations = [{ field: question, detail: question === 'sex' ? `Sex set to ${updates.generalUpdates.sex === 'M' ? 'Male' : updates.generalUpdates.sex === 'F' ? 'Female' : 'Other'}` : `${question === 'waist' ? 'Waist' : question}: answer saved to this question’s field` }];
  return { ok: true, updates };
}
