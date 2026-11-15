export function openProjectDatabase(
  projectDatabase: string,
  projectStore: string,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    const request = window.indexedDB.open(
      projectDatabase,
      1,
    );

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(projectStore)) {
        db.createObjectStore(projectStore, {
          keyPath: 'id',
        });
      }
    };

    request.onsuccess = () => resolve(request.result);

    request.onerror = () => {
      reject(
        request.error ??
          new Error('Could not open the project database.'),
      );
    };
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not convert the video file.'));
      }
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('File reading failed.'));
    };

    reader.readAsDataURL(file);
  });
}

export async function dataUrlToFile(
  dataUrl: string,
  fileName: string,
  fileType?: string | null,
): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  return new File(
    [blob],
    fileName,
    {
      type: fileType || blob.type || 'video/mp4',
    },
  );
}
