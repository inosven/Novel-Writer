#!/usr/bin/env bash
# 用法：bible-snapshot.sh N
# 在小说目录里运行。把 bible/ 四个文件复制到 bible/.history/before-NN/，
# 即"定稿第 N 章之前"的账本状态。/novel:finalize 在更新账本前调用；已存在则覆盖。
set -u
N="${1:-}"
case "$N" in
  ''|*[!0-9]*) echo "用法: bible-snapshot.sh N（N 为正整数）" >&2; exit 1 ;;
esac
N=$((10#$N))
[ "$N" -ge 1 ] || { echo "章号必须大于 0" >&2; exit 1; }
for f in state threads timeline facts; do
  [ -f "bible/$f.md" ] || { echo "缺少 bible/$f.md，当前目录不是小说项目？" >&2; exit 1; }
done
NN="$(printf '%02d' "$N")"
dest="bible/.history/before-${NN}"
mkdir -p "$dest" || exit 1
for f in state threads timeline facts; do
  cp "bible/$f.md" "$dest/$f.md" || exit 1
done
echo "账本已快照到 ${dest}/（$(head -1 bible/state.md | sed 's/^# 故事状态//')）"
