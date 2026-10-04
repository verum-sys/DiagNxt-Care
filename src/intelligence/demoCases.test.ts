import { describe, expect, it } from 'vitest';
import { buildDraftFieldRows } from './stage/draftFields';
import { deriveCaseStageFromDraft } from './stage/deriveStage';
import { analyze } from './engine';
import { makePatient, makeReferral } from '../db/factory';
import { emptyFacility } from '../db/factory';
import { DEMO_CASE_TEXT, type DemoCaseId, type DemoLang } from './demoCases';
import { parseFreeText } from './parser';
import { addDays, today } from './dates';

const NOW = new Date(2026, 9, 4, 10, 0, 0);
const DAY = '2026-10-04';
const TUESDAY = '2026-10-06';
const LAST_MONDAY = addDays(DAY, -6);

function parseDemo(lang: DemoLang, id: DemoCaseId) {
  return parseFreeText(DEMO_CASE_TEXT[lang][id], NOW);
}

describe('DEMO_CASE_TEXT — case1 referral initiated', () => {
  it('English', () => {
    const p = parseDemo('en', 'case1');
    expect(p.name).toBe('Kamla');
    expect(p.age).toBe(42);
    expect(p.locality).toBe('Rampur');
    expect(p.destinationFacility).toBe('District Hospital');
    expect(p.referralDate).toBe(DAY);
    expect(p.reason).toBe('screening test');
    expect(p.patientIntention).toBe('will_attend');
    expect(p.referralDecision).toBe('referred');
    expect(p.facilityAccepted).toBe(false);
    expect(p.appointmentDate).toBeUndefined();
    expect(deriveCaseStageFromDraft({ text: DEMO_CASE_TEXT.en.case1, parsed: p, now: DAY })).toBe('referral_initiated');
  });

  it('Hinglish', () => {
    const p = parseDemo('hinglish', 'case1');
    expect(p.name).toBe('Kamla');
    expect(p.age).toBe(42);
    expect(p.locality).toBe('Rampur');
    expect(p.destinationFacility).toBe('District Hospital');
    expect(p.referralDate).toBe(DAY);
    expect(p.reason).toBe('screening test');
    expect(p.patientIntention).toBe('will_attend');
    expect(p.referralDecision).toBe('referred');
  });

  it('Hindi', () => {
    const p = parseDemo('hindi', 'case1');
    expect(p.name).toBe('कमला');
    expect(p.age).toBe(42);
    expect(p.locality).toBe('रामपुर');
    expect(p.destinationFacility).toBe('District Hospital');
    expect(p.referralDate).toBe(DAY);
    expect(p.reason).toBe('जाँच');
    expect(p.patientIntention).toBe('will_attend');
    expect(p.referralDecision).toBe('referred');
  });
});

describe('DEMO_CASE_TEXT — case2 tentative appointment', () => {
  it('English', () => {
    const p = parseDemo('en', 'case2');
    expect(p.name).toBe('Sunita');
    expect(p.age).toBe(35);
    expect(p.locality).toBe('Rampur');
    expect(p.destinationFacility).toBe('Community Health Centre (CHC)');
    expect(p.referralDate).toBe(addDays(DAY, -1));
    expect(p.facilityAccepted).toBe(true);
    expect(p.appointmentDate).toBe(TUESDAY);
    expect(p.appointmentTentative).toBe(true);
    expect(deriveCaseStageFromDraft({ text: DEMO_CASE_TEXT.en.case2, parsed: p, now: DAY })).toBe('appointment_scheduled');
  });

  it('Hinglish', () => {
    const p = parseDemo('hinglish', 'case2');
    expect(p.name).toBe('Sunita');
    expect(p.age).toBe(35);
    expect(p.locality).toBe('Rampur');
    expect(p.facilityAccepted).toBe(true);
    expect(p.appointmentDate).toBe(TUESDAY);
    expect(p.appointmentTentative).toBe(true);
  });

  it('Hindi', () => {
    const p = parseDemo('hindi', 'case2');
    expect(p.name).toBe('सुनीता');
    expect(p.age).toBe(35);
    expect(p.locality).toBe('रामपुर');
    expect(p.facilityAccepted).toBe(true);
    expect(p.appointmentDate).toBe(TUESDAY);
    expect(p.appointmentTentative).toBe(true);
  });
});

describe('DEMO_CASE_TEXT — case3 follow-up due', () => {
  it('English', () => {
    const p = parseDemo('en', 'case3');
    expect(p.name).toBe('Reena');
    expect(p.destinationFacility).toBe('District Hospital');
    expect(p.facilityAccepted).toBe(true);
    expect(p.appointmentDate).toBe(LAST_MONDAY);
    expect(deriveCaseStageFromDraft({ text: DEMO_CASE_TEXT.en.case3, parsed: p, now: DAY })).toBe('follow_up_due');
  });

  it('Hinglish', () => {
    const p = parseDemo('hinglish', 'case3');
    expect(p.name).toBe('Reena');
    expect(p.facilityAccepted).toBe(true);
    expect(p.appointmentDate).toBe(LAST_MONDAY);
    expect(deriveCaseStageFromDraft({ text: DEMO_CASE_TEXT.hinglish.case3, parsed: p, now: DAY })).toBe('follow_up_due');
  });

  it('Hindi', () => {
    const p = parseDemo('hindi', 'case3');
    expect(p.name).toBe('रीना');
    expect(p.destinationFacility).toBe('District Hospital');
    expect(p.facilityAccepted).toBe(true);
    expect(p.appointmentDate).toBe(LAST_MONDAY);
    expect(deriveCaseStageFromDraft({ text: DEMO_CASE_TEXT.hindi.case3, parsed: p, now: DAY })).toBe('follow_up_due');
  });
});

describe('DEMO_CASE_TEXT — intelligence preview', () => {
  function draftIntel(lang: DemoLang, id: DemoCaseId) {
    const text = DEMO_CASE_TEXT[lang][id];
    const p = parseFreeText(text, NOW);
    const patient = makePatient({
      id: 'd',
      name: p.name ?? '',
      age: p.age,
      locality: p.locality,
      sex: p.sex,
      phone: '9876543210',
    });
    const referral = makeReferral({
      id: 'd',
      patientId: 'd',
      reason: p.reason ?? '',
      destinationFacility: p.destinationFacility ?? '',
      referralDate: p.referralDate ?? DAY,
      urgency: p.urgency ?? 'routine',
      notes: text,
      patientIntention: p.patientIntention,
      worker: {
        appointmentDate: p.appointmentDate,
        facilityResponse: p.facilityAccepted ? 'accepted' : undefined,
        appointmentCertainty: p.appointmentTentative ? 'tentative' : undefined,
      },
      facility: emptyFacility(),
    });
    return analyze(patient, referral, [], NOW);
  }

  it('case2 en suggests confirm appointment', () => {
    expect(draftIntel('en', 'case2').action).toBe('confirm_appointment');
  });

  it('case3 en suggests check attendance', () => {
    expect(draftIntel('en', 'case3').action).toBe('check_attendance');
  });
});
