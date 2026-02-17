import { Orchestrator, type PlanningSession } from '../../src/core/orchestrator/Orchestrator.js';
import { ClaudeAdapter } from '../../src/llm/ClaudeAdapter.js';
import { OpenAIAdapter } from '../../src/llm/OpenAIAdapter.js';
import { OllamaAdapter } from '../../src/llm/OllamaAdapter.js';
import { OpenAICompatibleAdapter } from '../../src/llm/OpenAICompatibleAdapter.js';
import type { LLMProvider } from '../../src/types/index.js';
import { configStore } from '../ipc/config.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createRequire } from 'module';

const electronRequire = createRequire(import.meta.url);
const { app } = electronRequire('electron');

// Lazy getter for app root path (works in both dev and production)
let _appRoot: string | null = null;
function getAppRoot(): string {
  if (_appRoot === null) {
    const isDev = !app.isPackaged;
    _appRoot = isDev ? process.cwd() : app.getAppPath();
  }
  return _appRoot as string;
}

// Planning session storage
let currentPlanningSession: PlanningSession | null = null;

class OrchestratorServiceClass {
  private orchestrator: Orchestrator | null = null;
  private projectPath: string | null = null;

  async initProject(projectPath: string, selectedSkill?: string): Promise<void> {
    // Create project directory structure
    const dirs = [
      '',
      'characters',
      'chapters',
      'references',
      '.state',
      '.claude',
      '.claude/skills',
    ];

    for (const dir of dirs) {
      await fs.mkdir(path.join(projectPath, dir), { recursive: true });
    }

    const templatePath = path.join(getAppRoot(), 'templates/default-project');
    console.log('Template path:', templatePath);
    console.log('Selected skill:', selectedSkill);

    try {
      const templateExists = await fs.access(templatePath).then(() => true).catch(() => false);
      if (templateExists) {
        // Copy CLAUDE.md
        const claudeMdSrc = path.join(templatePath, '.claude/CLAUDE.md');
        const claudeMdDest = path.join(projectPath, '.claude/CLAUDE.md');
        try {
          await fs.access(claudeMdSrc);
          await fs.copyFile(claudeMdSrc, claudeMdDest);
          console.log('CLAUDE.md copied');
        } catch {
          console.log('CLAUDE.md not found in template');
        }

        // Copy skills based on selection
        if (selectedSkill && selectedSkill !== 'empty') {
          // Copy only the selected skill
          const skillSrc = path.join(templatePath, '.claude/skills', selectedSkill);
          const skillDest = path.join(projectPath, '.claude/skills', selectedSkill);
          try {
            await fs.access(skillSrc);
            await this.copyTemplate(skillSrc, skillDest);
            console.log(`Skill "${selectedSkill}" copied successfully`);
          } catch (error) {
            console.error(`Failed to copy skill "${selectedSkill}":`, error);
          }
        } else if (!selectedSkill) {
          // No selection specified - copy all skills (backward compatibility)
          const skillsSrc = path.join(templatePath, '.claude/skills');
          const skillsDest = path.join(projectPath, '.claude/skills');
          try {
            await fs.access(skillsSrc);
            await this.copyTemplate(skillsSrc, skillsDest);
            console.log('All skills copied successfully');
          } catch (error) {
            console.error('Failed to copy skills:', error);
          }
        }
        // If selectedSkill === 'empty', don't copy any skills

        console.log('Template copied successfully');
      } else {
        console.log('Template not found at:', templatePath);
      }
    } catch (error) {
      console.error('Failed to copy template:', error);
    }

    // Open the project
    await this.openProject(projectPath, true); // true = skip re-initialization

    // Auto-activate the selected skill
    if (selectedSkill && selectedSkill !== 'empty' && this.orchestrator) {
      try {
        await this.orchestrator.useSkill(selectedSkill);
        console.log(`Skill "${selectedSkill}" activated`);
      } catch (error) {
        console.error(`Failed to activate skill "${selectedSkill}":`, error);
      }
    }
  }

