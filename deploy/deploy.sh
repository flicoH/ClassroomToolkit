#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR=${APP_DIR:-/opt/classroom-toolkit}
BRANCH=${BRANCH:-main}

log() {
  printf '[deploy] %s\n' "$*"
}

wait_for_http() {
  local name=$1
  local url=$2

  for _ in {1..30}; do
    if curl --fail --silent --show-error --output /dev/null "$url"; then
      log "$name is healthy"
      return 0
    fi
    sleep 1
  done

  log "$name health check failed: $url"
  pm2 logs --nostream --lines 50
  return 1
}

if [[ ! -d "$APP_DIR/.git" ]]; then
  log "Repository not found at $APP_DIR. Complete the one-time server setup first."
  exit 1
fi

cd "$APP_DIR"

log "Fetching origin/$BRANCH"
git fetch --prune origin "$BRANCH"
git checkout "$BRANCH"
git merge --ff-only "origin/$BRANCH"

if [[ ! -f apps/backend/.env ]]; then
  log "Missing apps/backend/.env"
  exit 1
fi

if [[ ! -f apps/web/.env.production ]]; then
  log "Missing apps/web/.env.production"
  exit 1
fi

log "Installing locked dependencies"
if ! command -v pnpm >/dev/null 2>&1; then
  log "pnpm is not installed for the deployment user"
  exit 1
fi
pnpm install --frozen-lockfile

log "Building applications"
pnpm --filter ClassRoomToolkitBackend build
pnpm --filter ClassRoomToolkitWeb build
pnpm --filter ClassRoomToolkitAdmin build

log "Running database migrations"
pnpm --filter ClassRoomToolkitBackend migration:run

log "Reloading application processes"
APP_DIR="$APP_DIR" pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save

log "Checking application health"
wait_for_http "Backend" "http://127.0.0.1:3000/"
wait_for_http "Web" "http://127.0.0.1:3001/login"

log "Deployment complete: $(git rev-parse --short HEAD)"
