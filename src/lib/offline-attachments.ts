/**
 * Almacén IndexedDB para adjuntos de tickets en cola offline.
 * Los Blobs no caben en localStorage; se referencian por draftId.
 */

const DB_NAME = "ccmgc-offline-attachments";
const STORE = "files";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

function key(draftId: string, index: number): string {
  return `${draftId}:${index}`;
}

export async function saveAttachments(draftId: string, files: File[]): Promise<void> {
  if (!files.length || typeof indexedDB === "undefined") return;
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  await Promise.all(
    files.map(
      (file, i) =>
        new Promise<void>((resolve, reject) => {
          const req = store.put(file, key(draftId, i));
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        }),
    ),
  );
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadAttachments(draftId: string): Promise<File[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  const files: File[] = [];
  for (let i = 0; ; i++) {
    const file = await new Promise<File | undefined>((resolve, reject) => {
      const req = store.get(key(draftId, i));
      req.onsuccess = () => resolve(req.result as File | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!file) break;
    files.push(file);
  }
  db.close();
  return files;
}

export async function clearAttachments(draftId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const files = await loadAttachments(draftId);
  if (!files.length) return;
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  await Promise.all(
    files.map(
      (_, i) =>
        new Promise<void>((resolve, reject) => {
          const req = store.delete(key(draftId, i));
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        }),
    ),
  );
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
