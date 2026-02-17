/**
 * NovelWriter - AI小说创作智能体系统
 *
 * 主要功能：
 * - 对话式大纲确定
 * - 多Agent协作写作（Writer/Reviewer/Editor/Planner）
 * - 混合记忆系统（RAG + Tags + 知识图谱）
 * - 可替换技能包（不同题材/文风）
 * - 断点存续和精确修改
 */

// Core
export { Orchestrator, type OrchestratorConfig, type PlanningSession, type ProjectStatus } from './core/orchestrator/Orchestrator.js';

// Agents
export { BaseAgent } from './core/agents/BaseAgent.js';
export { WriterAgent } from './core/agents/WriterAgent.js';
export { ReviewerAgent } from './core/agents/ReviewerAgent.js';
export { EditorAgent } from './core/agents/EditorAgent.js';
export { PlannerAgent } from './core/agents/PlannerAgent.js';

// LLM Providers
export type { LLMProvider, LLMConfig } from './types/index.js';
export { ClaudeAdapter } from './llm/ClaudeAdapter.js';
export { OpenAIAdapter } from './llm/OpenAIAdapter.js';
export { OllamaAdapter } from './llm/OllamaAdapter.js';

// Memory System
export { MemorySystem, type MemoryConfig } from './memory/MemorySystem.js';
export { LanceDBAdapter } from './memory/rag/LanceDBAdapter.js';
export { EmbeddingService } from './memory/rag/EmbeddingService.js';
export { TagManager } from './memory/tags/TagManager.js';
export { KnowledgeGraph, type GraphUpdate, type GraphStats } from './memory/graph/KnowledgeGraph.js';

// Documents
export { DocumentManager } from './documents/DocumentManager.js';
export { CharacterManager } from './documents/CharacterManager.js';
export { OutlineManager, type CreateOutlineInput, type ImpactAnalysis } from './documents/OutlineManager.js';
export { ReferenceManager } from './documents/ReferenceManager.js';

// State
export { StateManager } from './core/state/StateManager.js';

// Skills
export { SkillLoader, type SkillInfo, type SkillTemplate } from './skills/SkillLoader.js';

// Types
export type {
  // LLM
  Message,

  // Agent
  AgentTask,

  // Character
  Character,

  // Outline
  Outline,
  ChapterOutline,

  // Memory
  MemorySearchResult,
  Tag,
  Entity,
  Relationship,

  // Skill
  SkillConfig,
  SkillMetadata,
  SkillFiles,
  BaseSkillConfig,
  StyleConfig,
  ReviewConfig,
  ReferencesConfig,

  // Reference
  ReferenceType,
  Reference,
} from './types/index.js';
