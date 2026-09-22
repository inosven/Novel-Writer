#!/usr/bin/env bash
# 用法：renumber.sh insert K [标题] [摘要] [--dry-run]
#       renumber.sh delete K [--dry-run]
# 在小说目录里运行。在第 K 章位置插入一章 / 删除第 K 章，并把后面的章号整体平移。
# 只允许在已定稿边界之后操作：账本截至 M，insert 要求 M+1 ≤ K ≤ L+1，delete 要求 M+1 ≤ K ≤ L（L 为大纲章数）。
# 平移范围：chapters/、reviews/（含 .vK）、summaries/ 的文件名；outline.md 的「### 第N章」标题；
# outline.md 和 bible/*.md 里所有「第N章」字样。表格里的裸数字不动。
# delete 把第 K 章的正文、报告和大纲条目移到 .trash/<时间戳>/，不删。
set -u
die() { echo "$*" >&2; exit 1; }

OP="${1:-}"; K="${2:-}"; shift 2 2>/dev/null || die "用法: renumber.sh insert|delete K [标题] [摘要] [--dry-run]"
DRY=0; TITLE=""; SUMMARY=""
for a in "$@"; do
  if [ "$a" = "--dry-run" ]; then DRY=1
  elif [ -z "$TITLE" ]; then TITLE="$a"
  elif [ -z "$SUMMARY" ]; then SUMMARY="$a"
  else die "参数太多: $a"
  fi
