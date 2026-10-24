import type { Sex, ScreeningArea, ScreeningFinding, ReferralRequiredAnswer, Intention, Urgency } from '../db/types';
import { parseFreeTextWithSpans } from './parser';
import {
  CBAC_B1_SYMPTOMS,
  CBAC_B2_SYMPTOMS,
  CBAC_B3_SYMPTOMS,
  type CbacAssessment,
  type CbacGeneralInfo,
  type CbacPartA,
  type CbacPartB,
  type CbacPartC,
  type CbacPartD,
} from './cbacTypes';

/**
 * Classifies age into Part A Question 1 score bracket (0 - 4).
 * 0: 0 - 29 years
 * 1: 30 - 39 years
 * 2: 40 - 49 years
 * 3: 50 - 59 years
 * 4: >= 60 years
 */
export function classifyAge(age: number): number {
  if (age <= 29) return 0;
  if (age <= 39) return 1;
  if (age <= 49) return 2;
  if (age <= 59) return 3;
  return 4;
}

/**
 * Classifies waist in cm into Part A Question 4 score bracket (0 - 2).
 * Female: <=80cm (0), 81-90cm (1), >90cm (2)
 * Male/Other: <=90cm (0), 91-100cm (1), >100cm (2)
 */
export function classifyWaist(waistCm: number, sex: Sex | ''): number {
  if (sex === 'F') {
    if (waistCm <= 80) return 0;
    if (waistCm <= 90) return 1;
    return 2;
  }
  // Default to Male thresholds
  if (waistCm <= 90) return 0;
  if (waistCm <= 100) return 1;
  return 2;
}

export function calculatePartAScore(partA: Partial<CbacPartA>): number {
  const q1 = partA.ageScore ?? 0;
  const q2 = partA.smokeScore ?? 0;
  const q3 = partA.alcoholScore ?? 0;
  const q4 = partA.waistScore ?? 0;
  const q5 = partA.physicalActivityScore ?? 0;
  const q6 = partA.familyHistoryScore ?? 0;
  return q1 + q2 + q3 + q4 + q5 + q6;
}

export function calculatePartDScore(partD: Partial<CbacPartD>): number {
  const p1 = partD.phq1Score ?? 0;
  const p2 = partD.phq2Score ?? 0;
  return p1 + p2;
}

const TB_SUSPECT_KEYS = new Set([
  'cough_two_weeks',
  'blood_in_sputum',
  'fever_two_weeks',
  'weight_loss',
  'night_sweats',
  'history_of_tb',
]);

const TB_CONTACT_KEYS = new Set(['taking_anti_tb_drugs', 'family_tb']);

export function evaluateCbacTriage(
  partA: CbacPartA,
  partB: CbacPartB,
  partC: CbacPartC,
  partD: CbacPartD,
): {
  highRiskNcd: boolean;
  symptomAlert: boolean;
  tbSuspectAlert: boolean;
  tbContactAlert: boolean;
  mentalHealthAlert: boolean;
  copdHighRisk: boolean;
  referralRequired: boolean;
  urgency: 'routine' | 'soon' | 'urgent';
  reasons: string[];
} {
  const highRiskNcd = partA.totalScore > 4;
  const symptomKeys = Object.entries(partB.symptoms)
    .filter(([_, val]) => val === true)
    .map(([k]) => k);

  const symptomAlert = symptomKeys.length > 0;
  const tbSuspectAlert = symptomKeys.some((k) => TB_SUSPECT_KEYS.has(k));
  const tbContactAlert = symptomKeys.some((k) => TB_CONTACT_KEYS.has(k));
  const mentalHealthAlert = partD.totalScore > 3;
  const copdHighRisk =
    partC.cookingFuel.some((f) => ['firewood', 'crop_residue', 'cow_dung_cake', 'coal', 'kerosene'].includes(f)) ||
    partC.occupationalExposure.length > 0;

  const reasons: string[] = [];
  if (tbSuspectAlert) reasons.push('TB Suspect symptoms present: Sputum collection needed');
  if (tbContactAlert) reasons.push('TB Contact tracing needed by ANM/MPW');
  if (highRiskNcd) reasons.push(`High NCD Risk (CBAC Part A Score: ${partA.totalScore}/12 > 4)`);
  if (mentalHealthAlert) reasons.push(`PHQ-2 Score ${partD.totalScore}/6 > 3: Refer to CHO/MO for mental health`);
  if (symptomAlert && !tbSuspectAlert && !tbContactAlert) reasons.push('Early detection symptoms require Medical Officer exam');
  if (copdHighRisk) reasons.push('COPD risk factors: biomass fuel / occupational smoke exposure');

  const referralRequired = tbSuspectAlert || symptomAlert || highRiskNcd || mentalHealthAlert;
  let urgency: 'routine' | 'soon' | 'urgent' = 'routine';
  if (tbSuspectAlert || mentalHealthAlert || partA.totalScore >= 7) {
    urgency = 'urgent';
  } else if (highRiskNcd || symptomAlert) {
    urgency = 'soon';
  }

  return {
    highRiskNcd,
    symptomAlert,
    tbSuspectAlert,
    tbContactAlert,
    mentalHealthAlert,
    copdHighRisk,
    referralRequired,
    urgency,
    reasons,
  };
}

