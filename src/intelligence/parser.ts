/**
 * Contextual Case Understanding — turns a frontline worker's free-text (or dictated) note into a
 * structured draft case. Local keyword/pattern extraction for English, Hinglish and Hindi (Devanagari).
 *
 * The output is a *draft*: every field carries Known/Unknown so the worker confirms or corrects it.
 * Anything not understood is shown as Unknown rather than guessed.
 */
import type {
  Intention,
  ReferralDecision,
  ReferralRequiredAnswer,
  ScreeningArea,
  ScreeningFinding,
  Sex,
  Urgency,
} from '../db/types';
import { addDays, nearestWeekdayIso, today as todayISO, type WeekdayDirection } from './dates';

export { EXAMPLES } from './demoCases';

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
  referralDecision?: ReferralDecision;
  /** Set when appointment language is tentative (probably, shayad, etc.). */
  appointmentTentative?: boolean;
  screeningCompleted?: boolean;
  screeningArea?: ScreeningArea;
  screeningFinding?: ScreeningFinding;
  referralRequired?: ReferralRequiredAnswer;
}

export type ParsedField =
  | 'screeningCompleted'
  | 'screeningArea'
  | 'screeningFinding'
  | 'referralRequired'
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
  'screeningCompleted',
  'screeningArea',
  'screeningFinding',
  'referralRequired',
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

export interface FieldSpan {
  field: ParsedField;
  start: number;
  end: number;
}

export interface ParseResult {
  case: ParsedCase;
  spans: FieldSpan[];
  /** Normalized text spans refer to (whitespace collapsed, trimmed). */
  text: string;
}

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

/** Lower number = wins on tie after length sort. */
const SPAN_FIELD_PRIORITY: Record<ParsedField, number> = {
  destinationFacility: 1,
  name: 2,
  referralDate: 3,
  appointmentDate: 4,
  reason: 5,
  age: 6,
  phone: 7,
  locality: 8,
  urgency: 9,
  patientIntention: 10,
  facilityResponse: 11,
  attendance: 12,
  screeningCompleted: 13,
  screeningArea: 14,
  screeningFinding: 15,
  referralRequired: 16,
};

function cleanName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const n = raw.trim().replace(/[.,;:]$/, '');
  if (!n || NOT_NAMES.has(n) || NOT_NAMES.has(n.split(' ')[0])) return undefined;
  return n;
}

const PLACE_STOPWORDS = /^(the|a|an|to|at|for|in|on)$/i;
/** Relative-day words that sit next to facilities in Hinglish but are not place names. */
const NOT_PLACE_PREFIX = /^(kal|aaj|aj|parso|yesterday|today|tomorrow|liye|ke|par|mein|unhe|unhein|unko|unki)$/i;

const WEEKDAY_NAME_BLOCK =
  /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|somvar|somwar|mangalvar|mangalwar|budhvar|guruvar|shukravar|shanivar|ravivar|सोमवार|मंगलवार|बुधवार|गुरुवार|शुक्रवार|शनिवार|रविवार)$/i;

