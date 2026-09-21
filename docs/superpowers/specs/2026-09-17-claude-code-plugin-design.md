# NovelWriter Claude Code Plugin 设计

日期：2026-09-17
状态：待评审

## 1. 背景与目标

现有 NovelWriter 是一个 Electron 应用，自带 Orchestrator、四个 Agent 类、LanceDB 向量检索、知识图谱和四个 LLM 适配器。实际使用中发现两类问题：

- 上下文不连贯。写作 Agent 只拿到本章大纲的一句摘要、截断到 200 字的角色档案、每章 150 字的摘要和一个用字符哈希伪装的向量检索结果。没有"故事状态"这个概念，角色的处境、所知、伤病、伏笔在摘要里全部丢失。
- 管线本身没跑通。`src/` 有 69 个类型错误，审稿 Agent 收到的正文是 `undefined`，编辑 Agent 调用不存在的方法，审稿结果永远判定通过。

同时用户希望用 Claude Pro/Max 订阅额度写作，而 Anthropic 明确不允许第三方产品挂载 claude.ai 登录或额度。

本设计把写作逻辑从应用里拿出来，做成一个 Claude Code plugin。用户在小说目录里运行 `claude`，用自己的订阅登录，plugin 提供命令、子代理、脚本和账本格式。写作逻辑只存在这一份；将来 Electron 应用如果需要一键生成，通过 Agent SDK 加 API key 加载同一个 plugin。

目标：

1. 用"故事账本"加分层上下文解决连贯性，不依赖检索。
2. 每一步模型看到的上下文由脚本确定性组装，可离线测试。
3. 题材无关，题材由技能包提供。plugin 本体不含任何题材相关的提示词；附带一个题材中性的 `general` 包和一个 `sanguo-xuanyi` 示例包。
4. 零 LLM 调用代码，零外部服务依赖。

## 2. 小说项目目录

plugin 操作的是一个普通文件夹。

```
my-novel/
├── novel.yaml               # 唯一配置文件
├── CLAUDE.md                # /novel:init 生成
├── outline.md               # 大纲
├── characters/<角色名>.md    # 角色档案，自由 Markdown，不被代码解析
├── chapters/Chapter-NN.md   # 正文
├── summaries/Chapter-NN.md  # 定稿时生成的结构化摘要
├── reviews/Chapter-NN.md    # 最近一次审稿报告
├── bible/                   # 故事账本
│   ├── state.md
│   ├── threads.md
│   ├── timeline.md
│   └── facts.md
└── .claude/skills/<题材包>/  # 从 plugin 模板复制，可按本书修改
```

### 2.1 novel.yaml

```yaml
title: 洛阳残卷
skill: sanguo-xuanyi        # .claude/skills/ 下的题材包目录名
chapter_words: [4000, 6000] # 每章目标字数区间（中文字符数）
pov: 第三人称限知
models:                     # 各子代理用的模型，可省略；省略或 inherit 表示跟主对话相同
  writer: opus
  reviewer: opus
  editor: sonnet
  archivist: sonnet
```

`scripts/model.sh 角色 [覆盖串]` 决定子代理模型，优先级：命令行覆盖串（`/novel:write 5 opus` 的第二个参数，裸名对全部角色生效，`writer=opus,reviewer=haiku` 只对指定角色生效）> `models` 段 > `inherit`。命令文件调用子代理时把结果作为 Agent 工具的 `model` 参数传入，`inherit` 则不传。

### 2.2 outline.md

沿用现有格式，plugin 只读不解析结构：

```markdown
# 洛阳残卷

## 故事前提
……

## 主题
……

## 章节大纲

### 第1章: 残卷
**摘要**: ……
**关键事件**:
- ……
**出场角色**: 辩机, 荀彧
```

`context.sh` 用 `### 第N章:` 标题定位本章条目，取到下一个 `### ` 或文件末尾为止。

### 2.3 chapters/Chapter-NN.md

文件名两位零填充，1-based。第一行是 `# 第N章 标题`，其余为纯正文，不含 frontmatter、不含实体标记。

### 2.4 summaries/Chapter-NN.md

由 archivist 在 finalize 时生成，固定四段：

