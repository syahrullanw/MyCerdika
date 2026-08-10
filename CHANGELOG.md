# Changelog

Semua perubahan penting pada aplikasi ini dicatat di sini. Versi rilis utama disimpan di file [`VERSION`](./VERSION), sedangkan versi skema database yang sudah diterapkan dicatat oleh tabel `app_schema_migrations` di PostgreSQL.

## [1.6.1] — 2026-08-10

### Optimasi performa untuk server kecil

- Mengurangi beban awal setelah login dengan pemuatan data dashboard dan modul secara lebih terarah.
- Menambahkan cache singkat untuk sesi autentikasi dan cakupan kelas dosen agar permintaan paralel tidak mengulang query PostgreSQL yang sama.
- Memindahkan pencatatan aktivitas pengguna ke proses latar belakang sehingga tidak menambah waktu respons API utama.
- Menyesuaikan default koneksi database agar lebih hemat memori dan sesuai untuk server dengan RAM 1 GB.

### Kebijakan akun dan halaman login

- Menghapus akses pendaftaran akun mandiri dari halaman login.
- Akun pengguna kini dibuat oleh admin atau melalui formulir PMB.

### Sinkronisasi identitas kampus pada landing page PMB

- Menambahkan endpoint publik terkurasi untuk identitas dan kontak dari **Pengaturan Kampus** tanpa membuka konfigurasi internal aplikasi.
- Landing page PMB di SIAKAD dan portal PMB mandiri kini mengambil nama kampus, logo, alamat, telepon/WhatsApp, email, motto, dan copyright dari Pengaturan Kampus.
- Floating WhatsApp PMB menggunakan nomor WhatsApp kampus dari Pengaturan Kampus, dengan fallback aman bila kolom belum diisi.
- Memastikan portal PMB mandiri berjalan pada port `3001` dan dapat memuat konfigurasi PMB serta data kampus.

### Validasi rilis

- Backend berhasil melewati pemeriksaan sintaks Python.
- Frontend utama dan frontend PMB mandiri berhasil melalui production build.
- Smoke test `GET /api/version`, `GET /api/settings/public`, dan `GET /api/v1/pmb/public/config` berhasil.
- Tidak ada migration SQL baru; versi skema tetap `002_domain_tables`.

## [1.6.0] — 2026-08-10

### Pengiriman Salinan Pendaftaran & Backup Akses Login (Email & WhatsApp)

- **Notifikasi Email Otomatis (`send_pmb_registration_email`)**:
  - Begitu pendaftar menyelesaikan pengisian formulir, backend otomatis menyusun dan mengirimkan bukti pendaftaran resmi HTML responsif ke email calon mahasiswa.
  - Memuat ucapan selamat, rincian program studi pilihan, jenis kelas & mode kuliah, asal sekolah, biaya formulir, serta **Kotak Kredensial Login Utama**: **Nomor Registrasi (ID Login)**, **Email**, **No. WhatsApp**, **Password Akun PMB**, dan **URL Akses Portal PMB (`http://localhost:3001`) & SIAKAD (`http://localhost:3000`)**.
- **Generasi Salinan Struk WhatsApp (`build_pmb_whatsapp_receipt`)**:
  - Backend otomatis memformat teks struk WhatsApp berstandar resmi dan menghasilkan tautan langsung `https://wa.me/{nomor}?text=...` untuk mengirim atau mem-backup struk pendaftaran ke WhatsApp pribadi calon mahasiswa dengan 1 klik.
- **Layar Struk Pendaftaran Interaktif (`PmbDirectRegisterModal.jsx`)**:
  - Setelah pendaftaran sukses, modal bertransisi menampilkan **Layar Bukti Pendaftaran Resmi (Receipt Screen)**:
    - Indikator centang hijau status pengiriman email dan kesiapan WhatsApp.
    - Kartu akses login gelap elegan dengan fitur *Lihat/Sembunyikan Password*, *Salin Per-Item*, dan tombol *"Salin Semua Info Login"*.
    - Tombol aksi utama **"📲 Kirim & Simpan Salinan ke WhatsApp Saya"** dan tombol navigasi **"🚀 Lanjut ke Portal PMB"**.

### Widget WhatsApp Floating & Logo Resmi Wikipedia / Wikimedia

- **Floating WhatsApp Widget (`PmbWhatsAppFloatingWidget.jsx`)**:
  - Widget chat bantuan mengambang di pojok kanan bawah landing page PMB dengan nomor tujuan yang dinamis dari Pengaturan PMB (`landing_contact_whatsapp` / `landing_contact_phone`).
  - Dilengkapi 4 *Quick Question Chips* interaktif (Syarat Pendaftaran, Biaya & Cicilan, Info Beasiswa, Bantuan Formulir), form pesan kustom, dan indikator status *Online • Balas Cepat*.
