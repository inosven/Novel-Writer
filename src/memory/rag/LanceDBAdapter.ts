import * as lancedb from '@lancedb/lancedb';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import type { MemorySearchResult } from '../../types/index.js';
import { EmbeddingService } from './EmbeddingService.js';

/**
 * LanceDB adapter for vector storage and retrieval
 */
export class LanceDBAdapter {
  private dbPath: string;
  private embeddingService: EmbeddingService;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private tableName = 'documents';

  constructor(dbPath: string, embeddingService: EmbeddingService) {
    this.dbPath = dbPath;
    this.embeddingService = embeddingService;
  }

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(this.dbPath, { recursive: true });

    // Connect to LanceDB
    this.db = await lancedb.connect(this.dbPath);

    // Check if table exists
    const tables = await this.db.tableNames();

    if (tables.includes(this.tableName)) {
      this.table = await this.db.openTable(this.tableName);
    } else {
      // Create table with initial schema
      await this.createTable();
    }
  }

  /**
   * Create the documents table
   */
  private async createTable(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Create a sample document to establish schema
    const sampleEmbedding = new Array(this.embeddingService.dimension).fill(0);

    const initialData = [{
      id: 'init',
      content: '',
      vector: sampleEmbedding,
      source: '',
      type: 'chapter',
      chapterIndex: -1,
      tags: '',
      createdAt: new Date().toISOString(),
    }];

    this.table = await this.db.createTable(this.tableName, initialData);

    // Delete the initialization record
    await this.table.delete('id = "init"');
  }

  /**
   * Add a document to the store
   */
  async addDocument(content: string, metadata: DocumentMetadata): Promise<string> {
    if (!this.table) throw new Error('Table not initialized');

    // Guard against empty content
    if (!content || content.trim().length === 0) {
      console.warn('addDocument called with empty content, skipping');
      return '';
    }

    const chunks = this.splitIntoChunks(content);

    // Guard against empty chunks
    if (chunks.length === 0) {
      console.warn('No chunks generated from content, skipping');
      return '';
    }

    const embeddings = await this.embeddingService.embedBatch(chunks);

    const records = chunks.map((chunk, i) => ({
      id: `${uuidv4()}_${i}`,
      content: chunk,
      vector: embeddings[i],
      source: metadata.source,
      type: metadata.type,
      chapterIndex: metadata.chapterIndex ?? -1,
      tags: metadata.tags?.join(',') || '',
      createdAt: new Date().toISOString(),
    }));

    await this.table.add(records);

    return records[0].id;
  }

  /**
   * Search for similar documents
   */
  async search(query: string, options?: SearchOptions): Promise<MemorySearchResult[]> {
    if (!this.table) throw new Error('Table not initialized');

    const queryEmbedding = await this.embeddingService.embed(query);
    const limit = options?.limit || 10;

    // Build search query
    let searchQuery = this.table.search(queryEmbedding).limit(limit);

    // Build filter conditions
    const conditions: string[] = [];

    if (options?.type) {
      conditions.push(`type = '${options.type}'`);
    }

    if (options?.chapterRange) {
      conditions.push(
        `chapterIndex >= ${options.chapterRange[0]} AND chapterIndex <= ${options.chapterRange[1]}`
      );
    }

    if (options?.source) {
      conditions.push(`source = '${options.source}'`);
    }

    // Apply filter if conditions exist
    if (conditions.length > 0) {
      searchQuery = searchQuery.where(conditions.join(' AND '));
    }

    const results = await searchQuery.toArray();

    // Filter by tags (post-query since LanceDB array filtering is limited)
    let filteredResults = results;
    if (options?.tags && options.tags.length > 0) {
      filteredResults = results.filter(r => {
        const recordTags = r.tags ? r.tags.split(',') : [];
        return options.tags!.some(t => recordTags.includes(t));
      });
    }

    return filteredResults.map(r => ({
      content: r.content,
      score: r._distance ?? 0,
      metadata: {
        source: r.source,
        type: r.type as any,
        chapterIndex: r.chapterIndex >= 0 ? r.chapterIndex : undefined,
        tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
      },
    }));
  }

  /**
   * Delete documents by source
   */
  async deleteBySource(source: string): Promise<void> {
    if (!this.table) throw new Error('Table not initialized');
    await this.table.delete(`source = '${source}'`);
  }

  /**
   * Delete documents by ID
   */
  async deleteById(id: string): Promise<void> {
    if (!this.table) throw new Error('Table not initialized');
    await this.table.delete(`id = '${id}'`);
  }

  /**
   * Get document count
   */
  async count(): Promise<number> {
    if (!this.table) throw new Error('Table not initialized');
    return this.table.countRows();
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    // LanceDB handles cleanup automatically
    this.db = null;
    this.table = null;
  }

  /**
   * Create a snapshot of the database
   */
  async snapshot(targetPath: string): Promise<void> {
    await fs.cp(this.dbPath, targetPath, { recursive: true });
  }

  /**
   * Restore from a snapshot
   */
  async restore(snapshotPath: string): Promise<void> {
    await this.close();
    await fs.rm(this.dbPath, { recursive: true, force: true });
    await fs.cp(snapshotPath, this.dbPath, { recursive: true });
    await this.initialize();
  }

  /**
   * Split text into chunks for embedding
   */
  private splitIntoChunks(
    content: string,
    chunkSize = 500,
    overlap = 100
  ): string[] {
    const chunks: string[] = [];

    // Split by sentences (Chinese and English)
    const sentences = content.split(/(?<=[。！？.!?])\s*/);

    let currentChunk = '';
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());

        // Keep overlap
        const words = currentChunk.split('');
        currentChunk = words.slice(-overlap).join('') + sentence;
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    // If no chunks created, return the original content
    if (chunks.length === 0 && content.trim()) {
      chunks.push(content.trim());
    }

    return chunks;
  }
}

// ============ Types ============

export interface DocumentMetadata {
  source: string;
  type: 'chapter' | 'character' | 'outline' | 'reference' | 'style';
  chapterIndex?: number;
  tags?: string[];
}

export interface SearchOptions {
  limit?: number;
  type?: 'chapter' | 'character' | 'outline' | 'reference' | 'style';
  tags?: string[];
  chapterRange?: [number, number];
  source?: string;
}
