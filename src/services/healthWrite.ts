import {deleteRecordsByUuids, initialize, insertRecords, requestPermission} from 'react-native-health-connect';
import {getFoodEntry, onFoodChange, type FoodChange} from '../db/food';
import {useSettingsStore} from '../store/settingsStore';
import {diag} from './diag';
import type {FoodEntry} from '../types';

/*
 * Optional write-back (plan 2026-09-17 T6): food entries with kcal appear in
 * Health Connect as Nutrition records. Health Connect upserts on
 * clientRecordId, so an edited entry replaces its record as long as the
 * version grows — the wall clock does that. Failures only ever reach diag():
 * logging food must not depend on Health Connect.
 */

const clientId = (id: number) => `kelomit-food-${id}`;

/** The Nutrition record for an entry; null when there is nothing to say (no kcal). */
export function nutritionRecordFor(entry: Pick<FoodEntry, 'id' | 'eaten_at' | 'name' | 'kcal'>, version: number) {
  if (entry.kcal == null) { return null; }
  const start = new Date(entry.eaten_at);
  return {
    recordType: 'Nutrition' as const,
    startTime: start.toISOString(),
    // Health Connect rejects zero-length intervals.
    endTime: new Date(start.getTime() + 60000).toISOString(),
    name: entry.name,
    mealType: 0,
    energy: {value: entry.kcal, unit: 'kilocalories' as const},
    metadata: {clientRecordId: clientId(entry.id), clientRecordVersion: version, recordingMethod: 3},
  };
}

/** Ask for the write permission. True when granted. */
export async function enableFoodWriteBack(): Promise<boolean> {
  if (!(await initialize())) { return false; }
  const granted = await requestPermission([{accessType: 'write', recordType: 'Nutrition'}]);
  return granted.some(p => p.accessType === 'write' && p.recordType === 'Nutrition');
}

async function handle(change: FoodChange): Promise<void> {
  if (!useSettingsStore.getState().health_write_food) { return; }
  if (!(await initialize())) { return; }
  const entry = change.kind === 'upsert' ? await getFoodEntry(change.id) : null;
  const record = entry ? nutritionRecordFor(entry, Date.now()) : null;
  if (record) {
    await insertRecords([record]);
  } else {
    // Deleted, or edited down to "no kcal": the mirrored record goes too.
    await deleteRecordsByUuids('Nutrition', [], [clientId(change.id)]);
  }
}

let started = false;

/** Called once at app start. */
export function startFoodWriteBack(): void {
  if (started) { return; }
  started = true;
  onFoodChange(change => {
    handle(change).catch(e => diag('health.write.fail', String(e)));
  });
}
