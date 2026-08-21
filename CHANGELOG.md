# Changelog

Semua perubahan penting pada aplikasi ini dicatat di sini. Versi rilis utama disimpan di file [`VERSION`](./VERSION), sedangkan versi skema database yang sudah diterapkan dicatat oleh tabel `app_schema_migrations` di PostgreSQL.

## [1.11.6] — 2026-08-21

### Backup dan restore database

- Menambahkan fitur **Restore database** pada halaman Backup Database untuk mengunggah file hasil backup `.json.gz`.
- Menambahkan validasi format, versi, gzip, ukuran file maksimal 200 MB, struktur collection, dan duplikasi ID sebelum restore dijalankan.
- Menjalankan restore seluruh collection aplikasi dalam satu transaksi PostgreSQL agar kegagalan tidak meninggalkan restore parsial.
- Membuat salinan pengaman otomatis sebelum restore dan menampilkannya pada riwayat backup.
- Mempertahankan sesi Administrator yang sedang melakukan restore apabila akun tersebut masih tersedia di backup.
- Menyesuaikan ulang path lokal file dan backup setelah restore agar tidak bergantung pada path komputer sumber.
- Menambahkan konfirmasi risiko, indikator proses, notifikasi hasil restore, dan peringatan file lokal yang tidak tersedia pada halaman frontend.
- Menyelaraskan keterangan format backup pada riwayat agar mencerminkan logical backup JSON database aplikasi.

### Validasi rilis

- Menambahkan regression test untuk parser backup yang valid, file gzip rusak, format tidak dikenal, dan ID dokumen duplikat.
- Versi aplikasi dinaikkan dari `1.11.5` ke `1.11.6` pada `VERSION`, `frontend/package.json`, `frontend/package-lock.json`, dan `frontend-pmb/package.json`.

## [1.11.5] — 2026-08-21

### Rekonsiliasi dosen dan homebase

- Menjadikan identitas serta riwayat penugasan Dosen dari Feeder sebagai sumber otoritatif untuk NIDN, NUPTK, dan homebase tanpa menimpa perubahan profil lokal yang tidak berkaitan.
- Menyatukan riwayat homebase tahunan yang menunjuk Program Studi sama, memilih penugasan tunggal pada tahun ajaran terbaru saat Dosen berpindah homebase, dan menahan pembaruan jika tahun terbaru masih mengandung lebih dari satu Program Studi.
- Memetakan ID Program Studi Feeder ke kode Program Studi lokal dan hanya memakai data OLD-SIAKAD sebagai fallback apabila homebase tunggal serta tidak ambigu.
- Meneruskan ID Dosen hasil merge ke Dosen PA, kelas, Dosen utama, dan team teaching agar relasi tidak kembali menunjuk akun Dosen lama yang sudah digabung.
- Memperketat eksekusi rekonsiliasi incremental dengan pemeriksaan stale sebelum penulisan, melewati konflik/local-newer, menyimpan baseline sinkronisasi, checksum sumber, dan audit setiap import aman tanpa menulis balik ke Neo Feeder.
- Menambahkan ringkasan hasil resolusi homebase, konflik, akun hasil merge yang dilewati, serta klasifikasi create/update/unchanged pada dry-run dan eksekusi migrasi.

### Kurikulum & Dosen Mata Kuliah

- Mengganti pilihan Dosen Pengampu Utama dan team teaching menjadi pencarian berdasarkan nama, NIDN, NIP, atau NUPTK dengan dukungan pemilihan satu maupun beberapa Dosen.
- Menampilkan badge homebase pada hasil pencarian dan Dosen terpilih agar Kaprodi dapat memeriksa asal Program Studi sebelum menyimpan pemetaan Mata Kuliah.
- Menambahkan konteks khusus pemetaan Dosen Mata Kuliah agar Kaprodi dapat memilih Dosen lintas Program Studi tanpa memperluas scope halaman Data Dosen yang tetap terbatas pada Program Studi yang dipimpin.
- Memperbaiki normalisasi homebase dengan memetakan kode, nama, ID lokal, dan ID Feeder ke satu Program Studi kanonis. Data Syahrul Anwar kini dikenali sebagai `RKJ-D4 — REKAYASA KOMPUTER JARINGAN`, bukan **Homebase Belum valid**.
- Tetap menandai homebase sebagai belum valid apabila tidak tersedia atau aliasnya benar-benar merujuk ke lebih dari satu Program Studi.

### Backup dan restore portabel

- Mengganti backup database lama menjadi satu bundle transfer yang memuat dump PostgreSQL format custom, seluruh `backend/storage`, manifest versi, ukuran, dan checksum SHA-256.
- Mengecualikan `.env`, password database, token, private key, dan credential Google dari bundle serta tetap mengecualikan bundle dari GitHub melalui `.gitignore`.
- Menjadikan restore bersifat preflight secara default; perubahan data hanya dijalankan dengan `--execute` setelah format, checksum, keamanan path arsip, dump, dan koneksi target lolos pemeriksaan.
- Membuat backup database target dan salinan storage lama secara otomatis sebelum restore, serta menjalankan restore database dalam satu transaksi.
- Menghapus pemilihan container PostgreSQL pertama secara sembarang; jika ada beberapa container, target harus dinyatakan secara eksplisit.
- Menyesuaikan ulang path absolut file dan backup database secara otomatis saat backend startup, sehingga data dari komputer lokal dapat digunakan pada struktur direktori server baru.
- Menambahkan panduan pemindahan data lokal-ke-server dan regression test untuk integritas bundle, penolakan path traversal, checksum, dan rebase path storage.

### Validasi rilis

- Versi aplikasi dinaikkan dari `1.11.4` ke `1.11.5` pada `VERSION`, `frontend/package.json`, `frontend/package-lock.json`, dan `frontend-pmb/package.json`.
- Tidak ada migration SQL baru; perubahan rekonsiliasi dijalankan melalui CLI migrasi OLD-SIAKAD yang sudah memiliki mode dry-run dan audit.
- Menambahkan regression test untuk resolusi homebase Feeder, propagasi ID Dosen kanonis, scope pemilihan Dosen MK Kaprodi, serta normalisasi alias homebase pada frontend.

## [1.11.4] — 2026-08-20

### Hak akses Tendik

