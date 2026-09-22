#!/usr/bin/env bash
# 用法：wordcount.sh FILE
# 输出文件的字数，不含第一行（章节标题）：汉字、假名、韩文逐字计，拼音文字（英文等）按词计，标点和空格不算。
# 规则与 plugin/reader/store.py 的 count_words 保持一致。
set -u
if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "用法: wordcount.sh FILE（文件必须存在）" >&2
  exit 1
fi
perl -CSD -ne '
  BEGIN { $cjk = qr/[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/; $w = qr/(?:(?!$cjk)[\p{L}\p{N}\p{M}])+/; }
  $. > 1 and $n += () = /$cjk|$w(?:[\x27\x{2019}]$w)*/g;
  END { print +($n || 0), "\n" }' "$1"
