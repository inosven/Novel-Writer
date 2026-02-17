import { useState, useEffect, useCallback } from 'react';
import { loadFromIndexedDB, clearFromIndexedDB } from './useAutoSave';

interface RecoveryData<T> {
  data: T;
  timestamp: number;
  source: 'localStorage' | 'indexedDB';
}

interface RecoveryOptions<T> {
  key: string;
  maxAge?: number; // Maximum age in milliseconds (default: 24 hours)
  onRecover?: (data: T) => void;
  validate?: (data: T) => boolean;
}

interface RecoveryState<T> {
  hasRecoveryData: boolean;
  recoveryData: RecoveryData<T> | null;
  isRecovering: boolean;
  recover: () => void;
  dismiss: () => void;
  clear: () => Promise<void>;
}

/**
 * Hook for recovering auto-saved data after page reload or crash
 */
export function useRecovery<T>({
  key,
  maxAge = 24 * 60 * 60 * 1000, // 24 hours default
  onRecover,
  validate,
}: RecoveryOptions<T>): RecoveryState<T> {
  const [hasRecoveryData, setHasRecoveryData] = useState(false);
  const [recoveryData, setRecoveryData] = useState<RecoveryData<T> | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);

  // Check for recovery data on mount
  useEffect(() => {
    const checkRecoveryData = async () => {
      // Check localStorage first (faster)
      const localData = localStorage.getItem(`autosave_${key}`);
      const localTimestamp = localStorage.getItem(`autosave_${key}_timestamp`);

      if (localData && localTimestamp) {
        const timestamp = parseInt(localTimestamp, 10);
        const age = Date.now() - timestamp;

        if (age < maxAge) {
          try {
            const parsed = JSON.parse(localData) as T;

            // Validate if validator provided
            if (validate && !validate(parsed)) {
              console.warn('Recovery data validation failed');
            } else {
              setRecoveryData({
                data: parsed,
                timestamp,
                source: 'localStorage',
              });
              setHasRecoveryData(true);
              return;
            }
          } catch (e) {
            console.warn('Failed to parse localStorage recovery data:', e);
          }
        }
      }

      // Check IndexedDB as backup
      try {
        const idbData = await loadFromIndexedDB<T>(key);
        if (idbData) {
          // IndexedDB data includes timestamp in the stored object
          const stored = idbData as any;
          if (stored && typeof stored === 'object') {
            // Validate if validator provided
            if (validate && !validate(idbData)) {
              console.warn('Recovery data validation failed');
            } else {
              setRecoveryData({
                data: idbData,
                timestamp: Date.now(), // Use current time as we don't have exact timestamp
                source: 'indexedDB',
              });
              setHasRecoveryData(true);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load IndexedDB recovery data:', e);
      }
    };

    checkRecoveryData();
  }, [key, maxAge, validate]);

  const recover = useCallback(() => {
    if (!recoveryData) return;

    setIsRecovering(true);
    try {
      if (onRecover) {
        onRecover(recoveryData.data);
      }
      setHasRecoveryData(false);
    } finally {
      setIsRecovering(false);
    }
  }, [recoveryData, onRecover]);

  const dismiss = useCallback(() => {
    setHasRecoveryData(false);
    setRecoveryData(null);
  }, []);

  const clear = useCallback(async () => {
    // Clear localStorage
    localStorage.removeItem(`autosave_${key}`);
    localStorage.removeItem(`autosave_${key}_timestamp`);

    // Clear IndexedDB
    await clearFromIndexedDB(key);

    setHasRecoveryData(false);
    setRecoveryData(null);
  }, [key]);

  return {
    hasRecoveryData,
    recoveryData,
    isRecovering,
    recover,
    dismiss,
    clear,
  };
}

/**
 * Format timestamp for display
 */
export function formatRecoveryTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) {
    return '刚刚';
  } else if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} 分钟前`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} 小时前`;
  } else {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

/**
 * Recovery dialog component (use with Tailwind CSS)
 */
export interface RecoveryDialogProps<T> {
  recoveryData: RecoveryData<T> | null;
  onRecover: () => void;
  onDismiss: () => void;
  title?: string;
  description?: string;
}

export function RecoveryDialog<T>({
  recoveryData,
  onRecover,
  onDismiss,
  title = '发现未保存的数据',
  description = '检测到上次会话中有未保存的数据，是否恢复？',
}: RecoveryDialogProps<T>) {
  if (!recoveryData) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-start mb-4">
          <span className="text-3xl mr-3">💾</span>
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
              {title}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {description}
            </p>
          </div>
        </div>

        <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">保存时间:</span>
            <span className="text-gray-800 dark:text-white">
              {formatRecoveryTime(recoveryData.timestamp)}
            </span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-600 dark:text-gray-400">来源:</span>
            <span className="text-gray-800 dark:text-white">
              {recoveryData.source === 'localStorage' ? '本地缓存' : '备份存储'}
            </span>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onDismiss}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            放弃
          </button>
          <button
            onClick={onRecover}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            恢复数据
          </button>
        </div>
      </div>
    </div>
  );
}
