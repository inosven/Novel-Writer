# NovelWriter Claude Code Plugin 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在仓库里新建 `plugin/`，一个题材无关的 Claude Code plugin，用故事账本和脚本组装的确定性上下文支持逐章写、审、改、定稿。

**Architecture:** 所有状态是小说目录里的 Markdown 文件。七个命令是 `plugin/commands/*.md`，四个子代理在 `plugin/agents/`，两个 skill 定义账本格式和写作通则，三个 bash 脚本负责确定性地组装上下文、校验账本、数字数。没有任何 LLM 调用代码。

**Tech Stack:** Claude Code plugin 格式（commands、agents、skills、hooks）、bash 3.2 兼容脚本、perl 5（CJK 计数与截取）、shell 测试脚本。

**Spec:** `docs/superpowers/specs/2026-09-17-claude-code-plugin-design.md`

## Global Constraints

- 脚本必须在 macOS 自带 bash 3.2 下运行：不用关联数组、`mapfile`、`${var,,}`、`|&`。
- 中文计数与截取只用 perl（`perl -CSD`），不用 awk 或 grep 的 Unicode 类。
- plugin 本体（commands、agents、skills、scripts、hooks）不得出现任何具体时代、地域、流派、作家名。题材相关内容只能在 `templates/skills/<pack>/` 下。
- 章节文件名 `Chapter-NN.md`，两位零填充，1-based。
- `bible/state.md` 第一行固定为 `# 故事状态（截至第N章）`。
- 分段标记固定为 `===== 段名 =====`。
- 只有 `/novel:finalize` 修改 `bible/`。
- 与 spec 的两处偏差（已确认）：子代理不给 Bash 工具，字数由钩子上报；本地加载用 `claude --plugin-dir ./plugin`，不写 `.claude/settings.json`。
- 每个任务结束提交一次，提交信息末尾加两行：`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` 和 `Claude-Session: https://claude.ai/code/session_015A3fd7JLDzuWiAwuvBJtuk`。
- 工作分支 `claude-code-plugin`。

---

## 文件结构

```
plugin/
├── .claude-plugin/plugin.json          Task 1
├── scripts/
│   ├── wordcount.sh                    Task 2
│   ├── bible-check.sh                  Task 3
│   └── context.sh                      Task 4
├── tests/
│   ├── run.sh                          Task 2-4 逐步扩充
│   └── fixtures/demo-novel/            Task 2
├── hooks/
│   ├── hooks.json                      Task 5
│   └── wordcount-hook.sh               Task 5
├── skills/
│   ├── story-bible/SKILL.md            Task 6
│   └── novel-writing/SKILL.md          Task 6
├── agents/
│   ├── writer.md                       Task 7
│   ├── reviewer.md                     Task 7
│   ├── editor.md                       Task 7
│   └── archivist.md                    Task 7
├── templates/
│   ├── novel.yaml                      Task 8
│   ├── CLAUDE.md                       Task 8
│   ├── bible/{state,threads,timeline,facts}.md   Task 8
│   └── skills/
│       ├── general/                    Task 9
│       └── sanguo-xuanyi/              Task 10（从 templates/default-project 移入）
└── commands/
    ├── status.md                       Task 11
    ├── init.md                         Task 11
    ├── write.md                        Task 12
    ├── review.md                       Task 12
    ├── revise.md                       Task 12
    ├── finalize.md                     Task 12
    └── plan.md                         Task 13
README.md                               Task 14
```

每个脚本一个职责：`wordcount.sh` 只数字，`bible-check.sh` 只校验，`context.sh` 只拼上下文。命令文件只做编排，不含格式知识；格式知识在两个 skill 里。

---

### Task 1: plugin 骨架与 manifest

**Files:**
- Create: `plugin/.claude-plugin/plugin.json`
- Create: `plugin/.gitkeep` 占位目录：`plugin/commands/`、`plugin/agents/`、`plugin/skills/`、`plugin/scripts/`、`plugin/hooks/`、`plugin/templates/`、`plugin/tests/`

**Interfaces:**
- Produces: plugin 名 `novel`，命令前缀 `/novel:`，子代理名 `novel:writer` 等。

- [ ] **Step 1: 创建 manifest**

```bash
mkdir -p plugin/.claude-plugin plugin/commands plugin/agents plugin/skills plugin/scripts plugin/hooks plugin/templates plugin/tests
cat > plugin/.claude-plugin/plugin.json <<'EOF'
{
  "name": "novel",
  "displayName": "NovelWriter",
  "version": "0.1.0",
  "description": "AI 辅助长篇小说写作：规划、逐章写作、审稿、修订、故事账本",
  "license": "MIT",
  "keywords": ["novel", "writing", "fiction"]
}
EOF
```

- [ ] **Step 2: 验证 manifest 能被识别**

Run: `claude --plugin-dir ./plugin -p "回复 ok" --output-format json --bare 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("result"))'`

注意 `--bare` 不读订阅登录，需要 `ANTHROPIC_API_KEY`；没有 key 时改用不带 `--bare` 的命令：`claude --plugin-dir ./plugin -p "回复 ok"`。
Expected: 输出 `ok`，且 stderr 没有 plugin 加载错误。

- [ ] **Step 3: 提交**

```bash
git add plugin
git commit -m "feat(plugin): add manifest and directory skeleton

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015A3fd7JLDzuWiAwuvBJtuk"
```

---

### Task 2: fixture 小说与 wordcount.sh

**Files:**
- Create: `plugin/tests/fixtures/demo-novel/novel.yaml`
- Create: `plugin/tests/fixtures/demo-novel/outline.md`
- Create: `plugin/tests/fixtures/demo-novel/characters/林砚.md`、`characters/周远.md`、`characters/老陈.md`
- Create: `plugin/tests/fixtures/demo-novel/chapters/Chapter-01.md`、`Chapter-02.md`
- Create: `plugin/tests/fixtures/demo-novel/summaries/Chapter-01.md`、`Chapter-02.md`
- Create: `plugin/tests/fixtures/demo-novel/bible/state.md`、`threads.md`、`timeline.md`、`facts.md`
- Create: `plugin/tests/fixtures/demo-novel/.claude/skills/general/writing-method.md`、`output-style.md`、`review-rules.md`（fixture 里用三行占位即可，真正的通用包在 Task 9）
- Create: `plugin/scripts/wordcount.sh`
- Create: `plugin/tests/run.sh`

**Interfaces:**
- Produces: `wordcount.sh FILE` → stdout 一个整数，CJK 字符数，不含第一行标题。退出码 0；文件不存在退出码 1。
- Produces: `tests/run.sh` 测试框架函数 `assert_eq`、`assert_exit`、`assert_contains`。

- [ ] **Step 1: 写 fixture 小说**

fixture 是一部现代都市短篇，避免与三国包混淆。

`plugin/tests/fixtures/demo-novel/novel.yaml`:
```yaml
title: 夜班
skill: general
chapter_words: [300, 800]
pov: 第三人称限知
```

`plugin/tests/fixtures/demo-novel/outline.md`:
```markdown
# 夜班

## 故事前提
林砚是一家 24 小时便利店的夜班店员。一个雨夜，常客周远留下一把钥匙后再没出现。林砚想把钥匙还回去，却发现周远的住址是一栋早已拆除的楼。

## 主题
陌生人之间微弱却真实的牵连。

## 章节大纲

### 第1章: 钥匙
**摘要**: 雨夜，周远买了一包烟，把一把铜钥匙放在收银台上说"帮我收着"，然后走进雨里。林砚下班时发现钥匙还在。
**关键事件**:
- 周远留下钥匙
- 林砚决定暂时收着
**出场角色**: 林砚, 周远

### 第2章: 地址
**摘要**: 周远三天没来。林砚从会员登记找到他的地址，下班后去找，发现那个门牌号是一片拆迁空地。老陈告诉她那栋楼去年就拆了。
**关键事件**:
- 林砚查到地址
- 地址是空地
- 老陈提到楼去年拆除
**出场角色**: 林砚, 老陈

### 第3章: 夜里的电话
**摘要**: 便利店座机深夜响起，对方沉默后挂断。林砚回拨，是一个已停机的号码。她把钥匙挂在了自己的钥匙串上。
**关键事件**:
- 深夜来电
- 回拨停机
- 钥匙挂上钥匙串
**出场角色**: 林砚

### 第4章: 老陈的旧事
**摘要**: 老陈说起那栋楼里住过一个开锁匠。
**关键事件**:
- 开锁匠的旧事
**出场角色**: 林砚, 老陈

### 第5章: 锁
**摘要**: 林砚在拆迁空地找到一扇没拆的铁门，钥匙能打开。
**关键事件**:
- 找到铁门
**出场角色**: 林砚

### 第6章: 天亮
**摘要**: 门后是一间空屋，桌上有一封给"夜班店员"的信。
**关键事件**:
- 读信
**出场角色**: 林砚, 周远
```

`plugin/tests/fixtures/demo-novel/characters/林砚.md`:
```markdown
# 林砚

## 基础信息
女，26 岁，便利店夜班店员，独居。左手腕有一道浅疤，是小时候摔的。

## 性格
话少，观察细，对陌生人保持距离但不冷漠。有把小事做到底的执拗。

## 说话方式
短句，很少用感叹号。会用"嗯"代替很多回答。

## 背景
从外地来这座城市三年，家里人不知道她上夜班。

## 弧光
从"收着别人的东西只是顺手"到"决定替一个不认识的人守住一件事"。
```

`plugin/tests/fixtures/demo-novel/characters/周远.md`:
```markdown
# 周远

## 基础信息
男，看上去四十岁上下，总穿一件深灰色夹克。只买同一种烟。

## 性格
沉默，礼貌，眼神总像在看别处。

## 说话方式
每句话都很短，说完就走。

## 背景
不详。会员登记的地址是拆迁区。
```

`plugin/tests/fixtures/demo-novel/characters/老陈.md`:
```markdown
# 老陈

## 基础信息
男，60 岁左右，在拆迁区看门。

## 性格
爱聊天，记性好，对这片地方的旧事如数家珍。

## 说话方式
喜欢从"我跟你说"开头。
```

`plugin/tests/fixtures/demo-novel/chapters/Chapter-01.md`:
```markdown
# 第1章 钥匙

雨从傍晚就没停过。玻璃门上的水痕一道一道往下淌，把街对面的路灯拉成一条条歪斜的线。

十一点四十，门上的铃响了。周远走进来，夹克肩头湿了一片。他没有看货架，径直走到收银台前。

"一包。"

林砚转身从柜子里拿出那种烟。三年来他只买这一种。她把烟放在台上，他把钱放下，然后从口袋里摸出一把钥匙，放在烟旁边。

铜的，齿口磨得发亮。

"帮我收着。"

林砚抬头。他已经转身了，铃又响了一下，人走进雨里。

她低头看那把钥匙，没有动。过了一会儿，她把它推到收银台内侧，压在一叠找零的硬币下面。

凌晨六点交班，硬币下面的钥匙还在。她盯着看了几秒，把它装进了围裙口袋。
```