```markdown
# 第3章 摘要

## 情节
（200 字以内）

## 状态变化
- 辩机：得知荀彧密信内容；左臂受刀伤
- 萧昱：离开许都，去向不明

## 新设定
- 铜符：刻有"卫"字，来历未知

## 出场角色
辩机, 荀彧, 萧昱
```

### 2.5 进度的判定

不再有独立的进度文件。第 N 章"已定稿"当且仅当 `summaries/Chapter-NN.md` 存在且 `bible/state.md` 第一行的"截至第M章"满足 M ≥ N。`.state/` 目录不再存在。

## 3. 故事账本 bible/

四个文件，全部人类可读、可手改。**只有 `/novel:finalize N` 会修改账本。** 写草稿、审稿、修订都不碰它。

### 3.1 state.md 当前世界状态

```markdown
# 故事状态（截至第3章）

## 时间地点
- 故事时间：建安五年秋，第3章结束于官渡战前第七日夜
- 当前场景：官渡大营

## 角色状态

### 辩机
- 所在：官渡大营中军帐外
- 处境：被曹操暂留军中，身份未暴露
- 所知：已知荀彧密信内容；不知道萧昱已叛
- 所持：铜符（第2章得）
- 伤病：左臂刀伤未愈（第2章）

### 萧昱
- 所在：离开许都，去向不明
- ……
```

第一行格式固定为 `# 故事状态（截至第N章）`，`bible-check.sh` 和 `context.sh` 都依赖它。初始状态为"截至第0章"。

### 3.2 threads.md 未收伏笔

```markdown
# 伏笔与悬念

| 编号 | 内容 | 引入章 | 预计回收 | 状态 |
|---|---|---|---|---|
| T1 | 铜符的来历 | 2 | 8 | 未收 |
| T2 | 荀彧为何选中辩机 | 1 | 5 | 已收（第4章） |
```

状态取值：未收、已收（第N章）、放弃。

### 3.3 timeline.md 事件时间线

```markdown
# 时间线

## 第1章
- 建安五年八月初三，许都：辩机受荀彧召见
- 同日夜：辩机在府外遇袭

## 第2章
- ……
```

### 3.4 facts.md 硬设定

```markdown
# 硬设定

## 人物固定属性
- 辩机：男，27 岁，左眉有疤，原为太学生
- 荀彧：尚书令

## 地点
- 荀府：许都城东，正门朝南

## 物品
- 铜符：巴掌大，刻"卫"字，有裂痕

## 规则
- 军中夜间禁行，需持令牌
```

规划阶段从大纲和角色档案抽取初始内容。审稿以此为准，写作不得矛盾。

### 3.5 体量

一部 30 章的书，`state.md` 约 1500 到 3000 字，四个文件合计不超过 8000 字。每次整份进上下文，不检索。

## 4. plugin 组件

```
plugin/
├── .claude-plugin/plugin.json
├── commands/
│   ├── init.md
│   ├── plan.md
│   ├── write.md
│   ├── review.md
│   ├── revise.md
│   ├── finalize.md
│   └── status.md
├── agents/
│   ├── writer.md
│   ├── reviewer.md
│   ├── editor.md
│   └── archivist.md
├── skills/
│   ├── story-bible/SKILL.md
│   └── novel-writing/SKILL.md
├── scripts/
│   ├── context.sh
│   ├── bible-check.sh
│   ├── wordcount.sh
│   ├── model.sh
│   ├── bible-snapshot.sh
│   └── rollback.sh
├── hooks/hooks.json
├── templates/
│   ├── novel.yaml
│   ├── CLAUDE.md
│   ├── bible/{state,threads,timeline,facts}.md
│   └── skills/sanguo-xuanyi/
└── tests/
```

### 4.1 plugin.json

```json
{
  "name": "novel",
  "description": "AI 辅助长篇小说写作：规划、逐章写作、审稿、修订、故事账本",
  "version": "0.1.0"
}
```

命令以 `/novel:` 为前缀。

### 4.2 命令

所有命令是 Markdown 文件，通过 `${CLAUDE_PLUGIN_ROOT}` 引用脚本，通过 `$ARGUMENTS` 取参数。

