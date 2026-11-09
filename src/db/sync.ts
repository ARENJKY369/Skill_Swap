/**
 * Outbox sync engine. Every local write is queued in IndexedDB first, then
 * flushed to the API when online with exponential backoff (max 5 attempts).
 * Last-write-wins: the server applies patches in arrival order; the client's
 * clientUpdatedAt is accepted and stored as updated_at.
 */
import { db, type OutboxEntry } from './dexie';
import { seal, unseal } from './crypto';
import { apiFetch, ApiError } from '../api/client';
import { useAppStore } from '../store/appStore';

const MAX_ATTEMPTS = 5;

export async function enqueue(path: string, method: OutboxEntry['method'], body: unknown): Promise<void> {
  const sealed = await seal(JSON.stringify(body));
  await db.outbox.add({
    path,
    method,
    body: JSON.stringify(sealed),
    createdAt: Date.now(),
    attempts: 0,
    nextRetryAt: Date.now(),
  });
  await refreshPendingCount();
  void flushOutbox();
}

export async function refreshPendingCount(): Promise<void> {
  const n = await db.outbox.count();
  const store = useAppStore.getState();
  store.setPendingOutbox(n);
  if (!useAppStore.getState().online) store.setSyncState('offline');
  else store.setSyncState(n > 0 ? 'pending' : 'synced');
}

let flushing = false;

export async function flushOutbox(): Promise<{ synced: number; failed: number }> {
  if (flushing) return { synced: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    useAppStore.getState().setSyncState('offline');
    return { synced: 0, failed: 0 };
  }
  flushing = true;
  let synced = 0;
  let failed = 0;
  try {
    const due = await db.outbox.where('nextRetryAt').belowOrEqual(Date.now()).sortBy('createdAt');
    for (const entry of due) {
      try {
        const sealed = JSON.parse(entry.body) as Parameters<typeof unseal>[0];
        const body = JSON.parse(await unseal(sealed)) as unknown;
        await apiFetch(entry.path, { method: entry.method, body });
        await db.outbox.delete(entry.id!);
        synced += 1;
      } catch (err) {
        const attempts = entry.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          failed += 1;
          // Give up but keep the entry pinned for manual inspection in devtools.
          await db.outbox.update(entry.id!, { attempts, lastError: String(err), nextRetryAt: Date.now() + 86_400_000 });
        } else {
          const backoff = Math.min(2 ** attempts * 1000, 60_000);
          await db.outbox.update(entry.id!, {
            attempts,
            lastError: err instanceof ApiError ? err.message : String(err),
            nextRetryAt: Date.now() + backoff,
          });
        }
      }
    }
  } finally {
    flushing = false;
    await refreshPendingCount();
  }
  return { synced, failed };
}

/** Save profile patch: local-first, then queued for the server. */
export async function saveProfileLocalFirst(patch: Record<string, unknown>): Promise<void> {
  const sealed = await seal(JSON.stringify(patch));
  await db.profileEdits.add({ payload: JSON.stringify(sealed), updatedAt: new Date().toISOString(), synced: 0 });
  await enqueue('/api/users/me', 'PATCH', patch);
}

/** Clear every byte of local data (GDPR "clear local data" flow). */
export async function clearLocalData(): Promise<void> {
  await db.delete();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* storage may be unavailable */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushOutbox());
}
