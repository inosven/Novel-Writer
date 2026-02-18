import type { LLMProvider, SkillConfig, Character, Outline, ChapterOutline } from '../../types/index.js';
import { WriterAgent } from '../agents/WriterAgent.js';
import { ReviewerAgent } from '../agents/ReviewerAgent.js';
import { EditorAgent } from '../agents/EditorAgent.js';
import { PlannerAgent } from '../agents/PlannerAgent.js';
import { MemorySystem } from '../../memory/MemorySystem.js';
import { DocumentManager } from '../../documents/DocumentManager.js';
import { CharacterManager } from '../../documents/CharacterManager.js';
import { OutlineManager } from '../../documents/OutlineManager.js';
import { ReferenceManager } from '../../documents/ReferenceManager.js';
import { StateManager } from '../state/StateManager.js';
import { SkillLoader } from '../../skills/SkillLoader.js';

export interface OrchestratorConfig {
  projectPath: string;
  llmProvider: LLMProvider;
  embeddingProvider: 'openai' | 'ollama' | 'local';
  embeddingApiKey?: string;
  embeddingModel?: string;
  embeddingHost?: string;
}

export interface WriteChapterResult {
  chapter: string;
  review: ReviewResult;
  finalContent: string;
  wordCount: number;
}

export interface ReviewResult {
  passed: boolean;
  issues: ReviewIssue[];
  suggestions: string[];
  score: number;
}

export interface ReviewIssue {
  type: 'error' | 'warning' | 'suggestion';
  category: string;
  description: string;
  location?: string;
}

/**
 * Orchestrator - The central coordinator for all novel writing operations
 * Manages agents, memory, documents, and workflow
 */
export class Orchestrator {
  private projectPath: string;
  private llm: LLMProvider;

  // Agents
  private writerAgent: WriterAgent;
  private reviewerAgent: ReviewerAgent;
  private editorAgent: EditorAgent;
  private plannerAgent: PlannerAgent;

  // Systems
  private memory: MemorySystem;
  private documents: DocumentManager;
  private characters: CharacterManager;
  private outline: OutlineManager;
  private references: ReferenceManager;
  private state: StateManager;
  private skillLoader: SkillLoader;

  // Current state
  private currentSkill: SkillConfig | null = null;
  private initialized = false;

  constructor(config: OrchestratorConfig) {
    this.projectPath = config.projectPath;
    this.llm = config.llmProvider;

    // Initialize agents
    this.writerAgent = new WriterAgent(this.llm);
    this.reviewerAgent = new ReviewerAgent(this.llm);
    this.editorAgent = new EditorAgent(this.llm);
    this.plannerAgent = new PlannerAgent(this.llm);

    // Initialize systems
    this.memory = new MemorySystem({
      projectPath: config.projectPath,
      embeddingProvider: config.embeddingProvider,
      embeddingApiKey: config.embeddingApiKey,
      embeddingModel: config.embeddingModel,
      embeddingHost: config.embeddingHost,
    });

    this.documents = new DocumentManager(config.projectPath);
    this.characters = new CharacterManager(this.documents, config.projectPath);
    this.outline = new OutlineManager(this.documents, config.projectPath);
    this.references = new ReferenceManager(config.projectPath);
    this.state = new StateManager(config.projectPath);
    this.skillLoader = new SkillLoader(config.projectPath);
  }

  /**
   * Initialize the orchestrator and all subsystems
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.memory.initialize();
    await this.state.initialize();
    await this.references.initialize();

    // Load saved skill if any
    const projectState = await this.state.getProjectState();
    if (projectState.currentSkill) {
      try {
        this.currentSkill = await this.skillLoader.loadSkill(projectState.currentSkill);
      } catch (e) {
        console.warn(`Failed to load saved skill: ${projectState.currentSkill}`);
      }
    }

    this.initialized = true;
  }

  // ============ Skill Management ============

  /**
   * List available skills
   */
  async listSkills(): Promise<string[]> {
    return this.skillLoader.listSkills();
  }

