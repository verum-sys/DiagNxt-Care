/**
 * Frontline repository. Every write lands in IndexedDB first, is marked `pending`,
 * and is queued in the outbox for the next sync. Nothing here touches the network.
 */
import { getDB, getMeta, notifyChange, setMeta, uid } from './db';
import { emptyFacility } from './factory';
import type {
  ActionKey,
  FacilityEvent,
  FacilityResponse,
  FollowUp,
  FollowUpAction,
  Intention,
  OutboxItem,
  Patient,
  Referral,
  SyncEvent,
} from './types';

export interface CaseRecord {
  patient: Patient;
  referral: Referral;
  followUps: FollowUp[];
  facilityEvents: FacilityEvent[];
}

async function nextId(kind: 'patient' | 'referral'): Promise<string> {
  const key = `counter_${kind}`;
  const n = ((await getMeta<number>(key)) ?? 0) + 1;
  await setMeta(key, n);
  return `${kind === 'patient' ? 'CL' : 'REF'}-${String(n).padStart(4, '0')}`;
}

function outboxItem(entity: OutboxItem['entity'], entityId: string): OutboxItem {
  return { id: `${entity}:${entityId}`, entity, entityId, at: new Date().toISOString() };
}

export async function listCases(): Promise<CaseRecord[]> {
  const db = await getDB();
  const [patients, referrals, followUps, events] = await Promise.all([
    db.getAll('patients'),
    db.getAll('referrals'),
    db.getAll('followups'),
    db.getAll('facility_events'),
  ]);
  const byId = new Map(patients.map((p) => [p.id, p]));
  return referrals
    .filter((r) => byId.has(r.patientId))
    .map((r) => ({
      patient: byId.get(r.patientId)!,
      referral: r,
      followUps: followUps.filter((f) => f.referralId === r.id),
      facilityEvents: events.filter((e) => e.referralId === r.id),
    }));
}

export async function getCase(referralId: string): Promise<CaseRecord | undefined> {
  const db = await getDB();
  const referral = await db.get('referrals', referralId);
  if (!referral) return undefined;
  const patient = await db.get('patients', referral.patientId);
  if (!patient) return undefined;
  const followUps = await db.getAllFromIndex('followups', 'byReferral', referralId);
  const facilityEvents = await db.getAllFromIndex('facility_events', 'byReferral', referralId);
  return { patient, referral, followUps, facilityEvents };
}

export type PatientDraft = Pick<Patient, 'name' | 'age' | 'sex' | 'phone' | 'locality'>;
export type ReferralDraft = Pick<
  Referral,
  'reason' | 'destinationFacility' | 'referralDate' | 'urgency' | 'notes' | 'patientIntention'
> & { appointmentDate?: string; facilityResponse?: FacilityResponse };

export async function createCase(p: PatientDraft, r: ReferralDraft, referringWorker: string): Promise<string> {
  const db = await getDB();
  const now = new Date().toISOString();
  const patientId = await nextId('patient');
  const referralId = await nextId('referral');
  const patient: Patient = { ...p, id: patientId, createdAt: now, updatedAt: now, syncStatus: 'pending' };
  const { appointmentDate, facilityResponse, ...rest } = r;
  const referral: Referral = {
    ...rest,
    id: referralId,
    patientId,
    referringWorker,
    worker: { appointmentDate: appointmentDate || undefined, facilityResponse },
    facility: emptyFacility(),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };
  const tx = db.transaction(['patients', 'referrals', 'outbox'], 'readwrite');
  await tx.objectStore('patients').put(patient);
  await tx.objectStore('referrals').put(referral);
  await tx.objectStore('outbox').put(outboxItem('patient', patientId));
  await tx.objectStore('outbox').put(outboxItem('referral', referralId));
  await tx.done;
  notifyChange();
  return referralId;
}