`plugin/tests/fixtures/demo-novel/chapters/Chapter-02.md`:
```markdown
# 第2章 地址

周远三天没来。

第四天夜里店里没人，林砚打开会员系统，输入那个烟的条码，跳出来一个名字和一个地址：周远，青石路 47 号 3 单元 502。

下班后她没回家。青石路在城北，公交要坐四十分钟。

47 号不是一栋楼。是一片围起来的空地，围挡上刷着"拆迁区域，禁止入内"。她沿着围挡走了一圈，找到一个开着的小门，门口坐着一个老人在听收音机。

"找人？"老人问。

"青石路 47 号。"

"我跟你说，47 号去年三月就拆了。"老人把收音机声音拧小，"你找谁？"

林砚没有回答。她把手伸进口袋，握住那把钥匙，钥匙已经被她的体温焐热了。

"没事。"她说，"走错了。"

回去的公交上，她把钥匙拿出来看。齿口上有一点黑，像是很多年前的油。
```

`plugin/tests/fixtures/demo-novel/summaries/Chapter-01.md`:
```markdown
# 第1章 摘要

## 情节
雨夜，常客周远买了烟，把一把铜钥匙放在收银台上说"帮我收着"后离开。林砚交班时钥匙仍在，她把钥匙装进围裙口袋。

## 状态变化
- 林砚：持有周远的铜钥匙；决定暂时收着
- 周远：离开便利店，去向不明

## 新设定
- 铜钥匙：齿口磨亮，周远所留

## 出场角色
林砚, 周远
```

`plugin/tests/fixtures/demo-novel/summaries/Chapter-02.md`:
```markdown
# 第2章 摘要

## 情节
周远三天未来。林砚从会员系统查到地址青石路 47 号，下班后前往，发现是拆迁空地。看门的老人说 47 号去年三月已拆除。林砚未说明来意便离开。

## 状态变化
- 林砚：知道周远登记地址是已拆除的楼；仍持有钥匙；对老陈隐瞒了来意
- 老陈：见过林砚一次，不知道她找谁

## 新设定
- 青石路 47 号：去年三月拆除，现为围挡空地
- 钥匙齿口有陈年油渍

## 出场角色
林砚, 老陈
```

`plugin/tests/fixtures/demo-novel/bible/state.md`:
```markdown
# 故事状态（截至第2章）

## 时间地点
- 故事时间：第2章结束于周远失踪后第四天清晨
- 当前场景：林砚从青石路返回的公交上

## 角色状态

### 林砚
- 所在：返回市区的公交上
- 处境：仍在上夜班；开始主动寻找周远
- 所知：知道周远登记地址是青石路 47 号；知道该楼去年三月已拆；不知道周远去了哪里
- 所持：铜钥匙
- 伤病：无

### 周远
- 所在：不明
- 处境：三天未出现在便利店
- 所知：不明
- 所持：无
- 伤病：无

### 老陈
- 所在：青石路拆迁区看门处
- 处境：日常看门
- 所知：见过林砚，不知道她找谁；知道 47 号去年拆除
- 所持：收音机
- 伤病：无
```

`plugin/tests/fixtures/demo-novel/bible/threads.md`:
```markdown
# 伏笔与悬念

| 编号 | 内容 | 引入章 | 预计回收 | 状态 |
|---|---|---|---|---|
| T1 | 钥匙开的是什么锁 | 1 | 5 | 未收 |
| T2 | 周远为什么把钥匙交给林砚 | 1 | 6 | 未收 |
| T3 | 47 号楼里住过谁 | 2 | 4 | 未收 |
```

`plugin/tests/fixtures/demo-novel/bible/timeline.md`:
```markdown
# 时间线

## 第1章
- 某雨夜 23:40，便利店：周远留下钥匙离开
- 次日 06:00：林砚交班，收起钥匙

## 第2章
- 周远失踪后第四天夜里，便利店：林砚查到地址
- 同日清晨，青石路 47 号：林砚发现是拆迁空地，与老陈对话
```

`plugin/tests/fixtures/demo-novel/bible/facts.md`:
```markdown
# 硬设定

## 人物固定属性
- 林砚：女，26 岁，左手腕有浅疤，来这座城市三年
- 周远：男，约 40 岁，深灰色夹克，只买一种烟
- 老陈：男，约 60 岁，拆迁区看门人

## 地点
- 便利店：24 小时营业，林砚值夜班 22:00 到 06:00
- 青石路 47 号：城北，去年三月拆除，现为围挡空地，公交约 40 分钟

## 物品
- 铜钥匙：齿口磨亮，有陈年油渍

## 规则
- 会员系统按商品条码可查购买者登记信息
```

`plugin/tests/fixtures/demo-novel/.claude/skills/general/writing-method.md`:
```markdown
# 写作方法（fixture 占位）
每章围绕一个核心事件推进。
```

`plugin/tests/fixtures/demo-novel/.claude/skills/general/output-style.md`:
```markdown
# 文风规范（fixture 占位）
短句为主。
```

`plugin/tests/fixtures/demo-novel/.claude/skills/general/review-rules.md`:
```markdown
# 审稿规则（fixture 占位）
检查人物所知是否与账本一致。
```

- [ ] **Step 2: 写测试框架和 wordcount 的失败测试**

`plugin/tests/run.sh`:
```bash
#!/usr/bin/env bash
# 运行 plugin 脚本测试。用法：bash plugin/tests/run.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
PLUGIN="$(cd "$HERE/.." && pwd)"
SCRIPTS="$PLUGIN/scripts"
FIXTURE_SRC="$HERE/fixtures/demo-novel"
PASS=0
FAIL=0

# 每个测试在 fixture 的临时副本里跑，避免污染
make_novel() {
  local tmp
  tmp="$(mktemp -d)"
  cp -R "$FIXTURE_SRC/." "$tmp/"
  echo "$tmp"
}

assert_eq() { # desc expected actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "FAIL: $1"; echo "  expected: $2"; echo "  actual:   $3"; fi
}
assert_exit() { # desc expected_code actual_code
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "FAIL: $1 (exit expected $2, got $3)"; fi
}
assert_contains() { # desc needle haystack
  case "$3" in *"$2"*) PASS=$((PASS+1));; *) FAIL=$((FAIL+1)); echo "FAIL: $1 (missing: $2)";; esac
}
assert_not_contains() { # desc needle haystack
  case "$3" in *"$2"*) FAIL=$((FAIL+1)); echo "FAIL: $1 (unexpected: $2)";; *) PASS=$((PASS+1));; esac
}

# ---------- wordcount.sh ----------
test_wordcount() {
  local n
  n="$(bash "$SCRIPTS/wordcount.sh" "$FIXTURE_SRC/chapters/Chapter-01.md")"
  assert_eq "wordcount 第1章" "292" "$n"
  bash "$SCRIPTS/wordcount.sh" "$FIXTURE_SRC/chapters/Chapter-99.md" >/dev/null 2>&1
  assert_exit "wordcount 缺文件" 1 $?
}

test_wordcount

echo "passed: $PASS, failed: $FAIL"
[ "$FAIL" -eq 0 ]
```

第 1 章的 CJK 数需要实测得到。写完 fixture 后运行：
`perl -CSD -ne '$. > 1 and $n += () = /\p{Han}/g; END { print $n, "\n" }' plugin/tests/fixtures/demo-novel/chapters/Chapter-01.md`
把输出的数字替换掉上面的 `292`。

- [ ] **Step 3: 运行测试确认失败**

Run: `bash plugin/tests/run.sh`
Expected: `FAIL: wordcount 第1章`（脚本不存在，输出为空）。

- [ ] **Step 4: 写 wordcount.sh**

`plugin/scripts/wordcount.sh`:
```bash
#!/usr/bin/env bash
# 用法：wordcount.sh FILE
# 输出文件中 CJK 汉字数量，不含第一行（章节标题）。
set -u
if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "用法: wordcount.sh FILE（文件必须存在）" >&2
  exit 1
fi
perl -CSD -ne '$. > 1 and $n += () = /\p{Han}/g; END { print +($n || 0), "\n" }' "$1"
```

`chmod +x plugin/scripts/wordcount.sh`

- [ ] **Step 5: 运行测试确认通过**

Run: `bash plugin/tests/run.sh`
Expected: `passed: 2, failed: 0`

- [ ] **Step 6: 提交**

```bash
git add plugin/scripts/wordcount.sh plugin/tests
git commit -m "feat(plugin): add fixture novel and wordcount script with tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015A3fd7JLDzuWiAwuvBJtuk"
```

---

### Task 3: bible-check.sh

**Files:**
- Create: `plugin/scripts/bible-check.sh`
- Modify: `plugin/tests/run.sh`（追加 `test_bible_check`）

**Interfaces:**
- Produces: `bible-check.sh [DIR]` 在小说目录（默认当前目录）校验账本。全部通过时 stdout 输出 `账本校验通过（截至第N章）`，退出码 0；否则 stderr 逐条列出问题，退出码 1。
- Produces: 供 `context.sh` 复用的约定：账本"截至"章号通过 `sed -n '1s/.*截至第\([0-9][0-9]*\)章.*/\1/p' bible/state.md` 获取。

- [ ] **Step 1: 追加失败测试**

在 `plugin/tests/run.sh` 的 `test_wordcount` 调用之前插入：

```bash
# ---------- bible-check.sh ----------
test_bible_check() {
  local d out code
  d="$(make_novel)"
  out="$(cd "$d" && bash "$SCRIPTS/bible-check.sh" 2>&1)"; code=$?
  assert_exit "bible-check fixture 通过" 0 "$code"
  assert_contains "bible-check 输出截至" "截至第2章" "$out"

  # 删掉一份摘要 → 摘要数 < 截至章号
  rm "$d/summaries/Chapter-02.md"
  out="$(cd "$d" && bash "$SCRIPTS/bible-check.sh" 2>&1)"; code=$?
  assert_exit "bible-check 摘要缺失" 1 "$code"
  assert_contains "bible-check 报告摘要缺失" "summaries" "$out"

  # 第一行格式坏 → 报错
  d="$(make_novel)"
  printf '# 故事状态\n' > "$d/bible/state.md"
  out="$(cd "$d" && bash "$SCRIPTS/bible-check.sh" 2>&1)"; code=$?
  assert_exit "bible-check 首行格式" 1 "$code"
  assert_contains "bible-check 报告首行" "第一行" "$out"

  # 截至章号 > 正文最大章号 → 报错
  d="$(make_novel)"
  sed -i '' '1s/第2章/第5章/' "$d/bible/state.md"
  out="$(cd "$d" && bash "$SCRIPTS/bible-check.sh" 2>&1)"; code=$?
  assert_exit "bible-check 截至超前" 1 "$code"

  # threads 状态非法 → 报错
  d="$(make_novel)"
  sed -i '' 's/| 未收 |/| 待定 |/' "$d/bible/threads.md"
  out="$(cd "$d" && bash "$SCRIPTS/bible-check.sh" 2>&1)"; code=$?
  assert_exit "bible-check threads 状态" 1 "$code"
  assert_contains "bible-check 报告 threads" "threads" "$out"

  # 缺文件 → 报错
  d="$(make_novel)"
  rm "$d/bible/facts.md"
  out="$(cd "$d" && bash "$SCRIPTS/bible-check.sh" 2>&1)"; code=$?
  assert_exit "bible-check 缺 facts" 1 "$code"
}
```

