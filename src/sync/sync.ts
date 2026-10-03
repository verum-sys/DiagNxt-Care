/**
 * Demo sync: push the outbox to the (simulated) server, then pull facility-owned updates.
 * Explicit, user-triggered — no background sync in this prototype.
 */
import { getDB, notifyChange, uid } from '../db/db';
import type { FollowUp, Patient, Referral, SyncEvent } from '../db/types';
import { pullFacilityUpdates, pushRecords } from './remote';

export interface SyncResult {
  sent: number;
  facilityUpdates: number;
}

const SIMULATED_LATENCY_MS = 900;

export async function syncNow(): Promise<SyncResult> {
  await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));
  const db = await getDB();
  const at = new Date().toISOString();

  // ---- push ----
  const outbox = await db.getAll('outbox');
  const patients: Patient[] = [];
  const referrals: Referral[] = [];
  const followUps: FollowUp[] = [];
  for (const item of outbox) {
    if (item.entity === 'patient') {
      const p = await db.get('patients', item.entityId);
      if (p) patients.push(p);
    } else if (item.entity === 'referral') {
      const r = await db.get('referrals', item.entityId);
      if (r) referrals.push(r);
    } else {
      const f = await db.get('followups', item.entityId);
      if (f) followUps.push(f);
    }
  }
  await pushRecords(patients, referrals, followUps, at);

  // ---- pull facility-owned facts for every case on this device ----
  const localReferrals = await db.getAll('referrals');
  const pushedIds = new Set(referrals.map((r) => r.id));
  const { facility, events } = await pullFacilityUpdates(localReferrals.map((r) => r.id));

  let facilityUpdates = 0;
  const touched = new Set<string>(pushedIds);
  const tx = db.transaction(['patients', 'referrals', 'followups', 'facility_events', 'outbox', 'sync_events'], 'readwrite');
  for (const p of patients) await tx.objectStore('patients').put({ ...p, syncStatus: 'synced' });
  for (const f of followUps) await tx.objectStore('followups').put({ ...f, syncStatus: 'synced' });
  for (const r of localReferrals) {
    const remoteFacility = facility.get(r.id);
    const isPushed = pushedIds.has(r.id);
    const facilityChanged = !!remoteFacility && remoteFacility.updatedAt !== r.facility.updatedAt;
    if (!isPushed && !facilityChanged) continue;
    if (facilityChanged) {
      facilityUpdates++;
      touched.add(r.id);
    }
    await tx.objectStore('referrals').put({
      ...r,
      facility: remoteFacility ?? r.facility,
      syncStatus: 'synced',
      lastSyncedAt: isPushed ? at : r.lastSyncedAt,
    });
  }
  for (const e of events) await tx.objectStore('facility_events').put(e);
  await tx.objectStore('outbox').clear();

  const result: SyncResult = { sent: outbox.length, facilityUpdates };
  const event: SyncEvent = {
    id: uid('sync-'),
    at,
    direction: 'push',
    summary: JSON.stringify(result),
    referralIds: [...touched],
  };
  await tx.objectStore('sync_events').put(event);
  await tx.done;
  notifyChange();
  return result;
}
