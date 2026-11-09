/**
 * AES-GCM encryption for records at rest in IndexedDB.
 * The key is generated once and stored as a NON-EXTRACTABLE CryptoKey in IndexedDB;
 * raw key bytes never leave the browser. Falls back to plaintext only if WebCrypto
 * is unavailable (non-secure contexts), flagged via `plaintextFallback`.
 */
import { db } from './dexie';

const KEY_NAME = 'skillswap-master';

async function getKey(): Promise<CryptoKey | null> {
  try {
    const existing = await db.keys.get(KEY_NAME);
    if (existing?.key) return existing.key as CryptoKey;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await db.keys.put({ name: KEY_NAME, key });
    return key;
  } catch (err) {
    console.warn('[crypto] WebCrypto unavailable, records stored unencrypted', err);
    return null;
  }
}

const b64 = {
  encode: (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))),
  decode: (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer,
};

export interface SealedRecord {
  iv: string;
  ct: string;
  enc: boolean;
}

export async function seal(plaintext: string): Promise<SealedRecord> {
  const key = await getKey();
  if (!key) return { iv: '', ct: plaintext, enc: false };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { iv: b64.encode(iv.buffer), ct: b64.encode(ct), enc: true };
}

export async function unseal(record: SealedRecord): Promise<string> {
  if (!record.enc) return record.ct;
  const key = await getKey();
  if (!key) throw new Error('Encryption key unavailable');
  const iv = b64.decode(record.iv);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.slice(0) }, key, b64.decode(record.ct));
  return new TextDecoder().decode(pt);
}