- Hak akses efektif dari role, templat, dan penugasan kini dikirim saat sesi user dimuat.
- Menu Tendik sekarang membaca izin modul yang tersimpan, bukan hanya `access_roles`, sehingga menu seperti Keuangan, PMB, Akademik, dan modul lain langsung mengikuti checklist hak akses.

### Pencarian Hak Akses User

- Memperbaiki filter role dan pencarian pengguna agar hasil mengikuti kata kunci tanpa tertahan oleh hasil pencarian sebelumnya.
- Pencarian kini mencakup nama, nama lengkap, username, email, NIM, dan NIDN dengan pencocokan yang tidak peka huruf besar/kecil.
- Menambahkan dukungan query `$regex` dan `$options` pada adapter PostgreSQL serta mengamankan kata kunci menjadi pencarian literal.

### Konsistensi role, jabatan, dan menu

- Menjadikan `effective_permissions` dari halaman Hak Akses User sebagai sumber keputusan tunggal untuk menu Admin, Dosen, Tendik, dan Mahasiswa.
- Menghapus pembukaan menu implisit hanya karena role Dosen atau atribut tambahan Kaprodi/Operator; jabatan tambahan sekarang mengatur scope dan menambah izin melalui templat, bukan melewati matriks modul.
- Mengirim izin efektif langsung pada login lokal, login SSO, dan `/auth/me` untuk semua role agar sidebar sudah benar sejak render pertama.
- Mengabaikan teks/flag jabatan lama apabila `access_roles` hasil sinkronisasi sudah tersedia, sehingga dosen biasa dengan data jabatan historis tidak lagi dianggap Kaprodi.
- Memigrasikan templat bawaan lama yang masih memakai grup umum seperti `data_master`, `user_management`, dan `system_settings` ke katalog modul terperinci versi 2 tanpa membuka modul admin yang tidak berkaitan.
- Membatasi pemuatan awal frontend pada data modul yang memang boleh dilihat dan mengalihkan navigasi/notifikasi dari halaman yang tidak memiliki izin.
- Menambahkan regresi untuk Admin, Dosen biasa, Kaprodi, Tendik, Mahasiswa, template lama, serta field jabatan Kaprodi yang sudah tidak aktif.

### Scope Dosen dan Kaprodi

- Menjadikan Kaprodi sebagai Dosen Pengampu dengan privilese struktural tambahan, lalu mengelompokkan menu khususnya pada grup **Kaprodi** di sidebar.
- Memigrasikan templat bawaan Kaprodi ke skema izin versi 3 dan menghapus akses default ke Fakultas, Program Studi, SK Mengajar, SK Jabatan Akademik, Jabatan Akademik Dosen, Wizard Prodi + Kelas, serta Penempatan Mahasiswa ke Prodi.
- Membatasi Kurikulum, Jadwal Mengajar, Data Mahasiswa, Data Dosen, Dosen Wali, dan analisis Kaprodi pada Prodi aktif yang dipimpin; percobaan akses atau perubahan lintas Prodi ditolak oleh backend.
- Halaman Jadwal Mengajar Kaprodi kini mengikuti selector semester di header, tanpa filter tahun ajaran dan semester ganda di dalam halaman.
- Menjadikan Data Dosen bersifat baca-saja untuk Kaprodi dan hanya menampilkan dosen dengan homebase pada Prodi yang dipimpin.
- Memastikan Laporan Ringkas Kaprodi tetap memakai scope kelas yang benar-benar dia ampu sebagai dosen, bukan seluruh kelas dalam Prodi.

### Scope Tendik Akademik / BAAK

- Menjadikan penugasan **Kepala / Staf Bagian Akademik (BAAK)** pada Jabatan Akademik sebagai sumber atribut `academic_operator`, tanpa mengubah role dasar Tendik menjadi Admin.
- Menambahkan Tendik ke daftar kandidat penugasan Jabatan Akademik melalui endpoint khusus, sehingga daftar Data Dosen tetap hanya berisi dosen.
- Mengembalikan templat role dasar Tendik ke akses minimum; kewenangan operasional kini berasal dari jabatan aktif seperti BAAK, Keuangan, atau PMB.
- Menyamakan kewenangan pengelolaan Kalender Akademik BAAK dengan Admin Kampus, termasuk membuat, mengubah, menghapus/mengarsipkan, dan mengekspor agenda.
- Menyembunyikan Perwalian KRS dari user akademik karena antrean persetujuan tersebut merupakan tanggung jawab Dosen PA.
- Membuka Progres Nilai Prodi, Analisis Mahasiswa Prodi, serta Analisis & Approval RPS untuk Admin dan BAAK dengan selector seluruh/satu Program Studi.
- Memperbaiki otorisasi endpoint analisis yang sebelumnya menolak Tendik BAAK dan menutup fallback sesi lama yang dapat memperlakukan permintaan tanpa sesi sebagai Admin.
- Data Mahasiswa untuk BAAK menggunakan scope institusi sehingga seluruh mahasiswa lintas Prodi tampil seperti pada Admin.
- Menetapkan akun `jijah@polteksci.ac.id` sebagai **Kepala / Staf Bagian Akademik (BAAK)** dan menyinkronkan ulang hak akses efektifnya.
- Menyembunyikan Rekap Nilai, Predikat, Laporan Ringkas, serta Laporan BKD & Portofolio dari seluruh user Tendik karena halaman tersebut merupakan ruang kerja pengajaran Dosen.
- Menetapkan Konfigurasi Akademik, Setup Semester Baru, Tahun Ajaran, Fakultas, Gedung, Ruangan, Data Tendik, Wizard Prodi + Kelas, dan Penempatan Mahasiswa ke Prodi sebagai halaman khusus Administrator Kampus.
- Memigrasikan templat bawaan BAAK ke skema izin versi 5 agar izin lama untuk konfigurasi periode, sarana, dan laporan pengajaran dicabut tanpa mengurangi Kalender Akademik, monitoring mutu, kurikulum, jadwal, serta data sivitas.

### Validasi rilis

- Versi aplikasi dinaikkan dari `1.11.3` ke `1.11.4` pada `VERSION`, `frontend/package.json`, `frontend/package-lock.json`, dan `frontend-pmb/package.json`.
- Templat hak akses bawaan BAAK dimigrasikan otomatis ke skema izin versi 5 saat backend dimulai.
- Regression test hak akses, kalender akademik, dan scope Dosen/Kaprodi lulus; unit test frontend serta production build juga berhasil.

