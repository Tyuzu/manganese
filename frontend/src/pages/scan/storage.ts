import type { SavedSession } from './types';

const DB_NAME = 'OmniScanStudio';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const SESSION_KEY = 'current_stack';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSessionToIdb(session: SavedSession): Promise<void> {
  let db: IDBDatabase | undefined;

  try {
    db = await openDb();

    await new Promise<void>((resolve, reject) => {
      const transaction = db!.transaction(STORE_NAME, 'readwrite');

      transaction.objectStore(STORE_NAME).put(session, SESSION_KEY);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch (error) {
    console.warn('Scan session persistence failed:', error);
  } finally {
    db?.close();
  }
}

export async function loadSessionFromIdb(): Promise<SavedSession | null> {
  let db: IDBDatabase | undefined;

  try {
    db = await openDb();

    return await new Promise((resolve, reject) => {
      const transaction = db!.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(SESSION_KEY);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Unable to restore scan session:', error);
    return null;
  } finally {
    db?.close();
  }
}
