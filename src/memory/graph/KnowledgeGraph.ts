import * as fs from 'fs/promises';
import * as path from 'path';
import type { Entity, Relationship } from '../../types/index.js';
import type { FactAssertion, ValidationResult, TimelineEvent } from '../MemorySystem.js';

interface GraphConfig {
  persistPath: string;
}

interface GraphData {
  entities: Map<string, Entity>;
  relationships: Map<string, Relationship>;
  pendingEntities: Map<string, Entity>;
  pendingRelationships: Map<string, Relationship>;
}

/**
 * Knowledge Graph for storing and validating hard facts
 * Used primarily by the Reviewer agent
 */
export class KnowledgeGraph {
  private persistPath: string;
  private entities: Map<string, Entity> = new Map();
  private relationships: Map<string, Relationship> = new Map();
  private pendingEntities: Map<string, Entity> = new Map();
  private pendingRelationships: Map<string, Relationship> = new Map();
  private initialized = false;

  constructor(config: GraphConfig) {
    this.persistPath = config.persistPath;
  }

  /**
   * Initialize the graph
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const data = await fs.readFile(this.persistPath, 'utf-8');
      const parsed = JSON.parse(data);

      this.entities = new Map(Object.entries(parsed.entities || {}));
      this.relationships = new Map(Object.entries(parsed.relationships || {}));
    } catch {
      // File doesn't exist, start fresh
      this.entities = new Map();
      this.relationships = new Map();
    }

    this.initialized = true;
  }

  /**
   * Add an entity to the graph
   */
  async addEntity(entity: Entity): Promise<void> {
    this.entities.set(entity.id, entity);
    await this.persist();
  }

  /**
   * Add entities to pending (not yet confirmed)
   */
  async addPendingEntities(entities: Entity[]): Promise<void> {
    for (const entity of entities) {
      this.pendingEntities.set(entity.id, entity);
    }
  }

  /**
   * Confirm pending entities (move to main graph)
   */
  async confirmPendingEntities(entityIds?: string[]): Promise<void> {
    const idsToConfirm = entityIds || Array.from(this.pendingEntities.keys());

    for (const id of idsToConfirm) {
      const entity = this.pendingEntities.get(id);
      if (entity) {
        this.entities.set(id, entity);
        this.pendingEntities.delete(id);
      }
    }

    await this.persist();
  }

  /**
   * Discard pending entities
   */
  discardPendingEntities(entityIds?: string[]): void {
    if (entityIds) {
      for (const id of entityIds) {
        this.pendingEntities.delete(id);
      }
    } else {
      this.pendingEntities.clear();
    }
  }

  /**
   * Get an entity by ID
   */
  async getEntity(id: string): Promise<Entity | null> {
    return this.entities.get(id) || this.pendingEntities.get(id) || null;
  }

  /**
   * Update an entity
   */
  async updateEntity(id: string, updates: Partial<Entity>): Promise<Entity | null> {
    const entity = this.entities.get(id);
    if (!entity) return null;

    const updated = {
      ...entity,
      ...updates,
      properties: { ...entity.properties, ...updates.properties },
    };

    this.entities.set(id, updated);
    await this.persist();

    return updated;
  }

  /**
   * Delete an entity
   */
  async deleteEntity(id: string): Promise<boolean> {
    const deleted = this.entities.delete(id);

    if (deleted) {
      // Also delete related relationships
      for (const [relId, rel] of this.relationships) {
        if (rel.from === id || rel.to === id) {
          this.relationships.delete(relId);
        }
      }
      await this.persist();
    }

    return deleted;
  }

  /**
   * Add a relationship
   */
  async addRelationship(relationship: Relationship): Promise<void> {
    this.relationships.set(relationship.id, relationship);
    await this.persist();
  }

  /**
   * Get relationships for an entity
   */
  async getRelationships(
    entityId: string,
    direction: 'in' | 'out' | 'both' = 'both'
  ): Promise<Relationship[]> {
    const results: Relationship[] = [];

    for (const rel of this.relationships.values()) {
      if (direction === 'out' || direction === 'both') {
        if (rel.from === entityId) {
          results.push(rel);
        }
      }
      if (direction === 'in' || direction === 'both') {
        if (rel.to === entityId) {
          results.push(rel);
        }
      }
    }

    return results;
  }

  /**
   * Delete a relationship
   */
  async deleteRelationship(id: string): Promise<boolean> {
    const deleted = this.relationships.delete(id);
    if (deleted) {
      await this.persist();
    }
    return deleted;
  }

  /**
   * Query entities by type
   */
  async queryByType(type: Entity['type']): Promise<Entity[]> {
    return Array.from(this.entities.values()).filter(e => e.type === type);
  }

  /**
   * Query entities by property
   */
  async queryByProperty(property: string, value: unknown): Promise<Entity[]> {
    return Array.from(this.entities.values()).filter(
      e => e.properties[property] === value
    );
  }

