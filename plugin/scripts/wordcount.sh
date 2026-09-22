#!/usr/bin/env bash
# 用法：wordcount.sh FILE
# 输出文件中 CJK 汉字数量，不含第一行（章节标题）。
set -u
if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "用法: wordcount.sh FILE（文件必须存在）" >&2
  exit 1
fi
perl -CSD -ne '$. > 1 and $n += () = /\p{sc=Han}/g; END { print +($n || 0), "\n" }' "$1"
