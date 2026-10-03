import type { FollowUp, Intelligence, Patient, Referral } from '../db/types';
import { analyze, ATTENTION_THRESHOLD } from './engine';

export interface CaseSummary {
  patient: Patient;
  referral: Referral;
  followUps: FollowUp[];
  intel: Intelligence;
}

/** Intelligent prioritisation across all cases: analyse each, then rank by priority score. */
export function rankCases(
  cases: { patient: Patient; referral: Referral; followUps: FollowUp[] }[],
  now: Date = new Date(),
): { needsAttention: CaseSummary[]; active: CaseSummary[]; closed: CaseSummary[] } {
  const analysed = cases
    .map((c) => ({ ...c, intel: analyze(c.patient, c.referral, c.followUps, now) }))
    .sort((a, b) => b.intel.priority - a.intel.priority);

  return {
    needsAttention: analysed.filter((c) => c.intel.open && c.intel.priority >= ATTENTION_THRESHOLD),
    active: analysed.filter((c) => c.intel.open && c.intel.priority < ATTENTION_THRESHOLD),
    closed: analysed.filter((c) => !c.intel.open),
  };
}
