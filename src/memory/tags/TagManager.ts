/**
 * @module src/memory/tags/TagManager
 * @description 标签管理器。
 * 使用 SQLite 存储内容标签，支持按标签过滤和章节范围查询。
 * 用于辅助 RAG 检索，通过标签缩小搜索范围。
 */
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import type { Tag } from '../../types/index.js';

/**
 * Tag Manager using SQLite for fast tag-based filtering
 */
export class TagManager {
  private dbPath: string;
  private db: Database.Database | null = null;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.createSchema();
  }

  /**
   * Create database schema
   */
  private createSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        value TEXT,
        parent_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES tags(id)
      );

      CREATE TABLE IF NOT EXISTS content_tags (
        id TEXT PRIMARY KEY,
        content_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        chapter_index INTEGER,
        line_start INTEGER,
        line_end INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tag_id) REFERENCES tags(id)
      );

      CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
      CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);
      CREATE INDEX IF NOT EXISTS idx_content_tags_content ON content_tags(content_id);
      CREATE INDEX IF NOT EXISTS idx_content_tags_tag ON content_tags(tag_id);
      CREATE INDEX IF NOT EXISTS idx_content_tags_chapter ON content_tags(chapter_index);
    `);
  }

  /**
   * Add a new tag
   */
  async addTag(tag: Omit<Tag, 'id'> & { id?: string }): Promise<Tag> {
    if (!this.db) throw new Error('Database not initialized');

    const newTag: Tag = {
      id: tag.id || uuidv4(),
      name: tag.name,
      category: tag.category,
      value: tag.value,
      parentId: tag.parentId,
    };

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tags (id, name, category, value, parent_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      newTag.id,
      newTag.name,
      newTag.category,
      newTag.value || null,
      newTag.parentId || null,
      new Date().toISOString()
    );

    return newTag;
  }

  /**
   * Get a tag by ID
   */
  async getTag(id: string): Promise<Tag | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as TagRow | undefined;

    if (!row) return null;

    return this.rowToTag(row);
  }

  /**
   * Get a tag by name
   */
  async getTagByName(name: string): Promise<Tag | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.prepare('SELECT * FROM tags WHERE name = ?').get(name) as TagRow | undefined;

    if (!row) return null;

    return this.rowToTag(row);
  }

  /**
   * Get or create a tag
   */
  async getOrCreateTag(name: string, category: Tag['category']): Promise<Tag> {
    const existing = await this.getTagByName(name);
    if (existing) return existing;

    return this.addTag({ name, category });
  }

  /**
   * List all tags
   */
  async listTags(filter?: TagFilter): Promise<Tag[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT * FROM tags WHERE 1=1';
    const params: unknown[] = [];

    if (filter?.category) {
      sql += ' AND category = ?';
      params.push(filter.category);
    }

    if (filter?.nameContains) {
      sql += ' AND name LIKE ?';
      params.push(`%${filter.nameContains}%`);
    }

    const rows = this.db.prepare(sql).all(...params) as TagRow[];

    return rows.map(r => this.rowToTag(r));
  }

  /**
   * Delete a tag
   */
  async deleteTag(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Delete content associations first
    this.db.prepare('DELETE FROM content_tags WHERE tag_id = ?').run(id);

    // Delete the tag
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  }

  /**
   * Tag content with given tags
   */
  async tagContent(
    contentId: string,
    tagIds: string[],
    metadata?: TagContentMetadata
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO content_tags
      (id, content_id, tag_id, chapter_index, line_start, line_end, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const tagId of tagIds) {
      stmt.run(
        uuidv4(),
        contentId,
        tagId,
        metadata?.chapterIndex ?? null,
        metadata?.lineRange?.[0] ?? null,
        metadata?.lineRange?.[1] ?? null,
        new Date().toISOString()
      );
    }
  }

  /**
   * Remove tags from content
   */
  async untagContent(contentId: string, tagIds?: string[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    if (tagIds && tagIds.length > 0) {
      const placeholders = tagIds.map(() => '?').join(',');
      this.db.prepare(
        `DELETE FROM content_tags WHERE content_id = ? AND tag_id IN (${placeholders})`
      ).run(contentId, ...tagIds);
    } else {
      this.db.prepare('DELETE FROM content_tags WHERE content_id = ?').run(contentId);
    }
  }

  /**
   * Find content by tags
   */
  async findByTags(query: TagQuery): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT DISTINCT content_id FROM content_tags WHERE 1=1';
    const params: unknown[] = [];

    if (query.includeAny && query.includeAny.length > 0) {
      // Find tags by name first
      const tagPlaceholders = query.includeAny.map(() => '?').join(',');
      const tagRows = this.db.prepare(
        `SELECT id FROM tags WHERE name IN (${tagPlaceholders})`
      ).all(...query.includeAny) as { id: string }[];

      const tagIds = tagRows.map(r => r.id);

      if (tagIds.length > 0) {
        const idPlaceholders = tagIds.map(() => '?').join(',');
        sql += ` AND tag_id IN (${idPlaceholders})`;
        params.push(...tagIds);
      } else {
        return []; // No matching tags found
      }
    }

    if (query.chapterRange) {
      sql += ' AND chapter_index >= ? AND chapter_index <= ?';
      params.push(query.chapterRange[0], query.chapterRange[1]);
    }

    if (query.excludeAny && query.excludeAny.length > 0) {
      const tagPlaceholders = query.excludeAny.map(() => '?').join(',');
      const tagRows = this.db.prepare(
        `SELECT id FROM tags WHERE name IN (${tagPlaceholders})`
      ).all(...query.excludeAny) as { id: string }[];

      const tagIds = tagRows.map(r => r.id);

      if (tagIds.length > 0) {
        const idPlaceholders = tagIds.map(() => '?').join(',');
        sql += ` AND content_id NOT IN (
          SELECT content_id FROM content_tags WHERE tag_id IN (${idPlaceholders})
        )`;
        params.push(...tagIds);
      }
    }

    const rows = this.db.prepare(sql).all(...params) as { content_id: string }[];

    return rows.map(r => r.content_id);
  }

  /**
   * Get tags for content
   */
  async getTagsForContent(contentId: string): Promise<Tag[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db.prepare(`
      SELECT t.* FROM tags t
      INNER JOIN content_tags ct ON ct.tag_id = t.id
      WHERE ct.content_id = ?
    `).all(contentId) as TagRow[];

    return rows.map(r => this.rowToTag(r));
  }

  /**
   * Get content count by tag
   */
  async getTagStats(): Promise<TagStats[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db.prepare(`
      SELECT t.id, t.name, t.category, COUNT(ct.id) as count
      FROM tags t
      LEFT JOIN content_tags ct ON ct.tag_id = t.id
      GROUP BY t.id
      ORDER BY count DESC
    `).all() as (TagRow & { count: number })[];

    return rows.map(r => ({
      tag: this.rowToTag(r),
      count: r.count,
    }));
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private rowToTag(row: TagRow): Tag {
    return {
      id: row.id,
      name: row.name,
      category: row.category as Tag['category'],
      value: row.value || undefined,
      parentId: row.parent_id || undefined,
    };
  }
}

// ============ Types ============

interface TagRow {
  id: string;
  name: string;
  category: string;
  value: string | null;
  parent_id: string | null;
  created_at: string;
}

export interface TagFilter {
  category?: Tag['category'];
  nameContains?: string;
}

export interface TagContentMetadata {
  chapterIndex?: number;
  lineRange?: [number, number];
}

export interface TagQuery {
  includeAny?: string[];
  includeAll?: string[];
  excludeAny?: string[];
  chapterRange?: [number, number];
}

export interface TagStats {
  tag: Tag;
  count: number;
}
