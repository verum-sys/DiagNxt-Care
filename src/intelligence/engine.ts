/**
 * CareLink Small AI — local, rule-based care-continuity engine.
 *
 * Runs entirely on the device. It never diagnoses or recommends treatment: it only reasons
 * about where a referral is in the care journey, what is missing / unresolved / contradictory,
 * and which single follow-up step would most help keep the patient in care.
 *
 * `analyze` is a pure function so a trained on-device model can replace it behind the same signature.
 */
import type {
  ActionKey,
  CareStateKey,
  FactRow,
  FollowUp,
  Intelligence,
  Issue,
  Patient,
  Referral,
} from '../db/types';
import { daysBetween, isValidISODate, today as todayISO } from './dates';
import { deriveFacts, type EffectiveFacts } from './facts';

const ACTION_WEIGHT: Record<ActionKey, number> = {
  visit_home: 85,
  check_attendance: 80,
  reschedule: 75,
  resolve_conflict: 70,
  find_alternative: 70,
  send_info: 65,
  confirm_referral: 60,
  plan_follow_up: 60,
  complete_details: 55,
  confirm_appointment: 50,
  record_outcome: 45,
  send_referral: 40,
  remind_patient: 30,
  none: 0,
};

const URGENCY_FACTOR = { routine: 1, soon: 1.3, urgent: 1.6 } as const;

/** Actions that require reaching the patient by phone. */
const PHONE_ACTIONS: ActionKey[] = ['confirm_appointment', 'remind_patient', 'check_attendance', 'reschedule'];

/** Threshold above which an open case is shown under "Needs attention". */
export const ATTENTION_THRESHOLD = 50;

function deriveCareState(p: Patient, r: Referral, f: EffectiveFacts, now: string): CareStateKey {
  if (f.outcomeRecorded) return 'closed';
  if (!p.name.trim() || !r.destinationFacility.trim() || !r.reason.trim()) return 'incomplete';
  if (f.followUpRequired) return 'follow_up_required';
  if (f.facilityCompleted || f.attendance?.value === 'attended') return 'attended_outcome_unknown';
  if (f.attendance?.value === 'not_attended') return 'not_attended';
  if (f.response?.value === 'declined') return 'declined';
  if (f.response?.value === 'info_requested') return 'info_requested';
  const workerApptTentative =
    r.worker.appointmentCertainty === 'tentative' && f.appointment?.source === 'worker';
  if (f.appointment && !workerApptTentative) {
    return f.appointment.value < now ? 'appt_passed_unknown' : 'scheduled';
  }
  if (f.response?.value === 'accepted') return 'accepted_no_appt';
  if (!f.sentToFacility) return 'not_sent';
  return 'awaiting_facility';
}

function buildFacts(p: Patient, r: Referral, f: EffectiveFacts, state: CareStateKey, now: string): FactRow[] {
  const rows: FactRow[] = [];
  const text = (key: string, v: string | undefined, missingState: 'missing' | 'unknown' = 'missing'): FactRow =>
    v && v.trim() ? { key, value: v, state: 'known' } : { key, state: missingState };

  rows.push(text('fact.patient', p.name));
  rows.push(text('fact.phone', p.phone));
  rows.push(text('fact.locality', p.locality, 'unknown'));
  rows.push(text('fact.destination', r.destinationFacility));
  rows.push(text('fact.reason', r.reason));
  rows.push({ key: 'fact.referralDate', value: r.referralDate, state: isValidISODate(r.referralDate) ? 'known' : 'missing' });
  rows.push({ key: 'fact.urgency', valueKey: `urgency.${r.urgency}`, state: 'known' });

  rows.push(
    f.sentToFacility
      ? { key: 'fact.delivered', valueKey: 'value.yes', state: 'known' }
      : { key: 'fact.delivered', valueKey: 'value.notYet', state: 'unknown' },
  );

  rows.push(
    f.response
      ? { key: 'fact.facilityResponse', valueKey: `response.${f.response.value}`, state: 'known', source: f.response.source }
      : { key: 'fact.facilityResponse', state: 'unknown' },
  );

  const apptNA = state === 'declined' || (state === 'closed' && !f.appointment);
  rows.push(
    f.appointment
      ? { key: 'fact.appointment', value: f.appointment.value, state: 'known', source: f.appointment.source }
      : { key: 'fact.appointment', state: apptNA ? 'na' : 'unknown' },
  );

  const apptInFuture = f.appointment && f.appointment.value >= now;
  rows.push(
    f.attendance
      ? { key: 'fact.attendance', valueKey: `attendance.${f.attendance.value}`, state: 'known', source: f.attendance.source }
      : { key: 'fact.attendance', state: !f.appointment || apptInFuture || state === 'declined' ? 'na' : 'unknown' },
  );

  rows.push(
    r.patientIntention
      ? { key: 'fact.intention', valueKey: `intention.${r.patientIntention}`, state: 'known', source: 'patient' }
      : { key: 'fact.intention', state: state === 'closed' ? 'na' : 'unknown' },
  );

  const outcomeRelevant = state === 'attended_outcome_unknown' || state === 'follow_up_required' || state === 'closed';
  rows.push(
    f.outcomeRecorded
      ? { key: 'fact.outcome', valueKey: 'value.recorded', state: 'known', source: 'worker' }
      : { key: 'fact.outcome', state: outcomeRelevant ? 'unknown' : 'na' },
  );

  return rows;
}

