/**
 * @module src/llm/OpenAICompatibleAdapter
 * @description OpenAI 兼容 API 适配器。
 * 支持所有遵循 OpenAI Chat Completions API 格式的服务（如 Kimi、DeepSeek、vLLM 等）。
 * 支持自定义 baseUrl、extraBody 参数。
 */
import { BaseLLMProvider } from './LLMProvider.js';
import type { CompletionOptions, LLMConfig } from '../types/index.js';

interface OpenAICompatibleConfig extends LLMConfig {
  baseUrl: string;
  extraHeaders?: Record<string, string>;
  extraBody?: Record<string, unknown>;
}

export class OpenAICompatibleAdapter extends BaseLLMProvider {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private extraHeaders: Record<string, string>;
  private extraBody: Record<string, unknown>;

  constructor(config: OpenAICompatibleConfig) {
    super();
    this.baseUrl = config.baseUrl || config.host || '';
    this.apiKey = config.apiKey || '';
    this.model = config.model || '';
    this.extraHeaders = config.extraHeaders || {};
    this.extraBody = config.extraBody || {};

    console.log(`[OpenAICompatibleAdapter] Created with baseUrl=${this.baseUrl}, model=${this.model}`);
  }

  /**
   * Complete using streaming internally to avoid timeout issues with reasoning models.
   * Collects the full response from the stream and returns it as a single string.
   */
  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    console.log(`[OpenAICompatibleAdapter] complete() called with model=${this.model}`);
    console.log(`[OpenAICompatibleAdapter] Prompt length: ${prompt.length} chars`);

    const messages: Array<{ role: string; content: string }> = [];

    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);
    console.log(`[OpenAICompatibleAdapter] Total message length: ${totalLength} chars`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'text/event-stream',
      ...this.extraHeaders,
    };

    const body = {
      model: this.model,
      messages,
      max_tokens: options?.maxTokens || 16384,
      temperature: options?.temperature ?? 0.7,
      stream: true,  // Always use streaming to avoid timeout
      ...this.extraBody,
    };

    if (options?.stopSequences && options.stopSequences.length > 0) {
      (body as any).stop = options.stopSequences;
    }

    const maxRetries = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[OpenAICompatibleAdapter] Attempt ${attempt}/${maxRetries} (streaming mode)`);

        // 5 min timeout for reasoning models (Kimi K2.5 etc.) that need long thinking time
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[OpenAICompatibleAdapter] API error:`, response.status, errorText);
          throw new Error(`API error ${response.status}: ${errorText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let contentParts: string[] = [];
        let reasoningParts: string[] = [];
        let chunkCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                // Collect content
                if (delta?.content) {
                  contentParts.push(delta.content);
                }

                // Collect reasoning (various field names used by different providers)
                if (delta?.reasoning_content) {
                  reasoningParts.push(delta.reasoning_content);
                } else if (delta?.reasoning) {
                  reasoningParts.push(delta.reasoning);
                } else if (delta?.thinking) {
                  reasoningParts.push(delta.thinking);
                }

                chunkCount++;
              } catch {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }

        // Process any remaining data in buffer after stream ends
        if (buffer.trim()) {
          const remainingLine = buffer.trim();
          if (remainingLine.startsWith('data: ')) {
            const data = remainingLine.slice(6).trim();
            if (data !== '[DONE]') {
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) contentParts.push(delta.content);
                if (delta?.reasoning_content) reasoningParts.push(delta.reasoning_content);
                else if (delta?.reasoning) reasoningParts.push(delta.reasoning);
                else if (delta?.thinking) reasoningParts.push(delta.thinking);
              } catch {
                // Ignore
              }
            }
          }
        }

        const content = contentParts.join('');
        const reasoning = reasoningParts.join('');

        console.log(`[OpenAICompatibleAdapter] Stream completed: ${chunkCount} chunks`);
        console.log(`[OpenAICompatibleAdapter] Content length: ${content.length}`);
        console.log(`[OpenAICompatibleAdapter] Reasoning length: ${reasoning.length}`);

        if (content) {
          console.log(`[OpenAICompatibleAdapter] Content (first 500):`, content.substring(0, 500));
        }

        // Prefer content, fall back to full reasoning text
        // Important: do NOT try to extract JSON from reasoning here.
        // The caller is responsible for parsing the response format.
        // Reasoning models put the full response in reasoning field,
        // which may contain mixed formats (markdown + JSON, etc.)
        let finalContent = content;

        if (!finalContent && reasoning) {
          console.log(`[OpenAICompatibleAdapter] Content empty, using full reasoning as content`);
          finalContent = reasoning;
        }

        if (!finalContent) {
          console.error(`[OpenAICompatibleAdapter] WARNING: Empty response after streaming!`);
          if (attempt < maxRetries) {
            console.log(`[OpenAICompatibleAdapter] Retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
        }

        return finalContent;
      } catch (error: any) {
        console.error(`[OpenAICompatibleAdapter] Error on attempt ${attempt}:`, error);
        if (attempt >= maxRetries) {
          throw new Error(`OpenAI Compatible API failed: ${error?.message || 'Unknown error'}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return '';
  }

  async *stream(prompt: string, options?: CompletionOptions): AsyncIterable<string> {
    console.log(`[OpenAICompatibleAdapter] stream() called with model=${this.model}`);

    const messages: Array<{ role: string; content: string }> = [];

    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'text/event-stream',
      ...this.extraHeaders,
    };

    const body = {
      model: this.model,
      messages,
      max_tokens: options?.maxTokens || 16384,
      temperature: options?.temperature ?? 0.7,
      stream: true,
      ...this.extraBody,
    };

    if (options?.stopSequences && options.stopSequences.length > 0) {
      (body as any).stop = options.stopSequences;
    }

    try {
      // 5 min timeout for reasoning models
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (error: any) {
      console.error(`[OpenAICompatibleAdapter] Stream error:`, error);
      throw new Error(`OpenAI Compatible API stream failed: ${error?.message || 'Unknown error'}`);
    }
  }

  override countTokens(text: string): number {
    // Conservative estimate
    return Math.ceil(text.length / 3.5);
  }
}