done
case "$OP" in insert|delete) ;; *) die "操作只能是 insert 或 delete: ${OP}" ;; esac
case "$K" in ''|*[!0-9]*) die "章号必须是正整数: ${K}" ;; esac
K=$((10#$K)); [ "$K" -ge 1 ] || die "章号必须大于 0"
[ -f outline.md ] || die "缺少 outline.md，当前目录不是小说项目？"
[ -f bible/state.md ] || die "缺少 bible/state.md"
[ "$OP" = insert ] && [ -z "$TITLE" ] && TITLE="未命名"
[ "$OP" = insert ] && [ -z "$SUMMARY" ] && SUMMARY="（待补）"

M="$(sed -n '1s/^# 故事状态（截至第\([0-9][0-9]*\)章）$/\1/p' bible/state.md)"
[ -n "$M" ] || die "bible/state.md 第一行不是「# 故事状态（截至第N章）」"
M=$((10#$M))
L="$(grep -c '^### 第[0-9][0-9]*章' outline.md)"

if [ "$K" -le "$M" ]; then
  die "账本截至第${M}章，第${K}章已定稿，不能在这里${OP}。要动已定稿的章，先 /novel:rollback ${K}。"
fi
if [ "$OP" = insert ] && [ "$K" -gt "$((L+1))" ]; then
  die "大纲只有 ${L} 章，插入位置最多是第$((L+1))章"
fi
if [ "$OP" = delete ] && [ "$K" -gt "$L" ]; then
  die "大纲只有 ${L} 章，没有第${K}章可删"
fi

nn() { printf '%02d' "$1"; }

# 各目录里的最大章号
max_ch=0
for f in chapters/Chapter-*.md reviews/Chapter-*.md summaries/Chapter-*.md; do
  [ -f "$f" ] || continue
  n="$(echo "$f" | sed -n 's/.*Chapter-\([0-9][0-9]*\)\(\.v[0-9]*\)\{0,1\}\.md$/\1/p')"
  [ -n "$n" ] || continue
  n=$((10#$n)); [ "$n" -gt "$max_ch" ] && max_ch="$n"
done

# 某章号在三个目录里的全部文件
files_of() { # n
  local n; n="$(nn "$1")"
  for f in "chapters/Chapter-${n}.md" "reviews/Chapter-${n}.md" reviews/Chapter-"${n}".v[0-9]*.md "summaries/Chapter-${n}.md"; do
    [ -f "$f" ] && echo "$f"
  done
}
# 把文件名里的章号 n 改成 m
renamed() { # path n m
  echo "$1" | sed "s/Chapter-$(nn "$2")\(\.v[0-9]*\)\{0,1\}\.md$/Chapter-$(nn "$3")\1.md/"
}
# 统计某文件里 ≥ from 的「第N章」字样
count_refs() { # file from
  FROM="$2" perl -CSD -ne 'use utf8; while (/第(\d+)章/g) { $c++ if $1 >= $ENV{FROM} } END { print +($c || 0) }' "$1"
}
shift_refs() { # file from delta
  FROM="$2" DELTA="$3" perl -CSD -pi -e 'use utf8; s/第(\d+)章/ $1 >= $ENV{FROM} ? "第".($1+$ENV{DELTA})."章" : "第$1章" /ge' "$1"
}
# threads.md 的「引入章」「预计回收」两列是裸数字，单独平移
shift_thread_cols() { # from delta
  [ -f bible/threads.md ] || return 0
  FROM="$1" DELTA="$2" perl -CSD -pi -e '
    use utf8;
    if (/^\| T\d+ \|/) {
      my @c = split /\|/, $_, -1;
      for my $i (3, 4) {
        if (defined $c[$i] && $c[$i] =~ /^\s*(\d+)\s*$/ && $1 >= $ENV{FROM}) {
          my $v = $1 + $ENV{DELTA}; $c[$i] =~ s/\d+/$v/;
        }
      }
      $_ = join "|", @c;
    }' bible/threads.md
}

TEXT_FILES="outline.md"
for f in state threads timeline facts; do [ -f "bible/$f.md" ] && TEXT_FILES="$TEXT_FILES bible/$f.md"; done

stale=""
for dsnap in bible/.history/before-*; do
  [ -d "$dsnap" ] || continue
  k="$(echo "$dsnap" | sed -n 's/.*before-\([0-9][0-9]*\)$/\1/p')"
  [ -n "$k" ] || continue
  [ "$((10#$k))" -gt "$K" ] && stale="${stale} ${dsnap}"
done

# ---------- 计划 ----------
if [ "$OP" = insert ]; then
  echo "在第${K}章位置插入《${TITLE}》，原第${K}章起全部后移一章："
  i="$max_ch"
  while [ "$i" -ge "$K" ]; do
    for f in $(files_of "$i"); do echo "- ${f} → $(renamed "$f" "$i" "$((i+1))")"; done
    i=$((i-1))
  done
  echo "- outline.md：≥第${K}章的标题号加一，插入「### 第${K}章: ${TITLE}」"
  [ -f bible/threads.md ] && echo "- bible/threads.md：引入章/预计回收列 ≥${K} 的加一"
  for f in $TEXT_FILES; do
    c="$(count_refs "$f" "$K")"
    [ "$c" -gt 0 ] && echo "- ${f}：${c} 处「第N章」引用（N≥${K}）加一"
  done
else
  echo "删除第${K}章，后面全部前移一章："
  for f in $(files_of "$K"); do echo "- ${f} → 移到 .trash/"; done
  echo "- outline.md：删掉「$(grep "^### 第${K}章" outline.md | head -1)」条目（移到 .trash/），>第${K}章的标题号减一"
  i=$((K+1))
  while [ "$i" -le "$max_ch" ]; do
    for f in $(files_of "$i"); do echo "- ${f} → $(renamed "$f" "$i" "$((i-1))")"; done
    i=$((i+1))
  done
  for f in $TEXT_FILES; do
    c="$(count_refs "$f" "$((K+1))")"
    [ "$c" -gt 0 ] && echo "- ${f}：${c} 处「第N章」引用（N>${K}）减一"
  done
  [ -f bible/threads.md ] && echo "- bible/threads.md：引入章/预计回收列 >${K} 的减一"
  if [ -f bible/threads.md ]; then
    pend="$(LC_ALL=C awk -F'|' -v k="$K" '$0 ~ /^\| T[0-9]+ \|/ { gsub(/ /,"",$5); if ($5 == k) printf "%s ", $2 }' bible/threads.md | sed 's/ *$//')"
    [ -n "$pend" ] && echo "- 预计在第${K}章回收的伏笔（${pend}）保持数字不变，顺延到新的第${K}章"
  fi
fi
for s in $stale; do echo "- 过期快照 ${s} 移到备份"; done
echo "- 表格里的裸章号数字不会改，改完请自己检查 outline.md 里的表格"
[ "$DRY" -eq 1 ] && { echo "（dry-run，未做任何改动）"; exit 0; }

# ---------- 执行 ----------
ts="$(date +%Y%m%d-%H%M%S)"
if [ "$OP" = insert ]; then
  i="$max_ch"
  while [ "$i" -ge "$K" ]; do
    for f in $(files_of "$i"); do mv "$f" "$(renamed "$f" "$i" "$((i+1))")" || die "改名失败: $f"; done
    i=$((i-1))
  done
  for f in $TEXT_FILES; do shift_refs "$f" "$K" 1; done
  shift_thread_cols "$K" 1
  # 插入新条目：放在「### 第(K+1)章」之前，没有就追加到末尾
  NEWK="$K" NT="$TITLE" NS="$SUMMARY" perl -CSD -0777 -pi -e '
    use utf8;
    my $k = $ENV{NEWK}; my $t = $ENV{NT}; my $s = $ENV{NS};
    utf8::decode($t); utf8::decode($s);
    my $block = "### 第${k}章: ${t}\n**摘要**: ${s}\n**关键事件**:\n- （待补）\n**出场角色**: （待补）\n\n";
    my $k1 = $k + 1;
    unless (s/^(### 第${k1}章)/${block}$1/m) { $_ .= "\n" unless /\n\n\z/; $_ .= $block }
  ' outline.md
  if ! grep -q "^### 第${K}章: " outline.md; then die "大纲插入失败"; fi
  for s in $stale; do mkdir -p "bible/.history/renumber-${ts}" && mv "$s" "bible/.history/renumber-${ts}/"; done
  echo "完成。第${K}章《${TITLE}》已加入大纲，请补充 outline.md 里该章的摘要、关键事件和出场角色。"
else
  tr=".trash/${ts}"
  mkdir -p "$tr/chapters" "$tr/reviews" "$tr/summaries" || die "无法创建 ${tr}"
  for f in $(files_of "$K"); do mv "$f" "$tr/$f" || die "移动失败: $f"; done
  # 大纲条目：从「### 第K章」到下一个 ## 或 ### 标题之前
  DELK="$K" perl -CSD -ne '
    use utf8;
    my $k = $ENV{DELK};
    if (/^### 第(\d+)章/ && $1 == $k) { $in = 1 }
    elsif ($in && /^#{2,3} /) { $in = 0 }
    print if $in;
  ' outline.md > "$tr/outline-第${K}章.md"
  DELK="$K" perl -CSD -ni -e '
    use utf8;
    my $k = $ENV{DELK};
    if (/^### 第(\d+)章/ && $1 == $k) { $in = 1 }
    elsif ($in && /^#{2,3} /) { $in = 0 }
    print unless $in;
  ' outline.md
  i=$((K+1))
  while [ "$i" -le "$max_ch" ]; do
    for f in $(files_of "$i"); do mv "$f" "$(renamed "$f" "$i" "$((i-1))")" || die "改名失败: $f"; done
    i=$((i+1))
  done
  for f in $TEXT_FILES; do shift_refs "$f" "$((K+1))" -1; done
  shift_thread_cols "$((K+1))" -1
  for s in $stale; do mkdir -p "bible/.history/renumber-${ts}" && mv "$s" "bible/.history/renumber-${ts}/"; done
  echo "完成。第${K}章已移到 ${tr}/，后面的章已前移。"
fi
