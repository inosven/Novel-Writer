---
description: 启动阅读界面（批注、跨文件查找、看审稿报告）。/novel:read stop 停止
argument-hint: [端口|stop]
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*)
---

阅读界面。参数：`$ARGUMENTS`（为空时用默认端口 8765）。

步骤：

1. 参数是 `stop`：运行 `${CLAUDE_PLUGIN_ROOT}/scripts/reader.sh stop`，转述结果，停止。
2. 否则运行 `${CLAUDE_PLUGIN_ROOT}/scripts/reader.sh start 端口`（参数为空就不传端口）。失败就把 stderr 原样给用户，停止；端口被占用时建议换一个端口再试。
3. 把打印出来的地址给用户，说明：在浏览器里打开；选中文字后可以"批注"或"查找"；批注攒够后回来运行 `/novel:revise N` 一起处理；审稿条目可以在界面里标"未处理"；用 `/novel:read stop` 停止服务。

然后停止。
