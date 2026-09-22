"""纯函数层：notes.md、检索、审稿报告。不含 HTTP。"""
import glob
import os
import re

NOTE_HEAD = re.compile(r"^## (A\d+) (.*)$")
STATUS_LINE = re.compile(r"^- 状态：(未处理|已处理|作废)\s*$")
LOC_LINE = re.compile(r"^- 位置：(.+?)「(.+)」( 已处理)?\s*$")
COMMENT_LINE = re.compile(r"^- 说明：(.*)$")
CHAPTER_REF = re.compile(r"^第(\d+)章$")
CHAPTER_FILE = re.compile(r"^chapters/Chapter-(\d+)\.md$")
STATUSES = ("未处理", "已处理", "作废")


def chapter_path(n):
    return "chapters/Chapter-%02d.md" % int(n)


def chapter_of(path):
    m = CHAPTER_FILE.match(path)
    return int(m.group(1)) if m else None


def _loc_from_line(m):
    where, quote, done = m.group(1).strip(), m.group(2), bool(m.group(3))
    cm = CHAPTER_REF.match(where)
    if cm:
        n = int(cm.group(1))
        return {"path": chapter_path(n), "chapter": n, "quote": quote, "done": done}
    return {"path": where, "chapter": None, "quote": quote, "done": done}


def parse_notes(text):
    notes = []
    cur = None
    for raw in text.splitlines():
        line = raw.rstrip("\n")
        hm = NOTE_HEAD.match(line)
        if hm:
            cur = {"id": hm.group(1), "title": hm.group(2).strip(), "status": "未处理",
                   "comment": "", "locations": [], "extra": []}
            notes.append(cur)
            continue
        if cur is None or not line.strip():
            continue
        sm = STATUS_LINE.match(line)
        if sm:
            cur["status"] = sm.group(1)
            continue
        lm = LOC_LINE.match(line)
        if lm:
            cur["locations"].append(_loc_from_line(lm))
            continue
        cm = COMMENT_LINE.match(line)
        if cm:
            cur["comment"] = cm.group(1).strip()
            continue
        cur["extra"].append(line)
    return notes


def _loc_to_line(loc):
    where = "第%d章" % loc["chapter"] if loc.get("chapter") else loc["path"]
    return "- 位置：%s「%s」%s" % (where, loc["quote"], " 已处理" if loc.get("done") else "")


def serialize_notes(notes):
    out = ["# 作者批注", ""]
    for n in notes:
        out.append("## %s %s" % (n["id"], n["title"]))
        out.append("- 状态：%s" % n.get("status", "未处理"))
        for loc in n.get("locations", []):
            out.append(_loc_to_line(loc))
        if n.get("comment"):
            out.append("- 说明：%s" % n["comment"])
        out.extend(n.get("extra", []))
        out.append("")
    return "\n".join(out).rstrip("\n") + "\n"


def next_note_id(notes):
    mx = 0
    for n in notes:
        m = re.match(r"A(\d+)$", n["id"])
        if m:
            mx = max(mx, int(m.group(1)))
    return "A%d" % (mx + 1)


def find_quote(text, quote):
    return text.find(quote) if quote else -1


def expand_unique(text, quote, index=None, limit=120):
    """把 quote 向两侧扩展直到在 text 中唯一；index 是选区在 text 中的偏移，缺省取首次出现。"""
    if not quote or text.count(quote) <= 1:
        return quote
    start = index if index is not None and text[index:index + len(quote)] == quote else text.find(quote)
    if start < 0:
        return quote
    end = start + len(quote)
    step_left = True
    while text.count(text[start:end]) > 1 and (end - start) < limit:
        if step_left and start > 0 and text[start - 1] != "\n":
            start -= 1
        elif end < len(text) and text[end] != "\n":
            end += 1
        elif start > 0 and text[start - 1] != "\n":
            start -= 1
        else:
            break
        step_left = not step_left
    return text[start:end]


def read_text(root, rel):
    with open(os.path.join(root, rel), encoding="utf-8") as f:
        return f.read()


