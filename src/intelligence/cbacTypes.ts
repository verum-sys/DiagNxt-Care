import type { Sex } from '../db/types';

export interface CbacGeneralInfo {
  date: string;
  ashaName: string;
  mpwAnmName: string;
  villageWard: string;
  subCentre: string;
  phcUphc: string;
  name: string;
  age: number | '';
  sex: Sex | '';
  address: string;
  identifierType: string;
  identifierNumber: string;
  hasStateInsurance: boolean;
  insuranceDetails: string;
  phone: string;
  phoneOwner: 'self' | 'family' | 'other' | '';
  hasDisability: boolean;
  disabilityDetails: string;
}

export interface CbacPartA {
  ageScore?: number; // 0: 0-29, 1: 30-39, 2: 40-49, 3: 50-59, 4: >=60
  smokeScore?: number; // 0: Never, 1: Past/Sometimes, 2: Daily
  alcoholScore?: number; // 0: No, 1: Yes
  waistCm?: number;
  waistScore?: number; // 0, 1, 2
  physicalActivityScore?: number; // 0: >=150 min/wk, 1: <150 min/wk
  familyHistoryScore?: number; // 0: No, 2: Yes
  totalScore: number;
}

export interface CbacPartBItem {
  id: string;
  label: string;
  isTbSuspect?: boolean;
  isTbContact?: boolean;
}

export interface CbacPartB {
  // Map of symptom key -> boolean (true = Yes, false = No)
  symptoms: Record<string, boolean>;
}

export interface CbacPartC {
  cookingFuel: string[]; // 'firewood', 'crop_residue', 'cow_dung_cake', 'coal', 'kerosene', 'lpg'
  occupationalExposure: string[]; // 'crop_burning', 'garbage_burning', 'industrial_smoke'
}

export interface CbacPartD {
  phq1Score?: number; // 0: Not at all, 1: Several days, 2: More than half the days, 3: Nearly every day
  phq2Score?: number; // 0, 1, 2, 3
  totalScore: number; // 0 to 6
}

export interface CbacAssessment {
  id?: string;
  patientId?: string;
  referralId?: string;
  general: CbacGeneralInfo;
  partA: CbacPartA;
  partB: CbacPartB;
  partC: CbacPartC;
  partD: CbacPartD;
  highRiskNcd: boolean; // Part A score > 4
  symptomAlert: boolean; // Any Part B is true
  tbSuspectAlert: boolean; // TB flags present
  tbContactAlert: boolean; // TB family/drug flags present
  mentalHealthAlert: boolean; // Part D score > 3
  completedAt: string;
}

