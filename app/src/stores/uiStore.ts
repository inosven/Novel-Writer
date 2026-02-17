import { create } from 'zustand';

interface UIState {
  // Save status
  lastSaved: Date | null;
  isSaving: boolean;

  // Modals
  isSettingsOpen: boolean;
  isNewProjectOpen: boolean;

  // Toast notifications
  toasts: Array<{
    id: string;
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
  }>;

  // Actions
  setLastSaved: (date: Date | null) => void;
  setIsSaving: (saving: boolean) => void;
  openSettings: () => void;
  closeSettings: () => void;
  openNewProject: () => void;
  closeNewProject: () => void;
  addToast: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  lastSaved: null,
  isSaving: false,
  isSettingsOpen: false,
  isNewProjectOpen: false,
  toasts: [],

  setLastSaved: (date) => set({ lastSaved: date }),
  setIsSaving: (saving) => set({ isSaving: saving }),

  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),

  openNewProject: () => set({ isNewProjectOpen: true }),
  closeNewProject: () => set({ isNewProjectOpen: false }),

  addToast: (type, message) => {
    const id = Date.now().toString();
    set({ toasts: [...get().toasts, { id, type, message }] });

    // Auto remove after 5 seconds
    setTimeout(() => {
      get().removeToast(id);
    }, 5000);
  },

  removeToast: (id) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
