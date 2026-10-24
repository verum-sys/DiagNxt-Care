import { describe, expect, it } from 'vitest';
import {
  calculatePartAScore,
  calculatePartDScore,
  classifyAge,
  classifyWaist,
  evaluateCbacTriage,
  parseCbacText,
} from './cbacIntelligence';
import type { CbacPartA, CbacPartB, CbacPartC, CbacPartD } from './cbacTypes';

describe('cbacIntelligence', () => {
  it('smartly auto-classifies age into Part A Question 1 score bracket', () => {
    // 0-29 -> 0
    expect(classifyAge(26)).toBe(0);
    expect(classifyAge(18)).toBe(0);
    expect(classifyAge(29)).toBe(0);

    // 30-39 -> 1
    expect(classifyAge(30)).toBe(1);
    expect(classifyAge(35)).toBe(1);
    expect(classifyAge(39)).toBe(1);

    // 40-49 -> 2
    expect(classifyAge(40)).toBe(2);
    expect(classifyAge(45)).toBe(2);

    // 50-59 -> 3
    expect(classifyAge(50)).toBe(3);
    expect(classifyAge(55)).toBe(3);

    // >=60 -> 4
    expect(classifyAge(60)).toBe(4);
    expect(classifyAge(65)).toBe(4);
  });

  it('smartly classifies waist based on gender (Female vs Male)', () => {
    // Female: <=80 -> 0, 81-90 -> 1, >90 -> 2
    expect(classifyWaist(78, 'F')).toBe(0);
    expect(classifyWaist(80, 'F')).toBe(0);
    expect(classifyWaist(85, 'F')).toBe(1);
    expect(classifyWaist(90, 'F')).toBe(1);
    expect(classifyWaist(95, 'F')).toBe(2);

    // Male: <=90 -> 0, 91-100 -> 1, >100 -> 2
    expect(classifyWaist(78, 'M')).toBe(0);
    expect(classifyWaist(90, 'M')).toBe(0);
    expect(classifyWaist(95, 'M')).toBe(1);
    expect(classifyWaist(100, 'M')).toBe(1);
    expect(classifyWaist(105, 'M')).toBe(2);
  });

  it('calculates Part A and Part D scores correctly', () => {
    const partA: Partial<CbacPartA> = {
      ageScore: 2, // 40-49
      smokeScore: 2, // daily
      alcoholScore: 0,
      waistScore: 1,
      physicalActivityScore: 1, // < 150 min
      familyHistoryScore: 2, // yes
    };
    expect(calculatePartAScore(partA)).toBe(8);

    const partD: Partial<CbacPartD> = {
      phq1Score: 2,
      phq2Score: 2,
    };
    expect(calculatePartDScore(partD)).toBe(4);
  });

  it('evaluates triage alerts for High Risk NCD, TB and Mental Health', () => {
    const partA: CbacPartA = {
      ageScore: 0,
      smokeScore: 0,
      alcoholScore: 0,
      waistScore: 0,
      physicalActivityScore: 0,
      familyHistoryScore: 0,
      totalScore: 0,
    };
    const partB: CbacPartB = {
      symptoms: { cough_two_weeks: true },
    };
    const partC: CbacPartC = {
      cookingFuel: ['firewood'],
      occupationalExposure: [],
    };
    const partD: CbacPartD = {
      phq1Score: 0,
      phq2Score: 0,
      totalScore: 0,
    };

    const triage = evaluateCbacTriage(partA, partB, partC, partD);
    expect(triage.tbSuspectAlert).toBe(true);
    expect(triage.symptomAlert).toBe(true);
    expect(triage.referralRequired).toBe(true);
  });

  it('parses natural language text with age 26 and female waist', () => {
    const text = 'Sunita Devi, age 26 female, waist 76 cm, never smokes, walks daily, coughing for 3 weeks';
    const result = parseCbacText(text);

    expect(result.generalUpdates.name).toBe('Sunita Devi');
    expect(result.generalUpdates.age).toBe(26);
    expect(result.generalUpdates.sex).toBe('F');
    expect(result.partAUpdates.ageScore).toBe(0); // 0-29 bracket
    expect(result.partAUpdates.waistCm).toBe(76);
    expect(result.partAUpdates.waistScore).toBe(0); // <= 80cm female
    expect(result.partAUpdates.smokeScore).toBe(0);
    expect(result.partAUpdates.physicalActivityScore).toBe(0);
    expect(result.partBUpdates.cough_two_weeks).toBe(true);
  });

  it('parses user spoken phrase: Varun, age 26 Male, waist 76 cm...', () => {
    const text = 'my name is Varun, age 26 Male, waist 76 cm, never smokes, no alcohol, walks daily, coughing for 3 weeks, firewood cooking, feeling down several days';
    const result = parseCbacText(text);

    expect(result.generalUpdates.name).toBe('Varun');
    expect(result.generalUpdates.age).toBe(26);
    expect(result.generalUpdates.sex).toBe('M');
    expect(result.partAUpdates.ageScore).toBe(0); // 0-29 bracket (0 pts)
    expect(result.partAUpdates.waistCm).toBe(76);
    expect(result.partAUpdates.waistScore).toBe(0); // <= 90cm male (0 pts)
    expect(result.partAUpdates.smokeScore).toBe(0); // never smokes (0 pts)
    expect(result.partAUpdates.alcoholScore).toBe(0); // no alcohol (0 pts)
    expect(result.partAUpdates.physicalActivityScore).toBe(0); // walks daily (0 pts)
    expect(result.partBUpdates.cough_two_weeks).toBe(true); // coughing for 3 weeks
    expect(result.partCUpdates.cookingFuel).toContain('firewood');
    expect(result.partDUpdates.phq2Score).toBeDefined(); // feeling down several days
  });

  it('parses all-lowercase speech input from Web Speech API', () => {
    const text = 'my name is varun, age 26 male, waist 76 cm, never smokes, no alcohol, walks daily, coughing for 3 weeks, firewood cooking, feeling down several days';
    const result = parseCbacText(text);

    expect(result.generalUpdates.name?.toLowerCase()).toBe('varun');
    expect(result.generalUpdates.age).toBe(26);
    expect(result.generalUpdates.sex).toBe('M');
  });
});

