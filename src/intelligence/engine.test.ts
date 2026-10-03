import { describe, expect, it } from 'vitest';
import { makePatient, makeReferral, emptyFacility } from '../db/factory';
import type { FollowUp } from '../db/types';
import { analyze, isOverride } from './engine';
import { addDays } from './dates';
import { rankCases } from './priority';

const NOW = new Date(2026, 9, 4, 10, 0, 0); // 2026-10-04 local
const TODAY = '2026-10-04';
const patient = makePatient({ id: 'CL-0001', name: 'Mary', phone: '9876543210', age: 45, sex: 'F' });
const base = { id: 'R1', patientId: 'CL-0001', reason: 'Screening follow-up', destinationFacility: 'District Hospital' };

function fu(action: FollowUp['action'], at: string, extra: Partial<FollowUp> = {}): FollowUp {
  return { id: `${action}-${at}`, referralId: 'R1', at, action, syncStatus: 'pending', ...extra };
}

describe('care state + next action', () => {
  it('Mary example: referred yesterday, never reached facility → confirm referral, acceptance & appointment unknown', () => {
    const r = makeReferral({ ...base, referralDate: addDays(TODAY, -1), patientIntention: 'will_attend' });
    const i = analyze(patient, r, [], NOW);
    expect(i.careState).toBe('not_sent');
    expect(i.action).toBe('confirm_referral');
    expect(i.unresolved.map((x) => x.key)).toEqual(
      expect.arrayContaining(['issue.responseUnknown', 'issue.appointmentUnknown']),
    );
    const fact = (k: string) => i.facts.find((f) => f.key === k)!;
    expect(fact('fact.facilityResponse').state).toBe('unknown');
    expect(fact('fact.appointment').state).toBe('unknown');
    expect(fact('fact.attendance').state).toBe('na');
    expect(fact('fact.intention').state).toBe('known');
  });

  it('worker confirms receipt by phone while offline → waiting for facility, quieter reason, below attention threshold', () => {
    const r = makeReferral({ ...base, referralDate: addDays(TODAY, -1), worker: { facilityResponse: 'received' } });
    const checked = fu('facility_contacted', new Date(2026, 9, 4, 9, 0, 0).toISOString());
    const i = analyze(patient, r, [checked], NOW);
    expect(i.careState).toBe('awaiting_facility');
    expect(i.reason.key).toBe('reason.confirm_referral_checked');
    expect(i.priority).toBeLessThan(50);
    // Next day the nudge returns.
    const tomorrow = new Date(2026, 9, 5, 10, 0, 0);
    const j = analyze(patient, r, [checked], tomorrow);
    expect(j.reason.key).toBe('reason.confirm_referral');
    expect(j.priority).toBeGreaterThanOrEqual(50);
  });

  it('created today and not yet synced → send referral', () => {
    const r = makeReferral({ ...base, referralDate: TODAY });
    expect(analyze(patient, r, [], NOW).action).toBe('send_referral');
  });

  it('synced, no facility reply → awaiting facility → confirm referral', () => {
    const r = makeReferral({ ...base, referralDate: addDays(TODAY, -3), lastSyncedAt: '2026-10-01T10:00:00Z' });
    const i = analyze(patient, r, [], NOW);
    expect(i.careState).toBe('awaiting_facility');
    expect(i.action).toBe('confirm_referral');
  });

  it('accepted without appointment → confirm appointment', () => {
    const r = makeReferral({ ...base, referralDate: addDays(TODAY, -2), lastSyncedAt: 'x', facility: { ...emptyFacility(), response: 'accepted' } });
    const i = analyze(patient, r, [], NOW);
    expect(i.careState).toBe('accepted_no_appt');
    expect(i.action).toBe('confirm_appointment');
  });

  it('appointment passed, attendance unknown → check attendance, high priority, overdue', () => {
    const r = makeReferral({
      ...base,
      urgency: 'urgent',
      referralDate: addDays(TODAY, -10),
      lastSyncedAt: 'x',
      facility: { ...emptyFacility(), response: 'accepted', appointmentDate: addDays(TODAY, -4) },
    });
    const i = analyze(patient, r, [], NOW);
    expect(i.careState).toBe('appt_passed_unknown');
    expect(i.action).toBe('check_attendance');
    expect(i.dueInDays).toBe(-4);
    expect(i.priority).toBeGreaterThan(100);
  });

  it('two failed calls after missed appointment → visit home', () => {
    const r = makeReferral({
      ...base,
      referralDate: addDays(TODAY, -10),
      lastSyncedAt: 'x',
      facility: { ...emptyFacility(), response: 'accepted', appointmentDate: addDays(TODAY, -4) },
    });
    const fus = [fu('unable_to_reach', '2026-10-02T09:00:00Z'), fu('unable_to_reach', '2026-10-03T09:00:00Z')];
    expect(analyze(patient, r, fus, NOW).action).toBe('visit_home');
  });

  it('no phone and appointment passed → visit home, phone flagged missing', () => {
    const p = makePatient({ id: 'CL-0002', name: 'Asha' });
    const r = makeReferral({ ...base, referralDate: addDays(TODAY, -10), lastSyncedAt: 'x', facility: { ...emptyFacility(), appointmentDate: addDays(TODAY, -1) } });
    const i = analyze(p, r, [], NOW);
    expect(i.action).toBe('visit_home');
    expect(i.missing.map((m) => m.key)).toContain('issue.missingPhone');
  });

  it('incomplete referral → complete details', () => {
    const r = makeReferral({ ...base, destinationFacility: '', referralDate: TODAY });
    const i = analyze(patient, r, [], NOW);
    expect(i.careState).toBe('incomplete');
    expect(i.action).toBe('complete_details');
    expect(i.missing.map((m) => m.key)).toContain('issue.missingDestination');
  });

  it('facility completed with follow-up plan → plan follow-up; worker outcome closes the loop', () => {
    const facility = { ...emptyFacility(), response: 'accepted' as const, appointmentDate: addDays(TODAY, -2), attendance: 'attended' as const, completed: true, followUpRequired: true, followUpPlan: 'Review in 4 weeks at PHC' };
    const r = makeReferral({ ...base, referralDate: addDays(TODAY, -10), lastSyncedAt: 'x', facility });
    const i = analyze(patient, r, [], NOW);
    expect(i.careState).toBe('follow_up_required');
    expect(i.action).toBe('plan_follow_up');
    const closed = analyze(patient, { ...r, worker: { outcomeRecorded: true } }, [], NOW);
    expect(closed.careState).toBe('closed');
    expect(closed.open).toBe(false);
    expect(closed.priority).toBe(0);
  });

  it('worker reschedule after a missed appointment overrides stale facility attendance', () => {
    const facility = { ...emptyFacility(), response: 'accepted' as const, appointmentDate: addDays(TODAY, -3), attendance: 'not_attended' as const };
    const r = makeReferral({ ...base, referralDate: addDays(TODAY, -10), lastSyncedAt: 'x', facility, worker: { appointmentDate: addDays(TODAY, 5) } });
    const i = analyze(patient, r, [], NOW);
    expect(i.careState).toBe('scheduled');
  });
});

