/**
 * @module electron/ipc/planning
 * @description 故事规划流程的 IPC 处理器。
 * 管理多轮对话式策划：需求收集 → 大纲生成 → 角色建议 → 定稿。
 * 规划会话通过 electron-store 持久化，支持历史回溯。
 *
 * IPC channels:
 * - planning:start               — 开始新的规划会话
 * - planning:continue            — 继续多轮对话
 * - planning:generate-outline    — 生成大纲草案
 * - planning:refine-outline      — 根据反馈修改大纲
 * - planning:suggest-characters  — AI 建议角色
 * - planning:design-character    — AI 设计角色详情
 * - planning:finalize            — 定稿（保存大纲和角色）
 * - planning:get-session         — 获取当前规划会话
 * - planning:save-session        — 保存规划会话
 * - planning:list-history        — 列出规划历史
 * - planning:restore-from-history — 恢复历史规划
 * - planning:delete-history      — 删除规划历史
 */
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

const MAX_HISTORY = 50;

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

    saveSessionToHistory(current);
  } catch (error) {
    console.error('[Planning] Failed to backup session:', error);
  }
}

/**
 * Save/update a session in history.
 * If same session ID exists, UPDATE it (keep latest version).
 * If new session ID, INSERT at front.
 * Called after every meaningful save so history always has the latest state.
 */
function saveSessionToHistory(session: any) {
  try {
    if (!session || !session.id) return;

    const history: any[] = (historyStore.get('sessions') as any[]) || [];

    session.backedUpAt = new Date().toISOString();

    // Find existing entry for this session
    const existingIdx = history.findIndex((h: any) => h.id === session.id);

    if (existingIdx !== -1) {
      // UPDATE existing entry with latest data
      history[existingIdx] = session;
    } else {
      // INSERT new entry at front
      history.unshift(session);
    }

    // Keep only the most recent sessions
    if (history.length > MAX_HISTORY) {
      history.length = MAX_HISTORY;
    }

    historyStore.set('sessions', history);
    console.log(`[Planning] Saved session ${session.id} to history (${existingIdx !== -1 ? 'updated' : 'new'}, ${history.length} total)`);
  } catch (error) {
    console.error('[Planning] Failed to save session to history:', error);
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
    saveSessionToHistory(session);

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
    saveSessionToHistory(session);
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
      saveSessionToHistory(session);

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
    saveSessionToHistory(session);

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
    saveSessionToHistory(session);

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

    // Mark session as finalized and keep in storage so the conversation
    // persists across restarts. User can start fresh via the reset button.
    (session as any).phase = 'finalized';
    OrchestratorService.setPlanningSession(session);
    sessionStore.set('session', session);
    saveSessionToHistory(session);
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
      saveSessionToHistory(session);
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
