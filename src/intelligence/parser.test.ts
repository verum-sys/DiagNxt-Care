import { describe, expect, it } from 'vitest';
import { EXAMPLES, fieldStates, parseFreeText } from './parser';

const NOW = new Date(2026, 9, 4, 10, 0, 0); // 2026-10-04

describe('parseFreeText', () => {
  it('English — the brief\'s Mary example', () => {
    const p = parseFreeText(
      "I referred Mary to the district hospital yesterday. She said she would go, but I haven't heard anything from the hospital yet.",
      NOW,
    );
    expect(p.name).toBe('Mary');
    expect(p.destinationFacility).toBe('District Hospital');
    expect(p.referralDate).toBe('2026-10-03');
    expect(p.patientIntention).toBe('will_attend');
    expect(p.facilityNotHeard).toBe(true);
    expect(p.sex).toBe('F');
    const s = fieldStates(p);
    expect(s.facilityResponse).toBe('unknown');
    expect(s.appointmentDate).toBe('unknown');
    expect(s.attendance).toBe('unknown');
  });

  it('English example sentence extracts a reason', () => {
    const p = parseFreeText(EXAMPLES.en, NOW);
    expect(p.reason).toBe('follow-up screening test');
  });

  it('Hinglish', () => {
    const p = parseFreeText(EXAMPLES.hinglish, NOW);
    expect(p.name).toBe('Sunita');
    expect(p.age).toBe(42);
    expect(p.locality).toBe('Rampur');
    expect(p.phone).toBe('9876543210');
    expect(p.destinationFacility).toBe('Community Health Centre (CHC)');
    expect(p.referralDate).toBe('2026-10-03');
    expect(p.patientIntention).toBe('will_attend');
    expect(p.facilityNotHeard).toBe(true);
    expect(p.reason).toBeUndefined(); // shown as Unknown for the worker to fill
  });

  it('Hindi (Devanagari)', () => {
    const p = parseFreeText(EXAMPLES.hindi, NOW);
    expect(p.name).toBe('कमला');
    expect(p.destinationFacility).toBe('District Hospital');
    expect(p.referralDate).toBe('2026-10-02');
    expect(p.reason).toBe('जाँच');
    expect(p.patientIntention).toBe('will_attend');
    expect(p.facilityNotHeard).toBe(true);
    expect(p.sex).toBe('F');
  });

  it('keeps a place name in front of the facility', () => {
    expect(parseFreeText('Referred Ravi to Sitapur District Hospital today, urgent', NOW)).toMatchObject({
      name: 'Ravi',
      destinationFacility: 'Sitapur District Hospital',
      referralDate: '2026-10-04',
      urgency: 'urgent',
    });
  });

  it('negative intention wins over positive words', () => {
    expect(parseFreeText('Geeta said she will not go to the CHC', NOW).patientIntention).toBe('will_not_attend');
  });

  it('appointment mentions', () => {
    expect(parseFreeText('Referred Anil to PHC, appointment in 3 days', NOW).appointmentDate).toBe('2026-10-07');
  });

  it('curly apostrophes from phone keyboards', () => {
    expect(parseFreeText('I haven’t heard from the hospital', NOW).facilityNotHeard).toBe(true);
  });
});
