#!/bin/bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "${SCRIPT_DIR}"

PORT=${PORT:-3001}
HOST=${HOST:-0.0.0.0}
OPEN_BROWSER=${OPEN_BROWSER:-1}
NEXT_BUNDLER=${NEXT_BUNDLER:-webpack}
SERVER_PID=""
NEXT_BIN="${SCRIPT_DIR}/node_modules/.bin/next"

# 限制 Node 内存占用上限，防止长时间热更新或大规模模块图导致堆内存溢出
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

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

BUNDLER_ARG=""
if [[ "${NEXT_BUNDLER}" == "webpack" ]]; then
  BUNDLER_ARG="--webpack"
elif [[ "${NEXT_BUNDLER}" == "turbopack" ]]; then
  BUNDLER_ARG="--turbopack"
fi

"${NEXT_BIN}" dev -p "${PORT}" --hostname "${HOST}" ${BUNDLER_ARG} &
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
