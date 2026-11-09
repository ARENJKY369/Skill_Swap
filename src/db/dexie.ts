import Dexie, { type Table } from 'dexie';

/** Cached authenticated profile (mirrors server; treated as last-known-good when offline). */
export interface LocalSession {
  id: string; // always 'me'
  payload: string; // sealed JSON (see crypto.seal)
  updatedAt: string;
}

/** Encrypted drafts — scheduler messages, unsent notes, request forms. */
export interface DraftRecord {
  id: string; // e.g. 'session-invite'
  payload: string; // sealed JSON
  updatedAt: string;
}

export interface ProfileEdit {
  id?: number;
  payload: string; // sealed JSON of pending profile patch
  updatedAt: string;
  synced: 0 | 1;
}

export interface Preference {
  key: string;
  value: string;
}

export interface OutboxEntry {
  id?: number;
  path: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body: string; // sealed JSON
  createdAt: number;
  attempts: number;
  nextRetryAt: number;
  lastError?: string;
}

export interface KeyRecord {
  name: string;
  key: CryptoKey;
}

export class SkillSwapDB extends Dexie {
  session!: Table<LocalSession, string>;
  drafts!: Table<DraftRecord, string>;
  profileEdits!: Table<ProfileEdit, number>;
  preferences!: Table<Preference, string>;
  outbox!: Table<OutboxEntry, number>;
  keys!: Table<KeyRecord, string>;

  constructor() {
    super('skillswap');
    this.version(1).stores({
      session: 'id',
      drafts: 'id, updatedAt',
      profileEdits: '++id, updatedAt, synced',
      preferences: 'key',
      outbox: '++id, nextRetryAt, createdAt',
      keys: 'name',
    });
  }
}

export const db = new SkillSwapDB();
