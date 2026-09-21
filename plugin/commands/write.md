---
description: 写第 N 章草稿，写完停下等你阅读
argument-hint: N [模型]
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(ls *), Read, Agent
---

写第 $0 章草稿。

步骤：

1. 章号 N = `$0`。不是正整数就提示用法 `/novel:write N`，停止。
2. 如果 `chapters/Chapter-NN.md` 已存在（NN 两位零填充），告诉用户已有正文和字数（用 `${CLAUDE_PLUGIN_ROOT}/scripts/wordcount.sh` 取），问是否覆盖。没确认就停止。
3. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/context.sh N write`，把 stdout 保存到一个临时文件（会话的 scratchpad 目录或 `mktemp`）。退出码非零时把 stderr 原样给用户，停止。不要自己绕过检查。不要把上下文包读进主对话。
4. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/model.sh writer "$1"` 取模型名（`$1` 是可选的模型覆盖，见下）。输出是 `inherit` 就不传 `model` 参数；否则调用子代理时把它作为 `model` 参数传入。
5. 用 novel:writer 子代理写这一章。给它的提示词是：第一行"写第 N 章。"，第二行是小说目录的绝对路径，第三行是上下文包文件的绝对路径，并要求它先用 Read 把该文件完整读完再动笔。
6. 子代理返回后，把它的说明原样转述给用户，加一句：正文在 `chapters/Chapter-NN.md`，读完后运行 `/novel:review N`。

然后停止。不要审稿，不要改账本。

模型覆盖：第二个参数可以是裸模型名（如 `opus`，对这次启动的所有子代理生效）或 `角色=模型` 形式（如 `writer=opus,reviewer=haiku`，只对指定角色生效）。不带时按 `novel.yaml` 的 `models` 段，再没有就跟主对话相同。
