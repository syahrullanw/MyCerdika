Berdasarkan analisis feeder-nya (modul daftar_*, SOAP live2.php, dan modul validasi), ini yang harus disiapkan di sisi SIAKAD:

1. Data master yang lengkap & sesuai standar PDDIKTI

Modul feeder SIAKAD akan membaca tabel-tabel ini, jadi pastikan terisi benar:

- mahasiswa (daftar_mahasiswa) — NIM unik, identitas lengkap (nama, TTL, jk, agama, alamat, kewarganegaraan), status, angkatan, program studi
- dosen (daftar_dosen + penugasan_dosen) — NIDN/NIDK valid, homebase prodi, pangkat/golongan
- kurikulum + matakuliah (kurikulum_sp) — kode MK, SKS, semester, kelompok mata kuliah
- bobot nilai (bobotnilai) — skala nilai harus terisi & sesuai
- daya tampung (dayatampung) per prodi per jalur masuk
- kelas kuliah (kelaskuliah) — mata kuliah per kelas, dosen pengajar
- KRS (aktivitas_perkuliahan_mahasiswa / krs_mahasiswa) — per semester berjalan
- nilai (nilai/nilaiaktmhs) — nilai per MK per mahasiswa
- mahasiswa lulus/DO (mahasiswa_lulus_do)

2. Mapping kode referensi (paling sering jadi error "fatal")

SIAKAD harus punya mapping ke kode referensi PDDIKTI, bukan kode internal sendiri:

- kode program studi harus sama dengan kode prodi di PDDIKTI (via /ws/referensi)
- agama, jenis kelamin, jenjang, jalur masuk, status mahasiswa, jenis pembayaran, negara, dll
- periode/semester format PDDIKTI:
  - 20251 (Ganjil 2025/2026)
  - 20252 (Genap)
  - 20253 (Pendek)
  Mapping tahun akademik SIAKAD → periode PDDIKTI.

3. Modul feeder di SIAKAD (dari vendor SIAKAD)

Biasanya sudah ada karena dulu dipakai untuk Feeder 4.x. Cukup:

- Ganti alamat webservice ke Neo Feeder:
  http://<IP-feeder>:8100/ws/live2.php
- Isi username & password akun PDDIKTI (role PDDIKTI/prodi, sama dengan yang dipakai login UI feeder) untuk GetToken
- Aktifkan penjadwalan otomatis (cron/event) push data per periode, jangan andalkan manual tiap data berubah

4. Kesiapan jaringan & akun

- Server SIAKAD bisa mengakses server feeder (buka port 3003/8100 ke IP SIAKAD saja, jangan ke publik)
- Satu feeder dipakai satu PT (berbasis kode registrasi dari prefill .prf) — pastikan prefill yang dipasang sesuai kode registrasi kampus
- Data mutakhir: KRS & nilai semester berjalan sudah lengkap di SIAKAD sebelum sinkronisasi

5. Koordinasi operator & verifikasi

- Operator PDDIKTI login UI feeder (port 8100), jalankan Sinkronisasi ke pusat
- Cek menu validasi (validasi_feeder): status baru/belum/klaim/fatal/final — status **fatal** harus diperbaiki dulu di SIAKAD sebelum sinkron ulang
- Rekomendasi: uji dulu lewat `/ws/sandbox2.php` sebelum live

Intinya:

data master beres + mapping kode benar + modul feeder tersambung ke `live2.php` + jadwal otomatis = sinkronisasi mulus.

Error yang paling sering berasal dari mapping kode prodi/semester/referensi yang tidak sesuai PDDIKTI.