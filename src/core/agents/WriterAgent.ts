/**
 * @module src/core/agents/WriterAgent
 * @description 写作 Agent — 负责所有内容生成。
 * 支持任务类型：大纲生成(outline)、角色创建(character)、章节写作(chapter)、
 * 续写(continue)、场景扩写(scene)。
 * 使用 Skill 配置调整文风，通过上下文窗口（摘要+RAG）保持长篇一致性。
 */
import { BaseAgent, type AgentInput, type AgentOutput } from './BaseAgent.js';
import type { LLMProvider, SkillConfig, Entity } from '../../types/index.js';

/**
 * Writer Agent - Responsible for content creation
 * Supports both outline-based writing and continuation mode
 */
export class WriterAgent extends BaseAgent {
  constructor(llm: LLMProvider) {
    super(llm, 'writer');
    this.systemPrompt = this.buildSystemPrompt();
  }

  private buildSystemPrompt(): string {
    return `你是一位经验丰富的小说作家，擅长历史悬疑与权谋类小说，文风深受金庸、马伯庸影响。

你的核心能力：
1. 大纲生成 - 根据用户想法创建完整的故事大纲
2. 人物创建 - 创建有深度的角色，包含详细的人物小传
3. 章节写作 - 按大纲逐章创作，保持情节连贯
4. 续写 - 根据给定开头推断风格和设定，自然续写

文风要求（核心）：
- 悬疑氛围：善用环境烘托（雨夜、残烛、远处犬吠），以景写情，以物暗示危机
- 节奏控制：长短句交替。紧张处用短句、断句，制造窒息感；舒缓处用长句铺陈
- 感官沉浸：调动五感（冷风刺骨、血腥气弥漫、刀鞘碰撞声、昏暗灯火下的人影），让读者身临其境
- 悬念铺设：先果后因，延迟揭示关键信息；章末设钩子。不要急于解释，让读者带着疑问往下读
- 对话风格：言语暗藏机锋，话中有话。人物说半句留半句，用沉默和表情补全意思
- 人物刻画：通过微表情、小动作（攥紧茶杯、眼神一闪、手指微颤）展现内心，少用心理独白直说
- 避免说教和旁白式总结，让情节和细节自己说话

写作原则：
- 严格遵循大纲和人物设定
- 保持人物行为符合其性格
- 注意情节的因果逻辑
- 控制节奏，张弛有度

特殊标记：
- 新引入的人物使用 [[人物名:character]] 标记
- 新地点使用 [[地点名:location]] 标记
- 重要事件使用 [[事件名:event]] 标记`;
  }

  async execute(input: AgentInput): Promise<WriterOutput> {
    const { task, context, skill, instructions } = input;

    // Apply skill if provided
    if (skill) {
      this.applySkill(skill);
    }

    switch (task.type) {
      case 'outline':
        return this.generateOutline(task as OutlineTask, context, skill);

      case 'character':
        return this.createCharacter(task as CharacterTask, context, skill);

      case 'chapter':
        return this.writeChapter(task as ChapterTask, context, skill);

      case 'continue':
        return this.continueWriting(task as ContinueTask, context, skill);

      case 'scene':
        return this.expandScene(task as SceneTask, context, skill);

      default:
        throw new Error(`Unknown writer task type: ${task.type}`);
    }
  }

