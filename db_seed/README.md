# db_seed

Folder ini berisi database dump PostgreSQL untuk keperluan deployment ke server baru.

## File
- `siakad_full_dump.sql.gz` — dump PostgreSQL terkompresi dari database produksi lokal (~9.6 MB, 175 MB setelah diekstrak)

## Cara Restore di Server

### Menggunakan skrip otomatis:
```bash
bash scripts/restore_db.sh
```

### Menggunakan Docker manual:
```bash
gunzip -c db_seed/siakad_full_dump.sql.gz | docker exec -i <nama_container_postgres> psql -U nugaslagi -d elearning_dosen
```

### Menggunakan psql langsung (tanpa Docker):
```bash
# Buat database terlebih dahulu
psql -U postgres -c "CREATE USER nugaslagi WITH PASSWORD 'nugaslagi';"
psql -U postgres -c "CREATE DATABASE elearning_dosen OWNER nugaslagi;"

# Restore dari dump
gunzip -c db_seed/siakad_full_dump.sql.gz | psql -U nugaslagi -d elearning_dosen
```

> **Catatan**: Setelah restore, sesuaikan `DATABASE_URL` di `backend/.env` dengan konfigurasi server Anda.
