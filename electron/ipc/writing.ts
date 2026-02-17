import type { IpcMain, WebContents } from 'electron';
import { createRequire } from 'module';
import { OrchestratorService } from '../services/OrchestratorService.js';
import StoreModule from 'electron-store';

const electronRequire = createRequire(import.meta.url);
const { BrowserWindow } = electronRequire('electron');

// Handle ESM/CJS interop - when bundled to CJS, default export is on .default
const Store = (StoreModule as any).default || StoreModule;

// Draft storage
const draftStore = new Store({
  name: 'novelwriter-drafts',
  projectName: 'novel-writer',
});

export function setupWritingIPC(ipcMain: IpcMain) {
  // Helper to get main window's webContents
  const getWebContents = (): WebContents | null => {
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0].webContents : null;
  };

  // Write chapter
  ipcMain.handle('writing:write-chapter', async (_, chapterIndex: number) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }

    const webContents = getWebContents();

    try {
      // TODO: Implement streaming when LLM supports it
      // For now, just get the full result
      const result = await orchestrator.writeChapter(chapterIndex);

      // Clear draft after successful write
      draftStore.delete(`chapter_${chapterIndex}`);

      // Send completion event
      webContents?.send('writing:complete', {
        chapterIndex,
        content: result.finalContent,
        wordCount: result.wordCount,
        review: result.review,
      });

      return result;
    } catch (error) {
      webContents?.send('writing:error', {
        chapterIndex,
        error: String(error),
      });
      throw error;
    }
  });

  // Continue writing
  ipcMain.handle('writing:continue', async (_, content: string) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }

    return orchestrator.continueWriting(content);
  });

  // Edit chapter
  ipcMain.handle('writing:edit-chapter', async (_, chapterIndex: number, instruction: string, targetSection?: string) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }

    return orchestrator.editChapter(chapterIndex, instruction, targetSection);
  });

  // Review chapter
  ipcMain.handle('writing:review-chapter', async (_, chapterIndex: number) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }

    return orchestrator.reviewChapter(chapterIndex);
  });

  // Save draft
  ipcMain.handle('writing:save-draft', async (_, chapterIndex: number, content: string) => {
    draftStore.set(`chapter_${chapterIndex}`, {
      content,
      savedAt: new Date().toISOString(),
    });
  });

  // Get draft
  ipcMain.handle('writing:get-draft', async (_, chapterIndex: number) => {
    const draft = draftStore.get(`chapter_${chapterIndex}`) as any;
    return draft?.content || null;
  });
}
