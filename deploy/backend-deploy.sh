#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR=${APP_DIR:-/opt/classroom-toolkit}
BRANCH=${BRANCH:-main}
IMAGE_NAMESPACE=${IMAGE_NAMESPACE:-ghcr.io/flicoh/classroomtoolkit}
BACKEND_IMAGE_TAG=${BACKEND_IMAGE_TAG:?BACKEND_IMAGE_TAG is required}
COMPOSE_FILE=deploy/compose.backend.yml
ENV_FILE=deploy/.env.backend
RELEASE_FILE=deploy/.backend-release.env
CANDIDATE_FILE=deploy/.backend-candidate.env
NETWORK_NAME=classroom_internal

log() {
  printf '[backend-deploy] %s\n' "$*"
}

restore_managed_deploy_scripts() {
  local files=(deploy/backend-deploy.sh deploy/frontend-deploy.sh)
  local dirty=()

  for file in "${files[@]}"; do
    if ! git diff --quiet -- "$file"; then
      dirty+=("$file")
    fi
  done

  if (( ${#dirty[@]} > 0 )); then
    log "Restoring local changes in managed deploy scripts: ${dirty[*]}"
    git checkout -- "${dirty[@]}"
  fi
}

if [[ ! -d "$APP_DIR/.git" ]]; then
  log "Repository not found at $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

log "Updating origin/$BRANCH"
git fetch --prune origin "$BRANCH"
git checkout "$BRANCH"
restore_managed_deploy_scripts
git merge --ff-only "origin/$BRANCH"

if [[ ! -f "$ENV_FILE" ]]; then
  log "Missing $APP_DIR/$ENV_FILE"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  log "Docker Engine with the Compose plugin is required"
  exit 1
fi

compose_version=$(docker compose version --short | sed 's/^v//')
if [[ "$(printf '%s\n%s\n' '2.20.0' "$compose_version" | sort -V | head -n 1)" != "2.20.0" ]]; then
  log "Docker Compose 2.20.0 or newer is required; found $compose_version"
  exit 1
fi

docker network inspect "$NETWORK_NAME" >/dev/null 2>&1 || docker network create "$NETWORK_NAME" >/dev/null

umask 077
printf 'IMAGE_NAMESPACE=%s\nBACKEND_IMAGE_TAG=%s\n' "$IMAGE_NAMESPACE" "$BACKEND_IMAGE_TAG" > "$CANDIDATE_FILE"
trap 'rm -f "$CANDIDATE_FILE"' EXIT

compose() {
  docker compose \
    --project-name classroom-backend \
    --env-file "$ENV_FILE" \
    --env-file "$CANDIDATE_FILE" \
    --file "$COMPOSE_FILE" \
    "$@"
}

log "Validating Compose configuration"
compose config --quiet

log "Pulling backend image $BACKEND_IMAGE_TAG"
compose pull backend

log "Starting MySQL"
compose up -d --wait mysql

log "Running database migrations"
compose --profile tools run --rm migrate

log "Starting backend"
compose up -d --wait --remove-orphans --pull=never backend

expected_backend_image="${IMAGE_NAMESPACE}-backend:${BACKEND_IMAGE_TAG}"
backend_container_id=$(compose ps -q backend)
backend_image=$(docker inspect "$backend_container_id" --format '{{.Config.Image}}')

if [[ "$backend_image" != "$expected_backend_image" ]]; then
  log "Backend image mismatch: expected $expected_backend_image, got $backend_image"
  exit 1
fi

mv "$CANDIDATE_FILE" "$RELEASE_FILE"
trap - EXIT
log "Backend deployment complete: $(git rev-parse --short HEAD)"
