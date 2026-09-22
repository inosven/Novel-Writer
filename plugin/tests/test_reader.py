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


class SearchTest(unittest.TestCase):
    def test_scope_files(self):
        files = store.scope_files(FIXTURE, ["chapters"])
        self.assertEqual(files, ["chapters/Chapter-01.md", "chapters/Chapter-02.md"])
        files = store.scope_files(FIXTURE, ["outline", "characters", "bible"])
        self.assertIn("outline.md", files)
        self.assertIn("characters/林砚.md", files)
        self.assertEqual([f for f in files if f.startswith("bible/")],
                         ["bible/state.md", "bible/threads.md", "bible/timeline.md", "bible/facts.md"])

    def test_search_chapters(self):
        hits = store.search(FIXTURE, "钥匙", ["chapters"])
        self.assertTrue(all(h["path"].startswith("chapters/") for h in hits))
        self.assertEqual(hits[0]["chapter"], 1)
        self.assertEqual(hits[0]["match"], "钥匙")
        self.assertNotIn("\n", hits[0]["before"] + hits[0]["after"])
        text = store.read_text(FIXTURE, hits[0]["path"])
        self.assertEqual(text[hits[0]["index"]:hits[0]["index"] + 2], "钥匙")

    def test_search_scope_and_cap(self):
        only_outline = store.search(FIXTURE, "钥匙", ["outline"])
        self.assertTrue(only_outline and all(h["path"] == "outline.md" for h in only_outline))
        capped = store.search(FIXTURE, "，", ["chapters"], per_file=2)
        self.assertLessEqual(sum(1 for h in capped if h["path"].endswith("01.md")), 2)
        self.assertEqual(store.search(FIXTURE, "", ["chapters"]), [])

    def test_list_chapters_and_project(self):
        chs = store.list_chapters(FIXTURE)
        self.assertEqual([c["n"] for c in chs], [1, 2])
        self.assertEqual(chs[0]["title"], "钥匙")
        self.assertEqual(chs[0]["words"], 247)
        self.assertTrue(chs[0]["finalized"])
        self.assertFalse(chs[0]["has_review"])
        info = store.project_info(FIXTURE)
        self.assertEqual(info, {"title": "夜班", "upto": 2, "planned": 6})

    def test_safe_path(self):
        self.assertTrue(store.safe_path(FIXTURE, "chapters/Chapter-01.md").endswith("Chapter-01.md"))
        self.assertIsNone(store.safe_path(FIXTURE, "../run.sh"))
        self.assertIsNone(store.safe_path(FIXTURE, "/etc/passwd"))
        self.assertIsNone(store.safe_path(FIXTURE, "novel.yaml"))
        self.assertIsNone(store.safe_path(FIXTURE, "chapters/Chapter-99.md"))


class QuoteTest(unittest.TestCase):
    def test_expand_unique_already_unique(self):
        self.assertEqual(store.expand_unique("甲乙丙丁", "乙丙"), "乙丙")

    def test_expand_unique_extends(self):
        text = "他说俺去。她说俺不去。"
        # "俺" 出现两次；给第二处的 index，应扩展到唯一
        got = store.expand_unique(text, "俺", index=text.index("俺", 3))
        self.assertEqual(text.count(got), 1)
        self.assertIn("俺", got)
        self.assertTrue(got in text)
        self.assertGreater(text.index(got), 3)

    def test_expand_unique_limit(self):
        text = "俺俺俺俺俺俺"
        got = store.expand_unique(text, "俺", index=0, limit=3)
        self.assertLessEqual(len(got), 3)

    def test_find_quote(self):
        self.assertEqual(store.find_quote("abc", "bc"), 1)
        self.assertEqual(store.find_quote("abc", "x"), -1)


class NotesStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        shutil.copytree(FIXTURE, self.tmp, dirs_exist_ok=True)
        self.s = store.NotesStore(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_create_and_load(self):
        n = self.s.create("钥匙颜色", "前后不一", [{"path": "chapters/Chapter-01.md", "quote": "铜钥匙"}])
        self.assertEqual(n["id"], "A1")
        self.assertEqual(n["locations"][0]["chapter"], 1)
        self.assertTrue(os.path.exists(os.path.join(self.tmp, "notes.md")))
        again = self.s.load()
        self.assertEqual(again[0]["title"], "钥匙颜色")
        self.assertEqual(again[0]["comment"], "前后不一")

    def test_create_rejects_missing_quote(self):
        with self.assertRaises(ValueError):
            self.s.create("x", "", [{"path": "chapters/Chapter-01.md", "quote": "这段话不存在于正文"}])

    def test_add_locations_and_remove(self):
        self.s.create("t", "", [{"path": "chapters/Chapter-01.md", "quote": "铜钥匙"}])
        n = self.s.add_locations("A1", [{"path": "outline.md", "quote": "铜钥匙"}])
        self.assertEqual(len(n["locations"]), 2)
        self.assertIsNone(n["locations"][1]["chapter"])
        n = self.s.remove_location("A1", "outline.md", "铜钥匙")
        self.assertEqual(len(n["locations"]), 1)

    def test_update(self):
        self.s.create("t", "", [{"path": "chapters/Chapter-01.md", "quote": "铜钥匙"}])
        n = self.s.update("A1", status="已处理", comment="改了")
        self.assertEqual(n["status"], "已处理")
        self.assertEqual(self.s.load()[0]["comment"], "改了")
        with self.assertRaises(ValueError):
            self.s.update("A1", status="随便")
        with self.assertRaises(KeyError):
            self.s.update("A9", status="作废")

    def test_ids_increase_and_unknown_lines_kept(self):
        self.s.create("a", "", [{"path": "chapters/Chapter-01.md", "quote": "铜钥匙"}])
        with open(os.path.join(self.tmp, "notes.md"), "a", encoding="utf-8") as f:
            f.write("- 备注：手写的一行\n")
        self.s.create("b", "", [{"path": "chapters/Chapter-02.md", "quote": "拆迁"}])
        notes = self.s.load()
        self.assertEqual([n["id"] for n in notes], ["A1", "A2"])
        self.assertEqual(notes[0]["extra"], ["- 备注：手写的一行"])


if __name__ == "__main__":
    unittest.main()
