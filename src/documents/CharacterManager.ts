import { v4 as uuidv4 } from 'uuid';
import type { Character, CharacterRelationship } from '../types/index.js';
import { DocumentManager } from './DocumentManager.js';

/**
 * Manages character CRUD operations and character profiles
 */
export class CharacterManager {
  private docManager: DocumentManager;

  constructor(docManager: DocumentManager) {
    this.docManager = docManager;
  }

  /**
   * Create a new character with the given information
   */
  async createCharacter(input: CreateCharacterInput): Promise<Character> {
    const character: Character = {
      id: uuidv4(),
      name: input.name,
      basicInfo: input.basicInfo || {},
      personality: input.personality || {
        core: '',
        strengths: [],
        weaknesses: [],
      },
      background: input.background || '',
      relationships: input.relationships || [],
      arc: input.arc || {
        startState: '',
        trigger: '',
        endState: '',
      },
      role: input.role || '',
      appearances: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Generate markdown content
    const markdown = this.generateCharacterMarkdown(character);
    await this.docManager.saveCharacter(character.name, markdown);

    return character;
  }

  /**
   * Get a character by name
   */
  async getCharacter(name: string): Promise<Character | null> {
    try {
      const content = await this.docManager.getCharacter(name);
      return this.parseCharacterMarkdown(name, content);
    } catch {
      return null;
    }
  }

  /**
   * Update an existing character
   */
  async updateCharacter(name: string, updates: Partial<Character>): Promise<Character> {
    const existing = await this.getCharacter(name);
    if (!existing) {
      throw new Error(`Character "${name}" not found`);
    }

    const updated: Character = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    // Handle name change
    if (updates.name && updates.name !== name) {
      await this.docManager.deleteCharacter(name);
    }

    const markdown = this.generateCharacterMarkdown(updated);
    await this.docManager.saveCharacter(updated.name, markdown);

    return updated;
  }

  /**
   * Delete a character
   * Returns chapters where the character appears (for warning)
   */
  async deleteCharacter(name: string): Promise<{ deleted: boolean; appearsIn: number[] }> {
    const character = await this.getCharacter(name);
    if (!character) {
      return { deleted: false, appearsIn: [] };
    }

    // Check appearances
    const appearsIn = character.appearances;

    if (appearsIn.length > 0) {
      // Return warning about appearances
      return { deleted: false, appearsIn };
    }

    await this.docManager.deleteCharacter(name);
    return { deleted: true, appearsIn: [] };
  }

  /**
   * Force delete a character (even if they appear in chapters)
   */
  async forceDeleteCharacter(name: string): Promise<void> {
    await this.docManager.deleteCharacter(name);
  }

  /**
   * List all character names
   */
  async listCharacters(): Promise<string[]> {
    return this.docManager.listCharacters();
  }

  /**
   * Get all characters with full details
   */
  async getAllCharacters(): Promise<Character[]> {
    return this.docManager.getCharacters();
  }

  /**
   * Add a relationship between characters
   */
  async addRelationship(
    characterName: string,
    relationship: CharacterRelationship
  ): Promise<void> {
    const character = await this.getCharacter(characterName);
    if (!character) {
      throw new Error(`Character "${characterName}" not found`);
    }

    character.relationships.push(relationship);
    character.updatedAt = new Date();

    const markdown = this.generateCharacterMarkdown(character);
    await this.docManager.saveCharacter(characterName, markdown);
  }

  /**
   * Record that a character appears in a chapter
   */
  async recordAppearance(characterName: string, chapterIndex: number): Promise<void> {
    const character = await this.getCharacter(characterName);
    if (!character) {
      throw new Error(`Character "${characterName}" not found`);
    }

    if (!character.appearances.includes(chapterIndex)) {
      character.appearances.push(chapterIndex);
      character.appearances.sort((a, b) => a - b);
      character.updatedAt = new Date();

      const markdown = this.generateCharacterMarkdown(character);
      await this.docManager.saveCharacter(characterName, markdown);
    }
  }

  /**
   * Find all characters that appear in a specific chapter
   */
  async findCharactersInChapter(chapterIndex: number): Promise<Character[]> {
    const allCharacters = await this.getAllCharacters();
    return allCharacters.filter(c => c.appearances.includes(chapterIndex));
  }

  /**
   * Check consistency of character information with existing content
   */
  async checkConsistency(
    characterName: string,
    newInfo: Partial<Character>
  ): Promise<ConsistencyCheckResult> {
    const existing = await this.getCharacter(characterName);
    if (!existing) {
      return { consistent: true, issues: [] };
    }

    const issues: ConsistencyIssue[] = [];

    // Check age consistency
    if (newInfo.basicInfo?.age && existing.basicInfo.age) {
      if (newInfo.basicInfo.age !== existing.basicInfo.age) {
        issues.push({
          field: 'age',
          existingValue: existing.basicInfo.age,
          newValue: newInfo.basicInfo.age,
          severity: 'major',
          message: `年龄从 ${existing.basicInfo.age} 改为 ${newInfo.basicInfo.age}`,
          appearsIn: existing.appearances,
        });
      }
    }

    // Check gender consistency (critical)
    if (newInfo.basicInfo?.gender && existing.basicInfo.gender) {
      if (newInfo.basicInfo.gender !== existing.basicInfo.gender) {
        issues.push({
          field: 'gender',
          existingValue: existing.basicInfo.gender,
          newValue: newInfo.basicInfo.gender,
          severity: 'critical',
          message: `性别从 ${existing.basicInfo.gender} 改为 ${newInfo.basicInfo.gender}`,
          appearsIn: existing.appearances,
        });
      }
    }

    return {
      consistent: issues.length === 0,
      issues,
    };
  }

  /**
   * Generate markdown content for a character
   */
  private generateCharacterMarkdown(character: Character): string {
    const lines: string[] = [
      '---',
      `id: ${character.id}`,
      `name: ${character.name}`,
    ];

    if (character.basicInfo.age) {
      lines.push(`age: ${character.basicInfo.age}`);
    }
    if (character.basicInfo.gender) {
      lines.push(`gender: ${character.basicInfo.gender}`);
    }
    if (character.basicInfo.occupation) {
      lines.push(`occupation: ${character.basicInfo.occupation}`);
    }
    if (character.appearances.length > 0) {
      lines.push(`appearances: [${character.appearances.join(', ')}]`);
    }
    lines.push(`createdAt: ${character.createdAt.toISOString()}`);
    lines.push(`updatedAt: ${character.updatedAt.toISOString()}`);
    lines.push('---');
    lines.push('');
    lines.push(`# ${character.name}`);
    lines.push('');

    // Basic Info Section
    lines.push('## 基础信息');
    lines.push('');
    if (character.basicInfo.age) {
      lines.push(`- 年龄: ${character.basicInfo.age}`);
    }
    if (character.basicInfo.gender) {
      lines.push(`- 性别: ${character.basicInfo.gender}`);
    }
    if (character.basicInfo.occupation) {
      lines.push(`- 职业: ${character.basicInfo.occupation}`);
    }
    if (character.basicInfo.appearance) {
      lines.push(`- 外貌特征: ${character.basicInfo.appearance}`);
    }
    lines.push('');

    // Personality Section
    lines.push('## 性格特点');
    lines.push('');
    if (character.personality.core) {
      lines.push(`### 核心性格`);
      lines.push(character.personality.core);
      lines.push('');
    }
    if (character.personality.strengths.length > 0) {
      lines.push('### 优点');
      for (const s of character.personality.strengths) {
        lines.push(`- ${s}`);
      }
      lines.push('');
    }
    if (character.personality.weaknesses.length > 0) {
      lines.push('### 缺点');
      for (const w of character.personality.weaknesses) {
        lines.push(`- ${w}`);
      }
      lines.push('');
    }
    if (character.personality.speechStyle) {
      lines.push('### 说话方式');
      lines.push(character.personality.speechStyle);
      lines.push('');
    }

    // Background Section
    if (character.background) {
      lines.push('## 背景故事');
      lines.push('');
      lines.push(character.background);
      lines.push('');
    }

    // Relationships Section
    if (character.relationships.length > 0) {
      lines.push('## 人物关系');
      lines.push('');
      for (const rel of character.relationships) {
        lines.push(`- 与${rel.targetCharacterName}的关系: ${rel.description}`);
      }
      lines.push('');
    }

    // Arc Section
    if (character.arc.startState || character.arc.trigger || character.arc.endState) {
      lines.push('## 角色弧光');
      lines.push('');
      if (character.arc.startState) {
        lines.push(`- 起点状态: ${character.arc.startState}`);
      }
      if (character.arc.trigger) {
        lines.push(`- 转变触发: ${character.arc.trigger}`);
      }
      if (character.arc.endState) {
        lines.push(`- 终点状态: ${character.arc.endState}`);
      }
      lines.push('');
    }

    // Role Section
    if (character.role) {
      lines.push('## 在故事中的作用');
      lines.push('');
      lines.push(character.role);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Parse markdown content to Character object
   */
  private parseCharacterMarkdown(name: string, content: string): Character | null {
    // Use gray-matter to parse front matter
    const matter = require('gray-matter');
    const { data, content: body } = matter(content);

    // Parse sections from markdown
    const sections: Record<string, string> = {};
    let currentSection = '';
    const lines = body.split('\n');

    for (const line of lines) {
      if (line.startsWith('## ')) {
        currentSection = line.replace('## ', '').trim();
        sections[currentSection] = '';
      } else if (line.startsWith('### ')) {
        // Subsection - append to current section
        sections[currentSection] += line + '\n';
      } else if (currentSection) {
        sections[currentSection] += line + '\n';
      }
    }

    return {
      id: data.id || name,
      name: data.name || name,
      basicInfo: {
        age: data.age,
        gender: data.gender,
        occupation: data.occupation,
        appearance: this.extractListItem(sections['基础信息'], '外貌特征'),
      },
      personality: {
        core: this.extractSubsection(sections['性格特点'], '核心性格'),
        strengths: this.extractList(sections['性格特点'], '优点'),
        weaknesses: this.extractList(sections['性格特点'], '缺点'),
        speechStyle: this.extractSubsection(sections['性格特点'], '说话方式'),
      },
      background: sections['背景故事']?.trim() || '',
      relationships: this.parseRelationships(sections['人物关系']),
      arc: {
        startState: this.extractListItem(sections['角色弧光'], '起点状态'),
        trigger: this.extractListItem(sections['角色弧光'], '转变触发'),
        endState: this.extractListItem(sections['角色弧光'], '终点状态'),
      },
      role: sections['在故事中的作用']?.trim() || '',
      appearances: data.appearances || [],
      createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
    };
  }

  private extractListItem(section: string | undefined, label: string): string {
    if (!section) return '';
    const match = section.match(new RegExp(`-\\s*${label}:\\s*(.+)`));
    return match?.[1]?.trim() || '';
  }

  private extractSubsection(section: string | undefined, label: string): string {
    if (!section) return '';
    const match = section.match(new RegExp(`###\\s*${label}\\n([\\s\\S]*?)(?=###|$)`));
    return match?.[1]?.trim() || '';
  }

  private extractList(section: string | undefined, label: string): string[] {
    const subsection = this.extractSubsection(section, label);
    if (!subsection) return [];
    const matches = subsection.match(/^-\s*(.+)$/gm);
    return matches?.map(m => m.replace(/^-\s*/, '').trim()) || [];
  }

  private parseRelationships(section: string | undefined): CharacterRelationship[] {
    if (!section) return [];
    const relationships: CharacterRelationship[] = [];
    const matches = section.matchAll(/^-\s*与(.+?)的关系:\s*(.+)$/gm);
    for (const match of matches) {
      relationships.push({
        targetCharacterId: '',
        targetCharacterName: match[1].trim(),
        relationshipType: '',
        description: match[2].trim(),
      });
    }
    return relationships;
  }
}

// ============ Types ============

export interface CreateCharacterInput {
  name: string;
  basicInfo?: Partial<Character['basicInfo']>;
  personality?: Partial<Character['personality']>;
  background?: string;
  relationships?: CharacterRelationship[];
  arc?: Partial<Character['arc']>;
  role?: string;
}

export interface ConsistencyCheckResult {
  consistent: boolean;
  issues: ConsistencyIssue[];
}

export interface ConsistencyIssue {
  field: string;
  existingValue: unknown;
  newValue: unknown;
  severity: 'critical' | 'major' | 'minor';
  message: string;
  appearsIn: number[];
}
