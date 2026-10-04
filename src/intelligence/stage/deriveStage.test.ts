import { describe, expect, it } from 'vitest';
import { makePatient, makeReferral } from '../../db/factory';
import { deriveFacts } from '../facts';
import { DEMO_CASE_TEXT } from '../demoCases';
import { parseFreeText } from '../parser';
import { deriveCaseStageFromDraft, deriveCaseStageSaved, getStageExpectations } from './deriveStage';

const NOW = new Date(2026, 9, 4, 10, 0, 0);
const DAY = '2026-10-04';
const BRIEFING_HI =
  'मैंने कमला को आज जिला अस्पताल जाँच के लिए रेफर किया है। वह जाने के लिए तैयार है।';

describe('deriveCaseStageFromDraft', () => {
  it('briefing Hindi example → referral_initiated', () => {
    const parsed = parseFreeText(BRIEFING_HI, NOW);
    expect(parsed.referralDecision).toBe('referred');
    expect(deriveCaseStageFromDraft({ text: BRIEFING_HI, parsed })).toBe('referral_initiated');
  });

  it('returns initial_assessment without refer language or destination', () => {
    const parsed = parseFreeText('Patient has fever', NOW);
    expect(deriveCaseStageFromDraft({ text: 'Patient has fever', parsed })).toBe('initial_assessment');
  });

  it('demo case2 en → referral_initiated', () => {
    const text = DEMO_CASE_TEXT.en.case2;
    const parsed = parseFreeText(text, NOW);
    expect(deriveCaseStageFromDraft({ text, parsed, now: DAY })).toBe('referral_initiated');
  });

  it('demo case3 en → follow_up_due', () => {
    const text = DEMO_CASE_TEXT.en.case3;
    const parsed = parseFreeText(text, NOW);
    expect(deriveCaseStageFromDraft({ text, parsed, now: DAY })).toBe('follow_up_due');
  });
});

describe('getStageExpectations', () => {
  it('referral_initiated pending facility and appointment', () => {
    const e = getStageExpectations('referral_initiated');
    expect(e.pending).toContain('facilityResponse');
    expect(e.pending).toContain('appointmentDate');
    expect(e.notApplicable).toContain('attendance');
  });
});

describe('deriveCaseStageSaved', () => {
  it('new saved referral → referral_initiated', () => {
    const patient = makePatient({ id: 'CL-0001', name: 'Kamla' });
    const referral = makeReferral({
      id: 'REF-0001',
      patientId: 'CL-0001',
      referralDate: '2026-10-04',
      reason: 'checkup',
      destinationFacility: 'District Hospital',
    });
    const facts = deriveFacts(referral, [], '2026-10-04');
    expect(deriveCaseStageSaved(patient, referral, facts, '2026-10-04')).toBe('referral_initiated');
  });
});
