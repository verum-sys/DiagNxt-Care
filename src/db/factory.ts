import type { FacilityFacts, Patient, Referral } from './types';

export function emptyFacility(): FacilityFacts {
  return { response: 'none', attendance: 'unknown', completed: false, followUpRequired: false, notes: [] };
}

export function makePatient(p: Partial<Patient> & Pick<Patient, 'id' | 'name'>): Patient {
  const now = new Date().toISOString();
  return { createdAt: now, updatedAt: now, syncStatus: 'pending', ...p };
}

export function makeReferral(r: Partial<Referral> & Pick<Referral, 'id' | 'patientId' | 'referralDate'>): Referral {
  const now = new Date().toISOString();
  return {
    referringWorker: 'ASHA Rekha Devi',
    reason: '',
    destinationFacility: '',
    urgency: 'routine',
    notes: '',
    worker: {},
    facility: emptyFacility(),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
    ...r,
  };
}
