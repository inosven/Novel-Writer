import { BaseAgent, type AgentInput, type AgentOutput } from './BaseAgent.js';
import type { LLMProvider, SkillConfig, Character, ChapterOutline } from '../../types/index.js';

/**
 * Planner Agent - Responsible for dialogue-based planning
 * Handles outline creation, character design, and story structure
 */
export class PlannerAgent extends BaseAgent {
  constructor(llm: LLMProvider) {
    super(llm, 'planner');
    this.systemPrompt = this.buildSystemPrompt();
  }

  private buildSystemPrompt(): string {
    return `你是一位经验丰富的故事策划师，擅长帮助作者构建故事架构。

你的核心能力：
1. 需求收集 - 通过对话了解作者的创作意图
2. 大纲设计 - 设计完整的故事结构和情节走向
3. 角色规划 - 设计有深度的角色体系
4. 迭代优化 - 根据反馈不断完善计划

工作方式：
- 循序渐进地提问，不要一次问太多
- 给出具体建议，而不是泛泛而谈
- 每次输出后询问作者意见
- 灵活调整以适应作者偏好

输出要求：
- 结构清晰，易于理解
- 保持专业但不生硬
- 适时给出创意建议`;
  }

  async execute(input: AgentInput): Promise<PlannerOutput> {
    const { task, context, skill } = input;
    const planTask = task as PlanTask;

    // Apply skill if provided
    if (skill) {
      this.applySkill(skill);
    }

    switch (planTask.planType) {
      case 'collect_requirements':
        return this.collectRequirements(planTask, skill);

      case 'generate_outline_draft':
        return this.generateOutlineDraft(planTask, skill);

      case 'refine_outline':
        return this.refineOutline(planTask, skill);

      case 'suggest_characters':
        return this.suggestCharacters(planTask, context, skill);

      case 'design_character':
        return this.designCharacter(planTask, skill);

      case 'analyze_impact':
        return this.analyzeImpact(planTask, context);

      default:
        throw new Error(`Unknown plan type: ${planTask.planType}`);
    }
  }

  /**
   * Collect requirements through questions
   */
  private async collectRequirements(
    task: PlanTask,
    skill?: SkillConfig
  ): Promise<PlannerOutput> {
    const existingAnswers = task.existingAnswers || {};
    const answeredQuestions = Object.keys(existingAnswers);
    console.log('[PlannerAgent.collectRequirements] existingAnswers:', JSON.stringify(existingAnswers, null, 2));
    console.log('[PlannerAgent.collectRequirements] number of answers:', answeredQuestions.length);

    // Format answers as conversation history
    const answerList = Object.values(existingAnswers);
    const roundCount = answerList.length;

    // Build conversation context - include both initial idea and all follow-up responses
    let conversationContext = '';
    if (answerList.length > 0) {
      conversationContext = `

【用户的后续补充和回答】
${answerList.map((a, i) => `第${i + 1}轮回复: "${a}"`).join('\n')}

重要：以上是用户对你之前提问的回答。请基于这些信息继续，不要重复问已经回答过的问题！`;
    }

    const prompt = `
你正在帮助用户规划一个故事。这是一个创意讨论过程，请耐心与用户深入探讨。

【用户的初始故事想法】
"${task.userIdea}"
${conversationContext}
${skill?.metadata?.genre ? `\n【参考题材】${skill.metadata.genre}` : ''}

【当前状态】
- 已进行 ${roundCount} 轮对话

【你的任务】
1. 首先，总结你对这个故事的理解（在summary字段中）
2. 判断是否可以开始创建大纲：
   - 只有当用户明确表示"可以了"、"开始写大纲"、"准备好了"等类似意思时，才设置 readyToOutline 为 true
   - 否则继续提问，帮助用户完善故事构思
   - 不要自作主张认为信息足够，让用户决定何时结束讨论
3. 根据用户的回答，提出深入的后续问题，探讨角色动机、情节细节、世界观设定等

以JSON格式输出（只输出JSON，不要其他内容）：
{
  "readyToOutline": true或false,
  "questions": ["深入问题1", "深入问题2"],
  "summary": "我理解你想写的故事是关于...",
  "suggestions": ["创意建议1"]
}
`;

    // Reasoning models need more tokens because thinking + response share the limit
    const response = await this.complete(prompt, { maxTokens: 16000 });
    console.log('[PlannerAgent.collectRequirements] LLM raw response:', response);

    const result = this.extractJSON<CollectResult>(response);
    console.log('[PlannerAgent.collectRequirements] Extracted JSON result:', JSON.stringify(result, null, 2));

    if (!result) {
      console.error('[PlannerAgent.collectRequirements] JSON extraction FAILED! Using fallback.');
    }

    return {
      content: response,
      planType: 'collect_requirements',
      result: result || {
        readyToOutline: false,
        questions: ['请描述您想讲述的故事主题'],
        summary: '',
        suggestions: [],
      },
      metadata: {
        questionsAsked: result?.questions.length || 0,
        readyToOutline: result?.readyToOutline || false,
      },
    };
  }

