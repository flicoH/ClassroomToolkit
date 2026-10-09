#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
APP_DIR=${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
cd "$APP_DIR"
ENV_FILE=${ENV_FILE:-deploy/.env.2c2g}
COMPOSE_FILE=deploy/compose.2c2g.yml
RELEASE_FILE=deploy/.2c2g-release.env
PREVIOUS_FILE=deploy/.2c2g-previous.env
PROJECT=classroom-small
COMMAND=${1:-help}
STAGE=prepare
CANDIDATE=''
RENDERED=''
BACKUP_PATH=''
log() { printf '[2c2g] %s\n' "$*"; }
fail() { log "$*" >&2; exit 1; }
cleanup() {
  local code=${1:-$?}
  [[ -z "$CANDIDATE" ]] || rm -f "$CANDIDATE"
  [[ -z "$RENDERED" ]] || rm -f "$RENDERED"
  if (( code != 0 )); then
    log "Stopped at stage: $STAGE. Existing volumes have not been deleted."
    [[ -z "$BACKUP_PATH" ]] || log "Backup: $BACKUP_PATH"
    log "Check logs and schema compatibility before retrying or rolling back."
  fi
}
trap cleanup EXIT

help() {
  cat <<'EOF'
Usage: bash deploy/2c2g-deploy.sh init|check|deploy|status|logs|backup|rollback
init      Generate deploy/.env.2c2g without overwriting an existing file.
check     Validate environment, host resources and container conflicts; no deployment.
deploy    Pull images, stop app traffic, back up, migrate, start and smoke-test.
status    Show service status and current memory usage.
logs      Show the latest 100 lines of service logs.
backup    Pause app services, back up MySQL and PDFs, restart previous app services.
rollback  Restore previous application images; does not revert database migrations.

For first check/deploy, set BACKEND_IMAGE_TAG and FRONTEND_IMAGE_TAG to sha-<commit>.
Set IMAGE_NAMESPACE if using a different registry namespace.
See docs/deployment-2c2g.md for HTTPS, existing-server migration and recovery.
EOF
}
if [[ "$COMMAND" == help ]]; then help; exit 0; fi
command -v python3 >/dev/null || fail 'Python 3 is required.'
if [[ "$COMMAND" == init ]]; then
  [[ ! -e "$ENV_FILE" ]] || fail "Refusing to overwrite $ENV_FILE."
  if [[ -f deploy/.env.backend ]]; then
    fail 'Existing backend environment found. Copy its MySQL credentials and report key into a new .env.2c2g manually; do not generate replacement keys.'
  fi
  python3 deploy/validate-2c2g.py --init "$ENV_FILE" --template deploy/.env.2c2g.example
  exit 0
fi
case "$COMMAND" in check|deploy|status|logs|backup|rollback) ;; *) help; exit 2 ;; esac
[[ -f "$ENV_FILE" ]] || fail "Missing $ENV_FILE; run init or copy the example."
command -v docker >/dev/null || fail 'Docker Engine is required.'
docker compose version >/dev/null || fail 'Docker Compose v2 is required.'
version=$(docker compose version --short)
version=${version#v}
[[ $(printf '%s\n%s\n' 2.20.0 "$version" | sort -V | head -n 1) == 2.20.0 ]] || fail 'Docker Compose 2.20+ is required.'

read_release() { awk -F= -v key="$2" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "$1"; }
SOURCE_RELEASE=$RELEASE_FILE
[[ "$COMMAND" != rollback ]] || SOURCE_RELEASE=$PREVIOUS_FILE
if [[ "$COMMAND" == rollback ]]; then
  [[ -f "$PREVIOUS_FILE" ]] || fail 'No previous application release recorded.'
  IMAGE_NAMESPACE=$(read_release "$SOURCE_RELEASE" IMAGE_NAMESPACE)
  BACKEND_IMAGE_TAG=$(read_release "$SOURCE_RELEASE" BACKEND_IMAGE_TAG)
  FRONTEND_IMAGE_TAG=$(read_release "$SOURCE_RELEASE" FRONTEND_IMAGE_TAG)
fi
if [[ -f "$SOURCE_RELEASE" ]]; then
  IMAGE_NAMESPACE=${IMAGE_NAMESPACE:-$(read_release "$SOURCE_RELEASE" IMAGE_NAMESPACE)}
  BACKEND_IMAGE_TAG=${BACKEND_IMAGE_TAG:-$(read_release "$SOURCE_RELEASE" BACKEND_IMAGE_TAG)}
  FRONTEND_IMAGE_TAG=${FRONTEND_IMAGE_TAG:-$(read_release "$SOURCE_RELEASE" FRONTEND_IMAGE_TAG)}
fi
IMAGE_NAMESPACE=${IMAGE_NAMESPACE:-ghcr.io/flicoh/classroomtoolkit}
[[ ${BACKEND_IMAGE_TAG:-} =~ ^sha-[a-f0-9]{40}$ ]] || fail 'BACKEND_IMAGE_TAG must be sha-<40-character commit>.'
[[ ${FRONTEND_IMAGE_TAG:-} =~ ^sha-[a-f0-9]{40}$ ]] || fail 'FRONTEND_IMAGE_TAG must be sha-<40-character commit>.'
[[ "$IMAGE_NAMESPACE" =~ ^[a-z0-9][a-z0-9./_-]+$ ]] || fail 'Invalid IMAGE_NAMESPACE.'
# Explicit values also prevent ambient shell variables overriding candidate tags.
export IMAGE_NAMESPACE BACKEND_IMAGE_TAG FRONTEND_IMAGE_TAG
CANDIDATE=$(mktemp deploy/.2c2g-candidate.XXXXXX)
printf 'IMAGE_NAMESPACE=%s\nBACKEND_IMAGE_TAG=%s\nFRONTEND_IMAGE_TAG=%s\n' "$IMAGE_NAMESPACE" "$BACKEND_IMAGE_TAG" "$FRONTEND_IMAGE_TAG" > "$CANDIDATE"
ACTIVE_RELEASE_FILE=$CANDIDATE
compose() { docker compose --project-name "$PROJECT" --parallel 1 --env-file "$ENV_FILE" --env-file "$ACTIVE_RELEASE_FILE" -f "$COMPOSE_FILE" "$@"; }
RENDERED=$(mktemp deploy/.2c2g-candidate.XXXXXX)
compose config --format json > "$RENDERED"
python3 deploy/validate-2c2g.py "$RENDERED"

preflight() {
  [[ $(uname -s) == Linux ]] || fail 'Deploy on a Linux host.'
  command -v flock >/dev/null || fail 'flock (util-linux) is required.'
  docker info >/dev/null
  local architecture memory cpus free_mb docker_root
  architecture=$(docker info --format '{{.Architecture}}')
  [[ "$architecture" == x86_64 || "$architecture" == amd64 ]] || fail 'Published images require an amd64 host; build matching ARM images separately.'
  memory=$(docker info --format '{{.MemTotal}}')
  cpus=$(docker info --format '{{.NCPU}}')
  (( memory >= 1800 * 1024 * 1024 && cpus >= 2 )) || fail 'At least 1800MiB RAM and 2 CPU cores are required.'
  free_mb=$(df -Pm "$APP_DIR" | awk 'NR==2 {print $4}')
  (( free_mb >= 10240 )) || fail 'At least 10GiB free disk space is required in the checkout filesystem.'
  docker_root=$(docker info --format '{{.DockerRootDir}}')
  free_mb=$(df -Pm "$docker_root" | awk 'NR==2 {print $4}')
  (( free_mb >= 10240 )) || fail 'At least 10GiB free disk space is required in the Docker storage filesystem.'
  local swap_mb
  swap_mb=$(awk '/SwapTotal/ {printf "%d", $2 / 1024}' /proc/meminfo)
  (( swap_mb >= 1024 )) || fail 'Configure at least 1GiB swap (2GiB recommended) before deployment.'
  for volume in classroom_mysql_data classroom_reports_data; do
    local owner
    while IFS= read -r owner; do
      [[ -z "$owner" || "$owner" == "$PROJECT" ]] || fail "Volume $volume is in use by $owner. Stop the old deployment first; never run two MySQL containers on the same volume."
    done < <(docker ps --filter "volume=$volume" --format '{{.Label "com.docker.compose.project"}}')
    # Also reject manually started containers without a Compose project label.
    local count labelled
    count=$(docker ps -q --filter "volume=$volume" | awk 'NF {n++} END {print n+0}')
    labelled=$(docker ps --filter "volume=$volume" --format '{{.Label "com.docker.compose.project"}}' | awk 'NF {n++} END {print n+0}')
    (( count == labelled )) || fail "Volume $volume is in use by an unmanaged container."
  done
  local service published owner
  for service in backend web admin; do
    published=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["services"][sys.argv[2]]["ports"][0]["published"])' "$RENDERED" "$service")
    while IFS= read -r owner; do
      [[ "$owner" == "$PROJECT" ]] || fail "Host port $published for $service is used by another container. Stop the old deployment first."
    done < <(docker ps --filter "publish=$published" --format '{{.Label "com.docker.compose.project"}}')
  done
  log 'Host checks passed; CPU/memory limits are configured. No Docling model will run on this host.'
}

