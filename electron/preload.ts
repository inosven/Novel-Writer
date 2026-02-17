// Electron preload scripts support CommonJS require() natively
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // ============ Config API ============
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    save: (config: any) => ipcRenderer.invoke('config:save', config),
    testLLM: (provider: string, config: any) => ipcRenderer.invoke('config:test-llm', provider, config),
    testEmbedding: (provider: string, config: any) => ipcRenderer.invoke('config:test-embedding', provider, config),
    getOllamaModels: (host: string) => ipcRenderer.invoke('config:get-ollama-models', host),
  },

  // ============ Project API ============
  project: {
    init: (path: string, selectedSkill?: string) => ipcRenderer.invoke('project:init', path, selectedSkill),
    open: (path: string) => ipcRenderer.invoke('project:open', path),
    getStatus: () => ipcRenderer.invoke('project:status'),
    selectFolder: () => ipcRenderer.invoke('project:select-folder'),
    listSkills: () => ipcRenderer.invoke('project:list-skills'),
    saveCheckpoint: (description?: string) => ipcRenderer.invoke('project:save-checkpoint', description),
    listCheckpoints: () => ipcRenderer.invoke('project:list-checkpoints'),
    restoreCheckpoint: (id: string) => ipcRenderer.invoke('project:restore-checkpoint', id),
  },

  // ============ Planning API ============
  planning: {
    start: (idea: string) => ipcRenderer.invoke('planning:start', idea),
    continue: (sessionId: string, answers: any) => ipcRenderer.invoke('planning:continue', sessionId, answers),
    generateOutline: (sessionId: string) => ipcRenderer.invoke('planning:generate-outline', sessionId),
    refineOutline: (sessionId: string, feedback: string) => ipcRenderer.invoke('planning:refine-outline', sessionId, feedback),
    suggestCharacters: (sessionId: string) => ipcRenderer.invoke('planning:suggest-characters', sessionId),
    designCharacter: (sessionId: string, name: string, role?: string, requirements?: string) =>
      ipcRenderer.invoke('planning:design-character', sessionId, name, role, requirements),
    finalize: (sessionId: string, outline: string, characters: any[]) =>
      ipcRenderer.invoke('planning:finalize', sessionId, outline, characters),
    getSession: () => ipcRenderer.invoke('planning:get-session'),
    saveSession: (session: any) => ipcRenderer.invoke('planning:save-session', session),
  },

  // ============ Writing API ============
  writing: {
    writeChapter: (chapterIndex: number) => ipcRenderer.invoke('writing:write-chapter', chapterIndex),
    continueWriting: (content: string) => ipcRenderer.invoke('writing:continue', content),
    editChapter: (chapterIndex: number, instruction: string, targetSection?: string) =>
      ipcRenderer.invoke('writing:edit-chapter', chapterIndex, instruction, targetSection),
    reviewChapter: (chapterIndex: number) => ipcRenderer.invoke('writing:review-chapter', chapterIndex),
    saveDraft: (chapterIndex: number, content: string) => ipcRenderer.invoke('writing:save-draft', chapterIndex, content),
    getDraft: (chapterIndex: number) => ipcRenderer.invoke('writing:get-draft', chapterIndex),
    // Streaming handlers
    onChunk: (callback: (data: any) => void) => {
      const listener = (_: any, data: any) => callback(data);
      ipcRenderer.on('writing:chunk', listener);
      return () => ipcRenderer.removeListener('writing:chunk', listener);
    },
    onComplete: (callback: (data: any) => void) => {
      const listener = (_: any, data: any) => callback(data);
      ipcRenderer.on('writing:complete', listener);
      return () => ipcRenderer.removeListener('writing:complete', listener);
    },
    onError: (callback: (error: any) => void) => {
      const listener = (_: any, error: any) => callback(error);
      ipcRenderer.on('writing:error', listener);
      return () => ipcRenderer.removeListener('writing:error', listener);
    },
  },

  // ============ Characters API ============
  characters: {
    list: () => ipcRenderer.invoke('characters:list'),
    get: (name: string) => ipcRenderer.invoke('characters:get', name),
    create: (name: string, profile: string) => ipcRenderer.invoke('characters:create', name, profile),
    update: (name: string, updates: any) => ipcRenderer.invoke('characters:update', name, updates),
    delete: (name: string) => ipcRenderer.invoke('characters:delete', name),
  },

  // ============ Outline API ============
  outline: {
    get: () => ipcRenderer.invoke('outline:get'),
    update: (updates: any) => ipcRenderer.invoke('outline:update', updates),
    getHistory: () => ipcRenderer.invoke('outline:get-history'),
    restore: (historyId: string) => ipcRenderer.invoke('outline:restore', historyId),
  },

  // ============ Chapters API ============
  chapters: {
    list: () => ipcRenderer.invoke('chapters:list'),
    get: (index: number) => ipcRenderer.invoke('chapters:get', index),
    update: (index: number, content: string) => ipcRenderer.invoke('chapters:update', index, content),
  },

  // ============ Skills API ============
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    use: (name: string) => ipcRenderer.invoke('skills:use', name),
    getCurrent: () => ipcRenderer.invoke('skills:get-current'),
    getInfo: (name: string) => ipcRenderer.invoke('skills:get-info', name),
  },

  // ============ App Events ============
  app: {
    onBeforeQuit: (callback: () => void) => {
      ipcRenderer.on('app:before-quit', callback);
      return () => ipcRenderer.removeListener('app:before-quit', callback);
    },
  },
});

