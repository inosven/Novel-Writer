---
description: 审稿第 N 章，报告写到 reviews/Chapter-NN.md
argument-hint: N
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(ls *), Bash(mv *), Read, Agent
---

审稿第 $0 章。

步骤：

1. 章号 N = `$0`。不是正整数就提示用法，停止。
2. 如果 `reviews/Chapter-NN.md` 已存在，先把它改名为 `reviews/Chapter-NN.v1.md`；`v1` 已存在就用 `v2`，依此类推（取现有最大版本号加一）。旧报告里的"已处理"/"未处理"标记因此保留。
3. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/context.sh N review`，把 stdout 保存到一个临时文件（会话的 scratchpad 目录或 `mktemp`）。退出码非零时把 stderr 给用户，停止。不要把上下文包读进主对话。
4. 用 novel:reviewer 子代理审稿。提示词第一行"审稿第 N 章。"，第二行是小说目录的绝对路径，第三行是上下文包文件的绝对路径，并要求它先用 Read 把该文件完整读完再审。
5. 子代理返回后，转述汇总行和 critical 列表，加一句：完整报告在 `reviews/Chapter-NN.md`（上一版在 `Chapter-NN.vK.md`，如有）；要按报告修改运行 `/novel:revise N`，要定稿运行 `/novel:finalize N`。

然后停止。
