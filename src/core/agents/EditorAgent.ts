/**
 * @module src/core/agents/EditorAgent
 * @description 编辑 Agent — 负责内容修订和润色。
 * 支持编辑类型：审稿问题修复(review_fix)、用户指令编辑(user_edit)、
 * 润色(polish)、定向编辑(targeted)。
 * 定向编辑支持 replace/insert_before/insert_after/prepend/append 操作，
 * 使用模糊匹配（精确→空白规范化→子串匹配）定位修改位置。
 */
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
    const novelContext = task.novelContext || '';

    const prompt = `
你是小说编辑。请根据修改要求对原文进行编辑，支持：修改、插入新内容、在开头/末尾添加等任意操作。
修改时必须确保与整部小说的故事背景、角色设定、前后情节保持一致。

${novelContext ? `=== 小说背景信息（仅供参考，不要修改这些内容）===\n${novelContext}=== 背景信息结束 ===\n\n` : ''}【本章原文】
${task.originalContent}

${task.targetLocation ? `【用户选中的文本】\n${task.targetLocation}\n\n` : ''}【修改要求】
${task.userInstructions}

你必须严格按照以下JSON格式输出，不要输出任何其他内容。

每个 change 有一个 type 字段表示操作类型：

\`\`\`json
{
  "summary": "一句话总结修改内容",
  "changes": [
    // 类型1: replace - 替换原文中的一段文字
    { "type": "replace", "search": "原文中要被替换的精确片段（至少20字）", "replace": "替换后的新文本", "reason": "原因" },

    // 类型2: insert_before - 在某段文字前面插入新内容
    { "type": "insert_before", "anchor": "原文中的锚点文字（至少20字）", "content": "要插入的新内容", "reason": "原因" },

    // 类型3: insert_after - 在某段文字后面插入新内容
    { "type": "insert_after", "anchor": "原文中的锚点文字（至少20字）", "content": "要插入的新内容", "reason": "原因" },

    // 类型4: prepend - 在全文开头添加新内容
    { "type": "prepend", "content": "要在开头添加的内容", "reason": "原因" },

    // 类型5: append - 在全文末尾添加新内容
    { "type": "append", "content": "要在末尾添加的内容", "reason": "原因" }
  ]
}
\`\`\`

关键规则：
1. search 和 anchor 必须是原文中【逐字精确存在】的连续片段，不能改动
2. 根据用户需求选择合适的操作类型，不要强行用 replace
3. 可以组合多种操作类型
4. 只输出JSON代码块，不要输出其他文字
`;

    const response = await this.complete(prompt, { maxTokens: 4000 });

    // Parse and apply changes
    const parsed = this.parseChangesResponse(response);
    let content = task.originalContent || '';
    const appliedChanges: ContentChange[] = [];
    const failedChanges: string[] = [];

    for (const change of parsed.changes) {
      const applied = this.applyChange(content, change);
      if (applied !== null) {
        content = applied.content;
        appliedChanges.push(applied.detail);
      } else {
        const desc = change.reason || change.search?.substring(0, 30) || change.anchor?.substring(0, 30) || '未知';
        failedChanges.push(desc);
        console.warn(`[EditorAgent] Change failed to apply: type=${change.type}, search/anchor not found in content`);
      }
    }

    let summaryText = parsed.summary || '';
    if (appliedChanges.length > 0) {
      summaryText = summaryText || `修改了${appliedChanges.length}处`;
    }
    if (failedChanges.length > 0) {
      summaryText += `\n（${failedChanges.length}处修改未能匹配原文，已跳过：${failedChanges.join('、')}）`;
    }
    if (!summaryText) {
      summaryText = '未找到可修改的内容';
    }

    const changeLog: ChangeLog = {
      summary: summaryText.trim(),
      changes: appliedChanges,
      unaddressedIssues: failedChanges,
    };

    return {
      content,
      changes: appliedChanges,
      changeLog,
      metadata: {
        type: 'targeted',
        targetLocation: task.targetLocation,
        changesCount: appliedChanges.length,
      },
    };
  }

  /**
   * Apply a single change operation to content
   */
  private applyChange(content: string, change: any): { content: string; detail: ContentChange } | null {
    const type = change.type || 'replace';
    const reason = change.reason || '';

    switch (type) {
      case 'replace': {
        const search = change.search;
        if (!search) return null;
        const matched = this.fuzzyFind(content, search);
        if (!matched) return null;
        const newContent = content.replace(matched, change.replace || '');
        return {
          content: newContent,
          detail: { location: '替换', original: search.substring(0, 50), revised: (change.replace || '').substring(0, 50), reason },
        };
      }
      case 'insert_before': {
        const anchor = change.anchor;
        if (!anchor) return null;
        const matched = this.fuzzyFind(content, anchor);
        if (!matched) return null;
        const newContent = content.replace(matched, (change.content || '') + matched);
        return {
          content: newContent,
          detail: { location: '插入(前)', original: anchor.substring(0, 30), revised: (change.content || '').substring(0, 50), reason },
        };
      }
      case 'insert_after': {
        const anchor = change.anchor;
        if (!anchor) return null;
        const matched = this.fuzzyFind(content, anchor);
        if (!matched) return null;
        const newContent = content.replace(matched, matched + (change.content || ''));
        return {
          content: newContent,
          detail: { location: '插入(后)', original: anchor.substring(0, 30), revised: (change.content || '').substring(0, 50), reason },
        };
      }
      case 'prepend': {
        const newText = change.content || '';
        if (!newText) return null;
        return {
          content: newText + '\n\n' + content,
          detail: { location: '开头添加', original: '', revised: newText.substring(0, 50), reason },
        };
      }
      case 'append': {
        const newText = change.content || '';
        if (!newText) return null;
        return {
          content: content + '\n\n' + newText,
          detail: { location: '末尾添加', original: '', revised: newText.substring(0, 50), reason },
        };
      }
      default:
        return null;
    }
  }

  /**
   * Fuzzy find a search string in content.
   * Tries exact match first, then whitespace-normalized match,
   * then substring match using the longest unique fragment.
   * Returns the actual matched text from content (for precise replacement), or null.
   */
  private fuzzyFind(content: string, search: string): string | null {
    // 1. Exact match
    if (content.includes(search)) return search;

    // 2. Whitespace-normalized match: collapse all whitespace (spaces, newlines, tabs)
    //    into single spaces for comparison, but return the original text from content.
    const normalizeWS = (s: string) => s.replace(/\s+/g, ' ').trim();
    const normalizedSearch = normalizeWS(search);
    const normalizedContent = normalizeWS(content);
    const normIdx = normalizedContent.indexOf(normalizedSearch);
    if (normIdx !== -1) {
      // Map back to original content position
      return this.mapNormalizedToOriginal(content, normIdx, normalizedSearch.length);
    }

    // 3. Substring match: try first 60% characters of the search as anchor
    const subLen = Math.max(10, Math.floor(search.length * 0.6));
    const subSearch = search.substring(0, subLen);
    if (content.includes(subSearch)) {
      // Found the beginning; now find where the matching region ends
      const startIdx = content.indexOf(subSearch);
      // Take a region roughly the same length as the original search
      const endIdx = Math.min(content.length, startIdx + Math.ceil(search.length * 1.2));
      return content.substring(startIdx, endIdx);
    }

    return null;
  }

  /**
   * Map a position in whitespace-normalized text back to the original text.
   */
  private mapNormalizedToOriginal(original: string, normStart: number, normLen: number): string {
    let normPos = 0;
    let origStart = -1;
    let origEnd = -1;
    let i = 0;

    // Skip leading whitespace in original
    while (i < original.length && normPos < normStart) {
      if (/\s/.test(original[i])) {
        // In normalized form, consecutive whitespace = 1 space
        if (i === 0 || !/\s/.test(original[i - 1])) {
          normPos++;
        }
      } else {
        normPos++;
      }
      i++;
    }
    origStart = i;

    // Now advance normLen characters in normalized space
    let consumed = 0;
    while (i < original.length && consumed < normLen) {
      if (/\s/.test(original[i])) {
        if (i === 0 || !/\s/.test(original[i - 1])) {
          consumed++;
        }
      } else {
        consumed++;
      }
      i++;
    }
    origEnd = i;

    if (origStart >= 0 && origEnd > origStart) {
      return original.substring(origStart, origEnd);
    }
    return original.substring(origStart, Math.min(original.length, origStart + normLen));
  }

  /**
   * Parse AI response to extract changes JSON
   */
  private parseChangesResponse(response: string): { summary: string; changes: any[] } {
    const defaultResult = { summary: '', changes: [] };

    // Try to extract JSON from code block
    const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch?.[1]?.trim();

    if (!jsonStr) {
      // Try to find raw JSON object
      const rawMatch = response.match(/\{[\s\S]*"changes"[\s\S]*\}/);
      if (!rawMatch) return defaultResult;
      try {
        const parsed = JSON.parse(rawMatch[0]);
        return { summary: parsed.summary || '', changes: Array.isArray(parsed.changes) ? parsed.changes : [] };
      } catch {
        return defaultResult;
      }
    }

    try {
      const parsed = JSON.parse(jsonStr);
      return { summary: parsed.summary || '', changes: Array.isArray(parsed.changes) ? parsed.changes : [] };
    } catch {
      return defaultResult;
    }
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
  novelContext?: string;
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
