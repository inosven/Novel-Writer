---
description: 定稿第 N 章：生成摘要，更新故事账本
argument-hint: N
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(ls *), Read, Agent
---

定稿第 $0 章。

步骤：

1. 章号 N = `$0`。不是正整数就提示用法，停止。
2. 前置检查，任一不满足就说明原因并停止：
   - `chapters/Chapter-NN.md` 存在。
   - `bible/state.md` 第一行的"截至第M章"满足 M = N-1。M 不等于 N-1 时告诉用户当前截至章号和应该先处理的章。
3. 软检查：`reviews/Chapter-NN.md` 不存在，或其中有未标"已处理"/"未处理"的 critical 条目时，警告用户并问是否继续。没确认就停止。
4. 用 novel:archivist 子代理定稿。提示词："定稿第 N 章。"
5. 子代理返回后运行 `${CLAUDE_PLUGIN_ROOT}/scripts/bible-check.sh`。失败就把输出给用户，说明账本可能处于半更新状态，建议用 `git diff bible/` 查看后手动修正或让 archivist 重跑。
6. 转述子代理返回的状态变化和账本改动摘要，加一句：下一步 `/novel:write N+1`。

然后停止。
