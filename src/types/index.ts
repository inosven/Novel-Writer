// Core Types for NovelWriter Agent System

// ============ LLM Types ============
export interface LLMConfig {
  provider: 'claude' | 'openai' | 'ollama' | 'openai-compatible';
  apiKey?: string;
  model?: string;
  host?: string; // for Ollama
  baseUrl?: string; // for OpenAI compatible APIs
  extraHeaders?: Record<string, string>; // custom headers
  extraBody?: Record<string, unknown>; // extra body parameters like chat_template_kwargs
}

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  systemPrompt?: string;
}

export interface LLMProvider {
  complete(prompt: string, options?: CompletionOptions): Promise<string>;
  stream(prompt: string, options?: CompletionOptions): AsyncIterable<string>;
  countTokens(text: string): number;
}

// ============ Agent Types ============
export type AgentRole = 'writer' | 'reviewer' | 'editor' | 'planner';

export interface AgentTask {
  id: string;
  type: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  input: unknown;
  output?: unknown;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface AgentContext {
  outline?: string;
  characters?: Character[];
  previousChapters?: ChapterSummary[];
  currentChapter?: string;
  relevantMemory?: MemorySearchResult[];
  skill?: SkillConfig;
}

// ============ Character Types ============
export interface Character {
  id: string;
  name: string;
  basicInfo: {
    age?: number;
    gender?: string;
    occupation?: string;
    appearance?: string;
  };
  personality: {
    core: string;
    strengths: string[];
    weaknesses: string[];
    speechStyle?: string;
  };
  background: string;
  relationships: CharacterRelationship[];
  arc: {
    startState: string;
    trigger: string;
    endState: string;
  };
  role: string;
  appearances: number[]; // chapter indices
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterRelationship {
  targetCharacterId: string;
  targetCharacterName: string;
  relationshipType: string;
  description: string;
}

// ============ Outline Types ============
export interface Outline {
  id: string;
  title: string;
  premise: string;
  theme: string;
  genre: string;
  targetWordCount: number;
  chapters: ChapterOutline[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChapterOutline {
  index: number;
  title: string;
  summary: string;
  keyEvents: string[];
  characters: string[]; // character names
  targetWordCount: number;
}

export interface ChapterSummary {
  index: number;
  title: string;
  summary: string;
  wordCount: number;
  characters: string[];
  keyEvents: string[];
}

// ============ Memory Types ============
export interface MemorySearchResult {
  content: string;
  score: number;
  metadata: {
    source: string;
    type: 'chapter' | 'character' | 'outline' | 'reference' | 'style';
    chapterIndex?: number;
    tags?: string[];
  };
}

export interface Tag {
  id: string;
  name: string;
  category: 'character' | 'location' | 'time' | 'event' | 'theme' | 'custom';
  value?: string;
  parentId?: string;
}

export interface Entity {
  id: string;
  type: 'character' | 'location' | 'object' | 'event' | 'organization';
  name: string;
  properties: Record<string, unknown>;
}

export interface Relationship {
  id: string;
  from: string;
  to: string;
  type: string;
  properties?: Record<string, unknown>;
  validFrom?: string;
  validTo?: string;
}

// ============ Skill Types ============
export interface SkillConfig {
  name: string;
  version: string;
  metadata: SkillMetadata;
  config: {
    base: BaseSkillConfig;
    style: StyleConfig;
    review: ReviewConfig;
    references: ReferencesConfig;
  };
  files: SkillFiles;
}

export interface SkillMetadata {
  author?: string;
  genre: string;
  language: string;
  created?: string;
  updated?: string;
  features?: string[];
}

export interface BaseSkillConfig {
  targetWordCountPerChapter: string;
  chapterCount: string;
  pov: string;
  tense: string;
}

export interface StyleConfig {
  tone: string;
  dialogueRatio: string;
  descriptionDensity: string;
  pacing: string;
}

export interface ReviewConfig {
  strictness: string;
  focusAreas: string[];
  ignoredWarnings: string[];
}

export interface ReferencesConfig {
  required: string[];
  optional: string[];
}

export interface SkillFiles {
  outlineMethod: string;
  characterMethod: string;
  writingMethod: string;
  outputStyle: string;
  reviewRules?: string;
  templates: {
    outline?: string;
    character?: string;
    chapter?: string;
  };
  examples: {
    outline?: string;
    chapter?: string;
    dialogue?: string;
  };
}

// ============ Reference Types ============
export type ReferenceType = 'ground-truth' | 'style';

export interface Reference {
  id: string;
  name: string;
  type: ReferenceType;
  path: string;
  description?: string;
  tags: string[];
  addedAt: Date;
}

// ============ State Types ============
export interface ProjectState {
  meta: {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    version: string;
  };
  progress: {
    phase: 'outline' | 'characters' | 'writing' | 'revision' | 'completed';
    currentChapter: number;
    totalPlannedChapters: number;
    completedChapters: number[];
    inProgressChapter?: {
      chapterIndex: number;
      lastSavedAt: Date;
      draftContent: string;
      wordCount: number;
    };
  };
  skill: {
    name: string;
    loadedAt: Date;
    customOverrides?: Record<string, unknown>;
  };
  agents: {
    lastActiveAgent: AgentRole;
    pendingTasks: AgentTask[];
    reviewHistory: ReviewRecord[];
  };
  session: {
    lastInteraction: Date;
    conversationHistory: Message[];
    workingMemory: WorkingMemoryItem[];
  };
  checkpoints: Checkpoint[];
}

export interface ReviewRecord {
  id: string;
  chapterIndex: number;
  reviewedAt: Date;
  approved: boolean;
  issues: ReviewIssue[];
  score: ReviewScore;
}

export interface ReviewIssue {
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  type: 'inconsistency' | 'logic_error' | 'timeline_conflict' | 'character_ooc' | 'style_break';
  location: string;
  quote: string;
  description: string;
  evidence: string[];
  suggestedFix?: string;
}

export interface ReviewScore {
  factConsistency: number;
  logicConsistency: number;
  characterConsistency: number;
  styleConsistency: number;
  overall: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface WorkingMemoryItem {
  key: string;
  value: unknown;
  expiresAt?: Date;
}

export interface Checkpoint {
  id: string;
  name: string;
  createdAt: Date;
  description: string;
  state: Omit<ProjectState, 'checkpoints'>;
}

// ============ Event Types ============
export type NovelWriterEvent =
  | 'initialized'
  | 'chapter_start'
  | 'draft_saved'
  | 'chapter_finalized'
  | 'review_complete'
  | 'edit_complete'
  | 'error';

export interface EventPayload {
  chapterIndex?: number;
  content?: string;
  error?: Error;
}
