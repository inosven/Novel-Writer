#!/usr/bin/env bash
# 用法：reader.sh start [端口] | stop | status
# 在小说目录里运行。后台启动/停止阅读界面服务（plugin/reader/reader.py），pid 和日志放 .novel/。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
READER="$HERE/../reader/reader.py"
PIDF=".novel/reader.pid"
LOGF=".novel/reader.log"
CMD="${1:-status}"

alive() { # pid
  kill -0 "$1" 2>/dev/null
}
current_port() {
  [ -f "$PIDF" ] || return 1
  sed -n '2p' "$PIDF"
}
running() {
  [ -f "$PIDF" ] || return 1
  local pid; pid="$(sed -n '1p' "$PIDF")"
  [ -n "$pid" ] && alive "$pid"
}

case "$CMD" in
  start)
    PORT="${2:-8765}"
    case "$PORT" in ''|*[!0-9]*) echo "端口必须是数字: ${PORT}" >&2; exit 1;; esac
    [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || { echo "端口超出范围: ${PORT}" >&2; exit 1; }
    command -v python3 >/dev/null 2>&1 || { echo "需要 python3" >&2; exit 1; }
    [ -f novel.yaml ] || { echo "当前目录没有 novel.yaml" >&2; exit 1; }
    if running; then echo "http://127.0.0.1:$(current_port)"; exit 0; fi
    mkdir -p .novel
    nohup python3 "$READER" --dir "$(pwd)" --port "$PORT" > "$LOGF" 2>&1 &
    pid=$!
    printf '%s\n%s\n' "$pid" "$PORT" > "$PIDF"
    i=0
    while [ "$i" -lt 30 ]; do
      if curl -s -o /dev/null "http://127.0.0.1:${PORT}/api/project"; then echo "http://127.0.0.1:${PORT}"; exit 0; fi
      if ! alive "$pid"; then break; fi
      sleep 0.1; i=$((i+1))
    done
    echo "服务启动失败，日志：${LOGF}" >&2; tail -5 "$LOGF" >&2
    rm -f "$PIDF"; exit 1 ;;
  stop)
    if running; then kill "$(sed -n '1p' "$PIDF")" 2>/dev/null; fi
    rm -f "$PIDF"; echo "stopped" ;;
  status)
    if running; then echo "running http://127.0.0.1:$(current_port)"; else rm -f "$PIDF"; echo "stopped"; fi ;;
  *) echo "用法: reader.sh start [端口] | stop | status" >&2; exit 1 ;;
esac
