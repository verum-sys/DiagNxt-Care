/**
 * Synthetic demo data (no real patients). Dates are relative to today so the demo always
 * shows the intended states. Cases that "already synced" are also written to the simulated server.
 */
import { addDays, nearestWeekdayIso, today } from '../intelligence/dates';
import { getDB, getMeta, notifyChange } from './db';
import { emptyFacility, makePatient, makeReferral } from './factory';
import type { FacilityEvent, FollowUp, Patient, Referral } from './types';

const SEED_VERSION = 4;
export const DEFAULT_WORKER = 'ASHA Rekha Devi';

function iso(day: string, hour = 10): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
}

function build() {
  const t = today();
  const patients: Patient[] = [
    makePatient({ id: 'CL-0001', name: 'Mary Kujur', age: 45, sex: 'F', phone: '9431201145', locality: 'Bero village', syncStatus: 'pending' }),
    makePatient({ id: 'CL-0002', name: 'Sunita Devi', age: 35, sex: 'F', phone: '9835012277', locality: 'Rampur gaon', syncStatus: 'synced' }),
    makePatient({ id: 'CL-0003', name: 'Lakshmi Oraon', age: 42, sex: 'F', phone: '7004318862', locality: 'Rampur village', syncStatus: 'synced' }),
    makePatient({ id: 'CL-0004', name: 'Ramesh Mahto', age: 61, sex: 'M', phone: '9798440021', locality: 'Mandar', syncStatus: 'synced' }),
    makePatient({ id: 'CL-0005', name: 'Geeta Kumari', age: 29, sex: 'F', locality: 'Itki', syncStatus: 'pending' }),
  ];

  const synced = (day: string) => iso(day, 18);

  const referrals: Referral[] = [
    // 1. Referral just created on the device, not yet reached the facility (the brief's "Mary" example).
    makeReferral({
      id: 'REF-0001',
      patientId: 'CL-0001',
      reason: 'Further screening advised at health camp',
      destinationFacility: 'Sadar District Hospital',
      referralDate: addDays(t, -1),
      urgency: 'soon',
      patientIntention: 'will_attend',
      notes: 'She said she would go. No word from the hospital yet.',
      syncStatus: 'pending',
    }),
    // 2. Case 2: Referral accepted + appointment tentative (Sunita in accepted).
    makeReferral({
      id: 'REF-0002',
      patientId: 'CL-0002',
      reason: 'Follow-up of abnormal screening result',
      destinationFacility: 'CHC Bero',
      referralDate: addDays(t, -1),
      urgency: 'routine',
      patientIntention: 'will_attend',
      notes: 'Sunita ko kal CHC refer kiya tha, 35 saal, Rampur gaon. CHC ne referral accept kar liya hai. Unhone bola hai ki woh Tuesday ko aa sakti hai, lekin appointment abhi confirm nahi hua.',
      syncStatus: 'synced',
      lastSyncedAt: synced(addDays(t, -1)),
      facility: { ...emptyFacility(), response: 'accepted', updatedAt: iso(addDays(t, -1), 11) },
    }),
    // 3. Case 1: New patient + referral initiated (Lakshmi Oraon on pending).
    makeReferral({
      id: 'REF-0003',
      patientId: 'CL-0003',
      reason: 'Screening test',
      destinationFacility: 'District Hospital',
      referralDate: t,
      urgency: 'routine',
      patientIntention: 'will_attend',
      notes: 'I am registering Lakshmi Oraon today. She is 42 from Rampur village. I am referring her to the district hospital for a screening test. She is ready to go.',
      syncStatus: 'synced',
      lastSyncedAt: synced(t),
      facility: { ...emptyFacility(), response: 'received', updatedAt: iso(t, 10) },
    }),
    // 4. Appointment 4 days ago, patient confirmed did not attend, urgent.
    makeReferral({
      id: 'REF-0004',
      patientId: 'CL-0004',
      reason: 'Further investigation after screening',
      destinationFacility: 'Sadar District Hospital',
      referralDate: addDays(t, -12),
      urgency: 'urgent',
      patientIntention: 'will_attend',
      notes: '',
      syncStatus: 'synced',
      lastSyncedAt: synced(addDays(t, -1)),
      facility: { ...emptyFacility(), response: 'accepted', appointmentDate: addDays(t, -4), attendance: 'not_attended', updatedAt: iso(addDays(t, -3), 10) },
    }),
    // 5. Referral information incomplete (no destination facility, no phone).
    makeReferral({
      id: 'REF-0005',
      patientId: 'CL-0005',
      reason: 'Referral for further check-up',
      destinationFacility: '',
      referralDate: t,
      urgency: 'routine',
      notes: 'Family to decide which hospital.',
      syncStatus: 'pending',
    }),
  ];

  const followUps: FollowUp[] = [
    { id: 'fu-seed-2', referralId: 'REF-0004', at: iso(addDays(t, -9), 15), action: 'appointment_confirmed', note: 'Ramesh confirmed he will go with his son.', data: { date: addDays(t, -4) }, suggestedAction: 'remind_patient', syncStatus: 'synced' },
    { id: 'fu-seed-3', referralId: 'REF-0004', at: iso(addDays(t, -1), 17), action: 'unable_to_reach', note: 'Phone switched off.', suggestedAction: 'reschedule', syncStatus: 'synced' },
  ];
  // Reflect seeded follow-ups in the worker facts / intention.
  referrals[1].worker = {
    facilityResponse: 'accepted',
    appointmentDate: nearestWeekdayIso(2, t, 'future'),
    appointmentCertainty: 'tentative',
  };
  referrals[2].patientIntention = 'will_attend';
  referrals[3].worker = { appointmentDate: addDays(t, -4), facilityResponse: 'accepted', attendance: 'not_attended' };

  const facilityEvents: FacilityEvent[] = [
    { id: 'fe-seed-1', referralId: 'REF-0002', at: iso(addDays(t, -2), 10), kind: 'acknowledged' },
    { id: 'fe-seed-2', referralId: 'REF-0002', at: iso(addDays(t, -1), 11), kind: 'accepted', text: 'CHC ne referral accept kar liya hai. Unhone bola hai ki woh Tuesday ko aa sakti hai, lekin appointment abhi confirm nahi hua.' },
    { id: 'fe-seed-3', referralId: 'REF-0003', at: iso(t, 10), kind: 'acknowledged', text: 'Referral acknowledged and pending facility review.' },
    { id: 'fe-seed-4', referralId: 'REF-0004', at: iso(addDays(t, -9), 9), kind: 'scheduled', text: addDays(t, -4) },
    { id: 'fe-seed-4b', referralId: 'REF-0004', at: iso(addDays(t, -3), 10), kind: 'not_attended', text: 'Patient did not attend scheduled appointment.' },
  ];
  referrals[1].facility.notes = [{ at: iso(addDays(t, -1), 11), text: 'Referral accepted. Unhone bola hai ki woh Tuesday ko aa sakti hai, lekin appointment abhi confirm nahi hua.' }];

  return { patients, referrals, followUps, facilityEvents };
}

