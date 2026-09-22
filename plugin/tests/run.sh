#!/usr/bin/env bash
# 运行 plugin 脚本测试。用法：bash plugin/tests/run.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
PLUGIN="$(cd "$HERE/.." && pwd)"
SCRIPTS="$PLUGIN/scripts"
FIXTURE_SRC="$HERE/fixtures/demo-novel"
PASS=0
FAIL=0

# 每个测试在 fixture 的临时副本里跑，避免污染
make_novel() {
  local tmp
  tmp="$(mktemp -d)"
  cp -R "$FIXTURE_SRC/." "$tmp/"
  echo "$tmp"
}

assert_eq() { # desc expected actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "FAIL: $1"; echo "  expected: $2"; echo "  actual:   $3"; fi
}
assert_exit() { # desc expected_code actual_code
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "FAIL: $1 (exit expected $2, got $3)"; fi
}
assert_contains() { # desc needle haystack
  case "$3" in *"$2"*) PASS=$((PASS+1));; *) FAIL=$((FAIL+1)); echo "FAIL: $1 (missing: $2)";; esac
}
assert_not_contains() { # desc needle haystack
  case "$3" in *"$2"*) FAIL=$((FAIL+1)); echo "FAIL: $1 (unexpected: $2)";; *) PASS=$((PASS+1));; esac
}

# ---------- wordcount.sh ----------
test_wordcount() {
  local n
  n="$(bash "$SCRIPTS/wordcount.sh" "$FIXTURE_SRC/chapters/Chapter-01.md")"
  assert_eq "wordcount 第1章" "247" "$n"
  bash "$SCRIPTS/wordcount.sh" "$FIXTURE_SRC/chapters/Chapter-99.md" >/dev/null 2>&1
  assert_exit "wordcount 缺文件" 1 $?
}

# ---------- bible-check.sh ----------
test_bible_check() {
  local d out code
  d="$(make_novel)"
  out="$(cd "$d" && bash "$SCRIPTS/bible-check.sh" 2>&1)"; code=$?
  assert_exit "bible-check fixture 通过" 0 "$code"
  assert_contains "bible-check 输出截至" "截至第2章" "$out"

  # 删掉一份摘要 → 摘要数 < 截至章号
  rm "$d/summaries/Chapter-02.md"
  out="$(cd "$d" && bash "$SCRIPTS/bible-check.sh" 2>&1)"; code=$?
  assert_exit "bible-check 摘要缺失" 1 "$code"
  assert_contains "bible-check 报告摘要缺失" "summaries" "$out"

  # 第一行格式坏 → 报错
  d="$(make_novel)"
  printf '# 故事状态\n' > "$d/bible/state.md"
  out="$(cd "$d" && bash "$SCRIPTS/bible-check.sh" 2>&1)"; code=$?
  assert_exit "bible-check 首行格式" 1 "$code"
  assert_contains "bible-check 报告首行" "第一行" "$out"

  # 截至章号 > 正文最大章号 → 报错
  d="$(make_novel)"
  perl -CSD -pi -e 'use utf8; s/第2章/第5章/ if $. == 1' "$d/bible/state.md"
  out="$(cd "$d" && bash "$SCRIPTS/bible-check.sh" 2>&1)"; code=$?
  assert_exit "bible-check 截至超前" 1 "$code"

  # threads 状态非法 → 报错
  d="$(make_novel)"
  perl -CSD -pi -e 'use utf8; s/\| 未收 \|/\| 待定 \|/' "$d/bible/threads.md"
  out="$(cd "$d" && bash "$SCRIPTS/bible-check.sh" 2>&1)"; code=$?
  assert_exit "bible-check threads 状态" 1 "$code"
  assert_contains "bible-check 报告 threads" "threads" "$out"

  # 缺文件 → 报错
  d="$(make_novel)"
  rm "$d/bible/facts.md"
  out="$(cd "$d" && bash "$SCRIPTS/bible-check.sh" 2>&1)"; code=$?
  assert_exit "bible-check 缺 facts" 1 "$code"
}

