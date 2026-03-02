/**
 * @module electron/ipc/outline
 * @description 大纲管理的 IPC 处理器。
 * 提供大纲的 CRUD、AI 优化、版本历史与回滚功能。
 *
 * IPC channels:
 * - outline:get         — 获取当前大纲
 * - outline:update      — 更新大纲
 * - outline:get-history — 获取大纲版本历史
 * - outline:refine      — AI 根据反馈优化大纲
 * - outline:restore     — 从历史版本恢复大纲
 */
import type { IpcMain } from 'electron';
import { OrchestratorService } from '../services/OrchestratorService.js';

const TAG = '[IPC:outline]';

export function setupOutlineIPC(ipcMain: IpcMain) {
  // Get outline
  ipcMain.handle('outline:get', async () => {
    console.log(`${TAG} outline:get`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      console.log(`${TAG} outline:get — no project open`);
      return null;
    }
    const outline = await orchestrator.getOutline();
    console.log(`${TAG} outline:get — ${outline?.chapters?.length ?? 0} chapters`);
    return outline;
  });

  // Update outline
  ipcMain.handle('outline:update', async (_, updates: any) => {
    console.log(`${TAG} outline:update — chapters=${updates?.chapters?.length ?? '?'}`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    const result = await orchestrator.updateOutline(updates);
    console.log(`${TAG} outline:update — OK, ${result?.chapters?.length ?? 0} chapters`);
    return result;
  });

  // Get outline history
  ipcMain.handle('outline:get-history', async () => {
    console.log(`${TAG} outline:get-history`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      return [];
    }
    const history = await orchestrator.getOutlineHistory();
    console.log(`${TAG} outline:get-history — ${history.length} entries`);
    return history;
  });

  // Refine outline with AI feedback
  ipcMain.handle('outline:refine', async (_, feedback: string) => {
    console.log(`${TAG} outline:refine — feedback: "${feedback.substring(0, 50)}..."`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    const result = await orchestrator.refineOutlineDirect(feedback);
    console.log(`${TAG} outline:refine — OK`);
    return result;
  });

  // Restore outline from history
  ipcMain.handle('outline:restore', async (_, historyId: string) => {
    console.log(`${TAG} outline:restore — historyId=${historyId}`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }
    const result = await orchestrator.restoreOutline(historyId);
    console.log(`${TAG} outline:restore — OK`);
    return result;
  });
}
