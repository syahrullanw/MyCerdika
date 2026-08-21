# Pemindahan Data Lokal ke Server

Data MyCerdika tidak disimpan seluruhnya di Git. Database PostgreSQL berisi
data akademik dan pengguna, sedangkan dokumen unggahan berada di
`backend/storage`. Keduanya dipindahkan menggunakan satu **bundle transfer**;
`.env`, password database, token, private key, dan credential Google tidak
pernah dimasukkan ke bundle.

## 1. Membuat bundle di komputer lokal

Pastikan container PostgreSQL lokal berjalan, lalu jalankan dari root proyek:

```bash
bash scripts/backup_db.sh
```

Hasilnya:

- `backups/mycerdika-transfer-v<VERSI>-<WAKTU>.tar.gz` — arsip bertanggal;
- `backups/mycerdika-transfer-latest.tar.gz` — salinan terbaru.

Setiap bundle berisi dump PostgreSQL format custom, seluruh
`backend/storage`, serta manifest ukuran dan checksum SHA-256. Folder
`backups/` diabaikan oleh Git agar data pengguna tidak sengaja masuk ke
repository GitHub.

Jika ada beberapa container PostgreSQL, pilih secara eksplisit:

```bash
bash scripts/backup_db.sh --container backend-postgres-1
```

## 2. Mengirim bundle ke server

Kirim bundle melalui kanal file privat, misalnya `scp`, `rsync`, SFTP, atau
penyimpanan cloud dengan akses terbatas. Contoh:

```bash
scp backups/mycerdika-transfer-latest.tar.gz user@server:/srv/MyCerdika/backups/
```

Untuk server MyCerdika `139.180.140.243` dengan root aplikasi
`/var/www/mycerdika`, gunakan skrip yang sudah dikonfigurasi:

```bash
# Ganti USER_SSH dengan akun SSH server, misalnya root atau deploy
bash scripts/send_backup_to_server.sh --user USER_SSH

# Jika menggunakan private key atau port SSH khusus
bash scripts/send_backup_to_server.sh \
  --user USER_SSH \
  --identity ~/.ssh/id_ed25519 \
  --port 22
```

Skrip tersebut memvalidasi bundle lokal, mengunggah ke file sementara,
mencocokkan checksum SHA-256 lokal dan server, lalu mengganti file tujuan
secara atomik. Setelah upload, skrip hanya menjalankan preflight bundle di
server; database dan storage server tidak diubah dan restore tetap harus
dijalankan secara eksplisit.

Untuk melihat rencana tanpa membuka koneksi SSH:

```bash
bash scripts/send_backup_to_server.sh --user USER_SSH --dry-run
```

Jangan commit atau push bundle ke repository GitHub. Selain dapat melampaui
batas GitHub, bundle memuat data pribadi akademik yang tidak semestinya masuk
ke histori Git permanen.

## 3. Preflight di server

Sebelum restore, pull kode aplikasi terbaru, konfigurasikan `backend/.env`,
pastikan database target sudah dibuat, kemudian lakukan pemeriksaan tanpa
mengubah data:

```bash
bash scripts/restore_db.sh backups/mycerdika-transfer-latest.tar.gz \
  --container backend-postgres-1
```

Preflight memeriksa format bundle, checksum, header dump PostgreSQL, keamanan
path arsip, koneksi database target, dan keberadaan storage. Jika lebih dari
satu container PostgreSQL berjalan, `--container` wajib diisi. Untuk instalasi
PostgreSQL native, gunakan `--database-url` atau isi `DATABASE_URL` di
`backend/.env`.

## 4. Menjalankan restore

Hentikan backend, worker, dan proses lain yang dapat menulis ke database atau
storage. Setelah preflight berhasil:

```bash
bash scripts/restore_db.sh backups/mycerdika-transfer-latest.tar.gz \
  --container backend-postgres-1 \
  --execute
```

Sebelum database diubah, skrip otomatis membuat dump pengaman target di
`backups/pre-restore-*.dump`. Storage lama dipindahkan secara utuh ke
`backups/storage-before-restore-*`, kemudian diganti dengan storage dari
bundle. Restore database menggunakan satu transaksi sehingga kegagalan tidak
meninggalkan restore database setengah jalan.

Setelah restore selesai, jalankan kembali backend. Saat startup, aplikasi
otomatis mengganti referensi path absolut dari komputer lama menjadi lokasi
`backend/storage` pada server baru.

Pilihan tambahan:

```bash
# Database saja
bash scripts/restore_db.sh backups/mycerdika-transfer-latest.tar.gz \
  --container backend-postgres-1 --database-only --execute

# Storage saja; tidak membutuhkan koneksi database
bash scripts/restore_db.sh backups/mycerdika-transfer-latest.tar.gz \
  --storage-only --execute
```

## 5. Pemeriksaan setelah restore

1. Pastikan backend berhasil startup tanpa error.
2. Login memakai akun admin dan satu akun pengguna biasa.
3. Periksa jumlah mahasiswa, dosen, kelas, KRS/KHS, nilai, dan pembayaran.
4. Buka beberapa bukti pembayaran, materi, tugas, dan lampiran lama.
5. Pastikan versi aplikasi pada footer atau `/api/version` sesuai kode server.

Jangan hapus backup pengaman sebelum hasil pemeriksaan dinyatakan benar.