  /**
   * Switch to a different skill
   */
  async useSkill(skillName: string): Promise<SkillConfig> {
    this.currentSkill = await this.skillLoader.loadSkill(skillName);
    await this.state.updateSkill(skillName);
    return this.currentSkill;
  }

  /**
   * Get current skill info
   */
  getCurrentSkill(): SkillConfig | null {
    return this.currentSkill;
  }

  // ============ Planning Flow ============

  /**
   * Start a new project with dialogue-based planning
   */
  async startPlanning(userIdea: string): Promise<PlanningSession> {
    const session: PlanningSession = {
      id: Date.now().toString(),
      phase: 'collecting',
      userIdea,
      answers: {},
      outlineDraft: null,
      characterSuggestions: [],
    };

    // Initial requirements collection
    const result = await this.plannerAgent.execute({
      task: {
        type: 'plan',
        planType: 'collect_requirements',
        userIdea,
      },
      skill: this.currentSkill || undefined,
    });

    session.currentQuestions = (result.result as any).questions || [];
    session.readyToOutline = (result.result as any).readyToOutline || false;

    return session;
  }

  /**
   * Continue planning with user answers
   */
  async continuePlanning(
    session: PlanningSession,
    answers: Record<string, string>
  ): Promise<PlanningSession> {
    // Merge answers
    session.answers = { ...session.answers, ...answers };
    console.log('[Orchestrator.continuePlanning] session.readyToOutline:', session.readyToOutline);
    console.log('[Orchestrator.continuePlanning] merged answers count:', Object.keys(session.answers).length);

    // Always call LLM to continue the conversation - let user decide when to stop
    // Reset readyToOutline so user can continue discussing
    session.readyToOutline = false;

    const result = await this.plannerAgent.execute({
      task: {
        type: 'plan',
        planType: 'collect_requirements',
        userIdea: session.userIdea,
        existingAnswers: session.answers,
      },
      skill: this.currentSkill || undefined,
    });

    console.log('[Orchestrator.continuePlanning] LLM result.result:', JSON.stringify(result.result, null, 2));

    session.currentQuestions = (result.result as any).questions || [];
    session.readyToOutline = (result.result as any).readyToOutline || false;
    session.message = (result.result as any).summary || '';
    console.log('[Orchestrator.continuePlanning] updated currentQuestions:', session.currentQuestions);
    console.log('[Orchestrator.continuePlanning] updated readyToOutline:', session.readyToOutline);

    return session;
  }

  /**
   * Generate outline draft
   */
  async generateOutlineDraft(session: PlanningSession): Promise<PlanningSession> {
    console.log('[Orchestrator.generateOutlineDraft] Starting...');
    console.log('[Orchestrator.generateOutlineDraft] userIdea length:', session.userIdea?.length);
    console.log('[Orchestrator.generateOutlineDraft] answers count:', Object.keys(session.answers || {}).length);

    const result = await this.plannerAgent.execute({
      task: {
        type: 'plan',
        planType: 'generate_outline_draft',
        userIdea: session.userIdea,
        existingAnswers: session.answers,
      },
      skill: this.currentSkill || undefined,
    });

    console.log('[Orchestrator.generateOutlineDraft] Result content length:', result.content?.length);
    console.log('[Orchestrator.generateOutlineDraft] Result outline:', (result.result as any).outline?.substring(0, 200));

    session.outlineDraft = (result.result as any).outline || result.content || '';
    session.outlineMetadata = (result.result as any).metadata;
    session.phase = 'outline';

    console.log('[Orchestrator.generateOutlineDraft] outlineDraft length:', session.outlineDraft?.length);

    return session;
  }

  /**
   * Refine outline based on feedback
   */
  async refineOutline(
    session: PlanningSession,
    feedback: string
  ): Promise<PlanningSession> {
    const result = await this.plannerAgent.execute({
      task: {
        type: 'plan',
        planType: 'refine_outline',
        currentOutline: session.outlineDraft,
        userFeedback: feedback,
      },
      skill: this.currentSkill || undefined,
    });

    session.outlineDraft = (result.result as any).refinedOutline;

    return session;
  }