  /**
   * Generate story outline
   */
  private async generateOutline(
    task: OutlineTask,
    context?: AgentInput['context'],
    skill?: SkillConfig
  ): Promise<WriterOutput> {
    const methodology = skill?.files.outlineMethod || '';
    const template = skill?.files.templates.outline || '';
    const example = skill?.files.examples.outline || '';

    const prompt = `
根据以下用户想法，创建一个完整的故事大纲：

【用户想法】
${task.premise}

${methodology ? `【方法论参考】\n${methodology}\n` : ''}
${template ? `【输出模板】\n${template}\n` : ''}
${example ? `【风格示例 - 仅参考写作风格和结构，不要使用示例中的角色、情节或内容】\n${example}\n【注意：以上示例仅供参考写作风格，角色和情节必须完全根据用户想法原创】\n` : ''}

${task.genre ? `【题材类型】${task.genre}` : ''}
${task.targetChapters ? `【目标章数】${task.targetChapters}章` : ''}
${task.targetWordCount ? `【目标字数】${task.targetWordCount}字` : ''}

重要提醒：大纲中的所有角色、情节必须完全基于【用户想法】原创，不要借用任何示例中的角色或情节。

请生成包含以下内容的大纲：
1. 故事主题和核心冲突
2. 主要情节线
3. 分章大纲（每章标题、摘要、关键事件、出场角色）

以Markdown格式输出。
`;

    const content = await this.complete(prompt, { maxTokens: 4000 });

    return {
      content,
      metadata: {
        type: 'outline',
        wordCount: this.countWords(content),
        newEntities: this.extractEntities(content),
        tags: ['outline'],
      },
    };
  }

  /**
   * Create character profile
   */
  private async createCharacter(
    task: CharacterTask,
    context?: AgentInput['context'],
    skill?: SkillConfig
  ): Promise<WriterOutput> {
    const methodology = skill?.files.characterMethod || '';
    const template = skill?.files.templates.character || '';

    const prompt = `
为故事创建一个角色的详细人物小传：

【角色名】
${task.name}

【角色要求】
${task.description || '根据故事需要自由发挥'}

${context?.outline ? `【故事大纲】\n${context.outline}\n` : ''}
${methodology ? `【人物设定方法论】\n${methodology}\n` : ''}
${template ? `【输出模板】\n${template}\n` : ''}

请创建包含以下内容的人物小传：
1. 基础信息（年龄、性别、职业、外貌）
2. 性格特点（核心性格、优点、缺点、说话方式）
3. 背景故事
4. 人物关系
5. 角色弧光（起点→转变→终点）
6. 在故事中的作用

以Markdown格式输出。
`;

    const content = await this.complete(prompt, { maxTokens: 2000 });

    return {
      content,
      metadata: {
        type: 'character',
        characterName: task.name,
        wordCount: this.countWords(content),
        newEntities: [{ id: `character_${task.name}`, type: 'character', name: task.name, properties: {} }],
        tags: ['character', task.name],
      },
    };
  }

  /**
   * Write a chapter based on outline
   */
  private async writeChapter(
    task: ChapterTask,
    context?: AgentInput['context'],
    skill?: SkillConfig
  ): Promise<WriterOutput> {
    const writingMethod = skill?.files.writingMethod || '';
    const outputStyle = skill?.files.outputStyle || '';
    const chapterExample = skill?.files.examples.chapter || '';

    // Build context for this chapter
    const chapterContext = this.buildChapterContext(context, task.chapterIndex);

    const prompt = `
根据大纲写第${task.chapterIndex}章：

${chapterContext}

${task.chapterOutline ? `【本章大纲】\n${task.chapterOutline}\n` : ''}

${writingMethod ? `【写作方法】\n${writingMethod}\n` : ''}
${outputStyle ? `【文风规范】\n${outputStyle}\n` : ''}
${chapterExample ? `【风格示例 - 仅参考文笔风格、叙事节奏、对话方式，不要使用示例中的角色或情节】\n${chapterExample.substring(0, 1000)}...\n【重要：以上仅为风格参考，写作内容必须严格基于本章大纲和已有角色设定】\n` : ''}

${task.styleContext ? `【风格参考】\n${task.styleContext}\n` : ''}

写作要求：
1. 严格按照本章大纲推进情节，只使用大纲中指定的角色
2. 人物行为符合性格设定
3. 保持与前文的连贯性
4. ${task.targetWordCount ? `目标字数：${task.targetWordCount}字` : '控制在3000-5000字'}
5. 新引入的人物/地点/事件请用双括号标记
6. 不要使用任何风格示例中的角色名或情节，只学习其写作风格

文风要求（重要）：
- 开篇即入戏：不要从平淡叙述开始，用一个动作、一声异响、一个反常的细节直接拉入情境
- 环境即悬疑：天气、光线、声音都是叙事工具。"廊下灯笼被风吹灭了两盏"比"气氛很紧张"好一万倍
- 对话要有锋芒：每句台词都有潜台词，角色之间的对话是暗中交锋，不是平铺直叙地交换信息
- 段末设钩：每隔几段就埋一个小悬念或不安的暗示，让读者欲罢不能
- 绝不直白说破：用"他的手微微一顿"代替"他心中一惊"，用细节传递情绪

${(task as any).previousChapterEnding ? `【上一章结尾 - 请自然衔接】\n...${(task as any).previousChapterEnding}\n` : ''}
请直接开始写作（不要输出章节标题，直接写正文）：
`;

    const content = await this.complete(prompt, { maxTokens: 8000, temperature: 0.8 });

    return {
      content,
      metadata: {
        type: 'chapter',
        chapterIndex: task.chapterIndex,
        wordCount: this.countWords(content),
        newEntities: this.extractEntities(content),
        tags: [`chapter_${task.chapterIndex}`],
      },
    };
  }

