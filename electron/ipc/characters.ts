/**
 * @module electron/ipc/characters
 * @description 角色管理的 IPC 处理器。
 * 提供角色的列表、获取、创建、更新、删除功能。
 *
 * IPC channels:
 * - characters:list   — 列出所有角色名称
 * - characters:get    — 获取角色详情（Markdown）
 * - characters:create — 创建新角色
 * - characters:update — 更新角色信息
 * - characters:delete — 删除角色
 */
import type { IpcMain } from 'electron';
import { OrchestratorService } from '../services/OrchestratorService.js';

const TAG = '[IPC:characters]';

export function setupCharactersIPC(ipcMain: IpcMain) {
  // List all characters
  ipcMain.handle('characters:list', async () => {
    console.log(`${TAG} list`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      return [];
    }
    const names = await orchestrator.listCharacters();
    console.log(`${TAG} list — ${names.length} characters`);
    return names;
  });

  // Get character details
  ipcMain.handle('characters:get', async (_, name: string) => {
    console.log(`${TAG} get: "${name}"`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      return null;
    }
    const result = await orchestrator.getCharacter(name);
    console.log(`${TAG} get: "${name}" — ${result ? 'found' : 'not found'}`);
    return result;
  });

  // Create character
  ipcMain.handle('characters:create', async (_, name: string, profile: string) => {
    console.log(`${TAG} create: "${name}", profileLen=${profile.length}`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    const result = await orchestrator.createCharacter(name, profile);
    console.log(`${TAG} create: "${name}" — OK`);
    return result;
  });

  // Update character
  ipcMain.handle('characters:update', async (_, name: string, updates: any) => {
    console.log(`${TAG} update: "${name}"`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    const result = await orchestrator.updateCharacter(name, updates);
    console.log(`${TAG} update: "${name}" — OK`);
    return result;
  });

  // Delete character
  ipcMain.handle('characters:delete', async (_, name: string) => {
    console.log(`${TAG} delete: "${name}"`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    const result = await orchestrator.deleteCharacter(name);
    console.log(`${TAG} delete: "${name}" — OK`);
    return result;
  });
}
