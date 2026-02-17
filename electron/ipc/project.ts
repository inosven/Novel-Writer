import type { IpcMain } from 'electron';
import { createRequire } from 'module';
import * as fs from 'fs/promises';
import * as path from 'path';
import { OrchestratorService } from '../services/OrchestratorService.js';
import { configStore } from './config.js';

const electronRequire = createRequire(import.meta.url);
const { dialog, app } = electronRequire('electron');

function getAppRoot(): string {
  const isDev = !app.isPackaged;
  return isDev ? process.cwd() : app.getAppPath();
}

export function setupProjectIPC(ipcMain: IpcMain) {
  // List available skill templates
  ipcMain.handle('project:list-skills', async () => {
    const templatePath = path.join(getAppRoot(), 'templates/default-project/.claude/skills');
    console.log('Looking for skills at:', templatePath);
    try {
      const entries = await fs.readdir(templatePath, { withFileTypes: true });
      const skills = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
      console.log('Available skills:', skills);
      return skills;
    } catch (error) {
      console.error('Failed to list skills:', error);
      return [];
    }
  });

  // Initialize a new project with optional skill selection
  ipcMain.handle('project:init', async (_, projectPath: string, selectedSkill?: string) => {
    await OrchestratorService.initProject(projectPath, selectedSkill);
    configStore.set('project.lastPath', projectPath);
  });

  // Open an existing project
  ipcMain.handle('project:open', async (_, projectPath: string) => {
    console.log('Opening project:', projectPath);
    try {
      await OrchestratorService.openProject(projectPath);
      configStore.set('project.lastPath', projectPath);
      console.log('Project opened successfully');
    } catch (error) {
      console.error('Failed to open project:', error);
      throw error;
    }
  });

  // Get project status
  ipcMain.handle('project:status', async () => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      console.log('No orchestrator available for status');
      return null;
    }
    try {
      const status = await orchestrator.getProjectStatus();
      console.log('Project status:', status);
      return status;
    } catch (error) {
      console.error('Failed to get project status:', error);
      return null;
    }
  });

  // Open folder dialog
  ipcMain.handle('project:select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择项目文件夹',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // Save checkpoint
  ipcMain.handle('project:save-checkpoint', async (_, description?: string) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    return orchestrator.saveCheckpoint(description);
  });

  // List checkpoints
  ipcMain.handle('project:list-checkpoints', async () => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      return [];
    }
    return orchestrator.listCheckpoints();
  });

  // Restore checkpoint
  ipcMain.handle('project:restore-checkpoint', async (_, checkpointId: string) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    await orchestrator.restoreCheckpoint(checkpointId);
  });
}
