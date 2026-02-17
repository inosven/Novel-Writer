import { BaseAgent, type AgentInput, type AgentOutput } from './BaseAgent.js';
import type { LLMProvider, Entity, ReviewIssue, ReviewScore } from '../../types/index.js';
import type { KnowledgeGraph, GraphUpdate } from '../../memory/graph/KnowledgeGraph.js';

/**
 * Reviewer Agent - Responsible for reviewing content and validating facts
 * Uses Knowledge Graph for hard fact verification
 */
export class ReviewerAgent extends BaseAgent {
  private graph: KnowledgeGraph;

  constructor(llm: LLMProvider, graph: KnowledgeGraph) {
    super(llm, 'reviewer');
    this.graph = graph;
    this.systemPrompt = this.buildSystemPrompt();
  }

  private buildSystemPrompt(): string {
    return `你是一位严谨的小说编辑，专注于发现和纠正内容中的问题。

你的核心职责：
1. 事实一致性检查 - 验证内容是否符合已建立的事实（年龄、关系、时间线等）
2. 逻辑一致性检查 - 验证情节发展是否合理
3. 人物一致性检查 - 验证人物行为是否符合设定
4. 风格一致性检查 - 验证文风是否统一

问题严重程度定义：
- critical: 严重事实错误，必须修改（如主角年龄从28变成35）
- major: 明显逻辑问题（如下雨天却描述阳光明媚）
- minor: 小问题，建议修改（如称呼不一致）
- suggestion: 改进建议（如某处描写可以更生动）

输出要求：
- 发现问题时必须指出具体位置和内容
- 提供修改建议
- 建议知识图谱更新（新事实）`;
  }

  async execute(input: AgentInput): Promise<ReviewerOutput> {
    const { task, context } = input;
    const reviewTask = task as ReviewTask;

    // 1. Validate against knowledge graph
    const graphValidation = await this.validateAgainstGraph(
      reviewTask.content,
      reviewTask.graphContext
    );

    // 2. LLM-based review
    const llmReview = await this.llmReview(reviewTask, context);

    // 3. Combine results
    const allIssues = [...graphValidation.issues, ...llmReview.issues];
    const overallScore = this.calculateOverallScore(llmReview.scores, graphValidation.issues);

    // 4. Determine if approved
    const hasBlockingIssues = allIssues.some(i => i.severity === 'critical');
    const approved = !hasBlockingIssues && overallScore.overall >= 70;

    return {
      content: this.formatReviewReport(allIssues, overallScore, approved),
      approved,
      score: overallScore,
      issues: allIssues,
      suggestions: llmReview.suggestions,
      graphUpdates: llmReview.graphUpdates,
      metadata: {
        type: 'review',
        issueCount: allIssues.length,
        criticalCount: allIssues.filter(i => i.severity === 'critical').length,
      },
    };
  }

  /**
   * Validate content against knowledge graph
   */
  private async validateAgainstGraph(
    content: string,
    graphContext?: GraphContext
  ): Promise<{ issues: ReviewIssue[] }> {
    const issues: ReviewIssue[] = [];

    if (!graphContext) {
      return { issues };
    }

    // Check each known entity mentioned in content
    for (const entity of graphContext.entities || []) {
      // Check if entity properties match
      for (const [prop, value] of Object.entries(entity.properties)) {
        // Look for contradicting statements in content
        const contradiction = await this.findContradiction(
          content,
          entity.name,
          prop,
          value
        );

        if (contradiction) {
          issues.push({
            severity: 'critical',
            type: 'inconsistency',
            location: contradiction.location,
            quote: contradiction.quote,
            description: `${entity.name}的${prop}与已知事实不符：已知为"${value}"，但文中描述为"${contradiction.claimedValue}"`,
            evidence: [`知识图谱记录: ${entity.name}.${prop} = ${value}`],
            suggestedFix: `将"${contradiction.claimedValue}"修改为"${value}"`,
          });
        }
      }
    }

    // Check timeline consistency
    if (graphContext.timeline && graphContext.timeline.length > 0) {
      const timelineIssues = await this.checkTimeline(content, graphContext.timeline);
      issues.push(...timelineIssues);
    }

    return { issues };
  }

