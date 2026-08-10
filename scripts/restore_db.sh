#!/usr/bin/env bash
# ==============================================================================
# Script Restore Database PostgreSQL SIAKAD (dari file backups/siakad_full_dump.sql.gz)
# Jalankan di server setelah clone repo:  bash scripts/restore_db.sh
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_FILE="${DIR}/backups/siakad_full_dump.sql.gz"

# ── Konfigurasi Database ────────────────────────────────────────────────────
DB_HOST="${POSTGRES_HOST:-127.0.0.1}"
DB_PORT="${POSTGRES_PORT:-5434}"
DB_USER="${POSTGRES_USER:-nugaslagi}"
DB_PASS="${POSTGRES_PASSWORD:-nugaslagi}"
DB_NAME="${POSTGRES_DB:-elearning_dosen}"

echo "======================================================"
echo "  🔄  Restore Database SIAKAD - v1.6.0"
echo "======================================================"
echo "  File  : ${DUMP_FILE}"
echo "  Target: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo ""

# ── Cek file dump tersedia ──────────────────────────────────────────────────
if [ ! -f "${DUMP_FILE}" ]; then
    echo "❌ File dump tidak ditemukan: ${DUMP_FILE}"
    echo "   Jalankan 'bash scripts/backup_db.sh' terlebih dahulu."
    exit 1
fi

SIZE=$(ls -lh "${DUMP_FILE}" | awk '{print $5}')
echo "📦 File dump: ${SIZE}"
echo ""

# ── Deteksi mode restore (Docker atau native pg_restore) ───────────────────
USE_DOCKER=false
CONTAINER_NAME=""

if docker ps --format '{{.Names}}' | grep -q "backend-postgres-1"; then
    USE_DOCKER=true
    CONTAINER_NAME="backend-postgres-1"
elif docker ps --format '{{.Names}}' | grep -q "postgres"; then
    USE_DOCKER=true
    CONTAINER_NAME=$(docker ps --format '{{.Names}}' | grep "postgres" | head -n 1)
fi

if [ "$USE_DOCKER" = true ]; then
    echo "🐳 Mode Docker — container: ${CONTAINER_NAME}"
    echo ""

    # Buat user/database jika belum ada
    echo "🔧 Memastikan user dan database sudah ada..."
    docker exec "${CONTAINER_NAME}" psql -U postgres -tc \
        "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
        docker exec "${CONTAINER_NAME}" psql -U postgres \
        -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"

    docker exec "${CONTAINER_NAME}" psql -U postgres -tc \
        "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
        docker exec "${CONTAINER_NAME}" psql -U postgres \
        -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

    echo "♻️  Menghapus dan membuat ulang database..."
    docker exec "${CONTAINER_NAME}" psql -U postgres \
        -c "DROP DATABASE IF EXISTS ${DB_NAME};" \
        -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

    echo "⬆️  Restore sedang berjalan..."
    gunzip -c "${DUMP_FILE}" | docker exec -i "${CONTAINER_NAME}" \
        psql -U "${DB_USER}" -d "${DB_NAME}"

elif command -v psql &> /dev/null; then
    echo "🖥️  Mode Native psql"
    echo ""

    PSQL_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}"

    echo "🔧 Memastikan user dan database sudah ada..."
    psql "${PSQL_URL}/postgres" -tc \
        "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
        psql "${PSQL_URL}/postgres" \
        -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"

    echo "♻️  Menghapus dan membuat ulang database..."
    psql "${PSQL_URL}/postgres" \
        -c "DROP DATABASE IF EXISTS ${DB_NAME};" \
        -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

    echo "⬆️  Restore sedang berjalan..."
    gunzip -c "${DUMP_FILE}" | psql "${PSQL_URL}/${DB_NAME}"

else
    echo "❌ Error: Docker maupun psql tidak ditemukan di sistem ini."
    echo "   Install PostgreSQL atau pastikan Docker berjalan."
    exit 1
fi

echo ""
echo "======================================================"
echo "  ✅  Restore selesai! Database ${DB_NAME} siap."
echo "======================================================"
echo ""
echo "Langkah selanjutnya:"
echo "  1. Sesuaikan backend/.env dengan konfigurasi server"
echo "  2. Jalankan: cd backend && uvicorn server:app --host 0.0.0.0 --port 8000"
echo "  3. Buka aplikasi di browser"
