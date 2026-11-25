import type { Question } from '../types';

const DB_NAME = 'gate27_pyq_cache';
const DB_VERSION = 1;
const STORE_NAME = 'gater_dataset';
const DATASET_KEY = 'questions_v1';

export interface CachedGateRDataset {
  key: string;
  syncedAt: string;
  sourceUrl: string;
  count: number;
  questions: Question[];
}

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

export async function readGateRCache(): Promise<CachedGateRDataset | null> {
  try {
    const db = await openCacheDb();
    return await new Promise<CachedGateRDataset | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(DATASET_KEY);
      getReq.onsuccess = () => {
        const res = getReq.result as CachedGateRDataset | undefined;
        resolve(res && Array.isArray(res.questions) ? res : null);
      };
      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

export async function writeGateRCache(payload: Omit<CachedGateRDataset, 'key'>): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ ...payload, key: DATASET_KEY });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Gracefully ignore IndexedDB quota/privacy mode failures
  }
}

export async function clearGateRCache(): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(DATASET_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Ignore
  }
}

export async function getGateRCacheSizeBytes(): Promise<{ bytes: number; count: number; syncedAt: string | null }> {
  const cached = await readGateRCache();
  if (!cached) {
    return { bytes: 0, count: 0, syncedAt: null };
  }
  try {
    const serialized = JSON.stringify(cached);
    const bytes = typeof Blob !== 'undefined' ? new Blob([serialized]).size : serialized.length * 2;
    return {
      bytes,
      count: cached.count ?? cached.questions.length,
      syncedAt: cached.syncedAt ?? null,
    };
  } catch {
    return { bytes: 0, count: cached.questions.length, syncedAt: cached.syncedAt ?? null };
  }
}