class NotesStore:
    FILE = "notes.md"

    def __init__(self, root):
        self.root = root

    def _path(self):
        return os.path.join(self.root, self.FILE)

    def load(self):
        if not os.path.exists(self._path()):
            return []
        return parse_notes(read_text(self.root, self.FILE))

    def save(self, notes):
        with open(self._path(), "w", encoding="utf-8") as f:
            f.write(serialize_notes(notes))

    def _resolve(self, loc):
        path = loc["path"]
        n = chapter_of(path)
        try:
            text = read_text(self.root, path)
        except OSError:
            raise ValueError("文件不存在: %s" % path)
        quote = loc["quote"].replace("\n", "").strip()
        if find_quote(text, quote) < 0:
            raise ValueError("引用在 %s 中找不到: %s" % (path, quote))
        quote = expand_unique(text, quote, loc.get("index"))
        return {"path": path, "chapter": n, "quote": quote, "done": False}

    def _get(self, notes, note_id):
        for n in notes:
            if n["id"] == note_id:
                return n
        raise KeyError(note_id)

    def create(self, title, comment, locations):
        notes = self.load()
        note = {"id": next_note_id(notes), "title": (title or "").strip() or "未命名", "status": "未处理",
                "comment": (comment or "").strip(), "locations": [self._resolve(l) for l in locations], "extra": []}
        notes.append(note)
        self.save(notes)
        return note

    def add_locations(self, note_id, locations):
        notes = self.load()
        note = self._get(notes, note_id)
        for l in locations:
            note["locations"].append(self._resolve(l))
        self.save(notes)
        return note

    def update(self, note_id, status=None, comment=None, title=None):
        notes = self.load()
        note = self._get(notes, note_id)
        if status is not None:
            if status not in STATUSES:
                raise ValueError("状态只能是 未处理/已处理/作废")
            note["status"] = status
        if comment is not None:
            note["comment"] = comment.strip()
        if title is not None and title.strip():
            note["title"] = title.strip()
        self.save(notes)
        return note

    def remove_location(self, note_id, path, quote):
        notes = self.load()
        note = self._get(notes, note_id)
        note["locations"] = [l for l in note["locations"] if not (l["path"] == path and l["quote"] == quote)]
        self.save(notes)
        return note


HAN = re.compile(r"[⺀-⿟々〇〡-〩〸-〻㐀-䶿一-鿿豈-﫿\U00020000-\U0003134f]")
BIBLE_FILES = ["bible/state.md", "bible/threads.md", "bible/timeline.md", "bible/facts.md"]


def count_han(text):
    body = text.split("\n", 1)[1] if "\n" in text else ""
    return len(HAN.findall(body))


def _chapter_files(root):
    files = []
    for p in glob.glob(os.path.join(root, "chapters", "Chapter-*.md")):
        rel = os.path.relpath(p, root)
        if chapter_of(rel) is not None:
            files.append(rel)
    return sorted(files, key=lambda r: chapter_of(r))


def scope_files(root, scopes):
    files = []
    for s in scopes:
        if s == "chapters":
            files += _chapter_files(root)
        elif s == "outline" and os.path.exists(os.path.join(root, "outline.md")):
            files.append("outline.md")
        elif s == "characters":
            files += sorted(os.path.relpath(p, root) for p in glob.glob(os.path.join(root, "characters", "*.md")))
        elif s == "bible":
            files += [b for b in BIBLE_FILES if os.path.exists(os.path.join(root, b))]
    return files


def search(root, q, scopes, per_file=50, ctx=30):
    q = (q or "").replace("\n", "").strip()
    if not q:
        return []
    hits = []
    for rel in scope_files(root, scopes):
        text = read_text(root, rel)
        n = chapter_of(rel)
        start = 0
        count = 0
        while count < per_file:
            i = text.find(q, start)
            if i < 0:
                break
            hits.append({
                "path": rel, "chapter": n, "index": i,
                "before": text[max(0, i - ctx):i].replace("\n", " "),
                "match": q,
                "after": text[i + len(q):i + len(q) + ctx].replace("\n", " "),
            })
            start = i + len(q)
            count += 1
    return hits


def _upto(root):
    try:
        first = read_text(root, "bible/state.md").split("\n", 1)[0]
    except OSError:
        return 0
    m = re.match(r"# 故事状态（截至第(\d+)章）", first)
    return int(m.group(1)) if m else 0


