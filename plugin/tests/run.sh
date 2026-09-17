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

test_wordcount
test_bible_check

echo "passed: $PASS, failed: $FAIL"
[ "$FAIL" -eq 0 ]
