# E-Learning Dosen

[![Verify](https://github.com/syahrullanw/nugaslagi/actions/workflows/verify.yml/badge.svg)](https://github.com/syahrullanw/nugaslagi/actions/workflows/verify.yml)

Aplikasi pembelajaran dosen, admin kampus, dan mahasiswa dengan backend FastAPI, frontend React, dan database PostgreSQL.

Versi aplikasi saat ini dapat dilihat pada file [`VERSION`](./VERSION) atau endpoint `GET /api/version`.

## Dokumentasi utama

- [`CHANGELOG.md`](./CHANGELOG.md) — histori fitur, perbaikan, migration, dan release.
- [`PANDUAN_LMS.md`](./PANDUAN_LMS.md) — alur operasional admin, dosen, mahasiswa, dan akhir semester.
- [`PANDUAN_SINKRONISASI_FEEDER.md`](./PANDUAN_SINKRONISASI_FEEDER.md) — migrasi OLD-SIAKAD, audit tiga arah, persetujuan, dan sinkronisasi aman ke Feeder.
- [`VERSIONING.md`](./VERSIONING.md) — aturan SemVer, metadata deployment, dan rollback.
- [`BACKUP_GITHUB.md`](./BACKUP_GITHUB.md) — prosedur backup, push, tag, dan update server.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — aturan branch, commit, Pull Request, dan release.
- [`backend/POSTGRESQL_MIGRATION.md`](./backend/POSTGRESQL_MIGRATION.md) — migrasi MongoDB ke PostgreSQL.

## Histori GitHub

- [Commit pada branch main](https://github.com/syahrullanw/nugaslagi/commits/main)
- [Pull Request](https://github.com/syahrullanw/nugaslagi/pulls)
- [Tag dan versi](https://github.com/syahrullanw/nugaslagi/tags)
- [GitHub Actions](https://github.com/syahrullanw/nugaslagi/actions)

## Pemeriksaan sebelum backup

```bash
./scripts/github-backup.sh --check
```

Script hanya memeriksa repository. Ia tidak melakukan `git add`, commit, atau push otomatis. Baca [`BACKUP_GITHUB.md`](./BACKUP_GITHUB.md) sebelum mengunggah perubahan.

> Jangan memasukkan `.env`, credential Google, token, private key, backup database, atau data pengguna ke repository.