def list_chapters(root):
    upto = _upto(root)
    out = []
    for rel in _chapter_files(root):
        n = chapter_of(rel)
        text = read_text(root, rel)
        first = text.split("\n", 1)[0]
        m = re.match(r"#\s*第\d+章\s*(.*)$", first)
        title = (m.group(1) if m else first.lstrip("# ")).strip()
        out.append({"n": n, "title": title, "words": count_han(text), "finalized": n <= upto,
                    "has_review": os.path.exists(os.path.join(root, "reviews", "Chapter-%02d.md" % n))})
    return out


def project_info(root):
    title = ""
    try:
        for line in read_text(root, "novel.yaml").splitlines():
            m = re.match(r"^title:\s*(.*?)\s*(#.*)?$", line)
            if m:
                title = m.group(1).strip().strip("'\"")
                break
    except OSError:
        pass
    planned = 0
    try:
        planned = len(re.findall(r"^### 第\d+章", read_text(root, "outline.md"), re.M))
    except OSError:
        pass
    return {"title": title, "upto": _upto(root), "planned": planned}


def safe_path(root, rel):
    if not rel or rel.startswith("/") or ".." in rel.split("/") or not rel.endswith(".md"):
        return None
    base = os.path.realpath(root)
    full = os.path.realpath(os.path.join(base, rel))
    if not full.startswith(base + os.sep) or not os.path.isfile(full):
        return None
    return full


LEVEL_HEAD = re.compile(r"^## (critical|major|minor|suggestion)\s*$")
ITEM_HEAD = re.compile(r"^### ([CMNS]\d+)\s+(.*)$")
QUOTE_IN = re.compile(r'"([^"]+)"|"([^"]+)"|「([^」]+)」')
FIELD = re.compile(r"^- (原文|依据|问题|建议|已处理|未处理)：(.*)$")


def parse_review(text):
    summary = ""
    items = []
    level = None
    cur = None
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.strip() == "## 汇总":
            for nxt in lines[i + 1:i + 3]:
                if nxt.strip():
                    summary = nxt.strip()
                    break
            continue
        lm = LEVEL_HEAD.match(line)
        if lm:
            level = lm.group(1)
            cur = None
            continue
        im = ITEM_HEAD.match(line)
        if im and level:
            cur = {"id": im.group(1), "level": level, "title": im.group(2).strip(), "quote": "",
                   "evidence": "", "problem": "", "suggestion": "", "handled": ""}
            items.append(cur)
            continue
        if cur is None:
            continue
        fm = FIELD.match(line)
        if not fm:
            continue
        key, val = fm.group(1), fm.group(2).strip()
        if key == "原文":
            q = QUOTE_IN.search(val)
            cur["quote"] = next((g for g in q.groups() if g), "") if q else val
        elif key == "依据":
            cur["evidence"] = val
        elif key == "问题":
            cur["problem"] = val
        elif key == "建议":
            cur["suggestion"] = val
        else:
            cur["handled"] = "%s：%s" % (key, val)
    return {"summary": summary, "items": items}


def mark_review_item(text, item_id, reason):
    lines = text.splitlines()
    start = None
    for i, line in enumerate(lines):
        im = ITEM_HEAD.match(line)
        if im and im.group(1) == item_id:
            start = i
            break
    if start is None:
        raise KeyError(item_id)
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if lines[j].startswith("### ") or lines[j].startswith("## "):
            end = j
            break
    block = lines[start:end]
    if any(FIELD.match(l) and FIELD.match(l).group(1) in ("已处理", "未处理") for l in block):
        raise ValueError("该条目已有处理标记")
    while block and not block[-1].strip():
        block.pop()
    block.append("- 未处理：%s" % reason.strip())
    block.append("")
    new_lines = lines[:start] + block + lines[end:]
    return "\n".join(new_lines).rstrip("\n") + "\n"


class ReviewStore:
    def __init__(self, root):
        self.root = root

    def _rel(self, n):
        return "reviews/Chapter-%02d.md" % int(n)

    def get(self, n):
        try:
            return parse_review(read_text(self.root, self._rel(n)))
        except OSError:
            return None

    def mark(self, n, item_id, reason):
        rel = self._rel(n)
        text = read_text(self.root, rel)
        new = mark_review_item(text, item_id, reason)
        with open(os.path.join(self.root, rel), "w", encoding="utf-8") as f:
            f.write(new)
        return parse_review(new)
