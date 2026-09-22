#!/usr/bin/env bash
# 用法：export.sh [txt|epub|all] [输出目录]
# 在小说目录里运行。把 chapters/ 里已写的章按序合成一本：
#   txt  → 输出目录/书名.txt   （书名一行，每章"第N章 标题"一行，正文原样）
#   epub → 输出目录/书名.epub  （EPUB 3，用系统 zip 打包，无第三方依赖）
# 默认两种都出，输出目录默认 export/。正文第一行 `# 第N章 标题` 作为章标题，空行分段。
set -u
die() { echo "$*" >&2; exit 1; }

FORMAT="${1:-all}"
OUT="${2:-export}"
case "$FORMAT" in txt|epub|all) ;; *) die "用法: export.sh [txt|epub|all] [输出目录]" ;; esac
[ -f novel.yaml ] || die "当前目录没有 novel.yaml，请在小说目录里运行"

TITLE="$(sed -n 's/^title:[[:space:]]*\(.*\)$/\1/p' novel.yaml | head -1 | sed -e 's/[[:space:]]*#.*$//' -e "s/^['\"]//" -e "s/['\"]\$//" -e 's/[[:space:]]*$//')"
[ -n "$TITLE" ] || TITLE="未命名"
SAFE_TITLE="$(printf '%s' "$TITLE" | tr '/' '_')"

chapters=""
for f in chapters/Chapter-*.md; do
  [ -f "$f" ] || continue
  n="$(echo "$f" | sed -n 's/.*Chapter-\([0-9][0-9]*\)\.md$/\1/p')"
  [ -n "$n" ] && chapters="${chapters}${n} ${f}
"
done
chapters="$(printf '%s' "$chapters" | sort -n | awk '{print $2}')"
[ -n "$chapters" ] || die "chapters/ 里没有正文，无可导出"

mkdir -p "$OUT" || die "无法创建输出目录: ${OUT}"

# 章标题：第一行去掉 '# '；没有标题行时用"第N章"
heading_of() { # file
  local h
  h="$(head -1 "$1" | sed -e 's/^#[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [ -n "$h" ] && printf '%s' "$h" || printf '第%d章' "$((10#$(echo "$1" | sed -n 's/.*Chapter-\([0-9]*\)\.md$/\1/p')))"
}

export_txt() {
  local out="$OUT/${SAFE_TITLE}.txt" f
  {
    printf '%s\n\n' "$TITLE"
    for f in $chapters; do
      printf '%s\n\n' "$(heading_of "$f")"
      tail -n +2 "$f" | sed -e '1{/^$/d;}'
      printf '\n\n'
    done
  } > "$out" || die "写入失败: ${out}"
  echo "$out"
}

export_epub() {
  local out="$OUT/${SAFE_TITLE}.epub" tmp f n nn manifest="" spine="" navlist="" heading
  command -v zip >/dev/null 2>&1 || die "需要 zip 命令"
  tmp="$(mktemp -d)" || die "无法创建临时目录"
  mkdir -p "$tmp/META-INF" "$tmp/OEBPS"
  printf 'application/epub+zip' > "$tmp/mimetype"
  cat > "$tmp/META-INF/container.xml" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
EOF
  cat > "$tmp/OEBPS/style.css" <<'EOF'
body { font-family: serif; line-height: 1.8; margin: 1em; }
h1 { font-size: 1.4em; margin: 1.5em 0 1em; }
p { text-indent: 2em; margin: 0 0 0.6em; }
EOF
  for f in $chapters; do
    n="$(echo "$f" | sed -n 's/.*Chapter-\([0-9]*\)\.md$/\1/p')"; nn="$(printf '%02d' "$((10#$n))")"
    heading="$(heading_of "$f")"
    # 正文 → XHTML：转义 & < >，空行分段
    HEADING="$heading" perl -CSD -e '
      use utf8;
      my $h = $ENV{HEADING}; utf8::decode($h);
      sub esc { my $s = shift; $s =~ s/&/&amp;/g; $s =~ s/</&lt;/g; $s =~ s/>/&gt;/g; $s }
      local $/; my $t = <STDIN>;
      $t =~ s/^[^\n]*\n?//;          # 去掉标题行
      my @paras = grep { /\S/ } split /\n\s*\n/, $t;
      print "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE html>\n<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\">\n<head><meta charset=\"utf-8\"/><title>", esc($h), "</title><link rel=\"stylesheet\" href=\"style.css\"/></head>\n<body>\n<h1>", esc($h), "</h1>\n";
      for my $p (@paras) { $p =~ s/\s+$//; $p =~ s/^\s+//; print "<p>", esc($p), "</p>\n"; }
      print "</body>\n</html>\n";
    ' < "$f" > "$tmp/OEBPS/chapter-${nn}.xhtml"
    manifest="${manifest}    <item id=\"ch${nn}\" href=\"chapter-${nn}.xhtml\" media-type=\"application/xhtml+xml\"/>
"
    spine="${spine}    <itemref idref=\"ch${nn}\"/>
"
    navlist="${navlist}      <li><a href=\"chapter-${nn}.xhtml\">$(printf '%s' "$heading" | perl -CSD -pe 'use utf8; s/&/&amp;/g; s/</&lt;/g; s/>/&gt;/g')</a></li>
"
  done
  local esc_title uid
  esc_title="$(printf '%s' "$TITLE" | perl -CSD -pe 'use utf8; s/&/&amp;/g; s/</&lt;/g; s/>/&gt;/g')"
  uid="novelwriter-$(date +%Y%m%d%H%M%S)"
  cat > "$tmp/OEBPS/nav.xhtml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>目录</title><link rel="stylesheet" href="style.css"/></head>
<body>
  <nav epub:type="toc" id="toc"><h1>目录</h1>
    <ol>
${navlist}    </ol>
  </nav>
</body>
</html>
EOF
  cat > "$tmp/OEBPS/content.opf" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="zh">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${uid}</dc:identifier>
    <dc:title>${esc_title}</dc:title>
    <dc:language>zh</dc:language>
    <meta property="dcterms:modified">$(date -u +%Y-%m-%dT%H:%M:%SZ)</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
${manifest}  </manifest>
  <spine>
${spine}  </spine>
</package>
EOF
  rm -f "$out"
  local abs_out
  abs_out="$(cd "$(dirname "$out")" && pwd)/$(basename "$out")"
  ( cd "$tmp" && zip -X0 -q "$abs_out" mimetype && zip -Xr9 -q "$abs_out" META-INF OEBPS ) || { rm -rf "$tmp"; die "打包失败"; }
  rm -rf "$tmp"
  echo "$out"
}

case "$FORMAT" in
  txt) export_txt ;;
  epub) export_epub ;;
  all) export_txt; export_epub ;;
esac