## [1.11.3] — 2026-08-20

### Jadwal mengajar

- Memperketat validasi bentrok jadwal berdasarkan dosen, ruangan, hari, jam, tahun ajaran, dan semester yang sama.
- Kelas berstatus berakhir atau arsip tidak lagi memblokir penjadwalan kelas aktif.
- Saat terjadi bentrok, aplikasi menampilkan detail kelas yang bertabrakan dan hingga lima saran slot/ruangan alternatif yang dapat diterapkan langsung ke form.
- Filter halaman Jadwal Mengajar kini memulai dari semester aktif, bukan selalu semester Ganjil.

### Pembayaran PMB

- Admin PMB dapat mengunggah bukti transfer untuk pendaftar yang pembayarannya belum terdeteksi.
- Bukti admin dikaitkan ke transaksi pendaftaran atau pra-studi yang pending, atau membuat transaksi pending baru jika belum tersedia.
- Unggahan tidak otomatis melunasi pembayaran; transaksi tetap harus diverifikasi dan seluruh unggahan dicatat bersama nama admin, waktu, serta catatan pemeriksaan.

### Validasi rilis

- Versi aplikasi dinaikkan dari `1.11.2` ke `1.11.3` pada `VERSION`, `frontend/package.json`, `frontend/package-lock.json`, dan `frontend-pmb/package.json`.
- Regression test perlindungan bentrok jadwal dan alur upload bukti transfer admin PMB ditambahkan; production build frontend berhasil.

## [1.11.2] — 2026-08-20

### Semester aktif dan notifikasi

- Menjadikan semester aktif sebagai semester pilihan awal saat login atau reload pada dashboard Admin dan Mahasiswa, sehingga aplikasi tidak lagi memulai dengan seluruh semester.
- Membatasi daftar dan jumlah notifikasi berdasarkan semester yang sedang dipilih; notifikasi dari semester lama tidak ikut dimuat pada semester baru.
- Menyelaraskan aksi membaca satu atau seluruh notifikasi dengan semester yang sedang ditampilkan.

### Chat dan percakapan

- Memperbaiki pencarian kontak chat agar mendukung pencocokan sebagian, tidak peka huruf besar/kecil, berdasarkan nama, username, atau email.
- Memungkinkan pengguna Dosen menemukan kontak Mahasiswa maupun Dosen lain, dengan pengguna yang sudah dihapus tetap dikecualikan.
- Memperbaiki query PostgreSQL untuk field array `participant_ids`, sehingga percakapan yang sudah tersimpan tampil di daftar chat untuk pengirim dan penerima.
- Menambahkan badge jumlah pesan belum dibaca pada setiap percakapan, bukan jumlah seluruh pesan.
- Menyimpan waktu baca per pasangan pengguna; membuka percakapan menandai pesan sebagai sudah dibaca dan menghilangkan badge.
- Pesan baru yang diterima saat percakapan sedang terbuka langsung diperlakukan sebagai sudah dibaca.

### Validasi rilis

- Versi aplikasi dinaikkan dari `1.11.1` ke `1.11.2` pada `VERSION`, `frontend/package.json`, `frontend/package-lock.json`, dan `frontend-pmb/package.json`.
- Tidak ada migration SQL baru; indeks dan collection status baca chat dibuat otomatis saat backend dimulai.
- Regression test terkait semester, adapter PostgreSQL, pencarian chat, percakapan, dan status baca ditambahkan; production build frontend berhasil.

## [1.11.1] — 2026-08-20

### Role Tendik dan hak akses operasional

- Menambahkan **Tendik** sebagai role utama tersendiri (`staff`), terpisah dari Admin, Dosen, dan Mahasiswa.
- Menambahkan pengelolaan akun Tendik berupa daftar, tambah, edit, reset password, aktivasi/nonaktivasi, dan penghapusan akun.
- Menambahkan templat hak akses operasional untuk Tendik, termasuk **Operator Akademik**, **Staf Keuangan**, dan **Operator PMB**, tanpa memberikan hak Administrator Kampus secara otomatis.
- Menormalisasi variasi role lama seperti `tendik`, `staf`, dan `pegawai` menjadi role `staff`, serta menyiapkan pemetaan role Tendik pada integrasi SSO ketika SSO diaktifkan kembali.
- Memperbaiki akun Tendik yang baru dibuat agar langsung muncul pada daftar Tendik dan dapat menggunakan menu sesuai hak akses yang diberikan.
- Mengubah input **Jabatan / Fungsi** dan **Unit Organisasi** menjadi dropdown dari master database serta menambahkan validasi backend agar data kepegawaian konsisten.

### Login, branding, dan pratinjau tautan

- Mengubah judul login dari **Akses Masuk (nama aplikasi)** menjadi **Akses (nama aplikasi)**.
- Menampilkan singkatan/kode kampus pada bagian atas judul login, dengan nama resmi kampus tetap digunakan pada informasi institusi yang lebih lengkap.
- Menyelaraskan `title`, meta description, Open Graph, dan Twitter Card dengan nama aplikasi serta deskripsi yang disimpan pada Pengaturan Kampus.
- Menambahkan metadata dinamis pada respons HTML backend agar pratinjau tautan WhatsApp dan media sosial mengikuti konfigurasi aplikasi meskipun JavaScript belum dijalankan oleh crawler.

### Performa dan kecepatan navigasi

- Memisahkan halaman login ringan dari bundle aplikasi utama; halaman dashboard, grafik, master data, PMB, integrasi, dan modul lain dimuat secara bertahap sesuai kebutuhan.
- Mengubah pemuatan data admin menjadi per halaman sehingga tabel besar dan pengaturan integrasi tidak lagi diminta bersamaan saat dashboard pertama kali dibuka.
- Memuat pustaka pemindai QR hanya ketika kamera presensi digunakan.
- Menambahkan pagination 50 baris pada daftar Mahasiswa dan Dosen untuk mengurangi beban render DOM.
- Mengoptimalkan gambar hero login, mencegah gambar desktop diunduh pada perangkat mobile, mempercepat pemuatan font, dan menambahkan cache jangka panjang untuk aset build ber-hash.
- Ukuran bundle awal frontend turun dari sekitar **660 KB gzip** menjadi sekitar **66 KB gzip**.
- Audit Lighthouse lokal setelah optimasi menghasilkan skor **99 Mobile** dan **97 Desktop**, dengan Mobile LCP sekitar **1,8 detik** dan TBT sekitar **20 ms**.

