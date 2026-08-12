# Panduan migrasi dan sinkronisasi PDDikti Feeder

Panduan ini berlaku mulai aplikasi versi `1.4.0`. Tujuannya adalah memindahkan pembaruan terakhir dari OLD-SIAKAD ke SIAKAD baru, mencocokkannya dengan Feeder, lalu memproses perbedaan secara bertahap tanpa menebak sumber data.

> Versi `1.4.0` hanya mengizinkan penulisan sinkronisasi ke **Feeder Sandbox** melalui `/ws/sandbox2.php`. Pengiriman ke Feeder Live belum diaktifkan.

## Prinsip sumber data

Gunakan urutan pemeriksaan berikut ketika data berbeda:

1. **SIAKAD baru** adalah data operasional utama setelah migrasi.
2. **Ekspor OLD-SIAKAD terbaru** digunakan untuk memastikan apakah data SIAKAD baru sudah ikut termigrasi dengan benar.
3. **Feeder** digunakan sebagai pembanding pelaporan terakhir, bukan selalu sebagai sumber yang paling baru.
4. Data yang ada di SIAKAD/OLD tetapi belum ada di Feeder dapat merupakan input baru yang memang belum pernah disinkronkan.
5. Nilai yang kosong di Feeder tetapi sudah terisi di SIAKAD/OLD dapat merupakan nilai terbaru dari dosen.
6. Jangan memilih sumber hanya berdasarkan nilai yang lebih tinggi. Periksa identitas mahasiswa, mata kuliah, kelas, semester, dan waktu pembaruannya.

## Persiapan

Sebelum memulai:

- Pastikan login sebagai **Admin Kampus**.
- Pastikan semester yang diperiksa adalah **2025/2026 Genap**, kode PDDikti `20252`.
- Ambil backup PostgreSQL dan pastikan file backup dapat ditemukan.
- Pastikan ekspor OLD-SIAKAD yang dipakai adalah file terbaru.
- Buka **Sistem & Integrasi → PDDikti Feeder**.
- Pastikan mode menunjukkan **Sandbox / Dev** dan endpoint adalah `/ws/sandbox2.php`.
- Sebelum audit atau sinkronisasi Feeder, tekan **Uji Koneksi Feeder** dan pastikan profil perguruan tinggi berhasil dibaca.

Migrasi incremental OLD-SIAKAD ke SIAKAD baru tetap dapat dilakukan ketika Feeder tidak terhubung. Dalam kondisi tersebut, audit tiga arah ditunda dan aplikasi mempertahankan metadata Feeder yang sudah tersimpan.

Jangan mengaktifkan auto-sync selama proses rekonsiliasi awal.

## Tahap 1 — Migrasi incremental OLD-SIAKAD

1. Pada bagian **Migrasi Incremental OLD-SIAKAD**, pilih file ekspor JSON terbaru.
2. Tekan **Buat Preview Migrasi**.
3. Periksa enam kelompok hasil:

   - **Record baru**: belum ada di SIAKAD baru.
   - **Update aman**: data lokal belum berubah setelah baseline dan dapat diperbarui.
   - **Tidak berubah**: nilai OLD dan SIAKAD baru sudah sama.
   - **Lokal lebih baru**: SIAKAD baru berubah setelah baseline; jangan ditimpa otomatis.
   - **Konflik**: OLD dan SIAKAD baru sama-sama berubah; perlu pemeriksaan manual.
   - **Pembiayaan ditahan**: item BIPOT, tagihan, atau pembayaran tidak diterapkan otomatis karena hasil rekonsiliasi keuangan masih memiliki selisih.

4. Terapkan hanya perubahan berstatus aman.
5. Jika terdapat **lokal lebih baru** atau **konflik**, catat NIM/ID record dan periksa sumbernya sebelum melanjutkan.
6. Buat kembali preview migrasi sampai tidak ada update aman yang tertinggal.

Migrasi incremental tidak menghapus record Feeder dan tidak menulis ke Feeder. Master Fakultas selalu dipertahankan sebagai data referensi walaupun hierarki Fakultas sedang dinonaktifkan pada UI; saklar hanya mengubah cara struktur tersebut digunakan.

Jika Feeder tidak terhubung, preview akan menampilkan **Audit Feeder belum dijalankan**. Record baru dan update aman OLD → SIAKAD baru tetap dapat diterapkan; lanjutkan Tahap 2 setelah koneksi Feeder kembali tersedia.

### Rekonsiliasi pembiayaan

