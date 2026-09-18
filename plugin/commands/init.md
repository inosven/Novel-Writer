---
description: 在当前目录初始化一个小说项目。可选参数：题材包名（默认 general）
argument-hint: [题材包]
disable-model-invocation: true
allowed-tools: Bash(ls *), Bash(mkdir *), Bash(cp *), Bash(sed *), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Read, Write
---

初始化小说项目。题材包参数：`$ARGUMENTS`（为空时用 `general`）。

步骤：

1. 确定题材包名 PACK：`$ARGUMENTS` 非空就用它，否则 `general`。检查 `${CLAUDE_PLUGIN_ROOT}/templates/skills/PACK` 存在；不存在就列出 `${CLAUDE_PLUGIN_ROOT}/templates/skills/` 下的可用包名，告诉用户，停止。
2. 检查当前目录。如果已有 `novel.yaml`，告诉用户这里已经是小说项目，停止。如果目录非空（除了 `.git`），列出现有内容并询问用户是否继续；用户没确认就停止。
3. 问用户书名（用普通对话问，不要用选择题工具）。如果用户在调用时已经给了书名就直接用；用户不想现在定就用"未命名"。
4. 创建目录：`characters/ chapters/ summaries/ reviews/ bible/ .claude/skills/`。
5. 复制模板：
   - `${CLAUDE_PLUGIN_ROOT}/templates/novel.yaml` → `./novel.yaml`，把 `__TITLE__` 替换为书名、`__SKILL__` 替换为 PACK。
   - `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md` → `./CLAUDE.md`。
   - `${CLAUDE_PLUGIN_ROOT}/templates/bible/*.md` → `./bible/`。
   - `${CLAUDE_PLUGIN_ROOT}/templates/skills/PACK` → `./.claude/skills/PACK`（整个目录）。
6. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/bible-check.sh` 确认账本模板合法。
7. 告诉用户创建了什么，下一步运行 `/novel:plan`。

不要创建 `outline.md`，它由 `/novel:plan` 生成。
