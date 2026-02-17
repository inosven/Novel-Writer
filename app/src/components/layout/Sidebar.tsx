import { NavLink } from 'react-router-dom';
import { useProjectStore } from '../../stores/projectStore';

const navItems = [
  { path: '/', label: '首页', icon: '🏠', requiresProject: false },
  { path: '/planning', label: '规划', icon: '🎯', requiresProject: true },
  { path: '/outline', label: '大纲', icon: '📋', requiresProject: true },
  { path: '/characters', label: '角色', icon: '👥', requiresProject: true },
  { path: '/writing', label: '写作', icon: '✍️', requiresProject: true },
  { path: '/settings', label: '设置', icon: '⚙️', requiresProject: false },
];

export default function Sidebar() {
  const { projectPath, projectName } = useProjectStore();

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-bold text-gray-800 dark:text-white">
          📚 NovelWriter
        </h1>
        {projectPath && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
            {projectName || '未命名项目'}
          </p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isDisabled = item.requiresProject && !projectPath;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 rounded-lg transition-colors ${
                  isDisabled
                    ? 'opacity-50 cursor-not-allowed pointer-events-none'
                    : isActive
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`
              }
            >
              <span className="mr-3 text-lg">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        <p>AI 小说创作助手 v1.0.0</p>
      </div>
    </aside>
  );
}
