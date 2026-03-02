/**
 * @module src/llm/LLMProvider
 * @description LLM 提供者抽象层。
 * 定义 LLMProvider 接口的基类 BaseLLMProvider（含 token 估算工具），
 * 并提供工厂函数 createLLMProvider 按配置动态加载对应适配器。
 * 适配器：ClaudeAdapter、OpenAIAdapter、OllamaAdapter、OpenAICompatibleAdapter
 */
import type { LLMProvider, CompletionOptions, LLMConfig } from '../types/index.js';

export type { LLMProvider, CompletionOptions };

/**
 * Abstract base class for LLM providers with common utilities
 */
export abstract class BaseLLMProvider implements LLMProvider {
  abstract complete(prompt: string, options?: CompletionOptions): Promise<string>;
  abstract stream(prompt: string, options?: CompletionOptions): AsyncIterable<string>;

  /**
   * Estimate token count for text
   * Chinese characters: ~1.5 tokens per character
   * English/other: ~1 token per 4 characters
   */
  countTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars * 1.5 + otherChars / 4);
  }
}

/**
 * Factory function to create an LLM provider based on configuration
 */
export async function createLLMProvider(config: LLMConfig): Promise<LLMProvider> {
  switch (config.provider) {
    case 'claude': {
      const { ClaudeAdapter } = await import('./ClaudeAdapter.js');
      return new ClaudeAdapter(config);
    }
    case 'openai': {
      const { OpenAIAdapter } = await import('./OpenAIAdapter.js');
      return new OpenAIAdapter(config);
    }
    case 'ollama': {
      const { OllamaAdapter } = await import('./OllamaAdapter.js');
      return new OllamaAdapter(config);
    }
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