export const CBAC_B1_SYMPTOMS: CbacPartBItem[] = [
  { id: 'shortness_of_breath', label: 'Shortness of breath (difficulty in breathing)' },
  { id: 'cough_two_weeks', label: 'Coughing more than 2 weeks', isTbSuspect: true },
  { id: 'blood_in_sputum', label: 'Blood in sputum', isTbSuspect: true },
  { id: 'fever_two_weeks', label: 'Fever for > 2 weeks', isTbSuspect: true },
  { id: 'weight_loss', label: 'Loss of weight', isTbSuspect: true },
  { id: 'night_sweats', label: 'Night Sweats', isTbSuspect: true },
  { id: 'taking_anti_tb_drugs', label: 'Are you currently taking anti-TB drugs', isTbContact: true },
  { id: 'family_tb', label: 'Anyone in family currently suffering from TB', isTbContact: true },
  { id: 'history_of_tb', label: 'History of TB', isTbSuspect: true },
  { id: 'ulceration_palm_sole', label: 'Recurrent ulceration on palm or sole' },
  { id: 'tingling_palm_sole', label: 'Recurrent tingling on palm(s) or sole(s)' },
  { id: 'cloudy_vision', label: 'Cloudy or blurred vision' },
  { id: 'difficulty_reading', label: 'Difficulty in reading' },
  { id: 'eye_pain_one_week', label: 'Pain in eyes lasting for more than a week' },
  { id: 'eye_redness_one_week', label: 'Redness in eyes lasting for more than a week' },
  { id: 'difficulty_hearing', label: 'Difficulty in hearing' },
  { id: 'history_of_fits', label: 'History of fits' },
  { id: 'difficulty_opening_mouth', label: 'Difficulty in opening mouth' },
  { id: 'mouth_ulcers_unhealed', label: 'Any ulcers in mouth that has not healed in two weeks' },
  { id: 'mouth_growth_unhealed', label: 'Any growth in mouth that has not healed in two weeks' },
  { id: 'mouth_patch_unhealed', label: 'Any white or red patch in mouth that has not healed in two weeks' },
  { id: 'pain_chewing', label: 'Pain while chewing' },
  { id: 'voice_tone_change', label: 'Any change in the tone of your voice' },
  { id: 'hypopigmented_patches', label: 'Any hypopigmented patch(es) or discolored lesion(s) with loss of sensation' },
  { id: 'thickened_skin', label: 'Any thickened skin' },
  { id: 'skin_nodules', label: 'Any nodules on skin' },
  { id: 'numbness_palm_sole', label: 'Recurrent numbness on palm(s) or sole(s)' },
  { id: 'clawing_fingers', label: 'Clawing of fingers in hands and/or feet' },
  { id: 'tingling_hands_feet', label: 'Tingling and numbness in hands and/or feet' },
  { id: 'inability_close_eyelid', label: 'Inability to close eyelid' },
  { id: 'difficulty_holding_objects', label: 'Difficulty in holding objects with hands/fingers' },
  { id: 'feet_weakness_walking', label: 'Weakness in feet that causes difficulty in walking' },
];

export const CBAC_B2_SYMPTOMS: CbacPartBItem[] = [
  { id: 'breast_lump', label: 'Lump in the breast' },
  { id: 'nipple_discharge', label: 'Blood stained discharge from the nipple' },
  { id: 'breast_shape_size_change', label: 'Change in shape and size of breast' },
  { id: 'bleeding_between_periods', label: 'Bleeding between periods' },
  { id: 'bleeding_after_menopause', label: 'Bleeding after menopause' },
  { id: 'bleeding_after_intercourse', label: 'Bleeding after intercourse' },
  { id: 'foul_vaginal_discharge', label: 'Foul smelling vaginal discharge' },
];

export const CBAC_B3_SYMPTOMS: CbacPartBItem[] = [
  { id: 'unsteady_standing_walking', label: 'Feeling unsteady while standing or walking' },
  { id: 'physical_disability_movement', label: 'Suffering from any physical disability that restricts movement' },
  { id: 'needs_help_everyday', label: 'Needing help from others to perform everyday activities (eating, dressing, bathing, walking, toilet)' },
  { id: 'forgetting_names_address', label: 'Forgetting names of your near ones or your own home address' },
];

export const COOKING_FUELS = [
  { id: 'firewood', label: 'Firewood' },
  { id: 'crop_residue', label: 'Crop Residue' },
  { id: 'cow_dung_cake', label: 'Cow dung cake' },
  { id: 'coal', label: 'Coal' },
  { id: 'kerosene', label: 'Kerosene' },
  { id: 'lpg', label: 'LPG' },
];

export const OCCUPATIONAL_EXPOSURES = [
  { id: 'crop_burning', label: 'Crop residue burning' },
  { id: 'garbage_burning', label: 'Burning of garbage / leaves' },
  { id: 'industrial_smoke', label: 'Working in industries with smoke, gas and dust exposure (brick kilns, glass factories, etc.)' },
];

export const PHQ2_OPTIONS = [
  { value: 0, label: 'Not at all', points: 0 },
  { value: 1, label: 'Several days', points: 1 },
  { value: 2, label: 'More than half the days', points: 2 },
  { value: 3, label: 'Nearly every day', points: 3 },
];
