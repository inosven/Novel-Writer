/**
 * @module src/documents/DocumentManager
 * @description 文件系统操作层。
 * 封装所有文件 I/O 操作：章节文件读写、角色文件读写、大纲读写、章节摘要持久化。
 * 提供章节文件重编号（两阶段重命名避免冲突）和全文检索（grepChapters）。
 * 文件名约定：Chapter-01.md, Chapter-02.md（1-based, 零填充两位）。
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import type { Character, Outline, ChapterSummary } from '../types/index.js';

/**
 * Manages all document operations for a novel project
 */
export class DocumentManager {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Initialize project directory structure
   */
  async initializeProject(name: string): Promise<void> {
    const dirs = [
      'chapters',
      'characters',
      'references',
      '.state',
      '.state/vector-db',
      '.state/knowledge-graph',
      '.claude',
      '.claude/skills',
    ];

    for (const dir of dirs) {
      await fs.mkdir(path.join(this.projectPath, dir), { recursive: true });
    }

    // Create initial empty files
    await this.writeFile('outline.md', `# ${name}\n\n## 故事大纲\n\n（待生成）`);
    await this.writeFile('chapter_index.md', `# 章节目录\n\n（待生成）`);
  }

  // ============ Generic File Operations ============

  async readFile(relativePath: string): Promise<string> {
    const fullPath = path.join(this.projectPath, relativePath);
    return fs.readFile(fullPath, 'utf-8');
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.projectPath, relativePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async fileExists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.projectPath, relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(relativePath: string, pattern?: RegExp): Promise<string[]> {
    const fullPath = path.join(this.projectPath, relativePath);
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      let files = entries.filter(e => e.isFile()).map(e => e.name);
      if (pattern) {
        files = files.filter(f => pattern.test(f));
      }
      return files;
    } catch {
      return [];
    }
  }

  // ============ Outline Operations ============

  async getOutline(): Promise<string> {
    return this.readFile('outline.md');
  }

  async saveOutline(content: string): Promise<void> {
    await this.writeFile('outline.md', content);
  }

  async getOutlineWithMetadata(): Promise<{ content: string; data: Record<string, unknown> }> {
    const raw = await this.readFile('outline.md');
    const { content, data } = matter(raw);
    return { content, data };
  }

  // ============ Chapter Operations ============

  async getChapter(index: number): Promise<string> {
    const filename = this.formatChapterFilename(index);
    return this.readFile(`chapters/${filename}`);
  }

  async saveChapter(index: number, content: string, title?: string): Promise<void> {
    const filename = this.formatChapterFilename(index);
    await this.writeFile(`chapters/${filename}`, content);

    // Update chapter index
    await this.updateChapterIndex(index, title);
  }

  async listChapters(): Promise<string[]> {
    return this.listFiles('chapters', /^Chapter-\d+\.md$/);
  }

  async getChapterCount(): Promise<number> {
    const chapters = await this.listChapters();
    return chapters.length;
  }

  private formatChapterFilename(index: number): string {
    return `Chapter-${String(index).padStart(2, '0')}.md`;
  }

  async updateChapterIndex(index: number, title?: string): Promise<void> {
    const chapters = await this.listChapters();
    const lines = ['# 章节目录\n'];

    for (const chapter of chapters.sort()) {
      const match = chapter.match(/Chapter-(\d+)\.md/);
      if (match) {
        const chapterIndex = parseInt(match[1], 10);
        const chapterTitle = title && chapterIndex === index ? title : `第${chapterIndex}章`;
        lines.push(`- [${chapterTitle}](chapters/${chapter})`);
      }
    }

    await this.writeFile('chapter_index.md', lines.join('\n'));
  }

