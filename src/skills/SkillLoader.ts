import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import type {
  SkillConfig,
  SkillMetadata,
  SkillFiles,
  BaseSkillConfig,
  StyleConfig,
  ReviewConfig,
  ReferencesConfig,
} from '../types/index.js';

/**
 * Skill Loader - Loads and manages skill packs
 */
export class SkillLoader {
  private skillsPath: string;
  private loadedSkills: Map<string, SkillConfig> = new Map();

  constructor(projectPath: string) {
    this.skillsPath = path.join(projectPath, '.claude', 'skills');
  }

  /**
   * Load a skill pack
   */
  async loadSkill(skillName: string): Promise<SkillConfig> {
    // Check cache
    if (this.loadedSkills.has(skillName)) {
      return this.loadedSkills.get(skillName)!;
    }

    const skillPath = path.join(this.skillsPath, skillName);
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    // Read SKILL.md
    const skillMd = await fs.readFile(skillMdPath, 'utf-8');
    const { metadata, config } = this.parseSkillMd(skillMd);

    // Load skill files
    const files = await this.loadSkillFiles(skillPath);

    const skill: SkillConfig = {
      name: skillName,
      version: metadata.version || '1.0.0',
      metadata,
      config,
      files,
    };

    // Validate
    this.validateSkill(skill);

    // Cache
    this.loadedSkills.set(skillName, skill);

    return skill;
  }

  /**
   * Parse SKILL.md content
   */
  private parseSkillMd(content: string): {
    metadata: SkillMetadata;
    config: SkillConfig['config'];
  } {
    // Extract YAML configuration block
    const yamlMatch = content.match(/```yaml\s*([\s\S]*?)```/);
    let config: SkillConfig['config'] = {
      base: { targetWordCountPerChapter: '3000-5000', chapterCount: '20-30', pov: '第三人称', tense: '过去时' },
      style: { tone: '严肃', dialogueRatio: '0.3-0.5', descriptionDensity: '中', pacing: '中' },
      review: { strictness: '中', focusAreas: [], ignoredWarnings: [] },
      references: { required: [], optional: [] },
    };

    if (yamlMatch) {
      try {
        const parsed = yaml.parse(yamlMatch[1]);
        config = {
          base: { ...config.base, ...parsed.base },
          style: { ...config.style, ...parsed.style },
          review: { ...config.review, ...parsed.review },
          references: { ...config.references, ...parsed.references },
        };
      } catch (e) {
        console.warn('Failed to parse SKILL.md YAML:', e);
      }
    }

    // Extract metadata from markdown
    const metadata = this.extractMetadata(content);

    return { metadata, config };
  }

