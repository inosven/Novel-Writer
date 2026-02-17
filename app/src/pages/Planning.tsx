import { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../stores/projectStore';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface PlanningSession {
  id: string;
  phase: 'collecting' | 'outline' | 'characters' | 'finalized';
  messages: Message[];
  outlineDraft?: string;
  characterSuggestions?: string[];
}

interface LLMConfig {
  provider: string;
  claude?: { model: string };
  openai?: { model: string };
  ollama?: { model: string; host: string };
}

export default function Planning() {
  const { projectPath } = useProjectStore();
  const [session, setSession] = useState<PlanningSession | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [currentModel, setCurrentModel] = useState<string>('未知');

  const phases = [
    { key: 'collecting', label: '收集想法', icon: '💡' },
    { key: 'outline', label: '生成大纲', icon: '📋' },
    { key: 'characters', label: '设计角色', icon: '👥' },
    { key: 'finalized', label: '完成', icon: '✅' },
  ];

  // Load current model from config
  const loadCurrentModel = async () => {
    if (!window.electronAPI) return;
    try {
      const config = await window.electronAPI.config.get();
      const provider = config.llm?.provider || 'unknown';
      let model = 'unknown';
      if (provider === 'ollama' && config.llm?.ollama) {
        model = config.llm.ollama.model;
      } else if (provider === 'claude' && config.llm?.claude) {
        model = config.llm.claude.model;
      } else if (provider === 'openai' && config.llm?.openai) {
        model = config.llm.openai.model;
      } else if (provider === 'openai-compatible' && config.llm?.['openai-compatible']) {
        model = config.llm['openai-compatible'].model;
      }
      setCurrentModel(`${provider}: ${model}`);
      console.log(`[Planning] Current model: ${provider}: ${model}`);
    } catch (error) {
      console.error('Failed to load current model:', error);
    }
  };

  useEffect(() => {
    loadSession();
    loadCurrentModel();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [session?.messages, streamingContent]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadSession = async () => {
    if (!window.electronAPI) return;
    try {
      const savedSession = await window.electronAPI.planning.getSession();
      console.log('Loaded session:', savedSession);

      // Validate session has expected structure
      if (savedSession && typeof savedSession === 'object' && savedSession.id) {
        // Ensure messages is always an array of proper Message objects
        const validMessages = Array.isArray(savedSession.messages)
          ? savedSession.messages.filter((msg: any) =>
              msg && typeof msg.content === 'string' && typeof msg.role === 'string'
            )
          : [];

        setSession({
          id: String(savedSession.id),
          phase: savedSession.phase || 'collecting',
          messages: validMessages.length > 0 ? validMessages : [{
            id: '1',
            role: 'assistant',
            content: '你好！我是你的创作助手。请告诉我你想写什么样的故事？',
            timestamp: new Date(),
          }],
          outlineDraft: savedSession.outlineDraft,
          characterSuggestions: savedSession.characterSuggestions,
        });
      } else {
        // Start new session
        await startNewSession();
      }
    } catch (error) {
      console.error('Failed to load session:', error);
      await startNewSession();
    }
  };

  const startNewSession = async () => {
    // Create a local session immediately without waiting for backend
    // This ensures reset always works even if backend/LLM is unavailable
    const newSessionId = Date.now().toString();

    const localSession: PlanningSession = {
      id: newSessionId,
      phase: 'collecting',
      messages: [{
        id: '1',
        role: 'assistant',
        content: '你好！我是你的创作助手。请告诉我你想写什么样的故事？\n\n你可以分享：\n- 故事的基本想法或主题\n- 你感兴趣的题材类型\n- 任何已有的灵感片段',
        timestamp: new Date(),
      }],
    };

    // Set local state immediately
    setSession(localSession);

    // Save to backend storage (don't await, fire and forget)
    if (window.electronAPI) {
      try {
        await window.electronAPI.planning.saveSession({
          id: newSessionId,
          phase: 'collecting',
          userIdea: '',
          answers: {},
          outlineDraft: null,
          characterSuggestions: [],
          messages: localSession.messages,
        });
        console.log('New session saved to backend:', newSessionId);
      } catch (error) {
        console.error('Failed to save new session to backend:', error);
        // Continue anyway - the local session is already set
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !session) return;

    // 使用 console.warn 让日志更显眼（黄色背景）
    console.warn('🚀🚀🚀 正在发送消息 🚀🚀🚀');
    console.warn(`📍 当前使用的模型: ${currentModel}`);
    console.warn(`📍 会话ID: ${session.id}`);
    console.warn(`📍 消息内容: ${input.trim()}`);
    console.warn('================================');

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setSession(prev => prev ? {
      ...prev,
      messages: [...(prev.messages || []), userMessage],
    } : null);
    setInput('');
    setIsLoading(true);
    setStreamingContent('');

    try {
      if (window.electronAPI) {
        // Check if this is the first user message (need to start planning)
        const hasUserMessages = session.messages?.some(m => m.role === 'user') || false;

        let response;
        if (!hasUserMessages) {
          // First message - use planning:start to set userIdea
          console.log('Starting new planning session with idea:', input.trim());
          response = await window.electronAPI.planning.start(input.trim());
        } else {
          // Subsequent messages - use planning:continue
          // Use timestamp as key to accumulate answers instead of overwriting
          const answerKey = `answer_${Date.now()}`;
          const answers = { [answerKey]: input.trim() };
          response = await window.electronAPI.planning.continue(
            session.id,
            answers
          );
        }

        console.log('Planning response:', response);

        // Extract message content safely - response might be a PlanningSession or a string
        let messageContent: string;
        console.log('[Planning] Response:', JSON.stringify(response, null, 2));

        if (typeof response === 'string') {
          messageContent = response;
        } else if (response && Array.isArray(response.currentQuestions) && response.currentQuestions.length > 0) {
          // Format questions as a readable message
          const summary = response.message ? `${response.message}\n\n` : '';
          messageContent = summary + '让我了解更多关于你的故事：\n\n' + response.currentQuestions.map((q: string) => `• ${q}`).join('\n');
        } else if (response && typeof response.message === 'string' && response.message.length > 0) {
          messageContent = response.message;
        } else if (response && typeof response.currentQuestions === 'string') {
          messageContent = response.currentQuestions;
        } else {
          // Fallback: try to create a readable message
          console.warn('[Planning] Using fallback message, response was:', response);
          messageContent = '我理解了。请继续告诉我更多关于你的故事想法。';
        }

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: messageContent,
          timestamp: new Date(),
        };

        const newPhase = (response && typeof response.phase === 'string') ? response.phase : session.phase;
        // Use the session ID from response if available (for planning:start case)
        const newSessionId = (response && response.id) ? response.id : session.id;

        setSession(prev => prev ? {
          ...prev,
          id: newSessionId,
          messages: [...(prev.messages || []), assistantMessage],
          phase: newPhase as PlanningSession['phase'],
        } : null);

        // Save session - preserve backend data (answers, userIdea) from response
        await window.electronAPI.planning.saveSession({
          ...response,  // Use response from backend which has answers, userIdea, etc.
          messages: [...(session.messages || []), userMessage, assistantMessage],
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，发生了一个错误。请重试。',
        timestamp: new Date(),
      };
      setSession(prev => prev ? {
        ...prev,
        messages: [...(prev.messages || []), errorMessage],
      } : null);
    } finally {
      setIsLoading(false);
      setStreamingContent('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleGenerateOutline = async () => {
    if (!session || !window.electronAPI) return;
    setIsLoading(true);

    // Add a status message
    const statusMsg: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: '正在生成大纲，这可能需要一些时间（推理模型需要较长的思考时间）...',
      timestamp: new Date(),
    };
    setSession(prev => prev ? {
      ...prev,
      messages: [...(prev.messages || []), statusMsg],
    } : null);

    try {
      const result = await window.electronAPI.planning.generateOutline(session.id);
      console.log('generateOutline result:', result);

      // result is a PlanningSession, outline is in outlineDraft
      const outline = result.outlineDraft || '';

      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `我已经根据我们的讨论生成了大纲草案：\n\n${outline}\n\n你觉得这个大纲怎么样？需要修改哪些部分？`,
        timestamp: new Date(),
      };
      setSession(prev => prev ? {
        ...prev,
        messages: [...(prev.messages || []), assistantMessage],
        phase: 'outline',
        outlineDraft: outline,
      } : null);
    } catch (error: any) {
      console.error('Failed to generate outline:', error);
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `生成大纲时出错：${error?.message || '未知错误'}。请重试。`,
        timestamp: new Date(),
      };
      setSession(prev => prev ? {
        ...prev,
        messages: [...(prev.messages || []), errorMsg],
      } : null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestCharacters = async () => {
    if (!session || !window.electronAPI) return;
    setIsLoading(true);
    try {
      const result = await window.electronAPI.planning.suggestCharacters(session.id);
      console.log('suggestCharacters result:', result);

      // result is a PlanningSession, characters are in characterSuggestions
      const characters = result.characterSuggestions || [];

      // Format characters for display
      let characterContent: string;
      if (characters.length > 0) {
        const characterList = characters.map((c: any) =>
          typeof c === 'string' ? c : `- **${c.name}** (${c.role}): ${c.briefDescription}`
        ).join('\n');
        characterContent = `根据大纲，我建议创建以下核心角色：\n\n${characterList}\n\n你想为哪个角色创建详细的人物小传？或者你想添加/删除某个角色？`;
      } else {
        characterContent = '角色建议生成中遇到问题，请重试。';
      }

      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: characterContent,
        timestamp: new Date(),
      };
      setSession(prev => prev ? {
        ...prev,
        messages: [...(prev.messages || []), assistantMessage],
        phase: 'characters',
        characterSuggestions: characters,
      } : null);
    } catch (error: any) {
      console.error('Failed to suggest characters:', error);
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `设计角色时出错：${error?.message || '未知错误'}。请重试。`,
        timestamp: new Date(),
      };
      setSession(prev => prev ? {
        ...prev,
        messages: [...(prev.messages || []), errorMsg],
      } : null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!session || !window.electronAPI) return;
    setIsLoading(true);
    try {
      // Prepare outline and characters for finalize
      const outline = session.outlineDraft || '';
      const characters = (session.characterSuggestions || []).map((c: any) => ({
        name: typeof c === 'string' ? c : c.name,
        profile: typeof c === 'string' ? c : JSON.stringify(c),
      }));

      console.log('Finalizing with outline:', outline.substring(0, 100), '...');
      console.log('Finalizing with characters:', characters);

      await window.electronAPI.planning.finalize(session.id, outline, characters);
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '太好了！规划阶段已完成。大纲和角色信息已保存到项目中。\n\n现在你可以前往「写作工作台」开始创作了！',
        timestamp: new Date(),
      };
      setSession(prev => prev ? {
        ...prev,
        messages: [...(prev.messages || []), assistantMessage],
        phase: 'finalized',
      } : null);
    } catch (error) {
      console.error('Failed to finalize:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    if (confirm('确定要重新开始规划吗？当前的进度将会丢失。')) {
      console.log('[Planning] Resetting session...');

      // Reset all states first
      setIsLoading(false);
      setStreamingContent('');
      setInput('');
      setSession(null);

      // Clear persistent storage by saving null/empty session
      if (window.electronAPI) {
        try {
          await window.electronAPI.planning.saveSession(null);
          console.log('[Planning] Session storage cleared');
        } catch (e) {
          console.log('[Planning] Failed to clear session storage:', e);
        }
      }

      // Reload current model (in case it changed)
      await loadCurrentModel();

      // Start fresh
      await startNewSession();
      console.log('[Planning] New session started');
    }
  };

  if (!projectPath) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-4">
            请先打开或创建一个项目
          </p>
          <a
            href="/"
            className="text-blue-500 hover:text-blue-600"
          >
            返回首页
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
          🎯 故事规划
        </h1>

        {/* Phase Indicator */}
        <div className="flex items-center space-x-2">
          {phases.map((phase, index) => (
            <div key={phase.key} className="flex items-center">
              <div
                className={`flex items-center px-3 py-1 rounded-full text-sm ${
                  session?.phase === phase.key
                    ? 'bg-blue-500 text-white'
                    : phases.findIndex(p => p.key === session?.phase) > index
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                <span className="mr-1">{phase.icon}</span>
                <span>{phase.label}</span>
              </div>
              {index < phases.length - 1 && (
                <span className="mx-2 text-gray-400">→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {(session?.messages || []).map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white'
                }`}
              >
                <div className="text-sm mb-1 opacity-70">
                  {message.role === 'user' ? '👤 你' : '🤖 AI'}
                </div>
                <div className="whitespace-pre-wrap select-text cursor-text">
                  {typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
                </div>
              </div>
            </div>
          ))}

          {/* Streaming content */}
          {streamingContent && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg p-3 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white">
                <div className="text-sm mb-1 opacity-70">🤖 AI</div>
                <div className="whitespace-pre-wrap">{streamingContent}</div>
                <span className="inline-block w-2 h-4 bg-gray-500 animate-pulse ml-1" />
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && !streamingContent && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          {/* Action Buttons */}
          {session && session.phase !== 'finalized' && (
            <div className="flex flex-wrap gap-2 mb-3">
              {/* Generate/Regenerate outline - available in collecting and outline phases */}
              {(session.phase === 'collecting' || session.phase === 'outline') && (session.messages?.length || 0) > 2 && (
                <button
                  onClick={handleGenerateOutline}
                  disabled={isLoading}
                  className="px-3 py-1 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 disabled:opacity-50"
                >
                  📋 {session.phase === 'outline' ? '重新生成大纲' : '生成大纲'}
                </button>
              )}
              {/* Suggest characters - available in outline phase when outline exists */}
              {session.phase === 'outline' && session.outlineDraft && (
                <button
                  onClick={handleSuggestCharacters}
                  disabled={isLoading}
                  className="px-3 py-1 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 disabled:opacity-50"
                >
                  👥 建议角色
                </button>
              )}
              {/* Back to collecting phase */}
              {(session.phase === 'outline' || session.phase === 'characters') && (
                <button
                  onClick={() => setSession(prev => prev ? { ...prev, phase: 'collecting' } : null)}
                  disabled={isLoading}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  ← 回到对话
                </button>
              )}
              {session.phase === 'characters' && (
                <button
                  onClick={handleFinalize}
                  disabled={isLoading}
                  className="px-3 py-1 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 disabled:opacity-50"
                >
                  ✅ 完成规划
                </button>
              )}
              <button
                onClick={handleReset}
                disabled={isLoading}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                🔄 重新开始
              </button>
            </div>
          )}

          {/* Text Input */}
          <div className="flex space-x-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的想法..."
              disabled={isLoading || session?.phase === 'finalized'}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              rows={2}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading || session?.phase === 'finalized'}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              发送
            </button>
          </div>

          {/* Status */}
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between">
            <span>会话ID: {session?.id?.slice(0, 8)}...</span>
            <div className="flex items-center space-x-3">
              <span
                className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800"
                onClick={loadCurrentModel}
                title="点击刷新模型信息"
              >
                🤖 {currentModel}
              </span>
              <span>💾 自动保存已启用</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
