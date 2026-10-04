import { describe, expect, it } from 'vitest';
import { EXAMPLES, fieldStates, parseFreeText, parseFreeTextWithSpans, type FieldSpan } from './parser';

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

  it('English example — full demo fields', () => {
    const p = parseFreeText(EXAMPLES.en, NOW);
    expect(p.name).toBe('Mary Sharma');
    expect(p.age).toBe(38);
    expect(p.phone).toBe('9876543210');
    expect(p.locality).toBe('Rampur');
    expect(p.sex).toBe('F');
    expect(p.destinationFacility).toBe('Sadar District Hospital');
    expect(p.referralDate).toBe('2026-10-03');
    expect(p.urgency).toBe('urgent');
    expect(p.reason).toBe('urgent follow-up');
    expect(p.patientIntention).toBe('will_attend');
    expect(p.facilityNotHeard).toBe(true);
    expect(p.referralDecision).toBe('referred');
    expect(p.screeningCompleted).toBe(true);
    expect(p.screeningArea).toBe('oral');
    expect(p.screeningFinding).toBe('positive');
    expect(p.referralRequired).toBe('yes');
  });

  it('Hinglish example — full demo fields', () => {
    const p = parseFreeText(EXAMPLES.hinglish, NOW);
    expect(p.name).toBe('Sunita Devi');
    expect(p.age).toBe(42);
    expect(p.locality).toBe('Rampur');
    expect(p.phone).toBe('9876543210');
    expect(p.sex).toBe('F');
    expect(p.destinationFacility).toBe('Bero Community Health Centre (CHC)');
    expect(p.referralDate).toBe('2026-10-03');
    expect(p.urgency).toBe('urgent');
    expect(p.reason).toBe('urgent TB check');
    expect(p.patientIntention).toBe('will_attend');
    expect(p.facilityNotHeard).toBe(true);
    expect(p.referralDecision).toBe('referred');
    expect(p.screeningCompleted).toBe(true);
    expect(p.screeningArea).toBe('breast');
    expect(p.screeningFinding).toBe('needs_review');
    expect(p.referralRequired).toBe('yes');
  });

  it('Hindi example — full demo fields', () => {
    const p = parseFreeText(EXAMPLES.hindi, NOW);
    expect(p.name).toBe('सुनीता देवी');
    expect(p.age).toBe(42);
    expect(p.locality).toBe('Rampur');
    expect(p.phone).toBe('9876543210');
    expect(p.sex).toBe('F');
    expect(p.destinationFacility).toBeUndefined();
    expect(p.referralDate).toBeUndefined();
    expect(p.urgency).toBeUndefined();
    expect(p.reason).toBeUndefined();
    expect(p.patientIntention).toBe('will_attend');
    expect(p.facilityNotHeard).toBe(true);
    expect(p.referralDecision).toBeUndefined();
    expect(p.screeningCompleted).toBe(true);
    expect(p.screeningArea).toBe('cervical');
    expect(p.screeningFinding).toBe('negative');
    expect(p.referralRequired).toBe('no');
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
  it('English example — highlights key phrases', () => {
    const { text, spans } = parseFreeTextWithSpans(EXAMPLES.en, NOW);
    const byField = Object.fromEntries(spans.map((s) => [s.field, s]));
    expect(sliceSpan(text, byField.name)).toBe('Mary Sharma');
    expect(sliceSpan(text, byField.destinationFacility).toLowerCase()).toContain('district hospital');
    expect(sliceSpan(text, byField.referralDate).toLowerCase()).toBe('yesterday');
    expect(sliceSpan(text, byField.reason)).toContain('urgent follow-up');
    expect(byField.screeningArea).toBeDefined();
    expect(byField.screeningFinding).toBeDefined();
    expect(byField.referralRequired).toBeDefined();
    expect(byField.patientIntention).toBeDefined();
    expect(byField.age).toBeDefined();
    expect(byField.phone).toBeDefined();
  });

  it('Hinglish example — name, age, locality, phone spans', () => {
    const { text, spans } = parseFreeTextWithSpans(EXAMPLES.hinglish, NOW);
    const byField = Object.fromEntries(spans.map((s) => [s.field, s]));
    expect(sliceSpan(text, byField.name)).toBe('Sunita Devi');
    expect(sliceSpan(text, byField.age)).toMatch(/42\s+saal/i);
    expect(sliceSpan(text, byField.locality)).toMatch(/Rampur/i);
    expect(sliceSpan(text, byField.phone).replace(/\D/g, '')).toBe('9876543210');
  });

  it('Hindi example — name and screening spans', () => {
    const { text, spans } = parseFreeTextWithSpans(EXAMPLES.hindi, NOW);
    const byField = Object.fromEntries(spans.map((s) => [s.field, s]));
    expect(sliceSpan(text, byField.name)).toBe('सुनीता देवी');
    expect(byField.screeningArea).toBeDefined();
    expect(byField.screeningFinding).toBeDefined();
    expect(byField.referralRequired).toBeDefined();
  });

  it('does not produce overlapping spans', () => {
    const { spans } = parseFreeTextWithSpans(EXAMPLES.en, NOW);
    for (let i = 0; i < spans.length; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        const a = spans[i];
        const b = spans[j];
        expect(a.start >= b.end || b.start >= a.end).toBe(true);
      }
    }
  });
});
