import { BaseAgent, type AgentInput, type AgentOutput } from './BaseAgent.js';
import type { LLMProvider, ReviewIssue, SkillConfig } from '../../types/index.js';

/**
 * Editor Agent - Responsible for revising and polishing content
 * Based on review feedback and user instructions
 */
export class EditorAgent extends BaseAgent {
  constructor(llm: LLMProvider) {
    super(llm, 'editor');
    this.systemPrompt = this.buildSystemPrompt();
  }

  private buildSystemPrompt(): string {
    return `你是一位资深的文字编辑，擅长在保持作者风格的同时改进文本质量。

你的核心能力：
1. 内容修订 - 根据审稿反馈修改问题
2. 风格润色 - 提升文字质量，保持风格一致
3. 对话精炼 - 让对话更自然、更有个性
4. 节奏调整 - 优化叙述节奏

编辑原则：
- 最小化改动：只改必须改的
- 保持风格：保留原作者的语气和风格
- 优先解决严重问题：critical > major > minor
- 记录所有变更：便于追踪

输出要求：
- 修改后的完整内容
- 变更日志（修改了什么、为什么）`;
  }

  async execute(input: AgentInput): Promise<EditorOutput> {
    const { task, context, skill } = input;
    const editTask = task as EditTask;

    // Apply skill if provided
    if (skill) {
      this.applySkill(skill);
    }

    switch (editTask.editType) {
      case 'review_fix':
        return this.fixReviewIssues(editTask, skill);

      case 'user_edit':
        return this.userDirectedEdit(editTask, skill);

      case 'polish':
        return this.polish(editTask, skill);

      case 'targeted':
        return this.targetedEdit(editTask, skill);

      default:
        throw new Error(`Unknown edit type: ${editTask.editType}`);
    }
  }

