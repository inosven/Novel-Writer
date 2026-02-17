import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  ProjectState,
  AgentTask,
  Message,
  Checkpoint,
  AgentRole,
  ReviewRecord,
} from '../../types/index.js';

/**
 * State Manager - Handles project state persistence and checkpoint management
 * Enables breakpoint recovery and progress tracking
 */
export class StateManager {
  private statePath: string;
  private state: ProjectState;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private autoSaveIntervalMs = 30000; // 30 seconds
  private dirty = false;

  constructor(projectPath: string) {
    this.statePath = path.join(projectPath, '.state', 'progress.json');
    this.state = this.createInitialState();
  }

  /**
   * Initialize or load state
   */
  async initialize(): Promise<ProjectState> {
    try {
      const data = await fs.readFile(this.statePath, 'utf-8');
      this.state = this.parseState(JSON.parse(data));
      console.log(`Loaded state from ${this.statePath}`);
    } catch {
      // Create new state
      this.state = this.createInitialState();
      await this.save();
    }

    // Start auto-save
    this.startAutoSave();

    return this.state;
  }

  /**
   * Create initial state
   */
  private createInitialState(): ProjectState {
    return {
      meta: {
        id: uuidv4(),
        name: 'Untitled Novel',
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0',
      },
      progress: {
        phase: 'outline',
        currentChapter: 0,
        totalPlannedChapters: 0,
        completedChapters: [],
      },
      skill: {
        name: 'default',
        loadedAt: new Date(),
      },
      agents: {
        lastActiveAgent: 'writer',
        pendingTasks: [],
        reviewHistory: [],
      },
      session: {
        lastInteraction: new Date(),
        conversationHistory: [],
        workingMemory: [],
      },
      checkpoints: [],
    };
  }

  /**
   * Parse state from JSON (handle dates)
   */
  private parseState(data: unknown): ProjectState {
    const state = data as ProjectState;

    // Convert date strings to Date objects
    state.meta.createdAt = new Date(state.meta.createdAt);
    state.meta.updatedAt = new Date(state.meta.updatedAt);
    state.skill.loadedAt = new Date(state.skill.loadedAt);
    state.session.lastInteraction = new Date(state.session.lastInteraction);

    if (state.progress.inProgressChapter) {
      state.progress.inProgressChapter.lastSavedAt = new Date(
        state.progress.inProgressChapter.lastSavedAt
      );
    }

    return state;
  }