  /**
   * Continue writing from a given start
   */
  private async continueWriting(
    task: ContinueTask,
    context?: AgentInput['context'],
    skill?: SkillConfig
  ): Promise<WriterOutput> {
    const outputStyle = skill?.files.outputStyle || '';

    // First, analyze the given text
    const analysisPrompt = `
分析以下文本的风格和设定：

${task.startText}

请简要分析：
1. 文风特点
2. 时代背景/设定
3. 已出现的角色
4. 可能的情节走向

以JSON格式输出：
{
  "style": "文风描述",
  "setting": "背景设定",
  "characters": ["角色列表"],
  "possiblePlot": "可能的发展"
}
`;

    const analysisResult = await this.complete(analysisPrompt, { maxTokens: 500 });
    const analysis = this.extractJSON<ContinueAnalysis>(analysisResult);

    // Then continue writing
    const continuePrompt = `
基于以下文本继续创作：

【已有文本】
${task.startText}

【分析结果】
${analysis ? JSON.stringify(analysis, null, 2) : '按原文风格续写'}

${outputStyle ? `【风格参考】\n${outputStyle}\n` : ''}

${task.direction ? `【用户指定方向】\n${task.direction}\n` : ''}

请自然地续写，保持风格一致，字数${task.targetWordCount || 1000}字左右：
`;

    const content = await this.complete(continuePrompt, { maxTokens: 4000, temperature: 0.8 });

    return {
      content,
      metadata: {
        type: 'continue',
        wordCount: this.countWords(content),
        newEntities: this.extractEntities(content),
        analysis,
        tags: ['continuation'],
      },
    };
  }

  /**
   * Expand a specific scene
   */
  private async expandScene(
    task: SceneTask,
    context?: AgentInput['context'],
    skill?: SkillConfig
  ): Promise<WriterOutput> {
    const outputStyle = skill?.files.outputStyle || '';

    const prompt = `
扩写以下场景：

【场景描述】
${task.sceneDescription}

【相关角色】
${task.characters?.join(', ') || '无'}

【场景目的】
${task.purpose || '推进情节'}

${outputStyle ? `【风格规范】\n${outputStyle}\n` : ''}

请详细扩写这个场景，包含：
1. 环境描写
2. 人物动作
3. 对话（如适用）
4. 心理描写（如适用）

目标字数：${task.targetWordCount || 500}字
`;

    const content = await this.complete(prompt, { maxTokens: 2000 });

    return {
      content,
      metadata: {
        type: 'scene',
        wordCount: this.countWords(content),
        newEntities: this.extractEntities(content),
        tags: ['scene'],
      },
    };
  }

