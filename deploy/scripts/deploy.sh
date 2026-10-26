#!/usr/bin/env bash

set -euo pipefail

# CodeDeploy hooks (systemd agent) run with a minimal PATH: add /usr/local/bin (aws CLI v2
# installer) and /snap/bin (snap-installed aws CLI), as in the shared nginx_container hooks.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin:${PATH:-}"

APP_DIR="/opt/frontend/cmc-pda-admin"
PROJECT_NAME="cmc-pda-admin"

IMAGE_ENV="${APP_DIR}/image.env"
COMPOSE_FILE="${APP_DIR}/compose.yml"

compose() {
    docker compose --project-name "${PROJECT_NAME}" -f "${COMPOSE_FILE}" \
        --env-file "${IMAGE_ENV}" "$@"
}

echo "[1/4] Check deployment image and network"

IMAGE_URI="$(sed -n 's/^IMAGE_URI=//p' "${IMAGE_ENV}" | head -n 1)"

if [[ -z "${IMAGE_URI}" ]]; then
    echo "ERROR: IMAGE_URI is empty"
    exit 1
fi

ECR_REGISTRY="${IMAGE_URI%%/*}"
IMAGE_REPOSITORY="${IMAGE_URI%:*}"
# <account>.dkr.ecr.<region>.amazonaws.com
REGION="$(printf '%s' "${ECR_REGISTRY}" | cut -d. -f4)"

if ! docker network inspect nginx-proxy-net >/dev/null 2>&1; then
    echo "ERROR: docker network nginx-proxy-net not found (create it with the Nginx host setup)"
    exit 1
fi

echo "Deploy image: ${IMAGE_URI}"

echo "[2/4] Login to ECR and pull the image"

aws ecr get-login-password \
    --region "${REGION}" \
    | docker login \
        --username AWS \
        --password-stdin "${ECR_REGISTRY}"

compose pull web

echo "[3/4] Start the web container"

compose up -d --wait --wait-timeout 120 web

echo "[4/4] Remove old images of ${IMAGE_REPOSITORY}"

# Every build has a unique tag, so old images pile up and fill the disk.
docker image ls "${IMAGE_REPOSITORY}" --format '{{.Repository}}:{{.Tag}}' \
    | grep -vxF "${IMAGE_URI}" \
    | xargs -r docker image rm || true

echo "Deployment completed"
