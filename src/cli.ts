#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import inquirer from 'inquirer';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Orchestrator } from './core/orchestrator/Orchestrator.js';
import { ClaudeAdapter } from './llm/ClaudeAdapter.js';
import { OpenAIAdapter } from './llm/OpenAIAdapter.js';
import { OllamaAdapter } from './llm/OllamaAdapter.js';
import type { LLMProvider } from './types/index.js';

const program = new Command();

program
  .name('novelwriter')
  .description('AI小说创作智能体系统')
  .version('1.0.0')
  .option('-p, --project <path>', '项目路径 (默认: 当前目录)');

// ============ Project Commands ============

program
  .command('init [path]')
  .description('初始化一个新的小说项目')
  .action(async (projectPath?: string) => {
    const targetPath = projectPath || process.cwd();
    await initProject(targetPath);
  });

program
  .command('status')
  .description('查看项目状态')
  .action(async () => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();
    const status = await orchestrator.getProjectStatus();

    console.log('\n📊 项目状态');
    console.log('─'.repeat(40));
    console.log(`阶段: ${status.phase}`);
    console.log(`当前技能包: ${status.currentSkill || '未选择'}`);
    console.log(`大纲: ${status.outlineExists ? '已创建' : '未创建'}`);
    console.log(`角色数量: ${status.characterCount}`);
    console.log(`章节数量: ${status.chapterCount} (已完成: ${status.completedChapters})`);
    console.log(`最后修改: ${status.lastModified.toLocaleString()}`);

    await orchestrator.dispose();
  });

// ============ Skill Commands ============

const skillCmd = program.command('skill').description('技能包管理');

skillCmd
  .command('list')
  .description('列出所有可用的技能包')
  .action(async () => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();
    const skills = await orchestrator.listSkills();

    console.log('\n📦 可用技能包:');
    for (const skill of skills) {
      console.log(`  - ${skill}`);
    }

    await orchestrator.dispose();
  });

skillCmd
  .command('use <name>')
  .description('切换到指定的技能包')
  .action(async (name: string) => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();

    try {
      const skill = await orchestrator.useSkill(name);
      console.log(`\n✅ 已切换到技能包: ${skill.name}`);
      console.log(`   题材: ${skill.metadata.genre}`);
      console.log(`   版本: ${skill.version}`);
    } catch (e) {
      console.error(`\n❌ 无法加载技能包: ${name}`);
      console.error(`   错误: ${e instanceof Error ? e.message : e}`);
    }

    await orchestrator.dispose();
  });

skillCmd
  .command('info [name]')
  .description('查看技能包详情')
  .action(async (name?: string) => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();

    const skill = name
      ? await orchestrator.useSkill(name)
      : orchestrator.getCurrentSkill();

    if (!skill) {
      console.log('\n❌ 未选择技能包');
      return;
    }

    console.log(`\n📦 技能包: ${skill.name}`);
    console.log('─'.repeat(40));
    console.log(`版本: ${skill.version}`);
    console.log(`题材: ${skill.metadata.genre}`);
    console.log(`作者: ${skill.metadata.author || '未知'}`);
    if (skill.metadata.features) {
      console.log(`特性:`);
      for (const feature of skill.metadata.features) {
        console.log(`  - ${feature}`);
      }
    }

    await orchestrator.dispose();
  });

// ============ Planning Commands ============