### Validasi rilis

- Versi aplikasi dinaikkan dari `1.11.0` ke `1.11.1` pada `VERSION`, `frontend/package.json`, `frontend/package-lock.json`, dan `frontend-pmb/package.json`.
- Backend tetap membaca sumber versi dari file `VERSION`; endpoint `GET /api/version` akan menampilkan `1.11.1` setelah backend dimulai ulang.
- Versi skema database tetap `002_domain_tables`; tidak ada migration database baru pada rilis ini.
- Production build frontend utama dan portal PMB, pemeriksaan sintaks backend, smoke test browser, cache header aset, dan audit Lighthouse berhasil dijalankan.

## [1.11.0] — 2026-08-15

### CMS Landing Page PMB

- Menambahkan pengaturan foto landing page yang dapat dikelola Admin PMB tanpa mengubah kode.
- Menyediakan empat slot foto: hero utama, area masuk kampus, Learning Center, dan foto udara/arsitektur.
- Menambahkan preview foto, upload JPG/PNG/WEBP maksimal 10 MB, penanda foto bawaan atau kustom, serta opsi mengembalikan foto bawaan.
- Foto kustom yang diunggah dipakai bersama oleh landing page PMB di SIAKAD dan portal PMB mandiri.
- Menyelaraskan konfigurasi foto dengan CMS teks, CTA, statistik, konten, dan visibilitas section yang sudah tersedia.

## [1.10.0] — 2026-08-15

### PMB, import mahasiswa, dan migrasi ke SIAKAD

- Menambahkan normalisasi import mahasiswa baru dari Excel. Data hasil import tetap ditampilkan walaupun belum lengkap dan diberi penanda bahwa data berasal dari metode import.
- Menambahkan tindak lanjut manual Admin PMB untuk status pembayaran/lunas atau tunggakan beserta nominal tunggakan, input nilai akhir CBT dengan grade otomatis, serta generate SK secara manual.
- Menyelaraskan proses migrasi camaba menjadi mahasiswa aktif agar akun, Prodi, kelas, status akademik, dan data keuangan awal dapat diteruskan ke sistem utama secara aman.
- Menjadikan Prodi dan Kelas camaba dapat diubah oleh admin.
- Menambahkan proses wawancara setelah CBT, pengaturan jadwal wawancara oleh admin, pembangkitan link Google Meet pada jadwal, serta penampilan link kepada camaba pada hari wawancara.

### Keuangan kampus

- Menambahkan pengelolaan tagihan semester/UKT secara custom per mahasiswa maupun generate otomatis untuk seluruh mahasiswa.
- Menambahkan jenis tagihan bawaan **UKT** dan **GEDUNG**, serta kemampuan admin menambahkan jenis tagihan lain.
- Menambahkan pilihan Prodi pada generate tagihan agar nominal UKT dapat dibedakan per program studi.
- Menyelaraskan skema pembiayaan/BIPOT dengan master tahun ajaran dan Prodi dari database, termasuk catatan/panduan penggunaan pada menu keuangan.
- Merapikan tampilan halaman keuangan agar lebih informatif dan mudah digunakan.

### Akademik dan integrasi Neo Feeder

- Memastikan kelas tidak dapat dibuat atau diduplikasi apabila mata kuliah belum memiliki dosen pengampu yang valid.
- Menormalisasi penamaan rombel agar lebih jelas dan tidak membingungkan saat dikirim sebagai `nama_kelas_kuliah` ke Neo Feeder, misalnya menggunakan prefix Prodi dan nomor urut.
- Menambahkan penjelasan fungsi kode/nomor kelas dan penyelarasan perilaku penggunaan kelas lintas semester.

### Login, branding, dan navigasi

- Memperbarui copy halaman login menjadi **Akses Masuk**, label field menjadi **Username**, dan deskripsi layanan akademik sesuai identitas kampus/aplikasi.
- Menghapus teks internal `002_domain_tables` dari sidebar dan halaman login.
- Menambahkan catatan/panduan pada menu keuangan dan memperjelas beberapa istilah serta validasi pada form admin.

### Pemeliharaan data per semester

- Menambahkan menu **Bersihkan Data per Semester** pada menu Pemeliharaan Data.
- Admin dapat memilih semester dari master Tahun Ajaran, melihat ringkasan data terdampak, lalu menghapus data operasional semester seperti kelas, materi, tugas, nilai, presensi, KRS/KHS, tagihan, pembayaran, RPS, dan file terkait.
- Menambahkan konfirmasi berlapis dengan frasa `HAPUS SEMESTER` dan pengetikan ulang nama semester.
- Akun/profil mahasiswa, Prodi, mata kuliah, kurikulum, dosen, skema biaya, dan master semester tetap dipertahankan.

### Validasi rilis

- Versi aplikasi dinaikkan dari `1.9.1` ke `1.10.0` pada `VERSION`, `frontend/package.json`, `frontend/package-lock.json`, dan `frontend-pmb/package.json`.
- Versi backend tetap membaca sumber kebenaran dari `VERSION`; endpoint `GET /api/version` akan mengembalikan `1.10.0` setelah backend dimulai ulang.
- Versi skema PostgreSQL tetap `002_domain_tables`; tidak ada migration database baru.
- Production build frontend utama dan portal PMB berhasil, serta pengujian backend terkait pembaruan PMB/keuangan berhasil dijalankan.

## [1.9.1] — 2026-08-14

### Kelengkapan data fisik mahasiswa

- Menambahkan form upload kelengkapan data fisik pada halaman Profil mahasiswa untuk **Ijazah, Transkrip Nilai, KTP, KK, Akte, KIP-K, dan Surat Keterangan**.
- Menambahkan pengingat satu kali saat mahasiswa pertama kali login apabila dokumen fisik belum lengkap.
- Menyimpan status kelengkapan per jenis dokumen, mendukung penggantian/penghapusan dokumen, serta menampilkan status upload pada profil.
- Menambahkan backup otomatis ke Google Drive dengan struktur folder berdasarkan **angkatan**, termasuk status sinkronisasi dan fallback penyimpanan lokal jika Drive belum aktif.

### Kalender akademik dan deadline operasional

