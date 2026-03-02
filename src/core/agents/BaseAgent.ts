/**
 * @module src/core/agents/BaseAgent
 * @description Agent 基类。
 * 提供所有 Agent 的通用能力：LLM 调用、流式输出、上下文构建、JSON 提取。
 * 子类（Writer、Reviewer、Editor、Planner）继承此类并实现 execute() 方法。
 *
 * JSON 提取策略（按优先级）：
 * 1. ```json 代码块 → 2. 最后一个 JSON 对象 → 3. 最外层 {} → 4. 整个响应
 */
import { EventEmitter } from 'events';
import type { LLMProvider, AgentRole, AgentContext, SkillConfig } from '../../types/index.js';

/**
 * Base class for all agents in the NovelWriter system
 */
export abstract class BaseAgent extends EventEmitter {
  protected llm: LLMProvider;
  protected role: AgentRole;
  protected systemPrompt: string = '';

  constructor(llm: LLMProvider, role: AgentRole) {
    super();
    this.llm = llm;
    this.role = role;
  }

  /**
   * Execute the agent's main task
   */
  abstract execute(input: AgentInput): Promise<AgentOutput>;

  /**
   * Build the full prompt including system prompt and context
   */
  protected buildPrompt(userPrompt: string, context?: AgentContext): string {
    const parts: string[] = [];

    // Add context if available
    if (context) {
      if (context.outline) {
        parts.push('【故事大纲】');
        parts.push(context.outline);
        parts.push('');
      }

      if (context.characters && context.characters.length > 0) {
        parts.push('【人物设定】');
        for (const char of context.characters) {
          parts.push(`- ${char.name}: ${char.personality.core}`);
        }
        parts.push('');
      }

      if (context.previousChapters && context.previousChapters.length > 0) {
        parts.push('【前情提要】');
        for (const chapter of context.previousChapters) {
          parts.push(`第${chapter.index}章 ${chapter.title}: ${chapter.summary}`);
        }
        parts.push('');
      }

      if (context.relevantMemory && context.relevantMemory.length > 0) {
        parts.push('【相关记忆】');
        for (const memory of context.relevantMemory) {
          parts.push(`[${memory.metadata.type}] ${memory.content.substring(0, 200)}...`);
        }
        parts.push('');
      }
    }

    // Add the user prompt
    parts.push(userPrompt);

    return parts.join('\n');
  }

  /**
   * Apply skill configuration to agent behavior
   */
  protected applySkill(skill: SkillConfig): void {
    // Override in subclasses for skill-specific behavior
  }

  /**
   * Stream response with callback
   */
  protected async streamResponse(
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    let fullResponse = '';

    for await (const chunk of this.llm.stream(prompt, {
      systemPrompt: this.systemPrompt,
      temperature: 0.7,
    })) {
      fullResponse += chunk;
      onChunk(chunk);
    }

    return fullResponse;
  }

  /**
   * Complete a prompt without streaming
   */
  protected async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    return this.llm.complete(prompt, {
      systemPrompt: this.systemPrompt,
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens,
    });
  }

  /**
   * Extract JSON from response
   */
  protected extractJSON<T>(response: string): T | null {
    if (!response || response.trim().length === 0) {
      console.error('[BaseAgent.extractJSON] Empty response');
      return null;
    }

    // Try multiple strategies in order of reliability
    const strategies: Array<{ name: string; extract: () => string | null }> = [
      {
        name: 'JSON in code block',
        extract: () => {
          const match = response.match(/```(?:json)?\s*([\s\S]*?)```/);
          return match ? match[1].trim() : null;
        },
      },
      {
        // Reasoning models (Kimi K2.5, etc.) place the actual JSON answer at the END
        // of the response. Working backwards finds the real answer, not template examples
        // embedded earlier in the reasoning text.
        name: 'Last JSON object (backwards)',
        extract: () => {
          const lastBrace = response.lastIndexOf('}');
          if (lastBrace === -1) return null;
          let depth = 0;
          for (let i = lastBrace; i >= 0; i--) {
            if (response[i] === '}') depth++;
            else if (response[i] === '{') {
              depth--;
              if (depth === 0) {
                return response.substring(i, lastBrace + 1);
              }
            }
          }
          return null;
        },
      },
      {
        name: 'JSON object (greedy)',
        extract: () => {
          // Find the first { and last } to get the outermost JSON object
          const firstBrace = response.indexOf('{');
          const lastBrace = response.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            return response.substring(firstBrace, lastBrace + 1);
          }
          return null;
        },
      },
      {
        name: 'Entire response',
        extract: () => response.trim(),
      },
    ];

    for (const strategy of strategies) {
      try {
        const jsonStr = strategy.extract();
        if (jsonStr) {
          const result = JSON.parse(jsonStr);
          console.log(`[BaseAgent.extractJSON] Success via: ${strategy.name}`);
          return result;
        }
      } catch {
        // Try next strategy
      }
    }

    console.error('[BaseAgent.extractJSON] All strategies failed');
    console.error('[BaseAgent.extractJSON] Response (first 500):', response.substring(0, 500));
    return null;
  }

  /**
   * Get the agent's role
   */
  getRole(): AgentRole {
    return this.role;
  }
}

// ============ Types ============

export interface AgentInput {
  task: AgentTask;
  context?: AgentContext;
  skill?: SkillConfig;
  instructions?: string[];
}

export interface AgentTask {
  type: string;
  [key: string]: unknown;
}

export interface AgentOutput {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
}