  /**
   * Build context for chapter writing.
   * Uses: story summary + chapter summaries + RAG + previous chapter ending.
   * Total context stays bounded regardless of novel length.
   */
  private buildChapterContext(context: AgentInput['context'] | undefined, chapterIndex: number): string {
    const parts: string[] = [];

    // 1. Story-level context (story summary + premise) from outline field
    if (context?.outline) {
      parts.push(context.outline);
      parts.push('');
    }

    // 2. All previous chapter summaries (each ~150 chars)
    if (context?.previousChapters && context.previousChapters.length > 0) {
      parts.push('【各章摘要】');
      for (const chapter of context.previousChapters) {
        const events = chapter.keyEvents?.length
          ? ` [${chapter.keyEvents.join('、')}]`
          : '';
        parts.push(`第${chapter.index}章「${chapter.title}」: ${chapter.summary}${events}`);
      }
      parts.push('');
    }

    // 3. Relevant characters (up to 5)
    if (context?.characters && context.characters.length > 0) {
      parts.push('【本章出场人物】');
      for (const char of context.characters.slice(0, 5)) {
        if (typeof char === 'object' && 'basicInfo' in char) {
          parts.push(`- ${char.name}（${char.basicInfo?.occupation || ''}）: ${char.personality?.core || ''}`);
        } else {
          // char might be { name, profile } format from getRelevantCharacters
          const c = char as any;
          parts.push(`- ${c.name}: ${(c.profile || '').substring(0, 200)}`);
        }
      }
      parts.push('');
    }

    // 4. RAG retrieval results (relevant passages from any chapter)
    if (context?.relevantMemory && context.relevantMemory.length > 0) {
      parts.push('【相关原文片段（RAG检索）】');
      for (const memory of context.relevantMemory.slice(0, 5)) {
        parts.push(`- ${memory.content.substring(0, 300)}`);
      }
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Extract entities from text
   */
  private extractEntities(text: string): Entity[] {
    const entities: Entity[] = [];
    const matches = text.matchAll(/\[\[([^:]+):([^\]]+)\]\]/g);

    for (const match of matches) {
      const name = match[1].trim();
      const type = match[2].trim() as Entity['type'];

      if (['character', 'location', 'object', 'event', 'organization'].includes(type)) {
        entities.push({
          id: `${type}_${name}`,
          type,
          name,
          properties: {},
        });
      }
    }

    return entities;
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }

  /**
   * Apply skill configuration
   */
  protected override applySkill(skill: SkillConfig): void {
    // Update system prompt based on skill
    if (skill.config.style) {
      const styleNote = `\n\n当前风格设定：
- 语调：${skill.config.style.tone}
- 对话占比：${skill.config.style.dialogueRatio}
- 描写密度：${skill.config.style.descriptionDensity}
- 节奏：${skill.config.style.pacing}`;

      this.systemPrompt = this.buildSystemPrompt() + styleNote;
    }
  }
}

// ============ Types ============

interface WriterOutput extends AgentOutput {
  metadata: {
    type: 'outline' | 'character' | 'chapter' | 'continue' | 'scene';
    wordCount: number;
    newEntities: Entity[];
    tags: string[];
    chapterIndex?: number;
    characterName?: string;
    analysis?: ContinueAnalysis;
  };
}

interface OutlineTask {
  type: 'outline';
  premise: string;
  genre?: string;
  targetChapters?: number;
  targetWordCount?: number;
}

interface CharacterTask {
  type: 'character';
  name: string;
  description?: string;
}

interface ChapterTask {
  type: 'chapter';
  chapterIndex: number;
  chapterOutline?: string;
  targetWordCount?: number;
  groundTruthContext?: string;
  styleContext?: string;
}

interface ContinueTask {
  type: 'continue';
  startText: string;
  direction?: string;
  targetWordCount?: number;
}

interface SceneTask {
  type: 'scene';
  sceneDescription: string;
  characters?: string[];
  purpose?: string;
  targetWordCount?: number;
}

interface ContinueAnalysis {
  style: string;
  setting: string;
  characters: string[];
  possiblePlot: string;
}
