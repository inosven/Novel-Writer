---
description: 撤销第 N 章（及之后各章）的定稿：账本恢复到截至第 N-1 章，摘要移到备份，正文不动
argument-hint: N
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(ls *), Read
---

回滚第 $0 章的定稿。

步骤：

1. 章号 N = `$0`。不是正整数就提示用法 `/novel:rollback N`，停止。
2. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/rollback.sh N --dry-run`。退出码非零时把 stderr 原样给用户，停止。常见原因：第 N 章还没定稿；该章定稿时还没有快照功能（只能手改 `bible/`）。
3. 把 dry-run 的输出给用户看，说明：账本会回到截至第 N-1 章，列出的摘要和过期快照会移到 `bible/.history/rollback-<时间戳>/` 备份，正文和审稿报告不动。问用户是否继续（用普通对话问）。没确认就停止。
4. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/rollback.sh N`。失败就把输出给用户，停止。
5. 转述结果，加一句：现在第 N 章是未定稿的草稿。小改就直接编辑 `chapters/Chapter-NN.md` 后 `/novel:review N`、`/novel:finalize N`；推倒重写就 `/novel:write N`（它会问是否覆盖）。

然后停止。不要自己改账本。
