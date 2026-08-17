#!/bin/bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "${SCRIPT_DIR}"

PORT=${PORT:-3001}
HOST=${HOST:-0.0.0.0}
OPEN_BROWSER=${OPEN_BROWSER:-1}
SERVER_PID=""
NEXT_BIN="${SCRIPT_DIR}/node_modules/.bin/next"

# 获取本地 IP 地址
get_local_ip() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    local_ip=$(ipconfig getifaddr en0 2>/dev/null) || local_ip=$(ipconfig getifaddr en1 2>/dev/null)
  else
    # Linux
    local_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
  echo "${local_ip:-localhost}"
}

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo "Stopping Next.js dev server..."
    kill "${SERVER_PID}" 2>/dev/null || true

    # 给 Next/Turbopack 一点时间自行退出并释放 .next/dev/lock。
    for _ in {1..20}; do
      if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
        break
      fi
      sleep 0.2
    done

    if kill -0 "${SERVER_PID}" 2>/dev/null; then
      echo "Force stopping Next.js dev server..."
      kill -9 "${SERVER_PID}" 2>/dev/null || true
    fi
  fi
}

trap cleanup EXIT INT TERM

# 启动 Next.js dev server
echo "Starting Next.js dev server..."
if [[ ! -x "${NEXT_BIN}" ]]; then
  echo "Cannot find Next.js binary at ${NEXT_BIN}. Please run pnpm install first."
  exit 1
fi

"${NEXT_BIN}" dev -p "${PORT}" --hostname "${HOST}" &
SERVER_PID=$!

# 等待服务器启动
sleep 3

if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
  echo "Next.js dev server failed to start."
  exit 1
fi

# 打开浏览器
LOCAL_IP=$(get_local_ip)
echo "Opening browser at http://$LOCAL_IP:${PORT}"
if [[ "${OPEN_BROWSER}" != "0" ]] && command -v open >/dev/null 2>&1; then
  open "http://$LOCAL_IP:${PORT}"
fi

# 保持脚本运行
wait "${SERVER_PID}"
