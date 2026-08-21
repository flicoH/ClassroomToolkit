#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR=${APP_DIR:-/opt/classroom-toolkit}
BRANCH=${BRANCH:-main}
IMAGE_NAMESPACE=${IMAGE_NAMESPACE:-ghcr.io/flicoh/classroomtoolkit}
FRONTEND_IMAGE_TAG=${FRONTEND_IMAGE_TAG:?FRONTEND_IMAGE_TAG is required}
COMPOSE_FILE=deploy/compose.frontend.yml
ENV_FILE=deploy/.env.frontend
RELEASE_FILE=deploy/.frontend-release.env
CANDIDATE_FILE=deploy/.frontend-candidate.env
NETWORK_NAME=classroom_internal

log() {
  printf '[frontend-deploy] %s\n' "$*"
}

if [[ ! -d "$APP_DIR/.git" ]]; then
  log "Repository not found at $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

log "Updating origin/$BRANCH"
git fetch --prune origin "$BRANCH"
git checkout "$BRANCH"
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
printf 'IMAGE_NAMESPACE=%s\nFRONTEND_IMAGE_TAG=%s\n' "$IMAGE_NAMESPACE" "$FRONTEND_IMAGE_TAG" > "$CANDIDATE_FILE"
trap 'rm -f "$CANDIDATE_FILE"' EXIT

compose() {
  docker compose \
    --project-name classroom-frontend \
    --env-file "$ENV_FILE" \
    --env-file "$CANDIDATE_FILE" \
    --file "$COMPOSE_FILE" \
    "$@"
}

log "Validating Compose configuration"
compose config --quiet

log "Pulling frontend image $FRONTEND_IMAGE_TAG"
compose pull web admin

log "Starting frontend services"
compose up -d --wait --remove-orphans web admin

mv "$CANDIDATE_FILE" "$RELEASE_FILE"
trap - EXIT
log "Frontend deployment complete: $(git rev-parse --short HEAD)"
