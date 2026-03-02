import { useState, useEffect } from 'react';
import { useProjectStore } from '../stores/projectStore';

interface Chapter {
  index: number;
  title: string;
  summary: string;
  status: 'pending' | 'writing' | 'completed';
  characters: string[];
  targetWordCount: number;
}

interface Outline {
  title: string;
  premise: string;
  theme: string;
  totalChapters: number;
  targetWordCount: number;
  acts: {
    name: string;
    description: string;
    chapters: number[];
  }[];
  chapters: Chapter[];
}

export default function OutlinePage() {
  const { projectPath } = useProjectStore();

  const [outline, setOutline] = useState<Outline | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [isEditingChapter, setIsEditingChapter] = useState(false);
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [historyVersions, setHistoryVersions] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showRefineModal, setShowRefineModal] = useState(false);
  const [refineInput, setRefineInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  useEffect(() => {
    if (projectPath) {
      loadOutline();
    }
  }, [projectPath]);

  const loadOutline = async () => {
    if (!window.electronAPI) return;

    // Helper function to create demo data
    const createDemoOutline = (): Outline => ({
      title: '许都迷局',
      premise: '东汉末年，一个小吏无意卷入宫廷阴谋，在权谋与悬疑中寻找真相',
      theme: '权谋悬疑',
      totalChapters: 30,
      targetWordCount: 200000,
      acts: [
        { name: '第一幕: 入局', description: '主角进入许都，开始察觉异常', chapters: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
        { name: '第二幕: 追查', description: '深入调查，发现惊人真相', chapters: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] },
        { name: '第三幕: 破局', description: '真相大白，做出抉择', chapters: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29] },
      ],
      chapters: Array.from({ length: 10 }, (_, i) => ({
        index: i,
        title: `第${i + 1}章`,
        summary: `章节${i + 1}的概要内容...`,
        status: i < 2 ? 'completed' : i === 2 ? 'writing' : 'pending',
        characters: ['陈平', '曹操'].slice(0, (i % 3) + 1),
        targetWordCount: 4000,
      })),
    });

    try {
      const data = await window.electronAPI.outline.get();
      console.log('Outline data received:', data);

      // Strict validation: must have title (string) and chapters (array)
      // Also explicitly reject PlanningSession objects (which have 'phase' key)
      const isValidOutline = data &&
        typeof data === 'object' &&
        typeof data.title === 'string' &&
        Array.isArray(data.chapters) &&
        !('phase' in data) &&  // Reject PlanningSession objects
        !('userIdea' in data); // Additional check for PlanningSession

      if (isValidOutline) {
        // Transform to match local Outline interface
        // Ensure all rendered values are primitives, not objects
        setOutline({
          title: String(data.title || '未命名'),
          premise: String(data.premise || ''),
          theme: String(data.theme || ''),
          totalChapters: Number(data.chapters?.length || 0),
          targetWordCount: Number(data.targetWordCount || 50000),
          acts: Array.isArray(data.acts) ? data.acts.map((act: any) => ({
            name: String(act?.name || ''),
            description: String(act?.description || ''),
            chapters: Array.isArray(act?.chapters) ? act.chapters.map(Number) : [],
          })) : [
            { name: '第一幕', description: '开篇', chapters: data.chapters?.slice(0, Math.ceil(data.chapters.length / 3)).map((_: unknown, i: number) => i) || [] },
            { name: '第二幕', description: '发展', chapters: data.chapters?.slice(Math.ceil(data.chapters.length / 3), Math.ceil(data.chapters.length * 2 / 3)).map((_: unknown, i: number) => i + Math.ceil(data.chapters.length / 3)) || [] },
            { name: '第三幕', description: '结局', chapters: data.chapters?.slice(Math.ceil(data.chapters.length * 2 / 3)).map((_: unknown, i: number) => i + Math.ceil(data.chapters.length * 2 / 3)) || [] },
          ],
          chapters: (data.chapters || []).map((ch: any, idx: number) => ({
            index: Number(ch?.index ?? idx),
            title: String(ch?.title || `第${idx + 1}章`),
            summary: String(ch?.summary || ''),
            status: (ch?.status === 'completed' || ch?.status === 'writing' || ch?.status === 'pending')
              ? ch.status
              : 'pending',
            characters: Array.isArray(ch?.characters) ? ch.characters.map(String) : [],
            targetWordCount: Number(ch?.targetWordCount || 4000),
          })),
        });

        try {
          const history = await window.electronAPI.outline.getHistory();
          setHistoryVersions(Array.isArray(history) ? history : []);
        } catch (historyError) {
          console.error('Failed to load history:', historyError);
          setHistoryVersions([]);
        }
        return;
      }

      // If data is null or invalid, use demo data
      console.log('No valid outline data (or received non-outline object), using demo data');
      setOutline(createDemoOutline());
    } catch (error) {
      console.error('Failed to load outline:', error);
      setOutline(createDemoOutline());
    }
  };

  const handleSaveChapter = async () => {
    if (!editingChapter || !outline || !window.electronAPI) return;
    try {
      const newChapters = [...outline.chapters];
      newChapters[editingChapter.index] = editingChapter;
      await window.electronAPI.outline.update({
        ...outline,
        chapters: newChapters,
      });
      setOutline({
        ...outline,
        chapters: newChapters,
      });
      setIsEditingChapter(false);
      setSelectedChapter(editingChapter);
    } catch (error) {
      console.error('Failed to save chapter:', error);
    }
  };

  const handleAddChapter = async () => {
    if (!outline || !window.electronAPI) return;
    const newChapter: Chapter = {
      index: outline.chapters.length,
      title: `第${outline.chapters.length + 1}章`,
      summary: '',
      status: 'pending',
      characters: [],
      targetWordCount: 4000,
    };
    try {
      const newChapters = [...outline.chapters, newChapter];
      await window.electronAPI.outline.update({
        ...outline,
        chapters: newChapters,
        totalChapters: newChapters.length,
      });
      setOutline({
        ...outline,
        chapters: newChapters,
        totalChapters: newChapters.length,
      });
    } catch (error) {
      console.error('Failed to add chapter:', error);
    }
  };

  const handleDeleteChapter = async (index: number) => {
    if (!outline || !window.electronAPI) return;
    const chapter = outline.chapters[index];
    if (chapter.status === 'completed') {
      if (!confirm(`第${index + 1}章已完成，确定要删除吗？`)) return;
    } else if (!confirm(`确定要删除第${index + 1}章吗？`)) {
      return;
    }
    try {
      const newChapters = outline.chapters
        .filter((_, i) => i !== index)
        .map((ch, i) => ({ ...ch, index: i }));
      await window.electronAPI.outline.update({
        ...outline,
        chapters: newChapters,
        totalChapters: newChapters.length,
      });
      setOutline({
        ...outline,
        chapters: newChapters,
        totalChapters: newChapters.length,
      });
      if (selectedChapter?.index === index) {
        setSelectedChapter(null);
      }
    } catch (error) {
      console.error('Failed to delete chapter:', error);
    }
  };

  const handleRefineOutline = async () => {
    if (!refineInput.trim() || !window.electronAPI) return;
    setIsRefining(true);
    try {
      const refined = await window.electronAPI.outline.refine(refineInput.trim());
      if (refined) {
        // Reload the outline to show updated data
        await loadOutline();
        setShowRefineModal(false);
        setRefineInput('');
        alert('大纲优化完成！');
      }
    } catch (error: any) {
      console.error('Failed to refine outline:', error);
      alert(`优化失败: ${error?.message || '未知错误'}`);
    } finally {
      setIsRefining(false);
    }
  };

  const getStatusBadge = (status: Chapter['status']) => {
    switch (status) {
      case 'completed':
        return { icon: '✅', text: '完成', class: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
      case 'writing':
        return { icon: '📝', text: '进行中', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
      case 'pending':
        return { icon: '⏳', text: '待写', class: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' };
    }
  };

  if (!projectPath) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-4">
            请先打开或创建一个项目
          </p>
        </div>
      </div>
    );
  }

  if (!outline) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
              📋 {outline.title}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {outline.premise}
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              📜 历史版本
            </button>
            <button className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
              📤 导出
            </button>
            <button
              onClick={() => setShowRefineModal(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              🤖 AI 优化建议
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <span className="text-gray-500 dark:text-gray-400">主题</span>
            <p className="font-medium text-gray-800 dark:text-white">{outline.theme}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <span className="text-gray-500 dark:text-gray-400">章节数</span>
            <p className="font-medium text-gray-800 dark:text-white">{outline.totalChapters} 章</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <span className="text-gray-500 dark:text-gray-400">目标字数</span>
            <p className="font-medium text-gray-800 dark:text-white">{(outline.targetWordCount / 10000).toFixed(0)} 万字</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <span className="text-gray-500 dark:text-gray-400">完成进度</span>
            <p className="font-medium text-gray-800 dark:text-white">
              {outline.chapters.filter(c => c.status === 'completed').length} / {outline.chapters.length} 章
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Chapter List */}
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 dark:text-white">章节大纲</h2>
            <button
              onClick={handleAddChapter}
              className="px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600"
            >
              + 添加章节
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Group by acts */}
            {(outline.acts || []).map((act) => (
              <div key={act.name} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50">
                  <h3 className="font-medium text-gray-800 dark:text-white">{act.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{act.description}</p>
                </div>

                <table className="w-full">
                  <thead className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/30">
                    <tr>
                      <th className="px-4 py-2 text-left">章节</th>
                      <th className="px-4 py-2 text-left">标题</th>
                      <th className="px-4 py-2 text-center">状态</th>
                      <th className="px-4 py-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {act.chapters
                      .filter(idx => outline.chapters[idx])
                      .map((chapterIdx) => {
                        const chapter = outline.chapters[chapterIdx];
                        const badge = getStatusBadge(chapter.status);
                        return (
                          <tr
                            key={chapter.index}
                            onClick={() => setSelectedChapter(chapter)}
                            className={`border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${
                              selectedChapter?.index === chapter.index ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                            }`}
                          >
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                              {chapter.index + 1}
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-800 dark:text-white text-sm">
                                {chapter.title}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                                {chapter.summary}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${badge.class}`}>
                                {badge.icon} {badge.text}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingChapter({ ...chapter });
                                  setIsEditingChapter(true);
                                }}
                                className="text-blue-500 hover:text-blue-600 text-sm mr-2"
                              >
                                编辑
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteChapter(chapter.index);
                                }}
                                className="text-red-500 hover:text-red-600 text-sm"
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        {/* Chapter Detail */}
        {selectedChapter && (
          <div className="w-80 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 overflow-y-auto">
            <h3 className="font-semibold text-gray-800 dark:text-white mb-4">
              📖 {selectedChapter.title}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">概要</label>
                <p className="text-sm text-gray-800 dark:text-white mt-1">
                  {selectedChapter.summary || '暂无概要'}
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">出场角色</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedChapter.characters.length > 0 ? (
                    selectedChapter.characters.map((char) => (
                      <span
                        key={char}
                        className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-sm text-gray-700 dark:text-gray-300"
                      >
                        {char}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-500">未设置</span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">目标字数</label>
                <p className="text-sm text-gray-800 dark:text-white mt-1">
                  {selectedChapter.targetWordCount.toLocaleString()} 字
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">状态</label>
                <p className="text-sm mt-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full ${getStatusBadge(selectedChapter.status).class}`}>
                    {getStatusBadge(selectedChapter.status).icon} {getStatusBadge(selectedChapter.status).text}
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Chapter Modal */}
      {isEditingChapter && editingChapter && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
              编辑章节
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  标题
                </label>
                <input
                  type="text"
                  value={editingChapter.title}
                  onChange={(e) => setEditingChapter({ ...editingChapter, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  概要
                </label>
                <textarea
                  value={editingChapter.summary}
                  onChange={(e) => setEditingChapter({ ...editingChapter, summary: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  出场角色（逗号分隔）
                </label>
                <input
                  type="text"
                  value={editingChapter.characters.join(', ')}
                  onChange={(e) => setEditingChapter({
                    ...editingChapter,
                    characters: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                  })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  目标字数
                </label>
                <input
                  type="number"
                  value={editingChapter.targetWordCount}
                  onChange={(e) => setEditingChapter({
                    ...editingChapter,
                    targetWordCount: parseInt(e.target.value) || 4000,
                  })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
            </div>

            <div className="flex space-x-4 mt-6">
              <button
                onClick={() => {
                  setIsEditingChapter(false);
                  setEditingChapter(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                取消
              </button>
              <button
                onClick={handleSaveChapter}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refine Modal */}
      {showRefineModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
              🤖 AI 优化大纲
            </h2>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              告诉 AI 你想如何优化大纲，例如：为每章添加出场角色、调整章节顺序、补充关键事件等。
            </p>

            <div className="space-y-3 mb-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">快捷指令：</p>
              <div className="flex flex-wrap gap-2">
                {[
                  '请为每章添加出场角色',
                  '补充每章的关键事件',
                  '优化章节标题使其更吸引人',
                  '检查情节逻辑是否有漏洞',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setRefineInput(suggestion)}
                    className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={refineInput}
              onChange={(e) => setRefineInput(e.target.value)}
              placeholder="输入你的优化需求..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white resize-none mb-4"
              disabled={isRefining}
            />

            <div className="flex space-x-4">
              <button
                onClick={() => {
                  setShowRefineModal(false);
                  setRefineInput('');
                }}
                disabled={isRefining}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleRefineOutline}
                disabled={isRefining || !refineInput.trim()}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center"
              >
                {isRefining ? (
                  <>
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    AI 优化中...
                  </>
                ) : (
                  '开始优化'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
              📜 历史版本
            </h2>

            {historyVersions.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {historyVersions.map((version, idx) => (
                  <button
                    key={idx}
                    className="w-full p-3 text-left border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <p className="font-medium text-gray-800 dark:text-white">版本 {idx + 1}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{version}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                暂无历史版本
              </p>
            )}

            <button
              onClick={() => setShowHistory(false)}
              className="w-full mt-4 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
