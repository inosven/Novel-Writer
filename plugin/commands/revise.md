---
description: 修订第 N 章并自动复审。不带说明时按审稿报告的 critical 和 major 修改；带说明时按说明修改
argument-hint: N [修改说明]
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(ls *), Bash(mv *), Read, Agent
---

修订第 $0 章。完整参数：`$ARGUMENTS`。

步骤：

1. 章号 N = 参数的第一个词。不是正整数就提示用法，停止。修改说明 = 第一个词之后的全部内容（可能为空）。
2. 确认 `chapters/Chapter-NN.md` 存在，否则提示先 `/novel:write N`，停止。
3. 修改说明为空时：读 `reviews/Chapter-NN.md`。不存在就提示先 `/novel:review N`，停止。列出其中还没有"已处理"或"未处理"标记的 critical 和 major 条目编号。没有待处理条目就告诉用户，停止。
4. 用 novel:editor 子代理修改。提示词：
   - 按报告修改时："修订第 N 章。按 reviews/Chapter-NN.md 处理以下条目：C1, C2, M1。"
   - 按说明修改时："修订第 N 章。用户要求：（修改说明原文）。"
5. 子代理返回后，记下它给出的改动前后对照。
6. 复审：读 `${CLAUDE_PLUGIN_ROOT}/commands/review.md`，按其步骤 2 到 4 执行一遍（旧报告归档为 `Chapter-NN.vK.md`，重新生成 `reviews/Chapter-NN.md`）。
7. 把第 5 步的前后对照和复审的汇总行、critical 列表一起给用户。复审后 critical 为 0 就加一句：可以 `/novel:finalize N` 定稿；仍有 critical 就加一句：可以再次 `/novel:revise N`。

然后停止。
