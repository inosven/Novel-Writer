/**
 * @module electron/ipc/writing
 * @description 写作与章节管理的 IPC 处理器。
 * 提供章节写作、续写、编辑、审稿功能，以及章节文件的增删改（原子操作）。
 * 章节草稿通过 electron-store 持久化，与物理文件分离。
 *
 * IPC channels:
 * - writing:write-chapter   — AI 生成章节内容
 * - writing:continue        — AI 续写
 * - writing:edit-chapter    — AI 编辑章节
 * - writing:review-chapter  — AI 审稿
 * - writing:save-draft      — 保存草稿
 * - writing:get-draft       — 获取草稿
 * - chapters:reindex        — 重新编号章节文件
 * - chapters:delete-file    — 删除章节文件
 * - chapters:get-content    — 获取章节内容
 * - chapters:insert         — 原子操作：在指定位置插入新章节
 * - chapters:remove         — 原子操作：删除章节并重新编号
 */
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

const TAG = '[IPC:writing]';

export function setupWritingIPC(ipcMain: IpcMain) {
  // Helper to get main window's webContents
  const getWebContents = (): WebContents | null => {
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0].webContents : null;
  };

  // Write chapter
  ipcMain.handle('writing:write-chapter', async (_, chapterIndex: number) => {
    console.log(`${TAG} write-chapter: index=${chapterIndex}`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }

    const webContents = getWebContents();

    try {
      const result = await orchestrator.writeChapter(chapterIndex);
      console.log(`${TAG} write-chapter: OK, wordCount=${result.wordCount}`);

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
      console.error(`${TAG} write-chapter: FAILED`, error);
      webContents?.send('writing:error', {
        chapterIndex,
        error: String(error),
      });
      throw error;
    }
  });

  // Continue writing
  ipcMain.handle('writing:continue', async (_, chapterIndex: number, content: string) => {
    console.log(`${TAG} continue: index=${chapterIndex}, contentLen=${content.length}`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }

    const result = await orchestrator.continueWriting(chapterIndex, content);
    console.log(`${TAG} continue: OK`);
    return result;
  });

  // Edit chapter
  ipcMain.handle('writing:edit-chapter', async (_, chapterIndex: number, instruction: string, targetSection?: string) => {
    console.log(`${TAG} edit-chapter: index=${chapterIndex}, instruction="${instruction.substring(0, 50)}...", target=${targetSection ? `"${targetSection.substring(0, 30)}..."` : 'null'}`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }

    const result = await orchestrator.editChapter(chapterIndex, instruction, targetSection);
    console.log(`${TAG} edit-chapter: OK`);
    return result;
  });

  // Review chapter
  ipcMain.handle('writing:review-chapter', async (_, chapterIndex: number) => {
    console.log(`${TAG} review-chapter: index=${chapterIndex}`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) {
      throw new Error('No project open');
    }

    const result = await orchestrator.reviewChapter(chapterIndex);
    console.log(`${TAG} review-chapter: OK, score=${result?.score?.overall ?? '?'}`);
    return result;
  });

  // Save draft
  ipcMain.handle('writing:save-draft', async (_, chapterIndex: number, content: string) => {
    console.log(`${TAG} save-draft: index=${chapterIndex}, len=${content.length}`);
    draftStore.set(`chapter_${chapterIndex}`, {
      content,
      savedAt: new Date().toISOString(),
    });
  });

  // Get draft
  ipcMain.handle('writing:get-draft', async (_, chapterIndex: number) => {
    const draft = draftStore.get(`chapter_${chapterIndex}`) as any;
    console.log(`${TAG} get-draft: index=${chapterIndex}, found=${!!draft?.content}`);
    return draft?.content || null;
  });

  // Reindex chapter files (rename on insert/delete)
  ipcMain.handle('chapters:reindex', async (_, mapping: { from: number; to: number }[]) => {
    console.log(`${TAG} chapters:reindex:`, mapping);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) throw new Error('No project open');

    await orchestrator.reindexChapterFiles(mapping);

    // Also reindex draft store keys
    const draftsToMove: { key: string; value: any }[] = [];
    for (const { from, to } of mapping) {
      const draft = draftStore.get(`chapter_${from}`) as any;
      if (draft) {
        draftsToMove.push({ key: `chapter_${to}`, value: draft });
        draftStore.delete(`chapter_${from}`);
      }
    }
    for (const { key, value } of draftsToMove) {
      draftStore.set(key, value);
    }
    console.log(`${TAG} chapters:reindex: OK, moved ${draftsToMove.length} drafts`);
  });

  // Delete chapter file
  ipcMain.handle('chapters:delete-file', async (_, chapterIndex: number) => {
    console.log(`${TAG} chapters:delete-file: index=${chapterIndex}`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) throw new Error('No project open');

    await orchestrator.deleteChapterFile(chapterIndex);
    draftStore.delete(`chapter_${chapterIndex}`);
    console.log(`${TAG} chapters:delete-file: OK`);
  });

  // Get chapter content (for word count)
  ipcMain.handle('chapters:get-content', async (_, chapterIndex: number) => {
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) return '';
    return orchestrator.getChapterContent(chapterIndex);
  });

  // ============ Atomic Chapter Operations ============

  // Insert a new chapter after the given index (atomic: files + outline)
  ipcMain.handle('chapters:insert', async (_, afterIndex: number) => {
    console.log(`${TAG} chapters:insert: afterIndex=${afterIndex}`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) throw new Error('No project open');

    // Shift draft store keys upward for chapters >= afterIndex+1
    const outline = await orchestrator.getOutline();
    if (outline?.chapters) {
      const toShift = outline.chapters
        .filter((ch: any) => ch.index >= afterIndex + 1)
        .sort((a: any, b: any) => b.index - a.index); // reverse order to avoid overwrite
      for (const ch of toShift) {
        const draft = draftStore.get(`chapter_${ch.index}`) as any;
        if (draft) {
          console.log(`${TAG} chapters:insert: shift draft ${ch.index} → ${ch.index + 1}`);
          draftStore.set(`chapter_${ch.index + 1}`, draft);
          draftStore.delete(`chapter_${ch.index}`);
        }
      }
    }

    const result = await orchestrator.insertChapter(afterIndex);
    console.log(`${TAG} chapters:insert: OK, newIndex=${result.newIndex}`);
    return result;
  });

  // Remove a chapter by index (atomic: delete file + shift files + update outline)
  ipcMain.handle('chapters:remove', async (_, chapterIndex: number) => {
    console.log(`${TAG} chapters:remove: index=${chapterIndex}`);
    const orchestrator = OrchestratorService.getOrchestrator();
    if (!orchestrator) throw new Error('No project open');

    // Get outline before removal to know which drafts to shift
    const outline = await orchestrator.getOutline();
    const maxIndex = outline?.chapters
      ? Math.max(...outline.chapters.map((ch: any) => ch.index))
      : chapterIndex;

    // Delete draft for the removed chapter
    draftStore.delete(`chapter_${chapterIndex}`);

    // Shift draft store keys downward for chapters after the deleted one
    for (let i = chapterIndex + 1; i <= maxIndex; i++) {
      const draft = draftStore.get(`chapter_${i}`) as any;
      if (draft) {
        console.log(`${TAG} chapters:remove: shift draft ${i} → ${i - 1}`);
        draftStore.set(`chapter_${i - 1}`, draft);
        draftStore.delete(`chapter_${i}`);
      }
    }

    const result = await orchestrator.removeChapter(chapterIndex);
    console.log(`${TAG} chapters:remove: OK, remaining=${result?.chapters?.length ?? '?'} chapters`);
    return result;
  });
}
