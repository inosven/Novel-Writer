import OpenAI from 'openai';
import { BaseLLMProvider } from './LLMProvider.js';
import type { CompletionOptions, LLMConfig } from '../types/index.js';

export class OpenAIAdapter extends BaseLLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(config: LLMConfig) {
    super();
    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
    });
    this.model = config.model || 'gpt-4o';
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? 0.7,
      stop: options?.stopSequences,
    });

    return response.choices[0]?.message?.content || '';
  }

  async *stream(prompt: string, options?: CompletionOptions): AsyncIterable<string> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? 0.7,
      stop: options?.stopSequences,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}