  async openProject(projectPath: string, skipInit = false): Promise<void> {
    this.projectPath = projectPath;

    // Check if this is an initialized project (has .state or .claude directory)
    const stateExists = await fs.access(path.join(projectPath, '.state')).then(() => true).catch(() => false);
    const claudeExists = await fs.access(path.join(projectPath, '.claude')).then(() => true).catch(() => false);

    // If not initialized and not skipping, set up project structure
    if (!skipInit && (!stateExists || !claudeExists)) {
      console.log('Project not initialized, setting up structure...');

      // Create project directory structure
      const dirs = [
        '',
        'characters',
        'chapters',
        'references',
        '.state',
        '.claude',
        '.claude/skills',
      ];

      for (const dir of dirs) {
        await fs.mkdir(path.join(projectPath, dir), { recursive: true });
      }

      // Copy default template if exists
      const templatePath = path.join(getAppRoot(), 'templates/default-project');
      console.log('Template path:', templatePath);
      try {
        const templateExists = await fs.access(templatePath).then(() => true).catch(() => false);
        if (templateExists) {
          await this.copyTemplate(templatePath, projectPath);
          console.log('Template copied successfully');
        } else {
          console.log('Template not found at:', templatePath);
        }
      } catch (error) {
        console.error('Failed to copy template:', error);
      }
    }

    // Get config
    const config = configStore.store;

    // Create LLM provider based on config
    const llmProvider = this.createLLMProvider(config.llm);

    // Create Orchestrator
    this.orchestrator = new Orchestrator({
      projectPath,
      llmProvider,
      embeddingProvider: config.embedding.provider,
      embeddingApiKey: config.embedding.apiKey,
      embeddingModel: config.embedding.model,
      embeddingHost: config.embedding.host,
    });

    // Initialize
    await this.orchestrator.initialize();
  }

  private createLLMProvider(llmConfig: any): LLMProvider {
    switch (llmConfig.provider) {
      case 'claude':
        return new ClaudeAdapter({
          provider: 'claude',
          apiKey: llmConfig.claude.apiKey,
          model: llmConfig.claude.model,
        });

      case 'openai':
        return new OpenAIAdapter({
          provider: 'openai',
          apiKey: llmConfig.openai.apiKey,
          model: llmConfig.openai.model,
        });

      case 'ollama':
        return new OllamaAdapter({
          provider: 'ollama',
          host: llmConfig.ollama.host,
          model: llmConfig.ollama.model,
        });

      case 'openai-compatible':
        return new OpenAICompatibleAdapter({
          provider: 'openai-compatible',
          baseUrl: llmConfig['openai-compatible'].baseUrl,
          apiKey: llmConfig['openai-compatible'].apiKey,
          model: llmConfig['openai-compatible'].model,
          extraBody: llmConfig['openai-compatible'].extraBody,
        });

      default:
        throw new Error(`Unknown LLM provider: ${llmConfig.provider}`);
    }
  }

  private async copyTemplate(src: string, dest: string): Promise<void> {
    // Ensure destination directory exists
    await fs.mkdir(dest, { recursive: true });

    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this.copyTemplate(srcPath, destPath);
      } else {
        // Only copy if destination doesn't exist
        try {
          await fs.access(destPath);
        } catch {
          await fs.copyFile(srcPath, destPath);
        }
      }
    }
  }

  getOrchestrator(): Orchestrator | null {
    return this.orchestrator;
  }

  getProjectPath(): string | null {
    return this.projectPath;
  }

  /**
   * Refresh LLM provider with current config
   * Call this after config changes
   */
  async refreshLLMProvider(): Promise<void> {
    console.log('=== refreshLLMProvider called ===');
    console.log('orchestrator exists:', !!this.orchestrator);
    console.log('projectPath:', this.projectPath);

    if (!this.orchestrator || !this.projectPath) {
      console.log('No orchestrator to refresh - skipping');
      return;
    }

    // Get fresh config
    const config = configStore.store;
    const providerConfig = config.llm[config.llm.provider];
    console.log('=== Creating new LLM provider ===');
    console.log('Provider type:', config.llm.provider);
    console.log('Provider config:', JSON.stringify(providerConfig, null, 2));

    // Create new LLM provider
    const llmProvider = this.createLLMProvider(config.llm);
    console.log('New LLM provider created');

    // Update orchestrator's LLM provider
    this.orchestrator.updateLLMProvider(llmProvider);

    console.log('=== LLM provider refresh complete ===');
  }

  // Planning session management
  getPlanningSession(): PlanningSession | null {
    return currentPlanningSession;
  }

  setPlanningSession(session: PlanningSession | null): void {
    currentPlanningSession = session;
  }

  async dispose(): Promise<void> {
    if (this.orchestrator) {
      await this.orchestrator.dispose();
      this.orchestrator = null;
    }
    this.projectPath = null;
    currentPlanningSession = null;
  }
}

export const OrchestratorService = new OrchestratorServiceClass();
