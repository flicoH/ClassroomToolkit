#!/usr/bin/env bash
set -uo pipefail

failures=0

pass() { printf '[PASS] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*"; }
fail() {
  printf '[FAIL] %s\n' "$*"
  failures=$((failures + 1))
}

version_at_least() {
  local actual=${1#v}
  local required=$2
  [[ "$(printf '%s\n%s\n' "$required" "$actual" | sort -V | head -n 1)" == "$required" ]]
}

printf 'CentOS 7.8 compatibility preflight\n'
printf 'CentOS Linux 7 is EOL. Passing this check does not make the host supported or secure.\n\n'

if [[ -r /etc/centos-release ]]; then
  warn "Detected: $(cat /etc/centos-release)"
else
  warn "Cannot confirm CentOS release from /etc/centos-release"
fi
warn "Kernel: $(uname -r)"

if ! command -v docker >/dev/null 2>&1; then
  fail "Docker Engine is not installed"
else
  engine_version=$(docker version --format '{{.Server.Version}}' 2>/dev/null || true)
  if [[ -z "$engine_version" ]]; then
    fail "Docker daemon is unavailable"
  elif version_at_least "$engine_version" "20.10.0"; then
    pass "Docker Engine $engine_version"
  else
    fail "Docker Engine $engine_version is older than 20.10.0"
  fi
fi

if ! docker compose version >/dev/null 2>&1; then
  fail "Docker Compose v2 plugin is unavailable"
else
  compose_version=$(docker compose version --short 2>/dev/null || true)
  if version_at_least "$compose_version" "2.20.0"; then
    pass "Docker Compose $compose_version"
  else
    fail "Docker Compose $compose_version is older than 2.20.0"
  fi
fi

memory_mb=$(awk '/MemTotal/ { printf "%d", $2 / 1024 }' /proc/meminfo)
swap_mb=$(awk '/SwapTotal/ { printf "%d", $2 / 1024 }' /proc/meminfo)
disk_mb=$(df -Pm /var/lib/docker 2>/dev/null | awk 'NR == 2 { print $4 }')

((memory_mb >= 1800)) && pass "Memory ${memory_mb}MB" || fail "Memory is only ${memory_mb}MB"
((swap_mb >= 1024)) && pass "Swap ${swap_mb}MB" || fail "At least 1GB Swap is required"

if [[ -n "$disk_mb" ]] && ((disk_mb >= 10240)); then
  pass "Docker disk free ${disk_mb}MB"
else
  fail "At least 10GB free space is required under /var/lib/docker"
fi

if ((failures == 0)); then
  printf '\nTesting required container images on the current kernel...\n'
  docker run --rm --memory=512m --cpus=0.5 node:22-bookworm-slim node --version >/dev/null 2>&1 \
    && pass "Node 22 container starts" \
    || fail "Node 22 container cannot start"
  docker run --rm --memory=640m --cpus=0.5 --entrypoint mysqld mysql:8.4 --version >/dev/null 2>&1 \
    && pass "MySQL 8.4 container starts" \
    || fail "MySQL 8.4 container cannot start"
  docker run --rm --memory=64m --cpus=0.1 --entrypoint nginx nginx:1.29-alpine -v >/dev/null 2>&1 \
    && pass "Nginx container starts" \
    || fail "Nginx container cannot start"
fi

printf '\n'
if ((failures > 0)); then
  printf 'Preflight failed with %d issue(s). Do not deploy on this host.\n' "$failures"
  exit 1
fi

printf 'Compatibility checks passed, but CentOS 7 remains unsupported and should be migrated.\n'
