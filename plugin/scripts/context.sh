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
# 注：BSD awk 在 UTF-8 locale 下对多字节字符串比较不可靠（Task 3 已验证），
# 这里强制 LC_ALL=C 让 awk 按字节匹配 CJK 字面量。
ENTRY="$(LC_ALL=C awk -v n="$N" '
  /^### / { if (on) exit; if ($0 ~ "^### 第" n "章") on=1 }
  on { print }
' outline.md)"
[ -n "$ENTRY" ] || die "outline.md 里找不到「### 第${N}章」条目"

# 出场角色：取 **出场角色**: 之后的内容，按 , ， 、 分割
# 注：tr 对多字节输入是 locale 相关的，用 perl -CSD 按字符分割更可靠。
CHARS="$(printf '%s\n' "$ENTRY" | sed -n 's/^\*\*出场角色\*\*[：:][[:space:]]*//p' | head -1 | perl -CSD -pe 's/[,，、]/\n/g' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep -v '^$')"

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
  perl -CSD -0777 -ne 'use utf8; my $t=$_; $t =~ s/\s+$//; print length($t) > 800 ? "……" . substr($t, -800) : $t; print "\n"' "chapters/Chapter-$PREV_NN.md"
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
            use utf8;
            my $name = $ENV{NAME}; utf8::decode($name);
            my $ch = $ENV{CH}; my $k = 0;
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
