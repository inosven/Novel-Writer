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

test_wordcount

echo "passed: $PASS, failed: $FAIL"
[ "$FAIL" -eq 0 ]