并在文件底部 `test_wordcount` 之后加一行 `test_bible_check`。

注意 `sed -i ''` 是 macOS 写法。若在 Linux 上跑测试，改为 `sed -i`。

- [ ] **Step 2: 运行测试确认失败**

Run: `bash plugin/tests/run.sh`
Expected: 多条 `FAIL: bible-check ...`。

- [ ] **Step 3: 写 bible-check.sh**

`plugin/scripts/bible-check.sh`:
```bash
#!/usr/bin/env bash
# 用法：bible-check.sh [小说目录]
# 校验 bible/ 四个文件的格式与一致性。全部通过退出 0，否则列出所有问题并退出 1。
set -u
DIR="${1:-.}"
cd "$DIR" || { echo "目录不存在: $DIR" >&2; exit 1; }

problems=""
add() { problems="${problems}- $1
"; }

for f in state threads timeline facts; do
  [ -f "bible/$f.md" ] || add "缺少 bible/$f.md"
done

upto=""
if [ -f bible/state.md ]; then
  upto="$(sed -n '1s/^# 故事状态（截至第\([0-9][0-9]*\)章）$/\1/p' bible/state.md)"
  if [ -z "$upto" ]; then
    add "bible/state.md 第一行必须是「# 故事状态（截至第N章）」"
  fi
fi

if [ -n "$upto" ]; then
  max_ch=0
  for f in chapters/Chapter-*.md; do
    [ -f "$f" ] || continue
    n="$(echo "$f" | sed -n 's/.*Chapter-\([0-9][0-9]*\)\.md$/\1/p' | sed 's/^0*//')"
    [ -z "$n" ] && n=0
    [ "$n" -gt "$max_ch" ] && max_ch="$n"
  done
  if [ "$upto" -gt "$max_ch" ]; then
    add "账本截至第${upto}章，但 chapters/ 最大只有第${max_ch}章"
  fi

  sum_count=0
  for f in summaries/Chapter-*.md; do
    [ -f "$f" ] && sum_count=$((sum_count+1))
  done
  if [ "$sum_count" -lt "$upto" ]; then
    add "账本截至第${upto}章，但 summaries/ 只有 ${sum_count} 份摘要"
  fi
fi

if [ -f bible/threads.md ]; then
  # 表格数据行：以 | T 开头。状态列是最后一个非空单元格。
  bad="$(grep '^| *T[0-9]' bible/threads.md | awk -F'|' '{
    s=$(NF-1); gsub(/^ +| +$/, "", s);
    if (s != "未收" && s != "放弃" && s !~ /^已收（第[0-9]+章）$/) print s
  }')"
  if [ -n "$bad" ]; then
    add "bible/threads.md 有非法状态值: $(echo "$bad" | tr '\n' ' ')（允许：未收 / 放弃 / 已收（第N章））"
  fi
fi

if [ -n "$problems" ]; then
  printf '账本校验失败：\n%s' "$problems" >&2
  exit 1
fi
echo "账本校验通过（截至第${upto}章）"
```

`chmod +x plugin/scripts/bible-check.sh`

- [ ] **Step 4: 运行测试确认通过**

Run: `bash plugin/tests/run.sh`
Expected: `passed: 13, failed: 0`（2 个 wordcount + 11 个 bible-check）。

- [ ] **Step 5: 提交**

```bash
git add plugin/scripts/bible-check.sh plugin/tests/run.sh
git commit -m "feat(plugin): add bible-check script with tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015A3fd7JLDzuWiAwuvBJtuk"
```

---

### Task 4: context.sh

**Files:**
- Create: `plugin/scripts/context.sh`
- Modify: `plugin/tests/run.sh`（追加 `test_context`）

**Interfaces:**
- Consumes: 账本"截至"章号的 sed 表达式（Task 3）。
- Produces: `context.sh N write|review` 在小说目录运行，stdout 输出分段上下文，段头 `===== 段名 =====`。段名固定为：`项目信息`、`故事账本`、`本章大纲`、`出场角色档案`、`上一章末尾`、`前文摘要`、`题材包`、`本章正文`、`关键词检索`。前置检查失败 stderr 说明原因、退出码 1。

- [ ] **Step 1: 追加失败测试**

在 `plugin/tests/run.sh` 中 `test_bible_check` 函数之后插入：

```bash
# ---------- context.sh ----------
test_context() {
  local d out code
  d="$(make_novel)"

  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 3 write 2>&1)"; code=$?
  assert_exit "context write 通过" 0 "$code"
  assert_contains "context 项目信息" "===== 项目信息 =====" "$out"
  assert_contains "context 账本" "===== 故事账本 =====" "$out"
  assert_contains "context 账本内容" "截至第2章" "$out"
  assert_contains "context 本章大纲" "### 第3章: 夜里的电话" "$out"
  assert_not_contains "context 大纲不含第4章" "### 第4章" "$out"
  assert_contains "context 角色档案" "===== 出场角色档案 =====" "$out"
  assert_contains "context 林砚档案" "左手腕有一道浅疤" "$out"
  assert_not_contains "context 不含老陈档案" "记性好" "$out"
  assert_contains "context 上一章末尾" "===== 上一章末尾 =====" "$out"
  assert_contains "context 上一章末尾内容" "像是很多年前的油" "$out"
  assert_contains "context 前文摘要" "# 第2章 摘要" "$out"
  assert_contains "context 题材包" "===== 题材包 =====" "$out"
  assert_contains "context writing-method" "每章围绕一个核心事件推进" "$out"
  assert_not_contains "context write 不含审稿规则" "检查人物所知" "$out"
  assert_not_contains "context write 不含正文段" "===== 本章正文 =====" "$out"

  # 第1章：无上一章末尾、无前文摘要
  out="$(cd "$d" && sed -i '' '1s/第2章/第0章/' bible/state.md && bash "$SCRIPTS/context.sh" 1 write 2>&1)"; code=$?
  assert_exit "context 第1章通过" 0 "$code"
  assert_not_contains "context 第1章无上一章" "===== 上一章末尾 =====" "$out"

  # 账本停在第1章时写第3章 → 拒绝
  d="$(make_novel)"
  sed -i '' '1s/第2章/第1章/' "$d/bible/state.md"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 3 write 2>&1)"; code=$?
  assert_exit "context 账本落后拒绝" 1 "$code"
  assert_contains "context 账本落后提示" "截至" "$out"
  assert_contains "context 账本落后提示 finalize" "finalize" "$out"

  # review 模式：正文不存在 → 拒绝
  d="$(make_novel)"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 3 review 2>&1)"; code=$?
  assert_exit "context review 缺正文拒绝" 1 "$code"

  # review 模式：有正文 → 含正文段、审稿规则、关键词检索
  printf '# 第3章 夜里的电话\n\n林砚在深夜接到电话。\n' > "$d/chapters/Chapter-03.md"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 3 review 2>&1)"; code=$?
  assert_exit "context review 通过" 0 "$code"
  assert_contains "context review 正文" "===== 本章正文 =====" "$out"
  assert_contains "context review 正文内容" "林砚在深夜接到电话" "$out"
  assert_contains "context review 审稿规则" "检查人物所知" "$out"
  assert_contains "context review 检索段" "===== 关键词检索 =====" "$out"
  assert_contains "context review 检索命中" "[第1章]" "$out"

  # 大纲无第 N 章 → 拒绝
  d="$(make_novel)"
  sed -i '' '1s/第2章/第6章/' "$d/bible/state.md"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 7 write 2>&1)"; code=$?
  assert_exit "context 大纲缺章拒绝" 1 "$code"
  assert_contains "context 大纲缺章提示" "outline.md" "$out"

  # 题材包目录不存在 → 拒绝
  d="$(make_novel)"
  rm -r "$d/.claude/skills/general"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 3 write 2>&1)"; code=$?
  assert_exit "context 题材包缺失拒绝" 1 "$code"

  # 缺 novel.yaml → 拒绝
  d="$(make_novel)"
  rm "$d/novel.yaml"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 3 write 2>&1)"; code=$?
  assert_exit "context 缺 novel.yaml 拒绝" 1 "$code"

  # 参数错误 → 拒绝
  out="$(cd "$FIXTURE_SRC" && bash "$SCRIPTS/context.sh" 3 2>&1)"; code=$?
  assert_exit "context 参数缺失" 1 "$code"
}
```

底部加 `test_context`。

- [ ] **Step 2: 运行测试确认失败**

Run: `bash plugin/tests/run.sh`
Expected: 多条 `FAIL: context ...`。

- [ ] **Step 3: 写 context.sh**