# ---------- context.sh ----------
test_context() {
  local d out code
  d="$(make_novel)"

  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 3 write 2>&1)"; code=$?
  assert_exit "context write 通过" 0 "$code"
  assert_contains "context 项目信息" "===== 项目信息 =====" "$out"
  assert_contains "context 账本" "===== 故事账本 =====" "$out"
  assert_contains "context 账本内容" "截至第2章" "$out"
  assert_contains "context 本章大纲" "### 第3章: 夜里的电话" "$out"
  assert_not_contains "context 大纲不含第4章" "### 第4章" "$out"
  assert_contains "context 角色档案" "===== 出场角色档案 =====" "$out"
  assert_contains "context 林砚档案" "左手腕有一道浅疤" "$out"
  assert_not_contains "context 不含老陈档案" "记性好" "$out"
  assert_contains "context 上一章末尾" "===== 上一章末尾 =====" "$out"
  assert_contains "context 上一章末尾内容" "像是很多年前的油" "$out"
  assert_contains "context 前文摘要" "# 第2章 摘要" "$out"
  assert_contains "context 题材包" "===== 题材包 =====" "$out"
  assert_contains "context writing-method" "# 章节写作方法" "$out"
  assert_not_contains "context write 不含审稿规则" "# 审稿要点" "$out"
  assert_not_contains "context write 不含正文段" "===== 本章正文 =====" "$out"

  # 第1章：无上一章末尾、无前文摘要
  out="$(cd "$d" && perl -CSD -pi -e 'use utf8; s/第2章/第0章/ if $. == 1' bible/state.md && bash "$SCRIPTS/context.sh" 1 write 2>&1)"; code=$?
  assert_exit "context 第1章通过" 0 "$code"
  assert_not_contains "context 第1章无上一章" "===== 上一章末尾 =====" "$out"

  # 账本停在第1章时写第3章 → 拒绝
  d="$(make_novel)"
  perl -CSD -pi -e 'use utf8; s/第2章/第1章/ if $. == 1' "$d/bible/state.md"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 3 write 2>&1)"; code=$?
  assert_exit "context 账本落后拒绝" 1 "$code"
  assert_contains "context 账本落后提示" "截至" "$out"
  assert_contains "context 账本落后提示 finalize" "finalize" "$out"

  # review 模式：正文不存在 → 拒绝
  d="$(make_novel)"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 3 review 2>&1)"; code=$?
  assert_exit "context review 缺正文拒绝" 1 "$code"

  # review 模式：有正文 → 含正文段、审稿规则、关键词检索
  printf '# 第3章 夜里的电话\n\n林砚在深夜接到电话。\n' > "$d/chapters/Chapter-03.md"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 3 review 2>&1)"; code=$?
  assert_exit "context review 通过" 0 "$code"
  assert_contains "context review 正文" "===== 本章正文 =====" "$out"
  assert_contains "context review 正文内容" "林砚在深夜接到电话" "$out"
  assert_contains "context review 审稿规则" "# 审稿要点" "$out"
  assert_contains "context review 检索段" "===== 关键词检索 =====" "$out"
  assert_contains "context review 检索命中" "[第1章]" "$out"

  # 关键词检索：跨所有前文章节全局最多 5 处（不是每章 5 处），且从最近章节往前找
  d="$(make_novel)"
  i=1
  while [ "$i" -le 6 ]; do
    printf '林砚看了一眼窗外。\n' >> "$d/chapters/Chapter-01.md"
    printf '林砚又想起了那把钥匙。\n' >> "$d/chapters/Chapter-02.md"
    i=$((i+1))
  done
  printf '# 第3章 夜里的电话\n\n林砚在深夜接到电话。\n' > "$d/chapters/Chapter-03.md"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 3 review 2>&1)"; code=$?
  assert_exit "context 检索全局上限通过" 0 "$code"
  hit_count="$(printf '%s\n' "$out" | grep -c '^\[第')"
  assert_eq "context 检索命中总数全局上限5" "5" "$hit_count"
  first_hit_line="$(printf '%s\n' "$out" | grep '^\[第' | head -1)"
  case "$first_hit_line" in
    "[第2章]"*) first_hit_ok=1;;
    *) first_hit_ok=0;;
  esac
  assert_eq "context 检索命中最近章节优先" "1" "$first_hit_ok"

  # 大纲无第 N 章 → 拒绝
  d="$(make_novel)"
  perl -CSD -pi -e 'use utf8; s/第2章/第6章/ if $. == 1' "$d/bible/state.md"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 7 write 2>&1)"; code=$?
  assert_exit "context 大纲缺章拒绝" 1 "$code"
  assert_contains "context 大纲缺章提示" "outline.md" "$out"

  # 题材包目录不存在 → 拒绝
  d="$(make_novel)"
  rm -r "$d/.claude/skills/general"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 3 write 2>&1)"; code=$?
  assert_exit "context 题材包缺失拒绝" 1 "$code"
  assert_contains "context 题材包缺失提示" "题材包目录不存在" "$out"

  # 缺 novel.yaml → 拒绝
  d="$(make_novel)"
  rm "$d/novel.yaml"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 3 write 2>&1)"; code=$?
  assert_exit "context 缺 novel.yaml 拒绝" 1 "$code"

  # 参数错误 → 拒绝
  out="$(cd "$FIXTURE_SRC" && bash "$SCRIPTS/context.sh" 3 2>&1)"; code=$?
  assert_exit "context 参数缺失" 1 "$code"
}

