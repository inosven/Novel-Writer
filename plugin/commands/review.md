---
description: 审稿第 N 章，报告写到 reviews/Chapter-NN.md
argument-hint: N
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Read, Agent
---

审稿第 $0 章。

步骤：

1. 章号 N = `$0`。不是正整数就提示用法，停止。
2. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/context.sh N review`。退出码非零时把 stderr 给用户，停止。
3. 用 novel:reviewer 子代理审稿。提示词第一行"审稿第 N 章。"，然后是 context.sh 的完整输出。
4. 子代理返回后，转述汇总行和 critical 列表，加一句：完整报告在 `reviews/Chapter-NN.md`；要按报告修改运行 `/novel:revise N`，要定稿运行 `/novel:finalize N`。

然后停止。
