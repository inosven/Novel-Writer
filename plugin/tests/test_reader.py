import json, os, sys, shutil, tempfile, threading, unittest, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "reader"))
import store  # noqa: E402
import reader  # noqa: E402

FIXTURE = os.path.join(HERE, "fixtures", "demo-novel")

REVIEW = """# 第2章 审稿报告

## 汇总
critical 1 / major 1 / minor 0 / suggestion 0
较上一版：已解决 0 条，保留 1 条，新增 1 条

## critical

### C1 地址不对
- 原文："青石路 47 号"，另见"那栋楼"
- 依据：bible/facts.md 地点
- 问题：账本写的是 45 号
- 建议：改成 45

## major

### M1 老陈突然知道太多
- 原文：“老陈说那栋楼去年就拆了”
- 依据：characters/老陈.md
- 问题：档案里他不住附近
- 建议：加一句他表哥住那儿
- 已处理：加了表哥

## minor
无

## suggestion
无
"""


SAMPLE = """# 作者批注

## A1 张飞自称"俺"
- 状态：未处理
- 位置：第4章「他见过俺兄长几回」
- 位置：第4章「他又提俺哥」 未处理：原文已变
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
        self.assertEqual(a1["locations"][0],
                         {"path": "chapters/Chapter-04.md", "chapter": 4, "quote": "他见过俺兄长几回", "done": False, "mark": ""})
        self.assertEqual(a1["locations"][1],
                         {"path": "chapters/Chapter-04.md", "chapter": 4, "quote": "他又提俺哥", "done": False, "mark": "未处理：原文已变"})
        self.assertEqual(a1["locations"][2]["done"], True)
        self.assertEqual(a1["locations"][2]["mark"], "已处理")
        self.assertEqual(a1["locations"][3], {"path": "bible/state.md", "chapter": None, "quote": "张飞……俺兄长", "done": False, "mark": ""})
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


class ReviewTest(unittest.TestCase):
    def test_parse(self):
        r = store.parse_review(REVIEW)
        self.assertEqual(r["summary"], "critical 1 / major 1 / minor 0 / suggestion 0")
        self.assertEqual([i["id"] for i in r["items"]], ["C1", "M1"])
        c1, m1 = r["items"]
        self.assertEqual(c1["level"], "critical")
        self.assertEqual(c1["title"], "地址不对")
        self.assertEqual(c1["quote"], "青石路 47 号")
        self.assertEqual(c1["evidence"], "bible/facts.md 地点")
        self.assertEqual(c1["problem"], "账本写的是 45 号")
        self.assertEqual(c1["suggestion"], "改成 45")
        self.assertEqual(c1["handled"], "")
        self.assertEqual(m1["quote"], "老陈说那栋楼去年就拆了")
        self.assertEqual(m1["handled"], "已处理：加了表哥")
        # Test corner bracket quote parsing
        corner_review = "## critical\n\n### C2 test\n- 原文：「甲乙」\n"
        c2 = store.parse_review(corner_review)["items"][0]
        self.assertEqual(c2["quote"], "甲乙")

    def test_mark(self):
        new = store.mark_review_item(REVIEW, "C1", "作者接受")
        self.assertIn("- 建议：改成 45\n- 未处理：作者接受\n\n## major", new)
        self.assertEqual(store.parse_review(new)["items"][0]["handled"], "未处理：作者接受")
        with self.assertRaises(ValueError):
            store.mark_review_item(new, "C1", "再标一次")
        with self.assertRaises(ValueError):
            store.mark_review_item(REVIEW, "M1", "已处理的不能再标")
        with self.assertRaises(KeyError):
            store.mark_review_item(REVIEW, "C9", "x")

    def test_review_store(self):
        tmp = tempfile.mkdtemp()
        try:
            shutil.copytree(FIXTURE, tmp, dirs_exist_ok=True)
            rs = store.ReviewStore(tmp)
            self.assertIsNone(rs.get(2))
            os.makedirs(os.path.join(tmp, "reviews"))
            with open(os.path.join(tmp, "reviews", "Chapter-02.md"), "w", encoding="utf-8") as f:
                f.write(REVIEW)
            self.assertEqual(len(rs.get(2)["items"]), 2)
            r = rs.mark(2, "C1", "接受")
            self.assertEqual(r["items"][0]["handled"], "未处理：接受")
            self.assertIn("- 未处理：接受", open(os.path.join(tmp, "reviews", "Chapter-02.md"), encoding="utf-8").read())
        finally:
            shutil.rmtree(tmp)


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
        self.assertEqual(chs[0]["words"], 230)
        self.assertTrue(chs[0]["finalized"])
        self.assertFalse(chs[0]["has_review"])
        info = store.project_info(FIXTURE)
        self.assertEqual(info, {"title": "夜班", "upto": 2, "planned": 6})

    def test_count_words_mixed(self):
        text = "# 标题 title\n\n他说 hello world，don't stop。日本語テスト 한국어 123 — \"quoted\"\n"
        self.assertEqual(store.count_words(text), 17)
        self.assertEqual(store.count_words("# t\n\nIt was a bright cold day in April, and the clocks were striking thirteen.\n"), 14)
        self.assertEqual(store.count_words("# 只有标题"), 0)

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
        # "俺" 出现两次；给第二处的 index，应扩展到唯一，且锚点仍覆盖原选区位置
        idx = text.index("俺", 3)
        got = store.expand_unique(text, "俺", index=idx)
        self.assertEqual(text.count(got), 1)
        self.assertIn("俺", got)
        self.assertTrue(got in text)
        pos = text.find(got)
        self.assertTrue(pos <= idx < pos + len(got))

    def test_expand_unique_limit(self):
        text = "俺俺俺俺俺俺"
        got = store.expand_unique(text, "俺", index=0, limit=3)
        self.assertLessEqual(len(got), 3)  # limit 仍然优先于 MIN_ANCHOR

    def test_expand_unique_min_anchor(self):
        text = "他说俺去看看。她说俺不想去。谁问俺累不累。"
        got = store.expand_unique(text, "俺", index=text.index("俺", 3))
        self.assertEqual(text.count(got), 1)
        self.assertGreaterEqual(len(got), store.MIN_ANCHOR)
        self.assertIn(got, text)

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
        n = self.s.create("钥匙颜色", "前后不一", [{"path": "chapters/Chapter-01.md", "quote": "一把钥匙"}])
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
        self.s.create("t", "", [{"path": "chapters/Chapter-01.md", "quote": "一把钥匙"}])
        n = self.s.add_locations("A1", [{"path": "outline.md", "quote": "铜钥匙"}])
        self.assertEqual(len(n["locations"]), 2)
        self.assertIsNone(n["locations"][1]["chapter"])
        n = self.s.remove_location("A1", "outline.md", "铜钥匙")
        self.assertEqual(len(n["locations"]), 1)

    def test_update(self):
        self.s.create("t", "", [{"path": "chapters/Chapter-01.md", "quote": "一把钥匙"}])
        n = self.s.update("A1", status="已处理", comment="改了")
        self.assertEqual(n["status"], "已处理")
        self.assertEqual(self.s.load()[0]["comment"], "改了")
        with self.assertRaises(ValueError):
            self.s.update("A1", status="随便")
        with self.assertRaises(KeyError):
            self.s.update("A9", status="作废")

    def test_ids_increase_and_unknown_lines_kept(self):
        self.s.create("a", "", [{"path": "chapters/Chapter-01.md", "quote": "一把钥匙"}])
        with open(os.path.join(self.tmp, "notes.md"), "a", encoding="utf-8") as f:
            f.write("- 备注：手写的一行\n")
        self.s.create("b", "", [{"path": "chapters/Chapter-02.md", "quote": "拆迁"}])
        notes = self.s.load()
        self.assertEqual([n["id"] for n in notes], ["A1", "A2"])
        self.assertEqual(notes[0]["extra"], ["- 备注：手写的一行"])

    def test_resolve_rejects_unsafe_path(self):
        with self.assertRaises(ValueError):
            self.s.create("x", "", [{"path": "../outline.md", "quote": "钥匙"}])

    def test_create_concurrent(self):
        threads = [threading.Thread(target=self.s.create,
                                     args=("t%d" % i, "", [{"path": "chapters/Chapter-01.md", "quote": "一把钥匙"}]))
                   for i in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        notes = self.s.load()
        self.assertEqual(len(notes), 8)
        self.assertEqual({n["id"] for n in notes}, {"A%d" % i for i in range(1, 9)})


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        shutil.copytree(FIXTURE, cls.tmp, dirs_exist_ok=True)
        os.makedirs(os.path.join(cls.tmp, "reviews"))
        with open(os.path.join(cls.tmp, "reviews", "Chapter-02.md"), "w", encoding="utf-8") as f:
            f.write(REVIEW)
        cls.srv = reader.make_server(cls.tmp, 0)
        cls.port = cls.srv.server_address[1]
        cls.thread = threading.Thread(target=cls.srv.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        shutil.rmtree(cls.tmp)

    def req(self, method, path, body=None):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        r = urllib.request.Request("http://127.0.0.1:%d%s" % (self.port, path), data=data, method=method,
                                   headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(r) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode("utf-8"))

    def test_project_and_chapters(self):
        s, body = self.req("GET", "/api/project")
        self.assertEqual((s, body["title"], body["upto"]), (200, "夜班", 2))
        s, body = self.req("GET", "/api/chapters")
        self.assertEqual([c["n"] for c in body], [1, 2])
        self.assertTrue(body[1]["has_review"])

    def test_file_and_safety(self):
        s, body = self.req("GET", "/api/file?path=chapters/Chapter-01.md")
        self.assertEqual(s, 200)
        self.assertTrue(body["text"].startswith("# 第1章 钥匙"))
        s, body = self.req("GET", "/api/file?path=../run.sh")
        self.assertEqual(s, 404)
        s, body = self.req("GET", "/api/file?path=novel.yaml")
        self.assertEqual(s, 404)

    def test_search(self):
        s, body = self.req("GET", "/api/search?q=%E9%92%A5%E5%8C%99&scope=chapters,outline")
        self.assertEqual(s, 200)
        self.assertTrue(any(h["path"] == "outline.md" for h in body))
        self.assertTrue(any(h["chapter"] == 1 for h in body))

    def test_notes_flow(self):
        s, note = self.req("POST", "/api/notes", {"title": "t", "comment": "c",
                                                  "locations": [{"path": "chapters/Chapter-01.md", "quote": "一把钥匙"}]})
        self.assertEqual(s, 200)
        nid = note["id"]
        s, note = self.req("POST", "/api/notes/%s/locations" % nid, {"locations": [{"path": "outline.md", "quote": "铜钥匙"}]})
        self.assertEqual(len(note["locations"]), 2)
        s, note = self.req("POST", "/api/notes/%s" % nid, {"status": "作废"})
        self.assertEqual(note["status"], "作废")
        s, note = self.req("DELETE", "/api/notes/%s/locations" % nid, {"path": "outline.md", "quote": "铜钥匙"})
        self.assertEqual(len(note["locations"]), 1)
        s, body = self.req("GET", "/api/notes")
        self.assertEqual(body[-1]["id"], nid)
        s, body = self.req("POST", "/api/notes", {"title": "x", "locations": [{"path": "chapters/Chapter-01.md", "quote": "不存在的话"}]})
        self.assertEqual(s, 400)
        s, body = self.req("POST", "/api/notes/A99", {"status": "作废"})
        self.assertEqual(s, 404)

    def test_notes_location_path_safety(self):
        s, body = self.req("POST", "/api/notes", {"title": "y", "locations": [{"path": "novel.yaml", "quote": "钥匙"}]})
        self.assertEqual(s, 400)

    def test_delete_bad_json(self):
        r = urllib.request.Request("http://127.0.0.1:%d/api/notes/A1/locations" % self.port, data=b"{not json",
                                   method="DELETE", headers={"Content-Type": "application/json"})
        try:
            urllib.request.urlopen(r)
            self.fail("expected HTTPError")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 400)

    def test_reviews(self):
        s, body = self.req("GET", "/api/reviews/2")
        self.assertEqual(len(body["items"]), 2)
        s, body = self.req("GET", "/api/reviews/1")
        self.assertEqual(s, 404)
        s, body = self.req("POST", "/api/reviews/2/items/C1", {"reason": "接受"})
        self.assertEqual(body["items"][0]["handled"], "未处理：接受")
        s, body = self.req("POST", "/api/reviews/2/items/C1", {"reason": "again"})
        self.assertEqual(s, 409)

    def test_index(self):
        r = urllib.request.urlopen("http://127.0.0.1:%d/" % self.port)
        self.assertIn("text/html", r.headers["Content-Type"])

    def test_write_bad_content_type_rejected(self):
        r = urllib.request.Request("http://127.0.0.1:%d/api/notes" % self.port, data=b"{}",
                                   method="POST", headers={"Content-Type": "text/plain"})
        try:
            urllib.request.urlopen(r)
            self.fail("expected HTTPError")
        except urllib.error.HTTPError as e:
            e.close()
            self.assertEqual(e.code, 415)

    def test_write_bad_host_rejected(self):
        r = urllib.request.Request("http://127.0.0.1:%d/api/notes" % self.port, data=b"{}", method="POST",
                                   headers={"Content-Type": "application/json", "Host": "evil.example"})
        try:
            urllib.request.urlopen(r)
            self.fail("expected HTTPError")
        except urllib.error.HTTPError as e:
            e.close()
            self.assertEqual(e.code, 403)

    def test_readonly_endpoints_dont_write(self):
        notes_path = os.path.join(self.tmp, "notes.md")
        with open(notes_path, "w", encoding="utf-8") as f:
            f.write("# 作者批注\n")
        review_path = os.path.join(self.tmp, "reviews", "Chapter-02.md")
        before = {p: os.stat(p).st_mtime_ns for p in (notes_path, review_path)}
        self.req("GET", "/api/project")
        self.req("GET", "/api/chapters")
        self.req("GET", "/api/file?path=chapters/Chapter-01.md")
        self.req("GET", "/api/search?q=%E9%92%A5%E5%8C%99&scope=chapters")
        self.req("GET", "/api/notes")
        self.req("GET", "/api/reviews/2")
        after = {p: os.stat(p).st_mtime_ns for p in (notes_path, review_path)}
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
