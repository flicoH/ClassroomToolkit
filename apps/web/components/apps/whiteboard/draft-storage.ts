import type { LocalDraft } from "./types";

const DATABASE_NAME = "classroom-toolkit";
const DATABASE_VERSION = 1;
const STORE_NAME = "whiteboard-drafts";

interface StoredDraft extends LocalDraft {
  id: string;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地草稿数据库"));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function runTransaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDatabase().then(
    database =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const request = action(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("本地草稿操作失败"));
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error("本地草稿事务失败"));
        };
      })
  );
}

/** IndexedDB 适合保存包含图片的较大结构化草稿，且不会同步阻塞主线程。 */
export async function saveWhiteboardDraft(id: string, draft: LocalDraft) {
  await runTransaction("readwrite", store => store.put({ id, ...draft } satisfies StoredDraft));
}

export async function loadWhiteboardDraft(id: string) {
  const stored = await runTransaction<StoredDraft | undefined>("readonly", store => store.get(id));
  if (!stored) return undefined;
  return { savedAt: stored.savedAt, title: stored.title, pages: stored.pages };
}

export async function deleteWhiteboardDraft(id: string) {
  await runTransaction("readwrite", store => store.delete(id));
}
