/**
 * Case stage (briefing workflow). Maps to CareStateKey internally for a future UI merge:
 *
 * | CaseStageKey           | Typical CareStateKey                          |
 * |------------------------|-----------------------------------------------|
 * | referral_initiated     | not_sent, awaiting_facility, incomplete       |
 * | referral_accepted      | accepted_no_appt, info_requested (partial)    |
 * | appointment_scheduled  | scheduled                                     |
 * | follow_up_due          | appt_passed_unknown, not_attended             |
 * | completed              | closed, attended_outcome_unknown (partial)    |
 */
import type { CaseStageKey, DraftFieldKey, Patient, Referral, StageExpectations } from '../../db/types';
import type { EffectiveFacts } from '../facts';
import type { ParsedCase } from '../parser';

const REFER_RE = /\b(?:referred|refer(?:ral|red| kiya| kiya hai| kar)|रेफर)\b/i;

export function hasReferLanguage(text: string): boolean {
  return REFER_RE.test(text);
}

export interface DraftStageInput {
  text: string;
  parsed: ParsedCase;
  destinationFacility?: string;
  reason?: string;
}

export function deriveCaseStageFromDraft(input: DraftStageInput): CaseStageKey {
  const dest = (input.destinationFacility || input.parsed.destinationFacility || '').trim();
  const reason = (input.reason || input.parsed.reason || '').trim();
  const referred = input.parsed.referralDecision === 'referred' || hasReferLanguage(input.text);

  if (referred && dest) return 'referral_initiated';
  if (dest && reason) return 'referral_initiated';
  if (!dest && !referred) return 'initial_assessment';
  return 'referral_initiated';
}

export function deriveCaseStageSaved(
  _patient: Patient,
  referral: Referral,
  facts: EffectiveFacts,
  now: string,
): CaseStageKey {
  if (facts.outcomeRecorded || referral.facility.completed) return 'completed';

  const appt = facts.appointment?.value;
  const att = facts.attendance?.value;

  if (att === 'attended' && facts.outcomeRecorded) return 'completed';
  if (appt && appt < now && !att) return 'follow_up_due';
  if (att === 'not_attended') return 'follow_up_due';

  if (appt) return 'appointment_scheduled';

  const resp = facts.response?.value;
  if (resp === 'accepted') return 'referral_accepted';

  return 'referral_initiated';
}

export function getStageExpectations(stage: CaseStageKey): StageExpectations {
  switch (stage) {
    case 'referral_initiated':
      return {
        complete: ['name', 'reason', 'destinationFacility', 'referralDate', 'patientIntention', 'referralDecision'],
        pending: ['facilityResponse', 'appointmentDate'],
        notApplicable: ['attendance'],
      };
    case 'referral_accepted':
      return {
        complete: ['name', 'reason', 'destinationFacility', 'referralDate', 'facilityResponse'],
        pending: ['appointmentDate'],
        notApplicable: ['attendance'],
      };
    case 'appointment_scheduled':
      return {
        complete: ['name', 'destinationFacility', 'appointmentDate', 'facilityResponse'],
        pending: ['attendance'],
        notApplicable: [],
      };
    case 'follow_up_due':
      return {
        complete: ['name', 'appointmentDate'],
        pending: ['attendance'],
        notApplicable: [],
      };
    case 'completed':
      return {
        complete: ['name', 'attendance'],
        pending: [],
        notApplicable: [],
      };
    default:
      return { complete: ['name'], pending: [], notApplicable: [] };
  }
}

/** Checklist i18n keys for each draft field in stage expectations. */
export const CHECKLIST_LABEL: Record<DraftFieldKey, string> = {
  caseStage: 'checklist.caseStage',
  referralDecision: 'checklist.referralDecision',
  screeningCompleted: 'checklist.screeningCompleted',
  screeningArea: 'checklist.screeningArea',
  screeningFinding: 'checklist.screeningFinding',
  referralRequired: 'checklist.referralRequired',
  name: 'checklist.patientIdentified',
  age: 'checklist.age',
  phone: 'checklist.phone',
  locality: 'checklist.locality',
  reason: 'checklist.referralReason',
  destinationFacility: 'checklist.destination',
  referralDate: 'checklist.referralDate',
  urgency: 'checklist.urgency',
  facilityResponse: 'checklist.facilityAcceptance',
  appointmentDate: 'checklist.appointment',
  attendance: 'checklist.attendance',
  patientIntention: 'checklist.patientIntention',
};

export function isChecklistItemComplete(key: DraftFieldKey, rowStatus: import('../../db/types').FieldDisplayStatus): boolean {
  if (key === 'facilityResponse' || key === 'appointmentDate') {
    return rowStatus === 'known' || rowStatus === 'tentative';
  }
  if (key === 'attendance') return rowStatus === 'completed' || rowStatus === 'known';
  return rowStatus === 'known' || rowStatus === 'tentative';
}