# ---------- context.sh：缺档案 / 中文分隔符 / 章号 >=10 / 前导零 ----------
test_context_more() {
  local d out code i NN

  # 缺档案：第3章大纲改为 "王五, 林砚"，输出要同时含未找到档案提示和林砚档案
  d="$(make_novel)"
  perl -CSD -0777 -pi -e 'use utf8; s/(### 第3章:.*?\*\*出场角色\*\*: )林砚\n/${1}王五, 林砚\n/s' "$d/outline.md"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 3 write 2>&1)"; code=$?
  assert_exit "context 缺档案仍通过" 0 "$code"
  assert_contains "context 缺档案提示" "未找到档案：王五" "$out"
  assert_contains "context 缺档案仍打印在档角色" "左手腕有一道浅疤" "$out"

  # 中文分隔符：第3章大纲改为 "林砚、周远"，两份档案都要出现
  d="$(make_novel)"
  perl -CSD -0777 -pi -e 'use utf8; s/(### 第3章:.*?\*\*出场角色\*\*: )林砚\n/${1}林砚、周远\n/s' "$d/outline.md"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 3 write 2>&1)"; code=$?
  assert_exit "context 中文分隔符通过" 0 "$code"
  assert_contains "context 中文分隔符林砚档案" "左手腕有一道浅疤" "$out"
  assert_contains "context 中文分隔符周远档案" "深灰色夹克" "$out"

  # 章号 >= 10
  d="$(make_novel)"
  for i in 7 8 9 10 11 12; do
    cat >> "$d/outline.md" <<EOF

