# NovelWriter

[English](README.md) | 中文

一个 Claude Code plugin，用来写长篇小说。它不调用模型 API，而是在你的小说目录里给 Claude Code 提供命令、子代理和一套"故事账本"，用你自己的 Claude 订阅逐章写作。

## 为什么

长篇小说最难的不是文笔，是连贯：第 12 章的角色得记得第 3 章受的伤，得不知道第 9 章别人背着他做的事。摘要和向量检索都留不住这些。NovelWriter 用一个人类可读的账本记录"截至第 N 章的世界状态"，每章写作前整份交给模型，每章定稿后由模型更新。

## 安装

需要 Claude Code 2.1 以上，阅读界面还需要 Python 3。

```bash
git clone https://github.com/inosven/Novel-Writer.git
cd Novel-Writer
bash plugin/tests/run.sh     # 可选：确认脚本在你的系统上正常
```

不需要全局安装：每次启动 Claude Code 时用参数指向 `plugin/` 目录即可（见下面第 1 步）。

## 从零开始：一步一步写出第一章

所有东西都在一个文件夹里，一本书一个文件夹。Claude Code 在这个文件夹里运行，插件给它加上 `/novel:...` 命令。下面所有命令里的 `N` 都是章号：`/novel:write 3` 就是"写第 3 章"。

**1. 建文件夹，在里面启动 Claude Code。**

```bash
mkdir my-novel && cd my-novel
claude --plugin-dir /path/to/Novel-Writer/plugin
```

`/path/to/Novel-Writer` 是你 clone 这个仓库的位置。启动后就是一个普通的 Claude Code 会话，下面的命令都在它的提示符里输入。

**2. 初始化项目。**

```
/novel:init
```

它会问书名，然后创建 `novel.yaml`、`characters/`、`chapters/`、`reviews/`、`summaries/`、空的 `bible/`，并把 `general` 题材包复制到 `.claude/skills/`。想用三国悬疑包就 `/novel:init sanguo-xuanyi`。

**3. 对话式规划。**

```
/novel:plan
```

Claude 一次问你一个问题：故事前提、主题、篇幅、主要人物、结局。用普通句子回答就行。结束时它写出 `outline.md`（每章一条：摘要、关键事件、出场人物）、`characters/` 下每人一个档案，以及账本的初始状态。打开这些文件，不同意的地方直接改，都是普通 Markdown。

**4. 写第 1 章。**

```
/novel:write 1
```

写手子代理读第 1 章的大纲条目、角色档案、账本和题材包，写出 `chapters/Chapter-01.md` 然后停下，别的什么都不动。你读一遍草稿，小地方可以随手改。

**5. 审稿。**

```
/novel:review 1
```

审稿子代理拿草稿对照账本、大纲、角色档案，写出 `reviews/Chapter-01.md`：问题清单分 critical（与既定事实矛盾）、major（情节或动机漏洞）、minor、suggestion 四级，每条带原文引用、依据和建议改法。汇总行和 critical 条目会显示在对话里。

**6. 按审稿改。**

```
/novel:revise 1
```

编辑子代理按 critical 和 major 条目做定点修改（不会整章重写），在报告里逐条标"已处理"，然后自动复审一遍。想按自己的意思改，把说明写在章号后面：`/novel:revise 1 把中间那段回忆删掉`。

**7. 定稿。**

```
/novel:finalize 1
```

这一步是全书连贯的关键。档案员子代理写出 `summaries/Chapter-01.md`，更新账本四个文件：每个人在哪、知道什么，埋了哪些伏笔、收了哪些，时间线，新的硬设定。从此第 1 章成为"正典"。不做这一步就写不了下一章，这是故意的。

**8. 下一章，重复。**

```
/novel:write 2
```

同样的循环：写、审、改、定稿。每章的写手都会拿到整份账本和上一章的结尾，所以它清楚故事走到了哪。

**9. 或者让它自己跑。**

```
/novel:auto 6
```

一直写到第 6 章，每章写、审、修一轮、定稿，中间不问你。只有某章修过一轮后还剩 critical 才提前停下，并告诉你该看哪里。

**10. 拿着笔读。**

