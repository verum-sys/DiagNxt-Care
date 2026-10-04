import { describe, expect, it } from 'vitest';
import { DEMO_CASE_TEXT } from './demoCases';
import { fieldStates, parseFreeText, parseFreeTextWithSpans, type FieldSpan } from './parser';

function sliceSpan(text: string, span: FieldSpan): string {
  return text.slice(span.start, span.end);
}

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

  it('keeps a place name in front of the facility', () => {
    expect(parseFreeText('Referred Ravi to Sitapur District Hospital today, urgent', NOW)).toMatchObject({
      name: 'Ravi',
      destinationFacility: 'Sitapur District Hospital',
      referralDate: '2026-10-04',
      urgency: 'urgent',
    });
  });

  it('keeps a lowercase place prefix before district hospital', () => {
    const p = parseFreeText(
      "I referred Jai to the sadar district hospital yesterday for a follow-up screening test. She said she would go.",
      NOW,
    );
    expect(p.destinationFacility).toBe('Sadar District Hospital');
    const { text, spans } = parseFreeTextWithSpans(
      "I referred Jai to the sadar district hospital yesterday for a follow-up screening test. She said she would go.",
      NOW,
    );
    const fac = spans.find((s) => s.field === 'destinationFacility');
    expect(fac).toBeDefined();
    expect(sliceSpan(text, fac!).toLowerCase()).toBe('sadar district hospital');
  });

  it('infers sex from Mr and Mrs honorifics', () => {
    expect(parseFreeText('Mr Ravi Kumar, 45 years, referred to PHC today', NOW).sex).toBe('M');
    expect(parseFreeText('Mrs Anya Sharma, 38 years, oral screening completed', NOW).sex).toBe('F');
    expect(parseFreeText('Oral screening completed for Mrs Mary Sharma, 38 years', NOW).sex).toBe('F');
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

  it('briefing Hindi — referral decision and intention', () => {
    const t =
      'मैंने कमला को आज जिला अस्पताल जाँच के लिए रेफर किया है। वह जाने के लिए तैयार है।';
    const p = parseFreeText(t, NOW);
    expect(p.name).toBe('कमला');
    expect(p.referralDecision).toBe('referred');
    expect(p.referralDate).toBe('2026-10-04');
    expect(p.patientIntention).toBe('will_attend');
    expect(p.urgency).toBeUndefined();
  });

  it('tentative appointment flag', () => {
    const p = parseFreeText('Referred Anil to PHC, appointment probably in 3 days', NOW);
    expect(p.appointmentDate).toBe('2026-10-07');
    expect(p.appointmentTentative).toBe(true);
  });
});

describe('parseFreeTextWithSpans', () => {
  it('case1 English — highlights key phrases', () => {
    const { text, spans } = parseFreeTextWithSpans(DEMO_CASE_TEXT.en.case1, NOW);
    const byField = Object.fromEntries(spans.map((s) => [s.field, s]));
    expect(sliceSpan(text, byField.name)).toBe('Mary Sharma');
    expect(sliceSpan(text, byField.destinationFacility).toLowerCase()).toContain('district hospital');
    expect(byField.patientIntention).toBeDefined();
    expect(byField.age).toBeDefined();
  });

  it('does not produce overlapping spans', () => {
    const { spans } = parseFreeTextWithSpans(DEMO_CASE_TEXT.en.case1, NOW);
    for (let i = 0; i < spans.length; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        const a = spans[i];
        const b = spans[j];
        expect(a.start >= b.end || b.start >= a.end).toBe(true);
      }
    }
  });
});