pull_images() {
  for service in mysql backend web admin; do
    local attempt
    for attempt in 1 2 3; do
      if compose pull "$service"; then break; fi
      (( attempt < 3 )) || fail "Unable to pull $service. Running services have not been stopped."
      sleep 5
    done
  done
  for service in backend web admin; do
    local tag image revision
    tag=$FRONTEND_IMAGE_TAG
    [[ "$service" != backend ]] || tag=$BACKEND_IMAGE_TAG
    image="${IMAGE_NAMESPACE}-${service}:${tag}"
    revision=$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
    [[ "$revision" == "${tag#sha-}" ]] || fail "Image revision mismatch for $service."
  done
}

backup_data() {
  BACKUP_PATH="${BACKUP_DIR:-$APP_DIR/deploy/backups}/$(date -u +%Y%m%dT%H%M%SZ)-$$"
  mkdir -p "$BACKUP_PATH"
  BACKUP_PATH=$(cd "$BACKUP_PATH" && pwd)
  chmod 700 "$BACKUP_PATH"
  log "Backing up database and course PDFs to $BACKUP_PATH"
  compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --events --triggers --no-tablespaces --set-gtid-purged=OFF classroom_toolkit' | gzip > "$BACKUP_PATH/mysql.sql.gz"
  gzip -t "$BACKUP_PATH/mysql.sql.gz"
  docker run --rm --network none --memory 64m --cpus 0.25 --user 0:0 \
    --mount type=volume,src=classroom_reports_data,dst=/reports,readonly \
    --mount "type=bind,src=$BACKUP_PATH,dst=/backup" \
    --entrypoint tar "${IMAGE_NAMESPACE}-backend:${BACKEND_IMAGE_TAG}" -czf /backup/reports.tar.gz -C /reports .
  [[ -s "$BACKUP_PATH/reports.tar.gz" ]] || fail 'PDF volume backup is missing.'
  if [[ -f "$RELEASE_FILE" ]]; then cp "$RELEASE_FILE" "$BACKUP_PATH/release.env"; fi
  log 'Backup complete. Back up the report encryption key separately.'
}

