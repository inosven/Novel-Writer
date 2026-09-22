# NovelWriter

一个 Claude Code plugin，用来写长篇小说。它不调用模型 API，而是在你的小说目录里给 Claude Code 提供命令、子代理和一套"故事账本"，用你自己的 Claude 订阅逐章写作。

## 为什么

长篇小说最难的不是文笔，是连贯：第 12 章的角色得记得第 3 章受的伤，得不知道第 9 章别人背着他做的事。摘要和向量检索都留不住这些。NovelWriter 用一个人类可读的账本记录"截至第 N 章的世界状态"，每章写作前整份交给模型，每章定稿后由模型更新。

## 安装

需要 Claude Code 2.1 以上。

```bash
git clone https://github.com/inosven/Novel-Writer.git
cd Novel-Writer
bash plugin/tests/run.sh     # 可选：确认脚本在你的系统上正常
```

在你的小说目录里启动：

```bash
mkdir my-novel && cd my-novel
claude --plugin-dir /path/to/Novel-Writer/plugin
```

## 用法

| 命令 | 作用 |
|---|---|
| `/novel:init [题材包]` | 初始化项目。不带参数用通用包 `general`，示例题材包 `sanguo-xuanyi` |
| `/novel:plan` | 对话式规划：大纲、角色档案、账本初始内容 |
| `/novel:write N [模型]` | 写第 N 章草稿，写完停下 |
| `/novel:review N [模型]` | 审稿，报告在 `reviews/Chapter-NN.md` |
| `/novel:revise N [模型] [说明]` | 按审稿报告或你的说明做定点修改，改完自动复审 |
| `/novel:finalize N [模型]` | 定稿：生成摘要、更新账本 |
| `/novel:auto N [模型]` | 连续写到第 N 章：每章写、审、修、复审、定稿，复审后仍有 critical 才停 |
| `/novel:rollback N` | 撤销第 N 章及之后的定稿：账本回到截至第 N-1 章，摘要移到备份，正文不动 |
| `/novel:status` | 进度 |

典型循环：`write 3` → 自己读、随手改 → `review 3` → `revise 3` → `finalize 3` → `write 4`。想省事就 `auto 6`，它会一章章跑下去，只在复审后还剩 critical 时停下来找你。每次重审前旧报告会改名为 `reviews/Chapter-NN.v1.md` 留底，复审时审稿会读上一版：沿用编号和严重度，已标"未处理"的条目不再提出。

写第 N 章要求账本停在第 N-1 章，所以每章都要 finalize 才能往下写。这是刻意的：账本落后，后面的章节就会不连贯。

定稿后想推倒重写某一章：`rollback N` 把账本恢复到该章定稿前的快照（每次 finalize 前自动存在 `bible/.history/before-NN/`），第 N 章起的摘要移到 `bible/.history/rollback-<时间戳>/` 备份，正文和审稿报告留在原地。然后改或 `write N` 重写，再 review、finalize。只有加入快照功能之后定稿的章才能回滚。

## 指定模型

四个子代理各用什么模型在 `novel.yaml` 的 `models` 段里定，`init` 生成的默认值是写手和审稿 `opus`，编辑和档案员 `sonnet`。填 `inherit` 就跟主对话相同。主对话只做调度，启动时 `claude --model sonnet` 就够。

想临时换一个模型试试，在章号后面加一个参数：

```
/novel:write 5 opus                       # 这次写手用 opus
/novel:auto 8 sonnet                      # 这一轮所有子代理都用 sonnet
/novel:auto 8 writer=opus,reviewer=haiku  # 只换指定角色，其余按 novel.yaml
/novel:revise 5 editor=sonnet 结尾改短    # 修订说明写在模型后面
```

## 目录结构

```
my-novel/
├── novel.yaml          书名、题材包、每章字数、各子代理用的模型
├── outline.md          大纲
├── characters/         角色档案
├── chapters/           正文 Chapter-01.md …
├── summaries/          定稿后的章节摘要
├── reviews/            审稿报告
├── bible/              故事账本
│   ├── state.md        截至第 N 章的世界状态：每个角色在哪、知道什么、身上有什么、伤病
│   ├── threads.md      伏笔清单
│   ├── timeline.md     时间线
│   ├── facts.md        硬设定
│   └── .history/       定稿前快照与回滚备份
├── .novel/             上下文包临时文件，可删
└── .claude/skills/<题材包>/
```

账本只由 `/novel:finalize` 修改，但它是普通 Markdown，你随时可以手改。

## 题材包

题材包决定大纲方法、人物方法、文风和审稿要点。plugin 自带两个：

- `general`：题材中性，任何类型都能用。
- `sanguo-xuanyi`：三国古装悬疑，作为定制范例。

定制自己的：复制 `plugin/templates/skills/general` 到你项目的 `.claude/skills/<新名字>/`，改写五个文件，把 `novel.yaml` 的 `skill` 改成新名字。

## License

MIT
