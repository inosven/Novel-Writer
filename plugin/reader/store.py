"""纯函数层：notes.md、检索、审稿报告。不含 HTTP。"""
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
