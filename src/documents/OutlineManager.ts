/**
 * @module src/documents/OutlineManager
 * @description 大纲管理器。
 * 负责大纲的 CRUD、Markdown 生成/解析、版本历史管理和变更影响分析。
 * 大纲以 Markdown + YAML 前置数据格式存储在 outline.md。
 *
 * Markdown 格式：
 * - 前置数据：id, title, theme, genre, targetWordCount, createdAt, updatedAt
 * - 正文：## 故事前提, ## 主题, ## 章节大纲
 * - 每章：### 第X章: 标题 + **摘要** + **关键事件** + **出场角色** + **目标字数**
 *
 * 解析支持多种格式（严格/宽松/数字编号），内置章节去重。
 */
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
      console.log(`[OutlineManager] getOutline: read ${content.length} chars`);
      const result = this.parseOutlineMarkdown(content);
      console.log(`[OutlineManager] getOutline: parsed ${result?.chapters?.length ?? 0} chapters`);
      return result;
    } catch (err) {
      console.error(`[OutlineManager] getOutline: FAILED to parse outline:`, err);
      return null;
    }
  }

  /**
   * Update the outline
   */
  async updateOutline(updates: Partial<Outline>): Promise<Outline> {
    console.log(`[OutlineManager] updateOutline: updates has chapters=${!!updates.chapters}, count=${updates.chapters?.length}`);
    const existing = await this.getOutline();
    if (!existing) {
      throw new Error('No outline exists. Create one first.');
    }
    console.log(`[OutlineManager] updateOutline: existing has ${existing.chapters.length} chapters`);

    // Save current version to history before updating (non-fatal)
    try {
      await this.saveToHistory(existing);
    } catch (err) {
      console.error('Failed to save outline history (non-fatal):', err);
    }

    const updated: Outline = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    // Deduplicate chapters by index — keep first occurrence only
    if (updated.chapters && updated.chapters.length > 0) {
      const seen = new Set<number>();
      updated.chapters = updated.chapters.filter(ch => {
        if (seen.has(ch.index)) return false;
        seen.add(ch.index);
        return true;
      });
    }

    console.log(`[OutlineManager] updateOutline: saving ${updated.chapters.length} chapters: [${updated.chapters.map(c => c.index).join(',')}]`);
    await this.saveOutline(updated);
    console.log(`[OutlineManager] updateOutline: saved OK`);
    return updated;
  }

  /**
   * Save outline to file
   */
  private async saveOutline(outline: Outline): Promise<void> {
    const markdown = this.generateOutlineMarkdown(outline);
    const headingCount = (markdown.match(/###\s*第\d+章/g) || []).length;
    console.log(`[OutlineManager] saveOutline: writing ${markdown.length} chars, ${headingCount} chapter headings`);
    await this.docManager.saveOutline(markdown);

    // Verify write succeeded
    const readBack = await this.docManager.getOutline();
    const readBackCount = (readBack.match(/###\s*第\d+章/g) || []).length;
    console.log(`[OutlineManager] saveOutline: verify read-back ${readBack.length} chars, ${readBackCount} headings`);
    if (readBackCount !== headingCount) {
      console.error(`[OutlineManager] saveOutline: MISMATCH! wrote ${headingCount} but read-back has ${readBackCount}`);
    }
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
   * Get chapter outline by index (1-based, matching "第X章" in markdown).
   */
  async getChapterOutline(index: number): Promise<ChapterOutline | null> {
    const outline = await this.getOutline();
    if (!outline || outline.chapters.length === 0) return null;
    return outline.chapters.find(c => c.index === index) || null;
  }

  // ============ Version History ============

  /**
   * Save current outline to history (public wrapper)
   */
  async saveCurrentToHistory(): Promise<void> {
    const current = await this.getOutline();
    if (current) {
      await this.saveToHistory(current);
    }
  }

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
    // Use JSON.stringify for YAML string values to safely escape quotes and special chars
    const safeStr = (s: string) => JSON.stringify(s || '');
    const lines: string[] = [
      '---',
      `id: ${outline.id}`,
      `title: ${safeStr(outline.title)}`,
      `theme: ${safeStr(outline.theme)}`,
      `genre: ${safeStr(outline.genre)}`,
      `targetWordCount: ${outline.targetWordCount}`,
      `createdAt: ${outline.createdAt instanceof Date ? outline.createdAt.toISOString() : String(outline.createdAt)}`,
      `updatedAt: ${outline.updatedAt instanceof Date ? outline.updatedAt.toISOString() : String(outline.updatedAt)}`,
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

    for (const chapter of [...outline.chapters].sort((a, b) => a.index - b.index)) {
      lines.push(`### 第${chapter.index}章: ${chapter.title}`);
      lines.push('');
      lines.push(`**摘要**: ${chapter.summary || ''}`);
      lines.push('');
      const keyEvents = chapter.keyEvents || [];
      if (keyEvents.length > 0) {
        lines.push('**关键事件**:');
        for (const event of keyEvents) {
          lines.push(`- ${event}`);
        }
        lines.push('');
      }
      const characters = chapter.characters || [];
      if (characters.length > 0) {
        lines.push(`**出场角色**: ${characters.join(', ')}`);
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
    let data: Record<string, any>;
    let body: string;
    try {
      const parsed = matter(content);
      data = parsed.data;
      body = parsed.content;
    } catch (yamlErr) {
      console.error(`[OutlineManager] parseOutlineMarkdown: gray-matter YAML parse failed:`, yamlErr);
      // Fallback: strip frontmatter manually and parse body only
      const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
      body = fmMatch ? fmMatch[1] : content;
      data = {};
    }

    // Extract title - try YAML front matter first, then first heading
    const titleMatch = body.match(/^#\s+(.+)$/m);
    const title = data.title || titleMatch?.[1]?.trim() || '未命名';

    // Extract premise - try structured format first, then use first paragraph
    const premiseMatch = body.match(/##\s*故事前提\s*\n\n?([\s\S]*?)(?=\n##\s|$)/);
    let premise = premiseMatch?.[1]?.trim() || '';
    if (!premise) {
      // Try to extract the first meaningful paragraph after the title
      const paragraphs = body.replace(/^#\s+.+$/m, '').trim().split(/\n\n+/);
      premise = paragraphs.find(p => p.trim().length > 20 && !p.startsWith('#'))?.trim() || '';
    }
    // Strip any leaked headings/chapter entries from the premise text
    // (AI may put "## 章节大纲" or "### 第X章" inside the premise section)
    const h2LeakIdx = premise.search(/\n##\s/);
    if (h2LeakIdx >= 0) {
      premise = premise.substring(0, h2LeakIdx).trim();
    }
    const chapterLeakIdx = premise.search(/###?\s*第\d+章/);
    if (chapterLeakIdx >= 0) {
      premise = premise.substring(0, chapterLeakIdx).trim();
    }

    // Extract theme
    const themeMatch = body.match(/##\s*主题\s*\n\n?([\s\S]*?)(?=\n##\s|$)/);
    let theme = themeMatch?.[1]?.trim() || '';
    if (!theme) {
      theme = data.theme || '';
    }
    // Strip any chapter outline data that leaked into the theme field
    // (AI may have dumped the entire chapter outline into the theme YAML field)
    const themeLeakIdx = theme.search(/##\s*章节大纲|###?\s*第\d+章/);
    if (themeLeakIdx >= 0) {
      theme = theme.substring(0, themeLeakIdx).trim();
    }

    // Extract chapter section — find the LAST "## 章节大纲" heading
    // Using lastIndexOf because the premise may contain an older "## 章节大纲" that leaked in
    const lastChapterHeadingIdx = body.lastIndexOf('## 章节大纲');
    let chapterBody: string;
    if (lastChapterHeadingIdx >= 0) {
      const afterHeading = body.indexOf('\n', lastChapterHeadingIdx);
      chapterBody = afterHeading >= 0 ? body.substring(afterHeading + 1) : '';
    } else {
      chapterBody = body;
    }
    console.log(`[OutlineManager] parseOutlineMarkdown: bodyLen=${body.length}, chapterBodyLen=${chapterBody.length}`);

    // Parse chapters - try multiple formats
    const chapters: ChapterOutline[] = [];

    // Format 1: "### 第X章: Title" or "### 第X章：Title"
    const strictChapterMatches = chapterBody.matchAll(
      /###\s*第(\d+)章[：:]\s*(.+)\n\n?([\s\S]*?)(?=###\s*第\d+章|$)/g
    );
    for (const match of strictChapterMatches) {
      chapters.push(this.parseChapterBlock(parseInt(match[1], 10), match[2].trim(), match[3]));
    }

    // Format 2: "## 第X章" or "### 第X章 Title" (no colon)
    if (chapters.length === 0) {
      const looseChapterMatches = chapterBody.matchAll(
        /#{2,3}\s*第(\d+)章[：:\s]*([^\n]*)\n\n?([\s\S]*?)(?=#{2,3}\s*第\d+章|$)/g
      );
      for (const match of looseChapterMatches) {
        chapters.push(this.parseChapterBlock(parseInt(match[1], 10), match[2].trim(), match[3]));
      }
    }

    // Format 3: "## Chapter N" or numbered headings "### 1. Title"
    if (chapters.length === 0) {
      const numberedMatches = chapterBody.matchAll(
        /#{2,3}\s*(\d+)[\.、]\s*(.+)\n\n?([\s\S]*?)(?=#{2,3}\s*\d+[\.、]|$)/g
      );
      for (const match of numberedMatches) {
        chapters.push(this.parseChapterBlock(parseInt(match[1], 10), match[2].trim(), match[3]));
      }
    }

    console.log(`[OutlineManager] parseOutlineMarkdown: found ${chapters.length} chapters`);

    // If no chapters found but content exists, create a single-chapter placeholder
    if (chapters.length === 0 && body.trim().length > 100) {
      chapters.push({
        index: 1,
        title: '大纲草案',
        summary: body.trim().substring(0, 500),
        keyEvents: [],
        characters: [],
        targetWordCount: 5000,
      });
    }

    // Deduplicate chapters by index — keep last occurrence
    // (last = most up-to-date if duplicates somehow exist)
    const chapterMap = new Map<number, ChapterOutline>();
    for (const ch of chapters) {
      chapterMap.set(ch.index, ch);
    }
    const uniqueChapters = Array.from(chapterMap.values()).sort((a, b) => a.index - b.index);

    return {
      id: data.id || uuidv4(),
      title,
      premise,
      theme,
      genre: data.genre || '',
      targetWordCount: data.targetWordCount || 50000,
      chapters: uniqueChapters,
      createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
    };
  }

  /**
   * Parse a chapter content block to extract summary, events, characters, etc.
   */
  private parseChapterBlock(index: number, title: string, content: string): ChapterOutline {
    // Extract summary - try structured format, then use first line/paragraph
    const summaryMatch = content.match(/\*\*摘要\*\*[：:]\s*(.+)/);
    let summary = summaryMatch?.[1]?.trim() || '';
    if (!summary) {
      // Use the first non-empty line as summary
      const firstLine = content.trim().split('\n').find(l => l.trim() && !l.startsWith('**') && !l.startsWith('-'));
      summary = firstLine?.trim() || content.trim().substring(0, 200);
    }

    // Extract key events
    const keyEvents: string[] = [];
    const eventsMatch = content.match(/\*\*关键事件\*\*[：:]\s*\n((?:[-*]\s*.+\n?)+)/);
    if (eventsMatch) {
      const eventLines = eventsMatch[1].matchAll(/[-*]\s*(.+)/g);
      for (const e of eventLines) { keyEvents.push(e[1].trim()); }
    }
    // Also try to find bullet points as events
    if (keyEvents.length === 0) {
      const bullets = content.matchAll(/^[-*]\s+(.+)$/gm);
      for (const b of bullets) { keyEvents.push(b[1].trim()); }
    }

    // Extract characters
    const charsMatch = content.match(/\*\*(?:出场角色|角色|人物)\*\*[：:]\s*(.+)/);
    const characters = charsMatch?.[1]?.split(/[,，、]/).map(c => c.trim()).filter(Boolean) || [];

    // Extract target word count
    const wordCountMatch = content.match(/\*\*(?:目标字数|字数)\*\*[：:]\s*(\d+)/);
    const targetWordCount = wordCountMatch ? parseInt(wordCountMatch[1], 10) : 3000;

    return { index, title, summary, keyEvents, characters, targetWordCount };
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
