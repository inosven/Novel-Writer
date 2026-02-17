import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { useConfigStore } from '../stores/configStore';

export default function Dashboard() {
  const navigate = useNavigate();
  const { projectPath, status, error, isLoading, initProject, openProject, selectFolder, listAvailableSkills, availableSkills, refreshStatus } = useProjectStore();
  const { project } = useConfigStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectPath, setNewProjectPath] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<string>('');
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);
  const [projectSkills, setProjectSkills] = useState<string[]>([]);
  const [isChangingSkill, setIsChangingSkill] = useState(false);

  // Load project skills when project is open
  useEffect(() => {
    if (projectPath && window.electronAPI?.skills?.list) {
      window.electronAPI.skills.list().then(skills => {
        setProjectSkills(skills);
      }).catch(console.error);
    }
  }, [projectPath]);

  const handleChangeSkill = async (skillName: string) => {
    if (!window.electronAPI?.skills?.use) return;
    setIsChangingSkill(true);
    try {
      await window.electronAPI.skills.use(skillName);
      await refreshStatus();
    } catch (error) {
      console.error('Failed to change skill:', error);
      alert('切换技能包失败: ' + String(error));
    } finally {
      setIsChangingSkill(false);
    }
  };

  const handleCreateProject = async () => {
    const path = await selectFolder();
    if (path) {
      setNewProjectPath(path);
      setIsLoadingSkills(true);
      await listAvailableSkills();
      setIsLoadingSkills(false);
      setIsCreating(true);
    }
  };

  const handleConfirmCreate = async () => {
    if (newProjectPath) {
      await initProject(newProjectPath, selectedSkill || undefined);
      setIsCreating(false);
      setNewProjectPath('');
      setSelectedSkill('');
    }
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewProjectPath('');
    setSelectedSkill('');
  };

  const handleOpenProject = async () => {
    const path = await selectFolder();
    if (path) {
      await openProject(path);
    }
  };

  const handleOpenRecent = async () => {
    if (project.lastPath) {
      await openProject(project.lastPath);
    }
  };

  // If project is open, show project dashboard
  if (projectPath && status) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-8">
          📊 项目概览
        </h1>

        {/* Project Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatusCard
            icon="📝"
            label="阶段"
            value={status.phase}
          />
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <div className="text-2xl mb-2">🎨</div>
            <p className="text-sm text-gray-500 dark:text-gray-400">技能包</p>
            {projectSkills.length > 0 ? (
              <select
                value={status.currentSkill || ''}
                onChange={(e) => handleChangeSkill(e.target.value)}
                disabled={isChangingSkill}
                className="mt-1 w-full text-sm font-semibold bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-800 dark:text-white"
              >
                <option value="">未选择</option>
                {projectSkills.map(skill => (
                  <option key={skill} value={skill}>{skill}</option>
                ))}
              </select>
            ) : (
              <p className="text-lg font-semibold text-gray-800 dark:text-white">无可用</p>
            )}
          </div>
          <StatusCard
            icon="👥"
            label="角色数"
            value={status.characterCount.toString()}
          />
          <StatusCard
            icon="📚"
            label="章节"
            value={`${status.completedChapters}/${status.chapterCount}`}
          />
        </div>

        {/* Quick Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
            快速操作
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ActionButton
              icon="🎯"
              label="开始规划"
              description="创建故事大纲"
              onClick={() => navigate('/planning')}
            />
            <ActionButton
              icon="✍️"
              label="继续写作"
              description="撰写下一章节"
              onClick={() => navigate('/writing')}
            />
            <ActionButton
              icon="👥"
              label="管理角色"
              description="创建或编辑角色"
              onClick={() => navigate('/characters')}
            />
            <ActionButton
              icon="📋"
              label="编辑大纲"
              description="查看或修改大纲"
              onClick={() => navigate('/outline')}
            />
          </div>
        </div>
      </div>
    );
  }

  // No project open - show welcome screen
  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-4">
        📚 欢迎使用 NovelWriter
      </h1>
      <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
        AI 驱动的小说创作助手，让创作更轻松
      </p>

      {/* Loading State */}
      {isLoading && (
        <div className="mb-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-blue-700 dark:text-blue-300">正在加载项目...</p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-left">
          <p className="font-semibold text-red-700 dark:text-red-300 mb-2">打开项目失败</p>
          <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {/* Create/Open Project */}
      <div className="space-y-4">
        {/* Recent Project */}
        {project.lastPath && (
          <button
            onClick={handleOpenRecent}
            className="w-full p-6 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-left"
          >
            <div className="flex items-center">
              <span className="text-2xl mr-4">📂</span>
              <div>
                <p className="font-semibold text-blue-700 dark:text-blue-300">
                  打开最近项目
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {project.lastPath}
                </p>
              </div>
            </div>
          </button>
        )}

        {/* Create New */}
        <button
          onClick={handleCreateProject}
          className="w-full p-6 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors text-left"
        >
          <div className="flex items-center">
            <span className="text-2xl mr-4">✨</span>
            <div>
              <p className="font-semibold text-green-700 dark:text-green-300">
                创建新项目
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                开始一个全新的小说创作
              </p>
            </div>
          </div>
        </button>

        {/* Open Existing */}
        <button
          onClick={handleOpenProject}
          className="w-full p-6 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
        >
          <div className="flex items-center">
            <span className="text-2xl mr-4">📁</span>
            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-300">
                打开已有项目
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                选择一个已存在的项目文件夹
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Create Project Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
              创建新项目
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              项目位置:
            </p>
            <p className="text-sm bg-gray-100 dark:bg-gray-700 p-2 rounded mb-4 break-all">
              {newProjectPath}
            </p>

            {/* Skill Selection */}
            <div className="mb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                选择技能包:
              </p>
              {isLoadingSkills ? (
                <p className="text-sm text-gray-500">加载中...</p>
              ) : (
                <div className="space-y-2">
                  <label className="flex items-center p-3 border border-gray-200 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                    <input
                      type="radio"
                      name="skill"
                      value="empty"
                      checked={selectedSkill === 'empty'}
                      onChange={(e) => setSelectedSkill(e.target.value)}
                      className="mr-3"
                    />
                    <div>
                      <p className="font-medium text-gray-700 dark:text-gray-300">空白项目</p>
                      <p className="text-xs text-gray-500">不复制任何技能包</p>
                    </div>
                  </label>
                  {availableSkills.map((skill) => (
                    <label
                      key={skill}
                      className="flex items-center p-3 border border-gray-200 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <input
                        type="radio"
                        name="skill"
                        value={skill}
                        checked={selectedSkill === skill}
                        onChange={(e) => setSelectedSkill(e.target.value)}
                        className="mr-3"
                      />
                      <div>
                        <p className="font-medium text-gray-700 dark:text-gray-300">{skill}</p>
                        <p className="text-xs text-gray-500">使用 {skill} 技能包模板</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex space-x-4">
              <button
                onClick={handleCancelCreate}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                取消
              </button>
              <button
                onClick={handleConfirmCreate}
                disabled={!selectedSkill}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
      <div className="text-2xl mb-2">{icon}</div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-semibold text-gray-800 dark:text-white">{value}</p>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  description,
  onClick,
}: {
  icon: string;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="p-4 text-left rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
    >
      <div className="text-2xl mb-2">{icon}</div>
      <p className="font-medium text-gray-800 dark:text-white">{label}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </button>
  );
}
