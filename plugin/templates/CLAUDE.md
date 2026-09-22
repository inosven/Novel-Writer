# 小说项目

这个目录是一部长篇小说，由 NovelWriter plugin 管理。

## 目录

- `novel.yaml`：书名、题材包、每章字数、各子代理用的模型
- `outline.md`：大纲，每章一个 `### 第N章: 标题` 条目
- `characters/`：角色档案
- `chapters/Chapter-NN.md`：正文
- `summaries/`：定稿后的章节摘要
- `reviews/`：审稿报告
- `bible/`：故事账本。**只通过 `/novel:finalize` 修改（规划阶段 /novel:plan 的初始化除外）。** 它记录截至最近定稿章的世界状态、伏笔、时间线、硬设定。`bible/.history/` 是每次定稿前的快照和回滚备份，别手动改。
- `.claude/skills/<题材包>/`：本书的写作方法论和文风规范，可以按需修改
- `.novel/`：插件生成的上下文包临时文件，随时可删

## 命令

- `/novel:plan`：规划大纲和角色
- `/novel:write N`：写第 N 章草稿，写完停下
- `/novel:review N`：审稿
- `/novel:revise N [说明]`：按审稿报告或说明修改
- `/novel:finalize N`：定稿，更新摘要和账本
- `/novel:auto N`：连续写到第 N 章，复审后仍有 critical 才停
- `/novel:rollback N`：撤销第 N 章及之后的定稿，账本回到截至第 N-1 章，正文不动
- `/novel:status`：进度

写、审、修、定稿、auto 都可以在章号后加模型覆盖：`/novel:write 5 opus` 或 `/novel:auto 8 writer=opus,reviewer=haiku`。不加就按 `novel.yaml` 的 `models` 段。

## 约定

- 写第 N 章前，第 N-1 章必须已 finalize。
- 修改大纲直接编辑 `outline.md`；修改角色直接编辑 `characters/`。
- 手动改正文没问题，改完记得 review 和 finalize。
- 已定稿的章想重写：先 `/novel:rollback N`，再改或重写，再 review 和 finalize。
