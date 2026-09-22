#!/usr/bin/env python3
"""NovelWriter 阅读界面本地服务。用法：python3 reader.py --dir 小说目录 [--port 8765]"""
import argparse
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import store  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))


class Handler(BaseHTTPRequestHandler):
    root = "."

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    # ---- helpers ----
    def _json(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n == 0:
            return {}
        return json.loads(self.rfile.read(n).decode("utf-8"))

    def _guard_write(self):
        """写接口（POST/DELETE）的前置校验：只接受本机 Host，只接受 JSON 请求体。校验失败时自己写响应并返回 False。"""
        port = self.server.server_address[1]
        host = self.headers.get("Host", "")
        if host not in ("127.0.0.1:%d" % port, "localhost:%d" % port):
            self._json(403, {"error": "bad host"})
            return False
        ctype = self.headers.get("Content-Type", "")
        if not ctype.startswith("application/json"):
            self._json(415, {"error": "bad content-type"})
            return False
        return True

    def _index(self):
        path = os.path.join(HERE, "index.html")
        if not os.path.exists(path):
            return self._json(404, {"error": "index.html 不存在"})
        with open(path, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # ---- routing ----
    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        p = u.path
        try:
            if p == "/" or p == "/index.html":
                return self._index()
            if p == "/api/project":
                return self._json(200, store.project_info(self.root))
            if p == "/api/chapters":
                return self._json(200, store.list_chapters(self.root))
            if p == "/api/file":
                rel = (q.get("path") or [""])[0]
                full = store.safe_path(self.root, rel)
                if not full:
                    return self._json(404, {"error": "文件不存在或不允许: %s" % rel})
                with open(full, encoding="utf-8") as f:
                    return self._json(200, {"path": rel, "text": f.read()})
            if p == "/api/search":
                scopes = [s for s in (q.get("scope") or ["chapters"])[0].split(",") if s]
                return self._json(200, store.search(self.root, (q.get("q") or [""])[0], scopes))
            if p == "/api/notes":
                return self._json(200, store.NotesStore(self.root).load())
            m = re.match(r"^/api/reviews/(\d+)$", p)
            if m:
                r = store.ReviewStore(self.root).get(int(m.group(1)))
                if r is None:
                    return self._json(404, {"error": "没有第%s章的审稿报告" % m.group(1)})
                return self._json(200, r)
            return self._json(404, {"error": "未知路径"})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"error": str(e)})

    def do_POST(self):
        if not self._guard_write():
            return
        p = urlparse(self.path).path
        try:
            body = self._body()
            ns = store.NotesStore(self.root)
            if p == "/api/notes":
                return self._json(200, ns.create(body.get("title", ""), body.get("comment", ""), body.get("locations", [])))
            m = re.match(r"^/api/notes/(A\d+)/locations$", p)
            if m:
                return self._json(200, ns.add_locations(m.group(1), body.get("locations", [])))
            m = re.match(r"^/api/notes/(A\d+)$", p)
            if m:
                return self._json(200, ns.update(m.group(1), body.get("status"), body.get("comment"), body.get("title")))
            m = re.match(r"^/api/reviews/(\d+)/items/([CMNS]\d+)$", p)
            if m:
                reason = (body.get("reason") or "").strip()
                if not reason:
                    return self._json(400, {"error": "需要原因"})
                return self._json(200, store.ReviewStore(self.root).mark(int(m.group(1)), m.group(2), reason))
            return self._json(404, {"error": "未知路径"})
        except KeyError as e:
            return self._json(404, {"error": "不存在: %s" % e})
        except ValueError as e:
            msg = str(e)
            return self._json(409 if "已有处理标记" in msg else 400, {"error": msg})
        except OSError as e:
            return self._json(404, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"error": str(e)})

    def do_DELETE(self):
        if not self._guard_write():
            return
        p = urlparse(self.path).path
        try:
            body = self._body()
            m = re.match(r"^/api/notes/(A\d+)/locations$", p)
            if m:
                return self._json(200, store.NotesStore(self.root).remove_location(m.group(1), body.get("path", ""), body.get("quote", "")))
            return self._json(404, {"error": "未知路径"})
        except KeyError as e:
            return self._json(404, {"error": "不存在: %s" % e})
        except ValueError as e:
            return self._json(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"error": str(e)})


def make_server(root, port):
    handler = type("BoundHandler", (Handler,), {"root": os.path.abspath(root)})
    return ThreadingHTTPServer(("127.0.0.1", port), handler)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=".")
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    if not os.path.exists(os.path.join(a.dir, "novel.yaml")):
        sys.stderr.write("目录里没有 novel.yaml: %s\n" % a.dir)
        sys.exit(1)
    srv = make_server(a.dir, a.port)
    print("http://127.0.0.1:%d" % srv.server_address[1], flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
