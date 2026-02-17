import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Reference, ReferenceType } from '../types/index.js';

/**
 * Manages reference materials (Ground Truth and Style References)
 */
export class ReferenceManager {
  private projectPath: string;
  private skillPath: string | null = null;
  private indexPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.indexPath = path.join(projectPath, '.state', 'references-index.json');
  }

  /**
   * Initialize the reference manager
   * Scans directories and builds the index
   */
  async initialize(): Promise<void> {
    // Ensure state directory exists
    const stateDir = path.dirname(this.indexPath);
    await fs.mkdir(stateDir, { recursive: true });

    // Scan and index existing reference files
    await this.scanAndIndex();
  }

  /**
   * Set the current skill path for skill-specific references
   */
  setSkillPath(skillPath: string): void {
    this.skillPath = skillPath;
  }

  /**
   * Add a reference file
   */
  async addReference(input: AddReferenceInput): Promise<Reference> {
    const reference: Reference = {
      id: uuidv4(),
      name: input.name,
      type: input.type,
      path: input.path,
      description: input.description,
      tags: input.tags || [],
      addedAt: new Date(),
    };

    // Copy file to appropriate location if it's not already there
    const targetDir = this.getTargetDirectory(input.type, input.isSkillSpecific);
    const targetPath = path.join(targetDir, path.basename(input.path));

    // Ensure directory exists
    await fs.mkdir(targetDir, { recursive: true });

    // Copy file if source is different from target
    const sourcePath = path.isAbsolute(input.path)
      ? input.path
      : path.join(this.projectPath, input.path);

    if (sourcePath !== targetPath) {
      await fs.copyFile(sourcePath, targetPath);
    }

    // Update reference path to relative
    reference.path = path.relative(this.projectPath, targetPath);

    // Save to index
    await this.saveToIndex(reference);

    return reference;
  }

  /**
   * Get a reference by ID
   */
  async getReference(id: string): Promise<Reference | null> {
    const index = await this.loadIndex();
    return index.find(r => r.id === id) || null;
  }

  /**
   * Get a reference by name
   */
  async getReferenceByName(name: string): Promise<Reference | null> {
    const index = await this.loadIndex();
    return index.find(r => r.name === name) || null;
  }

  /**
   * List all references
   */
  async listReferences(filter?: ReferenceFilter): Promise<Reference[]> {
    let references = await this.loadIndex();

    if (filter?.type) {
      references = references.filter(r => r.type === filter.type);
    }

    if (filter?.tags && filter.tags.length > 0) {
      references = references.filter(r =>
        filter.tags!.some(t => r.tags.includes(t))
      );
    }

    return references;
  }

  /**
   * Delete a reference
   */
  async deleteReference(id: string): Promise<boolean> {
    const index = await this.loadIndex();
    const refIndex = index.findIndex(r => r.id === id);

    if (refIndex === -1) {
      return false;
    }

    const reference = index[refIndex];

    // Remove file
    try {
      const fullPath = path.join(this.projectPath, reference.path);
      await fs.unlink(fullPath);
    } catch {
      // File might not exist
    }

    // Remove from index
    index.splice(refIndex, 1);
    await this.saveIndex(index);

    return true;
  }

  /**
   * Read reference content
   */
  async readReferenceContent(id: string): Promise<string> {
    const reference = await this.getReference(id);
    if (!reference) {
      throw new Error(`Reference ${id} not found`);
    }

    const fullPath = path.join(this.projectPath, reference.path);
    return fs.readFile(fullPath, 'utf-8');
  }

  /**
   * Get all Ground Truth references
   */
  async getGroundTruthReferences(): Promise<Reference[]> {
    return this.listReferences({ type: 'ground-truth' });
  }

  /**
   * Get all Style references
   */
  async getStyleReferences(): Promise<Reference[]> {
    return this.listReferences({ type: 'style' });
  }

  /**
   * Scan and index all reference files in directories
   */
  async scanAndIndex(): Promise<Reference[]> {
    const references: Reference[] = [];

    // Scan project-level references
    const projectRefPath = path.join(this.projectPath, 'references');
    const projectRefs = await this.scanDirectory(projectRefPath, false);
    references.push(...projectRefs);

    // Scan skill-specific references if skill is set
    if (this.skillPath) {
      const skillRefPath = path.join(this.skillPath, 'references');
      const skillRefs = await this.scanDirectory(skillRefPath, true);
      references.push(...skillRefs);
    }

    // Save all to index
    await this.saveIndex(references);

    return references;
  }

  /**
   * Scan a directory for reference files
   */
  private async scanDirectory(
    dirPath: string,
    isSkillSpecific: boolean
  ): Promise<Reference[]> {
    const references: Reference[] = [];

    try {
      // Scan ground-truth subdirectory
      const groundTruthPath = path.join(dirPath, 'ground-truth');
      try {
        const gtFiles = await fs.readdir(groundTruthPath);
        for (const file of gtFiles) {
          if (this.isValidReferenceFile(file)) {
            references.push({
              id: uuidv4(),
              name: path.basename(file, path.extname(file)),
              type: 'ground-truth',
              path: path.relative(
                this.projectPath,
                path.join(groundTruthPath, file)
              ),
              tags: ['ground-truth'],
              addedAt: new Date(),
            });
          }
        }
      } catch {
        // Directory doesn't exist
      }

      // Scan style-refs subdirectory
      const styleRefsPath = path.join(dirPath, 'style-refs');
      try {
        const styleFiles = await fs.readdir(styleRefsPath);
        for (const file of styleFiles) {
          if (this.isValidReferenceFile(file)) {
            references.push({
              id: uuidv4(),
              name: path.basename(file, path.extname(file)),
              type: 'style',
              path: path.relative(
                this.projectPath,
                path.join(styleRefsPath, file)
              ),
              tags: ['style'],
              addedAt: new Date(),
            });
          }
        }
      } catch {
        // Directory doesn't exist
      }
    } catch {
      // Main directory doesn't exist
    }

    return references;
  }

  /**
   * Check if file is a valid reference file
   */
  private isValidReferenceFile(filename: string): boolean {
    const validExtensions = ['.md', '.txt', '.pdf', '.epub'];
    const ext = path.extname(filename).toLowerCase();
    return validExtensions.includes(ext);
  }

  /**
   * Get target directory for reference type
   */
  private getTargetDirectory(type: ReferenceType, isSkillSpecific?: boolean): string {
    const baseDir = isSkillSpecific && this.skillPath
      ? path.join(this.skillPath, 'references')
      : path.join(this.projectPath, 'references');

    return type === 'ground-truth'
      ? path.join(baseDir, 'ground-truth')
      : path.join(baseDir, 'style-refs');
  }

  /**
   * Load reference index
   */
  private async loadIndex(): Promise<Reference[]> {
    try {
      const content = await fs.readFile(this.indexPath, 'utf-8');
      const data = JSON.parse(content);
      return data.map((r: any) => ({
        ...r,
        addedAt: new Date(r.addedAt),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Save reference index
   */
  private async saveIndex(references: Reference[]): Promise<void> {
    const dir = path.dirname(this.indexPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.indexPath, JSON.stringify(references, null, 2), 'utf-8');
  }

  /**
   * Save a single reference to index
   */
  private async saveToIndex(reference: Reference): Promise<void> {
    const index = await this.loadIndex();
    index.push(reference);
    await this.saveIndex(index);
  }
}

// ============ Types ============

export interface AddReferenceInput {
  name: string;
  type: ReferenceType;
  path: string;
  description?: string;
  tags?: string[];
  isSkillSpecific?: boolean;
}

export interface ReferenceFilter {
  type?: ReferenceType;
  tags?: string[];
}
