import type { IpcMain } from 'electron';
import { OrchestratorService } from '../services/OrchestratorService.js';
import StoreModule from 'electron-store';

// Handle ESM/CJS interop - when bundled to CJS, default export is on .default
const Store = (StoreModule as any).default || StoreModule;

// Planning session persistence
const sessionStore = new Store({
  name: 'novelwriter-planning-session',
  projectName: 'novel-writer',
});

// Session history/backup store
const historyStore = new Store({
  name: 'novelwriter-planning-history',
  projectName: 'novel-writer',
});

const MAX_HISTORY = 20;

/**
 * Backup the current session to history before it gets overwritten or cleared.
 * Only backs up sessions that have meaningful content (more than the welcome message).
 */
function backupCurrentSession() {
  try {
    const current = sessionStore.get('session') as any;
    if (!current || !current.id) return;

    // Only backup if session has user content
    const hasUserMessages = Array.isArray(current.messages) &&
      current.messages.some((m: any) => m.role === 'user');
    const hasOutline = !!current.outlineDraft;
    const hasAnswers = current.answers && Object.keys(current.answers).length > 0;

    if (!hasUserMessages && !hasOutline && !hasAnswers) return;

    const history: any[] = (historyStore.get('sessions') as any[]) || [];

    // Don't duplicate if the same session ID already exists in history
    if (history.some((h: any) => h.id === current.id)) return;

    // Add timestamp for display
    current.backedUpAt = new Date().toISOString();

    // Add to front of history
    history.unshift(current);

    // Keep only the most recent sessions
    if (history.length > MAX_HISTORY) {
      history.length = MAX_HISTORY;
    }

    historyStore.set('sessions', history);
    console.log(`[Planning] Backed up session ${current.id} to history (${history.length} total)`);
  } catch (error) {
    console.error('[Planning] Failed to backup session:', error);
  }
}