Preview juga memeriksa komponen BIPOT, skema tarif, tagihan mahasiswa, dan detail pembayaran OLD-SIAKAD. Jika jumlah `Dibayar` pada BIPOT mahasiswa tidak dapat dipasangkan dengan detail pembayaran, operasi pembiayaan diberi status **Pembiayaan ditahan**. Dalam kondisi ini:

1. Perubahan master dan akademik yang berstatus aman masih boleh diterapkan.
2. Jangan memaksa impor keuangan; catat nominal dan identitas transaksi dari preview.
3. Perbaiki atau validasi sumber OLD-SIAKAD, lalu unggah ekspor terbaru untuk membuat preview baru.
4. Pembiayaan hanya akan masuk ke jalur incremental ketika tidak ada pengecualian rekonsiliasi.

## Tahap 2 — Audit tiga arah semester

1. Isi kode semester `20252` pada bagian **Audit Data Semester**.
2. Tekan **Cocokkan dengan Feeder**.
3. Periksa ringkasan kelas, peserta, nilai, AKM, dan dosen.
4. Gunakan hasil audit untuk menjawab:

   - Apakah record hanya ada di SIAKAD?
   - Apakah record hanya ada di Feeder?
   - Apakah kedua sistem memiliki nilai berbeda?
   - Apakah OLD-SIAKAD mendukung nilai yang ada di SIAKAD baru?

Audit bersifat read-only dan aman dijalankan berulang kali.

## Tahap 3 — Membuat preview sinkronisasi

Tekan **Buat Preview Sinkronisasi** setelah migrasi incremental selesai. Status yang muncul memiliki arti berikut:

| Status | Arti | Tindakan |
| --- | --- | --- |
| Siap dikirim | Identitas dan dependensi lengkap serta tidak ada konflik isi | Dapat dikirim ke sandbox dalam batch kecil |
| Perlu persetujuan | Kedua sistem berbeda atau terdapat kondisi yang tidak boleh ditebak | Bandingkan dua kolom dan pilih keputusan manual |
| Terblokir dependensi | ID mahasiswa, registrasi, kelas, peserta, atau kemampuan endpoint belum tersedia | Selesaikan dependensi; jangan dipaksa |
| Sudah diselesaikan | Admin memilih mempertahankan Feeder untuk keadaan data tersebut | Tidak ada penulisan; akan terbuka lagi bila data berubah |

Preview tidak mengubah SIAKAD maupun Feeder.

## Tahap 4 — Urutan pemeriksaan yang disarankan

Gunakan urutan berikut agar data anak tidak diproses sebelum data induknya:

1. Mahasiswa dan registrasi mahasiswa.
2. Mata kuliah serta relasi kurikulum.
3. Kelas kuliah.
4. Penugasan dosen.
5. Peserta kelas/KRS.
6. Nilai.
7. Aktivitas Kuliah Mahasiswa (AKM).

Jika sebuah record memiliki label **Terblokir dependensi**, selesaikan kategori induknya lalu buat preview baru.

## Matriks keputusan

| Kondisi | Keputusan yang disarankan |
| --- | --- |
| SIAKAD terisi, Feeder kosong | Gunakan SIAKAD → Sandbox bila operasi berstatus siap dan endpoint mendukung |
| SIAKAD dan Feeder sama | Tidak perlu tindakan |
| Keduanya kosong (`0`, `-`, atau `NULL`) | Tidak perlu tindakan |
| SIAKAD dan Feeder sama-sama terisi tetapi berbeda | Periksa OLD-SIAKAD dan sumber input terbaru; jangan setujui massal |
| SIAKAD kosong, Feeder terisi | Gunakan Feeder → SIAKAD hanya jika tombol impor aktif |
| Peserta hanya ada di Feeder | Periksa NIM, kelas, dan status KRS; pertahankan Feeder bila record memang sah |
| Peserta/nilai ganda | Cocokkan pasangan record secara manual; jangan tambah/hapus otomatis |
| Error Feeder `1178` | Hentikan kategori tersebut dan jangan mengulang batch besar |

## Arti tombol persetujuan

### Gunakan SIAKAD → Sandbox

- Menulis nilai yang terlihat pada kolom SIAKAD ke Feeder Sandbox.
- Hanya tersedia untuk kategori yang didukung, seperti AKM.
- Memerlukan pilihan data dan konfirmasi eksplisit.
- Untuk nilai perkuliahan, tombol masih dikunci karena error sandbox `1178`.

### Ambil Feeder → SIAKAD

- Hanya untuk nilai ketika SIAKAD benar-benar kosong dan Feeder memiliki nilai.
- Memperbarui KRS dan KHS lokal secara bersamaan.
- Tidak menulis ke Feeder.
- Tombol otomatis terkunci jika nilai SIAKAD sudah terisi atau nilai Feeder kosong.

