import { useState, useEffect, useCallback, useRef } from 'react';
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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  quotedText?: string;
  timestamp: Date;
}

export default function Writing() {
  const { projectPath } = useProjectStore();

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<number>(-1);
  const [chapterOutline, setChapterOutline] = useState<ChapterOutline | null>(null);
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Chat panel state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [quotedText, setQuotedText] = useState<string | null>(null);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (projectPath) {
      loadChapters();
    }
  }, [projectPath]);

  useEffect(() => {
    if (selectedChapter > 0) {
      loadChapterContent(selectedChapter);
    }
  }, [selectedChapter]);

  // Auto-save
  useEffect(() => {
    const timer = setTimeout(() => {
      if (content && selectedChapter > 0) {
        saveDraft();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [content]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const loadChapters = async () => {
    if (!window.electronAPI) return;
    try {
      const chapterList = await window.electronAPI.outline.get();
      console.log(`[Writing] loadChapters: outline has ${chapterList?.chapters?.length ?? 0} chapters`);
      if (chapterList?.chapters) {
        // Deduplicate by index — keep first occurrence only
        const deduped: any[] = [];
        const seenIdx = new Set<number>();
        for (const ch of chapterList.chapters) {
          const idx = ch.index ?? 0;
          if (idx > 0 && !seenIdx.has(idx)) {
            seenIdx.add(idx);
            deduped.push(ch);
          }
        }
        const sorted = deduped.sort((a: any, b: any) => (a.index || 0) - (b.index || 0));
        const chapterItems: Chapter[] = [];
        for (const ch of sorted) {
          const idx = ch.index;
          // Try loading actual content to compute word count
          let wc = 0;
          try {
            const text = await window.electronAPI.chapters.getContent(idx);
            if (text) {
              wc = (text.match(/[\u4e00-\u9fa5]/g) || []).length + (text.match(/[a-zA-Z]+/g) || []).length;
            }
          } catch { /* no content yet */ }
          chapterItems.push({
            index: idx,
            title: ch.title || `第${idx}章`,
            status: wc > 0 ? 'completed' : (ch.status || 'pending'),
            wordCount: wc,
          });
        }
        console.log(`[Writing] loadChapters: setting ${chapterItems.length} chapters`);
        setChapters(chapterItems);
        // Auto-select first chapter if none selected
        if (selectedChapter < 0 && chapterItems.length > 0) {
          setSelectedChapter(chapterItems[0].index);
        }
      }
    } catch (error) {
      console.error('Failed to load chapters:', error);
    }
  };

  const loadChapterContent = async (chapterIndex: number) => {
    if (!window.electronAPI) return;
    try {
      // Try draft first, then fall back to saved chapter file
      let chapterContent = await window.electronAPI.writing.getDraft(chapterIndex);
      if (!chapterContent) {
        try {
          chapterContent = await window.electronAPI.chapters.getContent(chapterIndex);
        } catch { /* no file yet */ }
      }
      setContent(chapterContent || '');

      const outline = await window.electronAPI.outline.get();
      // Find chapter by its index field, not by array position
      const ch = outline?.chapters?.find((c: any) => c.index === chapterIndex);
      if (ch) {
        setChapterOutline({
          title: ch.title,
          summary: ch.summary || '',
          characters: ch.characters || [],
          targetWordCount: ch.targetWordCount || 4000,
        });
      } else {
        setChapterOutline(null);
      }
    } catch (error) {
      console.error('Failed to load chapter:', error);
    }
  };

  const saveDraft = async () => {
    if (!window.electronAPI || selectedChapter <= 0) return;
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
    if (!window.electronAPI || selectedChapter <= 0) return;
    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      const result = await window.electronAPI.writing.writeChapter(selectedChapter);

      const chapterText = result.finalContent || result.chapter || '';
      if (chapterText) {
        setContent(chapterText);
        // Update word count in chapter list
        updateChapterWordCount(selectedChapter, chapterText);
      }
    } catch (error) {
      console.error('Failed to generate:', error);
    } finally {
      setIsGenerating(false);
      setGenerationProgress(100);
    }
  };

  const handleContinue = async () => {
    if (!window.electronAPI || selectedChapter <= 0) return;
    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      const result = await window.electronAPI.writing.continueWriting(
        selectedChapter,
        content
      );

      const continued = typeof result === 'string' ? result : (result.finalContent || result.chapter || result.content || '');
      if (continued) {
        const newContent = content + continued;
        setContent(newContent);
        updateChapterWordCount(selectedChapter, newContent);
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

  // Text selection → quote
  const handleTextSelect = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) return; // no selection

    selectionRef.current = { start, end };
    const selectedText = content.substring(start, end);

    if (selectedText.trim()) {
      // Normal text selection
      setQuotedText(selectedText);
    } else {
      // Empty/whitespace selection — capture surrounding context as insertion point
      const beforeText = content.substring(Math.max(0, start - 80), start).trim();
      const afterText = content.substring(end, Math.min(content.length, end + 80)).trim();
      const lastLine = beforeText.split('\n').pop() || '';
      const firstLine = afterText.split('\n')[0] || '';

      if (start === 0) {
        setQuotedText(`[插入位置: 文章开头]\n后文: ${firstLine}`);
      } else if (end >= content.length - 1) {
        setQuotedText(`[插入位置: 文章末尾]\n前文: ${lastLine}`);
      } else {
        setQuotedText(`[插入位置]\n前文: ...${lastLine}\n后文: ${firstLine}...`);
      }
    }
  };

  // Chat send
  const handleChatSend = async () => {
    if (!chatInput.trim() || isEditing || !content) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput,
      quotedText: quotedText || undefined,
      timestamp: new Date(),
    };
    setChatMessages(prev => [...prev, userMsg]);

    const instruction = quotedText
      ? `【引用文本】\n${quotedText}\n\n【修改要求】\n${chatInput}`
      : chatInput;

    setChatInput('');
    setQuotedText(null);
    selectionRef.current = null;
    setIsEditing(true);

    try {
      const result = await window.electronAPI.writing.editChapter(
        selectedChapter,
        instruction,
        quotedText || undefined
      );
      if (result) {
        const { content: editedContent, changeSummary } = result;
        setContent(editedContent);
        updateChapterWordCount(selectedChapter, editedContent);
        setChatMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: changeSummary || '已完成修改。',
          timestamp: new Date(),
        }]);
      }
    } catch (error: any) {
      setChatMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `修改失败: ${error?.message || '未知错误'}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsEditing(false);
    }
  };

  // Quick action via chat
  const handleQuickAction = (label: string, instruction: string) => {
    if (!content) {
      alert('请先生成章节内容');
      return;
    }
    setChatInput(instruction);
    // Auto-send via a small delay so user can see what's being sent
    setTimeout(() => {
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: instruction,
        quotedText: quotedText || undefined,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, userMsg]);

      const fullInstruction = quotedText
        ? `【引用文本】\n${quotedText}\n\n【修改要求】\n${instruction}`
        : instruction;

      setChatInput('');
      setQuotedText(null);
      selectionRef.current = null;
      setIsEditing(true);

      window.electronAPI.writing.editChapter(
        selectedChapter,
        fullInstruction,
        quotedText || undefined
      ).then((result: any) => {
        if (result) {
          const { content: editedContent, changeSummary } = result;
          setContent(editedContent);
          updateChapterWordCount(selectedChapter, editedContent);
          setChatMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: changeSummary || `已完成「${label}」修改。`,
            timestamp: new Date(),
          }]);
        }
      }).catch((error: any) => {
        setChatMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `修改失败: ${error?.message || '未知错误'}`,
          timestamp: new Date(),
        }]);
      }).finally(() => {
        setIsEditing(false);
      });
    }, 100);
  };

  // Add a new chapter after the given index (single atomic backend call)
  const handleAddChapter = async (afterIndex?: number) => {
    if (!window.electronAPI) return;
    try {
      const insertAfter = afterIndex != null
        ? afterIndex
        : selectedChapter > 0
          ? selectedChapter
          : (chapters.length > 0 ? chapters[chapters.length - 1].index : 0);

      const result = await window.electronAPI.chapters.insert(insertAfter);
      const newIdx = result.newIndex; // = insertAfter + 1

      // If current selection is at or after the insert point, shift it to follow the original chapter
      if (selectedChapter >= newIdx) {
        setSelectedChapter(selectedChapter + 1);
      }

      await loadChapters();
    } catch (error: any) {
      console.error('Failed to add chapter:', error);
      alert(`添加章节失败: ${error?.message || error}`);
    }
  };

  // Delete a chapter (single atomic backend call)
  const handleDeleteChapter = async (chapterIndex: number) => {
    if (!window.electronAPI) return;
    if (chapters.length <= 1) {
      alert('至少保留一个章节');
      return;
    }
    const ch = chapters.find(c => c.index === chapterIndex);
    const chTitle = ch?.title || `第${chapterIndex}章`;
    if (ch?.wordCount && ch.wordCount > 0) {
      if (!confirm(`「${chTitle}」已有 ${ch.wordCount} 字内容，确定要删除吗？`)) return;
    } else if (!confirm(`确定要删除「${chTitle}」吗？`)) {
      return;
    }
    try {
      const oldCount = chapters.length;
      await window.electronAPI.chapters.remove(chapterIndex);

      // Adjust selection before reloading
      if (selectedChapter === chapterIndex) {
        const remaining = chapters.filter(c => c.index !== chapterIndex);
        if (remaining.length > 0) {
          const before = remaining.filter(c => c.index < chapterIndex);
          const after = remaining.filter(c => c.index > chapterIndex);
          if (before.length > 0) {
            setSelectedChapter(before[before.length - 1].index);
          } else if (after.length > 0) {
            setSelectedChapter(after[0].index - 1);
          }
        } else {
          setSelectedChapter(-1);
          setContent('');
        }
      } else if (selectedChapter > chapterIndex) {
        setSelectedChapter(selectedChapter - 1);
      }

      await loadChapters();
    } catch (error: any) {
      console.error('Failed to delete chapter:', error);
      alert(`删除章节失败: ${error?.message || error}`);
    }
  };

  // Update word count in the chapter list sidebar
  const updateChapterWordCount = useCallback((chapterIdx: number, text: string) => {
    const wc = (text.match(/[\u4e00-\u9fa5]/g) || []).length + (text.match(/[a-zA-Z]+/g) || []).length;
    setChapters(prev => prev.map(ch =>
      ch.index === chapterIdx ? { ...ch, wordCount: wc, status: 'completed' as const } : ch
    ));
  }, []);

  const getWordCount = useCallback((text: string) => {
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
    <div className="flex h-full gap-3">
      {/* Left Panel - Chapter List */}
      <div className="w-56 flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden flex flex-col">
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold text-sm text-gray-800 dark:text-white">章节列表</h2>
          <button
            onClick={() => handleAddChapter()}
            className="w-6 h-6 flex items-center justify-center rounded bg-blue-500 text-white hover:bg-blue-600 text-sm font-bold"
            title="在末尾添加章节"
          >
            +
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chapters.map((chapter, arrIdx) => (
            <div
              key={`ch-${chapter.index}-${arrIdx}`}
              onClick={() => setSelectedChapter(chapter.index)}
              className={`group w-full p-2.5 text-left border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer ${
                selectedChapter === chapter.index ? 'bg-blue-50 dark:bg-blue-900/20' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-medium text-gray-800 dark:text-white truncate flex-1">
                  {chapter.title}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAddChapter(chapter.index); }}
                    className="w-5 h-5 items-center justify-center rounded text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 text-xs hidden group-hover:flex"
                    title="在此章后插入新章节"
                  >
                    +
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteChapter(chapter.index); }}
                    className="w-5 h-5 items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs hidden group-hover:flex"
                    title="删除章节"
                  >
                    x
                  </button>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    chapter.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    chapter.status === 'writing' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                    'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {chapter.status === 'completed' ? 'done' : chapter.status === 'writing' ? '...' : '--'}
                  </span>
                </div>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {chapter.wordCount.toLocaleString()} 字
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Center Panel - Chapter Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chapter Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-lg font-bold text-gray-800 dark:text-white truncate">
              {chapters.find(ch => ch.index === selectedChapter)?.title || `第${selectedChapter}章`}
            </h1>
            <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
              {isSaving && <span>保存中...</span>}
              {lastSaved && !isSaving && (
                <span>已保存 {lastSaved.toLocaleTimeString()}</span>
              )}
            </div>
          </div>

          {/* Chapter Outline Info */}
          {chapterOutline && (
            <div className="text-xs space-y-1">
              <div>
                <span className="text-gray-500 dark:text-gray-400">要点: </span>
                <span className="text-gray-700 dark:text-gray-300">
                  {chapterOutline.summary || '未设置'}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-gray-500 dark:text-gray-400">角色: </span>
                {chapterOutline.characters.length > 0 ? (
                  chapterOutline.characters.map((char, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300"
                    >
                      {char}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-500">未设置</span>
                )}
              </div>
            </div>
          )}

          {/* Progress Bar */}
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-600 dark:text-gray-400">进度</span>
              <span className="text-gray-800 dark:text-white font-medium">
                {currentWordCount.toLocaleString()} / {targetWordCount.toLocaleString()} 字
              </span>
            </div>
            <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
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
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onSelect={handleTextSelect}
            onMouseUp={handleTextSelect}
            placeholder="开始写作..."
            className="flex-1 w-full p-4 bg-transparent text-gray-800 dark:text-white resize-none focus:outline-none font-serif text-base leading-relaxed"
            disabled={isGenerating}
          />

          {/* Generation Progress */}
          {isGenerating && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-600 dark:text-gray-400">AI 正在生成中...</span>
                <span className="text-gray-800 dark:text-white">{generationProgress}%</span>
              </div>
              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${generationProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Panel */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-3 mt-3">
          <div className="flex items-center justify-between">
            <div className="flex space-x-2">
              {!isGenerating ? (
                <>
                  <button
                    onClick={handleGenerate}
                    className="px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm flex items-center space-x-1"
                  >
                    <span>开始生成</span>
                  </button>
                  <button
                    onClick={handleContinue}
                    disabled={!content}
                    className="px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center space-x-1"
                  >
                    <span>续写</span>
                  </button>
                  <button
                    onClick={handleRegenerate}
                    disabled={!content}
                    className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    重新生成
                  </button>
                </>
              ) : (
                <button
                  onClick={handlePause}
                  className="px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm"
                >
                  暂停
                </button>
              )}
            </div>

            <button
              onClick={saveDraft}
              disabled={isSaving}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 text-sm"
            >
              保存草稿
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel - AI Chat */}
      <div className="w-96 flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden flex flex-col">
        {/* Chat Header */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-sm text-gray-800 dark:text-white">AI 编辑助手</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            选中左侧文本可引用，然后输入修改指令
          </p>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {chatMessages.length === 0 && (
            <div className="text-center text-xs text-gray-400 dark:text-gray-500 mt-8">
              <p>在左侧编辑器中选中文本，</p>
              <p>然后在下方输入修改指令。</p>
              <p className="mt-2">也可以直接输入修改要求，</p>
              <p>或使用下方快捷指令。</p>
            </div>
          )}
          {chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white'
                }`}
              >
                {/* Quoted text */}
                {msg.quotedText && (
                  <div
                    className={`text-xs mb-1.5 px-2 py-1 rounded border-l-2 ${
                      msg.role === 'user'
                        ? 'bg-blue-600/50 border-blue-300'
                        : 'bg-gray-200 dark:bg-gray-600 border-gray-400'
                    }`}
                  >
                    <span className="opacity-75">{msg.quotedText.startsWith('[插入位置') ? '' : '引用: '}</span>
                    {msg.quotedText.length > 100
                      ? msg.quotedText.substring(0, 100) + '...'
                      : msg.quotedText}
                  </div>
                )}
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <span
                  className={`text-xs mt-1 block ${
                    msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'
                  }`}
                >
                  {msg.timestamp.toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
          {isEditing && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-white">
                <div className="flex items-center space-x-2">
                  <span className="animate-spin w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full" />
                  <span>AI 正在修改中...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Quote Preview */}
        {quotedText && (
          <div className="mx-3 mb-2 px-2 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-yellow-700 dark:text-yellow-400 font-medium">{quotedText.startsWith('[插入位置') ? '插入位置' : '引用文本'}</span>
              <button
                onClick={() => { setQuotedText(null); selectionRef.current = null; }}
                className="text-yellow-600 dark:text-yellow-500 hover:text-yellow-800 dark:hover:text-yellow-300"
              >
                x
              </button>
            </div>
            <p className="text-yellow-800 dark:text-yellow-300 line-clamp-2">
              {quotedText}
            </p>
          </div>
        )}

        {/* Chat Input */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && chatInput.trim()) {
                  e.preventDefault();
                  handleChatSend();
                }
              }}
              placeholder={quotedText ? '输入对选中文本的修改指令...' : '输入修改指令...'}
              className="flex-1 px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isEditing || !content}
            />
            <button
              onClick={handleChatSend}
              disabled={isEditing || !chatInput.trim() || !content}
              className="px-3 py-1.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
            >
              {isEditing ? '修改中...' : '发送'}
            </button>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center flex-wrap gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">快捷:</span>
            {[
              { label: '扩写段落', instruction: '请扩写文中描写较为简略的段落，增加环境描写、人物动作和心理细节，让场景更加丰满生动' },
              { label: '改写对话', instruction: '请改写文中的对话部分，让对话更有张力和潜台词，体现人物性格差异，避免平铺直叙' },
              { label: '添加细节', instruction: '请在关键场景中添加感官细节描写（视觉、听觉、触觉、嗅觉），增强沉浸感和画面感' },
              { label: '校对润色', instruction: '请校对全文，修正语病、错别字，优化不通顺的句子，统一文风，提升文学性' },
            ].map(({ label, instruction }) => (
              <button
                key={label}
                onClick={() => handleQuickAction(label, instruction)}
                disabled={isEditing || !content}
                className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