  /**
   * Get character suggestions based on outline
   */
  async suggestCharacters(session: PlanningSession): Promise<PlanningSession> {
    console.log('[Orchestrator.suggestCharacters] Starting...');
    console.log('[Orchestrator.suggestCharacters] outlineDraft length:', session.outlineDraft?.length);

    const result = await this.plannerAgent.execute({
      task: {
        type: 'plan',
        planType: 'suggest_characters',
        currentOutline: session.outlineDraft,
      },
      context: {
        outline: session.outlineDraft || '',
      },
      skill: this.currentSkill || undefined,
    });

    console.log('[Orchestrator.suggestCharacters] Result content length:', result.content?.length);
    console.log('[Orchestrator.suggestCharacters] Result:', JSON.stringify(result.result, null, 2)?.substring(0, 500));

    session.characterSuggestions = (result.result as any).characters || [];
    session.phase = 'characters';

    console.log('[Orchestrator.suggestCharacters] characters count:', session.characterSuggestions?.length);

    return session;
  }

  /**
   * Design a character in detail
   */
  async designCharacter(
    session: PlanningSession,
    characterName: string,
    characterRole?: string,
    userRequirements?: string
  ): Promise<string> {
    const result = await this.plannerAgent.execute({
      task: {
        type: 'plan',
        planType: 'design_character',
        characterName,
        characterRole,
        userRequirements,
        currentOutline: session.outlineDraft,
      },
      skill: this.currentSkill || undefined,
    });

    return (result.result as any).characterProfile;
  }

  /**
   * Finalize planning and create project files
   */
  async finalizePlanning(
    session: PlanningSession,
    outlineContent: string,
    characters: Array<{ name: string; profile: string }>
  ): Promise<void> {
    // Save outline
    await this.documents.saveOutline(outlineContent);

    // Save characters
    for (const char of characters) {
      await this.characters.createCharacter({
        name: char.name,
        profile: char.profile,
      });
    }

    // Update state
    await this.state.updatePhase('writing');

    // Index in memory system
    await this.memory.addContent({
      text: outlineContent,
      source: 'outline',
      type: 'outline',
    });
  }

  // ============ Writing Flow ============

  /**
   * Write a chapter
   */
  async writeChapter(chapterIndex: number): Promise<WriteChapterResult> {
    // Get outline context
    const chapterOutline = await this.outline.getChapterOutline(chapterIndex);
    const relevantCharacters = await this.getRelevantCharacters(chapterOutline);

    // Build smart context: summaries + RAG + ending (instead of full chapters)
    const smartContext = await this.buildSmartContext(chapterIndex, chapterOutline);

    // Writer generates chapter
    const writerResult = await this.writerAgent.execute({
      task: {
        type: 'chapter',
        chapterIndex,
        chapterOutline: chapterOutline?.summary || '',
        ...smartContext.taskExtras,
      },
      context: {
        outline: smartContext.outlineContext,
        previousChapters: smartContext.chapterSummaries,
        characters: relevantCharacters,
        relevantMemory: smartContext.ragResults,
      },
      skill: this.currentSkill || undefined,
    });

    let chapterContent = writerResult.content;

    // Reviewer checks the chapter
    const reviewResult = await this.reviewChapter(chapterIndex, chapterContent);

    // If review found issues, editor fixes them
    if (!reviewResult.passed && reviewResult.issues.length > 0) {
      const editorResult = await this.editorAgent.execute({
        task: {
          type: 'edit',
          editType: 'revise_from_review',
          content: chapterContent,
          reviewIssues: reviewResult.issues,
        },
        skill: this.currentSkill || undefined,
      });

      chapterContent = editorResult.content;
    }

    // Save chapter
    await this.documents.saveChapter(chapterIndex, chapterContent);

    // Update memory system (RAG index)
    await this.memory.addContent({
      text: chapterContent,
      source: `chapter_${chapterIndex}`,
      type: 'chapter',
      chapterIndex,
    });

    // Generate and save chapter summary + update story summary
    await this.generateAndSaveSummary(chapterIndex, chapterContent, chapterOutline);

    // Update state
    await this.state.updateChapterProgress(chapterIndex, 'completed');

    const wordCount = chapterContent.length;

    return {
      chapter: chapterContent,
      review: reviewResult,
      finalContent: chapterContent,
      wordCount,
    };
  }

