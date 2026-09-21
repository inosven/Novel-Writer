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
| `/novel:write N` | 写第 N 章草稿，写完停下 |
| `/novel:review N` | 审稿，报告在 `reviews/Chapter-NN.md` |
| `/novel:revise N [说明]` | 按审稿报告或你的说明做定点修改，改完自动复审 |
| `/novel:finalize N` | 定稿：生成摘要、更新账本 |
| `/novel:auto N` | 连续写到第 N 章：每章写、审、修、复审、定稿，复审后仍有 critical 才停 |
| `/novel:status` | 进度 |

典型循环：`write 3` → 自己读、随手改 → `review 3` → `revise 3` → `finalize 3` → `write 4`。想省事就 `auto 6`，它会一章章跑下去，只在复审后还剩 critical 时停下来找你。每次重审前旧报告会改名为 `reviews/Chapter-NN.v1.md` 留底。

写第 N 章要求账本停在第 N-1 章，所以每章都要 finalize 才能往下写。这是刻意的：账本落后，后面的章节就会不连贯。

## 目录结构

```
my-novel/
├── novel.yaml          书名、题材包、每章字数
├── outline.md          大纲
├── characters/         角色档案
├── chapters/           正文 Chapter-01.md …
├── summaries/          定稿后的章节摘要
├── reviews/            审稿报告
├── bible/              故事账本
│   ├── state.md        截至第 N 章的世界状态：每个角色在哪、知道什么、身上有什么、伤病
│   ├── threads.md      伏笔清单
│   ├── timeline.md     时间线
│   └── facts.md        硬设定
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
