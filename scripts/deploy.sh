#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Pulling latest code"
git pull origin main

echo "==> Building containers"
docker compose build

echo "==> Starting services"
docker compose up -d

echo "==> Waiting for backend health check..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
        echo "==> Backend is healthy"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "==> ERROR: Backend did not become healthy in 30s"
        docker compose logs backend --tail 50
        exit 1
    fi
    sleep 1
done

echo "==> Pruning old images"
docker image prune -f

echo "==> Deploy complete"
