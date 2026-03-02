/**
 * @module electron/ipc/skills
 * @description 技能系统的 IPC 处理器。
 * 技能（Skill）是一组写作风格预设，包含方法论、模板、示例等。
 *
 * IPC channels:
 * - skills:list        — 列出可用技能
 * - skills:use         — 激活指定技能
 * - skills:get-current — 获取当前激活的技能
 * - skills:get-info    — 获取技能详细信息
 */
import type { IpcMain } from 'electron';
import { OrchestratorService } from '../services/OrchestratorService.js';

const TAG = '[IPC:skills]';

export function setupSkillsIPC(ipcMain: IpcMain) {
  // List available skills
  ipcMain.handle('skills:list', async () => {
    console.log(`${TAG} list`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      return [];
    }
    const skills = await orchestrator.listSkills();
    console.log(`${TAG} list — ${skills.length} skills`);
    return skills;
  });

  // Use a skill
  ipcMain.handle('skills:use', async (_, name: string) => {
    console.log(`${TAG} use: "${name}"`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    const result = await orchestrator.useSkill(name);
    console.log(`${TAG} use: "${name}" — OK`);
    return result;
  });

  // Get current skill
  ipcMain.handle('skills:get-current', async () => {
    console.log(`${TAG} get-current`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      return null;
    }
    return orchestrator.getCurrentSkill();
  });

  // Get skill info (without loading full content)
  ipcMain.handle('skills:get-info', async (_, name: string) => {
    console.log(`${TAG} get-info: "${name}"`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    return orchestrator.useSkill(name);
  });
}