### 第${i}章: 章节${i}
**摘要**: 占位摘要。
**关键事件**:
- 占位事件
**出场角色**: 林砚
EOF
  done
  i=3
  while [ "$i" -le 11 ]; do
    NN="$(printf '%02d' "$i")"
    printf '# 第%s章 占位标题\n\n占位正文。\n' "$i" > "$d/chapters/Chapter-$NN.md"
    printf '# 第%s章 摘要\n\n## 情节\n占位。\n\n## 状态变化\n- 林砚：占位\n\n## 新设定\n- 无\n\n## 出场角色\n林砚\n' "$i" > "$d/summaries/Chapter-$NN.md"
    i=$((i+1))
  done
  perl -CSD -pi -e 'use utf8; s/^# 故事状态（截至第2章）$/# 故事状态（截至第11章）/ if $. == 1' "$d/bible/state.md"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 12 write 2>&1)"; code=$?
  assert_exit "context 第12章通过" 0 "$code"
  assert_contains "context 第12章大纲" "### 第12章" "$out"
  assert_contains "context 第12章前文摘要" "# 第11章 摘要" "$out"

  # 前导零：08 在账本停在第2章的情况下应按第8章报错，而不是崩溃
  out="$(cd "$FIXTURE_SRC" && bash "$SCRIPTS/context.sh" 08 write 2>&1)"; code=$?
  assert_exit "context 章号前导零拒绝" 1 "$code"
  assert_contains "context 章号前导零提示第8章" "第8章" "$out"
  assert_not_contains "context 章号前导零不含第08章" "第08章" "$out"
  assert_not_contains "context 章号前导零不含unbound" "unbound variable" "$out"
  assert_not_contains "context 章号前导零不含invalid" "invalid number" "$out"
}

# ---------- wordcount-hook.sh ----------
test_hook() {
  local d out
  d="$(make_novel)"
  out="$(cd "$d" && printf '{"tool_name":"Write","tool_input":{"file_path":"%s/chapters/Chapter-01.md"},"cwd":"%s"}' "$d" "$d" | bash "$PLUGIN/hooks/wordcount-hook.sh")"
  assert_contains "hook 报字数" "第1章当前" "$out"
  assert_contains "hook 报目标" "目标 300 到 800 字" "$out"
  assert_contains "hook 是 JSON" '"additionalContext"' "$out"
  assert_not_contains "hook 区间内不提醒" "超出" "$out"

  # 非章节文件 → 无输出
  out="$(cd "$d" && printf '{"tool_name":"Write","tool_input":{"file_path":"%s/outline.md"},"cwd":"%s"}' "$d" "$d" | bash "$PLUGIN/hooks/wordcount-hook.sh")"
  assert_eq "hook 非章节静默" "" "$out"

  # 字数不足 → 提醒
  printf '# 第3章 x\n\n短。\n' > "$d/chapters/Chapter-03.md"
  out="$(cd "$d" && printf '{"tool_name":"Write","tool_input":{"file_path":"%s/chapters/Chapter-03.md"},"cwd":"%s"}' "$d" "$d" | bash "$PLUGIN/hooks/wordcount-hook.sh")"
  assert_contains "hook 不足提醒" "低于目标" "$out"

  # novel.yaml 没有 chapter_words → 只报字数，不报目标
  d="$(make_novel)"
  perl -CSD -ni -e 'print unless /^chapter_words:/' "$d/novel.yaml"
  out="$(cd "$d" && printf '{"tool_name":"Write","tool_input":{"file_path":"%s/chapters/Chapter-01.md"},"cwd":"%s"}' "$d" "$d" | bash "$PLUGIN/hooks/wordcount-hook.sh")"
  assert_contains "hook 无字数区间报字数" "第1章当前 247 字。" "$out"
  assert_not_contains "hook 无字数区间不报目标" "目标" "$out"
}