```
/novel:read
```

浏览器打开 `http://127.0.0.1:8765`。选中任何一句，点"批注"记一条"这里有问题"，或点"查找"在全书找同样的话、把那些位置挂到同一条批注上。批注存在 `notes.md`，下一次 `/novel:revise N` 会连同审稿报告一起处理。`/novel:read stop` 关掉服务。

**11. 导出。**

```
/novel:export
```

把已写的章合成 `export/《书名》.txt` 和 `export/《书名》.epub`。

任何时候 `/novel:status` 能看到哪些章写了、哪些定稿了、有几条批注没处理、哪些伏笔还没收。

## 命令速查

`N` 是章号，`K` 是大纲里的位置，`[模型]` 是可选的模型覆盖（见下文）。

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
| `/novel:insert K [标题]` | 在第 K 章位置插入一章，后面的章号后移。只能在已定稿章之后 |
| `/novel:delete K` | 删除第 K 章，正文和大纲条目移到 `.trash/`，后面的章号前移。只能删未定稿的章 |
| `/novel:export [txt\|epub] [目录]` | 把已写各章合成 `export/《书名》.txt` 和 `.epub`（EPUB 3，无第三方依赖） |
| `/novel:read [端口\|stop]` | 打开阅读界面：通读、选中批注、跨文件查找、看审稿报告；`stop` 停止 |
| `/novel:status` | 进度 |

典型循环：`write 3` → 自己读、随手改 → `review 3` → `revise 3` → `finalize 3` → `write 4`。想省事就 `auto 6`，它会一章章跑下去，只在复审后还剩 critical 时停下来找你。每次重审前旧报告会改名为 `reviews/Chapter-NN.v1.md` 留底，复审时审稿会读上一版：沿用编号和严重度，已标"未处理"的条目不再提出。

写第 N 章要求账本停在第 N-1 章，所以每章都要 finalize 才能往下写。这是刻意的：账本落后，后面的章节就会不连贯。

定稿后想推倒重写某一章：`rollback N` 把账本恢复到该章定稿前的快照（每次 finalize 前自动存在 `bible/.history/before-NN/`），第 N 章起的摘要移到 `bible/.history/rollback-<时间戳>/` 备份，正文和审稿报告留在原地。然后改或 `write N` 重写，再 review、finalize。只有加入快照功能之后定稿的章才能回滚。

调整章节结构：`insert K` 和 `delete K` 会改文件名、`outline.md` 的章标题、大纲和账本里所有"第N章"字样、伏笔表的引入章和预计回收列。两者都只在已定稿边界之后操作，要动已定稿的章先 `rollback`。表格里的裸数字不会改，改完自己看一眼。

## 阅读界面

`/novel:read` 在本机起一个小服务（只用 Python 3 标准库，只监听 127.0.0.1），浏览器里通读正文。选中一段文字可以"批注"（这里有问题）或"查找"（同样的话全书还有哪些地方，默认搜正文，可勾选大纲、角色档案、账本），查找命中能勾选后加入同一条批注。批注存在项目根目录 `notes.md`，攒够了运行 `/novel:revise N`，编辑连同审稿报告一起处理，处理过的位置标"已处理"。审稿报告条目也在界面里定位到正文，可以直接标"未处理"（不改）。

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
├── notes.md            作者批注
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
├── export/             /novel:export 的 txt 和 epub
├── .novel/             上下文包临时文件，可删
├── .trash/             delete 移走的章，可删
└── .claude/skills/<题材包>/
```

账本只由 `/novel:finalize` 修改，但它是普通 Markdown，你随时可以手改。

字数按"中文逐字、英文按词、标点不算"计，所以 `chapter_words` 对中文、英文和混排都适用。

## 题材包

题材包决定大纲方法、人物方法、文风和审稿要点。plugin 自带两个：

- `general`：题材中性，任何类型都能用。
- `sanguo-xuanyi`：三国古装悬疑，作为定制范例。

定制自己的：复制 `plugin/templates/skills/general` 到你项目的 `.claude/skills/<新名字>/`，改写五个文件，把 `novel.yaml` 的 `skill` 改成新名字。

## License

MIT
