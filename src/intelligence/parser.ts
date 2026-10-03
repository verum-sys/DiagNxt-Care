/**
 * Contextual Case Understanding — turns a frontline worker's free-text (or dictated) note into a
 * structured draft case. Local keyword/pattern extraction for English, Hinglish and Hindi (Devanagari).
 *
 * The output is a *draft*: every field carries Known/Unknown so the worker confirms or corrects it.
 * Anything not understood is shown as Unknown rather than guessed.
 */
import type { Intention, Sex, Urgency } from '../db/types';
import { addDays, today as todayISO } from './dates';

export interface ParsedCase {
  name?: string;
  age?: number;
  sex?: Sex;
  phone?: string;
  locality?: string;
  destinationFacility?: string;
  referralDate?: string;
  urgency?: Urgency;
  reason?: string;
  patientIntention?: Intention;
  appointmentDate?: string;
  /** True when the note says the facility has not replied (facility response explicitly Unknown). */
  facilityNotHeard: boolean;
  /** True when the note says the facility accepted / confirmed. */
  facilityAccepted: boolean;
}

export type ParsedField =
  | 'name'
  | 'age'
  | 'phone'
  | 'locality'
  | 'destinationFacility'
  | 'referralDate'
  | 'reason'
  | 'urgency'
  | 'facilityResponse'
  | 'appointmentDate'
  | 'attendance'
  | 'patientIntention';

export const PARSED_FIELDS: ParsedField[] = [
  'name',
  'age',
  'phone',
  'locality',
  'destinationFacility',
  'referralDate',
  'reason',
  'urgency',
  'facilityResponse',
  'appointmentDate',
  'attendance',
  'patientIntention',
];

const DEV = 'ऀ-ॿ';

const FACILITIES: { re: RegExp; name: string }[] = [
  { re: /\bsub[-\s]?district hospital\b|\bSDH\b/i, name: 'Sub-District Hospital' },
  { re: /\bdistrict hospital\b|\bDH\b|\bzila (?:aspatal|hospital)\b|\bjila (?:aspatal|hospital)\b|[जज़]िला अस्पताल/i, name: 'District Hospital' },
  { re: /\bcommunity health cent(?:er|re)\b|\bCHC\b|सामुदायिक स्वास्थ्य केंद्र|सी\s?एच\s?सी/i, name: 'Community Health Centre (CHC)' },
  { re: /\bprimary health cent(?:er|re)\b|\bPHC\b|प्राथमिक स्वास्थ्य केंद्र|पी\s?एच\s?सी/i, name: 'Primary Health Centre (PHC)' },
  { re: /\bmedical college\b|मेडिकल कॉलेज/i, name: 'Medical College Hospital' },
  { re: /\bcivil hospital\b|सिविल अस्पताल/i, name: 'Civil Hospital' },
];

const NOT_NAMES = new Set([
  'I', 'She', 'He', 'They', 'The', 'Her', 'His', 'Patient', 'Hospital', 'District', 'Doctor', 'Today', 'Yesterday',
  'Woh', 'Wo', 'Usko', 'Unko', 'Maine', 'Main', 'CHC', 'PHC', 'DH', 'ANM', 'ASHA', 'Mrs', 'Smt', 'Shri', 'Mr',
  'मैंने', 'उस', 'उसको', 'उन्हें', 'उनको', 'वह', 'मरीज', 'मरीज़', 'अस्पताल', 'डॉक्टर', 'आज', 'कल',
]);

function cleanName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const n = raw.trim().replace(/[.,;:]$/, '');
  if (!n || NOT_NAMES.has(n) || NOT_NAMES.has(n.split(' ')[0])) return undefined;
  return n;
}