program
  .command('plan')
  .description('开始对话式规划（确定大纲和角色）')
  .action(async () => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();

    // Check if skill is selected
    if (!orchestrator.getCurrentSkill()) {
      const skills = await orchestrator.listSkills();
      if (skills.length > 0) {
        const { selectedSkill } = await inquirer.prompt([{
          type: 'list',
          name: 'selectedSkill',
          message: '请先选择一个技能包:',
          choices: skills,
        }]);
        await orchestrator.useSkill(selectedSkill);
      }
    }

    // Get initial idea
    const { idea } = await inquirer.prompt([{
      type: 'input',
      name: 'idea',
      message: '请描述你想写的故事:',
    }]);

    let session = await orchestrator.startPlanning(idea);
    console.log('\n🎯 开始规划...\n');

    // Collect requirements
    while (!session.readyToOutline && session.currentQuestions?.length) {
      console.log('📝 我需要了解更多信息:\n');

      const answers: Record<string, string> = {};
      for (const question of session.currentQuestions) {
        const { answer } = await inquirer.prompt([{
          type: 'input',
          name: 'answer',
          message: question,
        }]);
        answers[question] = answer;
      }

      session = await orchestrator.continuePlanning(session, answers);
    }

    // Generate outline
    console.log('\n📋 正在生成大纲...\n');
    session = await orchestrator.generateOutlineDraft(session);
    console.log(session.outlineDraft);

    // Review outline
    let outlineAccepted = false;
    while (!outlineAccepted) {
      const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: '你觉得这个大纲怎么样?',
        choices: [
          { name: '很好，继续', value: 'accept' },
          { name: '需要修改', value: 'revise' },
          { name: '重新生成', value: 'regenerate' },
        ],
      }]);

      if (action === 'accept') {
        outlineAccepted = true;
      } else if (action === 'revise') {
        const { feedback } = await inquirer.prompt([{
          type: 'input',
          name: 'feedback',
          message: '请描述你想要的修改:',
        }]);
        session = await orchestrator.refineOutline(session, feedback);
        console.log('\n📋 修改后的大纲:\n');
        console.log(session.outlineDraft);
      } else {
        session = await orchestrator.generateOutlineDraft(session);
        console.log('\n📋 新生成的大纲:\n');
        console.log(session.outlineDraft);
      }
    }

    // Suggest characters
    console.log('\n👥 正在分析需要的角色...\n');
    session = await orchestrator.suggestCharacters(session);

    const characters: Array<{ name: string; profile: string }> = [];

    for (const suggestion of session.characterSuggestions) {
      console.log(`\n建议角色: ${suggestion.name}`);
      console.log(`  定位: ${suggestion.role}`);
      console.log(`  描述: ${suggestion.briefDescription}`);

      const { includeChar } = await inquirer.prompt([{
        type: 'confirm',
        name: 'includeChar',
        message: '是否创建这个角色?',
        default: true,
      }]);

      if (includeChar) {
        const { customRequirements } = await inquirer.prompt([{
          type: 'input',
          name: 'customRequirements',
          message: '有什么特殊要求吗? (直接回车跳过)',
        }]);

        console.log(`\n正在设计 ${suggestion.name} 的人物小传...`);
        const profile = await orchestrator.designCharacter(
          session,
          suggestion.name,
          suggestion.role,
          customRequirements || undefined
        );

        console.log(profile);

        const { acceptProfile } = await inquirer.prompt([{
          type: 'confirm',
          name: 'acceptProfile',
          message: '接受这个人物小传?',
          default: true,
        }]);

        if (acceptProfile) {
          characters.push({ name: suggestion.name, profile });
        }
      }
    }

    // Add custom characters
    let addMore = true;
    while (addMore) {
      const { wantMore } = await inquirer.prompt([{
        type: 'confirm',
        name: 'wantMore',
        message: '是否要添加更多角色?',
        default: false,
      }]);

      if (!wantMore) {
        addMore = false;
        break;
      }

      const { charName, charRole, charRequirements } = await inquirer.prompt([
        { type: 'input', name: 'charName', message: '角色名字:' },
        { type: 'input', name: 'charRole', message: '角色定位:' },
        { type: 'input', name: 'charRequirements', message: '其他要求:' },
      ]);

      const profile = await orchestrator.designCharacter(
        session,
        charName,
        charRole,
        charRequirements
      );

      console.log(profile);
      characters.push({ name: charName, profile });
    }

    // Finalize
    console.log('\n💾 保存项目...');
    await orchestrator.finalizePlanning(session, session.outlineDraft!, characters);

    console.log('\n✅ 规划完成！');
    console.log(`   大纲已保存`);
    console.log(`   创建了 ${characters.length} 个角色`);
    console.log('\n使用 `novelwriter write 1` 开始写第一章');

    await orchestrator.dispose();
  });

