#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR=${APP_DIR:-/opt/classroom-toolkit}
BRANCH=${BRANCH:-main}
IMAGE_NAMESPACE=${IMAGE_NAMESPACE:-ghcr.io/flicoh/classroomtoolkit}
BACKEND_IMAGE_TAG=${BACKEND_IMAGE_TAG:?BACKEND_IMAGE_TAG is required}
EXPECTED_REVISION=${BACKEND_IMAGE_TAG#sha-}
COMPOSE_FILE=deploy/compose.backend.yml
ENV_FILE=deploy/.env.backend
RELEASE_FILE=deploy/.backend-release.env
CANDIDATE_FILE=deploy/.backend-candidate.env
NETWORK_NAME=classroom_internal

log() {
  printf '[backend-deploy] %s\n' "$*"
}

restore_managed_deploy_files() {
  local files=(
    deploy/backend-deploy.sh
    deploy/frontend-deploy.sh
    deploy/compose.backend.yml
    deploy/mysql/low-memory.cnf
  )
  local dirty=()

  for file in "${files[@]}"; do
    if ! git diff --quiet -- "$file"; then
      dirty+=("$file")
    fi
  done

  if (( ${#dirty[@]} > 0 )); then
    log "Restoring local changes in managed deploy files: ${dirty[*]}"
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
restore_managed_deploy_files
git merge --ff-only "origin/$BRANCH"

# The branch's deployment files and the CI image must describe the same release.
server_revision=$(git rev-parse HEAD)
if [[ -n "${DEPLOY_COMMIT:-}" && ( "$server_revision" != "$DEPLOY_COMMIT" || "$EXPECTED_REVISION" != "$DEPLOY_COMMIT" ) ]]; then
  log "Release mismatch: server checkout=$server_revision, requested backend=$BACKEND_IMAGE_TAG. Run deployment for the current branch commit."
  exit 1
fi

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

deployment_host=$(hostname)
docker_context=$(docker context show)
log "Deployment target: host=$deployment_host docker-context=$docker_context repository=$APP_DIR revision=$EXPECTED_REVISION"

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
# Read the rendered value so env-file and shell overrides select the same path.
PARSER_PROVIDER=$(compose config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["backend"]["environment"].get("SEMESTER_REPORT_PARSER_PROVIDER") or "kimi")')
case "$PARSER_PROVIDER" in kimi|docling) ;; *) log 'Unsupported PDF parser provider'; exit 1 ;; esac

# Include the optional profile when checking definitions, but do not start it.
# Cloud-only Compose files may omit the parser entirely.
COMPOSE_SERVICES=$(compose --profile docling config --services)
DOCLING_SERVICE_DEFINED=false
case $'\n'"$COMPOSE_SERVICES"$'\n' in
  *$'\n'docling-parser$'\n'*) DOCLING_SERVICE_DEFINED=true ;;
esac
if [[ "$PARSER_PROVIDER" == docling && "$DOCLING_SERVICE_DEFINED" != true ]]; then
  log 'Docling provider requires a docling-parser service in the backend Compose file'
  exit 1
fi

pull_with_retry() {
  local target=$1
  local max_attempts=5
  local delay=6
  local attempt=1

  log "Pulling $target image with retry support..."
  until compose pull "$target"; do
    if (( attempt >= max_attempts )); then
      log "Failed to pull $target image after $max_attempts attempts"
      return 1
    fi
    log "Pull failed (attempt $attempt/$max_attempts). Retrying in ${delay}s..."
    sleep "$delay"
    (( attempt++ ))
  done
  log "Successfully pulled $target image"
}

log "Pulling backend image $BACKEND_IMAGE_TAG"
pull_with_retry backend
if [[ "$PARSER_PROVIDER" == docling ]]; then
  log "Pulling Docling parser image $BACKEND_IMAGE_TAG"
  pull_with_retry docling-parser
elif [[ "$DOCLING_SERVICE_DEFINED" == true ]]; then
  # Explicit stop also releases memory from a parser left by the old deployment.
  compose --profile docling stop docling-parser
else
  log 'Cloud parsing selected; Compose has no Docling service to stop'
fi

log "Starting MySQL"
compose up -d --wait mysql

log "Running database migrations"
# Migrations must never consume a deployment script supplied via stdin.
compose --profile tools run -T --rm migrate </dev/null

log "Starting backend with $PARSER_PROVIDER PDF parsing"
if [[ "$PARSER_PROVIDER" == docling ]]; then
  compose --profile docling up -d --wait --force-recreate --remove-orphans --pull=never docling-parser backend
else
  compose up -d --wait --force-recreate --remove-orphans --pull=never backend
fi

expected_backend_image="${IMAGE_NAMESPACE}-backend:${BACKEND_IMAGE_TAG}"
backend_container_id=$(compose ps -q backend)
backend_image=$(docker inspect "$backend_container_id" --format '{{.Config.Image}}')
expected_revision=$EXPECTED_REVISION
# Inspect the running container, not only the local image tag that was pulled.
backend_revision=$(docker inspect "$backend_container_id" \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
backend_running_image_id=$(docker inspect "$backend_container_id" --format '{{.Image}}')
backend_pulled_image_id=$(docker image inspect "$expected_backend_image" --format '{{.Id}}')

if [[ "$backend_image" != "$expected_backend_image" ]]; then
  log "Backend image mismatch: expected $expected_backend_image, got $backend_image"
  exit 1
fi

if [[ "$backend_revision" != "$expected_revision" ]]; then
  log "Backend revision mismatch: expected $expected_revision, got ${backend_revision:-unset}"
  exit 1
fi
if [[ "$backend_running_image_id" != "$backend_pulled_image_id" ]]; then
  log "Backend running image mismatch: expected $backend_pulled_image_id, got $backend_running_image_id"
  exit 1
fi
log "Backend deployed revision: $backend_revision image=$backend_image container=$backend_container_id image-id=$backend_running_image_id"

if [[ "$PARSER_PROVIDER" == docling ]]; then
  parser_image="${IMAGE_NAMESPACE}-docling-parser:${BACKEND_IMAGE_TAG}"
  parser_container_id=$(compose ps -q docling-parser)
  parser_revision=$(docker image inspect "$parser_image" \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
  if [[ -z "$parser_container_id" || "$parser_revision" != "$expected_revision" ]]; then
    log "Docling parser image verification failed"
    exit 1
  fi
fi

log "Checking admin teacher password reset route"
reset_route_status=$(docker exec "$backend_container_id" node -e "
fetch('http://127.0.0.1:3000/admin/teachers/__deploy-smoke__/reset-password', { method: 'POST' })
  .then((response) => { console.log(response.status); })
  .catch(() => { process.exit(1); });
")
if [[ "$reset_route_status" != "403" ]]; then
  log "Admin reset-password route smoke check failed: expected 403, got $reset_route_status"
  exit 1
fi

log "Checking teacher feedback route"
feedback_route_status=$(docker exec "$backend_container_id" node -e "
fetch('http://127.0.0.1:3000/feedback', { method: 'POST' })
  .then((response) => { console.log(response.status); })
  .catch(() => { process.exit(1); });
")
if [[ "$feedback_route_status" != "401" ]]; then
  log "Teacher feedback route smoke check failed: expected 401, got $feedback_route_status"
  exit 1
fi

log "Checking pet settings route"
pet_settings_route_status=$(docker exec "$backend_container_id" node -e "
fetch('http://127.0.0.1:3000/pet-points/settings', { method: 'PATCH' })
  .then((response) => { console.log(response.status); })
  .catch(() => { process.exit(1); });
")
if [[ "$pet_settings_route_status" != "401" ]]; then
  log "Pet settings route smoke check failed: expected 401, got $pet_settings_route_status"
  exit 1
fi

log "Checking admin feedback route"
admin_feedback_route_status=$(docker exec "$backend_container_id" node -e "
fetch('http://127.0.0.1:3000/admin/feedback')
  .then((response) => { console.log(response.status); })
  .catch(() => { process.exit(1); });
")
if [[ "$admin_feedback_route_status" != "401" ]]; then
  log "Admin feedback route smoke check failed: expected 401, got $admin_feedback_route_status"
  exit 1
fi

mv "$CANDIDATE_FILE" "$RELEASE_FILE"
trap - EXIT

log "Pruning dangling images to save disk space"
docker image prune -f || true

log "Backend deployment complete: $backend_revision (server checkout: $server_revision)"