function extractName(t: string): string | undefined {
  const patterns: RegExp[] = [
    /\b(?:name is|named|naam|patient)\s+(?:is\s+)?(?:Mrs\.?\s|Smt\.?\s|Mr\.?\s|Shri\s)?([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/,
    /\b[Rr]eferred\s+(?:Mrs\.?\s|Smt\.?\s|Mr\.?\s|Shri\s)?([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/,
    /\b(?:Mrs\.?|Smt\.?|Mr\.?|Shri)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/,
    /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+ko\b/,
    new RegExp(`(?:^|\\s)([${DEV}]+)\\s+को\\s`),
    /^([A-Z][a-z]+)\b(?:,|\s+(?:is|was|aged|age|\d))/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    const n = cleanName(m?.[1]);
    if (n) return n;
  }
  return undefined;
}

function extractAge(t: string): number | undefined {
  const m =
    t.match(/\b(\d{1,3})\s*(?:-|\s)?(?:years?(?:\s+old)?|yrs?|y\/o|yo|saal|sal)\b/i) ||
    t.match(/\bage[ds]?\s*(?:is\s*)?(\d{1,3})\b/i) ||
    t.match(/(\d{1,3})\s*(?:वर्ष|साल)/);
  return m ? Number(m[1]) : undefined;
}

function extractSex(t: string): Sex | undefined {
  if (/\b(she|her|woman|female|girl|mahila|ladki|jayegi|gayi|aayegi)\b|महिला|लड़की|जाएगी|गई|आएगी/i.test(t)) return 'F';
  if (/\b(he|his|him|man|male|boy|purush|ladka|jayega|gaya|aayega)\b|पुरुष|लड़का|जाएगा|गया|आएगा/i.test(t)) return 'M';
  return undefined;
}

function extractPhone(t: string): string | undefined {
  const compact = t.replace(/(\d)[\s-](?=\d)/g, '$1');
  const m = compact.match(/(?:\+?91)?([6-9]\d{9})\b/);
  return m ? m[1] : undefined;
}

function extractLocality(t: string): string | undefined {
  const m =
    t.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:village|gaon|gaanv|gaav)\b/) ||
    t.match(/\b(?:village|gaon)\s+([A-Z][a-z]+)/i) ||
    t.match(/\bfrom\s+([A-Z][a-z]+)(?!\s+(?:hospital|District|CHC|PHC))/) ||
    t.match(new RegExp(`([${DEV}]+)\\s+(?:गाँव|गांव)`));
  return m ? m[1] : undefined;
}

function extractFacility(t: string): string | undefined {
  for (const f of FACILITIES) {
    const m = t.match(f.re);
    if (!m) continue;
    // Keep a place name in front of it, e.g. "Sitapur District Hospital".
    const before = t.slice(0, m.index).match(/\b([A-Z][a-z]{2,})\s+$/);
    if (before && !NOT_NAMES.has(before[1]) && !/^(The|A|An|To|At)$/.test(before[1])) return `${before[1]} ${f.name}`;
    return f.name;
  }
  return undefined;
}

/** Past date the referral was made, from relative expressions. */
function extractReferralDate(t: string, now: string): string | undefined {
  const n = t.match(/\b(\d{1,2})\s+days?\s+ago\b|\b(\d{1,2})\s+din\s+(?:pehle|pahle)\b/i) || t.match(/(\d{1,2})\s+दिन\s+पहले/);
  if (n) return addDays(now, -Number(n[1] ?? n[2]));
  if (/\bday before yesterday\b|\bparso\b|परसों/i.test(t)) return addDays(now, -2);
  if (/\byesterday\b|\bkal\b|कल/i.test(t)) return addDays(now, -1);
  if (/\blast week\b|\bpichhle hafte\b|\bpichle hafte\b|पिछले हफ़?्ते/i.test(t)) return addDays(now, -7);
  if (/\btoday\b|\baaj\b|आज/i.test(t)) return now;
  const d = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (d) {
    const y = d[3].length === 2 ? 2000 + Number(d[3]) : Number(d[3]);
    return `${y}-${String(d[2]).padStart(2, '0')}-${String(d[1]).padStart(2, '0')}`;
  }
  return undefined;
}

function extractAppointment(t: string, now: string): string | undefined {
  if (!/\bappointment\b|\bappt\b|\btareekh\b|\bdate (?:is|given)\b|तारीख|अपॉइंटमेंट/i.test(t)) return undefined;
  const seg = t.slice(t.search(/appointment|appt|tareekh|date|तारीख|अपॉइंटमेंट/i));
  const inN = seg.match(/\bin\s+(\d{1,2})\s+days?\b/i);
  if (inN) return addDays(now, Number(inN[1]));
  if (/\btomorrow\b/i.test(seg)) return addDays(now, 1);
  if (/\bnext week\b|\bagle hafte\b/i.test(seg)) return addDays(now, 7);
  if (/\btoday\b|\baaj\b|आज/i.test(seg)) return now;
  return undefined;
}

function extractUrgency(t: string): Urgency | undefined {
  if (/\burgent(?:ly)?\b|\bemergency\b|\bturant\b|\bimmediately\b|\bas soon as possible\b|तुरंत|फ़?ौरन/i.test(t)) return 'urgent';
  if (/\bsoon\b|\bthis week\b|\bjaldi\b|जल्दी/i.test(t)) return 'soon';
  if (/\broutine\b|\bno hurry\b/i.test(t)) return 'routine';
  return undefined;
}

function extractReason(t: string): string | undefined {
  const en = t.match(
    /\b(?:for|because of|due to)\s+(?!(?:the|a)\s+(?:hospital|reply|response)|\d+\s+days?|her|him|them|it\b)(.{3,60}?)(?=[.,;!?]|\s+(?:yesterday|today|and|but|she|he|to the|at the|on)\b|$)/i,
  );
  if (en) return en[1].replace(/^(a|an|the)\s+/i, '').trim();
  const hing = t.match(/\b([a-z][a-z\s]{2,40}?)\s+ke\s+liye\b/i);
  if (hing && !/\brefer\b/i.test(hing[1])) return hing[1].trim();
  const dev = t.match(new RegExp(`([${DEV}][${DEV}\\s]{1,40}?)\\s+के\\s+लिए`));
  if (dev) return dev[1].trim();
  return undefined;
}

function extractIntention(t: string): Intention | undefined {
  if (/\b(?:refused|won['’]?t go|will not go|doesn['’]?t want to go|not going|nahi jayegi|nahi jayega|nahin jayegi)\b|नहीं जाएगी|नहीं जाएगा|मना कर/i.test(t))
    return 'will_not_attend';
  if (/\b(?:not sure|unsure|maybe|might go|pata nahi|soch rahi)\b|पता नहीं|शायद/i.test(t)) return 'unsure';
  if (
    /\b(?:would go|will go|agreed to go|plans? to go|going to go|ready to go|said (?:she|he)(?:['’]d| would| will) go|will attend|jayegi|jayega|jaane ko taiyar)\b|जाएगी|जाएगा|जाने को तैयार/i.test(
      t,
    )
  )
    return 'will_attend';
  return undefined;
}

export function parseFreeText(input: string, now: Date = new Date()): ParsedCase {
  const t = input.replace(/\s+/g, ' ').trim();
  const day = todayISO(now);
  return {
    name: extractName(t),
    age: extractAge(t),
    sex: extractSex(t),
    phone: extractPhone(t),
    locality: extractLocality(t),
    destinationFacility: extractFacility(t),
    referralDate: extractReferralDate(t, day),
    urgency: extractUrgency(t),
    reason: extractReason(t),
    patientIntention: extractIntention(t),
    appointmentDate: extractAppointment(t, day),
    facilityNotHeard:
      /\b(?:haven['’]?t heard|have not heard|not heard|no (?:reply|response|word|news|update)|nothing from|koi jawab nahi|jawab nahi aaya|koi khabar nahi)\b|कोई जवाब नहीं|जवाब नहीं आया|कोई खबर नहीं/i.test(
        t,
      ),
    facilityAccepted: /\b(?:hospital|facility|they) (?:has |have )?(?:accepted|confirmed)\b|\baccept kar liya\b|स्वीकार कर/i.test(t),
  };
}

/** Which draft fields were understood (Known) vs not (Unknown). */
export function fieldStates(p: ParsedCase): Record<ParsedField, 'known' | 'unknown'> {
  const k = (v: unknown) => (v !== undefined && v !== '' ? 'known' : 'unknown');
  return {
    name: k(p.name),
    age: k(p.age),
    phone: k(p.phone),
    locality: k(p.locality),
    destinationFacility: k(p.destinationFacility),
    referralDate: k(p.referralDate),
    reason: k(p.reason),
    urgency: k(p.urgency),
    facilityResponse: p.facilityAccepted ? 'known' : 'unknown',
    appointmentDate: k(p.appointmentDate),
    attendance: 'unknown',
    patientIntention: k(p.patientIntention),
  };
}

export const EXAMPLES = {
  en: 'I referred Mary to the district hospital yesterday for a follow-up screening test. She said she would go, but I haven\'t heard anything from the hospital yet.',
  hinglish: 'Sunita ko kal CHC refer kiya, 42 saal, Rampur gaon, phone 98765 43210. Woh jayegi, par hospital se koi jawab nahi aaya.',
  hindi: 'मैंने कमला को परसों जिला अस्पताल रेफर किया, जाँच के लिए। वह जाएगी, लेकिन अस्पताल से कोई जवाब नहीं आया।',
};