| 命令 | 行为 | 子代理 |
|---|---|---|
| `/novel:init [题材包]` | 在当前目录创建第 2 节的目录结构，复制 `templates/` 下的 `novel.yaml`、`CLAUDE.md`、空账本，复制指定题材包到 `.claude/skills/` 并写入 `novel.yaml` 的 `skill` 字段。不带参数时用 `general`。目录非空时先确认。 | 无 |
| `/novel:plan` | 在主对话中按题材包 `outline-method.md` 提问，定稿后写 `outline.md`；再按 `character-method.md` 逐个写 `characters/*.md`；最后从大纲和档案抽硬设定写 `bible/facts.md`，`state.md` 写成"截至第0章"的初始状态。已有 `outline.md` 时先读再改。 | 无 |
| `/novel:write N` | 运行 `context.sh N write`，失败则把错误信息给用户并停止。成功则派 writer 子代理，把脚本输出作为提示词主体。子代理写 `chapters/Chapter-NN.md` 并返回不超过 5 行的说明：推进了哪些伏笔、是否偏离大纲、字数。然后停下。已存在正文时先确认是否覆盖。 | writer |
| `/novel:review N` | 运行 `context.sh N review`，派 reviewer 子代理，写 `reviews/Chapter-NN.md`。主对话只显示各级问题数量和 critical 的一句话列表。 | reviewer |
| `/novel:revise N [说明]` | 无说明时按 `reviews/Chapter-NN.md` 里的 critical 和 major 逐条修改；有说明时按说明修改。派 editor 子代理，用 Edit 工具做片段替换。结束时列出每处改动的前后对照。 | editor |
| `/novel:finalize N` | 前置检查：`chapters/Chapter-NN.md` 存在；账本"截至"为 N-1；`reviews/Chapter-NN.md` 存在且无未解决 critical，否则警告并等用户确认。先运行 `bible-snapshot.sh N` 把账本存到 `bible/.history/before-NN/`，再派 archivist 子代理写 `summaries/Chapter-NN.md`、更新四个账本文件、把"截至"推到 N。结束后运行 `bible-check.sh`，失败则报告并提示用户检查账本。 | archivist |
| `/novel:rollback N` | 撤销第 N 章到当前截至章的定稿。`rollback.sh N --dry-run` 列出将要做的事并等用户确认，再 `rollback.sh N`：用 `before-NN` 快照覆盖 `bible/`，第 N 章起的摘要和第 N 章之后的快照移到 `bible/.history/rollback-<时间戳>/`，正文和审稿报告不动，最后跑 `bible-check.sh`。没有快照的章（快照功能加入前定稿的）拒绝回滚。 | 无 |
| `/novel:status` | 读 `novel.yaml`、`outline.md` 章数、`chapters/` 和 `summaries/` 文件列表、账本"截至"、`threads.md` 未收条目、各章字数。纯文件读取，直接在主对话输出表格。 | 无 |

### 4.3 子代理

每个子代理独立上下文，正文不进入主对话。

| 子代理 | 职责 | 工具 | 约束 |
|---|---|---|---|
| writer | 只写正文 | Read, Write, Bash（仅运行 wordcount.sh） | 输入只有 `context.sh` 输出。只用大纲指定的出场角色。承接上一章末尾。不改任何其他文件。 |
| reviewer | 只找问题 | Read, Grep | 每条问题必须有：严重度、原文引用、依据（账本哪一行或前面哪一章哪一句）、建议改法。不改任何文件，只写 `reviews/Chapter-NN.md`。 |
| editor | 只做定点修改 | Read, Edit, Bash（仅运行 wordcount.sh） | 禁止 Write 整章。每处修改用 Edit 做片段替换。完成后列出前后对照。 |
| archivist | 只更新摘要和账本 | Read, Write, Edit | 不改正文。按 story-bible skill 的格式写。`state.md` 第一行必须更新为"截至第N章"。 |

模型不在子代理文件里指定，继承主会话设置，用户可自行覆盖。

### 4.4 skills

plugin 本体的两个 skill 必须题材中性。任何提到具体时代、流派、作家文风的内容只能出现在题材包里。

- **story-bible**：账本四个文件的格式（第 3 节）、更新规则、常见错误。archivist 更新账本时引用，reviewer 判断矛盾时引用。
- **novel-writing**：题材无关的章节写作要求：承接上章末尾、只用大纲角色、不解释前情、章末留钩子、对话与叙述比例参考 `novel.yaml`、字数区间。writer 引用。题材相关的文风全部来自题材包的 `writing-method.md` 和 `output-style.md`。