  /**
   * Build smart context for chapter writing.
   * Uses: story summary + all chapter summaries + RAG + previous chapter ending.
   * Total context stays bounded regardless of novel length.
   */
  private async buildSmartContext(
    chapterIndex: number,
    chapterOutline: ChapterOutline | null
  ) {
    // 1. Story-level summary (~300 chars)
    const storySummary = await this.documents.getStorySummary();

    // 2. All chapter summaries (each ~100-200 chars)
    const allSummaries = await this.documents.getAllChapterSummariesOrdered();
    const summariesBeforeCurrent = allSummaries.filter(s => s.index < chapterIndex);

    // 3. RAG: semantic search for relevant passages from any chapter
    const searchQuery = chapterOutline?.summary || '';
    const ragResults = searchQuery
      ? (await this.memory.search(searchQuery, { limit: 5 })).ragResults
      : [];

    // 4. Previous chapter ending (~500 chars, for seamless transition)
    const prevEnding = chapterIndex > 1
      ? await this.documents.getChapterEnding(chapterIndex - 1, 500)
      : '';

    // 5. Outline: story premise + this chapter's outline (not full outline)
    const outlineMeta = await this.documents.getOutlineWithMetadata();
    // Extract premise/theme section (first ~500 chars)
    const outlinePremise = outlineMeta.content.substring(0, 500);

    // Compose outline context
    let outlineContext = '';
    if (storySummary) {
      outlineContext += `【故事全局摘要】\n${storySummary}\n\n`;
    }
    outlineContext += `【故事设定】\n${outlinePremise}\n`;

    return {
      outlineContext,
      chapterSummaries: summariesBeforeCurrent,
      ragResults,
      taskExtras: {
        previousChapterEnding: prevEnding,
        groundTruthContext: ragResults.map(r => r.content).join('\n'),
      },
    };
  }

  /**
   * After writing a chapter, generate a summary and update the story summary.
   */
  private async generateAndSaveSummary(
    chapterIndex: number,
    chapterContent: string,
    chapterOutline: ChapterOutline | null
  ): Promise<void> {
    try {
      // Generate chapter summary via LLM
      const summaryPrompt = `请为以下章节内容生成一个简洁的摘要（150-200字），包含：主要情节、关键事件、出场角色。

【章节内容】
${chapterContent.substring(0, 6000)}

请以JSON格式输出：
{
  "summary": "章节摘要文本",
  "keyEvents": ["关键事件1", "关键事件2"],
  "characters": ["角色1", "角色2"]
}`;

      const summaryResult = await this.llm.complete(summaryPrompt, {
        systemPrompt: '你是一个精确的文本摘要助手。只输出JSON，不要其他内容。',
        maxTokens: 500,
        temperature: 0.3,
      });

      // Parse summary
      const parsed = this.parseSummaryJSON(summaryResult);

      const chapterSummary = {
        index: chapterIndex,
        title: chapterOutline?.title || `第${chapterIndex}章`,
        summary: parsed.summary || `第${chapterIndex}章内容摘要`,
        wordCount: chapterContent.length,
        characters: parsed.characters || [],
        keyEvents: parsed.keyEvents || [],
      };

      await this.documents.saveChapterSummary(chapterIndex, chapterSummary);
      console.log(`[Orchestrator] Chapter ${chapterIndex} summary saved (${chapterSummary.summary.length} chars)`);

      // Update story-level summary
      await this.updateStorySummary(chapterIndex);
    } catch (error) {
      console.error(`[Orchestrator] Failed to generate summary for chapter ${chapterIndex}:`, error);
      // Non-fatal: writing still succeeds even if summary generation fails
    }
  }