- Menyempurnakan pengaturan deadline **Setting Kurikulum (Kaprodi)**, **Pengisian RPS (Dosen)**, dan **Pengisian Nilai (Dosen)** dengan switch ON/OFF per agenda.
- Deadline aktif ditampilkan sebagai countdown pada dashboard sesuai peran pengguna, sedangkan deadline nonaktif tidak ditampilkan.

### Penyempurnaan tampilan mobile

- Memperbaiki form edit pertemuan pada halaman RPS agar proporsional di mode mobile dan tombol Simpan tetap mudah dijangkau.
- Merapikan layout halaman **Kurikulum & Dosen MK** pada layar mobile.
- Merapikan layout halaman **Profil** pada layar mobile.

### Import mahasiswa baru dan format NIM

- Memperbaiki pembacaan template Excel agar kolom `nama` dan kolom wajib lain dikenali secara konsisten.
- Memperbaiki error Network Error saat proses import mahasiswa valid.
- Menyesuaikan pembentukan NIM menjadi **tahun ajaran + kode prodi + nomor unik**, misalnya `2627020001`.
- Menyediakan template import resmi pada path publik frontend.

### Branding aplikasi dan landing page PMB

- Menambahkan form upload untuk **logo aplikasi utama** dan **logo landing page PMB** pada Pengaturan Kampus.
- Memperbaiki akses file logo PMB agar tidak lagi gagal dengan error `API route not found` atau `403`.
- Menampilkan logo PMB dengan rasio asli, tanpa kotak/background putih, dan menggunakan PNG transparan.
- Header PMB menggunakan logo saja ketika logo sudah tersedia; nama kampus dan gelombang hanya menjadi fallback ketika logo belum diunggah.
- Footer PMB menggunakan nama kampus lengkap dari Pengaturan Kampus.
- Menetapkan identitas header PMB menggunakan Singkatan/Kode PT, serta menampilkan label gelombang tanpa tahun akademik pada bagian brand header.
- Menyamakan perilaku branding pada frontend utama dan portal PMB mandiri.

### Validasi rilis

- Versi aplikasi dinaikkan dari `1.9.0` ke `1.9.1` pada `VERSION`, `frontend/package.json`, `frontend/package-lock.json`, dan `frontend-pmb/package.json`.
- Production build frontend utama dan portal PMB mandiri berhasil.
- Verifikasi browser mengonfirmasi logo PMB termuat, header menampilkan logo saja saat tersedia, dan footer menampilkan nama kampus lengkap.

## [1.9.0] — 2026-08-13

### Deadline operasional kalender akademik

- **Deadline Per Semester**: Menambahkan pengaturan tanggal dan waktu untuk Setting Kurikulum (Kaprodi), Pengisian RPS (Dosen), dan Pengisian Nilai (Dosen) pada halaman Kalender Akademik.
- **Switch ON/OFF**: Setiap deadline dapat diaktifkan atau dinonaktifkan secara terpisah. Deadline aktif otomatis menjadi agenda kalender, sedangkan deadline nonaktif tidak ditampilkan kepada pengguna.
- **Countdown Berbasis Peran**: Dashboard Kaprodi menampilkan countdown Setting Kurikulum; dashboard Dosen menampilkan countdown Pengisian RPS dan Pengisian Nilai. Akun Kaprodi yang juga mengajar tetap memperoleh deadline Dosen yang relevan.
- **Kontrol Operator Akademik**: Pengaturan hanya dapat diubah oleh Administrator Kampus atau akun dengan akses Operator Akademik, dan tersimpan terpisah untuk setiap Tahun Ajaran/Semester.

### Analisis dan quality assurance Program Studi

- **Analisis Mahasiswa Prodi**: Menambahkan dashboard Kaprodi untuk menganalisis seluruh mahasiswa dalam scope program studi berdasarkan kehadiran, nilai, pengumpulan tugas, aktivitas login, serta faktor dan skor risiko akademik. Tersedia distribusi risiko, daftar prioritas tindak lanjut, ringkasan per kelas, pencarian, filter risiko, dan detail individual mahasiswa.
- **Analisis & Approval RPS Prodi**: Menambahkan dashboard mutu RPS seluruh mata kuliah yang aktif pada periode pilihan, termasuk kelengkapan 16 pertemuan, ketersediaan dokumen, status draft/menunggu/disetujui/perlu revisi, catatan review, serta aksi approval atau pengembalian RPS oleh Kaprodi.
- **Konsistensi Selector Semester**: Seluruh ringkasan analisis mahasiswa, progres nilai, analisis RPS, dan total mata kuliah mengikuti Tahun Ajaran/Semester pada selector header. Total mata kuliah RPS dihitung dari mata kuliah yang benar-benar dibuka pada periode tersebut, bukan seluruh master mata kuliah lintas semester.
- **Scope Program Studi Terproteksi**: Endpoint analisis memvalidasi penugasan Kaprodi/Sekprodi dan membatasi mahasiswa, kelas, nilai, presensi, serta RPS hanya pada program studi yang menjadi kewenangannya.

### Hak akses dan kewenangan Kaprodi

- **Katalog Modul Terkini**: Menambahkan modul `Progres Nilai Prodi`, `Analisis Mahasiswa Prodi`, dan `Analisis & Approval RPS Prodi` pada halaman Hak Akses beserta matriks izin dan templat jabatan terkait.
- **Pemisahan Dokumen Akademik**: Memecah modul lama `Dokumen SK Akademik` menjadi `SK Mengajar Dosen` dan `SK Jabatan Akademik Dosen`, dengan kompatibilitas terhadap matriks hak akses versi lama.
- **Pembatasan SK Jabatan Dosen**: Menghapus akses Kaprodi/Sekprodi terhadap halaman dan seluruh endpoint **SK Jabatan Akademik Dosen**. Modul tersebut kini hanya dapat diakses oleh Administrator Kampus, sementara akses SK Mengajar tetap tersedia sesuai kewenangan.
- **Penjelasan Role Struktural**: Memperjelas pada halaman Hak Akses bahwa Kaprodi/Sekprodi tetap menggunakan role utama Dosen dan memperoleh akses tambahan melalui templat jabatan struktural.

### Import mahasiswa baru setelah proses PMB

