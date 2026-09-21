---
description: 定稿第 N 章：快照账本，生成摘要，更新故事账本
argument-hint: N [模型]
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
4. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/bible-snapshot.sh N`，把定稿前的账本存到 `bible/.history/before-NN/`（供 `/novel:rollback N` 使用）。失败就把输出给用户，停止。
5. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/model.sh archivist "$1"` 取模型名（`$1` 是可选的模型覆盖，见下）。输出是 `inherit` 就不传 `model` 参数；否则调用子代理时把它作为 `model` 参数传入。
6. 用 novel:archivist 子代理定稿。提示词："定稿第 N 章。"
7. 子代理返回后运行 `${CLAUDE_PLUGIN_ROOT}/scripts/bible-check.sh`。失败就把输出给用户，说明账本可能处于半更新状态，建议对照 `bible/.history/before-NN/` 手动修正，或用 `/novel:rollback N` 恢复后重新定稿。
8. 转述子代理返回的状态变化和账本改动摘要，加一句：下一步 `/novel:write N+1`。

然后停止。

模型覆盖：第二个参数可以是裸模型名（如 `opus`，对这次启动的所有子代理生效）或 `角色=模型` 形式（如 `writer=opus,reviewer=haiku`，只对指定角色生效）。不带时按 `novel.yaml` 的 `models` 段，再没有就跟主对话相同。
