import { describe, expect, it } from 'vitest';
import { getApplicableInterviewQuestions } from './cbacInterviewQuestions';
import { parseCbacInterviewAnswer } from './cbacInterviewAnswers';
import { getPartAScoreBreakdown } from './cbacScoreBreakdown';
import { calculatePartAScore } from './cbacIntelligence';
import type { CbacPartA } from './cbacTypes';

describe('applicable questions and speech recognition', () => {
  it.each(['Male', 'mail', 'I am mail', 'मेल', 'पुरुष'])(`recognizes male answer %s`, answer => {
    const parsed = parseCbacInterviewAnswer('sex', answer);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.updates.generalUpdates.sex).toBe('M');
      expect(getApplicableInterviewQuestions(parsed.updates.generalUpdates.sex!).some(q => q.id === 'women_symptoms')).toBe(false);
    }
  });
  it.each(['Female', 'femail', 'fee male', 'महिला'])(`recognizes female answer %s`, answer => {
    const parsed = parseCbacInterviewAnswer('sex', answer);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.updates.generalUpdates.sex).toBe('F');
  });
  it.each(['not male', 'not female', 'male or female', 'none', 'email address'])('asks for clarification for %s', answer => {
    expect(parseCbacInterviewAnswer('sex', answer).ok).toBe(false);
  });
  it('skips directly from cough to cooking fuel for male patients', () => {
    const questions = getApplicableInterviewQuestions('M');
    const coughIndex = questions.findIndex(q => q.id === 'cough_tb');
    expect(questions[coughIndex + 1].id).toBe('cooking_fuel');
    expect(questions[coughIndex - 1].id).toBe('familyHistory');
  });
  it('includes the women-only question for female patients only', () => {
    expect(getApplicableInterviewQuestions('F').some(q => q.id === 'women_symptoms')).toBe(true);
    expect(getApplicableInterviewQuestions('O').some(q => q.id === 'women_symptoms')).toBe(false);
    expect(getApplicableInterviewQuestions('').some(q => q.id === 'women_symptoms')).toBe(false);
    expect(parseCbacInterviewAnswer('women_symptoms', 'Lump in breast', 'M').ok).toBe(false);
  });
  it('does not change mail into male in a different question', () => {
    const result = parseCbacInterviewAnswer('name', 'Mail Kumar');
    if (!result.ok) throw new Error(result.error);
    expect(result.updates.generalUpdates).toEqual({ name: 'Mail Kumar' });
  });
});

describe('cumulative risk score', () => {
  it('adds each selected score and keeps zero-valued answers', () => {
    expect(getPartAScoreBreakdown({ ageScore: 3, smokeScore: 1, alcoholScore: 0 })).toEqual({ total: 4, answered: 3, expression: '3 + 1 + 0 = 4' });
  });
  it('accumulates interview answers without overwriting earlier scores or double counting corrections', () => {
    let partA: Partial<CbacPartA> = {};
    for (const [question, answer] of [['age', '52'], ['smoke', 'Sometimes'], ['alcohol', 'No'], ['waist', '95 cm'], ['physicalActivity', 'No'], ['familyHistory', 'Yes']]) {
      const result = parseCbacInterviewAnswer(question, answer, 'M');
      if (!result.ok) throw new Error(result.error);
      partA = { ...partA, ...result.updates.partAUpdates };
    }
    expect(getPartAScoreBreakdown(partA)).toEqual({ total: 8, answered: 6, expression: '3 + 1 + 0 + 1 + 1 + 2 = 8' });
    partA = { ...partA, smokeScore: 0 };
    expect(calculatePartAScore(partA)).toBe(7);
    expect(getPartAScoreBreakdown(partA).expression).toBe('3 + 0 + 0 + 1 + 1 + 2 = 7');
  });
  it('shows unanswered questions separately and recomputes after clearing a score', () => {
    expect(getPartAScoreBreakdown({}).expression).toBe('No scored answers yet');
    expect(getPartAScoreBreakdown({ ageScore: undefined, smokeScore: 0 })).toEqual({ total: 0, answered: 1, expression: '0 = 0' });
  });
});