// ============ Writing Commands ============

program
  .command('write <chapter>')
  .description('写指定章节')
  .action(async (chapter: string) => {
    const chapterIndex = parseInt(chapter, 10);
    if (isNaN(chapterIndex)) {
      console.error('❌ 无效的章节号');
      return;
    }

    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();

    console.log(`\n✍️  正在写第 ${chapterIndex} 章...\n`);

    const result = await orchestrator.writeChapter(chapterIndex);

    console.log('─'.repeat(40));
    console.log(result.finalContent);
    console.log('─'.repeat(40));

    console.log(`\n📊 写作完成`);
    console.log(`   字数: ${result.wordCount}`);
    console.log(`   审稿: ${result.review.passed ? '✅ 通过' : '⚠️  有问题'}`);

    if (result.review.issues.length > 0) {
      console.log('\n问题:');
      for (const issue of result.review.issues) {
        console.log(`  [${issue.type}] ${issue.description}`);
      }
    }

    await orchestrator.dispose();
  });

program
  .command('continue')
  .description('续写模式（从现有内容续写）')
  .action(async () => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();

    const { existingContent } = await inquirer.prompt([{
      type: 'editor',
      name: 'existingContent',
      message: '请粘贴现有内容:',
    }]);

    console.log('\n✍️  正在分析并续写...\n');

    const continuation = await orchestrator.continueWriting(existingContent);
    console.log(continuation);

    await orchestrator.dispose();
  });

// ============ Chapter Commands ============

const chapterCmd = program.command('chapter').description('章节管理');

chapterCmd
  .command('list')
  .description('列出所有章节')
  .action(async () => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();
    const status = await orchestrator.getProjectStatus();

    console.log(`\n📚 章节列表 (共 ${status.chapterCount} 章)`);
    // More detailed listing would need DocumentManager access

    await orchestrator.dispose();
  });

chapterCmd
  .command('edit <number>')
  .description('编辑指定章节')
  .option('-i, --instruction <text>', '修改指令')
  .action(async (number: string, options: { instruction?: string }) => {
    const chapterIndex = parseInt(number, 10);
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();

    const instruction = options.instruction || (await inquirer.prompt([{
      type: 'input',
      name: 'instruction',
      message: '请描述你想要的修改:',
    }])).instruction;

    console.log(`\n✏️  正在修改第 ${chapterIndex} 章...\n`);

    const result = await orchestrator.editChapter(chapterIndex, instruction);
    console.log(result);

    await orchestrator.dispose();
  });

chapterCmd
  .command('review <number>')
  .description('审稿指定章节')
  .action(async (number: string) => {
    const chapterIndex = parseInt(number, 10);
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();

    console.log(`\n🔍 正在审稿第 ${chapterIndex} 章...\n`);

    const result = await orchestrator.reviewChapter(chapterIndex);

    console.log(`审稿结果: ${result.passed ? '✅ 通过' : '❌ 未通过'}`);
    console.log(`评分: ${result.score}/100`);

    if (result.issues.length > 0) {
      console.log('\n问题:');
      for (const issue of result.issues) {
        console.log(`  [${issue.type}] ${issue.category}: ${issue.description}`);
      }
    }

    if (result.suggestions.length > 0) {
      console.log('\n建议:');
      for (const suggestion of result.suggestions) {
        console.log(`  - ${suggestion}`);
      }
    }

    await orchestrator.dispose();
  });

// ============ Character Commands ============

const charCmd = program.command('character').description('角色管理');

charCmd
  .command('list')
  .description('列出所有角色')
  .action(async () => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();
    const characters = await orchestrator.listCharacters();

    console.log('\n👥 角色列表:');
    for (const name of characters) {
      console.log(`  - ${name}`);
    }

    await orchestrator.dispose();
  });

