---
description: 导出全书：把已写各章合成 txt 和 epub，写到 export/ 目录
argument-hint: [txt|epub] [输出目录]
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(ls *)
---

导出全书。参数：`$ARGUMENTS`（格式可选 `txt`、`epub`，不带就两种都出；第二个参数是输出目录，默认 `export/`）。

步骤：

1. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/export.sh 格式 输出目录`（参数为空就不传）。退出码非零时把 stderr 原样给用户，停止。
2. 把打印出来的文件路径给用户，说明：收录的是 `chapters/` 里已写的全部章（含未定稿的草稿），按章号排序，正文第一行作章标题；想只导已定稿的章，先把草稿章移走或用 `/novel:delete` 处理。

然后停止。不要改任何文件。
