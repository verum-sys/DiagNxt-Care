import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { FacilityEvent, FollowUp, OutboxItem, Patient, Referral, SyncEvent } from './types';

/**
 * On-device database. The `remote_*` stores stand in for the server in this single-device
 * demo; see sync/remote.ts — that file is the only thing to replace with a real API client.
 */
interface CareLinkDB extends DBSchema {
  patients: { key: string; value: Patient };
  referrals: { key: string; value: Referral; indexes: { byPatient: string } };
  followups: { key: string; value: FollowUp; indexes: { byReferral: string } };
  facility_events: { key: string; value: FacilityEvent; indexes: { byReferral: string } };
  outbox: { key: string; value: OutboxItem };
  sync_events: { key: string; value: SyncEvent };
  meta: { key: string; value: { key: string; value: unknown } };
  remote_patients: { key: string; value: Patient };
  remote_referrals: { key: string; value: Referral };
  remote_followups: { key: string; value: FollowUp; indexes: { byReferral: string } };
  remote_facility_events: { key: string; value: FacilityEvent; indexes: { byReferral: string } };
}

export type DB = IDBPDatabase<CareLinkDB>;

let dbPromise: Promise<DB> | null = null;

export function getDB(): Promise<DB> {
  if (!dbPromise) {
    dbPromise = openDB<CareLinkDB>('carelink', 1, {
      upgrade(db) {
        db.createObjectStore('patients', { keyPath: 'id' });
        db.createObjectStore('referrals', { keyPath: 'id' }).createIndex('byPatient', 'patientId');
        db.createObjectStore('followups', { keyPath: 'id' }).createIndex('byReferral', 'referralId');
        db.createObjectStore('facility_events', { keyPath: 'id' }).createIndex('byReferral', 'referralId');
        db.createObjectStore('outbox', { keyPath: 'id' });
        db.createObjectStore('sync_events', { keyPath: 'id' });
        db.createObjectStore('meta', { keyPath: 'key' });
        db.createObjectStore('remote_patients', { keyPath: 'id' });
        db.createObjectStore('remote_referrals', { keyPath: 'id' });
        db.createObjectStore('remote_followups', { keyPath: 'id' }).createIndex('byReferral', 'referralId');
        db.createObjectStore('remote_facility_events', { keyPath: 'id' }).createIndex('byReferral', 'referralId');
      },
    });
  }
  return dbPromise;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await (await getDB()).get('meta', key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await getDB()).put('meta', { key, value });
}

// ---- change notifications: every write calls notifyChange(); hooks re-query on change ----
const listeners = new Set<() => void>();
export function onChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function notifyChange(): void {
  listeners.forEach((cb) => cb());
}

export function uid(prefix = ''): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return prefix + rand;
}
