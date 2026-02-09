#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="./backups"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/gideon_tasks_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "==> Backing up database to ${BACKUP_FILE}"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-gideon}" "${POSTGRES_DB:-gideon_tasks}" \
    | gzip > "${BACKUP_FILE}"

echo "==> Backup size: $(du -h "${BACKUP_FILE}" | cut -f1)"

echo "==> Removing backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -name "gideon_tasks_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "==> Backup complete"
