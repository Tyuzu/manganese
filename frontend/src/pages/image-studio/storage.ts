import type { StoredProject } from './types';

export class ProjectDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!("indexedDB" in window)) {
      return Promise.reject(new Error("IndexedDB is unavailable."));
    }

    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("image-studio-projects", 1);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains("projects")) {
          db.createObjectStore("projects", {
            keyPath: "id",
          });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(
        request.error || new Error("Could not open project database.")
      );
    });

    return this.dbPromise;
  }

  async put(project: StoredProject): Promise<void> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction("projects", "readwrite");

      transaction.objectStore("projects").put(project);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(
        transaction.error || new Error("Project save failed.")
      );
      transaction.onabort = () => reject(
        transaction.error || new Error("Project save was aborted.")
      );
    });
  }

  async get(id: string): Promise<StoredProject | undefined> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const request = db
        .transaction("projects", "readonly")
        .objectStore("projects")
        .get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(
        request.error || new Error("Could not load project.")
      );
    });
  }

  async all(): Promise<StoredProject[]> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const request = db
        .transaction("projects", "readonly")
        .objectStore("projects")
        .getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(
        request.error || new Error("Could not list projects.")
      );
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction("projects", "readwrite");

      transaction.objectStore("projects").delete(id);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(
        transaction.error || new Error("Could not delete project.")
      );
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction("projects", "readwrite");

      transaction.objectStore("projects").clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(
        transaction.error || new Error("Could not clear saved projects.")
      );
      transaction.onabort = () => reject(
        transaction.error || new Error("Saved project clear was aborted.")
      );
    });
  }
}
