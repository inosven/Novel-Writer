import type { IpcMain } from 'electron';
import { OrchestratorService } from '../services/OrchestratorService.js';

export function setupCharactersIPC(ipcMain: IpcMain) {
  // List all characters
  ipcMain.handle('characters:list', async () => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      return [];
    }
    return orchestrator.listCharacters();
  });

  // Get character details
  ipcMain.handle('characters:get', async (_, name: string) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      return null;
    }
    return orchestrator.getCharacter(name);
  });

  // Create character
  ipcMain.handle('characters:create', async (_, name: string, profile: string) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    return orchestrator.createCharacter(name, profile);
  });

  // Update character
  ipcMain.handle('characters:update', async (_, name: string, updates: any) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    return orchestrator.updateCharacter(name, updates);
  });

  // Delete character
  ipcMain.handle('characters:delete', async (_, name: string) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    return orchestrator.deleteCharacter(name);
  });
}
