#!/usr/bin/env bash
# Upload bundle backup MyCerdika ke server melalui SSH/SCP tanpa menjalankan restore.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_HOST="139.180.140.243"
DEFAULT_REMOTE_ROOT="/var/www/mycerdika"
DEFAULT_BUNDLE="${PROJECT_ROOT}/backups/mycerdika-transfer-latest.tar.gz"

SSH_HOST="${MYCERDIKA_SSH_HOST:-${DEFAULT_HOST}}"
SSH_USER="${MYCERDIKA_SSH_USER:-}"
SSH_PORT="${MYCERDIKA_SSH_PORT:-22}"
SSH_IDENTITY="${MYCERDIKA_SSH_KEY:-}"
REMOTE_ROOT="${MYCERDIKA_REMOTE_ROOT:-${DEFAULT_REMOTE_ROOT}}"
BUNDLE_PATH="${MYCERDIKA_BACKUP_FILE:-${DEFAULT_BUNDLE}}"
DRY_RUN=false
SKIP_REMOTE_PREFLIGHT=false

usage() {
    cat <<'EOF'
Kirim bundle backup MyCerdika ke server secara aman.

Penggunaan:
  bash scripts/send_backup_to_server.sh --user USER [opsi]

Opsi:
  --user USER            Username SSH server (atau MYCERDIKA_SSH_USER)
  --host HOST            Host/IP server (default: 139.180.140.243)
  --port PORT            Port SSH (default: 22)
  --identity FILE        Private key SSH, misalnya ~/.ssh/id_ed25519
  --remote-root PATH     Root aplikasi server (default: /var/www/mycerdika)
  --bundle FILE          Bundle yang dikirim (default: backup latest)
  --skip-remote-preflight
                         Jangan jalankan pemeriksaan bundle di server
  --dry-run              Validasi dan tampilkan rencana tanpa koneksi/upload
  -h, --help             Tampilkan bantuan

Contoh:
  bash scripts/send_backup_to_server.sh --user root
  bash scripts/send_backup_to_server.sh --user deploy --identity ~/.ssh/id_ed25519
EOF
}

fail() {
    printf 'ERROR: %s\n' "$*" >&2
    exit 1
}

