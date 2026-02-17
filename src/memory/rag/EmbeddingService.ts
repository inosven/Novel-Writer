/**
 * Embedding Service that supports multiple providers
 */
export class EmbeddingService {
  private provider: EmbeddingProvider;
  private cache: Map<string, number[]> = new Map();
  private cacheMaxSize = 1000;

  constructor(config: EmbeddingConfig) {
    this.provider = this.createProvider(config);
  }

  /**
   * Get embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    const cacheKey = this.hashText(text);

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const embedding = await this.provider.embed(text);

    // Manage cache size
    if (this.cache.size >= this.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(cacheKey, embedding);
    return embedding;
  }

  /**
   * Get embeddings for multiple texts (batch)
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    // Check cache for each text
    const results: (number[] | null)[] = texts.map(text => {
      const cacheKey = this.hashText(text);
      return this.cache.get(cacheKey) || null;
    });

    // Find uncached texts
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    results.forEach((result, i) => {
      if (result === null) {
        uncachedIndices.push(i);
        uncachedTexts.push(texts[i]);
      }
    });

    // Embed uncached texts
    if (uncachedTexts.length > 0) {
      const newEmbeddings = await this.provider.embedBatch(uncachedTexts);

      uncachedIndices.forEach((originalIndex, i) => {
        results[originalIndex] = newEmbeddings[i];

        // Cache new embeddings
        const cacheKey = this.hashText(texts[originalIndex]);
        if (this.cache.size >= this.cacheMaxSize) {
          const firstKey = this.cache.keys().next().value;
          if (firstKey) this.cache.delete(firstKey);
        }
        this.cache.set(cacheKey, newEmbeddings[i]);
      });
    }

    return results as number[][];
  }

  /**
   * Get the dimension of embeddings
   */
  get dimension(): number {
    return this.provider.dimension;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  private createProvider(config: EmbeddingConfig): EmbeddingProvider {
    switch (config.provider) {
      case 'openai':
        return new OpenAIEmbedding(config.apiKey!, config.model);
      case 'ollama':
        return new OllamaEmbedding(config.model, config.host);
      case 'local':
        return new LocalEmbedding();
      default:
        throw new Error(`Unknown embedding provider: ${config.provider}`);
    }
  }

  private hashText(text: string): string {
    // Simple hash for caching
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 1000); i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `${hash}_${text.length}`;
  }
}

// ============ Provider Interface ============

interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimension: number;
}

// ============ OpenAI Embedding ============

class OpenAIEmbedding implements EmbeddingProvider {
  dimension = 1536; // text-embedding-3-small
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || 'text-embedding-3-small';

    // Adjust dimension based on model
    if (this.model === 'text-embedding-3-large') {
      this.dimension = 3072;
    }
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding failed: ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // OpenAI supports batch embedding
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding failed: ${error}`);
    }

    const data = await response.json();
    // Sort by index to ensure correct order
    const sorted = data.data.sort((a: any, b: any) => a.index - b.index);
    return sorted.map((d: any) => d.embedding);
  }
}

// ============ Ollama Embedding ============

class OllamaEmbedding implements EmbeddingProvider {
  dimension = 768; // nomic-embed-text default
  private model: string;
  private host: string;

  constructor(model?: string, host?: string) {
    this.model = model || 'nomic-embed-text';
    this.host = host || 'http://localhost:11434';

    // Adjust dimension based on model
    if (this.model === 'mxbai-embed-large') {
      this.dimension = 1024;
    }
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.host}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama embedding failed: ${error}`);
    }

    const data = await response.json();
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama doesn't support batch, so we do sequential
    return Promise.all(texts.map(t => this.embed(t)));
  }
}

// ============ Local Embedding (Simple) ============

class LocalEmbedding implements EmbeddingProvider {
  dimension = 384; // Simple embedding dimension

  async embed(text: string): Promise<number[]> {
    // Simple character-based embedding for testing
    // In production, use a proper local model
    const embedding = new Array(this.dimension).fill(0);

    for (let i = 0; i < text.length && i < this.dimension; i++) {
      embedding[i % this.dimension] += text.charCodeAt(i) / 65536;
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
}

// ============ Types ============

export interface EmbeddingConfig {
  provider: 'openai' | 'ollama' | 'local';
  apiKey?: string;
  model?: string;
  host?: string;
}
