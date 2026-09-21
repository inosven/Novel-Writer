#!/usr/bin/env bash
# 用法：model.sh 角色 [覆盖串]
# 在小说目录里运行。打印该角色（writer/reviewer/editor/archivist）应使用的模型名。
# 优先级：覆盖串 > novel.yaml 的 models 段 > inherit（跟主对话相同）。
# 覆盖串两种写法：裸模型名（对所有角色生效），或 "writer=opus,reviewer=haiku"（只对指定角色生效，逗号或空格分隔）。
set -u
ROLE="${1:-}"
OVERRIDE="${2:-}"
case "$ROLE" in
  writer|reviewer|editor|archivist) ;;
  *) echo "用法: model.sh writer|reviewer|editor|archivist [覆盖串]" >&2; exit 1 ;;
esac

# 1. 覆盖串
OVERRIDE="$(printf '%s' "$OVERRIDE" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
if [ -n "$OVERRIDE" ]; then
  case "$OVERRIDE" in
    *=*)
      hit="$(printf '%s' "$OVERRIDE" | tr ', ' '\n\n' | sed -n "s/^${ROLE}=\(.*\)\$/\1/p" | head -1)"
      if [ -n "$hit" ]; then echo "$hit"; exit 0; fi
      ;;
    *) echo "$OVERRIDE"; exit 0 ;;
  esac
fi

# 2. novel.yaml 的 models 段
if [ -f novel.yaml ]; then
  val="$(LC_ALL=C awk -v role="$ROLE" '
    /^models:[[:space:]]*$/ { inb = 1; next }
    inb && /^[^[:space:]#]/ { inb = 0 }
    inb && $0 ~ "^[[:space:]]+" role "[[:space:]]*:" {
      sub(/^[[:space:]]+[a-z]+[[:space:]]*:[[:space:]]*/, "")
      sub(/[[:space:]]*#.*$/, "")
      gsub(/["'"'"']/, "")
      print; exit
    }' novel.yaml)"
  if [ -n "$val" ]; then echo "$val"; exit 0; fi
fi

# 3. 默认
echo inherit