  /**
   * Extract metadata from SKILL.md
   */
  private extractMetadata(content: string): SkillMetadata {
    const metadata: SkillMetadata = {
      genre: '',
      language: 'zh-CN',
    };

    // Parse metadata section
    const metadataMatch = content.match(/## Metadata\n([\s\S]*?)(?=\n## |$)/);
    if (metadataMatch) {
      const lines = metadataMatch[1].split('\n');
      for (const line of lines) {
        const match = line.match(/-\s*\*\*(\w+)\*\*:\s*(.+)/);
        if (match) {
          const key = match[1].toLowerCase();
          const value = match[2].trim();
          switch (key) {
            case 'version':
              (metadata as any).version = value;
              break;
            case 'author':
              metadata.author = value;
              break;
            case 'genre':
              metadata.genre = value;
              break;
            case 'language':
              metadata.language = value;
              break;
            case 'created':
              metadata.created = value;
              break;
            case 'updated':
              metadata.updated = value;
              break;
          }
        }
      }
    }

    // Parse features
    const featuresMatch = content.match(/## Features\n([\s\S]*?)(?=\n## |$)/);
    if (featuresMatch) {
      const features: string[] = [];
      const lines = featuresMatch[1].split('\n');
      for (const line of lines) {
        const match = line.match(/-\s*(.+)/);
        if (match) {
          features.push(match[1].trim());
        }
      }
      metadata.features = features;
    }

    return metadata;
  }

  /**
   * Load all skill files
   */
  private async loadSkillFiles(skillPath: string): Promise<SkillFiles> {
    const readFile = async (filename: string): Promise<string> => {
      try {
        return await fs.readFile(path.join(skillPath, filename), 'utf-8');
      } catch {
        return '';
      }
    };

    return {
      outlineMethod: await readFile('outline-method.md'),
      characterMethod: await readFile('character-method.md'),
      writingMethod: await readFile('writing-method.md'),
      outputStyle: await readFile('output-style.md'),
      reviewRules: await readFile('review-rules.md') || undefined,
      templates: {
        outline: await readFile('templates/outline-template.md') || undefined,
        character: await readFile('templates/character-template.md') || undefined,
        chapter: await readFile('templates/chapter-template.md') || undefined,
      },
      examples: {
        outline: await readFile('examples/example-outline.md') || undefined,
        chapter: await readFile('examples/example-chapter.md') || undefined,
        dialogue: await readFile('examples/example-dialogue.md') || undefined,
      },
    };
  }

  /**
   * Validate skill completeness
   */
  private validateSkill(skill: SkillConfig): void {
    const required = ['outlineMethod', 'outputStyle'];
    const missing: string[] = [];

    for (const field of required) {
      if (!skill.files[field as keyof SkillFiles]) {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      console.warn(
        `Skill "${skill.name}" is missing recommended files: ${missing.join(', ')}`
      );
    }
  }

  /**
   * List available skills
   */
  async listSkills(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.skillsPath, { withFileTypes: true });
      return entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch {
      return [];
    }
  }

  /**
   * Get skill info without loading full content
   */
  async getSkillInfo(skillName: string): Promise<SkillInfo> {
    const skillPath = path.join(this.skillsPath, skillName);
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    try {
      const skillMd = await fs.readFile(skillMdPath, 'utf-8');
      const { metadata, config } = this.parseSkillMd(skillMd);

      return {
        name: skillName,
        version: (metadata as any).version || '1.0.0',
        genre: metadata.genre,
        author: metadata.author,
        features: metadata.features,
        style: config.style,
      };
    } catch {
      return {
        name: skillName,
        version: 'unknown',
        genre: 'unknown',
      };
    }
  }

  /**
   * Check if skill exists
   */
  async skillExists(skillName: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.skillsPath, skillName, 'SKILL.md'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a new skill from template
   */
  async createSkill(skillName: string, template: SkillTemplate): Promise<void> {
    const skillPath = path.join(this.skillsPath, skillName);

    // Create directories
    await fs.mkdir(skillPath, { recursive: true });
    await fs.mkdir(path.join(skillPath, 'templates'), { recursive: true });
    await fs.mkdir(path.join(skillPath, 'examples'), { recursive: true });
    await fs.mkdir(path.join(skillPath, 'references', 'ground-truth'), { recursive: true });
    await fs.mkdir(path.join(skillPath, 'references', 'style-refs'), { recursive: true });

    // Create SKILL.md
    const skillMd = this.generateSkillMd(skillName, template);
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), skillMd, 'utf-8');

    // Create placeholder files
    await fs.writeFile(
      path.join(skillPath, 'outline-method.md'),
      `# 大纲方法论\n\n（待填写）`,
      'utf-8'
    );
    await fs.writeFile(
      path.join(skillPath, 'character-method.md'),
      `# 人物设定方法\n\n（待填写）`,
      'utf-8'
    );
    await fs.writeFile(
      path.join(skillPath, 'output-style.md'),
      `# 输出风格规范\n\n（待填写）`,
      'utf-8'
    );
  }

  /**
   * Generate SKILL.md content
   */
  private generateSkillMd(skillName: string, template: SkillTemplate): string {
    return `# Skill: ${skillName}

## Metadata
- **Version**: 1.0.0
- **Author**: ${template.author || 'Unknown'}
- **Genre**: ${template.genre}
- **Language**: zh-CN
- **Created**: ${new Date().toISOString().split('T')[0]}
- **Updated**: ${new Date().toISOString().split('T')[0]}

## Description
${template.description || '（待填写描述）'}

## Features
${template.features?.map(f => `- ${f}`).join('\n') || '- （待填写特性）'}

## Configuration
\`\`\`yaml
base:
  targetWordCountPerChapter: "${template.wordCountPerChapter || '3000-5000'}"
  chapterCount: "${template.chapterCount || '20-30'}"
  pov: "${template.pov || '第三人称'}"
  tense: "${template.tense || '过去时'}"

style:
  tone: "${template.tone || '严肃'}"
  dialogueRatio: "${template.dialogueRatio || '0.3-0.5'}"
  descriptionDensity: "${template.descriptionDensity || '中'}"
  pacing: "${template.pacing || '中'}"

review:
  strictness: "${template.strictness || '中'}"
  focusAreas:
    - "逻辑一致性"
    - "人物刻画"
  ignoredWarnings: []

references:
  required: []
  optional: []
\`\`\`

## Files
| File | Purpose | Required |
|------|---------|----------|
| outline-method.md | 大纲创建方法论 | Yes |
| character-method.md | 人物创建方法 | Yes |
| output-style.md | 输出风格规范 | Yes |
| review-rules.md | 审稿规则 | No |

## Usage
\`\`\`bash
# 切换到此技能包
/skill use ${skillName}

# 查看技能包信息
/skill info ${skillName}
\`\`\`

## Changelog
- 1.0.0 (${new Date().toISOString().split('T')[0]}): Initial release
`;
  }

  /**
   * Delete a skill
   */
  async deleteSkill(skillName: string): Promise<void> {
    const skillPath = path.join(this.skillsPath, skillName);
    await fs.rm(skillPath, { recursive: true, force: true });
    this.loadedSkills.delete(skillName);
  }

  /**
   * Clear skill cache
   */
  clearCache(): void {
    this.loadedSkills.clear();
  }
}

// ============ Types ============

export interface SkillInfo {
  name: string;
  version: string;
  genre: string;
  author?: string;
  features?: string[];
  style?: StyleConfig;
}

export interface SkillTemplate {
  genre: string;
  description?: string;
  author?: string;
  features?: string[];
  wordCountPerChapter?: string;
  chapterCount?: string;
  pov?: string;
  tense?: string;
  tone?: string;
  dialogueRatio?: string;
  descriptionDensity?: string;
  pacing?: string;
  strictness?: string;
}
