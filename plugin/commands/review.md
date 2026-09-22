---
description: 审稿第 N 章，报告写到 reviews/Chapter-NN.md
argument-hint: N [模型]
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(ls *), Bash(mv *), Read, Agent
---

审稿第 $0 章。脚本一律按 `${CLAUDE_PLUGIN_ROOT}/scripts/名字.sh` 直接调用，不要去列插件目录、不要打印环境变量、不要用 `cat`/`sed`/`grep` 管道读文件（这些都不在白名单里，会触发权限确认）；读报告、大纲、账本一律用 Read 工具。

步骤：

1. 章号 N = `$0`。不是正整数就提示用法，停止。
2. 如果 `reviews/Chapter-NN.md` 已存在，先把它改名为 `reviews/Chapter-NN.v1.md`；`v1` 已存在就用 `v2`，依此类推（取现有最大版本号加一）。旧报告里的"已处理"/"未处理"标记因此保留。
3. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/context.sh N review --save`，它把上下文包写到 `.novel/context-NN-review.md`，stdout 只有该文件的绝对路径，记下来。退出码非零时把 stderr 原样给用户，停止。不要自己绕过检查。不要把上下文包读进主对话。
4. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/model.sh reviewer "$1"` 取模型名（`$1` 是可选的模型覆盖，见下）。输出是 `inherit` 就不传 `model` 参数；否则调用子代理时把它作为 `model` 参数传入。
5. 用 novel:reviewer 子代理审稿。提示词第一行"审稿第 N 章。"，第二行是小说目录的绝对路径，第三行是上下文包文件的绝对路径，并要求它先用 Read 把该文件完整读完再审。
6. 子代理返回后，转述汇总行（复审时还有"较上一版"那行）和 critical 列表，加一句：完整报告在 `reviews/Chapter-NN.md`（上一版在 `Chapter-NN.vK.md`，如有）；要按报告修改运行 `/novel:revise N`，要定稿运行 `/novel:finalize N`。

然后停止。

模型覆盖：第二个参数可以是裸模型名（如 `opus`，对这次启动的所有子代理生效）或 `角色=模型` 形式（如 `writer=opus,reviewer=haiku`，只对指定角色生效）。不带时按 `novel.yaml` 的 `models` 段，再没有就跟主对话相同。
