import type { LLMProvider, LLMConfig, AgentTask } from '../types/index.js';
import { createLLMProvider } from './LLMProvider.js';

interface RouterConfig {
  providers: Record<string, LLMConfig>;
  taskMapping: Record<string, string>;
  defaultProvider: string;
}

/**
 * Routes tasks to appropriate LLM providers based on task type and complexity
 */
export class ModelRouter {
  private providers: Map<string, LLMProvider> = new Map();
  private taskModelMapping: Map<string, string>;
  private defaultProvider: string;

  constructor(config: RouterConfig) {
    // Initialize all configured providers
    for (const [name, providerConfig] of Object.entries(config.providers)) {
      this.providers.set(name, createLLMProvider(providerConfig));
    }

    this.taskModelMapping = new Map(Object.entries(config.taskMapping));
    this.defaultProvider = config.defaultProvider;
  }

  /**
   * Get provider for a specific task type
   */
  getProvider(taskType: string): LLMProvider {
    const providerName = this.taskModelMapping.get(taskType) || this.defaultProvider;
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider "${providerName}" not found for task "${taskType}"`);
    }
    return provider;
  }

  /**
   * Get the default provider
   */
  getDefaultProvider(): LLMProvider {
    const provider = this.providers.get(this.defaultProvider);
    if (!provider) {
      throw new Error(`Default provider "${this.defaultProvider}" not found`);
    }
    return provider;
  }

  /**
   * Smart routing based on task complexity
   * - Simple tasks (tag extraction, summarization) -> local/cheaper models
   * - Complex tasks (writing, reviewing) -> powerful models
   */
  async smartRoute(task: AgentTask): Promise<LLMProvider> {
    // Check if there's an explicit mapping for this task type
    if (this.taskModelMapping.has(task.type)) {
      return this.getProvider(task.type);
    }

    // Determine complexity based on task characteristics
    const isSimpleTask = this.isSimpleTask(task);

    if (isSimpleTask && this.providers.has('ollama')) {
      return this.providers.get('ollama')!;
    }

    // Default to the main provider for complex tasks
    return this.getDefaultProvider();
  }

  /**
   * Check if a task is simple enough for local/cheaper models
   */
  private isSimpleTask(task: AgentTask): boolean {
    const simpleTaskTypes = [
      'tag_extraction',
      'summary',
      'entity_extraction',
      'keyword_extraction',
      'intent_classification',
    ];

    if (simpleTaskTypes.includes(task.type)) {
      return true;
    }

    // Check input size - small inputs are likely simple tasks
    const inputSize = JSON.stringify(task.input).length;
    return inputSize < 1000;
  }

  /**
   * Get all registered provider names
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a specific provider is available
   */
  hasProvider(name: string): boolean {
    return this.providers.has(name);
  }
}

/**
 * Create a default router configuration from environment variables
 */
export function createDefaultRouter(): ModelRouter {
  const providers: Record<string, LLMConfig> = {};
  const taskMapping: Record<string, string> = {};
  let defaultProvider = 'claude';

  // Configure Claude if API key is available
  if (process.env.ANTHROPIC_API_KEY) {
    providers.claude = {
      provider: 'claude',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    };
  }

  // Configure OpenAI if API key is available
  if (process.env.OPENAI_API_KEY) {
    providers.openai = {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o',
    };
  }

  // Configure Ollama (always available if running locally)
  providers.ollama = {
    provider: 'ollama',
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.2',
  };

  // Set default provider based on what's available
  const defaultProviderEnv = process.env.DEFAULT_LLM_PROVIDER;
  if (defaultProviderEnv && providers[defaultProviderEnv]) {
    defaultProvider = defaultProviderEnv;
  } else if (providers.claude) {
    defaultProvider = 'claude';
  } else if (providers.openai) {
    defaultProvider = 'openai';
  } else {
    defaultProvider = 'ollama';
  }

  // Default task mapping - route simple tasks to local models
  taskMapping.tag_extraction = 'ollama';
  taskMapping.summary = 'ollama';
  taskMapping.entity_extraction = 'ollama';

  // Complex tasks use the main provider
  taskMapping.writing = defaultProvider;
  taskMapping.reviewing = defaultProvider;
  taskMapping.planning = defaultProvider;

  return new ModelRouter({
    providers,
    taskMapping,
    defaultProvider,
  });
}