  /**
   * Reindex chapter files: rename Chapter-XX.md → Chapter-YY.md per mapping.
   * Uses temp names to avoid overwrite conflicts.
   * Also reindexes chapter-summaries.json keys.
   */
  async reindexChapterFiles(mapping: { from: number; to: number }[]): Promise<void> {
    if (mapping.length === 0) return;
    const chaptersDir = path.join(this.projectPath, 'chapters');
    console.log(`[DocumentManager] reindexChapterFiles:`, mapping);

    // Phase 1: rename all source files to temp names
    for (const { from } of mapping) {
      const srcFile = path.join(chaptersDir, this.formatChapterFilename(from));
      const tmpFile = srcFile + '.tmp';
      try {
        await fs.rename(srcFile, tmpFile);
        console.log(`[DocumentManager]   rename ${this.formatChapterFilename(from)} → .tmp OK`);
      } catch {
        console.log(`[DocumentManager]   rename ${this.formatChapterFilename(from)} → .tmp SKIP (not found)`);
      }
    }

    // Phase 2: rename temp files to target names
    for (const { from, to } of mapping) {
      const tmpFile = path.join(chaptersDir, this.formatChapterFilename(from) + '.tmp');
      const destFile = path.join(chaptersDir, this.formatChapterFilename(to));
      try {
        await fs.rename(tmpFile, destFile);
        console.log(`[DocumentManager]   rename .tmp → ${this.formatChapterFilename(to)} OK`);
      } catch {
        console.log(`[DocumentManager]   rename .tmp → ${this.formatChapterFilename(to)} SKIP (not found)`);
      }
    }

    // Phase 3: reindex chapter summaries
    try {
      const summaries = await this.loadAllChapterSummaries();
      const newSummaries: Record<number, any> = {};
      for (const [key, value] of Object.entries(summaries)) {
        const oldIdx = parseInt(key, 10);
        const entry = mapping.find(m => m.from === oldIdx);
        if (entry) {
          newSummaries[entry.to] = value;
        } else {
          newSummaries[oldIdx] = value;
        }
      }
      await this.writeFile('.state/chapter-summaries.json', JSON.stringify(newSummaries, null, 2));
    } catch {
      // Non-fatal
    }
  }

  /**
   * Delete a chapter file and its summary.
   */
  async deleteChapterFile(index: number): Promise<void> {
    const filename = this.formatChapterFilename(index);
    const filePath = path.join(this.projectPath, 'chapters', filename);
    console.log(`[DocumentManager] deleteChapterFile: ${filename}`);
    try {
      await fs.unlink(filePath);
      console.log(`[DocumentManager]   deleted OK`);
    } catch (err: any) {
      console.log(`[DocumentManager]   delete SKIP: ${err?.code || err}`);
    }

    // Remove from summaries
    try {
      const summaries = await this.loadAllChapterSummaries();
      delete summaries[index];
      await this.writeFile('.state/chapter-summaries.json', JSON.stringify(summaries, null, 2));
    } catch {
      // Non-fatal
    }
  }

  // ============ Character Operations ============