### 4.5 脚本

**`context.sh N write|review`**

在小说目录下运行。输出到 stdout，固定顺序，每段用 `===== 段名 =====` 分隔：

1. 项目信息：`novel.yaml` 内容
2. 故事账本：`bible/` 四个文件全文，顺序 state、facts、threads、timeline
3. 本章大纲：`outline.md` 中第 N 章条目
4. 出场角色档案：本章大纲"出场角色"里每个名字对应的 `characters/<名>.md` 全文；找不到文件的名字单独列出
5. 上一章末尾：`chapters/Chapter-(N-1).md` 最后 800 字（N=1 时省略）
6. 前文摘要：`summaries/` 中第 1 到 N-1 章的全文，按序
7. 题材包：`.claude/skills/<skill>/writing-method.md` 和 `output-style.md`；`review` 模式再加 `review-rules.md`（存在时）

`review` 模式追加：

8. 本章正文：`chapters/Chapter-NN.md` 全文
9. 关键词检索：本章出场角色名在第 1 到 N-1 章正文里的命中，每个名字最多 5 处，每处前后 80 字

前置检查，失败时输出原因到 stderr 并以非零退出：

- `novel.yaml` 不存在
- `write` 模式下账本"截至"不等于 N-1
- `novel.yaml` 指定的题材包目录不存在
- `review` 模式下 `chapters/Chapter-NN.md` 不存在
- `outline.md` 里找不到第 N 章条目

**`bible-check.sh`**

检查：四个文件存在；`state.md` 第一行匹配 `# 故事状态（截至第\d+章）`；"截至"章号 ≤ `chapters/` 中最大章号；`summaries/` 文件数 ≥ "截至"章号；`threads.md` 表格每行状态取值合法。任一失败以非零退出并列出全部问题。

**`wordcount.sh FILE`**

输出文件中 CJK 字符数（不含标题行）。

### 4.6 hooks

`hooks/hooks.json` 只注册一个 PostToolUse 钩子：Write 或 Edit 的目标路径匹配 `chapters/Chapter-*.md` 时，运行 `wordcount.sh` 并把"当前 N 字，目标 A 到 B"作为附加上下文返回。超出区间时加一句提醒。

### 4.7 templates

- `novel.yaml`、`CLAUDE.md`、`bible/` 四个空模板（`state.md` 为"截至第0章"）。
- `skills/general/`：题材中性的默认包，新写。五个方法论文件（`outline-method.md`、`character-method.md`、`writing-method.md`、`output-style.md`、`review-rules.md`）只讲任何类型长篇都适用的原则：三幕结构与章节功能、人物动机与弧光、场景推进、对话与叙述平衡、常见审稿点。不含任何具体时代、地域、流派的设定。没有 `references/`。
- `skills/sanguo-xuanyi/`：从 `templates/default-project/.claude/skills/sanguo-xuanyi/` 原样搬来，作为"如何定制题材包"的范例。`SKILL.md` 补上 frontmatter：

```yaml
---
name: sanguo-xuanyi
description: 三国时期古装悬疑小说的写作方法论、文风规范与史实参考
---
```

## 5. 工作流

### 5.1 写审改定稿

```
/novel:write 3
  context.sh 3 write      账本不在第 2 章则拒绝
  writer                  写 chapters/Chapter-03.md，返回说明
  停。用户阅读、手改。

/novel:review 3
  context.sh 3 review
  reviewer                写 reviews/Chapter-03.md
  主对话显示汇总

/novel:revise 3                      按 critical + major 改
/novel:revise 3 "第二场对话缩短一半"   按说明改
  editor                  Edit 片段替换，列出前后对照
  审和改可反复

/novel:finalize 3
  前置检查
  archivist               写 summaries/Chapter-03.md，更新 bible/，截至第 3 章
  bible-check.sh
```

审稿问题分级：

- critical：与账本或前文事实矛盾
- major：逻辑漏洞、人物行为违背设定、偏离大纲关键事件
- minor：称谓、时间表述、小细节不一致
- suggestion：文笔建议

`reviews/Chapter-NN.md` 格式：

