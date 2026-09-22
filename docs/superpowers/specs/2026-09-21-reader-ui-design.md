# 阅读界面与作者批注 设计

日期：2026-09-21。前置：`2026-09-17-claude-code-plugin-design.md`（plugin 主设计，本文沿用其目录结构、账本和审稿报告格式）。

## 1. 目标

作者在浏览器里通读正文，选中某处说"这里有问题"，批注攒着不立即触发修改；一个问题在多处出现时，能从一处出发在全书检索并把命中加入同一条批注。批注落成 Markdown 文件，`/novel:revise N` 像处理审稿报告一样批处理。界面同时显示该章审稿报告的条目并定位到正文。

不做：多人协作、账户、正文在线编辑、非本机访问、移动端。

## 2. 组件

```
plugin/
├── reader/
│   ├── reader.py        本地 HTTP 服务：静态页 + JSON 接口，只用 Python 3 标准库
│   └── index.html       单页界面：原生 HTML/CSS/JS，无外部依赖，无构建
├── scripts/reader.sh    start|stop|status：nohup 起停 reader.py，pid 和日志在 .novel/
├── commands/read.md     /novel:read [端口]：启动服务并给出地址
└── tests/test_reader.py Python 单元测试，由 tests/run.sh 调用
```

`reader.py` 用法：`python3 reader.py --dir 小说目录 [--port 8765]`。只监听 `127.0.0.1`。所有文件访问限制在小说目录内（路径规范化后必须以小说目录为前缀，拒绝 `..` 和绝对路径），只写两类文件：`notes.md` 和 `reviews/Chapter-NN.md`。

## 3. 批注文件 notes.md

位于小说目录根。人可读可手改，服务和 editor 都按下面格式读写。

```markdown
# 作者批注

## A1 张飞自称"俺"
- 状态：未处理
- 位置：第4章「他见过俺兄长几回？他知道俺兄长是什么人」
- 位置：第5章「俺明日就去隆中」 已处理
- 位置：bible/state.md「张飞……俺兄长」
- 说明：前三章张飞一律自称"我"，见第1章"我看有一半是编的"。

## A2 ……
```

规则：

- 编号 `A` 加递增数字，取现有最大号加一，不复用。
- 状态只有三种：`未处理`、`已处理`、`作废`。
- 位置行两种写法：正文 `第N章「引用」`；其他文件 `相对路径「引用」`（`outline.md`、`characters/x.md`、`bible/x.md`）。引用是该文件中逐字连续的一段，不含换行。位置行末尾可带 ` 已处理` 标记，表示这一处已改。
- 引用唯一性：服务新建位置时，从选区文字出发，若该文件中出现不止一次，向前后各扩展若干字直到在文件中唯一（最长 120 字；仍不唯一时保留并在界面提示"定位到第一处"）。
- 说明一行，可为空行省略。
- 服务写回时整文件重写，但保留未识别的行（放回原批注块末尾），不改块顺序。

## 4. 服务接口

全部 JSON，`Content-Type: application/json; charset=utf-8`。错误返回 `{"error": "原因"}` 和 4xx。

| 方法与路径 | 作用 |
|---|---|
| `GET /` | 返回 `index.html` |
| `GET /api/project` | `novel.yaml` 的书名、账本截至章、大纲章数 |
| `GET /api/chapters` | `[{n, title, words, finalized, has_review}]`，标题取正文第一行 `# ` 之后 |
| `GET /api/file?path=` | 读小说目录内任一 Markdown 文件的原文（用于正文和其他文件的展示） |
| `GET /api/search?q=&scope=` | `q` 为逐字子串；`scope` 是逗号分隔的目录或文件集合：`chapters`（默认）、`outline`、`characters`、`bible`。返回 `[{path, chapter, index, before, match, after}]`，每个文件最多 50 条，按文件顺序 |
| `GET /api/notes` | 解析 `notes.md` 全部批注 |
| `POST /api/notes` | 新建批注：`{title, comment, locations: [{path, quote}]}`；服务做唯一性扩展后写入，返回该批注 |
| `POST /api/notes/{id}/locations` | 追加位置：`{locations: [...]}` |
| `POST /api/notes/{id}` | 改状态或说明：`{status?, comment?, title?}` |
| `DELETE /api/notes/{id}/locations` | 删一个位置：`{path, quote}` |
| `GET /api/reviews/{n}` | 解析 `reviews/Chapter-NN.md`：`{summary, items: [{id, level, title, quote, evidence, problem, suggestion, handled}]}`；`quote` 取 `- 原文：` 行第一段引号内文字；`handled` 为 `已处理`/`未处理` 行的内容或空 |
| `POST /api/reviews/{n}/items/{id}` | 在该条目末尾追加 `- 未处理：原因`（与 editor 的写法一致）；已有标记时拒绝 |

不提供正文写入接口。

## 5. 界面

三栏。窄于 1100px 时右栏折叠成抽屉。

