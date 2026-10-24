import { calculatePartAScore } from './cbacIntelligence';
import type { CbacPartA } from './cbacTypes';
export const PART_A_SCORE_FIELDS = ['ageScore', 'smokeScore', 'alcoholScore', 'waistScore', 'physicalActivityScore', 'familyHistoryScore'] as const;
export function getPartAScoreBreakdown(partA: Partial<CbacPartA>) {
  const scores = PART_A_SCORE_FIELDS.map(field => partA[field]).filter((score): score is number => score !== undefined);
  const total = calculatePartAScore(partA);
  return { total, answered: scores.length, expression: scores.length ? `${scores.join(' + ')} = ${total}` : 'No scored answers yet' };
}
