import { describe, expect, it } from 'vitest';
import { analyze } from './engine';
import { makePatient, makeReferral } from '../db/factory';
import { emptyFacility } from '../db/factory';
import {
  DEMO_CASE_BY_LANG,
  DEMO_CASE_TEXT,
  demoTextForLang,
  type DemoCaseId,
  type DemoLang,
} from './demoCases';
import { parseFreeText } from './parser';
import { addDays, today } from './dates';
import { deriveCaseStageFromDraft } from './stage/deriveStage';

const NOW = new Date(2026, 9, 4, 10, 0, 0);
const DAY = '2026-10-04';
const LAST_MONDAY = addDays(DAY, -6);
const NEXT_WEEK = addDays(DAY, 7);

function parseDemo(lang: DemoLang, id: DemoCaseId) {
  return parseFreeText(DEMO_CASE_TEXT[lang][id], NOW);
}

describe('DEMO_CASE_BY_LANG', () => {
  it('maps each example language to one scenario', () => {
    expect(DEMO_CASE_BY_LANG.en).toBe('case1');
    expect(DEMO_CASE_BY_LANG.hinglish).toBe('case2');
    expect(DEMO_CASE_BY_LANG.hindi).toBe('case3');
    expect(demoTextForLang('en')).toBe(DEMO_CASE_TEXT.en.case1);
    expect(demoTextForLang('hinglish')).toBe(DEMO_CASE_TEXT.hinglish.case2);
    expect(demoTextForLang('hindi')).toBe(DEMO_CASE_TEXT.hindi.case3);
  });
});

function expectCase1Screening(p: ReturnType<typeof parseFreeText>) {
  expect(p.screeningCompleted).toBe(true);
  expect(p.screeningArea).toBe('oral');
  expect(p.screeningFinding).toBe('positive');
  expect(p.referralRequired).toBe('yes');
}

function expectCase2Screening(p: ReturnType<typeof parseFreeText>) {
  expect(p.screeningCompleted).toBe(true);
  expect(p.screeningArea).toBe('ncd');
  expect(p.screeningFinding).toBe('needs_review');
  expect(p.referralRequired).toBe('yes');
}

describe('DEMO_CASE_TEXT — case1 referral initiated', () => {
  it('English', () => {
    const p = parseDemo('en', 'case1');
    expect(p.name).toBe('Mary Sharma');
    expect(p.age).toBe(38);
    expect(p.sex).toBe('F');
    expect(p.phone).toBe('9876543210');
    expect(p.locality).toBe('Rampur');
    expect(p.destinationFacility).toBe('Sadar District Hospital');
    expect(p.referralDate).toBe(addDays(DAY, -1));
    expect(p.reason).toBe('urgent follow-up');
    expect(p.urgency).toBe('urgent');
    expect(p.patientIntention).toBe('will_attend');
    expect(p.referralDecision).toBe('referred');
    expect(p.facilityAccepted).toBe(false);
    expect(p.appointmentDate).toBe(NEXT_WEEK);
    expectCase1Screening(p);
    expect(deriveCaseStageFromDraft({ text: DEMO_CASE_TEXT.en.case1, parsed: p, now: DAY })).toBe(
      'appointment_scheduled',
    );
  });

  it('Hinglish', () => {
    const p = parseDemo('hinglish', 'case1');
    expect(p.name).toBe('Mary Sharma');
    expect(p.age).toBe(38);
    expect(p.locality).toBe('Rampur');
    expect(p.phone).toBe('9876543210');
    expect(p.destinationFacility).toBe('Sadar District Hospital');
    expect(p.referralDate).toBe(addDays(DAY, -1));
    expect(p.reason).toBe('urgent follow-up');
    expect(p.urgency).toBe('urgent');
    expect(p.patientIntention).toBe('will_attend');
    expect(p.referralDecision).toBe('referred');
    expect(p.appointmentDate).toBe(NEXT_WEEK);
    expectCase1Screening(p);
  });

  it('Hindi', () => {
    const p = parseDemo('hindi', 'case1');
    expect(p.name).toBe('मैरी शर्मा');
    expect(p.age).toBe(38);
    expect(p.locality).toBe('रामपुर');
    expect(p.phone).toBe('9876543210');
    expect(p.destinationFacility).toBe('Sadar District Hospital');
    expect(p.referralDate).toBe(addDays(DAY, -1));
    expect(p.patientIntention).toBe('will_attend');
    expect(p.referralDecision).toBe('referred');
    expect(p.appointmentDate).toBe(NEXT_WEEK);
    expect(p.screeningCompleted).toBe(true);
    expect(p.screeningArea).toBe('oral');
    expect(p.screeningFinding).toBe('positive');
    expect(p.referralRequired).toBe('yes');
  });
});