export function setupPlanningIPC(ipcMain: IpcMain) {
  // Start planning
  ipcMain.handle('planning:start', async (_, idea: string) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }

    // Backup current session before starting a new one
    backupCurrentSession();

    const session = await orchestrator.startPlanning(idea);
    OrchestratorService.setPlanningSession(session);

    // Persist session
    sessionStore.set('session', session);

    return session;
  });

  // Continue planning with answers
  ipcMain.handle('planning:continue', async (_, sessionId: string, answers: Record<string, string>) => {
    console.log('planning:continue called with sessionId:', sessionId);
    console.log('planning:continue incoming answers:', JSON.stringify(answers, null, 2));

    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }

    let session = OrchestratorService.getPlanningSession();
    console.log('Current session:', session?.id, 'Looking for:', sessionId);

    if (!session || session.id !== sessionId) {
      // Try to recover from persistent storage
      const stored = sessionStore.get('session') as any;
      console.log('Stored session:', stored?.id);
      if (stored && stored.id === sessionId) {
        session = stored;
        OrchestratorService.setPlanningSession(session);
        console.log('Recovered session from storage');
      } else {
        throw new Error(`Planning session not found. Session: ${session?.id}, Looking for: ${sessionId}`);
      }
    }

    session = await orchestrator.continuePlanning(session, answers);
    console.log('planning:continue after continuePlanning, session.answers:', JSON.stringify(session.answers, null, 2));
    OrchestratorService.setPlanningSession(session);

    // Persist session
    sessionStore.set('session', session);
    console.log('planning:continue session saved to store');

    return session;
  });

  // Generate outline draft
  ipcMain.handle('planning:generate-outline', async (_, sessionId: string) => {
    console.log('[planning:generate-outline] Called with sessionId:', sessionId);

    try {
      const orchestrator = OrchestratorService.getOrchestrator();
      if (!orchestrator) {
        throw new Error('No project open');
      }

      let session = OrchestratorService.getPlanningSession();
      if (!session || session.id !== sessionId) {
        throw new Error('Planning session not found');
      }

      console.log('[planning:generate-outline] Session found, generating outline...');
      console.log('[planning:generate-outline] userIdea:', session.userIdea?.substring(0, 100));

      session = await orchestrator.generateOutlineDraft(session);
      OrchestratorService.setPlanningSession(session);

      // Persist session
      sessionStore.set('session', session);

      console.log('[planning:generate-outline] Success, outlineDraft length:', session.outlineDraft?.length);
      return session;
    } catch (error: any) {
      console.error('[planning:generate-outline] Error:', error);
      throw new Error(`Failed to generate outline: ${error?.message || 'Unknown error'}`);
    }
  });

  // Refine outline
  ipcMain.handle('planning:refine-outline', async (_, sessionId: string, feedback: string) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }

    let session = OrchestratorService.getPlanningSession();
    if (!session || session.id !== sessionId) {
      throw new Error('Planning session not found');
    }

    session = await orchestrator.refineOutline(session, feedback);
    OrchestratorService.setPlanningSession(session);

    // Persist session
    sessionStore.set('session', session);

    return session;
  });

  // Suggest characters
  ipcMain.handle('planning:suggest-characters', async (_, sessionId: string) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }

    let session = OrchestratorService.getPlanningSession();
    if (!session || session.id !== sessionId) {
      throw new Error('Planning session not found');
    }

    session = await orchestrator.suggestCharacters(session);
    OrchestratorService.setPlanningSession(session);

    // Persist session
    sessionStore.set('session', session);

    return session;
  });

  // Design character
  ipcMain.handle('planning:design-character', async (_, sessionId: string, name: string, role?: string, requirements?: string) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }

    const session = OrchestratorService.getPlanningSession();
    if (!session || session.id !== sessionId) {
      throw new Error('Planning session not found');
    }

    return orchestrator.designCharacter(session, name, role, requirements);
  });

  // Finalize planning
  ipcMain.handle('planning:finalize', async (_, sessionId: string, outline: string, characters: Array<{ name: string; profile: string }>) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }

    const session = OrchestratorService.getPlanningSession();
    if (!session || session.id !== sessionId) {
      throw new Error('Planning session not found');
    }

    await orchestrator.finalizePlanning(session, outline, characters);

    // Clear session
    OrchestratorService.setPlanningSession(null);
    sessionStore.delete('session');
  });

  // Get current session (for recovery)
  ipcMain.handle('planning:get-session', async () => {
    // First try memory
    let session = OrchestratorService.getPlanningSession();
    if (session) {
      return session;
    }

    // Try persistent storage
    const stored = sessionStore.get('session') as any;
    if (stored) {
      OrchestratorService.setPlanningSession(stored);
      return stored;
    }

    return null;
  });

  // Save session manually (or clear if null)
  ipcMain.handle('planning:save-session', async (_, session: any) => {
    console.log('[planning:save-session] Called');
    console.log('[planning:save-session] Session answers:', JSON.stringify(session?.answers, null, 2));
    console.log('[planning:save-session] Session userIdea:', session?.userIdea?.substring(0, 50));

    if (session === null || session === undefined) {
      // Backup before clearing
      backupCurrentSession();
      OrchestratorService.setPlanningSession(null);
      sessionStore.delete('session');
    } else {
      OrchestratorService.setPlanningSession(session);
      sessionStore.set('session', session);
    }
  });

  // ============ Session History / Backup ============

  // List all backed-up sessions
  ipcMain.handle('planning:list-history', async () => {
    const history: any[] = (historyStore.get('sessions') as any[]) || [];
    // Return summary info only (not full messages) for the list view
    return history.map((s: any) => ({
      id: s.id,
      phase: s.phase,
      userIdea: s.userIdea || '',
      backedUpAt: s.backedUpAt,
      messageCount: Array.isArray(s.messages) ? s.messages.length : 0,
      hasOutline: !!s.outlineDraft,
      characterCount: Array.isArray(s.characterSuggestions) ? s.characterSuggestions.length : 0,
    }));
  });

  // Restore a session from history
  ipcMain.handle('planning:restore-from-history', async (_, historySessionId: string) => {
    const history: any[] = (historyStore.get('sessions') as any[]) || [];
    const target = history.find((s: any) => s.id === historySessionId);
    if (!target) {
      throw new Error('History session not found');
    }

    // Backup current session before restoring
    backupCurrentSession();

    // Restore the target session
    OrchestratorService.setPlanningSession(target);
    sessionStore.set('session', target);

    console.log(`[Planning] Restored session ${historySessionId} from history`);
    return target;
  });

  // Delete a session from history
  ipcMain.handle('planning:delete-history', async (_, historySessionId: string) => {
    const history: any[] = (historyStore.get('sessions') as any[]) || [];
    const filtered = history.filter((s: any) => s.id !== historySessionId);
    historyStore.set('sessions', filtered);
    console.log(`[Planning] Deleted session ${historySessionId} from history`);
  });
}
