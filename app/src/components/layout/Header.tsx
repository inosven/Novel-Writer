import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';

export default function Header() {
  const { projectPath, status } = useProjectStore();
  const { lastSaved, isSaving } = useUIStore();

  return (
    <header className="h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6">
      {/* Left: Project info */}
      <div className="flex items-center space-x-4">
        {projectPath && status && (
          <>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              阶段: <span className="font-medium text-gray-700 dark:text-gray-200">{status.phase}</span>
            </span>
            {status.currentSkill && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                技能包: <span className="font-medium text-gray-700 dark:text-gray-200">{status.currentSkill}</span>
              </span>
            )}
          </>
        )}
      </div>

      {/* Right: Save status */}
      <div className="flex items-center space-x-4">
        {isSaving ? (
          <span className="text-sm text-blue-500 flex items-center">
            <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            保存中...
          </span>
        ) : lastSaved ? (
          <span className="text-sm text-green-500">
            💾 已保存 ({formatTime(lastSaved)})
          </span>
        ) : null}
      </div>
    </header>
  );
}

function formatTime(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return `${diff}秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  return date.toLocaleTimeString();
}
