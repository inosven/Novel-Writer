import { create } from 'zustand';

interface LLMConfig {
  provider: 'claude' | 'openai' | 'ollama' | 'openai-compatible';
  claude: {
    apiKey: string;
    model: string;
  };
  openai: {
    apiKey: string;
    model: string;
  };
  ollama: {
    host: string;
    model: string;
  };
  'openai-compatible'?: {
    baseUrl: string;
    apiKey: string;
    model: string;
    extraBody?: Record<string, unknown>;
  };
}

interface EmbeddingConfig {
  provider: 'openai' | 'ollama' | 'local';
  model: string;
  host?: string;
  apiKey?: string;
}

interface ProjectConfig {
  lastPath: string | null;
  autoSaveInterval: number;
}

interface ConfigState {
  llm: LLMConfig;
  embedding: EmbeddingConfig;
  project: ProjectConfig;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadConfig: () => Promise<void>;
  saveConfig: (config: Partial<{ llm: Partial<LLMConfig>; embedding: Partial<EmbeddingConfig>; project: Partial<ProjectConfig> }>) => Promise<void>;
  testLLM: (config: any) => Promise<{ success: boolean; error?: string }>;
  testEmbedding: (config: any) => Promise<{ success: boolean; error?: string }>;
  getOllamaModels: (host?: string) => Promise<string[]>;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  llm: {
    provider: 'claude',
    claude: { apiKey: '', model: 'claude-sonnet-4-20250514' },
    openai: { apiKey: '', model: 'gpt-4o' },
    ollama: { host: 'http://localhost:11434', model: 'qwen3:30b' },
    'openai-compatible': { baseUrl: 'https://integrate.api.nvidia.com/v1', apiKey: '', model: 'moonshotai/kimi-k2.5', extraBody: { chat_template_kwargs: { thinking: true } } },
  },
  embedding: {
    provider: 'local',
    model: 'nomic-embed-text',
    host: 'http://localhost:11434',
  },
  project: {
    lastPath: null,
    autoSaveInterval: 30,
  },
  isLoading: false,
  error: null,

  loadConfig: async () => {
    if (!window.electronAPI?.config) {
      console.warn('electronAPI not available, using default config');
      set({ isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const config = await window.electronAPI.config.get();
      set({
        llm: config.llm,
        embedding: config.embedding,
        project: config.project,
        isLoading: false,
      });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  saveConfig: async (config) => {
    if (!window.electronAPI?.config) {
      console.warn('electronAPI not available, cannot save config');
      set({ error: 'Electron API not available', isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      await window.electronAPI.config.save(config);

      // Update local state
      const state = get();
      if (config.llm) {
        set({ llm: { ...state.llm, ...config.llm } });
      }
      if (config.embedding) {
        set({ embedding: { ...state.embedding, ...config.embedding } });
      }
      if (config.project) {
        set({ project: { ...state.project, ...config.project } });
      }

      set({ isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  testLLM: async (config: any) => {
    if (!window.electronAPI?.config?.testLLM) {
      console.warn('electronAPI not available for testLLM');
      return { success: false, error: 'Electron API not available' };
    }
    try {
      return await window.electronAPI.config.testLLM(config.provider, config);
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  testEmbedding: async (config: any) => {
    if (!window.electronAPI?.config?.testEmbedding) {
      console.warn('electronAPI not available for testEmbedding');
      return { success: false, error: 'Electron API not available' };
    }
    try {
      return await window.electronAPI.config.testEmbedding(config.provider, config);
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  getOllamaModels: async (host?: string) => {
    if (!window.electronAPI?.config?.getOllamaModels) {
      console.warn('electronAPI not available for getOllamaModels');
      return [];
    }
    try {
      const state = get();
      const ollamaHost = host || state.llm.ollama?.host || 'http://localhost:11434';
      return await window.electronAPI.config.getOllamaModels(ollamaHost);
    } catch (error) {
      console.error('Failed to get Ollama models:', error);
      return [];
    }
  },
}));