describe('DEMO_CASE_TEXT — case2 NCD screening, referral, awaiting facility', () => {
  it('English', () => {
    const p = parseDemo('en', 'case2');
    expect(p.name).toBe('Sunita Devi');
    expect(p.age).toBe(42);
    expect(p.sex).toBe('F');
    expect(p.phone).toBe('9876543210');
    expect(p.locality).toBe('Rampur');
    expect(p.destinationFacility).toBe('Bero Community Health Centre (CHC)');
    expect(p.referralDate).toBe(addDays(DAY, -1));
    expect(p.reason).toMatch(/urgent NCD follow-up/i);
    expect(p.urgency).toBe('urgent');
    expect(p.patientIntention).toBe('will_attend');
    expect(p.referralDecision).toBe('referred');
    expect(p.facilityAccepted).toBe(false);
    expect(p.facilityNotHeard).toBe(true);
    expectCase2Screening(p);
    expect(deriveCaseStageFromDraft({ text: DEMO_CASE_TEXT.en.case2, parsed: p, now: DAY })).toBe('referral_initiated');
  });

  it('Hinglish', () => {
    const p = parseDemo('hinglish', 'case2');
    expect(p.name).toBe('Sunita Devi');
    expect(p.age).toBe(42);
    expect(p.sex).toBe('F');
    expect(p.locality).toBe('Rampur');
    expect(p.phone).toBe('9876543210');
    expect(p.destinationFacility).toBe('Bero Community Health Centre (CHC)');
    expect(p.referralDate).toBe(addDays(DAY, -1));
    expect(p.reason).toBe('urgent NCD follow-up');
    expect(p.urgency).toBe('urgent');
    expect(p.patientIntention).toBe('will_attend');
    expect(p.facilityNotHeard).toBe(true);
    expectCase2Screening(p);
  });

  it('Hindi', () => {
    const p = parseDemo('hindi', 'case2');
    expect(p.name).toBe('सुनीता देवी');
    expect(p.age).toBe(42);
    expect(p.sex).toBe('F');
    expect(p.locality).toBe('रामपुर');
    expect(p.phone).toBe('9876543210');
    expect(p.destinationFacility).toBe('Bero Community Health Centre (CHC)');
    expect(p.referralDate).toBe(addDays(DAY, -1));
    expect(p.patientIntention).toBe('will_attend');
    expect(p.facilityNotHeard).toBe(true);
    expectCase2Screening(p);
  });
});

describe('DEMO_CASE_TEXT — case3 follow-up due', () => {
  it('English', () => {
    const p = parseDemo('en', 'case3');
    expect(p.name).toBe('Reena');
    expect(p.destinationFacility).toBe('District Hospital');
    expect(p.facilityAccepted).toBe(true);
    expect(p.referralDate).toBe(LAST_MONDAY);
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
      phone: p.phone ?? '9876543210',
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

  it('case2 en suggests confirm referral (awaiting facility)', () => {
    expect(draftIntel('en', 'case2').action).toBe('confirm_referral');
  });

  it('case3 en suggests check attendance', () => {
    expect(draftIntel('en', 'case3').action).toBe('check_attendance');
  });
});
