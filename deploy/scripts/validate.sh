#!/usr/bin/env bash

set -euo pipefail

# Same PATH as deploy.sh: CodeDeploy hooks run with a minimal PATH.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin:${PATH:-}"

PROJECT_NAME="cmc-pda-admin"
# One of the server_name values in the shared Nginx pda-admin.conf.
ADMIN_DOMAIN="${PDA_ADMIN_DOMAIN:-admin.ped-pda.com}"

# Succeeds only when the given command does; retried for up to ~90s.
check() {
    local name="$1"
    shift

    for i in $(seq 1 30); do
        if "$@"; then
            echo "${name} is healthy"
            return 0
        fi

        echo "Waiting for ${name}... (${i}/30)"
        sleep 3
    done

    echo "${name} health check failed"
    return 1
}

web_healthy() {
    local container status
    container="$(docker ps --quiet \
        --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
        --filter "label=com.docker.compose.service=web" \
        | head -n 1)"

    if [[ -z "${container}" ]]; then
        echo "  web container is not running"
        return 1
    fi

    status="$(docker inspect --format '{{.State.Health.Status}}' "${container}")"

    if [[ "${status}" != "healthy" ]]; then
        echo "  web health status: ${status}"
        return 1
    fi
}

# End to end through the shared Nginx container on host port 80: Nginx -> pda-admin:3000
# -> index.html. Only HTTP 200 counts.
INDEX_URL="http://127.0.0.1/"

nginx_route() {
    local status
    status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 \
        --header "Host: ${ADMIN_DOMAIN}" "${INDEX_URL}" || true)"

    if [[ "${status}" != "200" ]]; then
        echo "  ${INDEX_URL} (Host: ${ADMIN_DOMAIN}) returned HTTP ${status}"
        return 1
    fi
}

echo "Validating CMC PDA admin frontend..."

echo "[1/2] Web container -> /healthz"
check "Web" web_healthy

echo "[2/2] Nginx route: ${ADMIN_DOMAIN} -> pda-admin:3000"
check "Nginx route" nginx_route

echo "All health checks passed"
