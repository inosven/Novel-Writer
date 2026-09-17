---
description: 修订第 N 章。不带说明时按审稿报告的 critical 和 major 修改；带说明时按说明修改
argument-hint: N [修改说明]
disable-model-invocation: true
allowed-tools: Read, Agent
---

修订第 $0 章。完整参数：`$ARGUMENTS`。

步骤：

1. 章号 N = 参数的第一个词。不是正整数就提示用法，停止。修改说明 = 第一个词之后的全部内容（可能为空）。
2. 确认 `chapters/Chapter-NN.md` 存在，否则提示先 `/novel:write N`，停止。
3. 修改说明为空时：读 `reviews/Chapter-NN.md`。不存在就提示先 `/novel:review N`，停止。列出其中还没有"已处理"或"未处理"标记的 critical 和 major 条目编号。没有待处理条目就告诉用户，停止。
4. 用 novel:editor 子代理修改。提示词：
   - 按报告修改时："修订第 N 章。按 reviews/Chapter-NN.md 处理以下条目：C1, C2, M1。"
   - 按说明修改时："修订第 N 章。用户要求：（修改说明原文）。"
5. 子代理返回后，把改动的前后对照原样转述给用户，加一句：可以再次 `/novel:review N` 复查，或 `/novel:finalize N` 定稿。

然后停止。
