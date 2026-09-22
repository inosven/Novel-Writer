---
description: 修订第 N 章并自动复审。不带说明时按审稿报告的 critical 和 major 修改；带说明时按说明修改
argument-hint: N [模型] [修改说明]
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(ls *), Bash(mv *), Read, Agent
---

修订第 $0 章。完整参数：`$ARGUMENTS`。

步骤：

1. 章号 N = 参数的第一个词。不是正整数就提示用法，停止。模型覆盖串 = 第二个词，仅当它是裸模型名（opus / sonnet / haiku / fable / inherit）或 `角色=模型` 形式（可用逗号连多个）时才算，否则为空。修改说明 = 章号和模型覆盖串之后的全部内容（可能为空）。
2. 确认 `chapters/Chapter-NN.md` 存在，否则提示先 `/novel:write N`，停止。
3. 修改说明为空时：读 `reviews/Chapter-NN.md`。不存在就提示先 `/novel:review N`，停止。列出其中还没有"已处理"或"未处理"标记的 critical 和 major 条目编号。没有待处理条目就告诉用户，停止。
4. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/context.sh N review --save`，它把上下文包写到 `.novel/context-NN-review.md`，stdout 只有该文件的绝对路径，记下来。退出码非零时把 stderr 原样给用户，停止。不要自己绕过检查。不要把上下文包读进主对话。
5. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/model.sh editor "模型覆盖串"` 取模型名。输出是 `inherit` 就不传 `model` 参数；否则调用子代理时把它作为 `model` 参数传入。
6. 用 novel:editor 子代理修改。提示词第一行二选一：
   - 按报告修改时："修订第 N 章。按 reviews/Chapter-NN.md 处理以下条目：C1, C2, M1。"
   - 按说明修改时："修订第 N 章。用户要求：（修改说明原文）。"
   第二行是小说目录的绝对路径，第三行是上下文包文件的绝对路径，并要求它先用 Read 把该文件完整读完再改。
7. 子代理返回后，记下它给出的改动前后对照。
8. 复审：读 `${CLAUDE_PLUGIN_ROOT}/commands/review.md`，按其步骤 2 到 5 执行一遍（要重新生成上下文包，正文已经变了；其 model.sh 那步用同一个模型覆盖串；旧报告归档为 `Chapter-NN.vK.md`，重新生成 `reviews/Chapter-NN.md`）。
9. 把第 7 步的前后对照和复审的汇总行、critical 列表一起给用户。复审后 critical 为 0 就加一句：可以 `/novel:finalize N` 定稿；仍有 critical 就加一句：可以再次 `/novel:revise N`。

然后停止。

模型覆盖：章号后的下一个词可以是裸模型名（如 `opus`，对这次启动的所有子代理生效）或 `角色=模型` 形式（如 `writer=opus,reviewer=haiku`，只对指定角色生效）。不带时按 `novel.yaml` 的 `models` 段，再没有就跟主对话相同。
