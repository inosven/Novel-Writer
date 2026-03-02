/**
 * @module src/llm/ClaudeAdapter
 * @description Claude API 适配器。使用 Anthropic SDK 调用 Claude 模型。
 */
import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from './LLMProvider.js';
import type { CompletionOptions, LLMConfig } from '../types/index.js';

export class ClaudeAdapter extends BaseLLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(config: LLMConfig) {
    super();
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.model = config.model || 'claude-sonnet-4-20250514';
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? 0.7,
      system: options?.systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      stop_sequences: options?.stopSequences,
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return content.text;
    }
    return '';
  }

  async *stream(prompt: string, options?: CompletionOptions): AsyncIterable<string> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? 0.7,
      system: options?.systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      stop_sequences: options?.stopSequences,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  }
}
