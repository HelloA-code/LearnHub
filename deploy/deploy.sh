#!/usr/bin/env bash
# Deploy a LearnHub image on this server, with a health check and automatic rollback.
#
# Usage:  bash deploy.sh <image:tag>
#   e.g.  bash deploy.sh akhilhegde0118/online-education-platform:42
#
# Jenkins copies this file to the EC2 instance and runs it over SSH. You can also
# run it by hand to deploy or roll back to any tag that exists on Docker Hub.
set -euo pipefail

IMAGE="${1:?usage: deploy.sh <image:tag>}"
NAME="${LEARNHUB_CONTAINER:-learnhub}"
PORT="${LEARNHUB_PORT:-80}"
ENV_FILE="${LEARNHUB_ENV_FILE:-/etc/learnhub/learnhub.env}"
VOLUME="${LEARNHUB_VOLUME:-learnhub-data}"
HEALTH_URL="http://localhost:${PORT}/health"
HEALTH_TRIES="${LEARNHUB_HEALTH_TRIES:-20}"
HEALTH_WAIT="${LEARNHUB_HEALTH_WAIT:-2}"

log() { echo "[deploy] $*"; }

start() {
  local image="$1"
  local args=(-d --name "$NAME" --restart unless-stopped
              -p "${PORT}:5000"
              -e DATABASE_PATH=/data/learnhub.db
              -v "${VOLUME}:/data")
  if [ -r "$ENV_FILE" ]; then
    args+=(--env-file "$ENV_FILE")
  else
    log "WARNING: $ENV_FILE not found; the app will use its development SECRET_KEY."
  fi
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run "${args[@]}" "$image" >/dev/null
}

healthy() {
  local i
  for ((i = 1; i <= HEALTH_TRIES; i++)); do
    if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$HEALTH_WAIT"
  done
  return 1
}

log "Pulling $IMAGE"
docker pull "$IMAGE"

PREVIOUS="$(docker inspect --format '{{.Config.Image}}' "$NAME" 2>/dev/null || true)"
if [ -n "$PREVIOUS" ]; then
  log "Currently running: $PREVIOUS"
fi

log "Starting $IMAGE on port $PORT"
start "$IMAGE"

if healthy; then
  log "Health check passed: $HEALTH_URL"
  # Keep the new and previous images for rollback; remove older tags of this repository.
  REPO="${IMAGE%:*}"
  docker images "$REPO" --format '{{.Repository}}:{{.Tag}}' \
    | grep -v -x -F -e "$IMAGE" -e "${PREVIOUS:-none}" -e "${REPO}:latest" \
    | xargs -r docker rmi >/dev/null 2>&1 || true
  docker image prune -f >/dev/null 2>&1 || true
  log "Deployed $IMAGE"
  exit 0
fi

log "Health check FAILED for $IMAGE. Last log lines:"
docker logs --tail 40 "$NAME" 2>&1 || true

if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$IMAGE" ]; then
  log "Rolling back to $PREVIOUS"
  start "$PREVIOUS"
  if healthy; then
    log "Rollback succeeded; $PREVIOUS is serving traffic."
  else
    log "Rollback also failed health check."
  fi
fi
exit 1
