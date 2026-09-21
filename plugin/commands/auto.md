---
description: 连续写到第 N 章：每章写、审、修、复审、定稿，复审后仍有 critical 才停下
argument-hint: N
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(ls *), Bash(mv *), Read, Agent
---

连续写到第 $0 章。

这是无人值守模式：四个单步命令里所有"问用户"的地方在这里都不问，改为按下面的固定规则处理。每一步的具体做法以对应命令文件为准，先用 Read 读它，再照其步骤执行。

准备：

1. 目标章号 N = `$0`。不是正整数就提示用法 `/novel:auto N`，停止。
2. 读 `bible/state.md` 第一行取账本截至章 M。M 不小于 N 就告诉用户"账本已截至第 M 章，没有要写的章"，停止。起始章 S = M + 1。
3. 读 `${CLAUDE_PLUGIN_ROOT}/commands/write.md`、`review.md`、`revise.md`、`finalize.md` 各一遍，后面按它们的步骤做。

对每一章 C，从 S 到 N，依次：

1. **写**。`chapters/Chapter-CC.md` 不存在就按 write.md 的步骤写；已存在就当作现成草稿，跳过写，不问是否覆盖。
2. **审**。按 review.md 的步骤审（已有报告先归档）。
3. **修**。报告里有 critical 或 major 就按 revise.md 的步骤修；revise 自带复审。没有就跳过。
4. **判**。取最新的 `reviews/Chapter-CC.md`：critical 为 0 就继续；仍有 critical 就停下，进入"结束"，不定稿。
5. **定稿**。按 finalize.md 的步骤定稿，跳过它的软检查（第 4 步已确认 critical 为 0）。bible-check 失败也停下，进入"结束"。
6. 进入下一章。

每章只修一轮。修一轮后仍有 critical，说明问题需要作者判断，不要再自动修第二轮。

结束（跑完 N 章，或中途停下）时给用户一张表和几行说明：

```
| 章 | 字数 | 审稿 critical / major / minor / suggestion | 修订 | 结果 |
|---|---|---|---|---|
| 4 | 4120 | 首审 1/2/3/4，复审 0/1/3/4 | C1, M1, M2 | 已定稿 |
| 5 | 3980 | 首审 2/0/2/3，复审 1/0/2/3 | C1, C2 | 停：复审仍有 critical |

停在第 5 章。未处理的 critical：
- C2 ……（一句话标题）
报告在 reviews/Chapter-05.md，上一版在 Chapter-05.v1.md。处理后运行 /novel:finalize 5，再 /novel:auto N 继续。
```

全部完成时最后一行写：账本截至第 N 章，下一步 `/novel:auto N+k` 或 `/novel:write N+1`。

然后停止。
