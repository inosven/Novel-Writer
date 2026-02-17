import type { IpcMain } from 'electron';
import StoreModule from 'electron-store';
import { OrchestratorService } from '../services/OrchestratorService.js';

// Handle ESM/CJS interop - when bundled to CJS, default export is on .default
const Store = (StoreModule as any).default || StoreModule;

// Config store schema
interface ConfigSchema {
  llm: {
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
    'openai-compatible': {
      baseUrl: string;
      apiKey: string;
      model: string;
      extraBody?: Record<string, unknown>;
    };
  };
  embedding: {
    provider: 'openai' | 'ollama' | 'local';
    model: string;
    host?: string;
    apiKey?: string;
  };
  project: {
    lastPath: string | null;
    autoSaveInterval: number;
  };
}

const store = new Store({
  name: 'novelwriter-config',
  projectName: 'novel-writer',
  defaults: {
    llm: {
      provider: 'ollama',
      claude: {
        apiKey: '',
        model: 'claude-sonnet-4-20250514',
      },
      openai: {
        apiKey: '',
        model: 'gpt-4o',
      },
      ollama: {
        host: 'http://localhost:11434',
        model: 'qwen3:30b',
      },
      'openai-compatible': {
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        apiKey: '',
        model: 'moonshotai/kimi-k2.5',
        extraBody: { chat_template_kwargs: { thinking: true } },
      },
    },
    embedding: {
      provider: 'ollama',
      model: 'qwen3-embedding',
      host: 'http://localhost:11434',
    },
    project: {
      lastPath: null,
      autoSaveInterval: 30,
    },
  },
});

export function setupConfigIPC(ipcMain: IpcMain) {
  // Get all config
  ipcMain.handle('config:get', async () => {
    return store.store;
  });

  // Save config
  ipcMain.handle('config:save', async (_, config: Partial<ConfigSchema>) => {
    console.log('=== config:save called ===');
    console.log('Incoming config:', JSON.stringify(config, null, 2));

    // Merge with existing config
    if (config.llm) {
      const oldLLM = store.get('llm');
      const newLLM = { ...oldLLM, ...config.llm };
      console.log('Old LLM config:', JSON.stringify(oldLLM, null, 2));
      console.log('New LLM config:', JSON.stringify(newLLM, null, 2));
      store.set('llm', newLLM);
    }
    if (config.embedding) {
      store.set('embedding', { ...store.get('embedding'), ...config.embedding });
    }
    if (config.project) {
      store.set('project', { ...store.get('project'), ...config.project });
    }

    // Refresh LLM provider if config changed and orchestrator is active
    if (config.llm) {
      console.log('Attempting to refresh LLM provider...');
      try {
        await OrchestratorService.refreshLLMProvider();
        console.log('LLM provider refreshed after config save');
      } catch (error) {
        console.log('Could not refresh LLM provider (no active project?):', error);
      }
    }
  });

  // Test LLM connection
  ipcMain.handle('config:test-llm', async (_, provider: string, config: any) => {
    try {
      switch (provider) {
        case 'claude': {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: config.model || 'claude-sonnet-4-20250514',
              max_tokens: 10,
              messages: [{ role: 'user', content: 'Hi' }],
            }),
          });
          if (!response.ok) {
            const error = await response.text();
            return { success: false, error };
          }
          return { success: true };
        }

        case 'openai': {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              model: config.model || 'gpt-4o',
              max_tokens: 10,
              messages: [{ role: 'user', content: 'Hi' }],
            }),
          });
          if (!response.ok) {
            const error = await response.text();
            return { success: false, error };
          }
          return { success: true };
        }

        case 'ollama': {
          const host = config.host || 'http://localhost:11434';
          const response = await fetch(`${host}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: config.model || 'llama2',
              prompt: 'Hi',
              stream: false,
            }),
          });
          if (!response.ok) {
            const error = await response.text();
            return { success: false, error };
          }
          return { success: true };
        }

        case 'openai-compatible': {
          const baseUrl = config.baseUrl || '';
          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              model: config.model || '',
              max_tokens: 10,
              messages: [{ role: 'user', content: 'Hi' }],
              ...(config.extraBody || {}),
            }),
          });
          if (!response.ok) {
            const error = await response.text();
            return { success: false, error };
          }
          return { success: true };
        }

        default:
          return { success: false, error: 'Unknown provider' };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Test embedding connection
  ipcMain.handle('config:test-embedding', async (_, provider: string, config: any) => {
    try {
      switch (provider) {
        case 'openai': {
          const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              model: config.model || 'text-embedding-3-small',
              input: 'test',
            }),
          });
          if (!response.ok) {
            const error = await response.text();
            return { success: false, error };
          }
          return { success: true };
        }

        case 'ollama': {
          const host = config.host || 'http://localhost:11434';
          const response = await fetch(`${host}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: config.model || 'nomic-embed-text',
              prompt: 'test',
            }),
          });
          if (!response.ok) {
            const error = await response.text();
            return { success: false, error };
          }
          return { success: true };
        }

        case 'local':
          return { success: true };

        default:
          return { success: false, error: 'Unknown provider' };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Get Ollama models
  ipcMain.handle('config:get-ollama-models', async (_, host: string) => {
    try {
      console.log('Fetching Ollama models from:', host);
      const response = await fetch(`${host}/api/tags`);
      if (!response.ok) {
        console.error('Failed to get Ollama models:', response.status, response.statusText);
        throw new Error('Failed to get models');
      }
      const data = await response.json();
      const models = data.models?.map((m: any) => m.name) || [];
      console.log('Ollama models found:', models);
      return models;
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
      return [];
    }
  });
}

export { store as configStore };