  /**
   * Find contradiction in content for a known fact
   */
  private async findContradiction(
    content: string,
    entityName: string,
    property: string,
    knownValue: unknown
  ): Promise<ContradictionResult | null> {
    const prompt = `
检查以下文本中是否有关于"${entityName}"的"${property}"的描述与已知值"${knownValue}"矛盾：

文本：
${content}

如果发现矛盾，以JSON格式输出：
{
  "found": true,
  "location": "位置描述",
  "quote": "矛盾的原文",
  "claimedValue": "文中声称的值"
}

如果没有矛盾或未提及，输出：
{
  "found": false
}
`;

    const response = await this.complete(prompt, { maxTokens: 200 });
    const result = this.extractJSON<{ found: boolean; location?: string; quote?: string; claimedValue?: string }>(response);

    if (result?.found && result.location && result.quote && result.claimedValue) {
      return {
        location: result.location,
        quote: result.quote,
        claimedValue: result.claimedValue,
      };
    }

    return null;
  }

  /**
   * Check timeline consistency
   */
  private async checkTimeline(
    content: string,
    timeline: TimelineEvent[]
  ): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];

    const prompt = `
检查以下文本的时间线是否与已知事件时间线一致：

【文本】
${content}

【已知时间线】
${timeline.map(e => `- ${e.time}: ${e.name}`).join('\n')}

如果发现时间线冲突，以JSON格式列出：
{
  "conflicts": [
    {
      "location": "文中位置",
      "quote": "相关原文",
      "issue": "问题描述"
    }
  ]
}

如果没有冲突，输出：
{
  "conflicts": []
}
`;

    const response = await this.complete(prompt, { maxTokens: 500 });
    const result = this.extractJSON<{ conflicts: Array<{ location: string; quote: string; issue: string }> }>(response);

    if (result?.conflicts) {
      for (const conflict of result.conflicts) {
        issues.push({
          severity: 'major',
          type: 'timeline_conflict',
          location: conflict.location,
          quote: conflict.quote,
          description: conflict.issue,
          evidence: timeline.map(e => `${e.time}: ${e.name}`),
        });
      }
    }

    return issues;
  }

  /**
   * LLM-based comprehensive review
   */
  private async llmReview(
    task: ReviewTask,
    context?: AgentInput['context']
  ): Promise<LLMReviewResult> {
    const checkRulesText = task.checkRules?.map(r => `- ${r}`).join('\n') || '';

    const prompt = `
请审稿以下内容：

【待审内容】
${task.content}

${context?.characters ? `【人物设定】\n${context.characters.map(c => `- ${c.name}: ${c.personality.core}`).join('\n')}\n` : ''}

${checkRulesText ? `【审查重点】\n${checkRulesText}\n` : ''}

请按以下维度评审并打分（0-100）：

1. 事实一致性（40%权重）
   - 人物属性是否一致
   - 地点描述是否一致
   - 时间线是否合理

2. 逻辑一致性（30%权重）
   - 情节发展是否合理
   - 人物动机是否充分
   - 因果关系是否成立

3. 人物一致性（20%权重）
   - 性格表现是否符合设定
   - 对话风格是否一致
   - 行为模式是否合理

4. 风格一致性（10%权重）
   - 叙述视角是否一致
   - 文风是否统一

以JSON格式输出：
{
  "scores": {
    "factConsistency": 85,
    "logicConsistency": 90,
    "characterConsistency": 80,
    "styleConsistency": 95
  },
  "issues": [
    {
      "severity": "critical|major|minor|suggestion",
      "type": "inconsistency|logic_error|timeline_conflict|character_ooc|style_break",
      "location": "位置",
      "quote": "原文",
      "description": "问题描述",
      "evidence": ["证据"],
      "suggestedFix": "建议修改"
    }
  ],
  "suggestions": ["整体改进建议"],
  "graphUpdates": [
    {
      "action": "add|update",
      "entityId": "实体ID",
      "properties": {"属性": "值"}
    }
  ]
}
`;

    const response = await this.complete(prompt, { maxTokens: 2000 });
    const result = this.extractJSON<LLMReviewResult>(response);

    return result || {
      scores: {
        factConsistency: 70,
        logicConsistency: 70,
        characterConsistency: 70,
        styleConsistency: 70,
      },
      issues: [],
      suggestions: [],
      graphUpdates: [],
    };
  }

  /**
   * Calculate overall score
   */
  private calculateOverallScore(
    scores: ReviewScores,
    graphIssues: ReviewIssue[]
  ): ReviewScore {
    // Deduct for graph-detected issues
    let factDeduction = 0;
    for (const issue of graphIssues) {
      if (issue.severity === 'critical') factDeduction += 20;
      else if (issue.severity === 'major') factDeduction += 10;
    }

    const factConsistency = Math.max(0, scores.factConsistency - factDeduction);

    // Weighted average
    const overall = Math.round(
      factConsistency * 0.4 +
      scores.logicConsistency * 0.3 +
      scores.characterConsistency * 0.2 +
      scores.styleConsistency * 0.1
    );

    return {
      factConsistency,
      logicConsistency: scores.logicConsistency,
      characterConsistency: scores.characterConsistency,
      styleConsistency: scores.styleConsistency,
      overall,
    };
  }

  /**
   * Format review report
   */
  private formatReviewReport(
    issues: ReviewIssue[],
    score: ReviewScore,
    approved: boolean
  ): string {
    const lines: string[] = [
      '# 审稿报告',
      '',
      `## 审核结果：${approved ? '✅ 通过' : '❌ 需要修改'}`,
      '',
      '## 评分',
      `- 事实一致性: ${score.factConsistency}/100`,
      `- 逻辑一致性: ${score.logicConsistency}/100`,
      `- 人物一致性: ${score.characterConsistency}/100`,
      `- 风格一致性: ${score.styleConsistency}/100`,
      `- **综合得分: ${score.overall}/100**`,
      '',
    ];

    if (issues.length > 0) {
      lines.push('## 发现的问题');
      lines.push('');

      const grouped = {
        critical: issues.filter(i => i.severity === 'critical'),
        major: issues.filter(i => i.severity === 'major'),
        minor: issues.filter(i => i.severity === 'minor'),
        suggestion: issues.filter(i => i.severity === 'suggestion'),
      };

      if (grouped.critical.length > 0) {
        lines.push('### 🔴 严重问题（必须修改）');
        for (const issue of grouped.critical) {
          lines.push(`- **${issue.type}**: ${issue.description}`);
          lines.push(`  - 位置: ${issue.location}`);
          lines.push(`  - 原文: "${issue.quote}"`);
          if (issue.suggestedFix) {
            lines.push(`  - 建议: ${issue.suggestedFix}`);
          }
        }
        lines.push('');
      }

      if (grouped.major.length > 0) {
        lines.push('### 🟠 主要问题');
        for (const issue of grouped.major) {
          lines.push(`- **${issue.type}**: ${issue.description}`);
          if (issue.suggestedFix) {
            lines.push(`  - 建议: ${issue.suggestedFix}`);
          }
        }
        lines.push('');
      }

      if (grouped.minor.length > 0) {
        lines.push('### 🟡 次要问题');
        for (const issue of grouped.minor) {
          lines.push(`- ${issue.description}`);
        }
        lines.push('');
      }

      if (grouped.suggestion.length > 0) {
        lines.push('### 💡 改进建议');
        for (const issue of grouped.suggestion) {
          lines.push(`- ${issue.description}`);
        }
        lines.push('');
      }
    } else {
      lines.push('## 未发现问题');
      lines.push('');
    }

    return lines.join('\n');
  }
}

// ============ Types ============

interface ReviewerOutput extends AgentOutput {
  approved: boolean;
  score: ReviewScore;
  issues: ReviewIssue[];
  suggestions: string[];
  graphUpdates: GraphUpdate[];
  metadata: {
    type: 'review';
    issueCount: number;
    criticalCount: number;
  };
}

interface ReviewTask {
  type: 'review';
  content: string;
  graphContext?: GraphContext;
  checkRules?: string[];
}

interface GraphContext {
  entities?: Entity[];
  relationships?: Array<{ from: string; to: string; type: string }>;
  timeline?: TimelineEvent[];
}

interface TimelineEvent {
  time: string;
  name: string;
}

interface ContradictionResult {
  location: string;
  quote: string;
  claimedValue: string;
}

interface ReviewScores {
  factConsistency: number;
  logicConsistency: number;
  characterConsistency: number;
  styleConsistency: number;
}

interface LLMReviewResult {
  scores: ReviewScores;
  issues: ReviewIssue[];
  suggestions: string[];
  graphUpdates: GraphUpdate[];
}