`plugin/scripts/context.sh`:
```bash
#!/usr/bin/env bash
# 用法：context.sh N write|review
# 在小说目录下运行。确定性地组装写作/审稿第 N 章所需的全部上下文，输出到 stdout。
# 前置检查失败时把原因写到 stderr 并退出 1。
set -u

die() { echo "$*" >&2; exit 1; }
section() { printf '\n===== %s =====\n' "$1"; }

[ $# -eq 2 ] || die "用法: context.sh N write|review"
N="$1"; MODE="$2"
case "$N" in ''|*[!0-9]*) die "章号必须是数字: $N";; esac
[ "$MODE" = write ] || [ "$MODE" = review ] || die "模式必须是 write 或 review: $MODE"

[ -f novel.yaml ] || die "当前目录没有 novel.yaml，请先在小说目录里运行，或用 /novel:init 初始化"
[ -f outline.md ] || die "缺少 outline.md，请先运行 /novel:plan"
[ -f bible/state.md ] || die "缺少 bible/state.md"

NN="$(printf '%02d' "$N")"
PREV=$((N-1))
PREV_NN="$(printf '%02d' "$PREV")"

SKILL="$(sed -n 's/^skill:[[:space:]]*\([^[:space:]#]*\).*/\1/p' novel.yaml | head -1)"
[ -n "$SKILL" ] || die "novel.yaml 缺少 skill 字段"
SKILL_DIR=".claude/skills/$SKILL"
[ -d "$SKILL_DIR" ] || die "题材包目录不存在: $SKILL_DIR（novel.yaml 的 skill 字段指向它）"

UPTO="$(sed -n '1s/^# 故事状态（截至第\([0-9][0-9]*\)章）$/\1/p' bible/state.md)"
[ -n "$UPTO" ] || die "bible/state.md 第一行必须是「# 故事状态（截至第N章）」"

if [ "$MODE" = write ] && [ "$UPTO" -ne "$PREV" ]; then
  die "账本截至第${UPTO}章，但要写第${N}章。写第${N}章要求账本恰好停在第${PREV}章：请先对第$((UPTO+1))章运行 /novel:finalize，或检查章号。"
fi

if [ "$MODE" = review ] && [ ! -f "chapters/Chapter-$NN.md" ]; then
  die "chapters/Chapter-$NN.md 不存在，无法审稿"
fi

# 本章大纲条目：从 "### 第N章" 到下一个 "### " 之前
ENTRY="$(awk -v n="$N" '
  /^### / { if (on) exit; if ($0 ~ "^### 第" n "章") on=1 }
  on { print }
' outline.md)"
[ -n "$ENTRY" ] || die "outline.md 里找不到「### 第${N}章」条目"

# 出场角色：取 **出场角色**: 之后的内容，按 , ， 、 分割
CHARS="$(printf '%s\n' "$ENTRY" | sed -n 's/^\*\*出场角色\*\*[：:][[:space:]]*//p' | head -1 | tr ',，、' '\n\n\n' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep -v '^$')"

# ---------- 输出 ----------
section "项目信息"
cat novel.yaml

section "故事账本"
for f in state facts threads timeline; do
  [ -f "bible/$f.md" ] && { cat "bible/$f.md"; echo; }
done

section "本章大纲"
printf '%s\n' "$ENTRY"

section "出场角色档案"
missing=""
if [ -n "$CHARS" ]; then
  printf '%s\n' "$CHARS" | while IFS= read -r name; do
    if [ -f "characters/$name.md" ]; then
      cat "characters/$name.md"; echo
    else
      echo "（未找到档案：$name）"
    fi
  done
else
  echo "（大纲未指定出场角色）"
fi

if [ "$N" -gt 1 ] && [ -f "chapters/Chapter-$PREV_NN.md" ]; then
  section "上一章末尾"
  perl -CSD -0777 -ne 'my $t=$_; $t =~ s/\s+$//; print length($t) > 800 ? "……" . substr($t, -800) : $t; print "\n"' "chapters/Chapter-$PREV_NN.md"
fi

if [ "$N" -gt 1 ]; then
  section "前文摘要"
  i=1
  while [ "$i" -lt "$N" ]; do
    f="summaries/Chapter-$(printf '%02d' "$i").md"
    [ -f "$f" ] && { cat "$f"; echo; }
    i=$((i+1))
  done
fi

section "题材包"
for f in writing-method.md output-style.md; do
  [ -f "$SKILL_DIR/$f" ] && { echo "--- $f ---"; cat "$SKILL_DIR/$f"; echo; }
done
if [ "$MODE" = review ] && [ -f "$SKILL_DIR/review-rules.md" ]; then
  echo "--- review-rules.md ---"; cat "$SKILL_DIR/review-rules.md"; echo
fi

if [ "$MODE" = review ]; then
  section "本章正文"
  cat "chapters/Chapter-$NN.md"

  section "关键词检索"
  echo "（本章出场角色名在第1到第${PREV}章正文中的出现位置，每个名字最多 5 处）"
  if [ -n "$CHARS" ]; then
    printf '%s\n' "$CHARS" | while IFS= read -r name; do
      i=1
      while [ "$i" -lt "$N" ]; do
        f="chapters/Chapter-$(printf '%02d' "$i").md"
        if [ -f "$f" ]; then
          NAME="$name" CH="$i" perl -CSD -0777 -ne '
            my $name = $ENV{NAME}; my $ch = $ENV{CH}; my $k = 0;
            while (/\Q$name\E/g) {
              last if ++$k > 5;
              my $s = pos($_) - length($name) - 80; $s = 0 if $s < 0;
              my $e = pos($_) + 80; $e = length($_) if $e > length($_);
              my $snip = substr($_, $s, $e - $s); $snip =~ s/\s+/ /g;
              print "[第${ch}章] …${snip}…\n";
            }
          ' "$f"
        fi
        i=$((i+1))
      done
    done
  fi
fi
```

`chmod +x plugin/scripts/context.sh`

- [ ] **Step 4: 运行测试确认通过**

Run: `bash plugin/tests/run.sh`
Expected: `passed: 44, failed: 0`。若某条 `assert_contains` 失败，先手动运行 `cd plugin/tests/fixtures/demo-novel && bash ../../../scripts/context.sh 3 write` 看实际输出再修。

- [ ] **Step 5: 提交**

```bash
git add plugin/scripts/context.sh plugin/tests/run.sh
git commit -m "feat(plugin): add deterministic context assembly script with tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015A3fd7JLDzuWiAwuvBJtuk"
```

---

### Task 5: 字数钩子

**Files:**
- Create: `plugin/hooks/hooks.json`
- Create: `plugin/hooks/wordcount-hook.sh`
- Modify: `plugin/tests/run.sh`（追加 `test_hook`）

**Interfaces:**
- Consumes: `wordcount.sh`（Task 2）。
- Produces: PostToolUse 钩子，Write 或 Edit 的目标在 `chapters/Chapter-NN.md` 时，向 Claude 返回 `additionalContext`：`第N章当前 X 字，目标 A 到 B 字。`，超出区间追加提醒。其他路径静默退出 0。

- [ ] **Step 1: 追加失败测试**

```bash
# ---------- wordcount-hook.sh ----------
test_hook() {
  local d out
  d="$(make_novel)"
  out="$(cd "$d" && printf '{"tool_name":"Write","tool_input":{"file_path":"%s/chapters/Chapter-01.md"},"cwd":"%s"}' "$d" "$d" | bash "$PLUGIN/hooks/wordcount-hook.sh")"
  assert_contains "hook 报字数" "第1章当前" "$out"
  assert_contains "hook 报目标" "目标 300 到 800 字" "$out"
  assert_contains "hook 是 JSON" '"additionalContext"' "$out"
  assert_not_contains "hook 区间内不提醒" "超出" "$out"

  # 非章节文件 → 无输出
  out="$(cd "$d" && printf '{"tool_name":"Write","tool_input":{"file_path":"%s/outline.md"},"cwd":"%s"}' "$d" "$d" | bash "$PLUGIN/hooks/wordcount-hook.sh")"
  assert_eq "hook 非章节静默" "" "$out"

  # 字数不足 → 提醒
  printf '# 第3章 x\n\n短。\n' > "$d/chapters/Chapter-03.md"
  out="$(cd "$d" && printf '{"tool_name":"Write","tool_input":{"file_path":"%s/chapters/Chapter-03.md"},"cwd":"%s"}' "$d" "$d" | bash "$PLUGIN/hooks/wordcount-hook.sh")"
  assert_contains "hook 不足提醒" "低于目标" "$out"
}
```

底部加 `test_hook`。

- [ ] **Step 2: 运行确认失败**

Run: `bash plugin/tests/run.sh`
Expected: `FAIL: hook ...`。

- [ ] **Step 3: 写钩子脚本和 hooks.json**

`plugin/hooks/wordcount-hook.sh`:
```bash
#!/usr/bin/env bash
# PostToolUse 钩子：Write/Edit 写入 chapters/Chapter-NN.md 后报告字数。
# 从 stdin 读 JSON，用 additionalContext 把字数返回给 Claude。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
input="$(cat)"
file="$(printf '%s' "$input" | perl -ne 'if (/"file_path"\s*:\s*"((?:[^"\\]|\\.)*)"/) { print $1; exit }')"
[ -n "$file" ] || exit 0
case "$file" in
  */chapters/Chapter-[0-9][0-9]*.md) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

n="$(echo "$file" | sed -n 's/.*Chapter-\([0-9][0-9]*\)\.md$/\1/p' | sed 's/^0*//')"
novel_dir="$(cd "$(dirname "$file")/.." && pwd)"
count="$(bash "$HERE/../scripts/wordcount.sh" "$file")"

lo=""; hi=""
if [ -f "$novel_dir/novel.yaml" ]; then
  range="$(sed -n 's/^chapter_words:[[:space:]]*\[\([0-9]*\)[[:space:]]*,[[:space:]]*\([0-9]*\)\].*/\1 \2/p' "$novel_dir/novel.yaml" | head -1)"
  lo="${range%% *}"; hi="${range##* }"
fi

msg="第${n}章当前 ${count} 字"
if [ -n "$lo" ] && [ -n "$hi" ]; then
  msg="${msg}，目标 ${lo} 到 ${hi} 字。"
  if [ "$count" -lt "$lo" ]; then msg="${msg} 低于目标下限，如果还没写完请继续，写完了请考虑补充场景。"
  elif [ "$count" -gt "$hi" ]; then msg="${msg} 超出目标上限，请考虑精简。"
  fi
else
  msg="${msg}。"
fi

printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"%s"}}\n' "$msg"
```

`chmod +x plugin/hooks/wordcount-hook.sh`

`plugin/hooks/hooks.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}\"/hooks/wordcount-hook.sh"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `bash plugin/tests/run.sh`
Expected: `passed: 50, failed: 0`。

- [ ] **Step 5: 提交**

```bash
git add plugin/hooks plugin/tests/run.sh
git commit -m "feat(plugin): add word count PostToolUse hook

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015A3fd7JLDzuWiAwuvBJtuk"
```

---

### Task 6: 两个 skill

**Files:**
- Create: `plugin/skills/story-bible/SKILL.md`
- Create: `plugin/skills/novel-writing/SKILL.md`

**Interfaces:**
- Produces: skill 名 `story-bible`、`novel-writing`，供子代理 frontmatter 的 `skills:` 预加载。两者 `user-invocable: false`，不出现在 `/` 菜单。

- [ ] **Step 1: 写 story-bible**

`plugin/skills/story-bible/SKILL.md`:
```markdown
---
name: story-bible
description: 故事账本 bible/ 四个文件的格式、更新规则和常见错误。更新账本或判断正文是否与账本矛盾时使用。
user-invocable: false
---

# 故事账本

账本在小说目录 `bible/` 下，四个文件。它是全书的事实来源：写作不得与它矛盾，审稿以它为准。只有 `/novel:finalize` 更新它。

## state.md 当前世界状态

第一行固定：`# 故事状态（截至第N章）`。N 是最近一次定稿的章号。

```markdown
# 故事状态（截至第3章）

## 时间地点
- 故事时间：（故事内的日期或相对时间，写清第N章结束在什么时候）
- 当前场景：（第N章结束时的地点）

## 角色状态

### 角色名
- 所在：（此刻在哪）
- 处境：（面临什么局面）
- 所知：（知道什么；不知道什么。两者都要写，"不知道"最容易被后文写漏）
- 所持：（身上有什么重要物品）
- 伤病：（无，或具体伤情和起始章）
```

每个在书中出现过的有名字的角色都要有一块，哪怕本章没出场。本章没出场的角色状态原样保留。

## threads.md 未收伏笔