  /**
   * Sanitize a character name to make it safe for use as a filename.
   * Keeps Chinese characters and basic alphanumerics, removes problematic chars.
   */
  private sanitizeCharacterFilename(name: string): string {
    return name
      .replace(/[（(）)【】\[\]{}<>《》\/\\:*?"<>|]/g, '') // Remove brackets, special FS chars
      .replace(/\s+/g, '_')  // Spaces to underscores
      .trim() || 'unnamed';
  }

  async getCharacter(name: string): Promise<string> {
    const safeName = this.sanitizeCharacterFilename(name);

    // Try sanitized name first
    if (await this.fileExists(`characters/${safeName}.md`)) {
      return this.readFile(`characters/${safeName}.md`);
    }

    // Try original name (for backward compat with existing files)
    if (await this.fileExists(`characters/${name}.md`)) {
      return this.readFile(`characters/${name}.md`);
    }

    // Fallback: scan all character files and match by frontmatter name
    const files = await this.listFiles('characters', /\.md$/);
    for (const file of files) {
      try {
        const content = await this.readFile(`characters/${file}`);
        const { data } = matter(content);
        if (data.name === name) {
          return content;
        }
      } catch {
        // skip unreadable files
      }
    }

    throw Object.assign(new Error(`Character "${name}" not found`), { code: 'ENOENT' });
  }

  async saveCharacter(name: string, content: string): Promise<void> {
    const safeName = this.sanitizeCharacterFilename(name);
    await this.writeFile(`characters/${safeName}.md`, content);
  }

  async deleteCharacter(name: string): Promise<void> {
    const safeName = this.sanitizeCharacterFilename(name);
    // Try sanitized name first, then original
    for (const tryName of [safeName, name]) {
      const fullPath = path.join(this.projectPath, `characters/${tryName}.md`);
      try {
        await fs.unlink(fullPath);
        return;
      } catch {
        // try next
      }
    }
  }

  async listCharacters(): Promise<string[]> {
    const files = await this.listFiles('characters', /\.md$/);
    const names: string[] = [];
    for (const file of files) {
      try {
        const content = await this.readFile(`characters/${file}`);
        const { data } = matter(content);
        // Use frontmatter name if available, otherwise filename
        names.push(data.name || file.replace('.md', ''));
      } catch {
        names.push(file.replace('.md', ''));
      }
    }
    return names;
  }

  async getCharacters(): Promise<Character[]> {
    const names = await this.listCharacters();
    const characters: Character[] = [];

    for (const name of names) {
      try {
        const content = await this.getCharacter(name);
        const character = this.parseCharacterMarkdown(name, content);
        if (character) {
          characters.push(character);
        }
      } catch (error) {
        console.error(`Failed to parse character ${name}:`, error);
      }
    }

    return characters;
  }

  private parseCharacterMarkdown(name: string, content: string): Character | null {
    const { data, content: body } = matter(content);

    // Basic parsing - extract sections from markdown
    const sections: Record<string, string> = {};
    let currentSection = '';
    const lines = body.split('\n');

    for (const line of lines) {
      if (line.startsWith('## ')) {
        currentSection = line.replace('## ', '').trim();
        sections[currentSection] = '';
      } else if (currentSection) {
        sections[currentSection] += line + '\n';
      }
    }

    return {
      id: data.id || name,
      name,
      basicInfo: {
        age: data.age,
        gender: data.gender,
        occupation: data.occupation,
        appearance: sections['外貌特征']?.trim(),
      },
      personality: {
        core: sections['核心性格']?.trim() || '',
        strengths: [],
        weaknesses: [],
        speechStyle: sections['说话方式']?.trim(),
      },
      background: sections['背景故事']?.trim() || '',
      relationships: [],
      arc: {
        startState: '',
        trigger: '',
        endState: '',
      },
      role: sections['在故事中的作用']?.trim() || '',
      appearances: data.appearances || [],
      createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
    };
  }

  // ============ Content Search & Analysis ============

  async extractChapterSummary(index: number): Promise<ChapterSummary | null> {
    try {
      const content = await this.getChapter(index);
      const { data } = matter(content);

      // Extract title from first heading or metadata
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = data.title || titleMatch?.[1] || `第${index}章`;

      // Count words
      const wordCount = this.countWords(content);

      // Extract character names mentioned (simple approach)
      const characters = await this.listCharacters();
      const mentionedCharacters = characters.filter(c => content.includes(c));

      return {
        index,
        title,
        summary: data.summary || '',
        wordCount,
        characters: mentionedCharacters,
        keyEvents: data.keyEvents || [],
      };
    } catch {
      return null;
    }
  }

  async getRecentChapterSummaries(count: number): Promise<ChapterSummary[]> {
    const chapterCount = await this.getChapterCount();
    const summaries: ChapterSummary[] = [];

    const start = Math.max(1, chapterCount - count + 1);
    for (let i = start; i <= chapterCount; i++) {
      const summary = await this.extractChapterSummary(i);
      if (summary) {
        summaries.push(summary);
      }
    }

    return summaries;
  }

  // ============ Chapter Summary Persistence ============

  /**
   * Save an LLM-generated summary for a chapter.
   * Stored in .state/chapter-summaries.json
   */
  async saveChapterSummary(index: number, summary: ChapterSummary): Promise<void> {
    const summaries = await this.loadAllChapterSummaries();
    summaries[index] = summary;
    await this.writeFile('.state/chapter-summaries.json', JSON.stringify(summaries, null, 2));
  }

  /**
   * Load the LLM-generated summary for a specific chapter.
   */
  async getChapterSummaryFromStore(index: number): Promise<ChapterSummary | null> {
    const summaries = await this.loadAllChapterSummaries();
    return summaries[index] || null;
  }

  /**
   * Load all LLM-generated chapter summaries.
   */
  async loadAllChapterSummaries(): Promise<Record<number, ChapterSummary>> {
    try {
      const raw = await this.readFile('.state/chapter-summaries.json');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  /**
   * Get all chapter summaries in order, for use as context.
   */
  async getAllChapterSummariesOrdered(): Promise<ChapterSummary[]> {
    const map = await this.loadAllChapterSummaries();
    return Object.values(map).sort((a, b) => a.index - b.index);
  }

  /**
   * Save the running story-level summary.
   * This is a high-level summary of the entire story so far.
   */
  async saveStorySummary(summary: string): Promise<void> {
    await this.writeFile('.state/story-summary.md', summary);
  }

  /**
   * Load the running story-level summary.
   */
  async getStorySummary(): Promise<string> {
    try {
      return await this.readFile('.state/story-summary.md');
    } catch {
      return '';
    }
  }

  /**
   * Get the last N characters (text) of a chapter, for transition context.
   */
  async getChapterEnding(index: number, charCount = 500): Promise<string> {
    try {
      const content = await this.getChapter(index);
      // Strip front matter
      const { content: body } = matter(content);
      const trimmed = body.trim();
      if (trimmed.length <= charCount) return trimmed;
      // Find a sentence break near the cut point
      const cutRegion = trimmed.substring(trimmed.length - charCount - 100, trimmed.length);
      const sentenceBreak = cutRegion.search(/[。！？\.\!\?]\s*/);
      if (sentenceBreak !== -1) {
        return cutRegion.substring(sentenceBreak + 1).trim();
      }
      return trimmed.substring(trimmed.length - charCount);
    } catch {
      return '';
    }
  }

  /**
   * Search across all chapters for keyword matches, returning surrounding context.
   * Like grep with context lines.
   */
  async grepChapters(
    keywords: string[],
    options: { contextChars?: number; maxResults?: number; excludeChapter?: number } = {}
  ): Promise<Array<{ chapterIndex: number; keyword: string; snippet: string }>> {
    const { contextChars = 100, maxResults = 10, excludeChapter } = options;
    const results: Array<{ chapterIndex: number; keyword: string; snippet: string }> = [];
    const chapters = await this.listChapters();

    for (const file of chapters) {
      const match = file.match(/Chapter-(\d+)\.md/);
      if (!match) continue;
      const idx = parseInt(match[1], 10);
      if (idx === excludeChapter) continue;

      try {
        const raw = await this.readFile(`chapters/${file}`);
        const { content } = matter(raw);

        for (const keyword of keywords) {
          if (!keyword || keyword.length < 2) continue;
          let searchFrom = 0;
          while (results.length < maxResults) {
            const pos = content.indexOf(keyword, searchFrom);
            if (pos === -1) break;

            const start = Math.max(0, pos - contextChars);
            const end = Math.min(content.length, pos + keyword.length + contextChars);
            const snippet = (start > 0 ? '...' : '') + content.substring(start, end).trim() + (end < content.length ? '...' : '');

            results.push({ chapterIndex: idx, keyword, snippet });
            searchFrom = pos + keyword.length;
          }
          if (results.length >= maxResults) break;
        }
      } catch {
        // skip unreadable chapters
      }
      if (results.length >= maxResults) break;
    }

    return results;
  }

  private countWords(text: string): number {
    // Chinese characters count as individual words
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    // English words
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }

  // ============ Project State ============

  async getProjectPath(): string {
    return this.projectPath;
  }

  async getContent(location: { type: string; identifier: string | number }): Promise<string> {
    switch (location.type) {
      case 'chapter':
        return this.getChapter(location.identifier as number);
      case 'character':
        return this.getCharacter(location.identifier as string);
      case 'outline':
        return this.getOutline();
      default:
        throw new Error(`Unknown content type: ${location.type}`);
    }
  }

  async updateContent(
    location: { type: string; identifier: string | number },
    content: string
  ): Promise<void> {
    switch (location.type) {
      case 'chapter':
        await this.saveChapter(location.identifier as number, content);
        break;
      case 'character':
        await this.saveCharacter(location.identifier as string, content);
        break;
      case 'outline':
        await this.saveOutline(content);
        break;
      default:
        throw new Error(`Unknown content type: ${location.type}`);
    }
  }
}