charCmd
  .command('show <name>')
  .description('显示角色详情')
  .action(async (name: string) => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();
    const character = await orchestrator.getCharacter(name);

    if (character) {
      console.log(`\n👤 ${character.name}`);
      console.log('─'.repeat(40));
      console.log(character.profile || '（无人物小传）');
    } else {
      console.log(`\n❌ 未找到角色: ${name}`);
    }

    await orchestrator.dispose();
  });

charCmd
  .command('create <name>')
  .description('创建新角色')
  .action(async (name: string) => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();

    const { profile } = await inquirer.prompt([{
      type: 'editor',
      name: 'profile',
      message: '请输入人物小传:',
    }]);

    const character = await orchestrator.createCharacter(name, profile);
    console.log(`\n✅ 角色 "${character.name}" 已创建`);

    await orchestrator.dispose();
  });

charCmd
  .command('delete <name>')
  .description('删除角色')
  .action(async (name: string) => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `确定要删除角色 "${name}" 吗?`,
      default: false,
    }]);

    if (confirm) {
      const result = await orchestrator.deleteCharacter(name);
      if (result.warnings.length > 0) {
        console.log('\n⚠️  警告:');
        for (const warning of result.warnings) {
          console.log(`   ${warning}`);
        }
      }
      console.log(`\n✅ 角色 "${name}" 已删除`);
    }

    await orchestrator.dispose();
  });

// ============ Outline Commands ============

const outlineCmd = program.command('outline').description('大纲管理');

outlineCmd
  .command('show')
  .description('显示当前大纲')
  .action(async () => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();
    const outline = await orchestrator.getOutline();

    if (outline) {
      console.log(`\n📋 ${outline.title}`);
      console.log('─'.repeat(40));
      console.log(`主题: ${outline.theme}`);
      console.log(`类型: ${outline.genre}`);
      console.log(`前提: ${outline.premise}`);
      console.log(`\n章节 (${outline.chapters.length}):`);
      for (const chapter of outline.chapters) {
        console.log(`  ${chapter.index}. ${chapter.title} - ${chapter.summary}`);
      }
    } else {
      console.log('\n❌ 暂无大纲');
    }

    await orchestrator.dispose();
  });

outlineCmd
  .command('history')
  .description('查看大纲修改历史')
  .action(async () => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();
    const history = await orchestrator.getOutlineHistory();

    console.log('\n📜 大纲历史:');
    for (const entry of history) {
      console.log(`  ${entry.id}: ${entry.timestamp}`);
    }

    await orchestrator.dispose();
  });

// ============ Reference Commands ============

const refCmd = program.command('ref').description('参考文献管理');

refCmd
  .command('add <type> <file>')
  .description('添加参考文献 (type: ground-truth | style-ref)')
  .action(async (type: string, file: string) => {
    if (type !== 'ground-truth' && type !== 'style-ref') {
      console.error('❌ 类型必须是 ground-truth 或 style-ref');
      return;
    }

    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();

    await orchestrator.addReference(file, type as 'ground-truth' | 'style-ref');
    console.log(`\n✅ 已添加参考文献: ${file}`);

    await orchestrator.dispose();
  });

refCmd
  .command('search <query>')
  .description('搜索参考文献')
  .action(async (query: string) => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();

    const results = await orchestrator.searchReferences(query);

    console.log(`\n🔍 搜索结果 (${results.length}):`);
    for (const result of results) {
      console.log(`\n  来源: ${result.source}`);
      console.log(`  ${result.content.substring(0, 200)}...`);
    }

    await orchestrator.dispose();
  });

// ============ State Commands ============

program
  .command('save [description]')
  .description('保存当前进度（创建检查点）')
  .action(async (description?: string) => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();

    const checkpointId = await orchestrator.saveCheckpoint(description);
    console.log(`\n✅ 已保存检查点: ${checkpointId}`);

    await orchestrator.dispose();
  });