export async function updateCase(referralId: string, p: PatientDraft, r: ReferralDraft, suggestedAction?: ActionKey): Promise<void> {
  const db = await getDB();
  const current = await getCase(referralId);
  if (!current) throw new Error('Case not found');
  const now = new Date().toISOString();
  const { appointmentDate, facilityResponse, ...rest } = r;
  const patient: Patient = { ...current.patient, ...p, updatedAt: now, syncStatus: 'pending' };
  const referral: Referral = {
    ...current.referral,
    ...rest,
    worker: {
      ...current.referral.worker,
      appointmentDate: appointmentDate || current.referral.worker.appointmentDate,
      facilityResponse: facilityResponse ?? current.referral.worker.facilityResponse,
    },
    updatedAt: now,
    syncStatus: 'pending',
  };
  const fu: FollowUp = { id: uid('fu-'), referralId, at: now, action: 'details_completed', suggestedAction, syncStatus: 'pending' };
  const tx = db.transaction(['patients', 'referrals', 'followups', 'outbox'], 'readwrite');
  await tx.objectStore('patients').put(patient);
  await tx.objectStore('referrals').put(referral);
  await tx.objectStore('followups').put(fu);
  await tx.objectStore('outbox').put(outboxItem('patient', patient.id));
  await tx.objectStore('outbox').put(outboxItem('referral', referralId));
  await tx.objectStore('outbox').put(outboxItem('followup', fu.id));
  await tx.done;
  notifyChange();
}

export interface FollowUpInput {
  action: FollowUpAction;
  note?: string;
  date?: string;
  response?: FacilityResponse;
  intention?: Intention;
  suggestedAction?: ActionKey;
}

/** Record what the worker did, and fold what they learned into the frontline-owned facts. */
export async function addFollowUp(referralId: string, input: FollowUpInput): Promise<void> {
  const db = await getDB();
  const referral = await db.get('referrals', referralId);
  if (!referral) throw new Error('Referral not found');
  const now = new Date().toISOString();
  const w = { ...referral.worker };
  let intention = referral.patientIntention;

  switch (input.action) {
    case 'facility_contacted':
      if (input.response && input.response !== 'none') w.facilityResponse = input.response;
      if (input.date) w.appointmentDate = input.date;
      break;
    case 'appointment_confirmed':
      if (input.date) w.appointmentDate = input.date;
      if (!w.facilityResponse || w.facilityResponse === 'none') w.facilityResponse = 'accepted';
      intention = 'will_attend';
      break;
    case 'rescheduled':
      if (input.date) w.appointmentDate = input.date;
      w.attendance = undefined;
      break;
    case 'contacted_patient':
      if (input.intention) intention = input.intention;
      break;
    case 'patient_attended':
      w.attendance = 'attended';
      break;
    case 'patient_not_attended':
      w.attendance = 'not_attended';
      break;
    case 'outcome_recorded':
      w.outcomeRecorded = true;
      w.outcomeNote = input.note;
      break;
  }

  const fu: FollowUp = {
    id: uid('fu-'),
    referralId,
    at: now,
    action: input.action,
    note: input.note || undefined,
    data: { date: input.date, response: input.response, intention: input.intention },
    suggestedAction: input.suggestedAction,
    syncStatus: 'pending',
  };
  const updated: Referral = { ...referral, worker: w, patientIntention: intention, updatedAt: now, syncStatus: 'pending' };

  const tx = db.transaction(['referrals', 'followups', 'outbox'], 'readwrite');
  await tx.objectStore('referrals').put(updated);
  await tx.objectStore('followups').put(fu);
  await tx.objectStore('outbox').put(outboxItem('referral', referralId));
  await tx.objectStore('outbox').put(outboxItem('followup', fu.id));
  await tx.done;
  notifyChange();
}

export async function outboxCount(): Promise<number> {
  return (await getDB()).count('outbox');
}

export async function listSyncEvents(): Promise<SyncEvent[]> {
  const all = await (await getDB()).getAll('sync_events');
  return all.sort((a, b) => (a.at < b.at ? 1 : -1));
}
