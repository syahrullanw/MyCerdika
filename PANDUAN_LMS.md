# Panduan alur LMS

Panduan ini berlaku untuk aplikasi versi `1.0.8` atau lebih baru. Panduan ringkas yang sama tersedia dari menu **Panduan LMS** pada akun admin, dosen, dan mahasiswa.

## Status kelas

| Status | Aktivitas belajar | Penilaian | Perubahan data | Tujuan |
| --- | --- | --- | --- | --- |
| Aktif | Mahasiswa dapat masuk setelah di-ACC, membaca materi, berdiskusi, dan mengumpulkan tugas | Dosen dapat menilai dan meminta revisi | Diizinkan sesuai hak akses | Semester sedang berjalan |
| Berakhir | Permintaan masuk, perubahan anggota, materi/tugas baru, diskusi baru, dan submission baru ditutup | Dosen masih dapat menyelesaikan nilai | Konfigurasi pembelajaran dikunci | Masa penyelesaian nilai |
| Nilai difinalisasi | Riwayat tetap dapat dilihat | Nilai dan bobot terkunci dalam snapshot | Read-only | Rekap resmi selesai |
| Arsip | Riwayat tetap dapat dilihat dan diekspor | Tidak dapat diubah | Read-only | Penyimpanan histori semester |

Kelas lama tidak dipakai ulang sebagai kelas aktif. Gunakan tombol **Periode baru** untuk membuat kelas kosong dengan mata kuliah dan dosen yang sama, tetapi tahun akademik, semester, serta kode kelas baru. Mahasiswa, materi, tugas, diskusi, dan submission lama tidak ikut disalin.

## Alur admin kampus

1. Buat **Program Studi**, lalu **Mata Kuliah**, kemudian **Kelas semester**.
2. Buat akun mahasiswa atau import Excel hanya bila diperlukan. Dosen tidak memiliki izin membuat/import akun mahasiswa.
3. Pantau permintaan masuk kelas dan konfigurasi sistem. Mahasiswa baru menjadi anggota setelah permintaan disetujui.
4. Pada akhir perkuliahan, pastikan dosen sudah selesai membuat materi/tugas, lalu gunakan **Akhiri**.
5. Pastikan setiap mahasiswa memiliki komponen nilai Tugas, UTS, dan UAS yang lengkap.
6. Gunakan **Finalisasi nilai**, lalu ketik `FINALISASI`. Sistem menyimpan snapshot bobot dan rekap nilai.
7. Export rekap PDF/Excel bila diperlukan, kemudian gunakan **Arsipkan**.
8. Ubah periode akademik aktif pada Settings dan gunakan **Periode baru** pada kelas lama. Ketik `DUPLIKASI` setelah memastikan target tahun/semester benar.

## Alur dosen

1. Buat kelas aktif atau gunakan kelas yang ditugaskan admin, lalu bagikan kode kelas.
2. Buka menu mahasiswa untuk melihat request. Periksa identitas, kemudian **Setujui** atau **Tolak**.
3. Dosen dapat menambahkan mahasiswa aktif yang sudah ada di katalog sistem; dosen tidak dapat membuat atau import akun mahasiswa baru.
4. Buat materi dan tugas hanya pada kelas aktif. Tentukan komponen nilai setiap tugas: Tugas, UTS, atau UAS.
5. Atur bobot mata kuliah bila diperlukan. Default sistem adalah Tugas 25%, UTS 35%, dan UAS 40%.
6. Nilai submission, berikan feedback, dan gunakan revisi hanya saat memang perlu membuka pengiriman ulang.
7. Akhiri kelas untuk menutup aktivitas belajar, tetapi lanjutkan penilaian sampai seluruh komponen lengkap.
8. Finalisasi dan arsipkan kelas. Untuk semester berikutnya, buat kelas periode baru dan lakukan approval mahasiswa kembali.

## Alur mahasiswa