  /**
   * Update the story-level summary incorporating the latest chapter.
   */
  private async updateStorySummary(upToChapter: number): Promise<void> {
    const allSummaries = await this.documents.getAllChapterSummariesOrdered();
    const existing = await this.documents.getStorySummary();

    // Build a concise chapter list for the LLM
    const chapterList = allSummaries
      .map(s => `第${s.index}章「${s.title}」: ${s.summary}`)
      .join('\n');

    const prompt = `根据以下各章摘要，生成一段整体故事摘要（200-300字），概括故事到目前为止的主线发展、核心冲突和人物关系变化。

${existing ? `【之前的故事摘要】\n${existing}\n\n` : ''}【各章摘要】
${chapterList}

请直接输出摘要文本，不需要标题或格式。`;

    const storySummary = await this.llm.complete(prompt, {
      systemPrompt: '你是一个精确的文本摘要助手。直接输出摘要文本。',
      maxTokens: 500,
      temperature: 0.3,
    });

    await this.documents.saveStorySummary(storySummary.trim());
    console.log(`[Orchestrator] Story summary updated (${storySummary.trim().length} chars)`);
  }

  private parseSummaryJSON(raw: string): { summary?: string; keyEvents?: string[]; characters?: string[] } {
    try {
      // Try code block first
      const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlock) return JSON.parse(codeBlock[1].trim());

      // Try raw JSON
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        return JSON.parse(raw.substring(firstBrace, lastBrace + 1));
      }