describe('contradictions', () => {
  const synced = { ...base, referralDate: addDays(TODAY, -10), lastSyncedAt: 'x' };
  const keys = (r: Parameters<typeof analyze>[1], p = patient) => analyze(p, r, [], NOW).contradictions.map((c) => c.key);

  it('attended but appointment is in the future', () => {
    expect(keys(makeReferral({ ...synced, worker: { attendance: 'attended' }, facility: { ...emptyFacility(), appointmentDate: addDays(TODAY, 3) } }))).toContain(
      'issue.attendedBeforeAppointment',
    );
  });
  it('completed but attendance never recorded', () => {
    expect(keys(makeReferral({ ...synced, facility: { ...emptyFacility(), completed: true } }))).toContain('issue.completedNoAttendance');
  });
  it('declined but an appointment exists', () => {
    expect(keys(makeReferral({ ...synced, facility: { ...emptyFacility(), response: 'declined' }, worker: { appointmentDate: addDays(TODAY, 2) } }))).toContain(
      'issue.declinedButScheduled',
    );
  });
  it('worker and facility disagree on attendance', () => {
    const r = makeReferral({ ...synced, worker: { attendance: 'attended' }, facility: { ...emptyFacility(), appointmentDate: addDays(TODAY, -2), attendance: 'not_attended' } });
    const i = analyze(patient, r, [], NOW);
    expect(i.contradictions.map((c) => c.key)).toContain('issue.attendanceConflict');
    expect(i.action).toBe('resolve_conflict');
  });
  it('appointment before referral date', () => {
    expect(keys(makeReferral({ ...synced, worker: { appointmentDate: addDays(TODAY, -20) } }))).toContain('issue.appointmentBeforeReferral');
  });
  it('patient will not attend but appointment upcoming', () => {
    expect(keys(makeReferral({ ...synced, patientIntention: 'will_not_attend', worker: { appointmentDate: addDays(TODAY, 2) } }))).toContain(
      'issue.intentionConflict',
    );
  });
  it('referral date in the future', () => {
    expect(keys(makeReferral({ ...base, referralDate: addDays(TODAY, 3) }))).toContain('issue.referralInFuture');
  });
  it('implausible age', () => {
    expect(keys(makeReferral({ ...synced }), { ...patient, age: 140 })).toContain('issue.ageImplausible');
  });
});

describe('prioritisation', () => {
  it('ranks overdue urgent case above an upcoming routine one', () => {
    const overdue = makeReferral({ ...base, id: 'A', urgency: 'urgent', referralDate: addDays(TODAY, -10), lastSyncedAt: 'x', facility: { ...emptyFacility(), response: 'accepted', appointmentDate: addDays(TODAY, -4) } });
    const upcoming = makeReferral({ ...base, id: 'B', referralDate: addDays(TODAY, -3), lastSyncedAt: 'x', patientIntention: 'will_attend', facility: { ...emptyFacility(), response: 'accepted', appointmentDate: addDays(TODAY, 6) } });
    const { needsAttention, active } = rankCases(
      [
        { patient, referral: upcoming, followUps: [] },
        { patient, referral: overdue, followUps: [] },
      ],
      NOW,
    );
    expect(needsAttention[0].referral.id).toBe('A');
    expect(active.map((c) => c.referral.id)).toContain('B');
  });
});

describe('overrides', () => {
  it('flags when the worker took a different action than suggested', () => {
    expect(isOverride(fu('contacted_patient', 'x', { suggestedAction: 'confirm_referral' }))).toBe(true);
    expect(isOverride(fu('facility_contacted', 'x', { suggestedAction: 'confirm_referral' }))).toBe(false);
  });
});
