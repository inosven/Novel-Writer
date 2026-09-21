---
description: 对话式规划：大纲、角色档案、账本初始内容。可重复运行以修改已有大纲
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Read, Write, Edit, Glob
---

在主对话里和作者一起规划这部小说。这是一个多轮对话，不要一口气做完，每一步都等作者回应。

准备：

1. 读 `novel.yaml` 取题材包名 PACK 和字数区间。没有就提示先 `/novel:init`，停止。
2. 读 `.claude/skills/PACK/outline-method.md` 和 `character-method.md`，后面按它们的方法工作。
3. 如果 `outline.md` 已存在，读它，问作者是要修改还是重来。修改就跳到第三阶段按作者的要求用 Edit 改；重来就继续。

第一阶段：讨论。

按 outline-method.md 的提问顺序，一次问一个问题，用普通对话问（开放式问题不要用选择题工具）。作者的每个回答之后，用两三句话复述你目前对故事的理解，再问下一个。作者说"可以了""开始写大纲"之类的话之前不要停止提问，也不要自作主张认为信息够了。

第二阶段：大纲。

按 outline-method.md 的结构写 `outline.md`，格式：

```markdown
# 书名

## 故事前提
（三到五句）

## 主题
（一两句）

## 章节大纲

### 第1章: 标题
**摘要**: ……
**关键事件**:
- ……
**出场角色**: 名字, 名字
```

写完给作者看，按反馈用 Edit 改，直到作者满意。

第三阶段：角色。

从大纲的"出场角色"里汇总所有名字。按 character-method.md 逐个写 `characters/<名字>.md`，每写完一个给作者看一眼，作者有意见就改。

第四阶段：账本初始化。

按 story-bible skill 的格式：
- `bible/facts.md`：从大纲和角色档案里抄固定属性、地点、物品、规则。
- `bible/state.md`：第一行 `# 故事状态（截至第0章）`，每个角色一块，写故事开始时的所在、处境、所知、所持、伤病。
- `bible/threads.md`：大纲里已经安排的伏笔，填引入章和预计回收章。
- `bible/timeline.md`：只留 `# 时间线` 标题。

运行 `${CLAUDE_PLUGIN_ROOT}/scripts/bible-check.sh`，通过后告诉作者：规划完成，下一步 `/novel:write 1`。