```markdown
# 第3章 审稿报告

## 汇总
critical 1 / major 2 / minor 3 / suggestion 2

## critical
### C1 辩机左臂伤势消失
- 原文："辩机双手抱拳，深深一揖"
- 依据：bible/state.md 辩机 · 伤病：左臂刀伤未愈（第2章）
- 建议：改为单手抱拳，或补一句伤臂动作受限

## major
……
```

`/novel:revise` 无参数时按 C1、C2……M1、M2 的顺序处理，处理后在报告对应条目下追加 `- 已处理` 或 `- 未处理：原因`。

### 5.2 规划

`/novel:plan` 在主对话中进行，不用子代理，因为需要和用户来回讨论。步骤：

1. 读 `novel.yaml` 取题材包，读题材包 `outline-method.md`。
2. 按方法论提问，一次一个问题，直到用户说可以了。
3. 写 `outline.md`，格式见 2.2。
4. 读题材包 `character-method.md`，按大纲出场角色逐个写 `characters/<名>.md`，每个写完给用户看一眼。
5. 从大纲和档案抽取硬设定写 `bible/facts.md`；`state.md` 写"截至第0章"的初始状态（每个角色开场时的所在、处境、所知）；`threads.md` 写大纲里已知的伏笔；`timeline.md` 留空标题。

修改大纲不需要命令，用户直接对话，Claude 用 Edit 改 `outline.md`。

## 6. 仓库迁移

对现有仓库的改动：

- 新增 `plugin/`。
- `templates/default-project/.claude/skills/sanguo-xuanyi/` 移到 `plugin/templates/skills/sanguo-xuanyi/`，补 frontmatter。随后删除 `templates/`。
- 删除 `my-novel/`（空目录）。
- `src/`、`electron/`、`app/` 原地不动，README 标为 legacy。删除 `src/` 会让旧应用无法构建，等下一轮做阅读器时再替换。plugin 与旧代码互不依赖。
- 新增仓库根 `.claude/settings.json`，注册 `plugin/` 为本地 plugin，在仓库内开发时直接可用。
- README 重写：安装（`claude --plugin-dir ./plugin`）、七个命令、账本说明、自定义题材包指南。删除旧架构图和技术栈表。

## 7. 验证

### 7.1 脚本测试（不调模型）

`plugin/tests/fixtures/demo-novel/`：两章正文、账本"截至第2章"、两份摘要、6 章大纲、三个角色档案。

`plugin/tests/run.sh` 断言：

- `context.sh 3 write` 退出码 0，输出含"===== 故事账本 ====="、"### 第3章"、上一章末尾段。
- 把 fixture 账本改为"截至第1章"后 `context.sh 3 write` 退出码非零，stderr 含"截至"。
- `context.sh 3 review` 在 `chapters/Chapter-03.md` 不存在时退出码非零。
- `bible-check.sh` 在 fixture 上退出码 0；删掉一份摘要后退出码非零。
- `wordcount.sh` 对已知文件输出已知数字。

### 7.2 加载测试

在 fixture 目录运行：

```
claude --plugin-dir ../../../ -p "/novel:status" --output-format json
```

检查 `system/init` 里 `plugins` 含 `novel`，`plugin_errors` 不存在，七个命令都注册。

### 7.3 端到端（消耗订阅额度，执行前询问用户）

1. 空目录 `/novel:init sanguo-xuanyi`。
2. `/novel:plan` 出 6 章大纲、3 个角色。
3. 第 1 到 3 章走完 write、review、revise、finalize。
4. 另起一个空目录 `/novel:init`（不带参数，用 `general` 包），`/novel:plan` 出一个非历史题材的 3 章大纲，确认规划流程在通用包下同样能走通。这一步只到大纲，不写正文。

验收：

- 第 3 章 `reviews/Chapter-03.md` 的 critical 为零（允许经过一轮 revise）。
- 第 3 章正文至少两处明确承接第 1、2 章账本状态（角色所知、伤病、所持物），由人工阅读确认。
- 三章之后 `bible-check.sh` 通过，`state.md` 为"截至第3章"。

## 8. 不做的事

明确排除，等 plugin 经真实写作验证后再议：

- Codex 的 `AGENTS.md`
- Electron 阅读器和 Agent SDK 接入
- 向量检索
- 连续多章无人值守
- 导出 epub / txt
- 章节插入、删除、重编号（用户直接改文件名和大纲）
- 重写已定稿的章节。`/novel:write N` 要求账本恰好停在 N-1，回头改第 2 章需要用户手动把账本和摘要退回到第 1 章。自动回退等有需求再做。