  /**
   * Validate a fact assertion (for Reviewer)
   */
  async validateFact(fact: FactAssertion): Promise<ValidationResult> {
    const entity = await this.getEntity(fact.entityId);

    if (!entity) {
      // Entity not in graph - might be new, which is OK
      return { valid: true };
    }

    // Validate property
    if (fact.property !== undefined) {
      const currentValue = entity.properties[fact.property];

      if (currentValue !== undefined && currentValue !== fact.expectedValue) {
        return {
          valid: false,
          reason: `属性"${fact.property}"不一致: 已知为"${currentValue}", 但声称为"${fact.expectedValue}"`,
          conflict: {
            property: fact.property,
            existing: currentValue,
            claimed: fact.expectedValue,
          },
        };
      }
    }

    // Validate relationship
    if (fact.relationship) {
      const rels = await this.getRelationships(fact.entityId, 'both');
      const matchingRel = rels.find(
        r =>
          r.type === fact.relationship!.type &&
          (r.to === fact.relationship!.target || r.from === fact.relationship!.target)
      );

      if (matchingRel && fact.relationship.shouldNotExist) {
        return {
          valid: false,
          reason: `关系冲突: "${fact.relationship.type}"关系已存在`,
          conflict: matchingRel,
        };
      }

      if (!matchingRel && !fact.relationship.shouldNotExist) {
        // Relationship doesn't exist - this is usually OK (new relationship)
        return { valid: true };
      }
    }

    return { valid: true };
  }

  /**
   * Get timeline of events
   */
  async getTimeline(characterId?: string): Promise<TimelineEvent[]> {
    const events: TimelineEvent[] = [];

    // Get all event entities
    const eventEntities = await this.queryByType('event');

    for (const event of eventEntities) {
      // If characterId specified, filter by participation
      if (characterId) {
        const rels = await this.getRelationships(event.id, 'in');
        const participated = rels.some(
          r => r.from === characterId && r.type === 'participated_in'
        );
        if (!participated) continue;
      }

      events.push({
        id: event.id,
        name: event.name,
        time: (event.properties.time as string) || '',
        participants: (await this.getRelationships(event.id, 'in'))
          .filter(r => r.type === 'participated_in')
          .map(r => r.from),
      });
    }

    // Sort by time
    return events.sort((a, b) => {
      if (!a.time || !b.time) return 0;
      return a.time.localeCompare(b.time);
    });
  }

  /**
   * Apply updates from Reviewer
   */
  async applyUpdates(updates: GraphUpdate[]): Promise<void> {
    for (const update of updates) {
      switch (update.action) {
        case 'add':
          if (update.entity) {
            await this.addEntity(update.entity);
          }
          if (update.relationship) {
            await this.addRelationship(update.relationship);
          }
          break;

        case 'update':
          if (update.entityId && update.properties) {
            const entity = await this.getEntity(update.entityId);
            if (entity) {
              await this.updateEntity(update.entityId, {
                properties: { ...entity.properties, ...update.properties },
              });
            }
          }
          break;

        case 'delete':
          if (update.entityId) {
            await this.deleteEntity(update.entityId);
          }
          if (update.relationshipId) {
            await this.deleteRelationship(update.relationshipId);
          }
          break;
      }
    }
  }

  /**
   * Get graph statistics
   */
  async getStats(): Promise<GraphStats> {
    const entityCounts: Record<string, number> = {};
    const relationshipCounts: Record<string, number> = {};

    for (const entity of this.entities.values()) {
      entityCounts[entity.type] = (entityCounts[entity.type] || 0) + 1;
    }

    for (const rel of this.relationships.values()) {
      relationshipCounts[rel.type] = (relationshipCounts[rel.type] || 0) + 1;
    }

    return {
      totalEntities: this.entities.size,
      totalRelationships: this.relationships.size,
      entityCounts,
      relationshipCounts,
      pendingEntities: this.pendingEntities.size,
    };
  }

  /**
   * Persist graph to disk
   */
  async persist(): Promise<void> {
    const data = {
      entities: Object.fromEntries(this.entities),
      relationships: Object.fromEntries(this.relationships),
    };

    const dir = path.dirname(this.persistPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.persistPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Backup the graph
   */
  async backup(targetPath: string): Promise<void> {
    await this.persist();
    await fs.cp(this.persistPath, targetPath);
  }

  /**
   * Restore from backup
   */
  async restore(backupPath: string): Promise<void> {
    await fs.cp(backupPath, this.persistPath);
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Clear the graph
   */
  async clear(): Promise<void> {
    this.entities.clear();
    this.relationships.clear();
    this.pendingEntities.clear();
    this.pendingRelationships.clear();
    await this.persist();
  }
}

// ============ Types ============

export interface GraphUpdate {
  action: 'add' | 'update' | 'delete';
  entity?: Entity;
  relationship?: Relationship;
  entityId?: string;
  relationshipId?: string;
  properties?: Record<string, unknown>;
}

export interface GraphStats {
  totalEntities: number;
  totalRelationships: number;
  entityCounts: Record<string, number>;
  relationshipCounts: Record<string, number>;
  pendingEntities: number;
}
