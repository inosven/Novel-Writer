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