  /**
   * Fix issues identified by the Reviewer
   */
  private async fixReviewIssues(
    task: EditTask,
    skill?: SkillConfig
  ): Promise<EditorOutput> {
    const issues = task.reviewFeedback?.issues || [];
    const styleGuide = skill?.files.outputStyle || task.styleGuide || '';

    // Sort issues by severity
    const sortedIssues = [...issues].sort((a, b) => {
      const severityOrder = { critical: 0, major: 1, minor: 2, suggestion: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    // Build issue list for prompt
    const issueList = sortedIssues.map((issue, i) => `
问题${i + 1} [${issue.severity}/${issue.type}]:
- 位置: ${issue.location}
- 原文: "${issue.quote}"
- 问题: ${issue.description}
${issue.suggestedFix ? `- 建议修改: ${issue.suggestedFix}` : ''}
`).join('\n');

    const prompt = `
请根据审稿反馈修改以下内容：

【原始内容】
${task.originalContent}

【需要解决的问题】
${issueList}

${styleGuide ? `【风格指南】\n${styleGuide}\n` : ''}

修改要求：
1. 优先解决 critical 和 major 问题
2. 保持原文的风格和语气
3. 最小化改动，只改必须改的
4. 保持段落结构和叙述节奏

请输出：
1. 修改后的完整内容（用 \`\`\`markdown ... \`\`\` 包裹）
2. 变更日志（JSON格式）

变更日志格式：
\`\`\`json
{
  "summary": "修改摘要",
  "changes": [
    {
      "location": "位置",
      "original": "原文",
      "revised": "修改后",
      "reason": "修改原因",
      "issueAddressed": "解决的问题编号"
    }
  ],
  "unaddressedIssues": ["未解决的问题及原因"]
}
\`\`\`
`;

    const response = await this.complete(prompt, { maxTokens: 8000 });

    // Parse response
    const { content, changeLog } = this.parseEditResponse(response);

    return {
      content,
      changes: changeLog.changes,
      changeLog,
      metadata: {
        type: 'review_fix',
        changesCount: changeLog.changes.length,
        issuesAddressed: changeLog.changes.map(c => c.issueAddressed).filter(Boolean).length,
        issuesTotal: issues.length,
      },
    };
  }

  /**
   * User-directed specific edit
   */
  private async userDirectedEdit(
    task: EditTask,
    skill?: SkillConfig
  ): Promise<EditorOutput> {
    const styleGuide = skill?.files.outputStyle || task.styleGuide || '';

    const prompt = `
根据用户指示修改以下内容：

【原始内容】
${task.originalContent}

【用户指示】
${task.userInstructions}

${task.relevantContext ? `【相关上下文】\n${task.relevantContext.join('\n---\n')}\n` : ''}

${styleGuide ? `【风格指南】\n${styleGuide}\n` : ''}

修改要求：
1. 准确理解用户意图
2. 精确定位需要修改的部分
3. 保持其他部分不变
4. 保持整体风格一致

请输出：
1. 修改后的完整内容（用 \`\`\`markdown ... \`\`\` 包裹）
2. 变更日志（JSON格式）
`;

    const response = await this.complete(prompt, { maxTokens: 8000 });

    const { content, changeLog } = this.parseEditResponse(response);

    return {
      content,
      changes: changeLog.changes,
      changeLog,
      metadata: {
        type: 'user_edit',
        changesCount: changeLog.changes.length,
        userInstruction: task.userInstructions,
      },
    };
  }

  /**
   * Polish and improve content
   */
  private async polish(
    task: EditTask,
    skill?: SkillConfig
  ): Promise<EditorOutput> {
    const styleGuide = skill?.files.outputStyle || '';
    const styleExamples = skill?.files.examples.chapter || '';

    const prompt = `
请润色以下内容，提升文字质量：

【原始内容】
${task.originalContent}

${styleGuide ? `【风格指南】\n${styleGuide}\n` : ''}
${styleExamples ? `【风格参考】\n${styleExamples.substring(0, 1000)}...\n` : ''}

润色重点：
${task.polishFocus?.map(f => `- ${f}`).join('\n') || '- 整体提升文字质量'}

润色原则：
1. 保持原意不变
2. 提升描写的画面感
3. 让对话更自然
4. 优化句式和节奏
5. 不要过度修饰

请输出：
1. 润色后的完整内容（用 \`\`\`markdown ... \`\`\` 包裹）
2. 主要修改说明（简要）
`;

    const response = await this.complete(prompt, { maxTokens: 8000, temperature: 0.6 });

    const { content, changeLog } = this.parseEditResponse(response);

    return {
      content,
      changes: changeLog.changes,
      changeLog: {
        ...changeLog,
        summary: '润色优化',
      },
      metadata: {
        type: 'polish',
        changesCount: changeLog.changes.length,
      },
    };
  }

  /**
   * Targeted edit for specific location
   */
  private async targetedEdit(
    task: EditTask,
    skill?: SkillConfig
  ): Promise<EditorOutput> {
    const prompt = `
修改以下内容的特定部分：

【原始内容】
${task.originalContent}

【目标位置】
${task.targetLocation}

【修改要求】
${task.userInstructions}

请：
1. 精确定位目标位置
2. 按要求进行修改
3. 确保修改后的内容与前后文衔接自然

输出修改后的完整内容和变更说明。
`;

    const response = await this.complete(prompt, { maxTokens: 6000 });

    const { content, changeLog } = this.parseEditResponse(response);

    return {
      content,
      changes: changeLog.changes,
      changeLog,
      metadata: {
        type: 'targeted',
        targetLocation: task.targetLocation,
        changesCount: changeLog.changes.length,
      },
    };
  }

  /**
   * Parse edit response to extract content and change log
   */
  private parseEditResponse(response: string): { content: string; changeLog: ChangeLog } {
    // Extract markdown content
    const contentMatch = response.match(/```markdown\s*([\s\S]*?)```/);
    const content = contentMatch?.[1]?.trim() || response;

    // Extract JSON change log
    const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
    let changeLog: ChangeLog = {
      summary: '',
      changes: [],
      unaddressedIssues: [],
    };

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        changeLog = {
          summary: parsed.summary || '',
          changes: parsed.changes || [],
          unaddressedIssues: parsed.unaddressedIssues || [],
        };
      } catch {
        // Failed to parse JSON, use default
      }
    }

    return { content, changeLog };
  }

  /**
   * Apply skill configuration
   */
  protected override applySkill(skill: SkillConfig): void {
    // Editor uses style guide heavily
    if (skill.files.outputStyle) {
      this.systemPrompt = this.buildSystemPrompt() + `\n\n【当前风格规范】\n${skill.files.outputStyle.substring(0, 500)}...`;
    }
  }
}

// ============ Types ============

interface EditorOutput extends AgentOutput {
  changes: ContentChange[];
  changeLog: ChangeLog;
  metadata: {
    type: 'review_fix' | 'user_edit' | 'polish' | 'targeted';
    changesCount: number;
    issuesAddressed?: number;
    issuesTotal?: number;
    userInstruction?: string;
    targetLocation?: string;
  };
}

interface EditTask {
  type: 'edit';
  editType: 'review_fix' | 'user_edit' | 'polish' | 'targeted';
  originalContent: string;
  reviewFeedback?: {
    issues: ReviewIssue[];
  };
  userInstructions?: string;
  styleGuide?: string;
  relevantContext?: string[];
  polishFocus?: string[];
  targetLocation?: string;
}

interface ContentChange {
  location: string;
  original: string;
  revised: string;
  reason: string;
  issueAddressed?: string;
}

interface ChangeLog {
  summary: string;
  changes: ContentChange[];
  unaddressedIssues: string[];
}
