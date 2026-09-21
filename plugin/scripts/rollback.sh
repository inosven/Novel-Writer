#!/usr/bin/env bash
# 用法：rollback.sh N [--dry-run]
# 在小说目录里运行。撤销第 N 章到当前截至章 M 的定稿：
#   1. 用 bible/.history/before-NN/ 覆盖 bible/（回到截至第 N-1 章）
#   2. summaries/Chapter-NN..MM.md 和 before-(N+1)..before-MM 快照移到 bible/.history/rollback-<时间戳>/ 备份
#   3. 跑 bible-check.sh
# 正文和审稿报告不动。--dry-run 只打印将要做的事。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
N="${1:-}"
DRY=0
[ "${2:-}" = "--dry-run" ] && DRY=1
case "$N" in
  ''|*[!0-9]*) echo "用法: rollback.sh N [--dry-run]（N 为正整数）" >&2; exit 1 ;;
esac
N=$((10#$N))
[ "$N" -ge 1 ] || { echo "章号必须大于 0" >&2; exit 1; }
[ -f bible/state.md ] || { echo "缺少 bible/state.md，当前目录不是小说项目？" >&2; exit 1; }

M="$(sed -n '1s/^# 故事状态（截至第\([0-9][0-9]*\)章）$/\1/p' bible/state.md)"
[ -n "$M" ] || { echo "bible/state.md 第一行不是「# 故事状态（截至第N章）」" >&2; exit 1; }
M=$((10#$M))
# 允许 N = M+1：定稿第 N 章中途失败、账本半更新时，也能用快照恢复
if [ "$N" -gt "$((M+1))" ]; then
  echo "账本截至第${M}章，第${N}章还没定稿，没有可回滚的内容" >&2; exit 1
fi
NN="$(printf '%02d' "$N")"
snap="bible/.history/before-${NN}"
for f in state threads timeline facts; do
  if [ ! -f "$snap/$f.md" ]; then
    echo "没有第${N}章定稿前的账本快照（${snap}/ 不完整）。该章定稿时还没有快照功能，只能手动把 bible/ 改回截至第$((N-1))章。" >&2
    exit 1
  fi
done
snap_upto="$(sed -n '1s/^# 故事状态（截至第\([0-9][0-9]*\)章）$/\1/p' "$snap/state.md")"
if [ "${snap_upto:-x}" != "$((N-1))" ]; then
  echo "快照 ${snap}/state.md 不是截至第$((N-1))章（实际：${snap_upto:-无法识别}），拒绝回滚" >&2; exit 1
fi

# 要移走的东西
summaries=""
stale=""
top="$M"; [ "$N" -gt "$top" ] && top="$N"
i="$N"
while [ "$i" -le "$top" ]; do
  ii="$(printf '%02d' "$i")"
  [ -f "summaries/Chapter-${ii}.md" ] && summaries="${summaries} summaries/Chapter-${ii}.md"
  i=$((i+1))
done
# 第 N 章之后的快照都作废（它们记录的状态在回滚后不再成立）
for dsnap in bible/.history/before-*; do
  [ -d "$dsnap" ] || continue
  k="$(echo "$dsnap" | sed -n 's/.*before-\([0-9][0-9]*\)$/\1/p')"
  [ -n "$k" ] || continue
  [ "$((10#$k))" -gt "$N" ] && stale="${stale} ${dsnap}"
done

if [ "$N" -gt "$M" ]; then
  echo "账本截至第${M}章，第${N}章未完成定稿，按半更新处理："
else
  echo "回滚第${N}章到第${M}章的定稿："
fi
echo "- bible/ 恢复为 ${snap}/（截至第$((N-1))章）"
for s in $summaries; do echo "- 移走 $s"; done
for s in $stale; do echo "- 移走过期快照 $s"; done
echo "- 正文 chapters/ 和审稿报告 reviews/ 不动"
[ "$DRY" -eq 1 ] && { echo "（dry-run，未做任何改动）"; exit 0; }

ts="$(date +%Y%m%d-%H%M%S)"
bk="bible/.history/rollback-${ts}"
k=2
while [ -e "$bk" ]; do bk="bible/.history/rollback-${ts}-${k}"; k=$((k+1)); done
mkdir -p "$bk/bible" "$bk/summaries" || exit 1
for f in state threads timeline facts; do cp "bible/$f.md" "$bk/bible/$f.md" || exit 1; done
for s in $summaries; do mv "$s" "$bk/summaries/" || exit 1; done
for s in $stale; do mv "$s" "$bk/" || exit 1; done
for f in state threads timeline facts; do cp "$snap/$f.md" "bible/$f.md" || exit 1; done

echo "备份在 ${bk}/"
bash "$HERE/bible-check.sh"
