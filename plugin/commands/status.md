---
description: 显示小说进度：章数、已写、已定稿、账本截至章、未收伏笔、各章字数
disable-model-invocation: true
allowed-tools: Bash(cat *), Bash(ls *), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Read, Glob
---

在当前目录（必须是小说目录，含 novel.yaml）汇总进度，只读不写。

步骤：

1. 读 `novel.yaml`，取书名和字数区间。没有这个文件就告诉用户先运行 `/novel:init`，然后停止。
2. 数 `outline.md` 里 `### 第N章` 的数量，得到计划章数。
3. 列出 `chapters/Chapter-*.md`，对每个文件运行 `${CLAUDE_PLUGIN_ROOT}/scripts/wordcount.sh` 得到字数。
4. 列出 `summaries/Chapter-*.md`，得到已定稿章号。
5. 读 `bible/state.md` 第一行取"截至第N章"。运行 `${CLAUDE_PLUGIN_ROOT}/scripts/bible-check.sh`，记录通过或失败。
6. 读 `bible/threads.md`，取状态为"未收"的行。
7. 读 `notes.md`（如有），数状态为"未处理"的批注。

输出一张表和几行摘要：

```
《书名》 计划 X 章 · 已写 Y 章 · 已定稿 Z 章 · 账本截至第 N 章（校验通过/失败）

| 章 | 标题 | 字数 | 状态 |
|---|---|---|---|
| 1 | …… | 4213 | 已定稿 |
| 2 | …… | 3980 | 已审稿 / 草稿 / 未写 |

未处理批注：X 条（A2, A5）。运行 /novel:read 查看，/novel:revise N 处理。
未收伏笔：
- T1 …… （引入第2章，预计第8章）

下一步：/novel:write N   （N = 账本截至章 + 1）
```

状态判定：有 `summaries/` 为已定稿；否则有 `reviews/` 为已审稿；否则有 `chapters/` 为草稿；否则未写。