### Pertahankan Feeder

- Tidak mengubah SIAKAD maupun Feeder.
- Menyimpan keputusan bahwa perbedaan tersebut telah diperiksa.
- Keputusan berlaku untuk keadaan nilai saat itu dan otomatis tidak berlaku bila salah satu sumber berubah.

### Kirim Batch ke Sandbox

- Hanya memproses operasi berstatus **Siap dikirim** pada kategori aktif.
- Maksimal 25 data per batch.
- Berhenti pada error pertama dan membaca ulang Feeder setelah proses.

## Cara memproses batch aman

1. Pilih satu kategori.
2. Mulai dengan 1–5 record, jangan langsung 25.
3. Periksa NIM, kode mata kuliah, kelas, semester, dan kedua kolom nilai.
4. Pilih record yang sumber kebenarannya sudah diketahui.
5. Tekan keputusan yang sesuai dan baca kembali dialog konfirmasi.
6. Setelah selesai, periksa **Riwayat eksekusi sandbox**.
7. Buat preview baru dan pastikan jumlah antrean berubah sesuai hasil.
8. Periksa record yang sama pada aplikasi Neo Feeder Sandbox.
9. Naikkan ukuran batch secara bertahap hanya bila beberapa batch awal konsisten.

## Lokasi pemeriksaan pada Neo Feeder

Nama menu dapat sedikit berbeda antar-versi Neo Feeder, tetapi umumnya:

- Mahasiswa: **Mahasiswa → Daftar Mahasiswa**.
- Kelas, peserta, dan nilai: **Perkuliahan → Kelas Kuliah**, lalu buka detail kelas.
- AKM: **Perkuliahan → Aktivitas Kuliah Mahasiswa**.
- Penugasan dosen: **Perkuliahan → Aktivitas Mengajar Dosen**.

Gunakan NIM, kode mata kuliah, nama kelas, dan semester sebagai kunci pemeriksaan. Jangan hanya mencari berdasarkan nama mahasiswa.

## Riwayat dan interpretasi hasil

Bagian **Riwayat eksekusi sandbox** mencatat:

- jenis keputusan;
- kategori;
- waktu dan pengguna;
- jumlah data;
- jumlah panggilan tulis Feeder;
- status selesai atau berhenti/gagal.

Keputusan **Pertahankan Feeder** dan **Feeder → SIAKAD** memiliki jumlah panggilan Feeder `0`. Hanya tindakan menuju sandbox yang menambah jumlah panggilan tulis Feeder.

## Kondisi wajib berhenti

Hentikan proses dan jangan menyetujui batch bila:

- mode atau endpoint bukan sandbox;
- profil perguruan tinggi gagal dibaca;
- semester bukan `20252`;
- identitas mahasiswa, kelas, atau mata kuliah tidak cocok;
- terdapat record ganda yang belum dipasangkan;
- nilai OLD-SIAKAD dan SIAKAD baru juga berbeda;
- jumlah SKS/IPK/IPS tampak tidak masuk akal;
- Feeder mengembalikan error `1178` atau error referensi/dependensi;
- hasil pembacaan ulang berbeda dari data yang baru dikirim.

## Checklist sebelum Feeder Live

Penulisan live belum tersedia pada versi ini. Sebelum fitur tersebut dibuka pada rilis berikutnya, pastikan:

- seluruh batch sandbox utama telah diverifikasi pada UI Neo Feeder;
- tidak ada konflik identitas atau pasangan kelas;
- endpoint nilai tidak lagi menghasilkan error `1178`;
- backup PostgreSQL terbaru tersedia dan dapat dipulihkan;
- riwayat batch sandbox sudah diperiksa;
- preview dibuat ulang setelah perubahan terakhir dari dosen/admin;
- terdapat persetujuan penanggung jawab pelaporan PDDikti;
- konfigurasi live dan credential tidak pernah dimasukkan ke changelog, log, atau repository.

## Ringkasan kondisi saat rilis 1.4.0

- Semester: `20252` — 2025/2026 Genap.
- Migrasi aman diterapkan: 923 update.
- Preview terbaru: 0 siap, 492 perlu persetujuan, 180 terblokir, 0 selesai.
- Penulisan sandbox berhasil: 29 operasi.
- Penulisan Feeder live: 0.
- Sinkronisasi nilai SIAKAD → Feeder: masih dikunci oleh error sandbox `1178`.

Angka preview dapat berubah setelah dosen mengisi nilai, admin memperbarui data, migrasi incremental baru dijalankan, atau Feeder berubah. Selalu gunakan preview terbaru sebagai acuan operasional.