function titlePlace(raw: string): string {
  if (!raw) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** Word immediately before a facility phrase, e.g. "sadar" in "sadar district hospital". */
function placePrefixBefore(t: string, facilityIndex: number): { place: string; spanLen: number } | undefined {
  const before = t.slice(0, facilityIndex).match(/\b([A-Za-z]{2,})\s+$/);
  if (!before) return undefined;
  const raw = before[1];
  const place = titlePlace(raw);
  if (NOT_NAMES.has(raw) || NOT_NAMES.has(place) || PLACE_STOPWORDS.test(raw) || NOT_PLACE_PREFIX.test(raw)) return undefined;
  return { place, spanLen: before[0].length };
}

function spanFromMatch(m: RegExpMatchArray, field: ParsedField, group = 0): FieldSpan | undefined {
  if (m.index === undefined) return undefined;
  const slice = group === 0 ? m[0] : m[group];
  if (!slice) return undefined;
  const off = group === 0 ? 0 : m[0].indexOf(slice);
  if (off < 0) return undefined;
  const start = m.index + off;
  return { field, start, end: start + slice.length };
}

function extractNameWithSpan(t: string): { value?: string; span?: FieldSpan } {
  const patterns: { re: RegExp; group: number }[] = [
    { re: /\bregistering\s+([A-Z][a-z]+)\b/, group: 1 },
    { re: new RegExp(`([${DEV}]+)(?=\\s+का\\s+पंजीकरण)`), group: 1 },
    { re: /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*,\s*\d/, group: 1 },
    { re: /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+\d/, group: 1 },
    { re: new RegExp(`^([${DEV}]+(?:\\s+[${DEV}]+)?)\\s*,`), group: 1 },
    { re: new RegExp(`श्रीमती\\s+([${DEV}]+(?:\\s+[${DEV}]+)?)\\s*,`), group: 1 },
    { re: /\b(?:name is|named|naam|patient)\s+(?:is\s+)?(?:Mrs\.?\s|Smt\.?\s|Mr\.?\s|Shri\s)?([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/, group: 1 },
    { re: /\b[Rr]eferred\s+(?:Mrs\.?\s|Smt\.?\s|Mr\.?\s|Shri\s)?([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/, group: 1 },
    { re: /\b(?:Mrs\.?|Smt\.?|Mr\.?|Shri)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/, group: 1 },
    { re: /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+ko\b/, group: 1 },
    { re: new RegExp(`(?:^|\\s)([${DEV}]+)\\s+को\\s`), group: 1 },
    { re: new RegExp(`मैंने\\s+(?:कल\\s+)?([${DEV}]+)\\s*,`), group: 1 },
    { re: new RegExp(`मैंने\\s+([${DEV}]+(?:\\s+[${DEV}]+)?)\\s*,`), group: 1 },
    { re: /^([A-Z][a-z]+)\b(?:,|\s+(?:is|was|aged|age|\d))/, group: 1 },
  ];
  for (const { re, group } of patterns) {
    const m = t.match(re);
    const n = cleanName(m?.[group]);
    if (n && m && !WEEKDAY_NAME_BLOCK.test(n)) {
      const span = spanFromMatch(m, 'name', group);
      if (span) return { value: n, span };
    }
  }
  return {};
}

function extractAgeWithSpan(t: string): { value?: number; span?: FieldSpan } {
  const patterns = [
    /\b(\d{1,3})\s*(?:-|\s)?(?:years?(?:\s+old)?|yrs?|y\/o|yo|saal|sal)\b/i,
    /\b(?:is|are)\s+(\d{1,3})\s+from\b/i,
    /\b(\d{1,3})\s*,\s*from\b/i,
    /\bage[ds]?\s*(?:is\s*)?(\d{1,3})\b/i,
    /(\d{1,3})\s*(?:वर्ष|साल)/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const span = spanFromMatch(m, 'age', 0);
      return { value: Number(m[1]), span };
    }
  }
  return {};
}

/** Mr / Mrs / Smt etc. next to a name — common in referral notes without pronouns. */
function extractSexFromHonorific(t: string): Sex | undefined {
  if (/\b(?:Mrs|Ms|Miss|Smt)\.?\s+(?:[A-Z][a-z]+|[\u0900-\u097F])/i.test(t)) return 'F';
  if (/\b(?:Mr|Shri)\.?\s+(?:[A-Z][a-z]+|[\u0900-\u097F])/i.test(t)) return 'M';
  return undefined;
}

function extractSex(t: string): Sex | undefined {
  const fromTitle = extractSexFromHonorific(t);
  if (fromTitle) return fromTitle;
  if (/\b(she|her|woman|female|girl|mahila|ladki|jayegi|gayi|aayegi)\b|महिला|लड़की|जाएगी|गई|आएगी/i.test(t)) return 'F';
  if (/\b(he|his|him|man|male|boy|purush|ladka|jayega|gaya|aayega)\b|पुरुष|लड़का|जाएगा|गया|आएगा/i.test(t)) return 'M';
  return undefined;
}

function extractPhoneWithSpan(t: string): { value?: string; span?: FieldSpan } {
  const m = t.match(/(?:\+?91[\s-]?)?([6-9]\d(?:[\s-]?\d){8})\b/);
  if (!m) return {};
  const digits = m[1].replace(/[\s-]/g, '');
  const span = spanFromMatch(m, 'phone', 0);
  return { value: digits, span };
}

function extractLocalityWithSpan(t: string): { value?: string; span?: FieldSpan } {
  const m1 = t.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:village|gaon|gaanv|gaav)\b/);
  if (m1) {
    return { value: m1[1], span: spanFromMatch(m1, 'locality', 0) };
  }
  const m2 = t.match(/\b(?:village|gaon)\s+([A-Z][a-z]+)/i);
  if (m2) {
    return { value: m2[1], span: spanFromMatch(m2, 'locality', 0) };
  }
  const m3 = t.match(/\bfrom\s+([A-Z][a-z]+)(?!\s+(?:hospital|District|CHC|PHC))/);
  if (m3) {
    return { value: m3[1], span: spanFromMatch(m3, 'locality', 1) };
  }
  const m4 = t.match(new RegExp(`([${DEV}]+)\\s+(?:गाँव|गांव)`));
  if (m4) {
    return { value: m4[1], span: spanFromMatch(m4, 'locality', 1) };
  }
  const m5 = t.match(/\bfrom\s+([A-Z][a-z]+)\s+village\b/i);
  if (m5) {
    return { value: m5[1], span: spanFromMatch(m5, 'locality', 1) };
  }
  const m6 = t.match(/\b([A-Z][a-z]+)\s+gaon\b/i);
  if (m6) {
    return { value: m6[1], span: spanFromMatch(m6, 'locality', 1) };
  }
  return {};
}

function extractFacilityWithSpan(t: string): { value?: string; span?: FieldSpan } {
  for (const f of FACILITIES) {
    const m = t.match(f.re);
    if (!m || m.index === undefined) continue;
    const prefix = placePrefixBefore(t, m.index);
    let start = m.index;
    const end = m.index + m[0].length;
    let value = f.name;
    if (prefix) {
      value = `${prefix.place} ${f.name}`;
      start = m.index - prefix.spanLen;
    }
    return { value, span: { field: 'destinationFacility', start, end } };
  }
  return {};
}

function extractReferralDateWithSpan(t: string, now: string): { value?: string; span?: FieldSpan } {
  const n = t.match(/\b(\d{1,2})\s+days?\s+ago\b|\b(\d{1,2})\s+din\s+(?:pehle|pahle)\b/i) || t.match(/(\d{1,2})\s+दिन\s+पहले/);
  if (n && n.index !== undefined) {
    return { value: addDays(now, -Number(n[1] ?? n[2])), span: { field: 'referralDate', start: n.index, end: n.index + n[0].length } };
  }
  const parso = t.match(/\bday before yesterday\b|\bparso\b|परसों/i);
  if (parso && parso.index !== undefined) {
    return { value: addDays(now, -2), span: { field: 'referralDate', start: parso.index, end: parso.index + parso[0].length } };
  }
  const twoWeeks = t.match(/\btwo weeks ago\b|\bdo hafte pehle\b|दो\s+हफ़?्ते\s+पहले/i);
  if (twoWeeks && twoWeeks.index !== undefined) {
    return { value: addDays(now, -14), span: { field: 'referralDate', start: twoWeeks.index, end: twoWeeks.index + twoWeeks[0].length } };
  }
  const yest = t.match(/\byesterday\b|\bkal\b|कल/i);
  if (yest && yest.index !== undefined) {
    return { value: addDays(now, -1), span: { field: 'referralDate', start: yest.index, end: yest.index + yest[0].length } };
  }
  const week = t.match(/\blast week\b|\bpichhle hafte\b|\bpichle hafte\b|पिछले हफ़?्ते/i);
  if (week && week.index !== undefined) {
    return { value: addDays(now, -7), span: { field: 'referralDate', start: week.index, end: week.index + week[0].length } };
  }
  const todayM = t.match(/\btoday\b|\baaj\b|आज/i);
  if (todayM && todayM.index !== undefined) {
    return { value: now, span: { field: 'referralDate', start: todayM.index, end: todayM.index + todayM[0].length } };
  }
  const d = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (d && d.index !== undefined) {
    const y = d[3].length === 2 ? 2000 + Number(d[3]) : Number(d[3]);
    return {
      value: `${y}-${String(d[2]).padStart(2, '0')}-${String(d[1]).padStart(2, '0')}`,
      span: { field: 'referralDate', start: d.index, end: d.index + d[0].length },
    };
  }
  return {};
}

function isTentativeAppointmentContext(seg: string): boolean {
  return (
    /\b(probably|maybe|might|shayad|lagta|likely|शायद)\b/i.test(seg) ||
    /\b(?:not\s+)?confirm(?:ed|ation)?\s+nahi\b|\bconfirm nahi hua\b|\babhi confirm nahi\b|\bnot confirmed\b/i.test(seg) ||
    /पुष्टि\s+नहीं/i.test(seg)
  );
}

const WEEKDAY_PATTERNS: { re: RegExp; index: number }[] = [
  { re: /\b(?:on\s+)?Monday\b|\bsomvar\b|\bsomwar\b|सोमवार/i, index: 1 },
  { re: /\b(?:on\s+)?Tuesday\b|\bmangalvar\b|\bmangalwar\b|मंगलवार/i, index: 2 },
  { re: /\b(?:on\s+)?Wednesday\b|\bbudhvar\b|बुधवार/i, index: 3 },
  { re: /\b(?:on\s+)?Thursday\b|\bguruvar\b|गुरुवार/i, index: 4 },
  { re: /\b(?:on\s+)?Friday\b|\bshukravar\b|शुक्रवार/i, index: 5 },
  { re: /\b(?:on\s+)?Saturday\b|\bshanivar\b|शनिवार/i, index: 6 },
  { re: /\b(?:on\s+)?Sunday\b|\bravivar\b|रविवार/i, index: 0 },
];

function weekdayDirectionFromContext(t: string, matchIndex: number): WeekdayDirection {
  const ctx = t.slice(Math.max(0, matchIndex - 50), Math.min(t.length, matchIndex + 100));
  if (
    /\b(?:was\s+supposed|had\s+to\s+go|jana\s+tha|jan[ae]\s+thi|going\s+to\s+go)\b|जाना\s+था|था\s*[,।]|pahunch|reached/i.test(
      ctx,
    )
  ) {
    return 'past';
  }
  return 'future';
}

function extractWeekdayAppointmentWithSpan(
  t: string,
  now: string,
): { value?: string; span?: FieldSpan; tentative?: boolean } {
  for (const { re, index } of WEEKDAY_PATTERNS) {
    const m = t.match(re);
    if (!m || m.index === undefined) continue;
    const direction = weekdayDirectionFromContext(t, m.index);
    const value = nearestWeekdayIso(index, now, direction);
    const tentative = isTentativeAppointmentContext(t.slice(Math.max(0, m.index - 30), m.index + 120));
    return {
      value,
      span: { field: 'appointmentDate', start: m.index, end: m.index + m[0].length },
      tentative: tentative || undefined,
    };
  }
  return {};
}

function extractRelativeAppointmentWithSpan(
  t: string,
  now: string,
): { value?: string; span?: FieldSpan; tentative?: boolean } {
  const m = t.match(/\bnext week\b|\bagle hafte\b|अगले\s+हफ़?्ते/i);
  if (m && m.index !== undefined) {
    return {
      value: addDays(now, 7),
      span: { field: 'appointmentDate', start: m.index, end: m.index + m[0].length },
    };
  }
  return {};
}

function extractAppointmentWithSpan(t: string, now: string): { value?: string; span?: FieldSpan; tentative?: boolean } {
  const relative = extractRelativeAppointmentWithSpan(t, now);
  if (relative.value) return relative;

  const weekday = extractWeekdayAppointmentWithSpan(t, now);
  if (weekday.value) return weekday;

  const head = t.search(/appointment|appt|tareekh|date|तारीख|अपॉइंटमेंट/i);
  if (head < 0) return {};
  const seg = t.slice(head);
  const base = head;
  const tentative = isTentativeAppointmentContext(seg);
  const inN = seg.match(/\bin\s+(\d{1,2})\s+days?\b/i);
  if (inN && inN.index !== undefined) {
    return {
      value: addDays(now, Number(inN[1])),
      span: { field: 'appointmentDate', start: base + inN.index, end: base + inN.index + inN[0].length },
      tentative: tentative || undefined,
    };
  }
  const tom = seg.match(/\btomorrow\b/i);
  if (tom && tom.index !== undefined) {
    return {
      value: addDays(now, 1),
      span: { field: 'appointmentDate', start: base + tom.index, end: base + tom.index + tom[0].length },
      tentative: tentative || undefined,
    };
  }
  const nw = seg.match(/\bnext week\b|\bagle hafte\b/i);
  if (nw && nw.index !== undefined) {
    return {
      value: addDays(now, 7),
      span: { field: 'appointmentDate', start: base + nw.index, end: base + nw.index + nw[0].length },
      tentative: tentative || undefined,
    };
  }
  const td = seg.match(/\btoday\b|\baaj\b|आज/i);
  if (td && td.index !== undefined) {
    return {
      value: now,
      span: { field: 'appointmentDate', start: base + td.index, end: base + td.index + td[0].length },
      tentative: tentative || undefined,
    };
  }
  return {};
}

const REFER_DECISION_RE =
  /\b(?:referred|referring|refer(?:ral|red| kiya| kiya tha| kiya hai| kar(?:a| rahi| raha|)| kiye))\b|रेफर(?: कर)?(?: किया)?/i;

function extractReferralDecision(t: string): ReferralDecision | undefined {
  const scrubbed = t.replace(/\breferral\s+required\b/gi, 'ref needed');
  if (REFER_DECISION_RE.test(scrubbed)) return 'referred';
  return undefined;
}

function extractUrgencyWithSpan(t: string): { value?: Urgency; span?: FieldSpan } {
  const urgent = t.match(/\burgent(?:ly)?\b|\bemergency\b|\bturant\b|\btatkal\b|\bimmediately\b|\bas soon as possible\b|तुरंत|तत्काल|फ़?ौरन/i);
  if (urgent && urgent.index !== undefined) return { value: 'urgent', span: { field: 'urgency', start: urgent.index, end: urgent.index + urgent[0].length } };
  const soon = t.match(/\bsoon\b|\bthis week\b|\bjaldi\b|जल्दी/i);
  if (soon && soon.index !== undefined) return { value: 'soon', span: { field: 'urgency', start: soon.index, end: soon.index + soon[0].length } };
  const routine = t.match(/\broutine\b|\bno hurry\b/i);
  if (routine && routine.index !== undefined) return { value: 'routine', span: { field: 'urgency', start: routine.index, end: routine.index + routine[0].length } };
  return {};
}

function reasonFromForClause(en: RegExpExecArray): { value?: string; span?: FieldSpan } | undefined {
  if (!en[1] || en.index === undefined) return undefined;
  const raw = en[1];
  const trimmed = raw.replace(/^(a|an|the)\s+/i, '').trim();
  if (/^(Mrs|Mr|Ms|Miss|Dr)\.?\s+/i.test(trimmed)) return undefined;
  if (/^\d+\s+years?/i.test(trimmed) || /^House\s+\d/i.test(trimmed)) return undefined;
  const articleLen = raw.length - trimmed.length;
  const off = en[0].indexOf(en[1]);
  const start = en.index + off + articleLen;
  return { value: trimmed, span: { field: 'reason', start, end: start + trimmed.length } };
}

function extractReasonWithSpan(t: string): { value?: string; span?: FieldSpan } {
  const enRe =
    /\b(?:for|because of|due to)\s+(?!(?:the|a)\s+(?:hospital|reply|response)|\d+\s+days?|her|him|them|it\b)(.{3,60}?)(?=[.,;!?]|\s+(?:yesterday|today|and|but|she|he|to the|at the|on)\b|$)/gi;
  let en: RegExpExecArray | null;
  while ((en = enRe.exec(t)) !== null) {
    const hit = reasonFromForClause(en);
    if (hit?.value) return hit;
  }
  const hingRe = /\b([a-z]+(?:[-\s][a-z]+){0,3})\s+ke\s+liye\b/gi;
  let hing: RegExpExecArray | null;
  let best: { value: string; span: FieldSpan } | undefined;
  while ((hing = hingRe.exec(t)) !== null) {
    let phrase = hing[1].trim();
    phrase = phrase.replace(/^(?:maine|mein|unhe|unko|unhein|unki)\s+/i, '').trim();
    if (!phrase) continue;
    if (/\brefer\b/i.test(phrase)) continue;
    if (/^(?:maine|chc|phc)\b/i.test(phrase)) continue;
    if (/\bhospital\b/i.test(phrase)) continue;
    const hit = {
      value: phrase,
      span: { field: 'reason' as const, start: hing.index, end: hing.index + hing[1].length },
    };
    if (!best || phrase.length < best.value.length) best = hit;
  }
  if (best) return best;
  const devShort = t.match(new RegExp(`([${DEV}]{1,16})\\s+के\\s+लिए`));
  if (devShort && devShort.index !== undefined) {
    return {
      value: devShort[1].trim(),
      span: { field: 'reason', start: devShort.index, end: devShort.index + devShort[1].length },
    };
  }
  return {};
}

function extractIntentionWithSpan(t: string): { value?: Intention; span?: FieldSpan } {
  const neg = t.match(
    /\b(?:refused|won['’]?t go|will not go|doesn['’]?t want to go|not going|nahi jayegi|nahi jayega|nahin jayegi)\b|नहीं जाएगी|नहीं जाएगा|मना कर/i,
  );
  if (neg && neg.index !== undefined) {
    return { value: 'will_not_attend', span: { field: 'patientIntention', start: neg.index, end: neg.index + neg[0].length } };
  }
  const unsure = t.match(/\b(?:not sure|unsure|maybe|might go|pata nahi|soch rahi)\b|पता नहीं|शायद/i);
  if (unsure && unsure.index !== undefined) {
    return { value: 'unsure', span: { field: 'patientIntention', start: unsure.index, end: unsure.index + unsure[0].length } };
  }
  const pos = t.match(
    /\b(?:would go|will go|agreed to go|plans? to go|going to go|ready to go|said (?:she|he)(?:['’]d| would| will) go|will attend|jayegi|jayega|jaane ko taiyar)\b|जाएगी|जाएगा|जाने को तैयार|जाने के लिए तैयार/i,
  );
  if (pos && pos.index !== undefined) {
    return { value: 'will_attend', span: { field: 'patientIntention', start: pos.index, end: pos.index + pos[0].length } };
  }
  return {};
}

function screeningDoneWordSpan(m: RegExpMatchArray): FieldSpan | undefined {
  if (m.index === undefined) return undefined;
  const word = m[1] ?? m[0].match(/\b(completed|done|complete|poori|puri)\b/i)?.[0];
  if (!word) return { field: 'screeningCompleted', start: m.index, end: m.index + m[0].length };
  const off = m[0].toLowerCase().indexOf(word.toLowerCase());
  const start = m.index + (off >= 0 ? off : 0);
  return { field: 'screeningCompleted', start, end: start + word.length };
}

function extractScreeningCompletedWithSpan(t: string): { value?: boolean; span?: FieldSpan } {
  const areaFirst = t.match(/\b(?:oral|breast|cervical|ncd|TB)\s+screening\s+(completed|done|complete)\b/i);
  if (areaFirst) {
    const span = screeningDoneWordSpan(areaFirst);
    if (span) return { value: true, span };
  }
  const m = t.match(
    /\b(?:screening|janch|jaanch|checkup)\s+(?:completed|done|complete|poori|puri|ho gayi|ho gaya)\b|\bTB\s+screening\s+completed\b|\boral screening complete ho gayi\b|\b(?:completed|done)\s+(?:oral|breast|cervical|ncd|the)\s+screening\b|स्क्रीनिंग\s+(?:पूरी|पूरा|हो गई)|टी\s*बी\s+स्क्रीनिंग\s+पूरी|जाँच\s+पूरी|मुंह\s+की\s+जाँच\s+पूरी/i,
  );
  if (m && m.index !== undefined) {
    const span = screeningDoneWordSpan(m);
    if (span) return { value: true, span };
  }
  if (/\b(?:oral|breast|cervical|ncd|TB)\s+screening\b/i.test(t) && /\b(?:key finding|finding|result)\b/i.test(t)) {
    return { value: true };
  }
  return {};
}

function extractScreeningAreaWithSpan(t: string): { value?: ScreeningArea; span?: FieldSpan } {
  const rules: { re: RegExp; area: ScreeningArea }[] = [
    { re: /\bbreast\s+screening\b|\bscreening\s+(?:for\s+)?breast\b|स्तन\s+स्क्रीनिंग|ब्रेस्ट\s+स्क्रीनिंग/i, area: 'breast' },
    { re: /\bcervical\s+screening\b|\bscreening\s+(?:for\s+)?cervical\b|सर्वाइकल\s+स्क्रीनिंग/i, area: 'cervical' },
    { re: /\bncd\s+screening\b|\b(?:NCD|non[-\s]?communicable)\s+screening\b|एन\s*सी\s*डी\s+स्क्रीनिंग/i, area: 'ncd' },
    {
      re: /\b(?:oral|mouth|munh)\s+screening\b|\bscreening\s+(?:for\s+)?oral\b|ओरल\s+स्क्रीनिंग|मुंह\s+(?:की\s+)?(?:जाँच|स्क्रीनिंग)|प्रारंभिक\s+मुंह/i,
      area: 'oral',
    },
  ];
  for (const { re, area } of rules) {
    const m = t.match(re);
    if (m && m.index !== undefined) {
      return { value: area, span: { field: 'screeningArea', start: m.index, end: m.index + m[0].length } };
    }
  }
  return {};
}

function extractScreeningFindingWithSpan(t: string): { value?: ScreeningFinding; span?: FieldSpan } {
  const m = t.match(
    /\b(?:key finding|finding|result)\s*(?:is|:)?\s*(positive|negative|needs review|needs further review|suspicious|suspicion)\b|(?:positive|negative|needs review)\s+finding\b|निष्कर्ष\s*(?:positive|negative|संदिग्ध)|(?:positive|negative|संदिग्ध)\s*(?:निष्कर्ष|finding)/i,
  );
  if (m && m.index !== undefined) {
    const token = m[1] ?? m[0].match(/\b(positive|negative|needs review|needs further review|suspicious)\b/i)?.[0] ?? m[0];
    let value: ScreeningFinding = 'needs_review';
    if (/^positive$/i.test(token)) value = 'positive';
    else if (/^negative$/i.test(token)) value = 'negative';
    else if (/needs review|suspicious/i.test(token)) value = 'needs_review';
    const off = m[0].toLowerCase().indexOf(token.toLowerCase());
    const start = m.index + (off >= 0 ? off : 0);
    const end = start + token.length;
    return { value, span: { field: 'screeningFinding', start, end } };
  }
  return {};
}

function extractReferralRequiredWithSpan(t: string): { value?: ReferralRequiredAnswer; span?: FieldSpan } {
  const no = t.match(
    /\breferral\s+(?:is\s+)?not\s+required\b|\bno\s+referral\s+(?:needed|required)\b|\breferral\s+required\s*(?::\s*)?no\b|\breferral\s+nahi\b|\brefer\s+nahi\b/i,
  );
  if (no && no.index !== undefined) {
    return { value: 'no', span: { field: 'referralRequired', start: no.index, end: no.index + no[0].length } };
  }
  const yes = t.match(
    /\breferral\s+required\s*(?::\s*)?yes\b|\breferral\s+(?:is\s+)?required(?!\s*(?:no|nahi))\b|\brefer\s+karna\s+hai\b|\breferral\s+yes\b|\bneeds?\s+referral\b/i,
  );
  if (yes && yes.index !== undefined) {
    return { value: 'yes', span: { field: 'referralRequired', start: yes.index, end: yes.index + yes[0].length } };
  }
  return {};
}

function extractFacilityAcceptedWithSpan(t: string): { accepted: boolean; span?: FieldSpan } {
  const m = t.match(
    /\b(?:has|have|had)\s+accepted\s+the\s+referral\b|\b(?:hospital|facility|CHC|they)\s+(?:has |have |had )?(?:accepted|confirmed)\b|\b(?:referral\s+)?accept(?:ed| kar liya(?: hai| tha)?)\b|\baccept kar liya\b|स्वीकार\s+(?:कर\s+)?(?:लिया|किया)(?:\s+था)?/i,
  );
  if (m && m.index !== undefined) {
    return { accepted: true, span: { field: 'facilityResponse', start: m.index, end: m.index + m[0].length } };
  }
  return { accepted: false };
}

function spansOverlap(a: FieldSpan, b: FieldSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

export function resolveSpanOverlaps(spans: FieldSpan[]): FieldSpan[] {
  const sorted = [...spans].sort((a, b) => {
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenB !== lenA) return lenB - lenA;
    return SPAN_FIELD_PRIORITY[a.field] - SPAN_FIELD_PRIORITY[b.field];
  });
  const kept: FieldSpan[] = [];
  for (const s of sorted) {
    if (kept.some((k) => spansOverlap(k, s))) continue;
    kept.push(s);
  }
  return kept.sort((a, b) => a.start - b.start);
}

export function parseFreeTextWithSpans(input: string, now: Date = new Date()): ParseResult {
  const text = input.replace(/\s+/g, ' ').trim();
  const day = todayISO(now);

  const nameR = extractNameWithSpan(text);
  const ageR = extractAgeWithSpan(text);
  const phoneR = extractPhoneWithSpan(text);
  const localityR = extractLocalityWithSpan(text);
  const facilityR = extractFacilityWithSpan(text);
  const referralR = extractReferralDateWithSpan(text, day);
  const appointmentR = extractAppointmentWithSpan(text, day);
  const urgencyR = extractUrgencyWithSpan(text);
  const reasonR = extractReasonWithSpan(text);
  const intentionR = extractIntentionWithSpan(text);
  const facilityAcc = extractFacilityAcceptedWithSpan(text);
  const screeningDoneR = extractScreeningCompletedWithSpan(text);
  const screeningAreaR = extractScreeningAreaWithSpan(text);
  const screeningFindingR = extractScreeningFindingWithSpan(text);
  const referralReqR = extractReferralRequiredWithSpan(text);

  const facilityNotHeard =
    /\b(?:haven['’]?t heard|have not heard|not heard|no (?:reply|response|word|news|update)|nothing from|koi jawab nahi|jawab nahi aaya|koi khabar nahi)\b|कोई जवाब नहीं|जवाब नहीं आया|कोई खबर नहीं/i.test(
      text,
    );

  /** Past visit + accepted referral but no referral date → treat referral as on or before the visit. */
  let referralDate = referralR.value;
  if (!referralDate && appointmentR.value && facilityAcc.accepted && appointmentR.value < day) {
    referralDate = appointmentR.value;
  }

  let reason = reasonR.value;
  if (
    !reason &&
    appointmentR.value &&
    facilityR.value &&
    /\b(?:was\s+supposed|had\s+to\s+go)\b|\bjana\s+tha\b|जाना\s+था/i.test(text)
  ) {
    reason = `Scheduled visit — ${facilityR.value}`;
  }

  const parsedCase: ParsedCase = {
    name: nameR.value,
    age: ageR.value,
    sex: extractSex(text),
    phone: phoneR.value,
    locality: localityR.value,
    destinationFacility: facilityR.value,
    referralDate,
    urgency: urgencyR.value,
    reason,
    patientIntention: intentionR.value,
    appointmentDate: appointmentR.value,
    facilityNotHeard,
    facilityAccepted: facilityAcc.accepted,
    referralDecision: extractReferralDecision(text),
    appointmentTentative: appointmentR.tentative,
    screeningCompleted: screeningDoneR.value,
    screeningArea: screeningAreaR.value,
    screeningFinding: screeningFindingR.value,
    referralRequired:
      referralReqR.value ??
      (extractReferralDecision(text) === 'referred' ? 'yes' : undefined),
  };

  const rawSpans: FieldSpan[] = [];
  for (const s of [
    screeningDoneR.span,
    screeningAreaR.span,
    screeningFindingR.span,
    referralReqR.span,
    nameR.span,
    ageR.span,
    phoneR.span,
    localityR.span,
    facilityR.span,
    referralR.span,
    appointmentR.span,
    urgencyR.span,
    reasonR.span,
    intentionR.span,
    facilityAcc.span,
  ]) {
    if (s) rawSpans.push(s);
  }

  return { case: parsedCase, spans: resolveSpanOverlaps(rawSpans), text };
}

export function parseFreeText(input: string, now: Date = new Date()): ParsedCase {
  return parseFreeTextWithSpans(input, now).case;
}

/** Which draft fields were understood (Known) vs not (Unknown). */
export function fieldStates(p: ParsedCase): Record<ParsedField, 'known' | 'unknown'> {
  const k = (v: unknown) => (v !== undefined && v !== '' ? 'known' : 'unknown');
  return {
    screeningCompleted: p.screeningCompleted ? 'known' : 'unknown',
    screeningArea: k(p.screeningArea),
    screeningFinding: k(p.screeningFinding),
    referralRequired: k(p.referralRequired),
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