- **Import Excel Mahasiswa Baru**: Menambahkan menu pada Admin PMB untuk mengunggah data mahasiswa baru setelah seluruh proses PMB selesai, lengkap dengan preview, validasi per baris, pilihan Prodi default, password default, dan import hanya untuk baris valid.
- **Pembuatan Akun & NIM Otomatis**: Import membuat akun mahasiswa SIAKAD yang siap dipakai untuk analisis akademik. Jika NIM kosong, sistem membentuk NIM berdasarkan periode akademik aktif, kode program studi, dan nomor urut yang belum digunakan.
- **Template Excel Resmi**: Menyediakan `template-import-mahasiswa-baru.xlsx` dengan kolom dan contoh data yang sesuai kontrak import.
- **Perbaikan Link Template**: Tombol unduh menggunakan path publik frontend sehingga pada development mengarah ke `http://localhost:3000/templates/template-import-mahasiswa-baru.xlsx`, bukan port backend `8000`.

### Stabilitas autentikasi, reload, dan chat

- **Pemulihan Sesi Kedaluwarsa**: Saat reload dengan token yang sudah tidak valid, aplikasi membersihkan token dan data pengguna secara otomatis lalu kembali ke halaman login dengan satu pesan yang mudah dipahami.
- **Pencegahan Error Berantai Chat**: Request kontak, dosen, percakapan, pengiriman pesan, serta koneksi WebSocket mengenali respons sesi tidak valid dan berhenti tanpa memunculkan toast `Sesi tidak ditemukan` dan `Daftar chat gagal dimuat` secara bersamaan.
- **Konsistensi Admin/Dosen/Mahasiswa**: Penanganan sesi diterapkan pada shell dashboard admin/dosen, ruang mahasiswa, dan widget chat.

### SEO dan Pengaturan Kampus

- **Custom Meta Description**: Menambahkan kolom Meta Description Aplikasi pada halaman Pengaturan Kampus dengan penghitung maksimal 320 karakter dan rekomendasi panjang 120–160 karakter.
- **Metadata Publik Dinamis**: Meta description disimpan di `app_settings`, dikirim melalui endpoint pengaturan publik, dan diterapkan ke `meta[name="description"]`, `og:description`, serta `twitter:description`.
- **Fallback SEO & Bahasa Dokumen**: Menambahkan metadata fallback pada HTML awal dan menetapkan bahasa dokumen menjadi Bahasa Indonesia agar halaman tetap memiliki deskripsi sebelum konfigurasi publik selesai dimuat.

### Penyempurnaan PDDIKTI Feeder

- Mengecualikan mahasiswa nonaktif, keluar, drop out, dan lulus dari preview penulisan data aktif ke Feeder.
- Menambahkan fallback jenis evaluasi dan rencana 16 minggu pertemuan untuk mencegah kegagalan dependensi pada penugasan dosen kelas lama.

### Validasi rilis

- Versi aplikasi dinaikkan dari `1.8.3` ke `1.9.0` sebagai rilis minor karena menambahkan beberapa modul dan alur kerja baru.
- Metadata versi disinkronkan pada `VERSION`, `frontend/package.json`, `frontend/package-lock.json`, dan `frontend-pmb/package.json`.
- Sebanyak **14 regression test** untuk import mahasiswa PMB, matriks hak akses, dan parser RPS berhasil dijalankan.
- Seluruh modul backend yang berubah lulus pemeriksaan kompilasi Python, dan production build frontend SIAKAD serta portal PMB berhasil menggunakan versi `1.9.0`.
- Tidak ada migration skema PostgreSQL baru; versi skema tetap `002_domain_tables`.

## [1.8.3] — 2026-08-13

### Fitur Progres Nilai Prodi (Kaprodi), Cetak TTD Digital Dosen & Ekspor Excel

- **Halaman Monitoring Progres Nilai Prodi**: Membangun modul `ProgresNilaiProdiComponents.jsx` untuk Ketua Program Studi (Kaprodi), Sekretaris Prodi, dan Dosen Pengampu yang menyajikan ringkasan 5 metrik real-time (*Total Kelas MK, Progres Input Nilai %, Mahasiswa Dinilai vs Terdaftar, Kelas Finalized, dan Kelas Dalam Proses*), pilihan tampilan Grid Kartu / Tabel Detail, visual progress bar, serta sebaran distribusi nilai huruf (*A, B, C, D, E*).
- **Sinkronisasi Otomatis Selector Header & Scope Prodi**: Menyelaraskan filter data secara otomatis dengan *Selector Tahun Ajaran / Semester* di header navigasi utama dan mengunci *scope* kelas berdasarkan penugasan Program Studi jabatan akademik pengguna tanpa memerlukan filter redundan di body.
- **Ekspor Rekapitulasi Excel (.xlsx)**: Menambahkan endpoint backend `GET /api/v1/krs/progres-nilai/export.xlsx` untuk mengunduh rekapitulasi nilai mahasiswa per program studi maupun per kelas tertentu lengkap dengan komponen nilai tugas, UTS, UAS, nilai akhir, predikat, dan status.
- **Cetak Lembar Pengesahan Nilai Ber-Tandatangan Digital Dosen**: Menambahkan fitur cetak dokumen resmi format A4 (`POST /api/v1/krs/progres-nilai/cetak`) ber-**Kop Surat Resmi Kampus**, tabel rekapitulasi nilai mahasiswa, serta **Blok Pengesahan Tandatangan Digital Dosen Pengampu** lengkap dengan badge *DIGITAL SIGNATURE VERIFIED*, token unik validasi dokumen, dan identitas NIDN/NIP Dosen.
- **QR Code Scannable & Verifikasi Dokumen Publik**: Mengintegrasikan generator QR Code beresolusi tinggi via pustaka `segno` dan endpoint verifikasi publik `GET /api/v1/krs/progres-nilai/validasi/{token}` ber-badge hijau *VALID / TERVERIFIKASI* yang dapat dipindai oleh publik tanpa autentikasi.
- **Modal Detail Nilai & Pencarian Mahasiswa**: Menyediakan modal peninjau nilai per mahasiswa, persentase bobot komponen penilaian (*Tugas, UTS, UAS*), filter pencarian nama/NIM mahasiswa, serta indikator kelengkapan nilai mahasiswa.
- **Penyempurnaan Otorisasi Dosen & Robust Exception Handling**: Mengoptimalkan fungsi dependensi `require_admin_or_kaprodi_krs` di `krs_khs.py` agar ramah terhadap peran dosen/kaprodi/sekprodi/admin, membungkus konversi nilai mahasiswa dengan blok pengamanan `try/except`, serta menyelaraskan resolusi URL API backend.

