#!/usr/bin/env bash
# 用法：context.sh N write|review [--save]
# 在小说目录下运行。确定性地组装写作/审稿第 N 章所需的全部上下文，输出到 stdout。
# 带 --save 时改为写到 .novel/context-NN-<mode>.md（覆盖旧文件），stdout 只打印该文件的绝对路径。
# 前置检查失败时把原因写到 stderr 并退出 1。
set -u

die() { echo "$*" >&2; exit 1; }
section() { printf '\n===== %s =====\n' "$1"; }

[ $# -eq 2 ] || [ $# -eq 3 ] || die "用法: context.sh N write|review [--save]"
N="$1"; MODE="$2"; SAVE=0
if [ $# -eq 3 ]; then
  [ "$3" = "--save" ] || die "第三个参数只能是 --save: $3"
  SAVE=1
fi
case "$N" in ''|*[!0-9]*) die "章号必须是数字: $N";; esac
N=$((10#$N))
[ "$MODE" = write ] || [ "$MODE" = review ] || die "模式必须是 write 或 review: $MODE"

[ -f novel.yaml ] || die "当前目录没有 novel.yaml，请先在小说目录里运行，或用 /novel:init 初始化"
[ -f outline.md ] || die "缺少 outline.md，请先运行 /novel:plan"
[ -f bible/state.md ] || die "缺少 bible/state.md"

NN="$(printf '%02d' "$N")"
PREV=$((N-1))
PREV_NN="$(printf '%02d' "$PREV")"

SKILL="$(sed -n 's/^skill:[[:space:]]*\([^[:space:]#]*\).*/\1/p' novel.yaml | head -1 | sed -e "s/^['\"]//" -e "s/['\"]\$//")"
[ -n "$SKILL" ] || die "novel.yaml 缺少 skill 字段"
SKILL_DIR=".claude/skills/$SKILL"
[ -d "$SKILL_DIR" ] || die "题材包目录不存在: ${SKILL_DIR}（novel.yaml 的 skill 字段指向它）"

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
CHARS="$(printf '%s\n' "$ENTRY" | sed -n 's/^\*\*出场角色\*\*[：:][[:space:]]*//p' | head -1 | perl -CSD -pe 'use utf8; s/[,，、]/\n/g' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep -v '^$')"

# ---------- 输出 ----------
OUT_FILE=""
if [ "$SAVE" -eq 1 ]; then
  mkdir -p .novel || die "无法创建 .novel/ 目录"
  OUT_FILE="$(pwd)/.novel/context-${NN}-${MODE}.md"
  exec 3>&1 > "$OUT_FILE" || die "无法写入 ${OUT_FILE}"
fi

section "项目信息"
cat novel.yaml

section "故事账本"
for f in state facts threads timeline; do
  [ -f "bible/$f.md" ] && { cat "bible/$f.md"; echo; }
done

section "本章大纲"
printf '%s\n' "$ENTRY"

section "出场角色档案"
if [ -n "$CHARS" ]; then
  printf '%s\n' "$CHARS" | while IFS= read -r name; do
    if [ -f "characters/${name}.md" ]; then
      cat "characters/${name}.md"; echo
    else
      echo "（未找到档案：${name}）"
    fi
  done
else
  echo "（大纲未指定出场角色）"
fi

if [ "$N" -gt 1 ]; then
  section "上一章末尾"
  if [ -f "chapters/Chapter-$PREV_NN.md" ]; then
    perl -CSD -0777 -ne 'use utf8; my $t=$_; $t =~ s/\s+$//; print length($t) > 800 ? "……" . substr($t, -800) : $t; print "\n"' "chapters/Chapter-$PREV_NN.md"
  else
    echo "（上一章正文不存在）"
  fi
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

  # 作者批注：notes.md 里位置在本章的批注块
  if [ -f notes.md ]; then
    notes_hit="$(N="$N" perl -CSD -0777 -ne '
      use utf8;
      my $n = $ENV{N};
      my @blocks = split /^(?=## A\d+ )/m, $_;
      for my $b (@blocks) {
        next unless $b =~ /^## A\d+ /;
        print $b =~ /\n\n\z/ ? $b : "$b\n" if $b =~ /^- 位置：第${n}章「/m;
      }' notes.md)"
    if [ -n "$notes_hit" ]; then
      section "作者批注"
      echo "（作者在阅读界面里标的问题。状态未处理且位置在本章的，审稿时不要重复提出，只核实；标了已处理的，核实是否改好。）"
      printf '%s\n' "$notes_hit"
    fi
  fi

  # 上一版审稿报告：reviews/Chapter-NN.vK.md 里 K 最大的那份（当前 reviews/Chapter-NN.md 不算）
  prev_review=""
  prev_k=0
  for f in "reviews/Chapter-${NN}".v[0-9]*.md; do
    [ -f "$f" ] || continue
    k="$(echo "$f" | sed -n 's/.*\.v\([0-9][0-9]*\)\.md$/\1/p')"
    [ -n "$k" ] || continue
    if [ "$((10#$k))" -gt "$prev_k" ]; then prev_k=$((10#$k)); prev_review="$f"; fi
  done
  if [ -n "$prev_review" ]; then
    section "上一版审稿报告"
    echo "（来源：${prev_review}。这是复审：沿用其中仍成立条目的编号和严重度，标了「已处理」的核实是否已改好，标了「未处理」的不再提出。）"
    cat "$prev_review"
  fi

  section "关键词检索"
  echo "（本章出场角色名在前文正文中最近的出现位置，每个名字最多 5 处，从第${PREV}章往前找）"
  if [ -n "$CHARS" ]; then
    printf '%s\n' "$CHARS" | while IFS= read -r name; do
      remaining=5
      i="$PREV"
      while [ "$i" -ge 1 ] && [ "$remaining" -gt 0 ]; do
        f="chapters/Chapter-$(printf '%02d' "$i").md"
        if [ -f "$f" ]; then
          hits="$(NAME="$name" CH="$i" MAX="$remaining" perl -CSD -0777 -ne '
            use utf8;
            my $name = $ENV{NAME}; utf8::decode($name);
            my $ch = $ENV{CH}; my $max = $ENV{MAX}; my $k = 0;
            while (/\Q$name\E/g) {
              last if ++$k > $max;
              my $s = pos($_) - length($name) - 80; $s = 0 if $s < 0;
              my $e = pos($_) + 80; $e = length($_) if $e > length($_);
              my $snip = substr($_, $s, $e - $s); $snip =~ s/\s+/ /g;
              print "[第${ch}章] …${snip}…\n";
            }
          ' "$f")"
          if [ -n "$hits" ]; then
            printf '%s\n' "$hits"
            n_hits="$(printf '%s\n' "$hits" | grep -c '^\[第')"
            remaining=$((remaining - n_hits))
          fi
        fi
        i=$((i-1))
      done
    done
  fi
fi

if [ "$SAVE" -eq 1 ]; then
  echo "$OUT_FILE" >&3
fi
