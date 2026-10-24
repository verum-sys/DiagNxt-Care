import { describe, expect, it } from 'vitest';
import { parseCbacInterviewAnswer } from './cbacInterviewAnswers';
import { CBAC_INTERVIEW_QUESTIONS } from './cbacInterviewQuestions';
function updates(question: string, answer: string) {
  const result = parseCbacInterviewAnswer(question, answer, 'F');
  if (!result.ok) throw new Error(result.error);
  return result.updates;
}
describe('interview field mapping', () => {
  it.each(['90', '90 cm', 'My waist is 90 cm', 'my waste is ninety centimeters', '९० सेंटीमीटर', 'my waist is one hundred and ten centimeters'])('stores waist answer %s without changing age', answer => {
    const result = updates('waist', answer);
    expect(result.generalUpdates).toEqual({});
    expect(result.partAUpdates.waistCm).toBe(answer.includes('hundred') ? 110 : 90);
    expect(result.partAUpdates.ageScore).toBeUndefined();
    expect(result.referralUpdates).toBeUndefined();
  });
  it('keeps the same bare number in the field currently being asked', () => {
    expect(updates('age', '76').generalUpdates).toEqual({ age: 76 });
    expect(updates('age', '76').partAUpdates.waistCm).toBeUndefined();
    expect(updates('waist', '76').generalUpdates.age).toBeUndefined();
    expect(updates('waist', '76').partAUpdates.waistCm).toBe(76);
  });
  it.each([['age', 'my waist is 90 cm'], ['waist', 'I am 26 years old'], ['waist', '3 weeks'], ['sex', '90'], ['alcohol', 'not sure'], ['familyHistory', '26']])('rejects mismatched or unclear %s answers', (question, answer) => {
    expect(parseCbacInterviewAnswer(question, answer).ok).toBe(false);
  });
  it('does not alter demographics for a physical activity number', () => {
    const result = updates('physicalActivity', '150 minutes every week');
    expect(result.generalUpdates).toEqual({});
    expect(result.partAUpdates).toEqual({ physicalActivityScore: 0 });
  });
  it('stores no/yes against the relevant field', () => {
    expect(updates('alcohol', 'No').partAUpdates).toEqual({ alcoholScore: 0 });
    expect(updates('familyHistory', 'Yes').partAUpdates).toEqual({ familyHistoryScore: 2 });
    expect(updates('physicalActivity', 'No').partAUpdates).toEqual({ physicalActivityScore: 1 });
  });
  it('keeps PHQ interest and mood answers separate and uses the stated frequency', () => {
    expect(updates('phq1_interest', 'Several days').partDUpdates).toEqual({ phq1Score: 1 });
    expect(updates('phq2_mood', 'Several days').partDUpdates).toEqual({ phq2Score: 1 });
  });
  it('records bleeding between periods separately from menopause', () => {
    expect(updates('women_symptoms', 'Bleeding between periods').partBUpdates).toEqual({ bleeding_between_periods: true });
  });
  for (const question of CBAC_INTERVIEW_QUESTIONS) {
    it.each(question.sampleResponses)(`${question.id} accepts its suggested answer: %s`, answer => {
      const result = parseCbacInterviewAnswer(question.id, answer, 'F');
      expect(result.ok, !result.ok ? result.error : '').toBe(true);
    });
  }
});