```markdown
| 编号 | 内容 | 引入章 | 预计回收 | 状态 |
|---|---|---|---|---|
| T1 | …… | 2 | 8 | 未收 |
```

编号 T 加递增数字，不复用。状态只能是 `未收`、`已收（第N章）`、`放弃` 三种。回收后不删行，改状态。

## timeline.md 事件时间线

```markdown
## 第N章
- （故事内时间），（地点）：（事件）
```

每章一个 `## 第N章` 块，只记发生了的事，不记心理活动。

## facts.md 硬设定

四个固定标题：`## 人物固定属性`、`## 地点`、`## 物品`、`## 规则`。每条一行。只放不会变的东西：年龄、外貌、关系、地理、物品特征、世界规则。会变的（所在、伤病）放 state.md。

## 定稿时的更新步骤

读第 N 章正文和 `summaries/Chapter-NN.md`，按顺序：

1. `state.md`：第一行改为截至第 N 章。更新"时间地点"。逐个角色对照正文改所在、处境、所知、所持、伤病；本章新出现的有名字角色新增一块。
2. `threads.md`：本章埋下的新伏笔加行；本章回收的改成 `已收（第N章）`。
3. `timeline.md`：追加 `## 第N章` 块。
4. `facts.md`：本章首次出现的固定信息追加；已有条目不改。发现正文与已有条目矛盾时不改账本，在返回结果里指出。

更新完运行 `${CLAUDE_PLUGIN_ROOT}/scripts/bible-check.sh` 确认格式。

## 审稿时怎么用

正文里任何关于角色所知、所持、伤病、所在的描写，都对照 `state.md` 检查。角色年龄、外貌、关系、地点特征对照 `facts.md`。时间表述对照 `timeline.md`。提前揭开或遗忘的伏笔对照 `threads.md`。每条问题必须引用账本的具体行作为依据。

## 常见错误

- 只更新本章出场的角色，忘了把没出场角色的"所知"顺延（比如 A 在本章得知了秘密，但 B 仍不知道，B 的"不知道"要保留）。
- 把会变的信息写进 facts.md。
- 回收伏笔时删行而不是改状态。
- 第一行的章号忘了改。
```

- [ ] **Step 2: 写 novel-writing**

`plugin/skills/novel-writing/SKILL.md`:
```markdown
---
name: novel-writing
description: 逐章写作的通用要求：如何使用上下文包、承接上章、控制字数、章末收束。题材无关。写章节正文时使用。
user-invocable: false
---

# 章节写作通则

题材相关的文风、节奏、对话方式来自题材包（上下文包里的"题材包"段）。这里只讲任何题材都适用的规则。

## 上下文包怎么读

上下文包由 `context.sh` 生成，段落顺序固定。用法：

- **故事账本**：写作前通读。角色的所知、所持、伤病、所在是硬约束。一个角色不知道的事，他不能说出来或据此行动；受伤的部位不能正常使用。
- **本章大纲**：本章必须完成"关键事件"里的每一条，只能使用"出场角色"里的人物。可以增加无名的路人。
- **出场角色档案**：性格、说话方式决定对话怎么写。
- **上一章末尾**：本章开头要从这里自然接上。时间、地点、人物状态不能跳变；需要跳跃时用一句过渡交代。
- **前文摘要**：了解全局，不要复述已经发生的事。
- **题材包**：文风规范，照做。

## 写作规则

1. 正文文件第一行是 `# 第N章 标题`，标题来自大纲；其余是纯正文，不加任何说明、标注、分节标题。
2. 不解释前情。读者读过前面的章节。
3. 不在本章解决大纲安排在后面章节的事。`threads.md` 里预计回收章大于 N 的伏笔，本章只能推进，不能揭开。
4. 章末停在一个未完成的动作、一句未回答的话，或一个新出现的异常上。不做总结。
5. 字数以 `novel.yaml` 的 `chapter_words` 为准。写完后钩子会报字数，低于下限就补场景，超出上限就删。
6. 写完后返回给调用方的说明不超过 5 行：本章推进了哪些伏笔编号、是否偏离大纲及原因、字数。

## 常见错误

- 让角色说出账本里标注"不知道"的信息。
- 上一章结束在夜里，本章开头直接写白天而不交代。
- 为了凑字数重复描写同一场景。
- 在章末加一段总结或抒情。
```

- [ ] **Step 3: 验证 skill 被识别**

Run: `cd plugin/tests/fixtures/demo-novel && claude --plugin-dir ../../../ -p "列出你当前加载了哪些 skill 的名字，只输出名字" 2>&1 | head -20`
Expected: 输出包含 `story-bible` 和 `novel-writing`（前缀可能是 `novel:`）。

- [ ] **Step 4: 提交**

```bash
git add plugin/skills
git commit -m "feat(plugin): add story-bible and novel-writing skills

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015A3fd7JLDzuWiAwuvBJtuk"
```

---

### Task 7: 四个子代理

**Files:**
- Create: `plugin/agents/writer.md`
- Create: `plugin/agents/reviewer.md`
- Create: `plugin/agents/editor.md`
- Create: `plugin/agents/archivist.md`

**Interfaces:**
- Consumes: skill `novel-writing`、`story-bible`（Task 6），`context.sh` 输出格式（Task 4）。
- Produces: 子代理 `novel:writer`、`novel:reviewer`、`novel:editor`、`novel:archivist`。命令文件通过"使用 novel:writer 子代理……"调用。

- [ ] **Step 1: 写 writer**

`plugin/agents/writer.md`:
```markdown
---
name: writer
description: 根据上下文包写一章小说正文。只在 /novel:write 命令中被调用。
tools: Read, Write
skills: novel-writing
---

你是这部小说的执笔者。你收到的提示词里有一份由 context.sh 生成的上下文包，以及要写的章号 N。

工作步骤：

1. 通读上下文包。故事账本里角色的所知、所持、伤病、所在是硬约束。
2. 按"本章大纲"写第 N 章，完成每一条关键事件，只用出场角色。从"上一章末尾"自然接上。文风照"题材包"段。
3. 用 Write 工具把正文写到 `chapters/Chapter-NN.md`（NN 两位零填充）。第一行 `# 第N章 标题`，标题取自大纲。其余是纯正文。
4. 写入后你会收到字数提示。低于下限就用 Write 重写整章补足场景；超出上限就精简。
5. 不要读或改任何其他文件。

最后只返回不超过 5 行：推进了哪些伏笔编号；是否偏离大纲，偏离了说原因；最终字数。
```

- [ ] **Step 2: 写 reviewer**

`plugin/agents/reviewer.md`:
```markdown
---
name: reviewer
description: 审稿一章正文，找出与账本、前文、大纲、人设的矛盾。只在 /novel:review 命令中被调用。
tools: Read, Grep, Write
skills: story-bible
---

你是这部小说的审稿编辑。你收到的提示词里有一份由 context.sh 以 review 模式生成的上下文包，以及章号 N。你的任务是找问题，不是改文。

审查维度和严重度：

- **critical**：正文与 `bible/` 或前文事实矛盾。角色说出账本标注"不知道"的事；受伤部位正常使用；所持物品凭空出现或消失；地点、时间与时间线冲突；人物固定属性与 facts.md 不符；提前揭开预计回收章大于 N 的伏笔。
- **major**：逻辑漏洞（动机不足、因果不成立）；人物行为或说话方式违背档案；大纲关键事件缺失或被改写。
- **minor**：称谓不一致、时间表述含糊、小道具细节前后不一。
- **suggestion**：文笔、节奏建议。题材包 review-rules.md 里的要求也归入这里，除非它明确说是硬性规则。

每条问题必须有四项：原文引用（逐字）、依据（账本哪个文件哪一行，或第几章哪一句，用"关键词检索"段里的命中）、问题描述、建议改法。没有依据的怀疑不写。

用 Write 把报告写到 `reviews/Chapter-NN.md`，格式：

```markdown
# 第N章 审稿报告

## 汇总
critical X / major X / minor X / suggestion X

## critical
### C1 一句话标题
- 原文："……"
- 依据：bible/state.md 角色 · 所知：……
- 问题：……
- 建议：……

## major
### M1 ……
（同上）

## minor
### N1 ……

## suggestion
### S1 ……
```

某一级没有问题时写"无"。不要读或改任何其他文件。

最后只返回：四个数字的汇总一行，以及每条 critical 的一句话标题。
```

- [ ] **Step 3: 写 editor**

`plugin/agents/editor.md`:
```markdown
---
name: editor
description: 按审稿报告或用户说明对一章正文做定点修改。只在 /novel:revise 命令中被调用。
tools: Read, Edit
skills: story-bible
---

你是这部小说的修订编辑。你会收到章号 N，以及两者之一：`reviews/Chapter-NN.md` 里要处理的问题编号列表，或用户的一段修改说明。

规则：

1. 先读 `chapters/Chapter-NN.md`、`reviews/Chapter-NN.md`（如有）、`bible/state.md` 和 `bible/facts.md`。
2. 每处修改用 Edit 工具做片段替换。禁止整章重写，禁止用 Write。
3. 改动范围最小化：只改问题涉及的句子和为了通顺必须联动的前后一两句。不顺手润色别的地方。
4. 修改不得引入新的与账本矛盾的内容。
5. 按审稿报告修改时，处理完每一条就用 Edit 在 `reviews/Chapter-NN.md` 该条目末尾追加一行 `- 已处理：（一句话说明改法）`；判断不该改的追加 `- 未处理：（原因）`。
6. 按用户说明修改时，不动审稿报告。

最后返回每处改动的前后对照：

```
1. （位置说明）
   原：……
   改：……
```

以及未处理的条目和原因。
```

- [ ] **Step 4: 写 archivist**

`plugin/agents/archivist.md`:
```markdown
---
name: archivist
description: 章节定稿时生成摘要并更新故事账本。只在 /novel:finalize 命令中被调用。
tools: Read, Write, Edit, Bash
skills: story-bible
---

你是这部小说的档案员。你会收到章号 N。你负责把第 N 章的内容沉淀进摘要和账本。不改正文。

步骤：

1. 读 `chapters/Chapter-NN.md`、`bible/` 四个文件、`summaries/` 里前面各章的摘要。
2. 用 Write 写 `summaries/Chapter-NN.md`，固定四段：

```markdown
# 第N章 摘要

## 情节
（200 字以内，只写发生了什么）

## 状态变化
- 角色名：（所在 / 处境 / 所知 / 所持 / 伤病 里变了的项，每项一句）

## 新设定
- （本章首次出现的固定信息：人物属性、地点、物品、规则）

## 出场角色
名字, 名字
```

3. 按 story-bible skill 的"定稿时的更新步骤"用 Edit 更新四个账本文件。`state.md` 第一行改为 `# 故事状态（截至第N章）`。
4. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/bible-check.sh`。失败就按输出修，再跑，直到通过。
5. 发现正文与 `facts.md` 已有条目矛盾时，不改账本，记下来。

最后返回：摘要的"状态变化"段；账本改了哪些角色、加了哪些伏笔、回收了哪些伏笔；bible-check 的输出；发现的正文与账本矛盾（如有）。
```