smoke() {
  compose exec -T backend node -e '
(async()=>{
 const r=await fetch("http://127.0.0.1:3000/semester-reports/reports");
 if(r.status!==401)throw Error("report route failed");
 console.log("Backend report route passed");
})().catch(()=>{console.error("Backend smoke failed; check service logs");process.exit(1)})'
  compose exec -T web node -e '
(async()=>{
 const r=await fetch("http://127.0.0.1:3001/api/semester-reports/reports",{headers:{cookie:"auth_token=invalid-deploy-probe"},signal:AbortSignal.timeout(10000)});
 if(r.status!==401)throw Error("report proxy failed");
 const p=await fetch("http://127.0.0.1:3001/api/public-reports/"+"x".repeat(43),{redirect:"manual",signal:AbortSignal.timeout(10000)});
 if(p.status!==404)throw Error("anonymous report route failed");
 console.log("Teacher report proxy and anonymous parent route passed");
})().catch(()=>{console.error("Web report smoke failed");process.exit(1)})'
  compose exec -T admin wget --quiet --tries=1 --spider http://127.0.0.1/
}

case "$COMMAND" in
  status)
    compose ps
    ids=$(compose ps -q)
    if [[ -n "$ids" ]]; then
      read -r -a containers <<< "$(printf '%s' "$ids" | tr '\n' ' ')"
      docker stats --no-stream "${containers[@]}"
    fi
    exit 0 ;;
  logs) compose logs --tail 100; exit 0 ;;