### Validasi rilis

- Versi aplikasi dinaikkan dari `1.8.2` ke `1.8.3`.
- Backend router `krs_khs.py` dan `server.py` lulus uji kompilasi dan sintaks Python tanpa error.
- Metadata versi pada `VERSION`, `frontend/package.json`, dan `frontend-pmb/package.json` tersinkronisasi.

## [1.8.2] — 2026-08-13

### Fitur PMB, Grade CBT, Isolasi Cetak SK, Histori Pembayaran & Kredensial SIAKAD

- **Pengaturan Grade CBT & Analisis Hasil Instan**: Menambahkan pengaturan rentang nilai (Grade Range A/B/C/D) di Admin PMB Hub (`AdminPmbHub.jsx`), otomatisasi `determine_cbt_grade` di backend `pmb.py`, serta kartu informasi Grade hasil seleksi CBT pada portal calon mahasiswa.
- **Prefix NIM Berdasarkan Tahun Ajaran**: Menyesuaikan penomoran NIM pendaftar agar menggunakan prefix Tahun Ajaran (contoh: TA 2026/2027 menjadi prefix `2627`) dan menambahkan field kustomisasi Prefix Tahun Ajaran di Admin PMB Hub.
- **Jabatan Fungsional Koordinator PMB & QR Code Validasi**: Mengintegrasikan penandatangan SK dari penetapan jabatan Koordinator PMB (`db.jabatan_assignments`) secara otomatis, serta menampilkan perisai *Digital Signature Verified* dilengkapi **QR Code Scannable** untuk validasi keabsahan dokumen SK.
- **Format Tanggal Panjang Bahasa Indonesia**: Menerapkan format tanggal panjang Bahasa Indonesia resmi (contoh: *13 Februari 2027*) pada Tanggal Penetapan header dan Titi Mangsa penandatanganan dokumen SK Penerimaan.
- **Isolasi Layout Cetak SK (`@media print`)**: Memperbaiki pratinjau cetak `window.print()` sehingga seluruh elemen UI portal luar (banner referal, alur wizard, tombol navigasi) tersembunyi secara otomatis, dan hanya lembar fisik SK Penerimaan yang dicetak secara rapi & profesional.
- **Penyempurnaan Akses Alur 8 & Histori Pembayaran**: Memperbaiki validasi backend agar pendaftar yang telah menyelesaikan ujian seleksi/mempunyai Grade dapat langsung mengakses Alur 8 (Daftar Ulang), menambahkan **Card Status Lunas & Diverifikasi**, serta menampilkan **Tabel Histori Transaksi Pembayaran** (Uang Pra-Studi & Biaya Formulir) secara transparan.
- **Kredensial Login Portal Utama (SIAKAD) & Password Default `Mahasiswa1231!`**: Menampilkan Card Kredensial Login Sistem Utama SIAKAD pada Alur 9 (Step Akhir) yang memuat Username (NIM Resmi), Password Default (`Mahasiswa1231!`), Tautan URL Login, serta tombol akses instan ke portal mahasiswa.
- **Penguncian Otomatis Form Ukuran Jas Almamater (Section 8.2)**: Mengunci tombol pilihan ukuran jas (`S, M, L, XL, XXL, XXXL`) dan input catatan khusus secara otomatis setelah data ukuran jas pernah disimpan oleh calon mahasiswa.

### Validasi rilis

- Versi aplikasi dinaikkan dari `1.8.1` ke `1.8.2`.
- Production build frontend utama (`frontend`) dan frontend PMB (`frontend-pmb`) compiled successfully tanpa error.
- Backend router `pmb.py` dan `server.py` berjalan bersih dan terverifikasi.

## [1.8.1] — 2026-08-13

### Upload dan ekstraksi RPS dari PDF/Word

- Mengganti input link/file PDF RPS resmi pada halaman RPS dengan form upload dokumen yang dapat mengekstrak data ke draft form RPS secara otomatis.
- Memperluas format yang didukung menjadi PDF, DOCX/Word modern, dan DOC Word lama apabila converter LibreOffice tersedia di server.
- Memperbaiki ekstraksi tabel PDF dengan mempertahankan posisi kolom, sehingga seluruh 16 pertemuan termasuk UTS dan UAS dapat terbaca pada template RPS yang sesuai.
- Menambahkan ringkasan hasil ekstraksi, peringatan field yang belum terbaca, validasi ukuran maksimal 20 MB, serta penyimpanan dokumen RPS resmi.
- Menambahkan pembatasan akses dokumen RPS agar mahasiswa hanya dapat mengakses dokumen dari kelas yang diikutinya.

### Validasi rilis

- Menambahkan regression test parser untuk DOCX dan PDF layout.
- Lima test parser RPS berhasil.
- Production build frontend utama berhasil.
- Backend dan frontend smoke test lokal berhasil.

## [1.8.0] — 2026-08-12

### Skema Pembayaran Custom, Approval Admin & Visual Dashboard PMB

- **Pembayaran Custom Fleksibel**: Menambahkan skema pembayaran nominal custom/DP untuk pendaftaran dan uang pra-studi/her-registrasi, lengkap dengan pembuat kode bayar unik dinamis.
- **Wajib Approval Admin**: Mengubah validasi pembayaran pendaftaran dan her-registrasi agar mewajibkan persetujuan (*approval*) dari Admin PMB sebelum berstatus terbayar (*verified*).
- **Histori & Sisa Kurang Bayar**: Menambahkan modal histori pembayaran dan pelacakan sisa kurang bayar pendaftar pada dashboard Admin PMB (`AdminPmbHub.jsx`).
- **Penataan Ulang Layout Tabel Admin**: Merestrukturisasi baris filter dan tabel calon mahasiswa dengan responsive grid layout, visual contrast tinggi, dan tombol aksi yang simetris & proporsional.
- **Interactive Proof Preview Modal**: Menambahkan modal pop-up peninjau dokumen/gambar bukti transfer secara langsung di dalam aplikasi tanpa memaksa unduhan (*force download*).
- **Stabilitas Frontend**: Memperbaiki error sintaks JSX pada `AdminPmbHub.jsx` dan `CamabaPortal.jsx` serta mengimpor modul `resolveMediaUrl`.