while (($#)); do
    case "$1" in
        --user)
            (($# >= 2)) || fail "--user membutuhkan nilai"
            SSH_USER="$2"
            shift 2
            ;;
        --host)
            (($# >= 2)) || fail "--host membutuhkan nilai"
            SSH_HOST="$2"
            shift 2
            ;;
        --port)
            (($# >= 2)) || fail "--port membutuhkan nilai"
            SSH_PORT="$2"
            shift 2
            ;;
        --identity)
            (($# >= 2)) || fail "--identity membutuhkan nilai"
            SSH_IDENTITY="$2"
            shift 2
            ;;
        --remote-root)
            (($# >= 2)) || fail "--remote-root membutuhkan nilai"
            REMOTE_ROOT="$2"
            shift 2
            ;;
        --bundle)
            (($# >= 2)) || fail "--bundle membutuhkan nilai"
            BUNDLE_PATH="$2"
            shift 2
            ;;
        --skip-remote-preflight)
            SKIP_REMOTE_PREFLIGHT=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            fail "Opsi tidak dikenal: $1"
            ;;
    esac
done

if [[ -z "${SSH_USER}" && -t 0 ]]; then
    read -r -p "Username SSH untuk ${SSH_HOST}: " SSH_USER
fi

[[ -n "${SSH_USER}" ]] || fail "Username SSH wajib diisi dengan --user atau MYCERDIKA_SSH_USER"
[[ "${SSH_USER}" =~ ^[A-Za-z_][A-Za-z0-9._-]*$ ]] || fail "Format username SSH tidak valid"
[[ "${SSH_HOST}" =~ ^[A-Za-z0-9.-]+$ ]] || fail "Format host/IP tidak valid"
[[ "${SSH_PORT}" =~ ^[0-9]+$ ]] || fail "Port SSH harus berupa angka"
((SSH_PORT >= 1 && SSH_PORT <= 65535)) || fail "Port SSH harus antara 1 dan 65535"
[[ "${REMOTE_ROOT}" == /* ]] || fail "Remote root harus berupa path absolut"
[[ "${REMOTE_ROOT}" =~ ^/[A-Za-z0-9._/-]+$ ]] || fail "Remote root mengandung karakter yang tidak didukung"

command -v ssh >/dev/null 2>&1 || fail "Perintah ssh tidak ditemukan"
command -v scp >/dev/null 2>&1 || fail "Perintah scp tidak ditemukan"
command -v python3 >/dev/null 2>&1 || fail "Python 3 tidak ditemukan"

if [[ "${BUNDLE_PATH}" != /* ]]; then
    BUNDLE_PATH="${PROJECT_ROOT}/${BUNDLE_PATH#./}"
fi
[[ -f "${BUNDLE_PATH}" ]] || fail "Bundle backup tidak ditemukan: ${BUNDLE_PATH}"
BUNDLE_DIR="$(cd "$(dirname "${BUNDLE_PATH}")" && pwd)"
BUNDLE_PATH="${BUNDLE_DIR}/$(basename "${BUNDLE_PATH}")"
BUNDLE_NAME="$(basename "${BUNDLE_PATH}")"
[[ "${BUNDLE_NAME}" =~ ^[A-Za-z0-9._-]+\.tar\.gz$ ]] || fail "Nama bundle tidak aman: ${BUNDLE_NAME}"

if [[ -n "${SSH_IDENTITY}" ]]; then
    [[ -f "${SSH_IDENTITY}" ]] || fail "Private key SSH tidak ditemukan: ${SSH_IDENTITY}"
    IDENTITY_DIR="$(cd "$(dirname "${SSH_IDENTITY}")" && pwd)"
    SSH_IDENTITY="${IDENTITY_DIR}/$(basename "${SSH_IDENTITY}")"
fi

printf 'Memvalidasi bundle lokal...\n'
python3 "${PROJECT_ROOT}/scripts/transfer_bundle.py" restore "${BUNDLE_PATH}" --storage-only >/dev/null

LOCAL_SHA256="$(python3 -c 'import hashlib, sys; p=sys.argv[1]; h=hashlib.sha256(); f=open(p,"rb"); [h.update(c) for c in iter(lambda:f.read(1024*1024), b"")]; f.close(); print(h.hexdigest())' "${BUNDLE_PATH}")"
BUNDLE_SIZE="$(wc -c < "${BUNDLE_PATH}" | tr -d ' ')"
REMOTE_BACKUP_DIR="${REMOTE_ROOT%/}/backups"
REMOTE_FINAL="${REMOTE_BACKUP_DIR}/${BUNDLE_NAME}"
REMOTE_TEMP="${REMOTE_FINAL}.part-$(date +%Y%m%d%H%M%S)-$$"
SSH_TARGET="${SSH_USER}@${SSH_HOST}"

SSH_OPTIONS=(-p "${SSH_PORT}" -o ConnectTimeout=15)
SCP_OPTIONS=(-P "${SSH_PORT}" -o ConnectTimeout=15)
if [[ -n "${SSH_IDENTITY}" ]]; then
    SSH_OPTIONS+=(-i "${SSH_IDENTITY}")
    SCP_OPTIONS+=(-i "${SSH_IDENTITY}")
fi

printf '\nRencana pengiriman:\n'
printf '  Sumber    : %s\n' "${BUNDLE_PATH}"
printf '  Ukuran    : %s byte\n' "${BUNDLE_SIZE}"
printf '  SHA-256   : %s\n' "${LOCAL_SHA256}"
printf '  Server    : %s:%s\n' "${SSH_TARGET}" "${SSH_PORT}"
printf '  Tujuan    : %s\n' "${REMOTE_FINAL}"

if [[ "${DRY_RUN}" == true ]]; then
    printf '\nDry-run selesai. Tidak ada koneksi atau file yang dikirim.\n'
    exit 0
fi

REMOTE_PARTIAL_PRESENT=false
cleanup_partial_upload() {
    if [[ "${REMOTE_PARTIAL_PRESENT}" == true ]]; then
        ssh "${SSH_OPTIONS[@]}" "${SSH_TARGET}" bash -s -- "${REMOTE_TEMP}" >/dev/null 2>&1 <<'REMOTE_CLEANUP' || true
set -euo pipefail
partial_file="$1"
rm -f -- "${partial_file}"
REMOTE_CLEANUP
    fi
}
trap cleanup_partial_upload EXIT INT TERM

printf '\nMenyiapkan direktori backup di server...\n'
ssh "${SSH_OPTIONS[@]}" "${SSH_TARGET}" bash -s -- "${REMOTE_BACKUP_DIR}" <<'REMOTE_PREPARE'
set -euo pipefail
backup_dir="$1"
mkdir -p -- "${backup_dir}"
chmod 750 -- "${backup_dir}" 2>/dev/null || true
REMOTE_PREPARE

printf 'Mengunggah bundle ke file sementara...\n'
REMOTE_PARTIAL_PRESENT=true
scp "${SCP_OPTIONS[@]}" "${BUNDLE_PATH}" "${SSH_TARGET}:${REMOTE_TEMP}"

printf 'Memeriksa checksum di server...\n'
REMOTE_SHA256="$(ssh "${SSH_OPTIONS[@]}" "${SSH_TARGET}" bash -s -- "${REMOTE_TEMP}" <<'REMOTE_CHECKSUM'
set -euo pipefail
uploaded_file="$1"
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${uploaded_file}" | awk '{print $1}'
elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${uploaded_file}" | awk '{print $1}'
elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import hashlib, sys; p=sys.argv[1]; h=hashlib.sha256(); f=open(p,"rb"); [h.update(c) for c in iter(lambda:f.read(1024*1024), b"")]; f.close(); print(h.hexdigest())' "${uploaded_file}"
else
    echo "Server tidak memiliki sha256sum, shasum, atau python3" >&2
    exit 1
fi
REMOTE_CHECKSUM
)"

[[ "${REMOTE_SHA256}" == "${LOCAL_SHA256}" ]] || fail "Checksum server tidak cocok; upload dibatalkan"

printf 'Checksum cocok. Mengaktifkan file backup secara atomik...\n'
ssh "${SSH_OPTIONS[@]}" "${SSH_TARGET}" bash -s -- "${REMOTE_TEMP}" "${REMOTE_FINAL}" "${REMOTE_BACKUP_DIR}" "${BUNDLE_NAME}" <<'REMOTE_FINALIZE'
set -euo pipefail
temporary_file="$1"
final_file="$2"
backup_dir="$3"
bundle_name="$4"
mv -f -- "${temporary_file}" "${final_file}"
if [[ "${bundle_name}" != "mycerdika-transfer-latest.tar.gz" ]]; then
    ln -sfn -- "${bundle_name}" "${backup_dir}/mycerdika-transfer-latest.tar.gz"
fi
REMOTE_FINALIZE
REMOTE_PARTIAL_PRESENT=false

if [[ "${SKIP_REMOTE_PREFLIGHT}" == false ]]; then
    printf 'Menjalankan preflight bundle di server...\n'
    ssh "${SSH_OPTIONS[@]}" "${SSH_TARGET}" bash -s -- "${REMOTE_ROOT%/}" "${REMOTE_FINAL}" <<'REMOTE_PREFLIGHT'
set -euo pipefail
application_root="$1"
bundle_file="$2"
if [[ -f "${application_root}/scripts/restore_db.sh" ]]; then
    cd "${application_root}"
    bash scripts/restore_db.sh "${bundle_file}" --storage-only
else
    echo "PERINGATAN: scripts/restore_db.sh belum ada; upgrade kode aplikasi sebelum restore." >&2
fi
REMOTE_PREFLIGHT
fi

trap - EXIT INT TERM
printf '\nUpload backup berhasil.\n'
printf 'File server: %s\n' "${REMOTE_FINAL}"
printf '\nRestore tidak dijalankan otomatis. Setelah backend/worker dihentikan, jalankan di server:\n'
printf '  cd %s\n' "${REMOTE_ROOT%/}"
printf '  bash scripts/restore_db.sh %s --container backend-postgres-1\n' "${REMOTE_FINAL}"
printf '  bash scripts/restore_db.sh %s --container backend-postgres-1 --execute\n' "${REMOTE_FINAL}"
