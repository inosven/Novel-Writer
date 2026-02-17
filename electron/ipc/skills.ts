import type { IpcMain } from 'electron';
import { OrchestratorService } from '../services/OrchestratorService.js';

export function setupSkillsIPC(ipcMain: IpcMain) {
  // List available skills
  ipcMain.handle('skills:list', async () => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      return [];
    }
    return orchestrator.listSkills();
  });

  // Use a skill
  ipcMain.handle('skills:use', async (_, name: string) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    return orchestrator.useSkill(name);
  });

  // Get current skill
  ipcMain.handle('skills:get-current', async () => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      return null;
    }
    return orchestrator.getCurrentSkill();
  });

  // Get skill info (without loading full content)
  ipcMain.handle('skills:get-info', async (_, name: string) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    // For now, just load the full skill
    // TODO: Implement getSkillInfo in Orchestrator
    return orchestrator.useSkill(name);
  });
}
