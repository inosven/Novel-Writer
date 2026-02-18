import * as path from 'path';
import type {
  MemorySearchResult,
  Tag,
  Entity,
  Relationship,
} from '../types/index.js';
import { LanceDBAdapter } from './rag/LanceDBAdapter.js';
import { TagManager } from './tags/TagManager.js';
import { KnowledgeGraph } from './graph/KnowledgeGraph.js';
import { EmbeddingService } from './rag/EmbeddingService.js';

export interface MemoryConfig {
  projectPath: string;
  embeddingProvider: 'openai' | 'ollama' | 'local';
  embeddingApiKey?: string;
  embeddingModel?: string;
  embeddingHost?: string;
}

/**
 * Unified Memory System that integrates RAG, Tags, and Knowledge Graph
 */
export class MemorySystem {
  public rag: LanceDBAdapter;
  public tags: TagManager;
  public graph: KnowledgeGraph;

  private embeddingService: EmbeddingService;
  private projectPath: string;
  private initialized = false;

  constructor(config: MemoryConfig) {
    this.projectPath = config.projectPath;

    // Initialize embedding service
    this.embeddingService = new EmbeddingService({
      provider: config.embeddingProvider,
      apiKey: config.embeddingApiKey,
      model: config.embeddingModel,
      host: config.embeddingHost,
    });

    // Initialize components
    this.rag = new LanceDBAdapter(
      path.join(config.projectPath, '.state', 'vector-db'),
      this.embeddingService
    );

    this.tags = new TagManager(path.join(config.projectPath, '.state', 'tags.db'));

    this.graph = new KnowledgeGraph({
      persistPath: path.join(config.projectPath, '.state', 'knowledge-graph', 'graph.json'),
    });
  }

  /**
   * Initialize all memory components
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.rag.initialize();
    await this.tags.initialize();
    await this.graph.initialize();

    this.initialized = true;
  }

  /**
   * Search across all memory systems
   */
  async search(query: string, options?: SearchOptions): Promise<UnifiedSearchResult> {
    // RAG semantic search
    const ragResults = await this.rag.search(query, {
      limit: options?.limit || 10,
      type: options?.type,
      tags: options?.tags,
    });

    // Tag-based filtering
    let taggedContentIds: string[] = [];
    if (options?.tags && options.tags.length > 0) {
      taggedContentIds = await this.tags.findByTags({
        includeAny: options.tags,
        chapterRange: options?.chapterRange,
      });
    }

    // Knowledge graph query (if entities specified)
    let graphResults: GraphQueryResult | null = null;
    if (options?.entities && options.entities.length > 0) {
      graphResults = await this.queryGraphForEntities(options.entities);
    }

    return {
      ragResults,
      taggedContentIds,
      graphResults,
    };
  }

  /**
   * Add content to all relevant memory systems
   */
  async addContent(content: AddContentInput): Promise<void> {
    // Add to RAG
    await this.rag.addDocument(content.text, {
      source: content.source,
      chapterIndex: content.chapterIndex,
      type: content.type,
      tags: content.tags || [],
    });

    // Add tags
    if (content.tags && content.tags.length > 0) {
      for (const tagName of content.tags) {
        const tag = await this.tags.getOrCreateTag(tagName, 'custom');
        await this.tags.tagContent(content.source, [tag.id], {
          chapterIndex: content.chapterIndex,
        });
      }
    }

    // Extract and add entities to graph (for character content)
    if (content.type === 'character' && content.entities) {
      for (const entity of content.entities) {
        await this.graph.addEntity(entity);
      }
    }
  }

  /**
   * Update content in memory systems
   */
  async updateContent(
    location: { type: string; identifier: string | number },
    newContent: string
  ): Promise<void> {
    const source = `${location.type}_${location.identifier}`;

    // Remove old content from RAG
    await this.rag.deleteBySource(source);

    // Add updated content
    await this.rag.addDocument(newContent, {
      source,
      chapterIndex: typeof location.identifier === 'number' ? location.identifier : undefined,
      type: location.type as any,
      tags: [],
    });
  }

  /**
   * Extract entities from text using simple pattern matching
   * (In production, this could use LLM for better extraction)
   */
  async extractEntities(text: string): Promise<Entity[]> {
    const entities: Entity[] = [];

    // Simple pattern matching for marked entities: [[name:type]]
    const matches = text.matchAll(/\[\[([^:]+):([^\]]+)\]\]/g);

    for (const match of matches) {
      const name = match[1].trim();
      const type = match[2].trim() as Entity['type'];

      if (['character', 'location', 'object', 'event', 'organization'].includes(type)) {
        entities.push({
          id: `${type}_${name}`,
          type,
          name,
          properties: {},
        });
      }
    }

    return entities;
  }

  /**
   * Query knowledge graph for specific entities
   */
  private async queryGraphForEntities(entityIds: string[]): Promise<GraphQueryResult> {
    const entities: Entity[] = [];
    const relationships: Relationship[] = [];

    for (const id of entityIds) {
      const entity = await this.graph.getEntity(id);
      if (entity) {
        entities.push(entity);
        const rels = await this.graph.getRelationships(id);
        relationships.push(...rels);
      }
    }

    return { entities, relationships };
  }

  /**
   * Validate a fact against knowledge graph (for Reviewer)
   */
  async validateFact(fact: FactAssertion): Promise<ValidationResult> {
    return this.graph.validateFact(fact);
  }

  /**
   * Get timeline from knowledge graph
   */
  async getTimeline(characterId?: string): Promise<TimelineEvent[]> {
    return this.graph.getTimeline(characterId);
  }

  /**
   * Search for style references
   */
  async searchStyleReferences(query: string, limit = 5): Promise<MemorySearchResult[]> {
    return this.rag.search(query, {
      limit,
      type: 'style',
    });
  }

  /**
   * Search for ground truth references
   */
  async searchGroundTruth(query: string, limit = 5): Promise<MemorySearchResult[]> {
    return this.rag.search(query, {
      limit,
      type: 'reference',
      tags: ['ground-truth'],
    });
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    await this.rag.close();
    await this.tags.close();
    await this.graph.persist();
  }
}

// ============ Types ============

export interface SearchOptions {
  limit?: number;
  type?: 'chapter' | 'character' | 'outline' | 'reference' | 'style';
  tags?: string[];
  chapterRange?: [number, number];
  entities?: string[];
}

export interface UnifiedSearchResult {
  ragResults: MemorySearchResult[];
  taggedContentIds: string[];
  graphResults: GraphQueryResult | null;
}

export interface GraphQueryResult {
  entities: Entity[];
  relationships: Relationship[];
}

export interface AddContentInput {
  text: string;
  source: string;
  type: 'chapter' | 'character' | 'outline' | 'reference' | 'style';
  chapterIndex?: number;
  tags?: string[];
  entities?: Entity[];
}

export interface FactAssertion {
  entityId: string;
  property?: string;
  expectedValue?: unknown;
  relationship?: {
    type: string;
    target: string;
    shouldNotExist?: boolean;
  };
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  conflict?: unknown;
}

export interface TimelineEvent {
  id: string;
  name: string;
  time: string;
  participants: string[];
}