export interface SmartParseExplanation {
  field: string;
  detail: string;
}

export interface SmartParseResult {
  generalUpdates: Partial<CbacGeneralInfo>;
  partAUpdates: Partial<CbacPartA>;
  partBUpdates: Record<string, boolean>;
  partCUpdates: Partial<CbacPartC>;
  partDUpdates: Partial<CbacPartD>;
  referralUpdates?: {
    destinationFacility?: string;
    urgency?: Urgency;
    patientIntention?: Intention;
    reason?: string;
    notes?: string;
    phone?: string;
    locality?: string;
    appointmentDate?: string;
    screeningArea?: ScreeningArea;
    screeningFinding?: ScreeningFinding;
    referralRequired?: ReferralRequiredAnswer;
    facilityAccepted?: boolean;
  };
  explanations: SmartParseExplanation[];
}

/**
 * Smart natural language parser for spoken notes or dictation in CBAC context.
 * Proactively extracts demographics, computes scores, and adapts based on gender/age.
 */
export function parseCbacText(rawText: string, currentSex?: Sex | ''): SmartParseResult {
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const explanations: SmartParseExplanation[] = [];
  const generalUpdates: Partial<CbacGeneralInfo> = {};
  const partAUpdates: Partial<CbacPartA> = {};
  const partBUpdates: Record<string, boolean> = {};
  const partCUpdates: Partial<CbacPartC> = { cookingFuel: [], occupationalExposure: [] };
  const partDUpdates: Partial<CbacPartD> = {};

  // First run universal multi-lingual free-text case parser for rich coverage
  const freeParsed = parseFreeTextWithSpans(text);
  const fc = freeParsed.case;

  if (fc.phone) {
    generalUpdates.phone = fc.phone;
    explanations.push({ field: 'phone', detail: `Phone: ${fc.phone}` });
  }
  if (fc.locality) {
    generalUpdates.address = fc.locality;
    explanations.push({ field: 'locality', detail: `Locality: ${fc.locality}` });
  }

  // 1. Detect Sex
  let detectedSex: Sex | undefined = fc.sex;
  if (!detectedSex) {
    if (/\b(female|woman|girl|mrs|smt|devi|aurat|mahila|she|her)\b/i.test(text)) {
      detectedSex = 'F';
    } else if (/\b(male|man|boy|mr|shri|purush|admi|he|his|him)\b/i.test(text)) {
      detectedSex = 'M';
    }
  }
  if (detectedSex) {
    generalUpdates.sex = detectedSex;
    explanations.push({ field: 'sex', detail: detectedSex === 'F' ? 'Identified as Female (F)' : 'Identified as Male (M)' });
  }

  const effectiveSex: Sex | '' = detectedSex ?? currentSex ?? '';

  // 2. Detect Name
  if (fc.name) {
    generalUpdates.name = fc.name;
    explanations.push({ field: 'name', detail: `Name detected: "${fc.name}"` });
  } else {
    const nameMatch =
      text.match(/\b(?:my\s+name\s+is|name\s+is|patient\s+name\s+is|patient\s+is|named|naam|registering)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i) ||
      text.match(/^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*,\s*(?:age|\d|female|male|f\b|m\b)/i) ||
      text.match(/^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+is\s+\d/i);
    if (nameMatch) {
      const rawName = nameMatch[1].trim();
      if (!/^(she|he|patient|female|male|i|my|we|they)$/i.test(rawName)) {
        const formatted = rawName.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        generalUpdates.name = formatted;
        explanations.push({ field: 'name', detail: `Name detected: "${formatted}"` });
      }
    }
  }

  // 3. Detect Age & Auto-Click Part A Question 1 Bar
  const ageMatch =
    (fc.age ? [String(fc.age), String(fc.age)] : null) ||
    lower.match(/\b(?:age(?:d|\s+is)?)\s*(\d{1,3})\b/) ||
    lower.match(/\b(\d{1,3})\s*(?:years?(?:\s+old)?|yrs?|yo|saal|sal)\b/) ||
    lower.match(/\b(\d{1,3})\s*,\s*(?:female|male|f|m)\b/) ||
    lower.match(/^(\d{1,3})$/) ||
    lower.match(/\b(?:i am|i'm|age|meri umar|umar|saal|sal)\s*[:=]?\s*(\d{1,3})\b/) ||
    text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*,\s*(\d{1,3})\b/);

  let detectedAge: number | undefined = fc.age;
  if (ageMatch) {
    const ageVal = Number(ageMatch[1] || ageMatch[2]);
    if (!isNaN(ageVal) && ageVal >= 0 && ageVal <= 120) {
      detectedAge = ageVal;
      generalUpdates.age = ageVal;
      const score = classifyAge(ageVal);
      partAUpdates.ageScore = score;
      const label =
        score === 0
          ? '0 - 29 years (0 pts)'
          : score === 1
            ? '30 - 39 years (1 pt)'
            : score === 2
              ? '40 - 49 years (2 pts)'
              : score === 3
                ? '50 - 59 years (3 pts)'
                : '>= 60 years (4 pts)';
      explanations.push({
        field: 'age',
        detail: `Age ${ageVal} entered → Smartly clicked "${label}" bar`,
      });
    }
  }

  // 4. Detect Waist Circumference & Auto-Click Waist Bar (Adapted to Sex)
  const waistMatch =
    lower.match(/\b(?:waist(?:line)?|kamar)\s*(?:is|of|measure(?:ment)?|around)?\s*(\d{2,3})\s*(?:cm|cms)?\b/) ||
    lower.match(/\b(\d{2,3})\s*(?:cm|cms)\s*(?:waist|kamar)\b/);

  if (waistMatch) {
    const waistNum = Number(waistMatch[1]);
    if (!isNaN(waistNum) && waistNum >= 40 && waistNum <= 200) {
      partAUpdates.waistCm = waistNum;
      const score = classifyWaist(waistNum, effectiveSex);
      partAUpdates.waistScore = score;
      const sexTag = effectiveSex === 'F' ? 'Female' : 'Male';
      const label =
        effectiveSex === 'F'
          ? score === 0
            ? '80 cm or less (0 pts)'
            : score === 1
              ? '81 - 90 cm (1 pt)'
              : 'More than 90 cm (2 pts)'
          : score === 0
            ? '90 cm or less (0 pts)'
            : score === 1
              ? '91 - 100 cm (1 pt)'
              : 'More than 100 cm (2 pts)';
      explanations.push({
        field: 'waist',
        detail: `Waist ${waistNum} cm (${sexTag}) → Auto-clicked "${label}" bar`,
      });
    }
  }

  // 5. Detect Smoking / Smokeless Tobacco (Part A Question 2)
  if (/\b(never\s+smokes?|non[-\s]?smoker|no\s+gutka|no\s+tobacco|doesn't\s+smoke|does\s+not\s+smoke|bidi\s+nahi|tumbaku\s+nahi)\b/i.test(text)) {
    partAUpdates.smokeScore = 0;
    explanations.push({ field: 'smoke', detail: 'Tobacco: Never (0 pts)' });
  } else if (/\b(daily\s+smokes?|smokes?\s+daily|eats\s+gutka|chews\s+gutka|chews\s+khaini|daily\s+khaini|chain\s+smoker|har\s+din\s+bidi)\b/i.test(text)) {
    partAUpdates.smokeScore = 2;
    explanations.push({ field: 'smoke', detail: 'Tobacco: Daily (2 pts)' });
  } else if (/\b(used\s+to\s+smoke|quit\s+smoking|sometimes\s+smokes?|occasionally|kabhi\s+kabhi)\b/i.test(text)) {
    partAUpdates.smokeScore = 1;
    explanations.push({ field: 'smoke', detail: 'Tobacco: Past / Sometimes (1 pt)' });
  }

  // 6. Detect Alcohol (Part A Question 3)
  if (/\b(no\s+alcohol|doesn't\s+drink|never\s+drinks|sharab\s+nahi|no\s+liquor)\b/i.test(text)) {
    partAUpdates.alcoholScore = 0;
    explanations.push({ field: 'alcohol', detail: 'Alcohol: No (0 pts)' });
  } else if (/\b(alcohol\s+daily|drinks\s+daily|daily\s+alcohol|regular\s+drinker|har\s+din\s+sharab)\b/i.test(text)) {
    partAUpdates.alcoholScore = 1;
    explanations.push({ field: 'alcohol', detail: 'Alcohol: Daily (1 pt)' });
  }

  // 7. Detect Physical Activity (Part A Question 5)
  if (
    /\b(active|walks\s+daily|farming|150\s+min|walks\s+\d+\s+min|exercise|running|hard\s+labor|khet\s+ka\s+kaam)\b/i.test(text) &&
    !/\b(less\s+than\s+150|no\s+exercise|sedentary)\b/i.test(text)
  ) {
    partAUpdates.physicalActivityScore = 0;
    explanations.push({ field: 'physicalActivity', detail: 'Physical activity: At least 150 min/wk (0 pts)' });
  } else if (/\b(sedentary|no\s+exercise|less\s+than\s+150|kam\s+kaam|inactive)\b/i.test(text)) {
    partAUpdates.physicalActivityScore = 1;
    explanations.push({ field: 'physicalActivity', detail: 'Physical activity: Less than 150 min/wk (1 pt)' });
  }

  // 8. Detect Family History (Part A Question 6)
  if (/\b(no\s+family\s+history|no\s+history\s+of\s+bp|no\s+diabetes\s+in\s+family)\b/i.test(text)) {
    partAUpdates.familyHistoryScore = 0;
    explanations.push({ field: 'familyHistory', detail: 'Family history: No (0 pts)' });
  } else if (
    /\b(family\s+history|mother\s+has\s+diabetes|father\s+has\s+bp|parents\s+have\s+heart|sibling\s+has\s+sugar|family\s+sugar|family\s+bp)\b/i.test(
      text,
    )
  ) {
    partAUpdates.familyHistoryScore = 2;
    explanations.push({ field: 'familyHistory', detail: 'Family history: Yes (2 pts)' });
  }

  // 9. Detect Part B Symptoms
  // Cough > 2 wks (TB)
  if (/\b(cough(?:ing)?\s*(?:for\s*)?(?:>|more\s+than|over)?\s*(?:2|two|3|three)\s*weeks?|khansi\s+do\s+hafte|purani\s+khansi)\b/i.test(text)) {
    partBUpdates.cough_two_weeks = true;
    explanations.push({ field: 'partB', detail: 'Part B: Cough > 2 weeks (TB Alert)' });
  }
  // Blood in sputum
  if (/\b(blood\s+in\s+sputum|coughing\s+blood|balgam\s+mein\s+khoon|hemoptysis)\b/i.test(text)) {
    partBUpdates.blood_in_sputum = true;
    explanations.push({ field: 'partB', detail: 'Part B: Blood in sputum (TB Alert)' });
  }
  // Fever > 2 wks
  if (/\b(fever\s*(?:for\s*)?(?:>|more\s+than)?\s*(?:2|two)\s*weeks?|bukhar\s+do\s+hafte)\b/i.test(text)) {
    partBUpdates.fever_two_weeks = true;
    explanations.push({ field: 'partB', detail: 'Part B: Fever > 2 weeks (TB Alert)' });
  }
  // Weight loss
  if (/\b(weight\s+loss|losing\s+weight|vajan\s+kam)\b/i.test(text)) {
    partBUpdates.weight_loss = true;
    explanations.push({ field: 'partB', detail: 'Part B: Loss of weight (TB Alert)' });
  }
  // Night sweats
  if (/\b(night\s+sweats|raat\s+ko\s+pasina)\b/i.test(text)) {
    partBUpdates.night_sweats = true;
    explanations.push({ field: 'partB', detail: 'Part B: Night sweats (TB Alert)' });
  }
  // Shortness of breath
  if (/\b(shortness\s+of\s+breath|breathless|saans\s+phulna|difficulty\s+breathing)\b/i.test(text)) {
    partBUpdates.shortness_of_breath = true;
    explanations.push({ field: 'partB', detail: 'Part B: Shortness of breath' });
  }
  // Cloudy vision
  if (/\b(cloudy\s+vision|blurred\s+vision|dhundla\s+dikhna)\b/i.test(text)) {
    partBUpdates.cloudy_vision = true;
    explanations.push({ field: 'partB', detail: 'Part B: Cloudy/blurred vision' });
  }
  // Mouth ulcer
  if (/\b(mouth\s+ulcer|chhale|unhealed\s+ulcer)\b/i.test(text)) {
    partBUpdates.mouth_ulcers_unhealed = true;
    explanations.push({ field: 'partB', detail: 'Part B: Mouth ulcer unhealed' });
  }

  // Women only symptoms (B2)
  if (effectiveSex === 'F') {
    if (/\b(lump\s+in\s+breast|breast\s+lump|gantth)\b/i.test(text)) {
      partBUpdates.breast_lump = true;
      explanations.push({ field: 'partB', detail: 'Part B2 (Female): Lump in breast' });
    }
    if (/\b(bleeding\s+between\s+periods|bleeding\s+after\s+menopause)\b/i.test(text)) {
      partBUpdates.bleeding_after_menopause = true;
      explanations.push({ field: 'partB', detail: 'Part B2 (Female): Post-menopause/irregular bleeding' });
    }
  }

  // Elderly symptoms (B3)
  if (detectedAge && detectedAge >= 60) {
    if (/\b(unsteady|chakkar|girti\s+hai|ladkhadana|difficulty\s+walking)\b/i.test(text)) {
      partBUpdates.unsteady_standing_walking = true;
      explanations.push({ field: 'partB', detail: 'Part B3 (Elderly): Unsteady standing/walking' });
    }
    if (/\b(forgetting|bhoolna|memory\s+loss)\b/i.test(text)) {
      partBUpdates.forgetting_names_address = true;
      explanations.push({ field: 'partB', detail: 'Part B3 (Elderly): Forgetting names/address' });
    }
  }

  // 10. Detect Cooking Fuel (Part C)
  const fuels: string[] = [];
  if (/\b(firewood|lakdi|chulha|wood\s+stove)\b/i.test(text)) fuels.push('firewood');
  if (/\b(crop\s+residue|parali)\b/i.test(text)) fuels.push('crop_residue');
  if (/\b(cow\s+dung|dung\s+cake|upla|gobar)\b/i.test(text)) fuels.push('cow_dung_cake');
  if (/\b(coal|koyla)\b/i.test(text)) fuels.push('coal');
  if (/\b(kerosene|mitti\s+ka\s+tel)\b/i.test(text)) fuels.push('kerosene');
  if (/\b(lpg|gas\s+cylinder|gas\s+stove)\b/i.test(text)) fuels.push('lpg');
  if (fuels.length > 0) {
    partCUpdates.cookingFuel = fuels;
    explanations.push({ field: 'partC', detail: `Cooking fuel: ${fuels.join(', ')}` });
  }

  // Detect Occupational Exposure (Part C)
  const exposures: string[] = [];
  if (/\b(brick\s+kiln|eent\s+bhatta|glass\s+factory|smoke\s+exposure|dust\s+exposure)\b/i.test(text)) {
    exposures.push('industrial_smoke');
  }
  if (/\b(burning\s+garbage|garbage\s+burning|leaves\s+burning|kachra\s+jalana)\b/i.test(text)) {
    exposures.push('garbage_burning');
  }
  if (/\b(burning\s+crops|crop\s+burning|parali\s+jalana)\b/i.test(text)) {
    exposures.push('crop_burning');
  }
  if (exposures.length > 0) {
    partCUpdates.occupationalExposure = exposures;
    explanations.push({ field: 'partC', detail: `Occupational exposure: ${exposures.join(', ')}` });
  }

  // 11. Detect Part D PHQ-2
  if (/\b(no\s+interest|little\s+interest|loss\s+of\s+pleasure|mann\s+nahi\s+lagta)\b/i.test(text)) {
    partDUpdates.phq1Score = 2; // More than half days
    explanations.push({ field: 'partD', detail: 'Part D: Little interest or pleasure detected' });
  }
  if (/\b(depressed|feeling\s+down|hopeless|sad|nirash|dukhi)\b/i.test(text)) {
    if (/\b(nearly\s+every\s+day|always|roj|har\s+din)\b/i.test(text)) {
      partDUpdates.phq2Score = 3;
    } else {
      partDUpdates.phq2Score = 2;
    }
    explanations.push({ field: 'partD', detail: 'Part D: Feeling down/hopeless detected' });
  }

  // 12. Detect Referral fields (Facility, Urgency, Intention, Screening, Dates, etc.)
  const referralUpdates: {
    destinationFacility?: string;
    urgency?: Urgency;
    patientIntention?: Intention;
    reason?: string;
    notes?: string;
    phone?: string;
    locality?: string;
    appointmentDate?: string;
    screeningArea?: ScreeningArea;
    screeningFinding?: ScreeningFinding;
    referralRequired?: ReferralRequiredAnswer;
    facilityAccepted?: boolean;
  } = {};

  if (fc.destinationFacility) {
    referralUpdates.destinationFacility = fc.destinationFacility;
    explanations.push({ field: 'facility', detail: `Facility: ${fc.destinationFacility}` });
  } else if (/\b(?:CHC Bero|Bero CHC|Bero hospital)\b/i.test(text)) {
    referralUpdates.destinationFacility = 'CHC Bero';
    explanations.push({ field: 'facility', detail: 'Facility: CHC Bero' });
  } else if (/\b(?:PHC Itki|Itki PHC)\b/i.test(text)) {
    referralUpdates.destinationFacility = 'PHC Itki';
    explanations.push({ field: 'facility', detail: 'Facility: PHC Itki' });
  } else if (/\b(?:Sadar(?:\s+District)?\s+Hospital|Sadar)\b/i.test(text)) {
    referralUpdates.destinationFacility = 'Sadar District Hospital';
    explanations.push({ field: 'facility', detail: 'Facility: Sadar District Hospital' });
  } else if (/\b(?:District Hospital|DH)\b/i.test(text)) {
    referralUpdates.destinationFacility = 'District Hospital';
    explanations.push({ field: 'facility', detail: 'Facility: District Hospital' });
  }

  if (fc.urgency) {
    referralUpdates.urgency = fc.urgency;
    explanations.push({ field: 'urgency', detail: `Urgency: ${fc.urgency}` });
  } else if (/\b(urgent|urgently|emergency|turant|jaldi)\b/i.test(text)) {
    referralUpdates.urgency = 'urgent';
    explanations.push({ field: 'urgency', detail: 'Urgency: Urgent' });
  } else if (/\b(soon|in\s+a\s+few\s+days|do\s+din\s+mein)\b/i.test(text)) {
    referralUpdates.urgency = 'soon';
    explanations.push({ field: 'urgency', detail: 'Urgency: Soon' });
  }

  if (fc.patientIntention) {
    referralUpdates.patientIntention = fc.patientIntention;
    explanations.push({ field: 'intention', detail: `Intention: ${fc.patientIntention}` });
  } else if (/\b(will\s+attend|plans\s+to\s+go|jayegi|jayega|agreed|pakka\s+jayenge)\b/i.test(text)) {
    referralUpdates.patientIntention = 'will_attend';
    explanations.push({ field: 'intention', detail: 'Intention: Will attend' });
  } else if (/\b(unsure|hesitant|pata\s+nahi|shayad)\b/i.test(text)) {
    referralUpdates.patientIntention = 'unsure';
    explanations.push({ field: 'intention', detail: 'Intention: Unsure' });
  } else if (/\b(will\s+not\s+attend|refused|mana\s+kiya|nahi\s+jayegi|nahi\s+jayega)\b/i.test(text)) {
    referralUpdates.patientIntention = 'will_not_attend';
    explanations.push({ field: 'intention', detail: 'Intention: Will not attend' });
  }

  if (fc.reason) {
    referralUpdates.reason = fc.reason;
    explanations.push({ field: 'reason', detail: `Reason: "${fc.reason}"` });
  }
  if (fc.appointmentDate) {
    referralUpdates.appointmentDate = fc.appointmentDate;
    explanations.push({ field: 'appointment', detail: `Appointment: ${fc.appointmentDate}` });
  }
  if (fc.screeningArea) {
    referralUpdates.screeningArea = fc.screeningArea;
    explanations.push({ field: 'screeningArea', detail: `Screening Area: ${fc.screeningArea}` });
  }
  if (fc.screeningFinding) {
    referralUpdates.screeningFinding = fc.screeningFinding;
    explanations.push({ field: 'screeningFinding', detail: `Screening Finding: ${fc.screeningFinding}` });
  }
  if (fc.referralRequired) {
    referralUpdates.referralRequired = fc.referralRequired;
  }
  if (fc.facilityAccepted) {
    referralUpdates.facilityAccepted = true;
    explanations.push({ field: 'facilityResponse', detail: 'Facility Response: Accepted' });
  }

  return {
    generalUpdates,
    partAUpdates,
    partBUpdates,
    partCUpdates,
    partDUpdates,
    referralUpdates: Object.keys(referralUpdates).length > 0 ? referralUpdates : undefined,
    explanations,
  };
}
