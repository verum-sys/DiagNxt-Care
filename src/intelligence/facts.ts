import type { Attendance, FacilityResponse, FactSource, FollowUp, Referral } from '../db/types';
import { daysBetween, toISODate } from './dates';

/**
 * Effective facts for a referral, merging what the facility confirmed with what the
 * worker learned in the field. Each fact keeps its provenance so the UI can show
 * "confirmed by facility" vs "reported by worker" vs unknown.
 */
export interface EffectiveFacts {
  sentToFacility: boolean; // the referral record has reached the facility (synced at least once)
  response?: { value: FacilityResponse; source: FactSource };
  appointment?: { value: string; source: FactSource };
  attendance?: { value: Exclude<Attendance, 'unknown'>; source: FactSource };
  /** Worker and facility disagree on attendance for the same appointment. */
  attendanceConflict?: { worker: Attendance; facility: Attendance };
  /** Worker and facility disagree on whether the facility accepted. */
  responseConflict?: { worker: FacilityResponse; facility: FacilityResponse };
  facilityCompleted: boolean;
  followUpRequired: boolean;
  outcomeRecorded: boolean;
  unableToReachStreak: number;
  /** Days since the worker last contacted the facility about this referral (0 = today). */
  facilityCheckedDaysAgo?: number;
}

export function deriveFacts(referral: Referral, followUps: FollowUp[], now: string): EffectiveFacts {
  const w = referral.worker;
  const f = referral.facility;

  let response: EffectiveFacts['response'];
  if (f.response !== 'none') response = { value: f.response, source: 'facility' };
  else if (w.facilityResponse && w.facilityResponse !== 'none') response = { value: w.facilityResponse, source: 'worker' };

  let responseConflict: EffectiveFacts['responseConflict'];
  if (
    f.response !== 'none' &&
    w.facilityResponse &&
    w.facilityResponse !== 'none' &&
    ((f.response === 'declined' && w.facilityResponse === 'accepted') ||
      (f.response === 'accepted' && w.facilityResponse === 'declined'))
  ) {
    responseConflict = { worker: w.facilityResponse, facility: f.response };
  }

  // The later of the two known dates wins: a later worker date means the patient was rescheduled
  // in the field; a later facility date means the facility moved it.
  let appointment: EffectiveFacts['appointment'];
  if (f.appointmentDate && w.appointmentDate) {
    appointment =
      w.appointmentDate > f.appointmentDate
        ? { value: w.appointmentDate, source: 'worker' }
        : { value: f.appointmentDate, source: 'facility' };
  } else if (f.appointmentDate) appointment = { value: f.appointmentDate, source: 'facility' };
  else if (w.appointmentDate) appointment = { value: w.appointmentDate, source: 'worker' };

  // Facility attendance belongs to the facility's appointment; if the patient was rescheduled
  // later in the field, that older facility attendance no longer describes the current appointment.
  const facilityAttendanceCurrent =
    f.attendance !== 'unknown' && !(appointment?.source === 'worker' && f.appointmentDate && appointment.value > f.appointmentDate);
  const workerAttendance = w.attendance && w.attendance !== 'unknown' ? w.attendance : undefined;

  let attendance: EffectiveFacts['attendance'];
  let attendanceConflict: EffectiveFacts['attendanceConflict'];
  if (facilityAttendanceCurrent && f.attendance !== 'unknown') {
    attendance = { value: f.attendance, source: 'facility' };
    if (workerAttendance && workerAttendance !== f.attendance) {
      attendanceConflict = { worker: workerAttendance, facility: f.attendance };
    }
  } else if (workerAttendance) {
    attendance = { value: workerAttendance, source: 'worker' };
  }

  // Consecutive "unable to reach" attempts since the last successful contact.
  let unableToReachStreak = 0;
  const sorted = [...followUps].sort((a, b) => (a.at < b.at ? 1 : -1));
  for (const fu of sorted) {
    if (fu.action === 'unable_to_reach') unableToReachStreak++;
    else if (fu.action === 'contacted_patient' || fu.action === 'appointment_confirmed' || fu.action === 'patient_attended')
      break;
  }

  const lastCheck = sorted.find((fu) => fu.action === 'facility_contacted');
  const facilityCheckedDaysAgo = lastCheck ? Math.max(0, daysBetween(toISODate(new Date(lastCheck.at)), now)) : undefined;

  return {
    // The facility has the referral if it synced, or if the worker confirmed receipt by phone/visit.
    sentToFacility: !!referral.lastSyncedAt || (!!w.facilityResponse && w.facilityResponse !== 'none'),
    response,
    appointment,
    attendance,
    attendanceConflict,
    responseConflict,
    facilityCompleted: f.completed,
    followUpRequired: f.completed && f.followUpRequired,
    outcomeRecorded: !!w.outcomeRecorded,
    unableToReachStreak,
    facilityCheckedDaysAgo,
  };
}
