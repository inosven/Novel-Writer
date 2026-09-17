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
  assert_eq "wordcount 第1章" "247" "$n"
  bash "$SCRIPTS/wordcount.sh" "$FIXTURE_SRC/chapters/Chapter-99.md" >/dev/null 2>&1
  assert_exit "wordcount 缺文件" 1 $?
}

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

test_wordcount
test_bible_check
test_context

echo "passed: $PASS, failed: $FAIL"
[ "$FAIL" -eq 0 ]
