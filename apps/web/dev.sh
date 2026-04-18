#!/bin/bash
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

# 启动 Next.js dev server
echo "Starting Next.js dev server..."
next dev -p 3001 --hostname 0.0.0.0 &

# 等待服务器启动
sleep 3

# 打开浏览器
LOCAL_IP=$(get_local_ip)
echo "Opening browser at http://$LOCAL_IP:3001"
open "http://$LOCAL_IP:3001"

# 保持脚本运行
wait
