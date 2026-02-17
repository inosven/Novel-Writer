# Skill: 三国悬疑

## Metadata
- **Version**: 1.0.0
- **Author**: NovelWriter Team
- **Genre**: 古装悬疑
- **Language**: zh-CN
- **Created**: 2025-01-20
- **Updated**: 2025-01-20

## Description
专为三国时期古装悬疑小说设计的技能包。融合正史考据与悬疑推理，在权谋斗争的背景下展开探案故事。本技能包提供完整的三国历史背景支持、悬疑结构方法论、古风文笔规范，以及丰富的参考资料。

## Features
- 三国历史背景考据（官制、地理、大事件）
- 悬疑推理结构设计
- 权谋与探案的结合技巧
- 古风对话与描写规范
- 历史人物与虚构角色的平衡处理

## Configuration
```yaml
base:
  targetWordCountPerChapter: "4000-6000"
  chapterCount: "20-30"
  pov: "第三人称"
  tense: "过去时"

style:
  tone: "严肃古朴"
  dialogueRatio: "0.3-0.4"
  descriptionDensity: "高"
  pacing: "中慢"

review:
  strictness: "高"
  focusAreas:
    - "历史准确性"
    - "悬疑逻辑"
    - "人物一致性"
    - "古风文笔"
  ignoredWarnings: []

references:
  required:
    - "ground-truth/三国官制.md"
    - "ground-truth/三国大事年表.md"
  optional:
    - "ground-truth/三国志.md"
    - "style-refs/三国演义片段.md"
    - "style-refs/古风对话范例.md"
```

## Files
| File | Purpose | Required |
|------|---------|----------|
| outline-method.md | 悬疑大纲方法论 | Yes |
| character-method.md | 三国人物设定方法 | Yes |
| writing-method.md | 写作技法指南 | Yes |
| output-style.md | 古风文笔规范 | Yes |
| review-rules.md | 审稿规则 | No |

## Usage
```bash
# 切换到此技能包
/skill use sanguo-xuanyi

# 查看技能包信息
/skill info sanguo-xuanyi

# 列出所有技能包
/skill list
```

## Notes
- 本技能包以东汉末年至三国时期（约184-280年）为背景
- Ground Truth参考以正史为准，不可违背
- Style References可作为文风学习参考，非强制约束
- 涉及真实历史人物时，需注意史实与虚构的平衡

## Changelog
- 1.0.0 (2025-01-20): Initial release
