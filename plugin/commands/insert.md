---
description: 在第 K 章位置插入一章（只能在已定稿章之后），后面的章号整体后移
argument-hint: K [标题]
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(ls *), Read, Edit
---

在第 $0 章位置插入一章。完整参数：`$ARGUMENTS`。

步骤：

1. 位置 K = 参数的第一个词。不是正整数就提示用法 `/novel:insert K [标题]`，停止。标题 = 第一个词之后的内容（可能为空）。
2. 标题为空时用普通对话问用户：新章标题，以及一句话摘要。摘要用户不想现在写就留"（待补）"。
3. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/renumber.sh insert K "标题" "摘要" --dry-run`。退出码非零时把 stderr 原样给用户，停止。常见原因：K 不大于账本截至章（要先 `/novel:rollback`）；K 超过大纲章数加一。
4. 把 dry-run 输出给用户看，说明哪些文件会改名、大纲和账本里哪些章号引用会加一。问用户是否继续（用普通对话问）。没确认就停止。
5. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/renumber.sh insert K "标题" "摘要"`。失败就把输出给用户，停止。
6. 转述结果，提醒：`outline.md` 里第 K 章的关键事件和出场角色还是"（待补）"，请补上；大纲里表格中的裸章号数字脚本不会改，请自己看一眼。下一步写这一章前，账本要停在第 K-1 章。

然后停止。不要自己改大纲以外的文件。
