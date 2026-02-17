import { useEffect, useRef, useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';

interface AutoSaveOptions {
  key: string;
  data: any;
  interval?: number;
  onSave?: (data: any) => Promise<void>;
  enabled?: boolean;
}

/**
 * Hook for automatic data saving with debounce
 * Saves to localStorage and optionally to backend
 */
export function useAutoSave({
  key,
  data,
  interval = 2000,
  onSave,
  enabled = true,
}: AutoSaveOptions) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>('');
  const { setSaveStatus, setLastSaved } = useUIStore();

  const save = useCallback(async () => {
    if (!enabled) return;

    const serialized = JSON.stringify(data);

    // Skip if data hasn't changed
    if (serialized === lastSavedRef.current) return;

    try {
      setSaveStatus('saving');

      // Save to localStorage
      localStorage.setItem(`autosave_${key}`, serialized);
      localStorage.setItem(`autosave_${key}_timestamp`, Date.now().toString());

      // Save to IndexedDB for larger data (backup)
      try {
        await saveToIndexedDB(key, data);
      } catch (e) {
        console.warn('IndexedDB save failed, using localStorage only:', e);
      }

      // Call optional backend save
      if (onSave) {
        await onSave(data);
      }

      lastSavedRef.current = serialized;
      setSaveStatus('saved');
      setLastSaved(new Date());
    } catch (error) {
      console.error('Auto-save failed:', error);
      setSaveStatus('error');
    }
  }, [data, key, enabled, onSave, setSaveStatus, setLastSaved]);

  // Debounced save on data change
  useEffect(() => {
    if (!enabled) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(save, interval);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [data, interval, save, enabled]);

  // Save before page unload
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const serialized = JSON.stringify(data);
      if (serialized !== lastSavedRef.current) {
        // Synchronous save to localStorage
        localStorage.setItem(`autosave_${key}`, serialized);
        localStorage.setItem(`autosave_${key}_timestamp`, Date.now().toString());

        // Show browser warning
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [data, key, enabled]);

  // Save when visibility changes (tab switch)
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        save();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [save, enabled]);

  // Manual save function
  const forceSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    await save();
  }, [save]);

  return { forceSave };
}

// IndexedDB helper functions
const DB_NAME = 'NovelWriterAutoSave';
const STORE_NAME = 'autosave';

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });
}

async function saveToIndexedDB(key: string, data: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.put({
      key,
      data,
      timestamp: Date.now(),
    });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();

    transaction.oncomplete = () => db.close();
  });
}

export async function loadFromIndexedDB<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result?.data ?? null);
      };

      transaction.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

export async function clearFromIndexedDB(key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();

      transaction.oncomplete = () => db.close();
    });
  } catch {
    // Ignore errors
  }
}
