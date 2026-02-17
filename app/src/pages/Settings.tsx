import { useState, useEffect } from 'react';
import { useConfigStore } from '../stores/configStore';

export default function Settings() {
  const { llm, embedding, project, loadConfig, saveConfig, testLLM, testEmbedding, getOllamaModels } = useConfigStore();

  const [localLLM, setLocalLLM] = useState(llm);
  const [localEmbedding, setLocalEmbedding] = useState(embedding);
  const [localProject, setLocalProject] = useState(project);

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [llmTestStatus, setLLMTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [embeddingTestStatus, setEmbeddingTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [llmTestMessage, setLLMTestMessage] = useState('');
  const [embeddingTestMessage, setEmbeddingTestMessage] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [extraBodyText, setExtraBodyText] = useState('{}');
  const [extraBodyError, setExtraBodyError] = useState('');

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    setLocalLLM(llm);
    setLocalEmbedding(embedding);
    setLocalProject(project);
    // Sync extraBodyText
    setExtraBodyText(JSON.stringify(llm['openai-compatible']?.extraBody || {}, null, 2));
    // Load Ollama models after config is loaded
    if (llm.provider === 'ollama' || embedding.provider === 'ollama') {
      const host = llm.ollama?.host || embedding.host || 'http://localhost:11434';
      getOllamaModels(host).then(models => {
        console.log('Initial Ollama models loaded:', models);
        setOllamaModels(models);
      });
    }
  }, [llm, embedding, project]);

  useEffect(() => {
    if (localLLM.provider === 'ollama' || localEmbedding.provider === 'ollama') {
      loadOllamaModels();
    }
  }, [localLLM.provider, localEmbedding.provider, localLLM.ollama?.host, localEmbedding.host]);

  const loadOllamaModels = async () => {
    // Use the host from localLLM or localEmbedding
    const host = localLLM.ollama?.host || localEmbedding.host || 'http://localhost:11434';
    console.log('=== loadOllamaModels called ===');
    console.log('Host:', host);
    console.log('electronAPI available:', !!window.electronAPI);
    console.log('electronAPI.config available:', !!window.electronAPI?.config);

    setIsLoadingModels(true);
    try {
      const models = await getOllamaModels(host);
      console.log('Models returned:', models);
      if (models && models.length > 0) {
        setOllamaModels(models);
      } else {
        console.warn('No models returned from Ollama');
        // Show alert if no models found
        alert('无法获取模型列表。请确保 Ollama 正在运行。');
      }
    } catch (error) {
      console.error('Error in loadOllamaModels:', error);
      alert('获取模型列表失败: ' + String(error));
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleTestLLM = async () => {
    setLLMTestStatus('testing');
    setLLMTestMessage('');
    try {
      // Build the correct config object for the current provider
      const provider = localLLM.provider;
      let testConfig: any = { provider };

      if (provider === 'claude') {
        testConfig = { ...testConfig, apiKey: localLLM.claude.apiKey, model: localLLM.claude.model };
      } else if (provider === 'openai') {
        testConfig = { ...testConfig, apiKey: localLLM.openai.apiKey, model: localLLM.openai.model };
      } else if (provider === 'ollama') {
        testConfig = { ...testConfig, host: localLLM.ollama.host, model: localLLM.ollama.model };
      } else if (provider === 'openai-compatible') {
        const compat = localLLM['openai-compatible'];
        testConfig = { ...testConfig, baseUrl: compat?.baseUrl, apiKey: compat?.apiKey, model: compat?.model, extraBody: compat?.extraBody };
      }

      const result = await testLLM(testConfig);
      if (result.success) {
        setLLMTestStatus('success');
        setLLMTestMessage('连接成功！');
      } else {
        setLLMTestStatus('error');
        setLLMTestMessage(result.error || '连接失败');
      }
    } catch (error) {
      setLLMTestStatus('error');
      setLLMTestMessage(error instanceof Error ? error.message : '连接失败');
    }
  };

  const handleTestEmbedding = async () => {
    setEmbeddingTestStatus('testing');
    setEmbeddingTestMessage('');
    try {
      const result = await testEmbedding(localEmbedding);
      if (result.success) {
        setEmbeddingTestStatus('success');
        setEmbeddingTestMessage('连接成功！');
      } else {
        setEmbeddingTestStatus('error');
        setEmbeddingTestMessage(result.error || '连接失败');
      }
    } catch (error) {
      setEmbeddingTestStatus('error');
      setEmbeddingTestMessage(error instanceof Error ? error.message : '连接失败');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      console.log('========================================');
      console.log('[Settings] Saving config...');
      console.log(`[Settings] LLM Provider: ${localLLM.provider}`);
      if (localLLM.provider === 'ollama') {
        console.log(`[Settings] Ollama Model: ${localLLM.ollama?.model}`);
      } else if (localLLM.provider === 'claude') {
        console.log(`[Settings] Claude Model: ${localLLM.claude?.model}`);
      } else if (localLLM.provider === 'openai') {
        console.log(`[Settings] OpenAI Model: ${localLLM.openai?.model}`);
      }
      console.log('========================================');

      await saveConfig({
        llm: localLLM,
        embedding: localEmbedding,
        project: localProject,
      });

      // Show confirmation
      const model = localLLM.provider === 'ollama' ? localLLM.ollama?.model :
                    localLLM.provider === 'claude' ? localLLM.claude?.model :
                    localLLM.provider === 'openai-compatible' ? localLLM['openai-compatible']?.model :
                    localLLM.openai?.model;
      alert(`配置已保存！\n\n当前模型: ${localLLM.provider} - ${model}\n\n模型已应用到当前会话，新的对话将使用此模型。`);
    } catch (error) {
      console.error('[Settings] Failed to save config:', error);
      alert('保存失败: ' + String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setLocalLLM({
      provider: 'ollama',
      claude: { apiKey: '', model: 'claude-sonnet-4-20250514' },
      openai: { apiKey: '', model: 'gpt-4o' },
      ollama: { host: 'http://localhost:11434', model: 'qwen3:30b' },
      'openai-compatible': { baseUrl: 'https://integrate.api.nvidia.com/v1', apiKey: '', model: 'moonshotai/kimi-k2.5', extraBody: { chat_template_kwargs: { thinking: true } } },
    });
    setLocalEmbedding({
      provider: 'ollama',
      model: 'qwen3-embedding',
      host: 'http://localhost:11434',
    });
    setLocalProject({
      lastPath: null,
      autoSaveInterval: 30,
    });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-8">
        ⚙️ 设置
      </h1>

      {/* LLM Provider Configuration */}
      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm mb-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
          📡 LLM 提供商配置
        </h2>

        {/* Provider Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            提供商
          </label>
          <div className="flex space-x-2">
            {(['claude', 'openai', 'ollama', 'openai-compatible'] as const).map((provider) => (
              <button
                key={provider}
                onClick={() => setLocalLLM({ ...localLLM, provider })}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  localLLM.provider === provider
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {provider === 'claude' ? 'Claude' : provider === 'openai' ? 'OpenAI' : provider === 'ollama' ? 'Ollama' : 'OpenAI兼容'}
              </button>
            ))}
          </div>
        </div>

        {/* Claude Configuration */}
        {localLLM.provider === 'claude' && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API Key
              </label>
              <div className="flex space-x-2">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={localLLM.claude?.apiKey || ''}
                  onChange={(e) => setLocalLLM({ ...localLLM, claude: { ...localLLM.claude, apiKey: e.target.value } })}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="sk-ant-..."
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  {showApiKey ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                模型
              </label>
              <select
                value={localLLM.claude?.model || 'claude-sonnet-4-20250514'}
                onChange={(e) => setLocalLLM({ ...localLLM, claude: { ...localLLM.claude, model: e.target.value } })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="claude-opus-4-20250514">Claude Opus 4</option>
                <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                <option value="claude-3-opus-20240229">Claude 3 Opus</option>
              </select>
            </div>
          </>
        )}

        {/* OpenAI Configuration */}
        {localLLM.provider === 'openai' && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API Key
              </label>
              <div className="flex space-x-2">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={localLLM.openai?.apiKey || ''}
                  onChange={(e) => setLocalLLM({ ...localLLM, openai: { ...localLLM.openai, apiKey: e.target.value } })}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="sk-..."
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  {showApiKey ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                模型
              </label>
              <select
                value={localLLM.openai?.model || 'gpt-4o'}
                onChange={(e) => setLocalLLM({ ...localLLM, openai: { ...localLLM.openai, model: e.target.value } })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              </select>
            </div>
          </>
        )}

        {/* Ollama Configuration */}
        {localLLM.provider === 'ollama' && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                服务地址
              </label>
              <input
                type="text"
                value={localLLM.ollama?.host || 'http://localhost:11434'}
                onChange={(e) => setLocalLLM({ ...localLLM, ollama: { ...localLLM.ollama, host: e.target.value } })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="http://localhost:11434"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                模型 {isLoadingModels && <span className="text-gray-500">(加载中...)</span>}
              </label>
              <div className="flex space-x-2">
                <select
                  value={localLLM.ollama?.model || ''}
                  onChange={(e) => setLocalLLM({ ...localLLM, ollama: { ...localLLM.ollama, model: e.target.value } })}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isLoadingModels}
                >
                  {ollamaModels.length > 0 ? (
                    ollamaModels.map((model) => (
                      <option key={model} value={model}>{model}</option>
                    ))
                  ) : (
                    <option value="">
                      {isLoadingModels ? '加载中...' : '点击刷新按钮获取模型列表'}
                    </option>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    console.log('Refresh button clicked!');
                    loadOllamaModels();
                  }}
                  disabled={isLoadingModels}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                  title="刷新模型列表"
                >
                  {isLoadingModels ? '⏳' : '🔄'}
                </button>
              </div>
              {ollamaModels.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  已发现 {ollamaModels.length} 个模型
                </p>
              )}
            </div>
          </>
        )}

        {/* OpenAI Compatible Configuration */}
        {localLLM.provider === 'openai-compatible' && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API 基础地址
              </label>
              <input
                type="text"
                value={localLLM['openai-compatible']?.baseUrl || ''}
                onChange={(e) => setLocalLLM({ ...localLLM, 'openai-compatible': { ...localLLM['openai-compatible'], baseUrl: e.target.value } })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://integrate.api.nvidia.com/v1"
              />
              <p className="text-xs text-gray-500 mt-1">
                例如: https://integrate.api.nvidia.com/v1, https://api.siliconflow.cn/v1
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API Key
              </label>
              <div className="flex space-x-2">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={localLLM['openai-compatible']?.apiKey || ''}
                  onChange={(e) => setLocalLLM({ ...localLLM, 'openai-compatible': { ...localLLM['openai-compatible'], apiKey: e.target.value } })}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="nvapi-... 或其他 API Key"
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  {showApiKey ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                模型名称
              </label>
              <input
                type="text"
                value={localLLM['openai-compatible']?.model || ''}
                onChange={(e) => setLocalLLM({ ...localLLM, 'openai-compatible': { ...localLLM['openai-compatible'], model: e.target.value } })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="moonshotai/kimi-k2.5"
              />
              <p className="text-xs text-gray-500 mt-1">
                输入模型的完整名称，如 moonshotai/kimi-k2.5
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                额外参数 (JSON)
              </label>
              <textarea
                value={extraBodyText}
                onChange={(e) => {
                  setExtraBodyText(e.target.value);
                  setExtraBodyError('');
                  // Try to parse on change to update localLLM
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setLocalLLM({ ...localLLM, 'openai-compatible': { ...localLLM['openai-compatible'], extraBody: parsed } });
                  } catch {
                    // Will validate on blur
                  }
                }}
                onBlur={() => {
                  try {
                    const parsed = JSON.parse(extraBodyText);
                    setLocalLLM({ ...localLLM, 'openai-compatible': { ...localLLM['openai-compatible'], extraBody: parsed } });
                    setExtraBodyError('');
                  } catch (e) {
                    setExtraBodyError('JSON 格式错误，请使用小写 true/false');
                  }
                }}
                className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm ${extraBodyError ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                rows={3}
                placeholder='{"chat_template_kwargs": {"thinking": true}}'
              />
              {extraBodyError ? (
                <p className="text-xs text-red-500 mt-1">{extraBodyError}</p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  可选的额外请求参数，注意用小写 true/false
                </p>
              )}
            </div>
          </>
        )}

        {/* Test Connection */}
        <div className="flex items-center space-x-4">
          <button
            onClick={handleTestLLM}
            disabled={llmTestStatus === 'testing'}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {llmTestStatus === 'testing' ? '测试中...' : '测试连接'}
          </button>
          {llmTestStatus === 'success' && (
            <span className="text-green-500">✅ {llmTestMessage}</span>
          )}
          {llmTestStatus === 'error' && (
            <span className="text-red-500">❌ {llmTestMessage}</span>
          )}
        </div>
      </section>

      {/* Embedding Configuration */}
      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm mb-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
          🧠 嵌入模型配置 (RAG)
        </h2>

        {/* Provider Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            提供商
          </label>
          <div className="flex space-x-2">
            {(['ollama', 'openai', 'local'] as const).map((provider) => (
              <button
                key={provider}
                onClick={() => setLocalEmbedding({ ...localEmbedding, provider })}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  localEmbedding.provider === provider
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {provider === 'ollama' ? 'Ollama' : provider === 'openai' ? 'OpenAI' : '本地'}
              </button>
            ))}
          </div>
        </div>

        {localEmbedding.provider === 'ollama' && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                服务地址
              </label>
              <input
                type="text"
                value={localEmbedding.host || 'http://localhost:11434'}
                onChange={(e) => setLocalEmbedding({ ...localEmbedding, host: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                嵌入模型 {isLoadingModels && <span className="text-gray-500">(加载中...)</span>}
              </label>
              <div className="flex space-x-2">
                <select
                  value={localEmbedding.model || ''}
                  onChange={(e) => setLocalEmbedding({ ...localEmbedding, model: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isLoadingModels}
                >
                  {ollamaModels.length > 0 ? (
                    ollamaModels.map((model) => (
                      <option key={model} value={model}>{model}</option>
                    ))
                  ) : (
                    <option value="">
                      {isLoadingModels ? '加载中...' : '点击刷新按钮获取模型列表'}
                    </option>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    console.log('Embedding refresh button clicked!');
                    loadOllamaModels();
                  }}
                  disabled={isLoadingModels}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                  title="刷新模型列表"
                >
                  {isLoadingModels ? '⏳' : '🔄'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                选择支持嵌入的模型 (如 nomic-embed-text, mxbai-embed-large 等)
              </p>
            </div>
          </>
        )}

        {localEmbedding.provider === 'openai' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              模型
            </label>
            <select
              value={localEmbedding.model || ''}
              onChange={(e) => setLocalEmbedding({ ...localEmbedding, model: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="text-embedding-3-small">text-embedding-3-small</option>
              <option value="text-embedding-3-large">text-embedding-3-large</option>
              <option value="text-embedding-ada-002">text-embedding-ada-002</option>
            </select>
          </div>
        )}

        {localEmbedding.provider === 'local' && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            使用本地简单嵌入算法，无需外部服务。适合测试和离线使用。
          </p>
        )}

        {/* Test Embedding */}
        <div className="flex items-center space-x-4">
          <button
            onClick={handleTestEmbedding}
            disabled={embeddingTestStatus === 'testing'}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {embeddingTestStatus === 'testing' ? '测试中...' : '测试连接'}
          </button>
          {embeddingTestStatus === 'success' && (
            <span className="text-green-500">✅ {embeddingTestMessage}</span>
          )}
          {embeddingTestStatus === 'error' && (
            <span className="text-red-500">❌ {embeddingTestMessage}</span>
          )}
        </div>
      </section>

      {/* Storage Configuration */}
      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm mb-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
          💾 存储配置
        </h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            自动保存间隔（秒）
          </label>
          <input
            type="number"
            min="5"
            max="300"
            value={localProject.autoSaveInterval || 30}
            onChange={(e) => setLocalProject({ ...localProject, autoSaveInterval: parseInt(e.target.value) || 30 })}
            className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {localProject.lastPath && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              最近项目路径
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 p-2 rounded break-all">
              {localProject.lastPath}
            </p>
          </div>
        )}
      </section>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-4">
        <button
          onClick={handleReset}
          className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
        >
          恢复默认
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
}