      // Fallback: treat entire response as summary text
      return { summary: raw.trim() };
    } catch {
      return { summary: raw.trim() };
    }
  }

  /**
   * Review a chapter
   */
  async reviewChapter(chapterIndex: number, content?: string): Promise<ReviewResult> {
    const chapterContent = content || await this.documents.getChapter(chapterIndex);

    // Get context for review
    const outlineContent = await this.documents.getOutline();
    const chapterOutline = await this.outline.getChapterOutline(chapterIndex);
    const characters = await this.characters.listCharacters();
    const characterProfiles = await Promise.all(
      characters.map(name => this.characters.getCharacter(name))
    );

    // Get timeline for validation
    const timeline = await this.memory.getTimeline();

    // Reviewer agent
    const reviewResult = await this.reviewerAgent.execute({
      task: {
        type: 'review',
        reviewType: 'full_review',
        chapterIndex,
        chapterContent,
      },
      context: {
        outline: outlineContent,
        chapterOutline: chapterOutline || undefined,
        characters: characterProfiles.filter(Boolean).map(c => ({
          name: c!.name,
          profile: c!.profile || '',
        })),
        timeline,
      },
      skill: this.currentSkill || undefined,
    });

    // Validate facts against knowledge graph
    const factsToValidate = (reviewResult as any).extractedFacts || [];
    for (const fact of factsToValidate) {
      const validation = await this.memory.validateFact(fact);
      if (!validation.valid) {
        (reviewResult as any).issues = (reviewResult as any).issues || [];
        (reviewResult as any).issues.push({
          type: 'error',
          category: 'consistency',
          description: validation.reason || 'Fact validation failed',
        });
      }
    }

    return {
      passed: !(reviewResult as any).issues?.some((i: ReviewIssue) => i.type === 'error'),
      issues: (reviewResult as any).issues || [],
      suggestions: (reviewResult as any).suggestions || [],
      score: (reviewResult as any).score || 0,
    };
  }

  /**
   * Continue writing (for continuation mode)
   */
  async continueWriting(existingContent: string): Promise<string> {
    // Analyze the existing content
    const analysis = await this.writerAgent.execute({
      task: {
        type: 'continue',
        existingContent,
      },
      skill: this.currentSkill || undefined,
    });

    return analysis.content;
  }

  // ============ Editing ============

  /**
   * Edit specific part of a chapter
   */
  async editChapter(
    chapterIndex: number,
    instruction: string,
    targetSection?: string
  ): Promise<string> {
    const chapterContent = await this.documents.getChapter(chapterIndex);

    const editorResult = await this.editorAgent.execute({
      task: {
        type: 'edit',
        editType: 'targeted_edit',
        content: chapterContent,
        instruction,
        targetSection,
      },
      skill: this.currentSkill || undefined,
    });

    // Save edited chapter
    await this.documents.saveChapter(chapterIndex, editorResult.content);

    // Update memory
    await this.memory.updateContent(
      { type: 'chapter', identifier: chapterIndex },
      editorResult.content
    );

    return editorResult.content;
  }

  // ============ Character Management ============

  /**
   * Create a new character
   */
  async createCharacter(name: string, profile: string): Promise<Character> {
    const character = await this.characters.createCharacter({ name, profile });

    // Extract entities and add to knowledge graph
    const entities = await this.memory.extractEntities(profile);
    for (const entity of entities) {
      await this.memory.graph.addEntity(entity);
    }

    return character;
  }

  /**
   * Get character details
   */
  async getCharacter(name: string): Promise<Character | null> {
    return this.characters.getCharacter(name);
  }

  /**
   * Update character
   */
  async updateCharacter(name: string, updates: Partial<Character>): Promise<Character | null> {
    // Check consistency before updating
    const consistency = await this.characters.checkConsistency(name, updates);
    if (consistency.conflicts.length > 0) {
      console.warn('Character update has potential conflicts:', consistency.conflicts);
    }

    return this.characters.updateCharacter(name, updates);
  }

  /**
   * Delete character
   */
  async deleteCharacter(name: string): Promise<{ deleted: boolean; warnings: string[] }> {
    const appearances = await this.characters.getCharacterAppearances(name);
    const warnings: string[] = [];

    if (appearances.length > 0) {
      warnings.push(`角色"${name}"在以下章节中出现: ${appearances.join(', ')}`);
    }

    await this.characters.deleteCharacter(name);

    return { deleted: true, warnings };
  }

  /**
   * List all characters
   */
  async listCharacters(): Promise<string[]> {
    return this.characters.listCharacters();
  }

  // ============ Outline Management ============

  /**
   * Get current outline
   */
  async getOutline(): Promise<Outline | null> {
    return this.outline.getOutline();
  }

  /**
   * Update outline
   */
  async updateOutline(updates: Partial<Outline>): Promise<{ outline: Outline; warnings: string[] }> {
    // Analyze impact before updating
    const impact = await this.outline.analyzeChangeImpact(updates);

    const outline = await this.outline.updateOutline(updates);

    return {
      outline,
      warnings: impact.warnings,
    };
  }

  /**
   * Get outline history
   */
  async getOutlineHistory(): Promise<Array<{ id: string; timestamp: string }>> {
    const history = await this.outline.getHistory();
    return history.map(h => ({ id: h.id, timestamp: h.timestamp }));
  }

  /**
   * Restore outline from history
   */
  async restoreOutline(historyId: string): Promise<Outline> {
    return this.outline.restoreFromHistory(historyId);
  }

  // ============ Reference Management ============

  /**
   * Add reference material
   */
  async addReference(
    filePath: string,
    type: 'ground-truth' | 'style-ref'
  ): Promise<void> {
    await this.references.addReference(filePath, type);

    // Index in memory system
    const content = await this.references.getReference(filePath);
    if (content) {
      await this.memory.addContent({
        text: content,
        source: filePath,
        type: 'reference',
        tags: [type],
      });
    }
  }

  /**
   * Search references
   */
  async searchReferences(query: string): Promise<Array<{ source: string; content: string }>> {
    const results = await this.memory.search(query, { type: 'reference', limit: 10 });
    return results.ragResults.map(r => ({
      source: r.source,
      content: r.content,
    }));
  }

  // ============ State Management ============

  /**
   * Get project status
   */
  async getProjectStatus(): Promise<ProjectStatus> {
    const state = await this.state.getProjectState();
    const outline = await this.outline.getOutline();
    const characters = await this.characters.listCharacters();
    const chapterCount = await this.documents.getChapterCount();

    return {
      phase: state.phase,
      currentSkill: state.currentSkill,
      outlineExists: !!outline,
      characterCount: characters.length,
      chapterCount,
      completedChapters: Object.values(state.chapterProgress)
        .filter(p => p === 'completed').length,
      lastModified: state.lastModified,
    };
  }

  /**
   * Save current state (checkpoint)
   */
  async saveCheckpoint(description?: string): Promise<string> {
    return this.state.createCheckpoint(description);
  }

  /**
   * Restore from checkpoint
   */
  async restoreCheckpoint(checkpointId: string): Promise<void> {
    await this.state.restoreCheckpoint(checkpointId);
  }

  /**
   * List checkpoints
   */
  async listCheckpoints(): Promise<Array<{ id: string; timestamp: string; description?: string }>> {
    return this.state.listCheckpoints();
  }

  // ============ Export ============

  /**
   * Export novel to single file
   */
  async exportNovel(format: 'markdown' | 'txt' = 'markdown'): Promise<string> {
    const outline = await this.outline.getOutline();
    const chapterCount = await this.documents.getChapterCount();

    let output = '';

    // Title
    if (outline) {
      output += `# ${outline.title}\n\n`;
    }

    // Chapters
    for (let i = 1; i <= chapterCount; i++) {
      try {
        const chapter = await this.documents.getChapter(i);
        output += chapter + '\n\n---\n\n';
      } catch {
        // Chapter doesn't exist
      }
    }

    return output;
  }

  // ============ LLM Provider Management ============

  /**
   * Update the LLM provider and reinitialize all agents
   * Call this when user changes LLM settings
   */
  updateLLMProvider(newProvider: LLMProvider): void {
    console.log('=== Orchestrator.updateLLMProvider called ===');
    console.log('New provider:', newProvider.constructor.name);

    this.llm = newProvider;

    // Reinitialize all agents with the new LLM provider
    console.log('Reinitializing all agents...');
    this.writerAgent = new WriterAgent(this.llm);
    this.reviewerAgent = new ReviewerAgent(this.llm);
    this.editorAgent = new EditorAgent(this.llm);
    this.plannerAgent = new PlannerAgent(this.llm);

    console.log('=== All agents reinitialized with new LLM provider ===');
  }

  // ============ Cleanup ============

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    await this.memory.dispose();
    await this.state.dispose();
  }

  // ============ Private Helpers ============

  private async getPreviousChaptersContext(
    currentIndex: number,
    windowSize = 3
  ): Promise<Array<{ index: number; content: string }>> {
    const chapters: Array<{ index: number; content: string }> = [];
    const startIndex = Math.max(1, currentIndex - windowSize);

    for (let i = startIndex; i < currentIndex; i++) {
      try {
        const content = await this.documents.getChapter(i);
        chapters.push({ index: i, content });
      } catch {
        // Chapter doesn't exist
      }
    }

    return chapters;
  }

  private async getRelevantCharacters(
    chapterOutline: ChapterOutline | null
  ): Promise<Array<{ name: string; profile: string }>> {
    if (!chapterOutline?.characters) {
      return [];
    }

    const characters: Array<{ name: string; profile: string }> = [];
    for (const name of chapterOutline.characters) {
      const char = await this.characters.getCharacter(name);
      if (char) {
        characters.push({
          name: char.name,
          profile: char.profile || '',
        });
      }
    }

    return characters;
  }
}

// ============ Types ============

export interface PlanningSession {
  id: string;
  phase: 'collecting' | 'outline' | 'outline_review' | 'characters' | 'finalized';
  userIdea: string;
  answers: Record<string, string>;
  currentQuestions?: string[];
  readyToOutline?: boolean;
  message?: string;
  outlineDraft: string | null;
  outlineMetadata?: Record<string, unknown>;
  characterSuggestions: Array<{
    name: string;
    role: string;
    briefDescription: string;
  }>;
}

export interface ProjectStatus {
  phase: string;
  currentSkill: string | null;
  outlineExists: boolean;
  characterCount: number;
  chapterCount: number;
  completedChapters: number;
  lastModified: Date;
}
