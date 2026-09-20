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

restore_managed_deploy_files() {
  local files=(
    deploy/backend-deploy.sh
    deploy/frontend-deploy.sh
    deploy/compose.frontend.yml
    deploy/docker/admin.nginx.conf
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
compose up -d --wait --force-recreate --remove-orphans --pull=never web admin

expected_web_image="${IMAGE_NAMESPACE}-web:${FRONTEND_IMAGE_TAG}"
expected_admin_image="${IMAGE_NAMESPACE}-admin:${FRONTEND_IMAGE_TAG}"
web_container_id=$(compose ps -q web)
admin_container_id=$(compose ps -q admin)
web_image=$(docker inspect "$web_container_id" --format '{{.Config.Image}}')
admin_image=$(docker inspect "$admin_container_id" --format '{{.Config.Image}}')
expected_backend_url=http://classroom-backend-backend-1:3000
actual_backend_url=$(docker inspect "$web_container_id" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | sed -n 's/^BACKEND_URL=//p')

if [[ "$web_image" != "$expected_web_image" ]]; then
  log "Web image mismatch: expected $expected_web_image, got $web_image"
  exit 1
fi

if [[ "$admin_image" != "$expected_admin_image" ]]; then
  log "Admin image mismatch: expected $expected_admin_image, got $admin_image"
  exit 1
fi

if [[ "$actual_backend_url" != "$expected_backend_url" ]]; then
  log "Web backend URL mismatch: expected $expected_backend_url, got ${actual_backend_url:-unset}"
  exit 1
fi

log "Checking Web-to-Backend network route"
backend_feedback_status=''
for _ in {1..6}; do
  backend_feedback_status=$(docker exec "$web_container_id" node -e "
fetch(process.env.BACKEND_URL + '/feedback', {
  method: 'POST',
  headers: {
    authorization: 'Bearer invalid-deploy-route-probe',
    'content-type': 'application/json',
  },
  body: JSON.stringify({ content: 'deploy-route-probe' }),
})
  .then((response) => { console.log(response.status); })
  .catch((error) => { console.error(error); process.exit(1); });
" || true)
  [[ "$backend_feedback_status" == "401" ]] && break
  sleep 5
done
if [[ "$backend_feedback_status" != "401" ]]; then
  backend_feedback_details=$(docker exec "$web_container_id" node -e "
const url = new URL(process.env.BACKEND_URL + '/feedback');
const dns = require('node:dns').promises;
Promise.all([
  dns.lookup(url.hostname, { all: true }),
  fetch(url, {
    method: 'POST',
    headers: {
      authorization: 'Bearer invalid-deploy-route-probe',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ content: 'deploy-route-probe' }),
  }).then(async (response) => ({ status: response.status, body: await response.text() })),
])
  .then(([addresses, response]) => { console.log(JSON.stringify({ url: url.href, addresses, response })); })
  .catch((error) => { console.log(JSON.stringify({ url: url.href, error: error.message })); });
" || true)
  log "Backend feedback diagnostics: $backend_feedback_details"
  log "Backend feedback route check failed: expected 401, got ${backend_feedback_status:-connection error}"
  exit 1
fi

log "Checking Web feedback proxy route"
feedback_proxy_status=$(docker exec "$web_container_id" node -e "
fetch('http://127.0.0.1:3001/api/feedback', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    cookie: 'auth_token=invalid-deploy-route-probe',
  },
  body: JSON.stringify({ content: 'deploy-route-probe' }),
})
  .then(async (response) => {
    console.log(response.status);
    if (response.status !== 401) console.error(await response.text());
  })
  .catch((error) => { console.error(error); process.exit(1); });
")
if [[ "$feedback_proxy_status" != "401" ]]; then
  log "Web feedback proxy route check failed: expected 401, got $feedback_proxy_status"
  exit 1
fi

log "Checking Web pet settings proxy route"
pet_settings_proxy_status=$(docker exec "$web_container_id" node -e "
fetch('http://127.0.0.1:3001/api/pet-points/settings', {
  method: 'PATCH',
  headers: {
    'content-type': 'application/json',
    cookie: 'auth_token=invalid-deploy-route-probe',
  },
  body: JSON.stringify({ maxLevel: 10, finalEnergy: 200 }),
})
  .then(async (response) => {
    console.log(response.status);
    if (response.status !== 401) console.error(await response.text());
  })
  .catch((error) => { console.error(error); process.exit(1); });
")
if [[ "$pet_settings_proxy_status" != "401" ]]; then
  log "Web pet settings proxy route check failed: expected 401, got $pet_settings_proxy_status"
  exit 1
fi

mv "$CANDIDATE_FILE" "$RELEASE_FILE"
trap - EXIT
log "Frontend deployment complete: $(git rev-parse --short HEAD)"