# ---------- model.sh ----------
test_model() {
  local d out
  d="$(make_novel)"
  # fixture 的 novel.yaml 没有 models 段
  out="$(cd "$d" && bash "$SCRIPTS/model.sh" writer)"
  assert_eq "model 无配置取 inherit" "inherit" "$out"
  out="$(cd "$d" && bash "$SCRIPTS/model.sh" writer "")"
  assert_eq "model 空覆盖串取 inherit" "inherit" "$out"
  out="$(cd "$d" && bash "$SCRIPTS/model.sh" writer haiku)"
  assert_eq "model 裸名覆盖" "haiku" "$out"
  bash "$SCRIPTS/model.sh" cook >/dev/null 2>&1
  assert_exit "model 未知角色" 1 $?
  bash "$SCRIPTS/model.sh" >/dev/null 2>&1
  assert_exit "model 缺参数" 1 $?

  printf 'models:\n  writer: opus\n  reviewer: "sonnet"   # 注释\n  archivist:\n\npov: 第一人称\n' >> "$d/novel.yaml"
  out="$(cd "$d" && bash "$SCRIPTS/model.sh" writer)"
  assert_eq "model yaml 取值" "opus" "$out"
  out="$(cd "$d" && bash "$SCRIPTS/model.sh" reviewer)"
  assert_eq "model yaml 去引号去注释" "sonnet" "$out"
  out="$(cd "$d" && bash "$SCRIPTS/model.sh" archivist)"
  assert_eq "model yaml 空值取 inherit" "inherit" "$out"
  out="$(cd "$d" && bash "$SCRIPTS/model.sh" editor)"
  assert_eq "model yaml 缺角色取 inherit" "inherit" "$out"
  out="$(cd "$d" && bash "$SCRIPTS/model.sh" writer haiku)"
  assert_eq "model 裸名覆盖优先于 yaml" "haiku" "$out"
  out="$(cd "$d" && bash "$SCRIPTS/model.sh" reviewer "writer=haiku,reviewer=fable")"
  assert_eq "model 角色覆盖命中" "fable" "$out"
  out="$(cd "$d" && bash "$SCRIPTS/model.sh" writer "writer=haiku, reviewer=fable")"
  assert_eq "model 角色覆盖带空格" "haiku" "$out"
  out="$(cd "$d" && bash "$SCRIPTS/model.sh" editor "writer=haiku,reviewer=fable")"
  assert_eq "model 角色覆盖未命中回退 yaml" "inherit" "$out"
  out="$(cd "$d" && bash "$SCRIPTS/model.sh" reviewer "writer=haiku")"
  assert_eq "model 角色覆盖未命中取 yaml 值" "sonnet" "$out"
  out="$(cd /tmp && bash "$SCRIPTS/model.sh" writer)"
  assert_eq "model 无 novel.yaml 取 inherit" "inherit" "$out"

  # 模板写法：models: 行带行尾注释
  d="$(make_novel)"
  printf 'models:   # 各子代理用的模型\n  writer: opus\n' >> "$d/novel.yaml"
  out="$(cd "$d" && bash "$SCRIPTS/model.sh" writer)"
  assert_eq "model models 行带注释" "opus" "$out"
  # 用 init 模板本身跑一遍
  d="$(make_novel)"
  sed -e 's/__TITLE__/测试/' -e 's/__SKILL__/general/' "$PLUGIN/templates/novel.yaml" > "$d/novel.yaml"
  out="$(cd "$d" && bash "$SCRIPTS/model.sh" archivist)"
  assert_eq "model 模板默认 archivist" "sonnet" "$out"
}