### Validasi rilis

- Suite pengujian unit backend (`backend/tests/test_pmb_flows.py`) lulus 100% (16/16 test suites passing).
- Versi rilis dinaikkan ke `1.8.0`.

## [1.7.2] — 2026-08-12

### Penyempurnaan PMB dan autentikasi

- Memperbaiki formulir PMB agar pilihan program studi tampil dan pilihan sekolah asal mengisi nama, NPSN, serta alamat sekolah dengan benar.
- Menambahkan validasi nama sekolah asal agar submit tidak gagal dengan pesan `String should have at least 3 characters` ketika data sekolah sudah dipilih.
- Menyederhanakan login utama dengan menghapus keterangan dan jalur login peserta PMB karena sudah tersedia pada portal PMB tersendiri.
- Menambahkan switch admin untuk mengaktifkan atau menonaktifkan program referal secara operasional.
- Menambahkan switch terpisah untuk menampilkan atau menyembunyikan kampanye referal pada landing page PMB.
- Menyelaraskan endpoint publik agar kode referal dan pendaftaran promotor baru tidak diproses saat program referal dinonaktifkan.

### Validasi rilis

- Production build frontend utama berhasil.
- Production build frontend PMB mandiri berhasil.
- Backend berhasil melewati pemeriksaan sintaks Python.
- Smoke test landing page PMB dan endpoint konfigurasi publik berhasil.

## [1.7.1] — 2026-08-11

### Identitas visual kampus pada PMB dan login utama

- Menambahkan aset foto resmi Politeknik SCI ke kedua aplikasi frontend: fasad utama, area masuk kampus, Learning Center, dan sudut aerial kampus.
- Memperbarui hero landing page PMB menjadi layout editorial berbasis foto kampus dengan kolase visual, label identitas **Politeknik SCI · Kampus Masa Depan**, dan konteks fasilitas/ruang belajar.
- Menyamakan pembaruan pada route PMB di SIAKAD dan portal PMB mandiri agar pengalaman identitas kampus konsisten.
- Memperbarui halaman login utama dengan foto fasad kampus, detail arsitektur, copy Portal Akademik Terpadu, dan penyebutan nama kampus pada panel autentikasi.
- Menandai versi aplikasi utama dan portal PMB mandiri menjadi `1.7.1`; versi backend dibaca terpusat dari file `VERSION`.

### Validasi rilis

- Production build frontend utama berhasil.
- Production build frontend PMB mandiri berhasil.
- Pemeriksaan browser lokal mengonfirmasi empat foto kampus termuat pada landing page PMB, CTA hero tetap terlihat, dan layout mobile dapat dirender.

## [1.7.0] — 2026-08-11

### Tata kelola akademik, jabatan, dan hak akses

- Menata ulang sidebar Admin dan ruang kerja pengguna menjadi kelompok menu yang lebih jelas, serta memperbarui panduan dan batas wewenang sesuai role utama dan jabatan struktural aktif.
- Menambahkan katalog **Modul Sistem**, templat hak akses, serta penerapan akses turunan dari penunjukan jabatan akademik. Role utama akun tetap utuh; Kaprodi, Akademik/BAAK, Keuangan, PMB, dan pimpinan memperoleh wewenang tambahan sesuai penugasan.
- Menambahkan sinkronisasi scope prodi dari penunjukan jabatan yang sudah ada, termasuk saat layanan dimulai setelah migrasi. Penunjukan aktif kini mengalahkan field profil OLD-SIAKAD yang lama.
- Memperbaiki pembatasan Data Mahasiswa pada ruang Dosen: Kaprodi hanya melihat mahasiswa pada prodi yang ditugaskan, sedangkan dosen non-Kaprodi hanya melihat mahasiswa di kelas yang diampu.
- Memperbaiki kasus data lama multi-prodi pada profil dosen. Scope efektif Syahrul Anwar sekarang mengikuti penugasan **Kaprodi RKJ-D4**, bukan daftar kode prodi lama.

### Data mahasiswa, dosen, dan migrasi OLD-SIAKAD

- Melengkapi detail serta formulir tambah/edit mahasiswa dengan field biodata, alamat, orang tua/wali, registrasi, pembiayaan, dan identitas PDDIKTI yang relevan dengan referensi OLD-SIAKAD.
- Menyelaraskan data dosen dan penugasan jabatan akademik agar dapat menjadi sumber role, scope prodi, serta daftar pejabat aktif.
- Menambahkan proses migrasi inkremental OLD-SIAKAD yang aman, termasuk preview, audit konflik, pengamanan data lokal yang lebih baru, dan rekonsiliasi data pembiayaan sebelum penerapan.
- Menyiapkan perilaku aman saat hierarki fakultas dinonaktifkan agar data program studi dan relasinya tetap terjaga.

### Keuangan dan PDDIKTI Feeder

- Melengkapi modul pembiayaan/UKT dan kompatibilitas data tagihan/pembayaran dari sistem lama, termasuk penanganan endpoint tagihan Keuangan Kampus.
- Memperluas halaman PDDIKTI Neo Feeder menjadi layout penuh, dengan konfigurasi koneksi, pengujian koneksi, auto-sync, serta panel preview migrasi OLD-SIAKAD yang lebih informatif.

### Kalender, dashboard, dan pengalaman pengguna

- Mengubah Kalender Akademik menjadi pusat kontrol kegiatan akademik kampus: agenda dapat dikelola, dipublikasikan sesuai sasaran pengguna/prodi, dan tampil bersama deadline tugas mahasiswa.
- Dashboard kini menampilkan role tambahan dari jabatan aktif, misalnya Kaprodi atau Staf Akademik, agar konteks kewenangan pengguna lebih jelas.
- Seluruh ringkasan dashboard dan data semester mengikuti semester yang dipilih pada selector header, termasuk kelas, mahasiswa, aktivitas, serta rekap terkait.

### Validasi rilis

- Menambahkan pengujian untuk normalisasi scope prodi data lama dan prioritas scope dari penunjukan jabatan aktif.
- Pemeriksaan backend, build frontend, dan verifikasi API pembatasan mahasiswa Kaprodi berhasil.
- Tidak ada migration skema PostgreSQL baru; versi skema tetap `002_domain_tables`.

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
