---
description: 删除第 K 章（只能删未定稿的章），正文和大纲条目移到 .trash/，后面的章号整体前移
argument-hint: K
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(ls *), Read
---

删除第 $0 章。

步骤：

1. 章号 K = `$0`。不是正整数就提示用法 `/novel:delete K`，停止。
2. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/renumber.sh delete K --dry-run`。退出码非零时把 stderr 原样给用户，停止。常见原因：第 K 章已定稿（要先 `/novel:rollback K`）；K 超过大纲章数。
3. 把 dry-run 输出给用户看，说明：第 K 章的正文、审稿报告和大纲条目会移到 `.trash/<时间戳>/`（不删），后面的章号前移，账本里预计在第 K 章回收的伏笔会顺延到新的第 K 章。问用户是否继续（用普通对话问）。没确认就停止。
4. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/renumber.sh delete K`。失败就把输出给用户，停止。
5. 转述结果，说明回收目录位置，提醒大纲里表格中的裸章号数字脚本不会改。

然后停止。不要自己改任何文件。
