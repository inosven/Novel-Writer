import type { IpcMain } from 'electron';
import { OrchestratorService } from '../services/OrchestratorService.js';

export function setupOutlineIPC(ipcMain: IpcMain) {
  // Get outline
  ipcMain.handle('outline:get', async () => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      return null;
    }
    return orchestrator.getOutline();
  });

  // Update outline
  ipcMain.handle('outline:update', async (_, updates: any) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    return orchestrator.updateOutline(updates);
  });

  // Get outline history
  ipcMain.handle('outline:get-history', async () => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      return [];
    }
    return orchestrator.getOutlineHistory();
  });

  // Restore outline from history
  ipcMain.handle('outline:restore', async (_, historyId: string) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    return orchestrator.restoreOutline(historyId);
  });
}