## 9. 验收记录

日期：2026-09-17。用户在 `~/tmp/novel-e2e-sanguo`（三国包）和 `~/tmp/novel-e2e-test`（通用包）两个目录里用交互式 Claude Code 跑完了 7.3 节的流程。以下由控制会话读取两个目录和会话记录得出。

### 9.1 三国包全流程

书名《三顾》，6 章大纲、12 个角色档案（含不出场的徐庶、韩曜）。写、审、改、定稿三章。

| 章 | 字数 | 审稿 critical / major / minor / suggestion | 修订 |
|---|---|---|---|
| 1 | 3549 | 0 / 1 / 5 / 4 | M1 已处理 |
| 2 | 3896 | 2 / 0 / 6 / 5 | C1、C2 已处理 |
| 3 | 4753 | 1 / 1 / 4 / 5 | C1、M1 已处理 |

- `bible-check.sh` 通过，`state.md` 第一行为 `截至第3章`，threads 有 23 条（T16、T17 在第 3 章按预计回收）。
- 第 3 章报告的 critical 数为 1，修订后标"已处理"，用户没有再审一次，所以不是 0。第 2 章的两条 critical（残棋是否在案上与 facts.md 矛盾；雪停时间与张飞推理冲突）都是账本抓出来的连贯性问题，正是这个设计要解决的那类错误。
- 第 3 章承接前两章账本状态的地方，至少四处：开头"他方才走的时候就听见了，闩没有落"接第 2 章末尾和 T17；黄承彦"我那女婿二十七年"与 facts.md 诸葛亮 27 岁一致；留书落款只写"备"、不写官号，与 facts.md 一致；刘备取出"徐庶的简"、裹紧"羊裘"，都是 state.md 的"所持"。审稿报告的"核对通过"一节还列出了地理（雪桥、岔路口）和关羽台词量的核对。
- 字数钩子在 writer 子代理里触发：`第1章当前 3548 字，目标 3000 到 5000 字。`
- `/novel:init` 把建目录、替换模板、复制题材包合成一条 Bash 命令执行，成功。`allowed-tools` 的单前缀规则不匹配复合命令时会弹权限提示，不会失败。
- 用户在第 1 章走完一轮后要求"自动 write、review、revise、finalize 写完第三章"，主会话照做了。第 2、3 章的上下文包由主会话自发改为写到临时文件、把路径交给子代理（第 1 章是把 6 到 9 万字符直接贴进提示词），这样主对话不会被上下文包撑大。

### 9.2 通用包规划流程

`/novel:init` 不带参数，`/novel:plan` 生成现代都市题材《冷眼》24 章大纲、10 个角色档案，账本初始化后 `bible-check.sh` 通过（截至第 0 章），threads 15 条，facts.md 四个标题都有内容。用户三句话给出设定后要求"你来编一个"，命令按 outline-method 的提问顺序走完。

### 9.3 发现的问题与处置

| 问题 | 处置 |
|---|---|
| init 和 plan 让 Claude 用选择题工具问书名和开放式问题，只有一个选项时工具报错（两个会话各一次，Claude 随后改用文字提问） | 已改 init.md、plan.md：开放式问题用普通对话问 |
| write、review 把上下文包整段贴进子代理提示词，主对话每章增长 6 到 9 万字符 | 已改 write.md、review.md：保存到临时文件，把路径交给子代理；writer.md、reviewer.md 说明两种形式都要先完整读取 |
| 用户想要"自动连续跑 write → review → revise → finalize" | 未做。8 节明确列为不做；本次主会话在用户口头要求下能完成，说明命令本身足以被编排。下一轮考虑加 `/novel:next` 一类命令 |
| 修订后没有再审一次，报告头部的 critical 数仍是修订前的 | 未做。revise 完成时可提示"再 review 一次可让报告归零"，已有此提示文案 |

### 9.4 结论

四个目标（1.2 节）都达到：账本抓出了两处跨章矛盾并在定稿前修掉；三章正文的字数、承接、伏笔回收都由脚本和账本约束住；通用包在一个现代题材上规划成功；用户的订阅登录直接可用，没有任何 API 配置。