# ---------- bible-snapshot.sh / rollback.sh ----------
test_rollback() {
  local d out code
  d="$(make_novel)"   # 账本截至第2章，chapters/summaries 1-2

  # 快照
  bash "$SCRIPTS/bible-snapshot.sh" >/dev/null 2>&1
  assert_exit "snapshot 缺参数" 1 $?
  (cd "$d" && bash "$SCRIPTS/bible-snapshot.sh" 03x) >/dev/null 2>&1
  assert_exit "snapshot 非法章号" 1 $?
  out="$(cd "$d" && bash "$SCRIPTS/bible-snapshot.sh" 3)"; code=$?
  assert_exit "snapshot 成功" 0 $code
  assert_contains "snapshot 报路径" "bible/.history/before-03" "$out"
  for f in state threads timeline facts; do
    assert_eq "snapshot 复制 $f" "$(cat "$d/bible/$f.md")" "$(cat "$d/bible/.history/before-03/$f.md" 2>/dev/null)"
  done
  # 再定稿一次会覆盖旧快照
  echo "- 新行" >> "$d/bible/facts.md"
  (cd "$d" && bash "$SCRIPTS/bible-snapshot.sh" 3) >/dev/null
  assert_eq "snapshot 覆盖旧快照" "$(cat "$d/bible/facts.md")" "$(cat "$d/bible/.history/before-03/facts.md")"

  # 回滚：参数校验
  (cd "$d" && bash "$SCRIPTS/rollback.sh") >/dev/null 2>&1
  assert_exit "rollback 缺参数" 1 $?
  (cd "$d" && bash "$SCRIPTS/rollback.sh" 0) >/dev/null 2>&1
  assert_exit "rollback 章号 0" 1 $?
  out="$(cd "$d" && bash "$SCRIPTS/rollback.sh" 4 2>&1)"; code=$?
  assert_exit "rollback N 大于账本截至章" 1 $code
  assert_contains "rollback N 大于 M 说明" "截至第2章" "$out"
  out="$(cd "$d" && bash "$SCRIPTS/rollback.sh" 2 2>&1)"; code=$?
  assert_exit "rollback 无快照" 1 $code
  assert_contains "rollback 无快照说明" "快照" "$out"
  assert_eq "rollback 失败不改账本" "# 故事状态（截至第2章）" "$(head -1 "$d/bible/state.md")"

  # 造一个截至第1章的快照
  mkdir -p "$d/bible/.history/before-02"
  cp "$d/bible/"*.md "$d/bible/.history/before-02/"
  perl -CSD -pi -e 'use utf8; s/截至第2章/截至第1章/' "$d/bible/.history/before-02/state.md"

  # dry-run 只报告不动
  out="$(cd "$d" && bash "$SCRIPTS/rollback.sh" 2 --dry-run 2>&1)"; code=$?
  assert_exit "rollback dry-run 退出 0" 0 $code
  assert_contains "rollback dry-run 列出摘要" "summaries/Chapter-02.md" "$out"
  assert_contains "rollback dry-run 列出过期快照" "before-03" "$out"
  assert_eq "rollback dry-run 不改账本" "# 故事状态（截至第2章）" "$(head -1 "$d/bible/state.md")"
  [ -f "$d/summaries/Chapter-02.md" ]; assert_exit "rollback dry-run 不移摘要" 0 $?

  # 真回滚
  out="$(cd "$d" && bash "$SCRIPTS/rollback.sh" 2 2>&1)"; code=$?
  assert_exit "rollback 成功" 0 $code
  assert_eq "rollback 账本回到第1章" "# 故事状态（截至第1章）" "$(head -1 "$d/bible/state.md")"
  [ -f "$d/summaries/Chapter-02.md" ]; assert_exit "rollback 移走第2章摘要" 1 $?
  [ -f "$d/summaries/Chapter-01.md" ]; assert_exit "rollback 保留第1章摘要" 0 $?
  [ -f "$d/chapters/Chapter-02.md" ]; assert_exit "rollback 保留正文" 0 $?
  [ -d "$d/bible/.history/before-02" ]; assert_exit "rollback 保留所用快照" 0 $?
  [ -d "$d/bible/.history/before-03" ]; assert_exit "rollback 移走过期快照" 1 $?
  local bk
  bk="$(ls -d "$d"/bible/.history/rollback-* 2>/dev/null | head -1)"
  [ -f "$bk/summaries/Chapter-02.md" ]; assert_exit "rollback 备份摘要" 0 $?
  [ -f "$bk/bible/state.md" ]; assert_exit "rollback 备份回滚前账本" 0 $?
  [ -d "$bk/before-03" ]; assert_exit "rollback 备份过期快照" 0 $?
  assert_contains "rollback 报告备份位置" "rollback-" "$out"
  (cd "$d" && bash "$SCRIPTS/bible-check.sh") >/dev/null 2>&1
  assert_exit "rollback 后 bible-check 通过" 0 $?

  # 连续回滚第二次
  mkdir -p "$d/bible/.history/before-01"
  cp "$d/bible/"*.md "$d/bible/.history/before-01/"
  perl -CSD -pi -e 'use utf8; s/截至第1章/截至第0章/' "$d/bible/.history/before-01/state.md"
  out="$(cd "$d" && bash "$SCRIPTS/rollback.sh" 1 2>&1)"; code=$?
  assert_exit "rollback 第二次成功" 0 $code
  assert_eq "rollback 账本回到第0章" "# 故事状态（截至第0章）" "$(head -1 "$d/bible/state.md")"
  assert_eq "rollback 摘要清空" "0" "$(ls "$d/summaries" | wc -l | tr -d ' ')"
  assert_eq "rollback 两个备份目录" "2" "$(ls -d "$d"/bible/.history/rollback-* | wc -l | tr -d ' ')"

  # 定稿中途失败：账本首行仍是 N-1，但快照和半成品摘要已在
  d="$(make_novel)"
  (cd "$d" && bash "$SCRIPTS/bible-snapshot.sh" 3) >/dev/null
  echo "- 半更新的行" >> "$d/bible/facts.md"
  echo "# 第3章 摘要" > "$d/summaries/Chapter-03.md"
  (cd "$d" && bash "$SCRIPTS/rollback.sh" 4) >/dev/null 2>&1
  assert_exit "rollback N 大于 M+1 拒绝" 1 $?
  out="$(cd "$d" && bash "$SCRIPTS/rollback.sh" 3 2>&1)"; code=$?
  assert_exit "rollback 半更新 N=M+1 允许" 0 $code
  assert_contains "rollback 半更新说明" "未完成定稿" "$out"
  assert_not_contains "rollback 半更新恢复 facts" "半更新的行" "$(cat "$d/bible/facts.md")"
  [ -f "$d/summaries/Chapter-03.md" ]; assert_exit "rollback 半更新移走半成品摘要" 1 $?
  assert_eq "rollback 半更新账本仍截至第2章" "# 故事状态（截至第2章）" "$(head -1 "$d/bible/state.md")"
}