- **Integrasi Logo Resmi Vektor WhatsApp (Wikimedia Commons)**:
  - Mengunduh dan mengintegrasikan logo vektor resmi WhatsApp dari [Berkas:WhatsApp logo-color-vertical.svg](https://id.wikipedia.org/wiki/Berkas:WhatsApp_logo-color-vertical.svg) berdimensi asli `293.5x293.5` dengan warna brand `#25D366` pada `frontend-pmb/public/whatsapp-logo.svg` dan `frontend/public/whatsapp-logo.svg`.
  - Dibuat komponen in-line SVG `WhatsAppOfficialIcon` yang tajam dan presisi di layar resolusi tinggi (Retina / 4K).

### Penataan Layout Kartu Program Studi 1 Baris Sejajar (Single Row Grid)

- **Grid 4 Kolom Horizontal (`lg:grid-cols-4`)**:
  - Menata seluruh kartu Program Studi Unggulan menjadi 1 baris rapi dan simetris di layar desktop dalam kontainer lebar `max-w-7xl`.
  - Menyelaraskan tinggi judul (`min-h-[2.6rem]`), deskripsi (`min-h-[2rem]`), kotak prospek karir (`min-h-[2.4rem]`), serta posisi akreditasi dan tombol *"Daftar Prodi Ini"*.

### Pemisahan Frontend PMB Mandiri (Port 3001) & Sinkronisasi Ekspor Utils

- **Aplikasi Frontend PMB Mandiri (`frontend-pmb/`)**: Memisahkan antarmuka publik PMB menjadi aplikasi terpisah yang berjalan mandiri pada port `3001` (`http://localhost:3001`), sementara aplikasi SIAKAD utama tetap berjalan di port `3000`.
- **Isolasi Trafik & Performa**: Calon mahasiswa baru dapat mengakses Landing Page promosi, form pendaftaran mandiri, dan Portal Camaba tanpa memuat bundle besar modul internal SIAKAD (KRS, KHS, Dosen, Keuangan).
- **Integrasi Dua Arah**: Tab PMB di portal utama SIAKAD dilengkapi tautan navigasi langsung *"Buka Portal PMB Resmi (Port 3001) ↗"*, dan calon mahasiswa yang lulus di Alur 10 dapat berpindah langsung ke Portal Mahasiswa SIAKAD.
- **Helper Script & Symlink Node Modules**: Menambahkan script `npm run start:pmb` pada `frontend/package.json` dan konfigurasi environment terpadu (`PORT=3001`, `REACT_APP_BACKEND_URL`, `REACT_APP_SIAKAD_URL`).
- **Perbaikan Ekspor `BACKEND_URL`**: Memperbaiki ekspor variabel `BACKEND_URL` pada `frontend/src/lib/utils.js` sehingga modul PMB di portal utama SIAKAD (Port 3000) dan portal PMB (Port 3001) terkompilasi bersih tanpa error.

### Pengaturan Fleksibel PMB & Alur Seleksi 10 Langkah Berurutan (Strict Sequential Flow)

- **Switch On/Off Metode Pembayaran PMB**: Admin PMB dapat mengaktifkan atau menonaktifkan masing-masing metode pembayaran secara mandiri (QRIS Instan, Transfer Bank Manual, Virtual Account Mandiri, dan Virtual Account BCA). Pilihan metode pembayaran di Alur 3 dan Alur 8 portal camaba otomatis difilter sesuai pengaturan aktif.
- **Switch Jalur Ujian Online CBT (Default: Nonaktif / Off)**: Jalur ujian online CBT secara default berstatus nonaktif (`False`) dan mengarahkan peserta ke Ujian Offline di Kampus. Admin PMB dapat mengaktifkannya sewaktu-waktu melalui switch pengaturan. Backend memvalidasi endpoint `/choose-test-type` dan `/cbt/start` untuk menolak akses jika dinonaktifkan.
- **10 Alur Seleksi Calon Mahasiswa Berurutan Ketat**:
  - Calon mahasiswa **tidak dapat melompat ke depan** sebelum menyelesaikan tahapan yang sedang berjalan (`isLocked`).
  - Calon mahasiswa **tidak dapat kembali ke belakang** setelah tahapan sebelumnya selesai dikonfirmasi (`isPassed`).
  - Alur 1 (Data Diri & Asal Sekolah) dan Alur 2 (Pilihan Prodi & Kelas) dipisahkan menjadi dua tahapan tersendiri dengan tombol konfirmasi masing-masing (`POST /step/confirm-1` dan `POST /step/confirm-2`).
  - Stepper horizontal interaktif dilengkapi indikator status (*Selesai ✓*, *Sedang Berjalan*, *Terkunci 🔒*) serta notifikasi toast informatif.

### Sistem PMB Terpadu: Modularisasi Frontend, CMS Landing Page, & 18 Field Formulir Resmi

- **Modularisasi Komprehensif Frontend PMB**: Memecah arsitektur monolitik PMB menjadi sub-modul terfokus di `frontend/src/components/pmb/` (`PmbLandingPage.jsx`, `PmbLandingCustomizerTab.jsx`, `PmbDirectRegisterModal.jsx`, `ReferralComponents.jsx`, `CamabaPortal.jsx`, `AdminPmbHub.jsx`, `PmbAnalyticsTab.jsx`, `PmbReferralsTab.jsx`, `PmbExecutiveReportTab.jsx`, dan `index.js`).
- **Standarisasi 18 Isian Formulir Resmi PMB**: Mengintegrasikan 18 field resmi calon mahasiswa baru ke backend schema `applicant_doc`, modal pendaftaran utama, portal seleksi camaba, dan pop-up detail admin:
  1. Nama Lengkap
  2. Tempat Tanggal Lahir (Tempat & Tanggal Lahir)
  3. No HP / WhatsApp
  4. Alamat Lengkap
  5. NIK (16 digit)
  6. NISN (10 digit)
  7. Nama Ibu Kandung
  8. Email Aktif
  9. Nama Asal Sekolah
  10. NPSN Sekolah (8 digit)
  11. Alamat Sekolah
  12. Jurusan Saat Sekolah
  13. Tahun Lulus
  14. Tinggi Badan (cm)
  15. Berat Badan (kg)
  16. Program Studi Pilihan 1 (terintegrasi langsung master prodi aktif)
  17. Program Studi Pilihan 2
  18. Sumber Informasi Politeknik SCI
- **Kustomisasi Visual Halaman Informasi PMB (CMS)**: Tim PMB dapat mengatur banner hero, pengumuman bar, highlight prestasi, kartu keunggulan (*Why Us*), daftar beasiswa, FAQ, kontak resmi, dan toggle visibilitas section secara visual tanpa koding.
- **Pusat Manajemen PMB Hub (`AdminPmbHub.jsx`)**: Mengintegrasikan 10 sub-tab administrasi, tombol *Detail* dengan modal popup 18 field pendaftar, modal input nilai ujian offline di kampus, tabel rekap ukuran baju almamater, dan tombol aktivasi massal SIAKAD (auto penerbitan NIM).
- **Analisis Lanjutan & Segmentasi Pendaftar (`PmbAnalyticsTab.jsx`)**: Pengelompokan klaster nilai CBT (Grade A/B/C), klaster finansial, pemetaan 10 kota asal pendaftar, top feeder schools, dan analisis bottleneck conversion funnel.
- **Sistem Referal PMB (`PmbReferralsTab.jsx` & `ReferralComponents.jsx`)**: Pendaftaran agen/promotor referal, generator tautan unik pendaftaran `/?ref=KODE`, penghitungan komisi pendaftaran & daftar ulang, dan modal pencairan fee (*payout*).
- **Laporan Akhir Eksekutif PMB (`PmbExecutiveReportTab.jsx`)**: Dokumen laporan PMB berkop resmi institusi siap cetak (*Print PDF*) untuk pimpinan dan rektorat.
- **Bug Fixes & Otorisasi**:
  - Memperbaiki operator array JavaScript dari `in [...]` menjadi `[...].includes(...)`.
  - Memperluas fungsi `require_admin` di backend untuk mendukung seluruh level role administrator dan panitia akademik (`admin`, `superadmin`, `pmb`, `staff`, `academic`, `lecturer`, `dosen`, `fakultas`, `prodi`).
  - Menambahkan fallback otomatis token auth dari `propToken` ke `localStorage.getItem("token")`.
  - Menyelaraskan seluruh 37 router PMB di `backend/routers/pmb.py` dan mendaftarkannya di `backend/server.py`.

### Sistem Ujian CBT Online Mandiri (Alur 7)

- **Sesi ujian CBT**: CRUD sesi oleh admin (judul, deskripsi, jadwal, durasi, passing grade, kode unik), token ujian utama + token ujian ulang (retake) yang otomatis dibuat per sesi, tombol regenerasi token, dan status otomatis `not_started`/`open`/`expired`.
- **Bank soal CBT**: dukungan soal pilihan ganda (PG) dan isian singkat, impor soal dari berkas Excel `.xlsx`, serta CRUD penuh di panel admin (dengan modal picker tipe soal).
- **Alur ujian peserta**: ruang ujian layar penuh, timer hitung mundur, navigasi soal, deteksi `visibilitychange`/`blur`/`fullscreenchange`, hitung mundur toleransi pelanggaran (grace), auto-submit & flagging mencurigakan, serta skenario ujian ulang (retake) lewat token khusus bila ter-flag.
- **Monitoring & manajemen hasil**: panel live monitoring peserta per sesi (disedapkankan per peserta, badge `RET`/`2x ujian`), statistik total peserta vs total ujian, serta tombol **Reset Ujian** per peserta yang menghapus attempt dan mengembalikan status pendaftar.
- **Penilaian & status otomatis**: perubahan status pendaftar `passed`/`test_failed`, pencarian soal otomatis, dan unlock Alur 8 (daftar ulang) bila lulus.

### Pembayaran PMB: Rekening, Kode Unik 3 Digit, & Bukti Transfer

- **Konfigurasi rekening**: admin mengatur nama bank/E-Wallet, nomor rekening, atas nama, dan URL gambar QRIS di *Pengaturan Global PMB*; nilai ini ditampilkan di Alur 3 dan 8.1 camaba.
- **Kode unik pembayaran**: nominal tagihan dibuat unik dengan mengganti 3 digit terakhir (kode unik deterministik per pendaftar & item), memudahkan deteksi bukti bayar — berlaku untuk biaya pendaftaran, pembayaran uang pra-studi lunas, dan tiap termin cicilan.
- **Pilihan skema pra-studi**: camaba memilih **Bayar Lunas (Full)** atau **Cicil 3x**; tiap opsi menampilkan kode unik, nominal yang harus dibayar, serta rekening tujuan dan QRIS (jika tersedia).
- **Upload bukti transfer**: form unggah bukti bayar (PNG/JPG/PDF, maks 5 MB) yang disimpan aman dan dapat ditampilkan/preview, serta endpoint `GET /pmb/proof/{id}` untuk verifikasi oleh panitia.

### SK Mengajar: penomoran manual dan gelar dosen terpisah

- Memisahkan isian gelar dosen menjadi **Gelar Depan** dan **Gelar Belakang** pada form dosen (Data Master), dengan gelar gabungan dihitung otomatis untuk kebutuhan penulisan nama pada surat.
- Menghapus auto-numbering SK; operator kini mengisi **nomor SK** dan **tanggal SK** secara manual pada panel penomoran di detail SK.
- Menambahkan endpoint `PUT /sk_mengajar/{sk_id}` untuk menyimpan nomor/tanggal pada status draft.
- Finalisasi SK wajib memiliki nomor dan tanggal (HTTP 400 bila kosong), dan cetak SK ditolak selama SK belum bernomor.
- Menampilkan status "belum bernomor" pada rekap dan detail SK.

### Modul baru: SK Jabatan Akademik Dosen

- Menambahkan router backend `routers/sk_jabatan.py` yang terdaftar di `server.py`: rekap dosen + jabatan saat ini + SK terakhir, generate SK (dengan opsi memperbarui jabatan fungsional, pangkat/golongan, dan TMT), daftar SK dengan filter tahun dan pencarian, detail, update penomoran manual, finalisasi (wajib nomor + tanggal), hapus, cetak dengan tanda tangan digital dua pejabat, dan validasi publik via token.
- Menambahkan halaman frontend **SK Jabatan Akademik Dosen** (`SkJabatanComponents.jsx`) dengan tab *Generate* (form jabatan/pangkat/golongan/TMT + rekap dosen) dan tab *Daftar SK* (filter tahun, cari, cetak/final/detail/hapus) serta modal finalisasi dan detail.
- Menampilkan menu SK Jabatan Akademik pada sidebar Struktur Akademik khusus akun Admin Kampus dan Kaprodi.
- SK Jabatan menggunakan kop resmi, blok pertimbangan (Menimbang/Mengingat/MEMUTUSKAN), dan tanda tangan digital QR validasi yang sama dengan SK Mengajar.

### Perbaikan kop surat dan logo kampus

- Memperbaiki gambar logo kampus yang gagal dimuat (HTTP 401) dengan memasukkan `branding_logo` ke daftar `is_public` pada `stored_file_context`; upload logo baru kini menyimpan `record_type: "campus_logo"`.
- Memperbaiki gambar KOP header/footer/logo yang rusak saat pengembangan di port 3000: semua `img` branding dan jendela cetak dokumen kini meresolusi base URL backend (`API_BASE`/`resolveMediaUrl`) sehingga tidak lagi menerima `index.html` dari dev server.

### Perbaikan bug pemuatan awal SK Mengajar

- Memperbaiki bug data "semua tahun" yang muncul saat pertama kali membuka halaman SK Mengajar: master data dimuat penuh sebelum filter TA aktif diterapkan (`masterReady`), dan respons lama tidak lagi menimpa data baru (`reqSeq` guard).

### Halaman presensi mahasiswa baru

- Merombak halaman Presensi akun mahasiswa menjadi tampilan ringkas yang terpisah dari tampilan dosen (`StudentAttendanceComponents.jsx`).
- **Daftar kelas**: kartu ringkas berisi nama mata kuliah, prodi/rombongan, badge **BUKA** yang berkedip saat sesi presensi aktif, progress bar % kehadiran, rincian Hadir/Izin/Sakit/Alpa, dan indikator syarat ujian (≥75%); data seluruh kelas dimuat paralel.
- **Detail kelas**: kartu sesi terbuka dengan hitung mundur kedaluwarsa, klaim PIN 4 digit atau scan QR (kamera `html5-qrcode` dengan fallback ketik kode), umpan balik "Anda sudah terverifikasi hadir", rekap pribadi 5 kartu (Hadir/Izin/Sakit/Alpa/% + syarat ujian), grid riwayat 16 pertemuan berkode warna + legenda, dan tombol muat ulang.
- Menghapus dari sisi mahasiswa: roster seluruh mahasiswa, kontrol sesi dosen (generate PIN/QR, kunci), dan tabel rekap seluruh kelas; tampilan dosen tidak berubah.
- Tidak ada migration SQL baru; versi skema tetap `002_domain_tables`.

## [1.5.0] — 2026-08-10

### Gating RPS dan kelengkapan perencanaan pembelajaran

- Mengunci materi, tugas, dan penilaian sampai RPS kelas dinyatakan lengkap (`is_complete`/`missing_fields`) sehingga dosen menyelesaikan perencanaan pembelajaran sebelum sesi dimulai.
- Menghubungkan materi ke nomor pertemuan RPS (`rps_meeting_number`) dan menyertakan status `rps_complete` pada daftar kelas (`GET /api/classes`).
- Menambahkan export RPS ke format `.xlsx`, `.docx`, dan `.pdf`.

### Presensi dengan QR Code dan durasi berlaku yang dapat diatur

- Menambahkan opsi presensi ketiga: dosen men-generate QR (token `QRATT:{kelas}:{pertemuan}:{secret}`) dan mahasiswa memindainya lewat kamera atau mengetik kode secara manual sebagai fallback.
- Durasi berlaku PIN maupun QR dapat diatur dosen (1–1440 menit, default 15 menit) dan tidak lagi kaku 15 menit; kedaluwarsa diverifikasi di server pada saat submit.
- Halaman presensi dosen menampilkan gambar QR, kode cadangan, tombol salin kode, dan hitung mundur kedaluwarsa real-time.
- Mahasiswa mendapat tab **Scan QR** yang memakai kamera perangkat (`html5-qrcode`) dengan validasi kelas, secret, dan kedaluwarsa oleh backend; peran selain mahasiswa ditolak (HTTP 403).

### QR layar penuh untuk proyektor

- Membuat gambar QR dapat diklik untuk diperbesar ke tampilan layar penuh agar mudah dipancarkan ke proyektor atau layar besar saat pembelajaran offline; overlay menampilkan QR besar, judul pertemuan, kode cadangan, dan tombol tutup.

### Penguncian manual sesi pertemuan

- Dosen dapat mengunci sesi pertemuan tertentu kapan saja; saat terkunci, generate PIN/QR dan presensi mahasiswa (PIN maupun QR) ditolak, sedangkan rekap kehadiran tetap tersimpan.
- Status sesi ditampilkan pada kontrol dosen (**TERKUNCI** / **SESI BUKA** / **SESI DRAFT**) dan mahasiswa melihat pemberitahuan bahwa sesi dikunci.
- Menambahkan endpoint `POST /classes/{id}/attendance/lock` dan field `locked` pada setiap sesi pertemuan.

### Dependensi dan perbaikan lingkungan pengembangan

- Backend menambahkan dependensi `segno` untuk generate QR PNG ke data-url; frontend menambahkan `html5-qrcode` untuk pemindaian kamera.
- Memperbaiki kerusakan struktur `node_modules` akibat tercampurnya instalasi pnpm dan npm (React terduplikasi sehingga aplikasi memunculkan layar putih) dengan mengembalikan pemasangan dependensi yang konsisten via Yarn sesuai `yarn.lock`.
- Tidak ada migration SQL baru; versi skema tetap `002_domain_tables`.

## [1.4.0] — 2026-08-09

### Migrasi incremental OLD-SIAKAD ke SIAKAD baru

- Menambahkan pembaca ekspor database OLD-SIAKAD untuk file `db siakad old siap 7 agustus.json` yang memuat 325 tabel sumber.
- Menambahkan preview migrasi incremental yang membedakan record baru, update aman, tidak berubah, data lokal lebih baru, dan konflik sehingga perubahan tidak diterapkan secara membabi buta.
- Menambahkan baseline migrasi agar ekspor OLD-SIAKAD berikutnya hanya memproses perubahan terbaru dan tidak mengulangi seluruh migrasi.
- Menambahkan audit tiga arah antara OLD-SIAKAD, SIAKAD baru, dan Feeder untuk membantu menentukan sumber data ketika nilai atau status mahasiswa berbeda.
- Menambahkan metadata hasil migrasi, waktu proses, sumber file, dan ringkasan per tabel agar proses dapat diaudit kembali.
- Pada rekonsiliasi operasional versi ini, 923 update aman diterapkan, 2.837 record dinyatakan tidak berubah, tidak ditemukan konflik migrasi, dan 919 record KHS memperoleh kelengkapan `status_mhs`.
- Backup PostgreSQL sebelum rekonsiliasi disimpan sebagai `backups/pre_old_reconciliation_20260809.dump` dan tidak ada data sumber yang dihapus.

### Audit semester dan preview sinkronisasi Feeder

- Menambahkan audit read-only semester PDDikti berdasarkan kode periode, termasuk periode aktif `20252` atau 2025/2026 Genap.
- Menambahkan pencocokan mahasiswa, dosen, peserta kelas, nilai, dan Aktivitas Kuliah Mahasiswa (AKM) menggunakan identitas lokal serta ID Feeder yang telah terverifikasi.
- Menambahkan preview antrean sinkronisasi dengan status **Siap dikirim**, **Perlu persetujuan**, **Terblokir dependensi**, dan **Sudah diselesaikan**.
- Preview tidak menulis ke SIAKAD maupun Feeder dan selalu membaca ulang keadaan terbaru sebelum suatu batch boleh diproses.
- Mempertahankan presisi nilai dua desimal agar nilai seperti `86.64` tidak dianggap berbeda akibat pembulatan.
- Menyamakan representasi nilai kosong `0`, `-`, dan `NULL`; 12 review palsu dihapus dari antrean. Preview terakhir berisi 0 siap, 492 perlu persetujuan, 180 terblokir, dan 0 sudah diselesaikan.

### Pusat persetujuan dan pengaman sinkronisasi

- Menambahkan tampilan perbandingan berdampingan antara nilai SIAKAD dan Feeder Sandbox untuk setiap data yang memerlukan keputusan admin.
- Menambahkan pemilihan maksimal 25 data per batch dan mewajibkan seluruh data dalam satu keputusan berasal dari kategori yang sama.
- Menambahkan keputusan **Gunakan SIAKAD → Sandbox**, **Ambil Feeder → SIAKAD**, dan **Pertahankan Feeder** sesuai kemampuan serta keadaan setiap kategori.
- Keputusan **Pertahankan Feeder** dicatat permanen tanpa menulis ke Feeder. Keputusan otomatis dibuka kembali bila nilai SIAKAD atau Feeder berubah pada preview berikutnya.
- Impor nilai **Feeder → SIAKAD** hanya diizinkan bila Feeder benar-benar memiliki nilai dan nilai lokal masih kosong; pembaruan dilakukan ke KRS dan KHS sekaligus dengan pemeriksaan pasangan mata kuliah yang unik.
- Nilai SIAKAD yang sudah terisi tidak dapat ditimpa otomatis oleh Feeder.
- Peserta Feeder-only dan record peserta/nilai ganda tidak ditambah atau dihapus otomatis; admin harus memeriksa identitas dan dapat memilih mempertahankan Feeder.
- Menambahkan konfirmasi eksplisit berbeda untuk batch siap dan review yang disetujui agar tindakan tulis tidak dapat dipanggil hanya dengan memilih data.

### Eksekusi sandbox dan riwayat audit

- Seluruh endpoint tulis sinkronisasi dikunci ke mode sandbox dan path `/ws/sandbox2.php`; eksekusi live `/ws/live2.php` belum diaktifkan pada versi ini.
- Batch berhenti pada kegagalan pertama, membaca ulang sumber sebelum menulis, dan memverifikasi hasil dengan pembacaan Feeder setelah proses.
- Menambahkan riwayat eksekusi yang mencatat kategori, keputusan, ID operasi, hasil tiap data, jumlah panggilan tulis Feeder, pengguna, waktu, serta status selesai/gagal.
- Sebanyak 29 penulisan sandbox terverifikasi telah berhasil pada tahap rekonsiliasi: 1 mata kuliah, 2 relasi mata kuliah-kurikulum, 1 kelas, 1 penugasan dosen, 20 peserta kelas, dan 4 AKM. Tidak ada penulisan ke Feeder live.
- Pengiriman nilai SIAKAD ke Feeder tetap dikunci karena endpoint `UpdateNilaiPerkuliahanKelas` pada sandbox menolak key terverifikasi dengan error `1178`; kegagalan probe dicatat dan tidak dipaksakan.

### Dokumentasi dan validasi rilis

- Menambahkan [`PANDUAN_SINKRONISASI_FEEDER.md`](./PANDUAN_SINKRONISASI_FEEDER.md) berisi urutan migrasi, arti status, matriks keputusan, verifikasi, kondisi berhenti, dan checklist sebelum menuju produksi.
- Menambahkan test regresi untuk konfigurasi sandbox, presisi nilai, nilai kosong ekuivalen, resolusi yang kedaluwarsa saat sumber berubah, dan impor nilai Feeder ke KRS/KHS.
- Verifikasi rilis: 19 test rekonsiliasi/Feeder lulus, frontend production build berhasil, dan smoke test halaman PDDikti Feeder tidak menghasilkan error console.
- Tidak ada migration SQL baru; versi skema tetap `002_domain_tables`.

## [1.3.0] — 2026-08-07

### Scoping Data Mahasiswa & Dosen Wali Per Prodi (Kaprodi)

- **Manajemen Mahasiswa Kaprodi**: Membatasi tampilan daftar mahasiswa pada akun Kaprodi secara otomatis agar hanya menampilkan data mahasiswa di Program Studi yang dipimpinnya.
- **Tampilan Dosen Wali Full Container**: Menyesuaikan tata letak halaman Assign Dosen Wali menjadi *full-width container*.
- **Filtering Dosen Homebase**: Membatasi opsi dropdown Dosen Wali agar hanya menampilkan dosen ber-homebase pada prodi terkait, dengan urutan prioritas rekomendasi Kaprodi/Dekan di bagian teratas.

### Sinkronisasi & Koreksi Data Dosen Feeder

- **Koreksi Homebase Dr. ABDUROKHIM, S.E., M.M.**: Memperbarui dan menyinkronkan data homebase ke Program Studi **BISNIS DIGITAL**.
- **Koreksi Homebase Indi Millatul Maula, S.P., M.P.**: Memperbarui status homebase menjadi **Tanpa Homebase (Non-prodi)**.

### Desain & Modernisasi UI (Lucide React Icons)

- **Penggantian Emoji UI**: Mengganti 100% karakter emoji bawaan (`⭐`, `🏠`, `💡`) pada seluruh modul Dosen Wali, Kurikulum, Laporan BKD, dan Diagnosa Feeder dengan ikon vektor presisi dari `lucide-react` (`<Award />`, `<Sparkles />`, `<Building2 />`, `<Lightbulb />`).

### Laporan BKD & Portofolio Pembelajaran

- **Filtering Semester Aktif**: Menyinkronkan backend API `GET /reports/lecturer/summary` dan komponen `LecturerReportsPage` agar kartu statistik dan daftar kelas BKD tersaring presisi berdasarkan **Semester Aktif / Terpilih di Header Selector**.
- **Dokumen Audit BKD Publik Bebas Login (`PublicBKDBundlePage`)**: Menyediakan halaman audit publik yang dapat diakses oleh siapapun (termasuk asesor BKD/auditor) tanpa meminta login.
- **Link Langsung RPS, Presensi, & Nilai**: Menyediakan tombol akses langsung untuk Link RPS, Link Presensi 16 Sesi, dan Link Rekap Nilai yang otomatis tersalin ke clipboard dan dapat dibuka pada tab baru.
- **Presisi Data Rekap Nilai Audit BKD**: Mengoreksi kalkulasi rekap nilai internal pada backend `get_public_bkd_bundle` agar menampilkan seluruh komponen nilai mahasiswa (*Tugas, Presensi, UTS, UAS, Nilai Akhir, Grade*) dari SIAKAD secara presisi dan 100% identik dengan halaman Rekap Nilai Dosen.

## [1.2.0] — 2026-08-07

### Modul RPS & Presensi Pembelajaran

- **Pembaruan Navigasi RPS**: Mengubah tampilan awal halaman RPS Dosen agar secara otomatis menampilkan daftar mata kuliah yang diampu terlebih dahulu sebelum dosen membuka/mengisi formulir penyusunan RPS.
- **Peningkatan Tampilan Presensi**: Memperbaiki antarmuka dan kerapihan halaman presensi kehadiran dosen & mahasiswa agar lebih intuitif, responsif, dan mudah digunakan di perangkat seluler.

### Laporan Pembelajaran Semester & BKD Bundle Dosen

- **Menu Laporan Dosen**: Menambahkan menu *Laporan Dosen* pada portal Dosen untuk rekapitulasi bukti pembelajaran selama satu semester.
- **Laporan Komponen**: Menyediakan keluaran lengkap per komponen (Daftar Hadir Mahasiswa, Daftar Nilai Mahasiswa, RPS, dan SK Mengajar).
- **Public Shareable Links**: Menyediakan link publik resmi yang dapat diakses tanpa login untuk setiap dokumen laporan.
- **Generator Bundle BKD Dosen**: Menambahkan generator *Bundle BKD Dosen* (PDF / Print Bundle) yang menggabungkan seluruh dokumen bukti pembelajaran semester dalam satu dokumen lengkap bersampul BKD & KOP Surat Resmi Kampus.

### Pengaturan Kampus, Branding, & KOP Surat Resmi

- **Detail Pengaturan Institusi**: Memperbarui halaman *Pengaturan Kampus* dengan isian data legalitas dan operasional institusi yang lebih lengkap (NPSN, SK Pendirian, Akreditasi, Alamat, Kontak).
- **Penetapan Pejabat Kampus**: Mengubah pemilihan Pimpinan & Pejabat Kampus (Rektor/Direktur, Wakil Rektor I, BAAK, LPPM) agar diambil secara dinamis dari data Dosen Aktif.
- **Manajemen Branding Logo & KOP Banner**: Menambahkan form upload file dan live preview untuk *Logo Kampus*, *Banner Header KOP Surat*, dan *Banner Footer KOP Surat* yang disimpan secara permanen di server (`STORAGE_ROOT/Branding`).
- **Sinkronisasi Otomatis Periode Akademik**: Menyinkronkan field *Tahun Ajaran Aktif* dan *Semester Aktif* pada Pengaturan Kampus agar terkunci (*Read-Only*) dan terhubung otomatis secara real-time dengan status `[Aktif]` di Data Master Tahun Ajaran.

### Master Jabatan Akademik Lokal & Tugas Tambahan

- **Master Jabatan Akademik Dosen**: Menambahkan menu *Data Master -> Jabatan Akademik Dosen* untuk mengelola Jabatan Fungsional/Struktural Internal Perguruan Tinggi.
- **Pre-populated Jabatan Lokal**: Menyediakan daftar default Jabatan Akademik/Tugas Tambahan kampus (Kaprodi, Ketua SPMI, Ketua LPPM, Kepala Laboratorium, Sekretaris Prodi, Dekan, Koordinator Magang/KP).
- **Manajemen Jabatan Custom**: Memungkinkan Admin Kampus menambah (*Custom Position*), mengedit, dan menghapus Jabatan Akademik Lokal beserta atribut Kode, Unit Kerja, Ekuivalensi SKS BKD, dan Wewenang SK.

### Integrasi PDDikti Neo Feeder Web Service Protocol

- **Menu Integrasi PDDikti Feeder**: Menambahkan menu admin *Sistem & Integrasi -> PDDikti Feeder*.
- **Konfigurasi Web Service Protocol**: Menyediakan formulir konfigurasi Web Service Feeder (Host Server Base URL, Endpoint `/ws/live2.php`, Username/Kode PT, Password, Mode Live/Sandbox, Auto-sync).
- **Uji Koneksi Feeder (Test Connection)**: Menambahkan fitur uji koneksi *real-time* yang menjalankan protocol JSON-RPC `GetToken` & `GetProfilPT`, mengukur latency waktu respon (ms), serta mereturn diagnosa error apabila koneksi gagal.
- **Perbaikan Ikon Dashboard**: Mengimpor ikon `Server` dan `Zap` dari paket `lucide-react` pada `frontend/src/App.js` untuk mencegah `ReferenceError` pada komponen React.

## [1.1.0] — 2026-07-24

### Google Meet dan Google Drive

- Memperbaiki pembuatan ruang Google Meet ketika delegasi akun dosen ditolak dengan mencoba akun Workspace default yang telah diverifikasi.
- Mengubah pesan `unauthorized_client` menjadi petunjuk konfigurasi Domain-wide Delegation yang dapat ditindaklanjuti, termasuk Client ID numerik, scope Meet, dan domain akun penyelenggara.
- Menambahkan monitor sinkronisasi file Google Drive beserta status, jumlah percobaan, jadwal percobaan berikutnya, tautan file Drive, serta aksi retry manual.
- Menambahkan scheduler pemeliharaan yang terus mencoba sinkronisasi gagal maksimal lima kali per hari dan melanjutkannya kembali pada hari berikutnya.
- Menghapus salinan lokal file yang telah berhasil tersinkron ke Google Drive setelah 14 hari tanpa menghapus file di Drive atau referensi lampirannya.
- Memperbaiki konsistensi referensi file pada materi, tugas, submission, diskusi, dan chat setelah status penyimpanan berubah.

### Audit aktivitas dan notifikasi

- Menambahkan pencatatan aktivitas pengguna untuk login dan permintaan API terautentikasi, termasuk peran, kategori, status keberhasilan, durasi, serta retensi log yang dapat dikonfigurasi.
- Menambahkan grafik tren aktivitas, ringkasan pengguna aktif, login, kegagalan, dan daftar aktivitas terbaru pada dashboard admin kampus.
- Menambahkan pusat notifikasi pada header admin/dosen dan mahasiswa untuk komentar atau balasan diskusi, submission baru, permintaan masuk kelas, tugas baru, nilai, serta permintaan revisi.
- Mengarahkan klik notifikasi langsung ke materi, komentar, submission, enrollment, atau tugas terkait.
- Mempertahankan angka notifikasi sampai objek tujuan benar-benar berhasil dibuka dan menyimpan status baca per pengguna.

### Materi YouTube dan navigasi halaman

- Menambahkan input khusus link YouTube pada form tambah/edit materi dengan validasi di frontend dan backend.
- Mendukung format `youtube.com`, YouTube Shorts, `youtu.be`, `live`, serta URL embed dan menyimpannya dalam format kanonis.
- Menampilkan video pada halaman materi mahasiswa sebagai embed responsif 16:9 dengan fullscreen, lazy loading, mode `youtube-nocookie.com`, dan tautan cadangan ke YouTube.
- Memisahkan scroll formulir dan daftar pada halaman materi serta tugas, termasuk batas tinggi yang sesuai untuk perangkat seluler.
- Memisahkan scroll daftar pertemuan dan detail materi mahasiswa agar kedua panel dapat dinavigasi secara mandiri.

### Validasi rilis

- Menambahkan test kebijakan storage, agregasi aktivitas, status baca notifikasi, dan normalisasi URL YouTube ke GitHub Actions.
- Build frontend produksi dan pemeriksaan URL backend lokal pada bundle tetap dijalankan pada setiap verifikasi.
- Tidak ada migration SQL atau perubahan versi skema PostgreSQL pada rilis ini.

## [1.0.12] — 2026-07-24

### Penyelesaian repair identitas mahasiswa

- Mengizinkan utility penggabungan akun tidak aktif memindahkan reminder pasif `tugas_baru` berstatus `in_app` ke akun yang dipertahankan.
- Tetap memblokir merge apabila akun sumber memiliki submission, session, enrollment, chat, reminder nilai/revisi, atau referensi lain yang menunjukkan aktivitas pengguna.
- Mendokumentasikan koreksi final: Rafiq Firmansyah menggunakan NIM `24020130` dan Siti Rohmah menggunakan NIM `24010202`.
- Menambahkan test regresi untuk memastikan hanya keanggotaan kelas dan reminder tugas baru pasif yang dapat dipindahkan otomatis.
- Menjalankan test integritas identitas dan kompilasi utility repair sebagai bagian dari verifikasi GitHub Actions.
- Tidak ada migration SQL atau perubahan skema PostgreSQL pada rilis ini.

## [1.0.11] — 2026-07-24

### Integritas identitas mahasiswa

- Menolak email, username, NIM, atau WhatsApp duplikat pada registrasi, tambah mahasiswa manual, join kelas legacy, dan import Excel.
- Menghapus perilaku lama yang diam-diam menambahkan suffix pada username ketika NIM sudah dipakai.
- Menampilkan jumlah konflik identitas pada hasil import agar baris yang dilewati dapat diperiksa admin.
- Menolak login dengan identitas ambigu serta mencegah reset password memilih salah satu akun secara acak.
- Memperbaiki validasi perubahan profil agar konflik email dan username selalu diperiksa, termasuk ketika WhatsApp tidak berubah.
- Menambahkan unique index PostgreSQL untuk `nim`; data legacy duplikat menggunakan fallback non-unique sementara agar backend tetap dapat start sampai repair selesai.
- Menambahkan utility repair dengan mode dry-run, token konfirmasi, transaksi, dan guard aktivitas untuk koreksi NIM serta penggabungan akun mahasiswa duplikat.
- Mendokumentasikan keputusan pemilik data untuk mempertahankan NIM `24010230` pada Rafiq dan akun Haris dengan email berawalan `h***`.
- Tidak ada migration SQL baru; indeks identitas dibuat secara idempotent oleh startup setelah data duplikat diselesaikan.

## [1.0.10] — 2026-07-24

### Hotfix sinkronisasi Google Drive

- Menambahkan dukungan `array_filters` pada adapter PostgreSQL untuk memperbarui referensi file yang tersimpan di dalam array submission dan lampiran tugas.
- Menambahkan pencarian JSONB untuk dotted path yang melewati embedded array, seperti `files.file_id` dan `attachments.file_id`.
- Mencegah proses Retry mengunggah ulang file yang sebenarnya sudah berhasil tersimpan di Google Drive tetapi sebelumnya gagal ketika memperbarui referensi internal.
- Menambahkan test regresi untuk pencarian embedded array, filtered positional update `$[item]`, dan kontrak kompatibilitas `update_many()`.
- Tidak ada migration atau perubahan skema PostgreSQL pada rilis ini.

## [1.0.9] — 2026-07-23

### Hotfix deployment frontend

- Menghapus URL backend lokal `127.0.0.1:8002` dari konfigurasi build produksi.
- Menggunakan origin situs yang sedang dibuka sebagai alamat backend default, sehingga frontend dan endpoint `/api` tetap bekerja melalui domain serta reverse proxy yang sama.
- Menyesuaikan callback dan URL frontend SSO agar mengikuti origin situs, tanpa menanam alamat komputer lokal ke dalam bundle produksi.
- Menambahkan pemeriksaan GitHub Actions yang menggagalkan build jika URL backend lokal port `8002` kembali masuk ke aset JavaScript produksi.
- Tidak ada perubahan skema atau data PostgreSQL pada rilis ini.

## [1.0.8] — 2026-07-23

### Lifecycle kelas dan akhir semester

- Menetapkan status kelas berurutan `Aktif → Berakhir → Nilai difinalisasi → Arsip`, dengan aturan server yang menutup perubahan materi, tugas, anggota, submission, diskusi, dan konfigurasi kelas setelah kelas diakhiri.
- Mempertahankan ruang penilaian pada status `Berakhir` agar dosen dapat menyelesaikan koreksi sebelum finalisasi; kelas `Nilai difinalisasi` dan `Arsip` sepenuhnya read-only.
- Menambahkan finalisasi nilai eksplisit dengan konfirmasi `FINALISASI`, pemeriksaan kelengkapan komponen Tugas/UTS/UAS, snapshot rekap akhir, identitas pemroses, dan waktu finalisasi.
- Menyimpan snapshot bobot nilai saat kelas diakhiri sehingga perubahan bobot mata kuliah pada semester berikutnya tidak mengubah histori nilai semester lama.
- Menambahkan backfill startup yang idempotent untuk snapshot bobot kelas lama berstatus berakhir/final/arsip; tidak ada perubahan versi skema SQL karena field tersimpan dalam dokumen JSONB.
- Menambahkan aksi `Periode baru` dengan konfirmasi `DUPLIKASI` untuk membuat kelas aktif baru berkode baru, tanpa menyalin mahasiswa, materi, tugas, atau submission dari kelas sumber.

### Approval, konfirmasi, dan panduan pengguna

- Menutup bypass endpoint registrasi lama: akun mahasiswa tidak lagi langsung masuk kelas dan selalu membuat permintaan enrollment `pending` yang harus disetujui dosen/admin.
- Menambahkan verifikasi password pada akun lama sebelum endpoint kompatibilitas membuat permintaan kelas.
- Menambahkan konfirmasi pada tindakan penting: membuat/mengubah kelas, publikasi materi, pembuatan tugas, import mahasiswa, approval/reject enrollment, perubahan anggota, bobot/predikat nilai, penilaian, revisi, pengumpulan tugas, penutupan kelas, finalisasi, arsip, dan perubahan periode akademik.
- Menambahkan menu `Panduan LMS` khusus admin, dosen, dan mahasiswa yang menjelaskan alur setup, permintaan masuk kelas, approval, pembelajaran, penilaian, finalisasi, arsip, dan pergantian semester.
- Menambahkan `PANDUAN_LMS.md` sebagai referensi onboarding, checklist finalisasi, dan verifikasi upgrade server.
- Menampilkan status lifecycle dan pesan read-only pada halaman kelas, materi, tugas, penilaian, rekap, diskusi, dan ruang mahasiswa agar pengguna memahami alasan sebuah aksi ditutup.

### Continuous integration

- Memperbarui GitHub Actions ke runtime Node 24 dan menyesuaikan instalasi frontend agar peer dependency proyek dapat dipasang secara konsisten di CI.

## [1.0.7] — 2026-07-23

### Dashboard informatif untuk semua pengguna

- Menata ulang dashboard superadmin dan dosen menjadi pusat kendali berbasis peran dengan sapaan, progres penilaian, status penyimpanan, metrik kelas, dan shortcut tindakan utama.
- Menambahkan prioritas operasional untuk submission belum dinilai, tugas belum dikumpulkan, permintaan masuk kelas, serta mahasiswa yang membutuhkan perhatian.
- Menambahkan grafik aktivitas submission tujuh hari, agenda deadline dengan countdown dan reminder, tabel progres mahasiswa, serta feed submission dan diskusi terbaru.
- Memastikan seluruh data dashboard dosen tetap mengikuti batas kelas yang dikelola, sementara superadmin mendapat ringkasan kampus dan jumlah dosen aktif.
- Memperkaya dashboard mahasiswa dengan persentase penyelesaian tugas, deadline prioritas, progres per kelas, ringkasan aksi, agenda mendatang, serta nilai dan feedback terbaru.
- Menyesuaikan dashboard baru untuk desktop, tablet, perangkat seluler, empty state, dan kebutuhan cetak.

## [1.0.6] — 2026-07-23

### Dashboard laporan analitik

- Mengubah halaman Laporan menjadi dashboard analitik dengan filter kelas dan rentang tren 7, 14, atau 30 hari.
- Menambahkan grafik tren submission harian, status submission, serta perbandingan rata-rata nilai dan ketuntasan penilaian per kelas.
- Menambahkan sorotan submission yang belum dinilai, tingkat keterlambatan, dan kelas dengan performa terbaik untuk mempercepat tindak lanjut.
- Menyesuaikan ringkasan mahasiswa, tugas, submission, dan progres penilaian dengan kelas yang dipilih.
- Menambahkan export Excel/PDF dan cetak langsung dari halaman laporan; export mengikuti filter kelas aktif.
- Menyediakan empty state, layout responsif untuk perangkat seluler, dan tampilan khusus cetak.

## [1.0.5] — 2026-07-22

### Bobot nilai dan rekap per mata kuliah

- Menambahkan pengaturan bobot Tugas, UTS, dan UAS per mata kuliah untuk akun dosen dan superadmin, dengan default 25% · 35% · 40% serta validasi total wajib 100%.
- Menambahkan penandaan komponen nilai pada tugas agar setiap tugas dapat masuk ke kelompok Tugas, UTS, atau UAS.
- Mengubah rekap nilai menjadi nilai akhir berbobot per mahasiswa, menampilkan komposisi bobot, nilai komponen, status sementara/lengkap, dan distribusi grade.
- Menambahkan export rekap per kelas/mata kuliah dalam format Excel dan PDF, serta tombol cetak dari detail rekap.

## [1.0.4] — 2026-07-22

### Tampilan ruang mahasiswa

- Memprioritaskan tugas yang belum dikumpulkan atau diminta revisi pada beranda mahasiswa dan mengganti hitungan aktivitas dengan jumlah tindakan yang benar-benar perlu dikerjakan.
- Mengurutkan daftar tugas berdasarkan kebutuhan tindakan dan deadline, serta membuka tugas pilihan langsung dari kartu prioritas di beranda.
- Memperjelas pengumpulan tugas menjadi tiga langkah: pilih file, tambahkan catatan opsional, lalu kumpulkan.
- Memperjelas status tugas yang sudah terkumpul dan alasan pengiriman ulang dikunci sampai dosen meminta revisi.
- Menyesuaikan tata letak kartu prioritas, progres, status, dan formulir pengumpulan untuk desktop maupun perangkat seluler.

## [1.0.3] — 2026-07-22

### Konfigurasi akademik

- Menata ulang halaman `Prodi, MK & Kelas` menjadi alur tiga langkah: program studi → mata kuliah → kelas semester.
- Menambahkan ringkasan jumlah prodi, mata kuliah, dan kelas aktif serta navigasi lompat ke setiap langkah.
- Menambahkan penjelasan prasyarat agar mata kuliah hanya dibuat setelah prodi tersedia dan kelas hanya dibuat setelah mata kuliah tersedia.
- Menambahkan input SKS pada mata kuliah, placeholder konfigurasi kelas, dan keterangan bahwa kode kelas dibuat otomatis.
- Memperjelas status kelas menjadi `Aktif` atau `Berakhir`, serta menampilkan tahun akademik dan semester di daftar kelas.
- Menyesuaikan kartu, tabel, mode edit, empty state, dan layout mobile agar konfigurasi lebih mudah dipahami.

## [1.0.2] — 2026-07-22

### Penilaian

- Menata ulang halaman Penilaian menjadi alur tiga langkah: pilih tugas/status, pilih mahasiswa, lalu nilai pada satu ruang kerja.
- Menambahkan ringkasan progres kelas, antrean submission dengan prioritas submission yang belum dinilai, pencarian nama/NIM/tugas, dan filter status.
- Memindahkan nilai massal ke panel yang dapat dibuka saat diperlukan agar tidak mengganggu alur penilaian satu submission.
- Menampilkan konteks tugas, waktu kirim, status keterlambatan, catatan mahasiswa, lampiran, rubrik, feedback, dan catatan revisi secara berurutan.
- Memperbaiki sinkronisasi nilai dan feedback saat berpindah submission serta memperbaiki judul kelas yang sebelumnya dapat tampil kosong.
- Menyesuaikan layout desktop dan mobile untuk menjaga antrean, form nilai, tombol aksi, dan navigasi tetap mudah digunakan.

## [1.0.1] — 2026-07-22

### Hak akses mahasiswa

- Membatasi pembuatan akun mahasiswa manual dan import Excel hanya untuk admin kampus.
- Dosen dapat melihat katalog mahasiswa aktif yang sudah terdaftar di sistem dan memasukkannya ke kelas yang dikelola.
- Mahasiswa nonaktif hanya terlihat oleh dosen bila sudah menjadi anggota kelas yang dikelolanya.
- Ringkasan progres yang diterima dosen dibatasi pada kelas milik dosen tersebut meskipun katalog mahasiswa aktif bersifat kampus-wide.
- Perubahan status akun dan reset password mahasiswa dibatasi untuk admin kampus; dosen tetap dapat mengelola keanggotaan kelas.
- Form tambah mahasiswa dan import Excel disembunyikan dari UI dosen, sementara pencarian serta aksi memasukkan mahasiswa aktif tetap tersedia.
- Tidak ada perubahan skema database; versi skema tetap `002_domain_tables`.

### Repository dan backup

- Menetapkan `https://github.com/syahrullanw/nugaslagi.git` sebagai remote resmi dan sumber histori aplikasi.
- Menambahkan aturan branch, commit konvensional, Pull Request, release, tag, perlindungan credential, serta deployment berbasis commit/tag.
- Menambahkan script pemeriksaan/push backup dan release yang tidak melakukan stage atau commit otomatis.
- Menambahkan template Pull Request dan workflow GitHub Actions untuk compile/test backend serta build frontend.

## [1.0.0] — 2026-07-22

Rilis baseline untuk operasional PostgreSQL dan pelacakan upgrade.

### Versi dan dukungan operasional

- Menambahkan sumber versi terpusat melalui `VERSION` (`1.0.0`) dan metadata backend di `backend/app_version.py`.
- Menambahkan endpoint `GET /api/version` serta field `version` pada respons root API.
- Menampilkan versi aplikasi dan versi skema database pada layar login serta sidebar admin/dosen/mahasiswa.
- Menambahkan `VERSIONING.md` berisi prosedur bump versi, deployment, pemeriksaan skema, dan rollback.
- Menetapkan metadata deployment opsional: `APP_RELEASE_CHANNEL`, `APP_BUILD_ID`, `APP_GIT_COMMIT`, dan `APP_BUILD_AT`.

### PostgreSQL

- Runtime aplikasi berpindah dari MongoDB ke PostgreSQL melalui adapter kompatibilitas async.
- Data domain disimpan pada tabel `app_doc_<collection>` dengan payload `JSONB`, `document_id`, timestamp, indeks GIN untuk pencarian JSONB, serta indeks B-tree untuk filter/sort umum.
- Menambahkan unique index per domain agar semantik `_id` tetap terjaga.
- Query filter, sort, pagination, dan aggregate yang digunakan aplikasi dikompilasi ke SQL PostgreSQL.
- Menambahkan pool koneksi yang dapat dikonfigurasi melalui `DB_POOL_MIN_SIZE`, `DB_POOL_MAX_SIZE`, dan `DB_COMMAND_TIMEOUT`.

### Migration dan deployment

- `backend/migrations/001_postgresql_jsonb.sql`: metadata migration dan baseline PostgreSQL.
- `backend/migrations/002_domain_tables.sql`: registry tabel domain.
- `backend/scripts/migrate_mongodb_to_postgresql.py`: migrasi MongoDB ke tabel domain PostgreSQL, validasi jumlah dokumen, mode `--dry-run`, dan `--truncate-target`.
- `backend/docker-compose.postgres.yml`: PostgreSQL lokal/development.
- `backend/migration-requirements.txt`: dependensi terpisah untuk menjalankan migrasi.
- `.env.example` diperbarui untuk membedakan koneksi runtime PostgreSQL dari koneksi MongoDB yang hanya diperlukan sebagai sumber migrasi.

### Validasi rilis

- Endpoint kritis backend, login admin, alur OTP, dan frontend diverifikasi berjalan.
- Adapter PostgreSQL dan integration test yang relevan lulus.
- Migrasi diuji pada database PostgreSQL sementara dengan validasi collection dan jumlah dokumen.

## Riwayat Git yang dapat diverifikasi

Riwayat formal yang dapat diverifikasi di repository:

| Tanggal | Commit | Ringkasan |
| --- | --- | --- |
| 2026-07-20 | `28636a8` | `feat: add visual grade recap per course with Recharts charts` — baseline aplikasi dan rekap nilai visual. |
| 2026-07-20 | `9272451` | `chore: include frontend build output for deployment` — memasukkan hasil build frontend untuk deployment. |
| 2026-07-22 | `d24f393` | `release: v1.0.1 PostgreSQL and access-control baseline` — baseline PostgreSQL, permission mahasiswa, versioning, dan workflow GitHub. |

## Perubahan working tree yang dipetakan sebelum `1.0.0`

Bagian ini sengaja tidak diberi SHA per fitur karena perubahan tersebut masih berupa working tree/uncommitted ketika inventaris awal dibuat. Seluruh baseline tersebut kemudian dibakukan dalam commit `d24f393`.

- **Identitas dan akses:** integrasi SSO SCI-ID/OIDC, login lokal, logout, registrasi, lupa/reset password, OTP email/WhatsApp, serta konfigurasi provider.
- **Tenancy dan peran:** dukungan multi-lecturer, admin kampus, dosen, mahasiswa, enrollment kelas, dan isolasi data per tenant.
- **Pembelajaran:** course/class, materi, pertemuan online/offline, komentar, attachment, assignment, deadline, submission, revisi, rubrik, penilaian, grade predicate, rekap, export, dan notifikasi.
- **UI:** branding kampus, dashboard per peran, widget chat, kalender, progress, empty state, dan visualisasi nilai dengan Recharts.
- **Storage:** adapter PostgreSQL, migration SQL, tool migrasi MongoDB, indeks domain, konfigurasi pool, compose PostgreSQL, serta test kompatibilitas.

### Inventaris artefak yang dapat ditelusuri

- **Backend/runtime:** `backend/server.py`, `backend/postgres_database.py`, `backend/app_version.py`, `backend/.env.example`, `backend/requirements.txt`, dan `backend/requirements-migration.txt`.
- **Database/deployment:** `backend/migrations/001_postgresql_jsonb.sql`, `backend/migrations/002_domain_tables.sql`, `backend/scripts/migrate_mongodb_to_postgresql.py`, `backend/docker-compose.postgres.yml`, dan `backend/POSTGRESQL_MIGRATION.md`.
- **Frontend:** `frontend/src/App.js`, `frontend/src/App.css`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/.env.production`, dan hasil `frontend/build/`.
- **Test yang dipetakan:** `test_auth_front_register_forgot_change_password.py`, `test_iteration3_revision_features.py`, `test_iteration5_password_whatsapp_review.py`, `test_iteration6_password_whatsapp_review_regression.py`, `test_iteration7_grade_predicates.py`, `test_material_meeting_crud.py`, `test_multi_lecturer_tenancy.py`, `test_mvp_elearning_flows.py`, `test_postgres_database_compat.py`, `test_revision_feature_set.py`, `test_sso_oidc_integration.py`, dan `test_unified_login_enrollment_deadline_settings.py`.

Saat memotong rilis berikutnya, pindahkan item yang sudah selesai ke bagian versi baru dan sertakan SHA commit yang benar-benar dibuat.
