import os, sys, shutil, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "reader"))
import store  # noqa: E402

FIXTURE = os.path.join(HERE, "fixtures", "demo-novel")

SAMPLE = """# 作者批注

## A1 张飞自称"俺"
- 状态：未处理
- 位置：第4章「他见过俺兄长几回」
- 位置：第5章「俺明日就去隆中」 已处理
- 位置：bible/state.md「张飞……俺兄长」
- 说明：前三章一律自称"我"。

## A3 空说明
- 状态：作废
- 位置：outline.md「第6章回响」
- 备注：这一行格式不认识
"""


class NotesTest(unittest.TestCase):
    def test_parse(self):
        notes = store.parse_notes(SAMPLE)
        self.assertEqual([n["id"] for n in notes], ["A1", "A3"])
        a1 = notes[0]
        self.assertEqual(a1["title"], '张飞自称"俺"')
        self.assertEqual(a1["status"], "未处理")
        self.assertEqual(a1["comment"], "前三章一律自称\"我\"。")
        self.assertEqual(a1["locations"][0], {"path": "chapters/Chapter-04.md", "chapter": 4, "quote": "他见过俺兄长几回", "done": False})
        self.assertEqual(a1["locations"][1]["done"], True)
        self.assertEqual(a1["locations"][2], {"path": "bible/state.md", "chapter": None, "quote": "张飞……俺兄长", "done": False})
        a3 = notes[1]
        self.assertEqual(a3["status"], "作废")
        self.assertEqual(a3["comment"], "")
        self.assertEqual(a3["extra"], ["- 备注：这一行格式不认识"])

    def test_roundtrip(self):
        notes = store.parse_notes(SAMPLE)
        self.assertEqual(store.serialize_notes(notes), SAMPLE)

    def test_empty(self):
        self.assertEqual(store.parse_notes(""), [])
        self.assertEqual(store.serialize_notes([]), "# 作者批注\n")

    def test_next_id(self):
        self.assertEqual(store.next_note_id([]), "A1")
        self.assertEqual(store.next_note_id(store.parse_notes(SAMPLE)), "A4")

    def test_chapter_path(self):
        self.assertEqual(store.chapter_path(4), "chapters/Chapter-04.md")
        self.assertEqual(store.chapter_of("chapters/Chapter-12.md"), 12)
        self.assertIsNone(store.chapter_of("bible/state.md"))


if __name__ == "__main__":
    unittest.main()
