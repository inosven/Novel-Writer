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

export function setupPlanningIPC(ipcMain: IpcMain) {
  // Start planning
  ipcMain.handle('planning:start', async (_, idea: string) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }

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
      // Clear session
      OrchestratorService.setPlanningSession(null);
      sessionStore.delete('session');
    } else {
      OrchestratorService.setPlanningSession(session);
      sessionStore.set('session', session);
    }
  });
}