// Type definitions for renderer process
export interface ElectronAPI {
  config: {
    get: () => Promise<any>;
    save: (config: any) => Promise<void>;
    testLLM: (provider: string, config: any) => Promise<{ success: boolean; error?: string }>;
    testEmbedding: (provider: string, config: any) => Promise<{ success: boolean; error?: string }>;
    getOllamaModels: (host: string) => Promise<string[]>;
  };
  project: {
    init: (path: string, selectedSkill?: string) => Promise<void>;
    open: (path: string) => Promise<void>;
    getStatus: () => Promise<any>;
    selectFolder: () => Promise<string | null>;
    listSkills: () => Promise<string[]>;
    saveCheckpoint: (description?: string) => Promise<string>;
    listCheckpoints: () => Promise<any[]>;
    restoreCheckpoint: (id: string) => Promise<void>;
  };
  planning: {
    start: (idea: string) => Promise<any>;
    continue: (sessionId: string, answers: any) => Promise<any>;
    generateOutline: (sessionId: string) => Promise<any>;
    refineOutline: (sessionId: string, feedback: string) => Promise<any>;
    suggestCharacters: (sessionId: string) => Promise<any>;
    designCharacter: (sessionId: string, name: string, role?: string, requirements?: string) => Promise<string>;
    finalize: (sessionId: string, outline: string, characters: any[]) => Promise<void>;
    getSession: () => Promise<any>;
    saveSession: (session: any) => Promise<void>;
  };
  writing: {
    writeChapter: (chapterIndex: number) => Promise<any>;
    continueWriting: (content: string) => Promise<string>;
    editChapter: (chapterIndex: number, instruction: string, targetSection?: string) => Promise<string>;
    reviewChapter: (chapterIndex: number) => Promise<any>;
    saveDraft: (chapterIndex: number, content: string) => Promise<void>;
    getDraft: (chapterIndex: number) => Promise<string | null>;
    onChunk: (callback: (data: any) => void) => () => void;
    onComplete: (callback: (data: any) => void) => () => void;
    onError: (callback: (error: any) => void) => () => void;
  };
  characters: {
    list: () => Promise<string[]>;
    get: (name: string) => Promise<any>;
    create: (name: string, profile: string) => Promise<any>;
    update: (name: string, updates: any) => Promise<any>;
    delete: (name: string) => Promise<{ deleted: boolean; warnings: string[] }>;
  };
  outline: {
    get: () => Promise<any>;
    update: (updates: any) => Promise<any>;
    getHistory: () => Promise<any[]>;
    restore: (historyId: string) => Promise<any>;
  };
  chapters: {
    list: () => Promise<any[]>;
    get: (index: number) => Promise<string>;
    update: (index: number, content: string) => Promise<void>;
  };
  skills: {
    list: () => Promise<string[]>;
    use: (name: string) => Promise<any>;
    getCurrent: () => Promise<any>;
    getInfo: (name: string) => Promise<any>;
  };
  app: {
    onBeforeQuit: (callback: () => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
