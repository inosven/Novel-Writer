/**
 * @module src/llm/OllamaAdapter
 * @description Ollama 本地模型适配器。通过 HTTP 调用本地 Ollama 服务。
 */
import { Ollama } from 'ollama';
import { BaseLLMProvider } from './LLMProvider.js';
import type { CompletionOptions, LLMConfig } from '../types/index.js';

export class OllamaAdapter extends BaseLLMProvider {
  private client: Ollama;
  private model: string;

  constructor(config: LLMConfig) {
    super();
    const host = config.host || process.env.OLLAMA_HOST || 'http://localhost:11434';
    // Note: Ollama client uses fetch internally, timeout may need to be set at fetch level
    this.client = new Ollama({ host });
    this.model = config.model || process.env.OLLAMA_MODEL || 'llama3.2';
    console.log(`[OllamaAdapter] Created with host=${host}, model=${this.model}`);
  }

  /**
   * Check if the model is a remote/cloud model
   */
  private isRemoteModel(): boolean {
    return this.model.includes('-cloud') || this.model.includes('remote');
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    console.log(`[OllamaAdapter] complete() called with model=${this.model}`);
    console.log(`[OllamaAdapter] Prompt length: ${prompt.length} chars`);

    try {
      const response = await this.client.generate({
        model: this.model,
        prompt,
        system: options?.systemPrompt,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens || 4096,
          stop: options?.stopSequences,
        },
      });

      console.log(`[OllamaAdapter] Response received, length: ${response.response.length}`);
      return response.response;
    } catch (error: any) {
      console.error(`[OllamaAdapter] Error during generate:`, error);
      console.error(`[OllamaAdapter] Error details:`, {
        message: error?.message,
        status: error?.status_code,
        error: error?.error,
      });

      // Re-throw with more context
      throw new Error(`Ollama generate failed: ${error?.message || error?.error || 'Unknown error'}`);
    }
  }

  async *stream(prompt: string, options?: CompletionOptions): AsyncIterable<string> {
    const stream = await this.client.generate({
      model: this.model,
      prompt,
      system: options?.systemPrompt,
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens || 4096,
        stop: options?.stopSequences,
      },
    });

    for await (const part of stream) {
      yield part.response;
    }
  }

  /**
   * Override token counting for Ollama models
   * Ollama models may have different tokenization
   */
  override countTokens(text: string): number {
    // Use a more conservative estimate for local models
    return Math.ceil(text.length / 3);
  }
}
