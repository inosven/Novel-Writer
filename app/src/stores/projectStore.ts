import { create } from 'zustand';

interface ProjectStatus {
  phase: string;
  currentSkill: string | null;
  outlineExists: boolean;
  characterCount: number;
  chapterCount: number;
  completedChapters: number;
  lastModified: Date;
}

interface Checkpoint {
  id: string;
  timestamp: string;
  description?: string;
}

interface ProjectState {
  projectPath: string | null;
  projectName: string | null;
  status: ProjectStatus | null;
  checkpoints: Checkpoint[];
  availableSkills: string[];
  isLoading: boolean;
  error: string | null;

  // Actions
  initProject: (path: string, selectedSkill?: string) => Promise<void>;
  openProject: (path: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  selectFolder: () => Promise<string | null>;
  listAvailableSkills: () => Promise<string[]>;
  saveCheckpoint: (description?: string) => Promise<string>;
  listCheckpoints: () => Promise<void>;
  restoreCheckpoint: (id: string) => Promise<void>;
  closeProject: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projectPath: null,
  projectName: null,
  status: null,
  checkpoints: [],
  availableSkills: [],
  isLoading: false,
  error: null,

  initProject: async (path, selectedSkill) => {
    if (!window.electronAPI?.project?.init) {
      console.warn('electronAPI not available for initProject');
      set({ error: 'Electron API not available', isLoading: false });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      await window.electronAPI.project.init(path, selectedSkill);
      const name = path.split(/[/\\]/).pop() || 'Untitled';
      set({ projectPath: path, projectName: name, isLoading: false });
      await get().refreshStatus();
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  openProject: async (path) => {
    if (!window.electronAPI?.project?.open) {
      console.warn('electronAPI not available for openProject');
      set({ error: 'Electron API not available', isLoading: false });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      await window.electronAPI.project.open(path);
      const name = path.split(/[/\\]/).pop() || 'Untitled';
      set({ projectPath: path, projectName: name, isLoading: false });
      await get().refreshStatus();
      await get().listCheckpoints();
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  refreshStatus: async () => {
    if (!window.electronAPI?.project?.getStatus) {
      return;
    }
    try {
      const status = await window.electronAPI.project.getStatus();
      if (status) {
        set({ status: { ...status, lastModified: new Date(status.lastModified) } });
      }
    } catch (error) {
      console.error('Failed to refresh status:', error);
    }
  },

  selectFolder: async () => {
    if (!window.electronAPI?.project?.selectFolder) {
      console.warn('electronAPI not available for selectFolder');
      return null;
    }
    return window.electronAPI.project.selectFolder();
  },

  listAvailableSkills: async () => {
    if (!window.electronAPI?.project?.listSkills) {
      console.warn('electronAPI not available for listSkills');
      return [];
    }
    try {
      const skills = await window.electronAPI.project.listSkills();
      set({ availableSkills: skills });
      return skills;
    } catch (error) {
      console.error('Failed to list skills:', error);
      return [];
    }
  },

  saveCheckpoint: async (description) => {
    const id = await window.electronAPI.project.saveCheckpoint(description);
    await get().listCheckpoints();
    return id;
  },

  listCheckpoints: async () => {
    try {
      const checkpoints = await window.electronAPI.project.listCheckpoints();
      set({ checkpoints });
    } catch (error) {
      console.error('Failed to list checkpoints:', error);
    }
  },

  restoreCheckpoint: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await window.electronAPI.project.restoreCheckpoint(id);
      await get().refreshStatus();
      set({ isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  closeProject: () => {
    set({
      projectPath: null,
      projectName: null,
      status: null,
      checkpoints: [],
      error: null,
    });
  },
}));
