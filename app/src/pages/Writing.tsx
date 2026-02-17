import { useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '../stores/projectStore';

interface Chapter {
  index: number;
  title: string;
  status: 'pending' | 'writing' | 'completed';
  wordCount: number;
}

interface ChapterOutline {
  title: string;
  summary: string;
  characters: string[];
  targetWordCount: number;
}

export default function Writing() {
  const { projectPath, status } = useProjectStore();

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<number>(0);
  const [chapterOutline, setChapterOutline] = useState<ChapterOutline | null>(null);
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    if (projectPath) {
      loadChapters();
    }
  }, [projectPath]);

  useEffect(() => {
    if (selectedChapter >= 0) {
      loadChapterContent(selectedChapter);
    }
  }, [selectedChapter]);

  // Auto-save
  useEffect(() => {
    const timer = setTimeout(() => {
      if (content && selectedChapter >= 0) {
        saveDraft();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [content]);

  const loadChapters = async () => {
    if (!window.electronAPI) return;
    try {
      const chapterList = await window.electronAPI.outline.get();
      if (chapterList?.chapters) {
        setChapters(chapterList.chapters.map((ch: any, idx: number) => ({
          index: idx,
          title: ch.title || `第${idx + 1}章`,
          status: ch.status || 'pending',
          wordCount: ch.wordCount || 0,
        })));
      }
    } catch (error) {
      console.error('Failed to load chapters:', error);
      // Demo data
      setChapters([
        { index: 0, title: '第一章: 开端', status: 'completed', wordCount: 3500 },
        { index: 1, title: '第二章: 发现', status: 'completed', wordCount: 4200 },
        { index: 2, title: '第三章: 转折', status: 'writing', wordCount: 2100 },
        { index: 3, title: '第四章: 高潮', status: 'pending', wordCount: 0 },
        { index: 4, title: '第五章: 结局', status: 'pending', wordCount: 0 },
      ]);
    }
  };

  const loadChapterContent = async (chapterIndex: number) => {
    if (!window.electronAPI) return;
    try {
      // Load chapter content
      const chapterContent = await window.electronAPI.writing.getDraft(chapterIndex);
      setContent(chapterContent || '');

      // Load chapter outline
      const outline = await window.electronAPI.outline.get();
      if (outline?.chapters?.[chapterIndex]) {
        setChapterOutline({
          title: outline.chapters[chapterIndex].title,
          summary: outline.chapters[chapterIndex].summary || '',
          characters: outline.chapters[chapterIndex].characters || [],
          targetWordCount: outline.chapters[chapterIndex].targetWordCount || 4000,
        });
      }
    } catch (error) {
      console.error('Failed to load chapter:', error);
    }
  };

  const saveDraft = async () => {
    if (!window.electronAPI || selectedChapter < 0) return;
    setIsSaving(true);
    try {
      await window.electronAPI.writing.saveDraft(selectedChapter, content);
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to save draft:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!window.electronAPI || selectedChapter < 0) return;
    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      // Start generation with streaming
      const result = await window.electronAPI.writing.writeChapter(
        selectedChapter,
        chapterOutline?.summary || ''
      );

      if (result.content) {
        setContent(prev => prev + result.content);
      }

      // Simulate progress for now
      const interval = setInterval(() => {
        setGenerationProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 10;
        });
      }, 500);

    } catch (error) {
      console.error('Failed to generate:', error);
    } finally {
      setIsGenerating(false);
      setGenerationProgress(100);
    }
  };

  const handleContinue = async () => {
    if (!window.electronAPI || selectedChapter < 0) return;
    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      const result = await window.electronAPI.writing.continueWriting(
        selectedChapter,
        content,
        ''
      );

      if (result.content) {
        setContent(prev => prev + result.content);
      }
    } catch (error) {
      console.error('Failed to continue:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePause = () => {
    setIsGenerating(false);
    saveDraft();
  };

  const handleRegenerate = async () => {
    if (confirm('确定要重新生成吗？当前内容将被覆盖。')) {
      setContent('');
      await handleGenerate();
    }
  };

  const getWordCount = useCallback((text: string) => {
    // Chinese character count + English word count
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }, []);

  const currentWordCount = getWordCount(content);
  const targetWordCount = chapterOutline?.targetWordCount || 4000;
  const progress = Math.min((currentWordCount / targetWordCount) * 100, 100);

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

  return (
    <div className="flex h-full gap-4">
      {/* Left Panel - Chapter Outline */}
      <div className="w-64 flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-800 dark:text-white">📚 章节列表</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chapters.map((chapter) => (
            <button
              key={chapter.index}
              onClick={() => setSelectedChapter(chapter.index)}
              className={`w-full p-3 text-left border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                selectedChapter === chapter.index ? 'bg-blue-50 dark:bg-blue-900/20' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-800 dark:text-white truncate">
                  {chapter.title}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  chapter.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  chapter.status === 'writing' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  {chapter.status === 'completed' ? '✅' : chapter.status === 'writing' ? '📝' : '⏳'}
                </span>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {chapter.wordCount.toLocaleString()} 字
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Chapter Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl font-bold text-gray-800 dark:text-white">
              ✍️ {chapters[selectedChapter]?.title || `第${selectedChapter + 1}章`}
            </h1>
            <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              {isSaving && <span>💾 保存中...</span>}
              {lastSaved && !isSaving && (
                <span>💾 已保存 {lastSaved.toLocaleTimeString()}</span>
              )}
            </div>
          </div>

          {/* Chapter Outline Info */}
          {chapterOutline && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">本章要点:</span>
                <p className="text-gray-700 dark:text-gray-300 mt-1">
                  {chapterOutline.summary || '未设置'}
                </p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">出场角色:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {chapterOutline.characters.length > 0 ? (
                    chapterOutline.characters.map((char, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300"
                      >
                        {char}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500">未设置</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-600 dark:text-gray-400">写作进度</span>
              <span className="text-gray-800 dark:text-white font-medium">
                {currentWordCount.toLocaleString()} / {targetWordCount.toLocaleString()} 字
              </span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden flex flex-col">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="开始写作..."
            className="flex-1 w-full p-4 bg-transparent text-gray-800 dark:text-white resize-none focus:outline-none font-serif text-lg leading-relaxed"
            disabled={isGenerating}
          />

          {/* Generation Progress */}
          {isGenerating && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600 dark:text-gray-400">AI 正在生成中...</span>
                <span className="text-gray-800 dark:text-white">{generationProgress}%</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${generationProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Panel */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex space-x-2">
              {!isGenerating ? (
                <>
                  <button
                    onClick={handleGenerate}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center space-x-2"
                  >
                    <span>▶️</span>
                    <span>开始生成</span>
                  </button>
                  <button
                    onClick={handleContinue}
                    disabled={!content}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    <span>➡️</span>
                    <span>继续写作</span>
                  </button>
                  <button
                    onClick={handleRegenerate}
                    disabled={!content}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    <span>🔄</span>
                    <span>重新生成</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={handlePause}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center space-x-2"
                >
                  <span>⏸️</span>
                  <span>暂停</span>
                </button>
              )}
            </div>

            <div className="flex space-x-2">
              <button
                onClick={saveDraft}
                disabled={isSaving}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                💾 保存草稿
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-500 dark:text-gray-400 mr-4">快捷指令:</span>
            <div className="inline-flex flex-wrap gap-2">
              <button className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
                扩写选中段落
              </button>
              <button className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
                改写对话
              </button>
              <button className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
                添加细节描写
              </button>
              <button className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
                校对润色
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
