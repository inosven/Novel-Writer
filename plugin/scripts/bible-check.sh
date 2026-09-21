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
  bad="$(grep '^| *T[0-9]' bible/threads.md | LC_ALL=C awk -F'|' '{
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