esac
if [[ "$COMMAND" == check ]]; then
  preflight
  log 'Ready to deploy (images and remote reachability are checked during deployment).'
  exit 0
fi
command -v flock >/dev/null || fail 'flock (util-linux) is required.'
exec 9>deploy/.2c2g-deploy.lock
flock -n 9 || fail 'Another 2c2g operation is running.'
preflight
if [[ "$COMMAND" == backup ]]; then
  STAGE=backup
  running=$(compose ps --status running --services | awk '/^(backend|web|admin)$/')
  read -r -a running_services <<< "$(printf '%s' "$running" | tr '\n' ' ')"
  compose stop web admin backend
  resume() { if [[ -n "$running" ]]; then compose start "${running_services[@]}" >/dev/null || log 'App restart failed; inspect service logs.'; fi; }
  trap 'code=$?; resume; cleanup "$code"' EXIT
  backup_data
  resume
  running=''
  log 'Backup complete; previously running app containers have restarted.'
  exit 0
fi
if [[ "$COMMAND" == rollback ]]; then
  [[ -f "$PREVIOUS_FILE" ]] || fail 'No previous application release recorded.'
  log 'Rolling back application images only. The database schema will not be reverted.'
fi
STAGE=pull
pull_images
STAGE=parser-check
# Probe credentials and runtime tools before stopping traffic. No paid OCR call.
compose run --rm --no-deps backend node -e '
(async()=>{
 if((process.env.SEMESTER_REPORT_PARSER_PROVIDER||"kimi")==="docling"){
  // Legacy images predate pdf-parser.js; retain Docling rollback compatibility.
  const health=new URL(process.env.SEMESTER_REPORT_PARSER_URL);health.pathname="/health";
  const r=await fetch(health,{redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!r.ok || (await r.json()).parser!=="docling")throw Error("Docling health failed");
 }else{await require("./dist/semester-reports/pdf-parser").checkPdfParser()}
 console.log("PDF parser configuration passed");
})().catch(()=>{console.error("PDF parser check failed; check provider, Kimi key and cloud file API connectivity");process.exit(1)})'
STAGE=maintenance
compose stop web admin backend
STAGE=mysql
compose up -d --wait --wait-timeout 240 mysql
STAGE=storage
compose --profile tools run --rm --no-deps init-storage
STAGE=backup
backup_data
if [[ "$COMMAND" == deploy ]]; then
  STAGE=migrations
  compose --profile tools run --rm migrate
fi
STAGE=backend
compose up -d --wait --wait-timeout 180 --pull never backend
STAGE=frontend
compose up -d --wait --wait-timeout 180 --pull never web admin
STAGE=smoke
smoke
if [[ -f "$RELEASE_FILE" ]]; then cp "$RELEASE_FILE" "$PREVIOUS_FILE"; fi
mv "$CANDIDATE" "$RELEASE_FILE"
ACTIVE_RELEASE_FILE=$RELEASE_FILE
CANDIDATE=''
STAGE=complete
log 'Deployment complete. Verify the HTTPS website, upload a course PDF, review and publish a test report.'
compose ps
