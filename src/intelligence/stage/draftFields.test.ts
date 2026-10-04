import { describe, expect, it } from 'vitest';
import { parseFreeText } from '../parser';
import { buildDraftFieldRows } from './draftFields';

const NOW = new Date(2026, 9, 4, 10, 0, 0);
const BRIEFING_HI =
  'मैंने कमला को आज जिला अस्पताल जाँच के लिए रेफर किया है। वह जाने के लिए तैयार है।';

const emptyForm = {
  name: '',
  age: '',
  phone: '',
  locality: '',
  reason: '',
  destinationFacility: '',
  referralDate: '2026-10-04',
  urgency: 'routine' as const,
  appointmentDate: '',
  patientIntention: '' as const,
  screeningCompleted: false,
  screeningArea: '' as const,
  screeningFinding: '' as const,
  referralRequired: '' as const,
};

function rowStatus(rows: ReturnType<typeof buildDraftFieldRows>['rows'], key: string) {
  return rows.find((r) => r.key === key)?.status;
}

describe('buildDraftFieldRows', () => {
  it('referral initiated — facility pending, appointment not scheduled, attendance N/A', () => {
    const parsed = parseFreeText(BRIEFING_HI, NOW);
    const { stage, rows } = buildDraftFieldRows(BRIEFING_HI, parsed, {
      ...emptyForm,
      name: parsed.name ?? '',
      reason: parsed.reason ?? '',
      destinationFacility: parsed.destinationFacility ?? '',
      referralDate: parsed.referralDate ?? '2026-10-04',
      patientIntention: parsed.patientIntention ?? '',
    });
    expect(stage).toBe('referral_initiated');
    expect(rowStatus(rows, 'facilityResponse')).toBe('pending');
    expect(rowStatus(rows, 'appointmentDate')).toBe('pending');
    expect(rowStatus(rows, 'attendance')).toBe('not_applicable');
    expect(rowStatus(rows, 'urgency')).toBe('not_assessed');
    expect(rowStatus(rows, 'age')).toBe('unknown');
  });
});