1. Login menggunakan akun yang terdaftar, masukkan kode kelas, lalu konfirmasi pengiriman request.
2. Tunggu persetujuan dosen. Materi dan tugas kelas belum terlihat sebelum request disetujui.
3. Baca materi dan instruksi tugas, periksa deadline, format file, serta ukuran maksimal.
4. Pilih file dan tekan **Kumpulkan tugas**. Konfirmasi sekali lagi sebelum file dikirim.
5. Submission tidak dapat ditimpa. Pengiriman ulang hanya terbuka setelah dosen meminta revisi dan selama kelas masih aktif.
6. Lihat nilai dan feedback pada menu Nilai. Setelah kelas berakhir, histori tetap dapat dibaca tetapi aktivitas baru ditutup.
7. Pada semester berikutnya gunakan kode kelas baru dan ulangi proses request/approval.

## Tindakan yang wajib dikonfirmasi

Konfirmasi ditampilkan sebelum tindakan yang berdampak pada data atau alur pengguna, antara lain pembuatan/perubahan kelas, publikasi materi, pembuatan tugas, import mahasiswa, approval/reject enrollment, perubahan anggota, bobot/predikat nilai, penyimpanan nilai, permintaan revisi, pengumpulan tugas, perubahan periode, penutupan kelas, finalisasi, arsip, dan duplikasi periode baru.

Finalisasi dan duplikasi memiliki konfirmasi berlapis:

- Ketik `FINALISASI` untuk mengunci rekap dan bobot nilai.
- Ketik `DUPLIKASI` untuk membuat kelas kosong pada periode baru.

## Pemeriksaan sebelum finalisasi

- Tidak ada submission yang masih perlu dinilai.
- Setiap mahasiswa memiliki minimal satu nilai pada komponen Tugas, UTS, dan UAS.
- Bobot nilai sudah benar dan totalnya 100%.
- Identitas mahasiswa dan keanggotaan kelas sudah benar.
- Rekap telah diperiksa dan, bila perlu, diekspor sebagai PDF atau Excel.

Jika finalisasi ditolak oleh sistem, pesan akan menyebut mahasiswa yang komponen nilainya belum lengkap. Lengkapi nilai pada status **Berakhir**, lalu ulangi finalisasi.

## Catatan upgrade server

Setelah deployment versi baru:

1. Periksa endpoint `/api/version` dan pastikan versinya sesuai dengan file `VERSION`.
2. Jalankan pemeriksaan backend dan build frontend seperti dijelaskan di `VERSIONING.md`.
3. Login sebagai admin, dosen, dan mahasiswa untuk memastikan menu **Panduan LMS** tampil.
4. Uji alur pada kelas percobaan: request → approval → submission → penilaian → berakhir → finalisasi → arsip → periode baru.
5. Jangan menghapus kelas historis untuk rollover. Arsipkan kelas lama dan buat kelas periode baru.

## Kelengkapan data fisik mahasiswa

Mahasiswa dapat mengunggah Ijazah, Transkrip Nilai, KTP, KK, Akta Kelahiran, KIP-K, dan Surat Keterangan dari menu **Profil**. Format yang diterima adalah PDF, JPG, JPEG, PNG, atau WEBP dengan batas default 10 MB per file (`PHYSICAL_DOCUMENT_MAX_FILE_MB`).

Pada login pertama setelah fitur ini aktif, mahasiswa yang belum lengkap akan melihat pengingat dan tombol menuju Profil. Pengingat hanya ditampilkan sekali; status kelengkapan tetap dapat dilihat dan diperbarui dari menu Profil.

Jika Google Drive sudah dikonfigurasi melalui menu admin, setiap file disinkronkan otomatis ke struktur:

`[Folder Drive Utama] / Kelengkapan Data Fisik / [Angkatan] / [NIM - Nama]`

Status **Menunggu sinkronisasi Drive**, **Tersimpan di Google Drive**, atau **Drive belum tersinkron** ditampilkan pada kartu dokumen. Pastikan folder Drive dibagikan ke email service account dengan akses Editor agar upload dapat berjalan.