  /**
   * Save state to disk
   */
  async save(): Promise<void> {
    this.state.meta.updatedAt = new Date();

    const dir = path.dirname(this.statePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(
      this.statePath,
      JSON.stringify(this.state, null, 2),
      'utf-8'
    );

    this.dirty = false;
  }

  /**
   * Start auto-save
   */
  private startAutoSave(): void {
    this.autoSaveInterval = setInterval(async () => {
      if (this.dirty) {
        await this.save();
      }
    }, this.autoSaveIntervalMs);
  }

  /**
   * Mark state as dirty (needs saving)
   */
  private markDirty(): void {
    this.dirty = true;
  }

  // ============ Project Meta ============

  setProjectName(name: string): void {
    this.state.meta.name = name;
    this.markDirty();
  }

  getProjectName(): string {
    return this.state.meta.name;
  }

  // ============ Progress ============

  updateProgress(update: Partial<ProjectState['progress']>): void {
    this.state.progress = { ...this.state.progress, ...update };
    this.markDirty();
  }

  getProgress(): ProjectState['progress'] {
    return this.state.progress;
  }

  setPhase(phase: ProjectState['progress']['phase']): void {
    this.state.progress.phase = phase;
    this.markDirty();
  }

  /**
   * Update phase (async version for Orchestrator compatibility)
   */
  async updatePhase(phase: ProjectState['progress']['phase']): Promise<void> {
    this.setPhase(phase);
    await this.save();
  }

  /**
   * Update chapter progress
   */
  async updateChapterProgress(chapterIndex: number, status: 'in_progress' | 'completed'): Promise<void> {
    if (status === 'completed') {
      this.completeChapter(chapterIndex);
    } else if (status === 'in_progress') {
      this.state.progress.currentChapter = chapterIndex;
    }
    await this.save();
  }

  setTotalPlannedChapters(count: number): void {
    this.state.progress.totalPlannedChapters = count;
    this.markDirty();
  }

  /**
   * Save draft content
   */
  saveDraft(chapterIndex: number, content: string): void {
    this.state.progress.inProgressChapter = {
      chapterIndex,
      lastSavedAt: new Date(),
      draftContent: content,
      wordCount: this.countWords(content),
    };
    this.markDirty();
  }

  /**
   * Get current draft
   */
  getDraft(): ProjectState['progress']['inProgressChapter'] | undefined {
    return this.state.progress.inProgressChapter;
  }

  /**
   * Clear draft
   */
  clearDraft(): void {
    this.state.progress.inProgressChapter = undefined;
    this.markDirty();
  }

  /**
   * Complete a chapter
   */
  completeChapter(chapterIndex: number): void {
    if (!this.state.progress.completedChapters.includes(chapterIndex)) {
      this.state.progress.completedChapters.push(chapterIndex);
      this.state.progress.completedChapters.sort((a, b) => a - b);
    }
    this.state.progress.currentChapter = chapterIndex + 1;
    this.state.progress.inProgressChapter = undefined;
    this.markDirty();
  }

  /**
   * Check if chapter is completed
   */
  isChapterCompleted(chapterIndex: number): boolean {
    return this.state.progress.completedChapters.includes(chapterIndex);
  }

  // ============ Skill ============

  setSkill(skillName: string, customOverrides?: Record<string, unknown>): void {
    this.state.skill = {
      name: skillName,
      loadedAt: new Date(),
      customOverrides,
    };
    this.markDirty();
  }

  /**
   * Alias for setSkill (for Orchestrator compatibility)
   */
  async updateSkill(skillName: string): Promise<void> {
    this.setSkill(skillName);
    await this.save();
  }

  getCurrentSkill(): ProjectState['skill'] {
    return this.state.skill;
  }

  // ============ Tasks ============

  /**
   * Add a pending task
   */
  addTask(task: Omit<AgentTask, 'id'>): string {
    const newTask: AgentTask = {
      ...task,
      id: uuidv4(),
    };
    this.state.agents.pendingTasks.push(newTask);
    this.markDirty();
    return newTask.id;
  }

  /**
   * Update task status
   */
  updateTask(taskId: string, update: Partial<AgentTask>): void {
    const task = this.state.agents.pendingTasks.find(t => t.id === taskId);
    if (task) {
      Object.assign(task, update);
      this.markDirty();
    }
  }

  /**
   * Get pending tasks
   */
  getPendingTasks(): AgentTask[] {
    return this.state.agents.pendingTasks.filter(
      t => t.status === 'pending' || t.status === 'in_progress'
    );
  }

  /**
   * Remove completed tasks
   */
  cleanupCompletedTasks(): void {
    this.state.agents.pendingTasks = this.state.agents.pendingTasks.filter(
      t => t.status !== 'completed' && t.status !== 'failed'
    );
    this.markDirty();
  }

  /**
   * Set last active agent
   */
  setLastActiveAgent(agent: AgentRole): void {
    this.state.agents.lastActiveAgent = agent;
    this.markDirty();
  }

  // ============ Review History ============

  /**
   * Add review record
   */
  addReviewRecord(record: Omit<ReviewRecord, 'id'>): string {
    const newRecord: ReviewRecord = {
      ...record,
      id: uuidv4(),
    };
    this.state.agents.reviewHistory.push(newRecord);

    // Keep only last 100 reviews
    if (this.state.agents.reviewHistory.length > 100) {
      this.state.agents.reviewHistory = this.state.agents.reviewHistory.slice(-100);
    }

    this.markDirty();
    return newRecord.id;
  }

  /**
   * Get review history for chapter
   */
  getReviewHistory(chapterIndex: number): ReviewRecord[] {
    return this.state.agents.reviewHistory.filter(
      r => r.chapterIndex === chapterIndex
    );
  }

  // ============ Session ============

  /**
   * Add message to conversation history
   */
  addMessage(message: Omit<Message, 'timestamp'>): void {
    this.state.session.conversationHistory.push({
      ...message,
      timestamp: new Date(),
    });
    this.state.session.lastInteraction = new Date();

    // Keep only last 100 messages
    if (this.state.session.conversationHistory.length > 100) {
      this.state.session.conversationHistory =
        this.state.session.conversationHistory.slice(-100);
    }

    this.markDirty();
  }

  /**
   * Get recent messages
   */
  getRecentMessages(count = 10): Message[] {
    return this.state.session.conversationHistory.slice(-count);
  }

  /**
   * Set working memory item
   */
  setWorkingMemory(key: string, value: unknown, expiresAt?: Date): void {
    const existing = this.state.session.workingMemory.findIndex(
      m => m.key === key
    );

    const item = { key, value, expiresAt };

    if (existing >= 0) {
      this.state.session.workingMemory[existing] = item;
    } else {
      this.state.session.workingMemory.push(item);
    }

    this.markDirty();
  }

  /**
   * Get working memory item
   */
  getWorkingMemory(key: string): unknown {
    const item = this.state.session.workingMemory.find(m => m.key === key);
    if (item?.expiresAt && new Date() > new Date(item.expiresAt)) {
      this.removeWorkingMemory(key);
      return undefined;
    }
    return item?.value;
  }

  /**
   * Remove working memory item
   */
  removeWorkingMemory(key: string): void {
    this.state.session.workingMemory = this.state.session.workingMemory.filter(
      m => m.key !== key
    );
    this.markDirty();
  }

  // ============ Checkpoints ============

  /**
   * Create a checkpoint
   */
  async createCheckpoint(name: string, description: string): Promise<string> {
    const checkpoint: Checkpoint = {
      id: uuidv4(),
      name,
      createdAt: new Date(),
      description,
      state: { ...this.state, checkpoints: [] },
    };

    this.state.checkpoints.push(checkpoint);

    // Keep only last 20 checkpoints
    if (this.state.checkpoints.length > 20) {
      this.state.checkpoints = this.state.checkpoints.slice(-20);
    }

    await this.save();

    // Also save checkpoint to separate file
    const checkpointPath = path.join(
      path.dirname(this.statePath),
      'checkpoints',
      `${checkpoint.id}.json`
    );
    await fs.mkdir(path.dirname(checkpointPath), { recursive: true });
    await fs.writeFile(
      checkpointPath,
      JSON.stringify(checkpoint, null, 2),
      'utf-8'
    );

    return checkpoint.id;
  }

  /**
   * Restore from checkpoint
   */
  async restoreCheckpoint(checkpointId: string): Promise<void> {
    const checkpoint = this.state.checkpoints.find(c => c.id === checkpointId);

    if (!checkpoint) {
      // Try loading from file
      const checkpointPath = path.join(
        path.dirname(this.statePath),
        'checkpoints',
        `${checkpointId}.json`
      );
      try {
        const data = await fs.readFile(checkpointPath, 'utf-8');
        const loaded = JSON.parse(data) as Checkpoint;
        this.state = this.parseState({
          ...loaded.state,
          checkpoints: this.state.checkpoints,
        });
      } catch {
        throw new Error(`Checkpoint ${checkpointId} not found`);
      }
    } else {
      // Preserve checkpoints list, restore everything else
      const currentCheckpoints = this.state.checkpoints;
      this.state = this.parseState({
        ...checkpoint.state,
        checkpoints: currentCheckpoints,
      });
    }

    await this.save();
  }

  /**
   * List checkpoints
   */
  listCheckpoints(): Checkpoint[] {
    return this.state.checkpoints.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Delete checkpoint
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    this.state.checkpoints = this.state.checkpoints.filter(
      c => c.id !== checkpointId
    );

    // Also delete file
    const checkpointPath = path.join(
      path.dirname(this.statePath),
      'checkpoints',
      `${checkpointId}.json`
    );
    try {
      await fs.unlink(checkpointPath);
    } catch {
      // File might not exist
    }

    await this.save();
  }

  // ============ State Access ============

  /**
   * Get full state (read-only)
   */
  getState(): ProjectState {
    return this.state;
  }

  /**
   * Get project state summary (for Orchestrator compatibility)
   */
  getProjectState(): {
    currentSkill: string | null;
    phase: string;
    chapterProgress: Record<number, string>;
    lastModified: Date;
  } {
    // Build chapter progress map from completedChapters array
    const chapterProgress: Record<number, string> = {};
    for (const chapterIndex of this.state.progress.completedChapters) {
      chapterProgress[chapterIndex] = 'completed';
    }
    if (this.state.progress.inProgressChapter) {
      chapterProgress[this.state.progress.inProgressChapter.chapterIndex] = 'in_progress';
    }

    return {
      currentSkill: this.state.skill.name !== 'default' ? this.state.skill.name : null,
      phase: this.state.progress.phase,
      chapterProgress,
      lastModified: this.state.meta.updatedAt,
    };
  }

  // ============ Cleanup ============

  /**
   * Dispose and cleanup
   */
  async dispose(): Promise<void> {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    await this.save();
  }

  // ============ Helpers ============

  private countWords(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }
}
