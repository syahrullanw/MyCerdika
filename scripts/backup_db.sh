#!/usr/bin/env bash
# ==============================================================================
# Script Backup Database PostgreSQL SIAKAD & PMB (Compressed SQL.GZ)
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${DIR}/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/siakad_dump_${TIMESTAMP}.sql.gz"
LATEST_FILE="${BACKUP_DIR}/siakad_full_dump.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "📦 Memulai backup database PostgreSQL..."

# Cek apakah container docker postgres berjalan
if docker ps --format '{{.Names}}' | grep -q "backend-postgres-1"; then
    echo "🐳 Menggunakan Docker container: backend-postgres-1"
    docker exec backend-postgres-1 pg_dump -U nugaslagi -d elearning_dosen | gzip > "${BACKUP_FILE}"
elif docker ps --format '{{.Names}}' | grep -q "postgres"; then
    CONTAINER_NAME=$(docker ps --format '{{.Names}}' | grep "postgres" | head -n 1)
    echo "🐳 Menggunakan Docker container: ${CONTAINER_NAME}"
    docker exec "${CONTAINER_NAME}" pg_dump -U nugaslagi -d elearning_dosen | gzip > "${BACKUP_FILE}"
elif command -v pg_dump &> /dev/null; then
    echo "🖥️  Menggunakan pg_dump sistem lokal"
    DB_URL="${DATABASE_URL:-postgresql://nugaslagi:nugaslagi@127.0.0.1:5434/elearning_dosen}"
    pg_dump "${DB_URL}" | gzip > "${BACKUP_FILE}"
else
    echo "❌ Error: Docker container postgres maupun pg_dump tidak ditemukan."
    exit 1
fi

cp "${BACKUP_FILE}" "${LATEST_FILE}"

SIZE=$(ls -lh "${LATEST_FILE}" | awk '{print $5}')
echo "✅ Backup berhasil disimpan ke:"
echo "   -> ${LATEST_FILE} (${SIZE})"
echo "   -> ${BACKUP_FILE} (${SIZE})"
