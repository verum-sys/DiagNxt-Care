import type {
  CaseStageKey,
  DraftFieldKey,
  DraftFieldRow,
  FieldDisplayStatus,
  Intention,
  ReferralRequiredAnswer,
  ScreeningArea,
  ScreeningFinding,
  Urgency,
} from '../../db/types';
import type { ParsedCase } from '../parser';
import { deriveCaseStageFromDraft } from './deriveStage';

export interface DraftFormSlice {
  name: string;
  age: string;
  phone: string;
  locality: string;
  reason: string;
  destinationFacility: string;
  referralDate: string;
  urgency: Urgency;
  appointmentDate: string;
  patientIntention: Intention | '';
  facilityResponse?: string;
  screeningCompleted: boolean;
  screeningArea: ScreeningArea | '';
  screeningFinding: ScreeningFinding | '';
  referralRequired: ReferralRequiredAnswer | '';
}

function str(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

export function buildDraftFieldRows(
  text: string,
  parsed: ParsedCase,
  form: DraftFormSlice,
): { stage: CaseStageKey; rows: DraftFieldRow[] } {
  const stage = deriveCaseStageFromDraft({
    text,
    parsed,
    destinationFacility: form.destinationFacility,
    reason: form.reason,
  });

  const name = str(form.name) || parsed.name;
  const reason = str(form.reason) || parsed.reason;
  const dest = str(form.destinationFacility) || parsed.destinationFacility;
  const referralDate = str(form.referralDate) || parsed.referralDate;
  const age = form.age.trim() ? form.age : parsed.age?.toString();
  const phone = str(form.phone) || parsed.phone;
  const locality = str(form.locality) || parsed.locality;
  const intention = form.patientIntention || parsed.patientIntention;
  const appt = str(form.appointmentDate) || parsed.appointmentDate;

  const rows: DraftFieldRow[] = [
    {
      key: 'caseStage',
      labelKey: 'draft.caseStage',
      displayValueKey: `caseStage.${stage}`,
      status: 'known',
    },
    {
      key: 'referralDecision',
      labelKey: 'draft.referralDecision',
      displayValueKey:
        parsed.referralDecision === 'referred' || stage === 'referral_initiated' ? 'draft.referred' : undefined,
      status: parsed.referralDecision === 'referred' || stage === 'referral_initiated' ? 'known' : 'unknown',
    },
    screeningCompletedRow(parsed, form.screeningCompleted),
    screeningAreaRow(parsed, form.screeningArea),
    screeningFindingRow(parsed, form.screeningFinding),
    referralRequiredRow(parsed, form.referralRequired),
    row('name', 'parsed.name', name),
    row('age', 'parsed.age', age, age ? 'known' : 'unknown'),
    row('phone', 'parsed.phone', phone, phone ? 'known' : 'unknown'),
    row('locality', 'parsed.locality', locality, locality ? 'known' : 'unknown'),
    row('reason', 'parsed.reason', reason),
    row('destinationFacility', 'parsed.destinationFacility', dest),
    row('referralDate', 'parsed.referralDate', referralDate),
    urgencyRow(parsed, form.urgency),
    facilityRow(parsed, form.facilityResponse),
    appointmentRow(parsed, appt),
    {
      key: 'attendance',
      labelKey: 'parsed.attendance',
      displayValueKey: 'attendanceStatus.notYetApplicable',
      status: 'not_applicable',
    },
    rowIntention(intention),
  ];

  return { stage, rows };
}

function row(key: DraftFieldKey, labelKey: string, value: string | undefined, status?: FieldDisplayStatus): DraftFieldRow {
  const s = status ?? (value ? 'known' : 'unknown');
  return { key, labelKey, displayValue: value, status: s };
}

function rowIntention(intention: Intention | '' | undefined): DraftFieldRow {
  if (!intention) {
    return { key: 'patientIntention', labelKey: 'parsed.patientIntention', status: 'unknown' };
  }
  return {
    key: 'patientIntention',
    labelKey: 'parsed.patientIntention',
    displayValueKey: `intention.${intention}`,
    status: 'known',
  };
}

function urgencyRow(parsed: ParsedCase, formUrgency: Urgency): DraftFieldRow {
  if (parsed.urgency !== undefined) {
    return {
      key: 'urgency',
      labelKey: 'parsed.urgency',
      displayValueKey: `urgency.${parsed.urgency}`,
      status: 'known',
    };
  }
  return {
    key: 'urgency',
    labelKey: 'parsed.urgency',
    displayValueKey: 'urgency.notAssessed',
    status: 'not_assessed',
  };
}

function facilityRow(parsed: ParsedCase, workerResponse?: string): DraftFieldRow {
  if (parsed.facilityAccepted || workerResponse === 'accepted') {
    return {
      key: 'facilityResponse',
      labelKey: 'parsed.facilityResponse',
      displayValueKey: 'response.accepted',
      status: 'known',
    };
  }
  return {
    key: 'facilityResponse',
    labelKey: 'parsed.facilityResponse',
    displayValueKey: 'facilityStatus.pending',
    status: 'pending',
  };
}

function screeningCompletedRow(parsed: ParsedCase, formDone: boolean): DraftFieldRow {
  const done = formDone || parsed.screeningCompleted;
  return {
    key: 'screeningCompleted',
    labelKey: 'parsed.screeningCompleted',
    displayValueKey: done ? 'screening.completed.yes' : undefined,
    status: done ? 'known' : 'unknown',
  };
}

function screeningAreaRow(parsed: ParsedCase, formArea: ScreeningArea | ''): DraftFieldRow {
  const area = formArea || parsed.screeningArea;
  if (!area) return { key: 'screeningArea', labelKey: 'parsed.screeningArea', status: 'unknown' };
  return {
    key: 'screeningArea',
    labelKey: 'parsed.screeningArea',
    displayValueKey: `screening.area.${area}`,
    status: 'known',
  };
}

function screeningFindingRow(parsed: ParsedCase, formFinding: ScreeningFinding | ''): DraftFieldRow {
  const finding = formFinding || parsed.screeningFinding;
  if (!finding) return { key: 'screeningFinding', labelKey: 'parsed.screeningFinding', status: 'unknown' };
  return {
    key: 'screeningFinding',
    labelKey: 'parsed.screeningFinding',
    displayValueKey: `screening.finding.${finding}`,
    status: 'known',
  };
}

function referralRequiredRow(parsed: ParsedCase, formAnswer: ReferralRequiredAnswer | ''): DraftFieldRow {
  const answer = formAnswer || parsed.referralRequired;
  if (!answer) return { key: 'referralRequired', labelKey: 'parsed.referralRequired', status: 'unknown' };
  return {
    key: 'referralRequired',
    labelKey: 'parsed.referralRequired',
    displayValueKey: `referralRequired.${answer}`,
    status: 'known',
  };
}

function appointmentRow(parsed: ParsedCase, appt: string | undefined): DraftFieldRow {
  if (appt) {
    return {
      key: 'appointmentDate',
      labelKey: 'parsed.appointmentDate',
      displayValue: appt,
      status: parsed.appointmentTentative ? 'tentative' : 'known',
    };
  }
  return {
    key: 'appointmentDate',
    labelKey: 'parsed.appointmentDate',
    displayValueKey: 'appointmentStatus.notScheduled',
    status: 'pending',
  };
}