# ---------- context.sh --save ----------
test_context_save() {
  local d out code f
  d="$(make_novel)"
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 2 review --save 2>&1)"; code=$?
  assert_exit "context --save 退出 0" 0 $code
  assert_eq "context --save 只打印一行" "1" "$(printf '%s\n' "$out" | wc -l | tr -d ' ')"
  assert_eq "context --save 路径" "$d/.novel/context-02-review.md" "$out"
  f="$out"
  [ -f "$f" ]; assert_exit "context --save 文件存在" 0 $?
  assert_contains "context --save 内容含正文段" "===== 本章正文 =====" "$(cat "$f")"
  assert_eq "context --save 与 stdout 模式一致" "$(cd "$d" && bash "$SCRIPTS/context.sh" 2 review)" "$(cat "$f")"
  # 再跑一次覆盖
  (cd "$d" && bash "$SCRIPTS/context.sh" 2 review --save) >/dev/null
  assert_eq "context --save 覆盖不追加" "1" "$(grep -c '^===== 本章正文 =====$' "$f")"
  # 前置检查失败时不建文件
  out="$(cd "$d" && bash "$SCRIPTS/context.sh" 4 write --save 2>&1)"; code=$?
  assert_exit "context --save 前置失败退出 1" 1 $code
  [ -f "$d/.novel/context-04-write.md" ]; assert_exit "context --save 前置失败不建文件" 1 $?
  (cd "$d" && bash "$SCRIPTS/context.sh" 2 review --nope) >/dev/null 2>&1
  assert_exit "context 第三个参数非法" 1 $?
}

test_wordcount
test_bible_check
test_context
test_context_more
test_hook
test_model
test_rollback
test_context_save

echo "passed: $PASS, failed: $FAIL"
[ "$FAIL" -eq 0 ]