program
  .command('checkpoints')
  .description('列出所有检查点')
  .action(async () => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();

    const checkpoints = await orchestrator.listCheckpoints();

    console.log('\n💾 检查点列表:');
    for (const cp of checkpoints) {
      console.log(`  ${cp.id}: ${cp.timestamp} ${cp.description || ''}`);
    }

    await orchestrator.dispose();
  });

program
  .command('restore <checkpointId>')
  .description('恢复到指定检查点')
  .action(async (checkpointId: string) => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();

    await orchestrator.restoreCheckpoint(checkpointId);
    console.log(`\n✅ 已恢复到检查点: ${checkpointId}`);

    await orchestrator.dispose();
  });

// ============ Export Commands ============

program
  .command('export [output]')
  .description('导出小说')
  .option('-f, --format <format>', '输出格式 (markdown | txt)', 'markdown')
  .action(async (output?: string, options?: { format?: string }) => {
    const orchestrator = await createOrchestrator();
    await orchestrator.initialize();

    const format = (options?.format || 'markdown') as 'markdown' | 'txt';
    const content = await orchestrator.exportNovel(format);

    const outputPath = output || `novel.${format === 'markdown' ? 'md' : 'txt'}`;
    await fs.writeFile(outputPath, content, 'utf-8');

    console.log(`\n✅ 已导出到: ${outputPath}`);

    await orchestrator.dispose();
  });

// ============ Helper Functions ============

async function initProject(targetPath: string): Promise<void> {
  const absolutePath = path.resolve(targetPath);

  // Create directory structure
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
    await fs.mkdir(path.join(absolutePath, dir), { recursive: true });
  }

  // Create initial files
  await fs.writeFile(
    path.join(absolutePath, '.claude', 'CLAUDE.md'),
    '# NovelWriter 项目\n\n使用 `novelwriter plan` 开始规划你的小说。',
    'utf-8'
  );

  await fs.writeFile(
    path.join(absolutePath, 'chapter_index.md'),
    '# 章节目录\n\n（暂无章节）',
    'utf-8'
  );

  console.log(`\n✅ 项目已初始化: ${absolutePath}`);
  console.log('\n下一步:');
  console.log('  1. cd ' + targetPath);
  console.log('  2. novelwriter skill list  # 查看可用技能包');
  console.log('  3. novelwriter plan        # 开始规划故事');
}

async function createOrchestrator(): Promise<Orchestrator> {
  const opts = program.opts();
  const projectPath = opts.project ? path.resolve(opts.project) : process.cwd();

  // Determine LLM provider from environment
  const provider = process.env.LLM_PROVIDER || 'claude';
  let llmProvider: LLMProvider;

  switch (provider) {
    case 'openai':
      llmProvider = new OpenAIAdapter({
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY!,
        model: process.env.OPENAI_MODEL || 'gpt-4o',
      });
      break;
    case 'ollama':
      llmProvider = new OllamaAdapter({
        provider: 'ollama',
        host: process.env.OLLAMA_URL || 'http://localhost:11434',
        model: process.env.OLLAMA_MODEL || 'llama2',
      });
      break;
    case 'claude':
    default:
      llmProvider = new ClaudeAdapter({
        provider: 'claude',
        apiKey: process.env.ANTHROPIC_API_KEY!,
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
      });
      break;
  }

  const embeddingProvider = (process.env.EMBEDDING_PROVIDER || 'openai') as 'openai' | 'ollama' | 'local';

  // Determine embedding model and host based on provider
  let embeddingModel: string | undefined;
  let embeddingHost: string | undefined;
  let embeddingApiKey: string | undefined;

  if (embeddingProvider === 'ollama') {
    embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
    embeddingHost = process.env.OLLAMA_URL || 'http://localhost:11434';
  } else if (embeddingProvider === 'openai') {
    embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
    embeddingApiKey = process.env.OPENAI_API_KEY;
  }

  return new Orchestrator({
    projectPath,
    llmProvider,
    embeddingProvider,
    embeddingApiKey,
    embeddingModel,
    embeddingHost,
  });
}

// Run CLI
program.parse();
