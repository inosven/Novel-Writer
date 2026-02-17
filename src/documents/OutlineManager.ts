import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import matter from 'gray-matter';
import type { Outline, ChapterOutline } from '../types/index.js';
import { DocumentManager } from './DocumentManager.js';

/**
 * Manages outline operations and version history
 */
export class OutlineManager {
  private docManager: DocumentManager;
  private projectPath: string;

  constructor(docManager: DocumentManager, projectPath: string) {
    this.docManager = docManager;
    this.projectPath = projectPath;
  }

  /**
   * Create a new outline
   */
  async createOutline(input: CreateOutlineInput): Promise<Outline> {
    const outline: Outline = {
      id: uuidv4(),
      title: input.title,
      premise: input.premise,
      theme: input.theme || '',
      genre: input.genre || '',
      targetWordCount: input.targetWordCount || 50000,
      chapters: input.chapters || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.saveOutline(outline);
    return outline;
  }

  /**
   * Get the current outline
   */
  async getOutline(): Promise<Outline | null> {
    try {
      const content = await this.docManager.getOutline();
      return this.parseOutlineMarkdown(content);
    } catch {
      return null;
    }
  }

  /**
   * Update the outline
   */
  async updateOutline(updates: Partial<Outline>): Promise<Outline> {
    const existing = await this.getOutline();
    if (!existing) {
      throw new Error('No outline exists. Create one first.');
    }

    // Save current version to history before updating
    await this.saveToHistory(existing);

    const updated: Outline = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    await this.saveOutline(updated);
    return updated;
  }

  /**
   * Save outline to file
   */
  private async saveOutline(outline: Outline): Promise<void> {
    const markdown = this.generateOutlineMarkdown(outline);
    await this.docManager.saveOutline(markdown);
  }

  /**
   * Add a chapter to the outline
   */
  async addChapter(chapter: ChapterOutline): Promise<Outline> {
    const outline = await this.getOutline();
    if (!outline) {
      throw new Error('No outline exists. Create one first.');
    }

    // Save to history
    await this.saveToHistory(outline);

    outline.chapters.push(chapter);
    outline.updatedAt = new Date();

    await this.saveOutline(outline);
    return outline;
  }

  /**
   * Update a specific chapter in the outline
   */
  async updateChapter(index: number, updates: Partial<ChapterOutline>): Promise<Outline> {
    const outline = await this.getOutline();
    if (!outline) {
      throw new Error('No outline exists');
    }

    const chapterIdx = outline.chapters.findIndex(c => c.index === index);
    if (chapterIdx === -1) {
      throw new Error(`Chapter ${index} not found in outline`);
    }

    // Save to history
    await this.saveToHistory(outline);

    outline.chapters[chapterIdx] = {
      ...outline.chapters[chapterIdx],
      ...updates,
    };
    outline.updatedAt = new Date();

    await this.saveOutline(outline);
    return outline;
  }

  /**
   * Remove a chapter from the outline
   */
  async removeChapter(index: number): Promise<Outline> {
    const outline = await this.getOutline();
    if (!outline) {
      throw new Error('No outline exists');
    }

    // Save to history
    await this.saveToHistory(outline);

    outline.chapters = outline.chapters.filter(c => c.index !== index);
    outline.updatedAt = new Date();

    await this.saveOutline(outline);
    return outline;
  }

  /**
   * Get chapter outline by index
   */
  async getChapterOutline(index: number): Promise<ChapterOutline | null> {
    const outline = await this.getOutline();
    if (!outline) return null;
    return outline.chapters.find(c => c.index === index) || null;
  }

  // ============ Version History ============

  /**
   * Save current outline to history
   */
  private async saveToHistory(outline: Outline): Promise<void> {
    const historyPath = path.join(this.projectPath, '.state', 'outline-history.json');

    let history: OutlineHistoryEntry[] = [];
    try {
      const content = await fs.readFile(historyPath, 'utf-8');
      history = JSON.parse(content);
    } catch {
      // File doesn't exist yet
    }

    history.push({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      outline: outline,
    });

    // Keep only last 50 versions
    if (history.length > 50) {
      history = history.slice(-50);
    }

    await fs.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8');
  }

  /**
   * Get outline history
   */
  async getHistory(): Promise<OutlineHistoryEntry[]> {
    const historyPath = path.join(this.projectPath, '.state', 'outline-history.json');
    try {
      const content = await fs.readFile(historyPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * Restore outline from history
   */
  async restoreFromHistory(historyId: string): Promise<Outline> {
    const history = await this.getHistory();
    const entry = history.find(h => h.id === historyId);
    if (!entry) {
      throw new Error(`History entry ${historyId} not found`);
    }

    // Save current to history before restoring
    const current = await this.getOutline();
    if (current) {
      await this.saveToHistory(current);
    }

    await this.saveOutline(entry.outline);
    return entry.outline;
  }

  // ============ Impact Analysis ============

  /**
   * Analyze the impact of outline changes on written chapters
   */
  async analyzeChangeImpact(newOutline: Partial<Outline>): Promise<ImpactAnalysis> {
    const current = await this.getOutline();
    if (!current) {
      return { affectedChapters: [], warnings: [] };
    }

    const chapterCount = await this.docManager.getChapterCount();
    const affectedChapters: number[] = [];
    const warnings: string[] = [];

    // Check chapter changes
    if (newOutline.chapters) {
      for (const newChapter of newOutline.chapters) {
        const existingChapter = current.chapters.find(c => c.index === newChapter.index);

        // If chapter is already written and outline changed significantly
        if (existingChapter && newChapter.index <= chapterCount) {
          if (newChapter.summary !== existingChapter.summary) {
            affectedChapters.push(newChapter.index);
            warnings.push(
              `第${newChapter.index}章已写完，大纲摘要变更可能需要修改章节内容`
            );
          }

          // Check character changes
          const removedChars = existingChapter.characters.filter(
            c => !newChapter.characters.includes(c)
          );
          if (removedChars.length > 0) {
            warnings.push(
              `第${newChapter.index}章大纲移除了角色: ${removedChars.join(', ')}，但章节可能已包含这些角色`
            );
          }
        }
      }
    }

    return {
      affectedChapters: [...new Set(affectedChapters)],
      warnings,
    };
  }

  // ============ Markdown Generation & Parsing ============

  /**
   * Generate markdown from outline
   */
  private generateOutlineMarkdown(outline: Outline): string {
    const lines: string[] = [
      '---',
      `id: ${outline.id}`,
      `title: "${outline.title}"`,
      `theme: "${outline.theme}"`,
      `genre: "${outline.genre}"`,
      `targetWordCount: ${outline.targetWordCount}`,
      `createdAt: ${outline.createdAt.toISOString()}`,
      `updatedAt: ${outline.updatedAt.toISOString()}`,
      '---',
      '',
      `# ${outline.title}`,
      '',
      '## 故事前提',
      '',
      outline.premise,
      '',
      '## 主题',
      '',
      outline.theme,
      '',
      '## 章节大纲',
      '',
    ];

    for (const chapter of outline.chapters.sort((a, b) => a.index - b.index)) {
      lines.push(`### 第${chapter.index}章: ${chapter.title}`);
      lines.push('');
      lines.push(`**摘要**: ${chapter.summary}`);
      lines.push('');
      if (chapter.keyEvents.length > 0) {
        lines.push('**关键事件**:');
        for (const event of chapter.keyEvents) {
          lines.push(`- ${event}`);
        }
        lines.push('');
      }
      if (chapter.characters.length > 0) {
        lines.push(`**出场角色**: ${chapter.characters.join(', ')}`);
        lines.push('');
      }
      if (chapter.targetWordCount) {
        lines.push(`**目标字数**: ${chapter.targetWordCount}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Parse markdown to outline
   */
  private parseOutlineMarkdown(content: string): Outline | null {
    const { data, content: body } = matter(content);

    // Extract premise
    const premiseMatch = body.match(/## 故事前提\n\n([\s\S]*?)(?=\n## |$)/);
    const premise = premiseMatch?.[1]?.trim() || '';

    // Extract theme
    const themeMatch = body.match(/## 主题\n\n([\s\S]*?)(?=\n## |$)/);
    const theme = themeMatch?.[1]?.trim() || data.theme || '';

    // Parse chapters
    const chapters: ChapterOutline[] = [];
    const chapterMatches = body.matchAll(
      /### 第(\d+)章: (.+)\n\n([\s\S]*?)(?=### 第\d+章|$)/g
    );

    for (const match of chapterMatches) {
      const index = parseInt(match[1], 10);
      const title = match[2].trim();
      const chapterContent = match[3];

      // Extract summary
      const summaryMatch = chapterContent.match(/\*\*摘要\*\*:\s*(.+)/);
      const summary = summaryMatch?.[1]?.trim() || '';

      // Extract key events
      const keyEvents: string[] = [];
      const eventsMatch = chapterContent.match(
        /\*\*关键事件\*\*:\n((?:-\s*.+\n?)+)/
      );
      if (eventsMatch) {
        const eventLines = eventsMatch[1].matchAll(/-\s*(.+)/g);
        for (const e of eventLines) {
          keyEvents.push(e[1].trim());
        }
      }

      // Extract characters
      const charsMatch = chapterContent.match(/\*\*出场角色\*\*:\s*(.+)/);
      const characters = charsMatch?.[1]?.split(',').map(c => c.trim()) || [];

      // Extract target word count
      const wordCountMatch = chapterContent.match(/\*\*目标字数\*\*:\s*(\d+)/);
      const targetWordCount = wordCountMatch ? parseInt(wordCountMatch[1], 10) : 3000;

      chapters.push({
        index,
        title,
        summary,
        keyEvents,
        characters,
        targetWordCount,
      });
    }

    return {
      id: data.id || uuidv4(),
      title: data.title || '未命名',
      premise,
      theme,
      genre: data.genre || '',
      targetWordCount: data.targetWordCount || 50000,
      chapters,
      createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
    };
  }
}

// ============ Types ============

export interface CreateOutlineInput {
  title: string;
  premise: string;
  theme?: string;
  genre?: string;
  targetWordCount?: number;
  chapters?: ChapterOutline[];
}

export interface OutlineHistoryEntry {
  id: string;
  timestamp: string;
  outline: Outline;
}

export interface ImpactAnalysis {
  affectedChapters: number[];
  warnings: string[];
}