  /**
   * Generate initial outline draft
   */
  private async generateOutlineDraft(
    task: PlanTask,
    skill?: SkillConfig
  ): Promise<PlannerOutput> {
    const methodology = skill?.files?.outlineMethod || '';
    const template = skill?.files?.templates?.outline || '';

    const prompt = `
根据以下信息创建故事大纲：

【用户想法 - 这是本故事的核心，所有角色和情节必须完全基于此】
${task.userIdea}

【收集的需求】
${JSON.stringify(task.existingAnswers || {}, null, 2)}

${methodology ? `【大纲方法论 - 仅参考结构设计方法，不要使用其中的示例角色】\n${methodology}\n` : ''}
${template ? `【大纲模板 - 仅参考输出格式，不要使用模板中的示例角色名】\n${template}\n` : ''}

${task.constraints ? `【约束条件】\n${task.constraints.map(c => `- ${c}`).join('\n')}\n` : ''}

重要说明：
- 所有角色名称、人物关系、情节内容必须完全根据【用户想法】原创
- 方法论和模板中如有示例角色名（如陈平、曹操等），这些只是格式示例，绝对不要在大纲中使用
- 只使用用户在【用户想法】和【收集的需求】中提到的角色

请创建一个完整的故事大纲，包含：
1. 故事主题和核心冲突
2. 故事结构（三幕式或其他）
3. 主要情节点
4. 章节划分（每章简要说明）

以Markdown格式输出大纲，然后以JSON格式输出元数据：

\`\`\`json
{
  "title": "建议的标题",
  "theme": "主题",
  "genre": "类型",
  "estimatedChapters": 20,
  "keyConflicts": ["冲突1", "冲突2"],
  "suggestedCharacterRoles": ["角色定位1", "角色定位2"]
}
\`\`\`
`;

    const response = await this.complete(prompt, { maxTokens: 16000 });
    console.log('[PlannerAgent.generateOutlineDraft] Response length:', response.length);
    console.log('[PlannerAgent.generateOutlineDraft] Response first 500 chars:', response.substring(0, 500));

    // Extract outline content - remove any code blocks and markdown fences
    let outlineContent = response;

    // Remove ```json...``` blocks (metadata)
    const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
    outlineContent = response.replace(/```json[\s\S]*?```/g, '').trim();

    // Also remove leading/trailing ``` markers if the whole response is wrapped
    outlineContent = outlineContent.replace(/^```(?:markdown)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();

    const metadata = jsonMatch ? this.extractJSON<OutlineDraftMeta>(jsonMatch[0]) : null;

    console.log('[PlannerAgent.generateOutlineDraft] Outline content length:', outlineContent.length);
    console.log('[PlannerAgent.generateOutlineDraft] Has metadata:', !!metadata);

    // If outline is empty but we have raw response, use it
    if (!outlineContent && response) {
      outlineContent = response;
      console.log('[PlannerAgent.generateOutlineDraft] Using raw response as outline');
    }

    return {
      content: outlineContent,
      planType: 'generate_outline_draft',
      result: {
        outline: outlineContent,
        metadata: metadata || {},
      },
      metadata: {
        chaptersPlanned: metadata?.estimatedChapters || 0,
        characterRolesNeeded: metadata?.suggestedCharacterRoles?.length || 0,
      },
    };
  }

  /**
   * Refine outline based on feedback
   */
  private async refineOutline(
    task: PlanTask,
    skill?: SkillConfig
  ): Promise<PlannerOutput> {
    const prompt = `
根据用户反馈修改大纲：

【当前大纲】
${task.currentOutline}

【用户反馈】
${task.userFeedback}

${task.specificChanges ? `【具体修改要求】\n${task.specificChanges.map(c => `- ${c}`).join('\n')}\n` : ''}

请：
1. 理解用户的修改意图
2. 对大纲进行相应调整
3. 说明修改了哪些部分

输出修改后的完整大纲，并说明主要变更。
`;

    const response = await this.complete(prompt, { maxTokens: 16000 });

    return {
      content: response,
      planType: 'refine_outline',
      result: {
        refinedOutline: response,
        changesApplied: true,
      },
      metadata: {
        feedbackIncorporated: true,
      },
    };
  }

  /**
   * Suggest characters based on outline
   */
  private async suggestCharacters(
    task: PlanTask,
    context?: AgentInput['context'],
    skill?: SkillConfig
  ): Promise<PlannerOutput> {
    const characterMethod = skill?.files?.characterMethod || '';

    const prompt = `
根据以下故事大纲，建议需要创建的角色：

【故事大纲 - 角色必须来自此大纲】
${task.currentOutline || context?.outline}

${characterMethod ? `【角色设计方法 - 仅参考设计方法，不要使用方法中的示例角色名】\n${characterMethod}\n` : ''}

重要说明：
- 只从【故事大纲】中提取或推断角色
- 如果大纲中已有角色名（如姜维、邓艾等），必须使用这些名字
- 角色设计方法中的示例角色名（如陈平、曹操等）只是格式示例，绝对不要使用

请建议故事所需的角色，包括：
1. 主角（1-2个）
2. 重要配角（3-5个）
3. 次要角色（根据需要）

以JSON格式输出：
{
  "characters": [
    {
      "name": "使用大纲中的角色名，或为大纲需要但未命名的角色建议符合时代的名字",
      "role": "protagonist/deuteragonist/antagonist/supporting",
      "importance": "主要/次要",
      "briefDescription": "简要描述",
      "suggestedTraits": ["特点1", "特点2"],
      "relationToPlot": "与主线的关系"
    }
  ],
  "relationshipSuggestions": [
    {
      "char1": "角色1",
      "char2": "角色2",
      "relationship": "关系类型"
    }
  ]
}
`;

    const response = await this.complete(prompt, { maxTokens: 16000 });
    const result = this.extractJSON<CharacterSuggestions>(response);

    return {
      content: response,
      planType: 'suggest_characters',
      result: result || { characters: [], relationshipSuggestions: [] },
      metadata: {
        charactersNeeded: result?.characters.length || 0,
        mainCharacters: result?.characters.filter(c => c.role === 'protagonist').length || 0,
      },
    };
  }

  /**
   * Design a specific character in detail
   */
  private async designCharacter(
    task: PlanTask,
    skill?: SkillConfig
  ): Promise<PlannerOutput> {
    const characterMethod = skill?.files?.characterMethod || '';
    const template = skill?.files?.templates?.character || '';

    const prompt = `
为故事设计详细的角色：

【角色基本信息】
- 名字: ${task.characterName}
- 角色定位: ${task.characterRole || '待定'}
- 简要描述: ${task.characterBrief || '待定'}

【故事背景】
${task.currentOutline || '（无大纲）'}

${characterMethod ? `【角色设计方法】\n${characterMethod}\n` : ''}
${template ? `【人物小传模板】\n${template}\n` : ''}

${task.userRequirements ? `【用户特殊要求】\n${task.userRequirements}\n` : ''}

请设计完整的人物小传，包含：
1. 基础信息（年龄、性别、职业、外貌）
2. 性格特点（核心性格、优缺点、说话方式）
3. 背景故事
4. 人物关系（与其他角色的关系）
5. 角色弧光（起点→转变→终点）
6. 在故事中的作用

以Markdown格式输出人物小传。
`;

    const response = await this.complete(prompt, { maxTokens: 16000 });

    return {
      content: response,
      planType: 'design_character',
      result: {
        characterProfile: response,
        characterName: task.characterName,
      },
      metadata: {
        characterName: task.characterName,
        hasArc: response.includes('角色弧光') || response.includes('弧光'),
      },
    };
  }

  /**
   * Analyze impact of outline/character changes
   */
  private async analyzeImpact(
    task: PlanTask,
    context?: AgentInput['context']
  ): Promise<PlannerOutput> {
    const prompt = `
分析以下修改对已写内容的影响：

【修改类型】
${task.changeType}

【修改内容】
${task.changeDescription}

【当前大纲】
${task.currentOutline || context?.outline || '无'}

【已写章节数】
${task.writtenChapters || 0}章

请分析：
1. 这个修改会影响哪些已写内容？
2. 需要修改的章节列表
3. 潜在的一致性风险
4. 建议的处理方式

以JSON格式输出：
{
  "impactLevel": "high/medium/low/none",
  "affectedChapters": [1, 3, 5],
  "consistencyRisks": ["风险1", "风险2"],
  "recommendations": ["建议1", "建议2"],
  "proceedWithCaution": true/false
}
`;

    const response = await this.complete(prompt, { maxTokens: 16000 });
    const result = this.extractJSON<ImpactAnalysis>(response);

    return {
      content: response,
      planType: 'analyze_impact',
      result: result || {
        impactLevel: 'unknown',
        affectedChapters: [],
        consistencyRisks: [],
        recommendations: [],
        proceedWithCaution: true,
      },
      metadata: {
        impactLevel: result?.impactLevel || 'unknown',
        affectedChaptersCount: result?.affectedChapters?.length || 0,
      },
    };
  }

  /**
   * Apply skill configuration
   */
  protected override applySkill(skill: SkillConfig): void {
    if (skill.metadata.genre) {
      this.systemPrompt = this.buildSystemPrompt() + `\n\n当前创作题材：${skill.metadata.genre}`;
    }
  }
}

// ============ Types ============

interface PlannerOutput extends AgentOutput {
  planType: string;
  result: unknown;
  metadata: Record<string, unknown>;
}

interface PlanTask {
  type: 'plan';
  planType: 'collect_requirements' | 'generate_outline_draft' | 'refine_outline' |
            'suggest_characters' | 'design_character' | 'analyze_impact';
  userIdea?: string;
  existingAnswers?: Record<string, string>;
  constraints?: string[];
  currentOutline?: string;
  userFeedback?: string;
  specificChanges?: string[];
  characterName?: string;
  characterRole?: string;
  characterBrief?: string;
  userRequirements?: string;
  changeType?: string;
  changeDescription?: string;
  writtenChapters?: number;
}

interface CollectResult {
  readyToOutline: boolean;
  questions: string[];
  summary: string;
  suggestions: string[];
}

interface OutlineDraftMeta {
  title: string;
  theme: string;
  genre: string;
  estimatedChapters: number;
  keyConflicts: string[];
  suggestedCharacterRoles: string[];
}

interface CharacterSuggestions {
  characters: Array<{
    name: string;
    role: string;
    importance: string;
    briefDescription: string;
    suggestedTraits: string[];
    relationToPlot: string;
  }>;
  relationshipSuggestions: Array<{
    char1: string;
    char2: string;
    relationship: string;
  }>;
}

interface ImpactAnalysis {
  impactLevel: 'high' | 'medium' | 'low' | 'none' | 'unknown';
  affectedChapters: number[];
  consistencyRisks: string[];
  recommendations: string[];
  proceedWithCaution: boolean;
}