function findContradictions(p: Patient, r: Referral, f: EffectiveFacts, now: string): Issue[] {
  const out: Issue[] = [];
  if (f.attendance?.value === 'attended' && f.appointment && f.appointment.value > now)
    out.push({ key: 'issue.attendedBeforeAppointment', params: { date: f.appointment.value } });
  if (r.facility.completed && r.facility.attendance === 'unknown')
    out.push({ key: 'issue.completedNoAttendance' });
  if (f.response?.value === 'declined' && f.appointment)
    out.push({ key: 'issue.declinedButScheduled' });
  if (f.attendanceConflict)
    out.push({
      key: 'issue.attendanceConflict',
      params: { worker: `attendance.${f.attendanceConflict.worker}`, facility: `attendance.${f.attendanceConflict.facility}` },
    });
  if (f.responseConflict)
    out.push({
      key: 'issue.responseConflict',
      params: { worker: `response.${f.responseConflict.worker}`, facility: `response.${f.responseConflict.facility}` },
    });
  if (f.appointment && isValidISODate(r.referralDate) && f.appointment.value < r.referralDate)
    out.push({ key: 'issue.appointmentBeforeReferral' });
  if (r.patientIntention === 'will_not_attend' && f.appointment && f.appointment.value >= now)
    out.push({ key: 'issue.intentionConflict' });
  if (isValidISODate(r.referralDate) && r.referralDate > now)
    out.push({ key: 'issue.referralInFuture' });
  if (p.age !== undefined && (p.age < 0 || p.age > 110))
    out.push({ key: 'issue.ageImplausible', params: { age: p.age } });
  return out;
}

function chooseAction(state: CareStateKey, f: EffectiveFacts, contradictions: Issue[], p: Patient, r: Referral, now: string) {
  const daysSinceReferral = isValidISODate(r.referralDate) ? Math.max(0, daysBetween(r.referralDate, now)) : 0;
  const facility = r.destinationFacility || '—';
  let action: ActionKey = 'none';
  let reason: Issue = { key: 'reason.none' };

  if (state === 'closed') return { action, reason };

  if (contradictions.length > 0) {
    return { action: 'resolve_conflict' as ActionKey, reason: { key: 'reason.resolve_conflict', params: { n: contradictions.length } } };
  }

  switch (state) {
    case 'incomplete':
      action = 'complete_details';
      reason = { key: 'reason.complete_details' };
      break;
    case 'not_sent':
      if (daysSinceReferral >= 1) {
        action = 'confirm_referral';
        reason = { key: 'reason.confirm_referral_unsent', params: { days: daysSinceReferral, facility } };
      } else {
        action = 'send_referral';
        reason = { key: 'reason.send_referral', params: { facility } };
      }
      break;
    case 'awaiting_facility':
      action = 'confirm_referral';
      reason =
        f.facilityCheckedDaysAgo === 0
          ? { key: 'reason.confirm_referral_checked', params: { facility } }
          : { key: 'reason.confirm_referral', params: { days: daysSinceReferral, facility } };
      break;
    case 'info_requested':
      action = 'send_info';
      reason = { key: 'reason.send_info', params: { facility } };
      break;
    case 'declined':
      action = 'find_alternative';
      reason = { key: 'reason.find_alternative', params: { facility } };
      break;
    case 'accepted_no_appt':
      action = 'confirm_appointment';
      reason = { key: 'reason.confirm_appointment', params: { facility } };
      break;
    case 'scheduled': {
      const daysTo = daysBetween(now, f.appointment!.value);
      action = 'remind_patient';
      reason =
        r.patientIntention === 'will_attend'
          ? { key: 'reason.remind_patient', params: { days: daysTo } }
          : { key: 'reason.remind_patient_unsure', params: { days: daysTo } };
      break;
    }
    case 'appt_passed_unknown': {
      const overdue = daysBetween(f.appointment!.value, now);
      if (f.unableToReachStreak >= 2 || !p.phone) {
        action = 'visit_home';
        reason = !p.phone
          ? { key: 'reason.visit_home_no_phone', params: { days: overdue } }
          : { key: 'reason.visit_home', params: { n: f.unableToReachStreak } };
      } else {
        action = 'check_attendance';
        reason = { key: 'reason.check_attendance', params: { days: overdue } };
      }
      break;
    }
    case 'not_attended':
      action = 'reschedule';
      reason = { key: 'reason.reschedule' };
      break;
    case 'attended_outcome_unknown':
      action = 'record_outcome';
      reason = { key: f.facilityCompleted ? 'reason.record_outcome_completed' : 'reason.record_outcome' };
      break;
    case 'follow_up_required':
      action = 'plan_follow_up';
      reason = { key: 'reason.plan_follow_up', params: { plan: r.facility.followUpPlan || '—' } };
      break;
  }
  return { action, reason };
}

