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