export async function seedIfEmpty(): Promise<void> {
  if ((await getMeta<number>('seed_version')) === SEED_VERSION) return;
  await resetDemoData();
}

export async function resetDemoData(): Promise<void> {
  const db = await getDB();
  const { patients, referrals, followUps, facilityEvents } = build();
  const stores = [
    'patients', 'referrals', 'followups', 'facility_events', 'outbox', 'sync_events',
    'remote_patients', 'remote_referrals', 'remote_followups', 'remote_facility_events',
  ] as const;
  const tx = db.transaction([...stores, 'meta'], 'readwrite');
  for (const s of stores) await tx.objectStore(s).clear();

  const now = new Date().toISOString();
  for (const p of patients) {
    await tx.objectStore('patients').put(p);
    if (p.syncStatus === 'pending') await tx.objectStore('outbox').put({ id: `patient:${p.id}`, entity: 'patient', entityId: p.id, at: now });
    else await tx.objectStore('remote_patients').put(p);
  }
  for (const r of referrals) {
    await tx.objectStore('referrals').put(r);
    if (r.syncStatus === 'pending') await tx.objectStore('outbox').put({ id: `referral:${r.id}`, entity: 'referral', entityId: r.id, at: now });
    else await tx.objectStore('remote_referrals').put(r);
  }
  for (const f of followUps) {
    await tx.objectStore('followups').put(f);
    await tx.objectStore('remote_followups').put(f);
  }
  for (const e of facilityEvents) {
    await tx.objectStore('facility_events').put(e);
    await tx.objectStore('remote_facility_events').put(e);
  }
  const meta = tx.objectStore('meta');
  await meta.put({ key: 'counter_patient', value: patients.length });
  await meta.put({ key: 'counter_referral', value: referrals.length });
  await meta.put({ key: 'seed_version', value: SEED_VERSION });
  await tx.done;
  notifyChange();
}