- [ ] **Step 5: 验证子代理被识别**

Run: `cd plugin/tests/fixtures/demo-novel && claude --plugin-dir ../../../ -p "列出你可以调用的子代理名字，只输出名字" 2>&1 | head -20`
Expected: 输出包含 `novel:writer`、`novel:reviewer`、`novel:editor`、`novel:archivist`。

- [ ] **Step 6: 提交**

```bash
git add plugin/agents
git commit -m "feat(plugin): add writer, reviewer, editor, archivist subagents

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015A3fd7JLDzuWiAwuvBJtuk"
```

---

### Task 8: 项目模板

**Files:**
- Create: `plugin/templates/novel.yaml`
- Create: `plugin/templates/CLAUDE.md`
- Create: `plugin/templates/bible/state.md`、`threads.md`、`timeline.md`、`facts.md`

**Interfaces:**
- Produces: `/novel:init` 复制这些文件。`novel.yaml` 里 `__TITLE__` 和 `__SKILL__` 两个占位符由 init 命令替换。

- [ ] **Step 1: 写模板**

`plugin/templates/novel.yaml`:
```yaml
title: __TITLE__
skill: __SKILL__            # .claude/skills/ 下的题材包目录名
chapter_words: [3000, 5000] # 每章目标字数区间（汉字数）
pov: 第三人称限知
```

`plugin/templates/CLAUDE.md`:
```markdown
# 小说项目

这个目录是一部长篇小说，由 NovelWriter plugin 管理。

## 目录

- `novel.yaml`：书名、题材包、每章字数
- `outline.md`：大纲，每章一个 `### 第N章: 标题` 条目
- `characters/`：角色档案
- `chapters/Chapter-NN.md`：正文
- `summaries/`：定稿后的章节摘要
- `reviews/`：审稿报告
- `bible/`：故事账本。**只通过 `/novel:finalize` 修改。** 它记录截至最近定稿章的世界状态、伏笔、时间线、硬设定。
- `.claude/skills/<题材包>/`：本书的写作方法论和文风规范，可以按需修改

## 命令

- `/novel:plan`：规划大纲和角色
- `/novel:write N`：写第 N 章草稿，写完停下
- `/novel:review N`：审稿
- `/novel:revise N [说明]`：按审稿报告或说明修改
- `/novel:finalize N`：定稿，更新摘要和账本
- `/novel:status`：进度

## 约定

- 写第 N 章前，第 N-1 章必须已 finalize。
- 修改大纲直接编辑 `outline.md`；修改角色直接编辑 `characters/`。
- 手动改正文没问题，改完记得 review 和 finalize。
```

`plugin/templates/bible/state.md`:
```markdown
# 故事状态（截至第0章）

## 时间地点
- 故事时间：
- 当前场景：

## 角色状态

```

`plugin/templates/bible/threads.md`:
```markdown
# 伏笔与悬念

| 编号 | 内容 | 引入章 | 预计回收 | 状态 |
|---|---|---|---|---|
```

`plugin/templates/bible/timeline.md`:
```markdown
# 时间线

```

`plugin/templates/bible/facts.md`:
```markdown
# 硬设定

## 人物固定属性

## 地点

## 物品

## 规则

```

- [ ] **Step 2: 用 bible-check 验证空模板合法**

```bash
d=$(mktemp -d) && mkdir -p "$d/chapters" "$d/summaries" && cp -R plugin/templates/bible "$d/" && (cd "$d" && bash "$OLDPWD/plugin/scripts/bible-check.sh")
```
Expected: `账本校验通过（截至第0章）`。

- [ ] **Step 3: 提交**

```bash
git add plugin/templates
git commit -m "feat(plugin): add novel project templates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015A3fd7JLDzuWiAwuvBJtuk"
```

---

### Task 9: 通用题材包 general

**Files:**
- Create: `plugin/templates/skills/general/SKILL.md`
- Create: `plugin/templates/skills/general/outline-method.md`
- Create: `plugin/templates/skills/general/character-method.md`
- Create: `plugin/templates/skills/general/writing-method.md`
- Create: `plugin/templates/skills/general/output-style.md`
- Create: `plugin/templates/skills/general/review-rules.md`

**Interfaces:**
- Produces: `/novel:init` 不带参数时复制的默认包。文件名与 `context.sh` 读取的一致。

- [ ] **Step 1: 写 SKILL.md**

```markdown
---
name: general
description: 题材中性的长篇小说写作方法论：大纲结构、人物设计、场景推进、审稿要点。适用于任何类型。
---

# 通用题材包

这是 NovelWriter 的默认题材包，不预设时代、地域或流派。五个文件：

| 文件 | 用途 | 谁读 |
|---|---|---|
| outline-method.md | 大纲设计方法 | /novel:plan |
| character-method.md | 人物设计方法 | /novel:plan |
| writing-method.md | 章节写作方法 | writer |
| output-style.md | 文字风格规范 | writer |
| review-rules.md | 审稿要点 | reviewer |

要定制自己的题材包：复制这个目录改名，改写五个文件，在 `novel.yaml` 的 `skill` 字段填新目录名。可以加 `references/` 放资料，写作时在 writing-method.md 里说明怎么用。
```

- [ ] **Step 2: 写 outline-method.md**

```markdown
# 大纲设计方法

## 提问顺序

规划时按这个顺序和作者讨论，一次一个问题，作者说"可以了"再停：

1. 一句话故事：谁，想要什么，遇到什么阻碍。
2. 结局：作者心里有没有结局？没有就一起定一个，大纲从结局倒推。
3. 主角的起点状态和终点状态：他在故事结束时和开始时有什么不同。
4. 对立面：阻碍主角的是人、环境还是他自己？对立面想要什么？
5. 篇幅：多少章，每章多少字。
6. 三到五个必须发生的大事件，按顺序。
7. 哪些信息要瞒着读者到什么时候揭开。

## 结构

三幕，按章数大致 1 : 2 : 1 分配：

- 第一幕：建立日常，打破日常，主角被迫行动。幕末有一个不可逆的选择。
- 第二幕：主角尝试、受挫、调整。中点发生一次反转，让主角对局面的理解改变。幕末是最低谷。
- 第三幕：主角用前两幕学到的东西做最后一搏，结局，余波。

## 每章条目

每章一个条目，格式固定：

```markdown
### 第N章: 标题
**摘要**: 两三句话，写这一章发生什么、结束在哪。
**关键事件**:
- 必须发生的事，一到三条
**出场角色**: 名字, 名字
```

每章要有一个"变化"：主角的处境、所知或关系在章末和章初不一样。没有变化的章合并到别的章里。

## 伏笔

规划阶段列出每条伏笔的引入章和回收章，写进 `bible/threads.md`。回收章和引入章至少隔两章。
```

- [ ] **Step 3: 写 character-method.md**

```markdown
# 人物设计方法

## 角色档案

每个有名字的角色一个文件 `characters/<名字>.md`。自由 Markdown，建议包含：

```markdown
# 名字

## 基础信息
性别、年龄、身份、外貌里最容易被写到的一两个特征。

## 性格
三到五个词，然后各用一句话说明在行动上怎么体现。

## 说话方式
句子长短、口头禅、称呼别人的方式、什么情况下会沉默。

## 背景
和主线有关的过去。无关的不写。

## 关系
和其他主要角色的关系，以及对方不知道的部分。

## 弧光
起点状态 → 转变的契机 → 终点状态。配角可以没有弧光。

## 在故事中的作用
一句话。
```

## 原则

- 主角要有一个明确的"想要"和一个他自己没意识到的"需要"，两者冲突。
- 对立面的动机要能自洽，从他自己的角度看他是对的。
- 配角只保留对主线有功能的。两个功能相同的配角合并。
- 说话方式是最容易区分角色的手段，每个主要角色至少有一个别人没有的语言习惯。
- 档案里写下的固定属性（年龄、外貌、关系）在规划结束时抄进 `bible/facts.md`。
```

- [ ] **Step 4: 写 writing-method.md**

```markdown
# 章节写作方法

## 开头

从一个具体的动作或画面开始，不从总结或心理描写开始。第一段里要有时间、地点和人。接上一章末尾：如果上一章停在一个动作上，本章从这个动作的后果开始。

## 场景

一章由两到四个场景组成。每个场景：一个地点、一段连续时间、一个目标（某个角色想在这个场景里得到什么）、一个结果（得到了、没得到、得到了但代价更大）。场景之间用一行空行加一句过渡。

## 推进

每个场景结束时，至少有一样东西变了：一个角色知道了新信息，一段关系变了，一个物品换了主人，或者一个计划失败了。没有变化的场景删掉。

## 信息控制

读者知道的应该和视角人物知道的一样多。视角人物不知道的事，叙述不能透露。账本里标注"不知道"的信息是硬约束。

## 对话

对话推进情节或暴露性格，两者至少占一样。每句对话前后有动作或停顿，避免连续超过四轮的纯对话。角色不把心里话直接说出来，让读者从他没说的部分推断。

## 结尾

停在一个未完成的地方：一句没回答的问话、一个刚推开的门、一个刚发现的异常。不总结本章，不预告下章。
```

- [ ] **Step 5: 写 output-style.md**

```markdown
# 文字风格规范

- 第一行是 `# 第N章 标题`，之后是正文。正文里不用任何标题、分隔线、编号。
- 段落三到六句，对话单独成段。
- 以具体名词和动词为主，形容词每句不超过一个，副词能删就删。
- 情绪用动作、身体反应、环境细节表现，不直接写"他很愤怒"。
- 视角固定在 `novel.yaml` 的 `pov` 指定的人称，一章之内不换视角人物。
- 时间和地点的变化必须有过渡句，不靠空行跳跃。
- 不使用括号补充说明，不使用省略号表达停顿（用动作代替）。
- 数字用汉字。
```

- [ ] **Step 6: 写 review-rules.md**

```markdown
# 审稿要点

按账本和前文检查事实一致性是硬性规则（critical）。以下是通用的额外检查项，归入 major 或以下：

## major
- 本章关键事件是否全部完成。
- 视角人物是否知道了他不该知道的事。
- 角色的决定是否有足够的动机，读者能否理解他为什么这么做。
- 场景之间的时间、地点跳转是否有交代。

## minor
- 称呼是否一致（同一个人对同一个人的称呼不应无故变化）。
- 时间词是否精确（"昨天""三天前"是否与时间线吻合）。
- 道具的位置和状态是否延续。