export function analyze(patient: Patient, referral: Referral, followUps: FollowUp[], now: Date = new Date()): Intelligence {
  const day = todayISO(now);
  const f = deriveFacts(referral, followUps, day);
  const careState = deriveCareState(patient, referral, f, day);
  const facts = buildFacts(patient, referral, f, careState, day);
  const contradictions = careState === 'closed' ? [] : findContradictions(patient, referral, f, day);
  const { action, reason } = chooseAction(careState, f, contradictions, patient, referral, day);

  // Missing: blank fields that matter for the current state.
  const missing: Issue[] = [];
  if (!patient.name.trim()) missing.push({ key: 'issue.missingName' });
  if (!referral.destinationFacility.trim()) missing.push({ key: 'issue.missingDestination' });
  if (!referral.reason.trim()) missing.push({ key: 'issue.missingReason' });
  if (!patient.phone && careState !== 'closed') missing.push({ key: PHONE_ACTIONS.includes(action) ? 'issue.missingPhoneNeeded' : 'issue.missingPhone' });

  // Unresolved: things that are not blank by mistake, but are not yet known for this stage.
  const unresolved: Issue[] = [];
  const daysSince = isValidISODate(referral.referralDate) ? Math.max(0, daysBetween(referral.referralDate, day)) : 0;
  switch (careState) {
    case 'not_sent':
      unresolved.push({ key: 'issue.notDelivered' });
      unresolved.push({ key: 'issue.responseUnknown', params: { days: daysSince } });
      unresolved.push({ key: 'issue.appointmentUnknown' });
      break;
    case 'awaiting_facility':
      unresolved.push({ key: 'issue.responseUnknown', params: { days: daysSince } });
      unresolved.push({ key: 'issue.appointmentUnknown' });
      break;
    case 'info_requested':
      unresolved.push({ key: 'issue.facilityNeedsInfo' });
      break;
    case 'declined':
      unresolved.push({ key: 'issue.noAlternative' });
      break;
    case 'accepted_no_appt':
      unresolved.push({ key: 'issue.appointmentUnknown' });
      break;
    case 'scheduled':
      if (!referral.patientIntention || referral.patientIntention === 'unsure') unresolved.push({ key: 'issue.intentionUnknown' });
      break;
    case 'appt_passed_unknown':
      unresolved.push({ key: 'issue.attendanceUnknown', params: { days: daysBetween(f.appointment!.value, day) } });
      break;
    case 'not_attended':
      unresolved.push({ key: 'issue.noNewAppointment' });
      break;
    case 'attended_outcome_unknown':
      unresolved.push({ key: 'issue.outcomeUnknown' });
      break;
    case 'follow_up_required':
      unresolved.push({ key: 'issue.followUpPending' });
      break;
  }

  let dueInDays: number | undefined;
  if (f.appointment) dueInDays = daysBetween(day, f.appointment.value);
  else if (careState === 'awaiting_facility' || careState === 'not_sent') dueInDays = -daysSince;

  const open = careState !== 'closed';
  let priority = 0;
  if (open && action !== 'none') {
    let base = ACTION_WEIGHT[action];
    if (action === 'remind_patient' && dueInDays !== undefined && dueInDays <= 2) base += 30;
    const overdue = dueInDays !== undefined && dueInDays < 0 ? Math.min(-dueInDays * 5, 40) : 0;
    priority = Math.round(base * URGENCY_FACTOR[referral.urgency] + overdue + contradictions.length * 5 + missing.length * 2);
    // Already checked with the facility today: nothing new to do until tomorrow, so don't shout.
    if (action === 'confirm_referral' && f.facilityCheckedDaysAgo === 0 && contradictions.length === 0) {
      priority = Math.min(priority, ATTENTION_THRESHOLD - 1);
    }
  }

  return { careState, facts, missing, unresolved, contradictions, action, reason, priority, dueInDays, open };
}

/** Follow-up actions that count as "taking" a given suggestion (used to show overrides in the timeline). */
export const ACTION_MATCHES: Record<ActionKey, FollowUp['action'][]> = {
  complete_details: ['details_completed'],
  send_referral: ['referral_sent'],
  confirm_referral: ['facility_contacted'],
  send_info: ['info_sent_to_facility', 'facility_contacted'],
  find_alternative: ['facility_contacted', 'other'],
  confirm_appointment: ['appointment_confirmed', 'facility_contacted'],
  remind_patient: ['contacted_patient', 'appointment_confirmed'],
  check_attendance: ['patient_attended', 'patient_not_attended', 'unable_to_reach'],
  visit_home: ['contacted_patient', 'patient_attended', 'patient_not_attended', 'unable_to_reach'],
  reschedule: ['rescheduled'],
  record_outcome: ['outcome_recorded'],
  plan_follow_up: ['outcome_recorded', 'contacted_patient'],
  resolve_conflict: ['details_completed', 'facility_contacted', 'patient_attended', 'patient_not_attended'],
  none: [],
};

export function isOverride(fu: FollowUp): boolean {
  if (!fu.suggestedAction || fu.suggestedAction === 'none') return false;
  return !ACTION_MATCHES[fu.suggestedAction].includes(fu.action);
}