- **左栏**：书名、账本截至章；章节列表，每章显示字数、已定稿标记、是否有审稿报告；下面是"其他文件"折叠组（`outline.md`、`characters/`、`bible/`），可只读打开。
- **中栏**：当前文件正文，按空行分段渲染，保留标题行。高亮：作者批注位置黄底，审稿条目位置蓝底，critical 条目带红色左边框；已处理的位置变为浅色虚线下划线。点高亮跳到右栏对应条目。
- **右栏**：两个页签。
  - **批注**：当前文件相关的批注列表（任一位置在此文件的），每条显示编号、标题、状态、各位置（点击跳转，其他文件的位置显示路径），按钮：改状态（未处理／已处理／作废）、编辑说明、删位置。顶部开关"显示全书批注"。
  - **审稿**：该章 `reviews/Chapter-NN.md` 的汇总行和条目，按 critical / major / minor / suggestion 分组，每条显示标题和已处理／未处理标记，点击跳到正文，展开看依据、问题、建议。每条有"标未处理"按钮，弹一行输入原因。没有报告时提示运行 `/novel:review N`。
- **选中文字**后在选区旁浮出两个按钮：
  - **批注**：弹小表单：标题（默认取选区前 20 字）、说明、下拉"新建 / 加入现有批注 A1…"。提交后调 `POST /api/notes` 或追加位置。
  - **查找**：右栏切到"查找"临时面板：检索词默认是选区（可改），范围勾选框 `正文`（默认勾）`大纲` `角色档案` `账本`。结果按文件分组，每条显示前后文并有勾选框；底部按钮"加入批注 A1…"或"新建批注并加入"，把勾选的命中作为位置写入。
- 所有写操作完成后重新拉取批注和高亮，不做本地缓存。

## 6. 与现有流程的接入

- **`/novel:revise N`**：第 3 步"待处理条目"扩展为：审稿报告里未标记的 critical/major，加上 `notes.md` 中状态未处理、且有位置在第 N 章且该位置未标"已处理"的批注。带修改说明时不读批注。editor 提示词多一段："另按 notes.md 处理以下批注：A1, A3。只改这些批注在本章的位置，改完在 notes.md 对应位置行末加「 已处理」；该批注所有正文位置都已处理时把状态改为「已处理」。批注在账本、大纲、角色档案里的位置不要改，返回时列出提醒作者。"editor 允许改的文件加上 `notes.md`。
- **`/novel:auto`**：第 3 步触发修订的条件加"或 notes.md 有本章未处理批注"。
- **`/novel:finalize N`**：软检查加"notes.md 有位置在第 N 章的未处理批注"，警告并确认。
- **`context.sh N review`**：新增段 `===== 作者批注 =====`，列出与第 N 章相关的批注（含已处理的，标出状态），reviewer 据此不重复提出作者已批注的问题，并核实已处理的是否改好。
- **`/novel:delete` / `/novel:insert`**：`renumber.sh` 的章号平移范围加上 `notes.md`（`第N章「` 前缀里的 N）。
- **`/novel:status`**：多一行"未处理批注 X 条"。

## 7. reader.sh 与命令

`reader.sh start [端口]`：已在运行则打印地址退出 0；否则 `nohup python3 "${PLUGIN}/reader/reader.py" --dir "$(pwd)" --port 端口 > .novel/reader.log 2>&1 &`，写 `.novel/reader.pid`，等待最多 3 秒探测 `/api/project` 成功后打印 `http://127.0.0.1:端口`。`stop` 读 pid 杀进程并删 pid 文件。`status` 打印运行与否和地址。端口默认 8765，被占用时报错并提示换端口。

`/novel:read [端口]`：运行 `reader.sh start`，把地址给用户，说明批注攒够后运行 `/novel:revise N`；`/novel:read stop` 停止。`allowed-tools` 只放 `Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*)`。

## 8. 错误处理

- 引用在文件里找不到（作者手改了正文）：界面里该位置显示"未定位"并给出引用文字；editor 处理时若找不到引用，标"未处理：原文已变"。
- `notes.md` 格式不合规的块：服务原样保留、界面显示为"无法解析"，不写回改动。
- 服务未启动时界面无法打开，命令层面提示重新 `/novel:read`。
- 端口占用、Python 缺失：`reader.sh` 明确报错。

## 9. 测试

- `tests/test_reader.py`（`unittest`，由 `run.sh` 调用，Python 缺失时跳过并提示）：notes 解析与写回往返、编号递增、唯一性扩展、位置追加与删除、状态更新、搜索（范围、每文件上限、前后文）、审稿报告解析、`未处理` 标记写入与重复拒绝、路径越界拒绝、只读接口不写文件。用临时目录复制 `fixtures/demo-novel`。
- `reader.sh`：shell 测试 start/status/stop 往返和端口占用报错。
- `context.sh` 作者批注段、`renumber.sh` 平移 notes.md：加 shell 测试。
- 界面：无自动化测试；验收时在 Chrome 里完成一次完整操作（选中、批注、跨章查找并加入、标审稿未处理），然后 `/novel:revise N` 消费批注。

## 10. 验收

在 `~/tmp/novel-e2e-sanguo` 上：`/novel:read` 启动；对第 5 章选一处批注；查找同一词加入第 4 章的命中；给一条审稿条目标未处理；`notes.md` 和 `reviews/Chapter-05.md` 内容符合第 3、4 节格式；`/novel:revise 5` 处理该批注并在 `notes.md` 标已处理；`/novel:status` 显示批注计数。