## suggestion
- 是否有场景没带来任何变化。
- 对话是否有超过四轮无动作的段落。
- 章末是否停在未完成处。
- 是否有直接陈述情绪的句子。
```

- [ ] **Step 7: 用 general 包替换 fixture 里的占位包并跑测试**

```bash
rm -r plugin/tests/fixtures/demo-novel/.claude/skills/general
cp -R plugin/templates/skills/general plugin/tests/fixtures/demo-novel/.claude/skills/general
```

然后把 `plugin/tests/run.sh` 里三条依赖占位内容的断言改成依赖真实内容：
- `"每章围绕一个核心事件推进"` 改为 `"# 章节写作方法"`
- `"检查人物所知"`（两处）改为 `"# 审稿要点"`

Run: `bash plugin/tests/run.sh`
Expected: `passed: 50, failed: 0`。

- [ ] **Step 8: 提交**

```bash
git add plugin/templates/skills/general plugin/tests
git commit -m "feat(plugin): add genre-neutral general skill pack

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015A3fd7JLDzuWiAwuvBJtuk"
```

---

### Task 10: 迁移三国悬疑题材包

**Files:**
- Move: `templates/default-project/.claude/skills/sanguo-xuanyi/` → `plugin/templates/skills/sanguo-xuanyi/`
- Modify: `plugin/templates/skills/sanguo-xuanyi/SKILL.md`（加 frontmatter）
- Delete: `templates/`、`my-novel/`

- [ ] **Step 1: 移动并加 frontmatter**

```bash
git mv templates/default-project/.claude/skills/sanguo-xuanyi plugin/templates/skills/sanguo-xuanyi
git rm -r -q templates my-novel
```

在 `plugin/templates/skills/sanguo-xuanyi/SKILL.md` 最开头插入：

```markdown
---
name: sanguo-xuanyi
description: 三国时期古装悬疑小说的写作方法论、文风规范与史实参考。
---

```

并把 SKILL.md 里 `## Usage` 一节的三条 `/skill ...` 命令替换为：

```markdown
## Usage
在 `novel.yaml` 里设置 `skill: sanguo-xuanyi`，或在初始化时运行 `/novel:init sanguo-xuanyi`。
```

- [ ] **Step 2: 检查方法论文件里的示例角色提示**

旧代码的 prompt 里反复警告"不要使用方法论里的示例角色（陈平、曹操）"。现在方法论直接给模型读，所以在 `outline-method.md`、`character-method.md`、`writing-method.md` 三个文件顶部各加一行：

```markdown
> 本文中出现的人名、情节只是说明方法的示例，不要用到正在写的小说里。
```

- [ ] **Step 3: 确认 context.sh 能读这个包**

```bash
d=$(mktemp -d) && cp -R plugin/tests/fixtures/demo-novel/. "$d/" && cp -R plugin/templates/skills/sanguo-xuanyi "$d/.claude/skills/" && sed -i '' 's/^skill: general/skill: sanguo-xuanyi/' "$d/novel.yaml" && (cd "$d" && bash "$OLDPWD/plugin/scripts/context.sh" 3 review | grep -c '^--- ')
```
Expected: `3`（writing-method、output-style、review-rules 三个文件都被读到）。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor: move sanguo-xuanyi skill pack into plugin templates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015A3fd7JLDzuWiAwuvBJtuk"
```

---

### Task 11: 命令 status 和 init

**Files:**
- Create: `plugin/commands/status.md`
- Create: `plugin/commands/init.md`

**Interfaces:**
- Consumes: `templates/`（Task 8、9、10），`bible-check.sh`（Task 3）。
- Produces: `/novel:status`、`/novel:init [题材包]`。

- [ ] **Step 1: 写 status.md**

```markdown
---
description: 显示小说进度：章数、已写、已定稿、账本截至章、未收伏笔、各章字数
disable-model-invocation: true
allowed-tools: Bash(cat *), Bash(ls *), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Read, Glob
---

在当前目录（必须是小说目录，含 novel.yaml）汇总进度，只读不写。

步骤：

1. 读 `novel.yaml`，取书名和字数区间。没有这个文件就告诉用户先运行 `/novel:init`，然后停止。
2. 数 `outline.md` 里 `### 第N章` 的数量，得到计划章数。
3. 列出 `chapters/Chapter-*.md`，对每个文件运行 `${CLAUDE_PLUGIN_ROOT}/scripts/wordcount.sh` 得到字数。
4. 列出 `summaries/Chapter-*.md`，得到已定稿章号。
5. 读 `bible/state.md` 第一行取"截至第N章"。运行 `${CLAUDE_PLUGIN_ROOT}/scripts/bible-check.sh`，记录通过或失败。
6. 读 `bible/threads.md`，取状态为"未收"的行。

输出一张表和几行摘要：

```
《书名》 计划 X 章 · 已写 Y 章 · 已定稿 Z 章 · 账本截至第 N 章（校验通过/失败）

| 章 | 标题 | 字数 | 状态 |
|---|---|---|---|
| 1 | …… | 4213 | 已定稿 |
| 2 | …… | 3980 | 已审稿 / 草稿 / 未写 |

未收伏笔：
- T1 …… （引入第2章，预计第8章）

下一步：/novel:write N   （N = 账本截至章 + 1）
```

状态判定：有 `summaries/` 为已定稿；否则有 `reviews/` 为已审稿；否则有 `chapters/` 为草稿；否则未写。
```

- [ ] **Step 2: 写 init.md**

```markdown
---
description: 在当前目录初始化一个小说项目。可选参数：题材包名（默认 general）
argument-hint: [题材包]
disable-model-invocation: true
allowed-tools: Bash(ls *), Bash(mkdir *), Bash(cp *), Bash(sed *), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Read, Write
---

初始化小说项目。题材包参数：`$ARGUMENTS`（为空时用 `general`）。

步骤：

1. 确定题材包名 PACK：`$ARGUMENTS` 非空就用它，否则 `general`。检查 `${CLAUDE_PLUGIN_ROOT}/templates/skills/PACK` 存在；不存在就列出 `${CLAUDE_PLUGIN_ROOT}/templates/skills/` 下的可用包名，告诉用户，停止。
2. 检查当前目录。如果已有 `novel.yaml`，告诉用户这里已经是小说项目，停止。如果目录非空（除了 `.git`），列出现有内容并询问用户是否继续；用户没确认就停止。
3. 问用户书名。用户不想现在定就用"未命名"。
4. 创建目录：`characters/ chapters/ summaries/ reviews/ bible/ .claude/skills/`。
5. 复制模板：
   - `${CLAUDE_PLUGIN_ROOT}/templates/novel.yaml` → `./novel.yaml`，把 `__TITLE__` 替换为书名、`__SKILL__` 替换为 PACK。
   - `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md` → `./CLAUDE.md`。
   - `${CLAUDE_PLUGIN_ROOT}/templates/bible/*.md` → `./bible/`。
   - `${CLAUDE_PLUGIN_ROOT}/templates/skills/PACK` → `./.claude/skills/PACK`（整个目录）。
6. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/bible-check.sh` 确认账本模板合法。
7. 告诉用户创建了什么，下一步运行 `/novel:plan`。

不要创建 `outline.md`，它由 `/novel:plan` 生成。
```

- [ ] **Step 3: 端到端验证 init 和 status**

```bash
d=$(mktemp -d) && cd "$d" && claude --plugin-dir "$OLDPWD/plugin" -p "/novel:init 书名叫《测试》，目录是空的直接建" --permission-mode acceptEdits 2>&1 | tail -5 && ls -la && cat novel.yaml && claude --plugin-dir "$OLDPWD/plugin" -p "/novel:status" 2>&1 | tail -15
```
Expected: 目录里有 `novel.yaml`（title 为 测试，skill 为 general）、`CLAUDE.md`、`bible/` 四个文件、`.claude/skills/general/`；status 输出"计划 0 章"和"账本截至第 0 章"。

如果 init 时 Claude 停下来问书名而没有从提示词里取到，把命令说明的第 3 步改为"如果用户在调用时已经给了书名就直接用"。

- [ ] **Step 4: 提交**

```bash
git add plugin/commands/status.md plugin/commands/init.md
git commit -m "feat(plugin): add /novel:status and /novel:init commands

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015A3fd7JLDzuWiAwuvBJtuk"
```

---

### Task 12: 命令 write、review、revise、finalize

**Files:**
- Create: `plugin/commands/write.md`
- Create: `plugin/commands/review.md`
- Create: `plugin/commands/revise.md`
- Create: `plugin/commands/finalize.md`

**Interfaces:**
- Consumes: `context.sh`（Task 4）、子代理（Task 7）、`bible-check.sh`（Task 3）。
- Produces: 四个命令。

- [ ] **Step 1: 写 write.md**

```markdown
---
description: 写第 N 章草稿，写完停下等你阅读
argument-hint: N
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(ls *), Read, Agent
---

写第 $0 章草稿。

步骤：

1. 章号 N = `$0`。不是正整数就提示用法 `/novel:write N`，停止。
2. 如果 `chapters/Chapter-NN.md` 已存在（NN 两位零填充），告诉用户已有正文和字数，问是否覆盖。没确认就停止。
3. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/context.sh N write`。退出码非零时把 stderr 原样给用户，停止。不要自己绕过检查。
4. 用 novel:writer 子代理写这一章。给它的提示词是：第一行"写第 N 章。"，然后是 context.sh 的完整输出。
5. 子代理返回后，把它的说明原样转述给用户，加一句：正文在 `chapters/Chapter-NN.md`，读完后运行 `/novel:review N`。

然后停止。不要审稿，不要改账本。
```

- [ ] **Step 2: 写 review.md**

```markdown
---
description: 审稿第 N 章，报告写到 reviews/Chapter-NN.md
argument-hint: N
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Read, Agent
---

审稿第 $0 章。

步骤：

1. 章号 N = `$0`。不是正整数就提示用法，停止。
2. 运行 `${CLAUDE_PLUGIN_ROOT}/scripts/context.sh N review`。退出码非零时把 stderr 给用户，停止。
3. 用 novel:reviewer 子代理审稿。提示词第一行"审稿第 N 章。"，然后是 context.sh 的完整输出。
4. 子代理返回后，转述汇总行和 critical 列表，加一句：完整报告在 `reviews/Chapter-NN.md`；要按报告修改运行 `/novel:revise N`，要定稿运行 `/novel:finalize N`。

然后停止。
```

- [ ] **Step 3: 写 revise.md**

```markdown
---
description: 修订第 N 章。不带说明时按审稿报告的 critical 和 major 修改；带说明时按说明修改
argument-hint: N [修改说明]
disable-model-invocation: true
allowed-tools: Read, Agent
---

修订第 $0 章。完整参数：`$ARGUMENTS`。

步骤：

1. 章号 N = 参数的第一个词。不是正整数就提示用法，停止。修改说明 = 第一个词之后的全部内容（可能为空）。
2. 确认 `chapters/Chapter-NN.md` 存在，否则提示先 `/novel:write N`，停止。
3. 修改说明为空时：读 `reviews/Chapter-NN.md`。不存在就提示先 `/novel:review N`，停止。列出其中还没有"已处理"或"未处理"标记的 critical 和 major 条目编号。没有待处理条目就告诉用户，停止。
4. 用 novel:editor 子代理修改。提示词：
   - 按报告修改时："修订第 N 章。按 reviews/Chapter-NN.md 处理以下条目：C1, C2, M1。"
   - 按说明修改时："修订第 N 章。用户要求：（修改说明原文）。"
5. 子代理返回后，把改动的前后对照原样转述给用户，加一句：可以再次 `/novel:review N` 复查，或 `/novel:finalize N` 定稿。

然后停止。
```

- [ ] **Step 4: 写 finalize.md**

```markdown
---
description: 定稿第 N 章：生成摘要，更新故事账本
argument-hint: N
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(ls *), Read, Agent
---

定稿第 $0 章。

步骤：

1. 章号 N = `$0`。不是正整数就提示用法，停止。
2. 前置检查，任一不满足就说明原因并停止：
   - `chapters/Chapter-NN.md` 存在。
   - `bible/state.md` 第一行的"截至第M章"满足 M = N-1。M 不等于 N-1 时告诉用户当前截至章号和应该先处理的章。
3. 软检查：`reviews/Chapter-NN.md` 不存在，或其中有未标"已处理"/"未处理"的 critical 条目时，警告用户并问是否继续。没确认就停止。
4. 用 novel:archivist 子代理定稿。提示词："定稿第 N 章。"
5. 子代理返回后运行 `${CLAUDE_PLUGIN_ROOT}/scripts/bible-check.sh`。失败就把输出给用户，说明账本可能处于半更新状态，建议用 `git diff bible/` 查看后手动修正或让 archivist 重跑。
6. 转述子代理返回的状态变化和账本改动摘要，加一句：下一步 `/novel:write N+1`。

然后停止。
```

- [ ] **Step 5: 加载测试**

```bash
cd plugin/tests/fixtures/demo-novel && claude --plugin-dir ../../../ -p "/novel:status" --output-format json 2>/dev/null | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("result head:", (d.get("result") or "")[:300])
'
```
Expected: result 里有"计划 6 章""已定稿 2 章""账本截至第 2 章"。并用 `claude --plugin-dir ../../../ -p "列出所有以 /novel: 开头的命令名"` 确认七个命令都在。

- [ ] **Step 6: 提交**

```bash
git add plugin/commands
git commit -m "feat(plugin): add write, review, revise, finalize commands

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015A3fd7JLDzuWiAwuvBJtuk"
```

---

### Task 13: 命令 plan

**Files:**
- Create: `plugin/commands/plan.md`

**Interfaces:**
- Consumes: 题材包的 `outline-method.md`、`character-method.md`；`story-bible` skill。
- Produces: `/novel:plan`。

- [ ] **Step 1: 写 plan.md**

```markdown
---
description: 对话式规划：大纲、角色档案、账本初始内容。可重复运行以修改已有大纲
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Read, Write, Edit, Glob
---

在主对话里和作者一起规划这部小说。这是一个多轮对话，不要一口气做完，每一步都等作者回应。

准备：

1. 读 `novel.yaml` 取题材包名 PACK 和字数区间。没有就提示先 `/novel:init`，停止。
2. 读 `.claude/skills/PACK/outline-method.md` 和 `character-method.md`，后面按它们的方法工作。
3. 如果 `outline.md` 已存在，读它，问作者是要修改还是重来。修改就跳到第三阶段按作者的要求用 Edit 改；重来就继续。

第一阶段：讨论。

按 outline-method.md 的提问顺序，一次问一个问题。作者的每个回答之后，用两三句话复述你目前对故事的理解，再问下一个。作者说"可以了""开始写大纲"之类的话之前不要停止提问，也不要自作主张认为信息够了。

第二阶段：大纲。

按 outline-method.md 的结构写 `outline.md`，格式：

```markdown
# 书名

## 故事前提
（三到五句）

## 主题
（一两句）

## 章节大纲

### 第1章: 标题
**摘要**: ……
**关键事件**:
- ……
**出场角色**: 名字, 名字
```

写完给作者看，按反馈用 Edit 改，直到作者满意。

第三阶段：角色。

从大纲的"出场角色"里汇总所有名字。按 character-method.md 逐个写 `characters/<名字>.md`，每写完一个给作者看一眼，作者有意见就改。

第四阶段：账本初始化。

按 story-bible skill 的格式：
- `bible/facts.md`：从大纲和角色档案里抄固定属性、地点、物品、规则。
- `bible/state.md`：第一行 `# 故事状态（截至第0章）`，每个角色一块，写故事开始时的所在、处境、所知、所持、伤病。
- `bible/threads.md`：大纲里已经安排的伏笔，填引入章和预计回收章。
- `bible/timeline.md`：只留 `# 时间线` 标题。

运行 `${CLAUDE_PLUGIN_ROOT}/scripts/bible-check.sh`，通过后告诉作者：规划完成，下一步 `/novel:write 1`。
```

- [ ] **Step 2: 加载测试**

Run: `cd plugin/tests/fixtures/demo-novel && claude --plugin-dir ../../../ -p "列出所有以 /novel: 开头的命令名和它们的一句话说明"`
Expected: 七个命令，包括 plan。

- [ ] **Step 3: 提交**

```bash
git add plugin/commands/plan.md
git commit -m "feat(plugin): add /novel:plan command

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015A3fd7JLDzuWiAwuvBJtuk"
```

---

### Task 14: README 重写

**Files:**
- Modify: `README.md`（整体重写）
- Modify: `README.en.md`（缩为一段，指向中文版；英文完整版下一轮再写）

- [ ] **Step 1: 重写 README.md**

```markdown
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
| `/novel:revise N [说明]` | 按审稿报告或你的说明做定点修改 |
| `/novel:finalize N` | 定稿：生成摘要、更新账本 |
| `/novel:status` | 进度 |

典型循环：`write 3` → 自己读、随手改 → `review 3` → `revise 3` → `finalize 3` → `write 4`。

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

## 项目状态

`plugin/` 是当前维护的部分。`app/`、`electron/`、`src/` 是旧的 Electron 应用，不再维护，保留到下一版阅读器完成为止。

## License

MIT
```

- [ ] **Step 2: 缩写 README.en.md**

```markdown
# NovelWriter

A Claude Code plugin for writing long-form fiction. It runs inside your novel's directory with your own Claude subscription and keeps a human-readable "story bible" so later chapters stay consistent with earlier ones.

See [README.md](README.md) (Chinese) for installation and commands. Commands: `/novel:init`, `/novel:plan`, `/novel:write N`, `/novel:review N`, `/novel:revise N`, `/novel:finalize N`, `/novel:status`.

The `app/`, `electron/` and `src/` directories are the legacy Electron app and are no longer maintained.
```

- [ ] **Step 3: 提交**

```bash
git add README.md README.en.md
git commit -m "docs: rewrite README for the Claude Code plugin

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015A3fd7JLDzuWiAwuvBJtuk"
```

---

### Task 15: 端到端验收（消耗订阅额度，执行前必须询问用户）

**Files:** 无新增。在仓库外的临时目录操作。

- [ ] **Step 1: 询问用户是否执行**

告诉用户这一步会用他的 Claude 订阅写三章正文加一次规划，大约相当于一次中等长度的 Claude Code 会话。得到确认再继续。

- [ ] **Step 2: 三国包全流程**

```bash
mkdir -p ~/tmp/novel-e2e-sanguo && cd ~/tmp/novel-e2e-sanguo
claude --plugin-dir /Users/quansun/Desktop/Projects/NovelWriter/plugin
```

在交互会话里依次：
1. `/novel:init sanguo-xuanyi`
2. `/novel:plan`，目标 6 章、3 个角色。讨论时给一个简单设定即可，说"可以了"结束提问。
3. `/novel:write 1` → `/novel:review 1` → 有 critical 或 major 就 `/novel:revise 1` → `/novel:finalize 1`
4. 第 2、3 章同上。

- [ ] **Step 3: 验收检查**

```bash
cd ~/tmp/novel-e2e-sanguo
bash /Users/quansun/Desktop/Projects/NovelWriter/plugin/scripts/bible-check.sh
head -1 bible/state.md
grep -c '^### C' reviews/Chapter-03.md
```
Expected：校验通过；`截至第3章`；第 3 章报告的 critical 数为 0（允许经过一轮 revise 后再 review 一次达到）。

人工读第 3 章正文，找出至少两处明确承接第 1、2 章账本状态的地方（角色所知、伤病、所持物），记在验收记录里。

- [ ] **Step 4: 通用包规划流程**

```bash
mkdir -p ~/tmp/novel-e2e-general && cd ~/tmp/novel-e2e-general
claude --plugin-dir /Users/quansun/Desktop/Projects/NovelWriter/plugin
```
`/novel:init` 不带参数，`/novel:plan` 出一个非历史题材的 3 章大纲，到账本初始化完成为止。确认 `bible-check.sh` 通过。

- [ ] **Step 5: 记录验收结果并提交**

把结果写到 `docs/superpowers/specs/2026-09-17-claude-code-plugin-design.md` 末尾新增一节 `## 9. 验收记录`：日期、三章字数、第 3 章各级问题数、找到的承接点、遇到的问题。发现的 plugin 缺陷单独列出，作为下一轮修正的输入。

```bash
git add docs
git commit -m "docs: record end-to-end acceptance results

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015A3fd7JLDzuWiAwuvBJtuk"
```

---

## 自查记录

**Spec 覆盖：** 第 2 节目录与格式 → Task 2 fixture、Task 8 模板、Task 11 init；第 3 节账本 → Task 3 校验、Task 6 skill、Task 8 模板；4.1 manifest → Task 1；4.2 七个命令 → Task 11、12、13；4.3 子代理 → Task 7；4.4 skills → Task 6；4.5 脚本 → Task 2、3、4；4.6 hooks → Task 5；4.7 templates → Task 8、9、10；第 5 节流程 → Task 12、13 的命令文本；第 6 节迁移 → Task 10、14；7.1 脚本测试 → Task 2 到 5；7.2 加载测试 → Task 12 Step 5、Task 13 Step 2；7.3 端到端 → Task 15。

**与 spec 的偏差：** 子代理不给 Bash（archivist 例外，它要跑 bible-check）；本地加载用 `--plugin-dir`，不写 `.claude/settings.json`。两条都已在 Global Constraints 声明。

**命名一致性：** 段名九个与 Task 4 脚本、Task 6 skill、Task 7 子代理描述一致；子代理名 `novel:writer/reviewer/editor/archivist` 在 Task 7 定义、Task 12 使用；`bible-check.sh` 输出文案 `账本校验通过（截至第N章）` 在 Task 3 定义、Task 8 和 Task 11 依赖；审稿报告条目前缀 `C/M/N/S` 在 Task 7 reviewer 定义、Task 12 revise 使用；模板占位符 `__TITLE__`、`__SKILL__` 在 Task 8 定义、Task 11 替换。
