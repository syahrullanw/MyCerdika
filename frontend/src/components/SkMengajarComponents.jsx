/**
 * SkMengajarComponents.jsx
 * Persuratan Akademik — SK (Surat Keputusan) Mengajar Dosen.
 * Alur: rekap dosen pengampu per periode → generate SK (draft) →
 * finalisasi → cetak (format surat resmi + QR validasi).
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  Printer,
  CheckCircle2,
  Trash2,
  CalendarClock,
  Users,
  Eye,
  Loader2,
  Info,
  AlertCircle,
  Award,
  RefreshCw,
} from "lucide-react";

const API = (path, opt = {}) => {
  const base = API_BASE;
  const token = localStorage.getItem("elearn_token");
  return fetch(`${base}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opt,
  }).then((r) => r.json());
};

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") || window.location.origin;

const StatusBadge = ({ children, color = "blue" }) => {
  const map = {
    blue:   "bg-blue-100 text-blue-800",
    green:  "bg-emerald-100 text-emerald-800",
    yellow: "bg-yellow-100 text-yellow-800",
    red:    "bg-red-100 text-red-800",
    gray:   "bg-slate-100 text-slate-600",
    purple: "bg-purple-100 text-purple-800",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[color] || map.blue}`}>
      {children}
    </span>
  );
};

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
);

const Btn = ({ children, onClick, variant = "primary", size = "md", disabled = false, className = "" }) => {
  const base = "inline-flex items-center gap-1.5 rounded-lg font-medium transition-all focus:outline-none";
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-5 py-2.5 text-base" };
  const variants = {
    primary:   "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50",
    secondary: "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50",
    danger:    "bg-red-600 text-white hover:bg-red-700",
    success:   "bg-emerald-600 text-white hover:bg-emerald-700",
    ghost:     "text-slate-600 hover:bg-slate-100",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
};

const InfoBox = ({ children, variant = "info" }) => {
  const map = {
    info: "bg-blue-50 border-blue-200 text-blue-800",
    success: "bg-emerald-50 border-emerald-200 text-emerald-800",
    warn: "bg-amber-50 border-amber-200 text-amber-800",
    error: "bg-red-50 border-red-200 text-red-800",
  };
  return (
    <div className={`flex items-start gap-2 border rounded-lg px-3 py-2.5 text-sm ${map[variant]}`}>
      <span className="mt-0.5">{variant === "error" ? <AlertCircle className="w-4 h-4" /> : variant === "success" ? <CheckCircle2 className="w-4 h-4" /> : <Info className="w-4 h-4" />}</span>
      <div>{children}</div>
    </div>
  );
};

const esc = (v) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtTanggal = (v) => {
  if (!v) return "";
  const d = new Date(String(v).includes("T") ? v : `${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
};

const STATUS_META = {
  draft: { label: "Draft", color: "yellow" },
  final: { label: "Final", color: "green" },
};

export function SkMengajarPage() {
  const [tab, setTab] = useState("generate");
  const [tahunAjaranList, setTahunAjaranList] = useState([]);
  const [filterTa, setFilterTa] = useState("");
  const [filterSemester, setFilterSemester] = useState("Ganjil");
  const [dosenRekap, setDosenRekap] = useState([]);
  const [skList, setSkList] = useState([]);
  const [selected, setSelected] = useState({});
  const [searchQ, setSearchQ] = useState("");
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detailSk, setDetailSk] = useState(null);
  const [finalSk, setFinalSk] = useState(null);
  const [nomorInput, setNomorInput] = useState("");
  const [tanggalInput, setTanggalInput] = useState("");
  const [detailEdit, setDetailEdit] = useState({ nomor_sk: "", tanggal_sk: "" });
  const [masterReady, setMasterReady] = useState(false);
  const reqSeq = useRef(0);

  const loadMaster = useCallback(() => {
    API("/api/v1/master/tahun-ajaran")
      .then((d) => {
        if (!Array.isArray(d)) return;
        setTahunAjaranList(d);
        const active = d.find((t) => t.is_active) || d[0];
        if (active) {
          setFilterTa((prev) => prev || active.tahun || active.tahun_ajaran || "");
          setFilterSemester((prev) => prev || active.semester || "Ganjil");
        }
      })
      .finally(() => setMasterReady(true));
  }, []);

  useEffect(() => { loadMaster(); }, [loadMaster]);

  const loadRekap = useCallback(() => {
    setLoading(true);
    setError("");
    const seq = ++reqSeq.current;
    const p = new URLSearchParams();
    if (filterTa) p.set("tahun_ajaran", filterTa);
    if (filterSemester) p.set("semester", filterSemester);
    API(`/api/v1/sk-mengajar/rekap/dosen?${p.toString()}`)
      .then((d) => {
        if (seq !== reqSeq.current) return;
        if (Array.isArray(d)) {
          setDosenRekap(d);
          setSelected({});
        }
      })
      .catch((e) => {
        if (seq === reqSeq.current) setError(e?.message || "Gagal memuat rekap dosen");
      })
      .finally(() => {
        if (seq === reqSeq.current) setLoading(false);
      });
  }, [filterTa, filterSemester]);

  const loadSkList = useCallback(() => {
    setLoading(true);
    setError("");
    const seq = ++reqSeq.current;
    const p = new URLSearchParams();
    if (filterTa) p.set("tahun_ajaran", filterTa);
    if (filterSemester) p.set("semester", filterSemester);
    if (searchQ.trim()) p.set("q", searchQ.trim());
    API(`/api/v1/sk-mengajar?${p.toString()}`)
      .then((d) => {
        if (seq !== reqSeq.current) return;
        if (Array.isArray(d)) setSkList(d);
      })
      .catch((e) => {
        if (seq === reqSeq.current) setError(e?.message || "Gagal memuat daftar SK");
      })
      .finally(() => {
        if (seq === reqSeq.current) setLoading(false);
      });
  }, [filterTa, filterSemester, searchQ]);

  useEffect(() => {
    if (!masterReady) return;
    if (tab === "generate") loadRekap();
    else loadSkList();
  }, [tab, masterReady, loadRekap, loadSkList]);

  const tahunValues = [...new Set(tahunAjaranList.map((t) => t.tahun || t.tahun_ajaran || t.id))];

  const allChecked = dosenRekap.length > 0 && dosenRekap.every((d) => selected[d.dosen_id]);
  const checkedCount = dosenRekap.filter((d) => selected[d.dosen_id]).length;

  const toggleAll = () => {
    if (allChecked) setSelected({});
    else {
      const next = {};
      dosenRekap.forEach((d) => { next[d.dosen_id] = true; });
      setSelected(next);
    }
  };

  const toggleOne = (id) => setSelected((p) => ({ ...p, [id]: !p[id] }));

  const generateSk = async () => {
    const ids = dosenRekap.filter((d) => selected[d.dosen_id]).map((d) => d.dosen_id);
    if (!ids.length) {
      setError("Pilih minimal satu dosen");
      return;
    }
    setGenerating(true);
    setError("");
    setNotice("");
    try {
      const res = await API("/api/v1/sk-mengajar/generate", {
        method: "POST",
        body: JSON.stringify({ tahun_ajaran: filterTa, semester: filterSemester, dosen_ids: ids }),
      });
      if (!res || res.detail) {
        setError((res && res.detail) || "Gagal generate SK");
        return;
      }
      const dibuat = (res.created || []).length;
      setNotice(
        `${dibuat} SK berhasil dibuat (${(res.skipped || []).filter((s) => s.status).length} sudah ada). Isi nomor & tanggal surat pada detail SK, lalu finalisasi & cetak dari tab "Daftar SK".`
      );
      loadRekap();
    } catch (e) {
      setError(e?.message || "Gagal generate SK");
    } finally {
      setGenerating(false);
    }
  };

  const openFinalize = (sk) => {
    setFinalSk(sk);
    setNomorInput(sk.nomor_sk || "");
    setTanggalInput(sk.tanggal_sk || "");
    setError("");
  };

  const submitFinalize = async () => {
    const nomor = nomorInput.trim();
    const tanggal = tanggalInput.trim();
    if (!nomor) {
      setError("Nomor surat wajib diisi sebelum finalisasi.");
      return;
    }
    if (!tanggal) {
      setError("Tanggal penetapan wajib diisi sebelum finalisasi.");
      return;
    }
    const sk = finalSk;
    setBusyId(sk.id);
    setError("");
    try {
      const res = await API(`/api/v1/sk-mengajar/${sk.id}/final`, {
        method: "PUT",
        body: JSON.stringify({ nomor_sk: nomor, tanggal_sk: tanggal }),
      });
      if (!res || res.detail) {
        setError((res && res.detail) || "Gagal finalisasi");
        return;
      }
      setFinalSk(null);
      loadSkList();
    } catch (e) {
      setError(e?.message || "Gagal finalisasi");
    } finally {
      setBusyId("");
    }
  };

  const saveDetailEdit = async () => {
    const nomor = (detailEdit.nomor_sk || "").trim();
    const tanggal = (detailEdit.tanggal_sk || "").trim();
    if (!nomor) {
      setError("Nomor surat tidak boleh kosong.");
      return;
    }
    if (!tanggal) {
      setError("Tanggal penetapan tidak boleh kosong.");
      return;
    }
    setBusyId(detailSk.id);
    setError("");
    try {
      const res = await API(`/api/v1/sk-mengajar/${detailSk.id}`, {
        method: "PUT",
        body: JSON.stringify({ nomor_sk: nomor, tanggal_sk: tanggal }),
      });
      if (!res || res.detail) {
        setError((res && res.detail) || "Gagal menyimpan");
        return;
      }
      setDetailSk(res.sk);
      setNotice("Nomor & tanggal SK berhasil disimpan.");
      loadSkList();
    } catch (e) {
      setError(e?.message || "Gagal menyimpan");
    } finally {
      setBusyId("");
    }
  };

  const deleteSk = async (sk) => {
    if (!window.confirm(`Hapus draft SK ${sk.nomor_sk || "(belum bernomor)"} untuk ${sk.dosen?.nama}?`)) return;
    setBusyId(sk.id);
    setError("");
    try {
      const res = await API(`/api/v1/sk-mengajar/${sk.id}`, { method: "DELETE" });
      if (!res || res.detail) {
        setError((res && res.detail) || "Gagal menghapus SK");
        return;
      }
      loadSkList();
    } catch (e) {
      setError(e?.message || "Gagal menghapus SK");
    } finally {
      setBusyId("");
    }
  };

  const openDetail = async (sk) => {
    setBusyId(sk.id);
    setError("");
    try {
      const d = await API(`/api/v1/sk-mengajar/${sk.id}`);
      if (!d || d.detail) {
        setError((d && d.detail) || "Gagal memuat detail SK");
      } else {
        setDetailSk(d);
        setDetailEdit({ nomor_sk: d.nomor_sk || "", tanggal_sk: d.tanggal_sk || "" });
      }
    } catch (e) {
      setError(e?.message || "Gagal memuat detail SK");
    } finally {
      setBusyId("");
    }
  };

  const printSk = async (sk) => {
    setBusyId(sk.id);
    setError("");
    try {
      const res = await API(`/api/v1/sk-mengajar/${sk.id}/cetak`, {
        method: "POST",
        body: JSON.stringify({ validate_base_url: window.location.origin }),
      });
      if (!res || res.detail) {
        setError((res && res.detail) || "Gagal menyiapkan cetak");
        return;
      }
      buildPrintWindow(res);
    } catch (e) {
      setError(e?.message || "Gagal menyiapkan cetak");
    } finally {
      setBusyId("");
    }
  };

  const buildPrintWindow = (res) => {
    const sk = res.sk || {};
    const dosen = sk.dosen || {};
    const prodi = sk.prodi || {};
    const kop = res.kop || {};
    const penetap = sk.penetap || {};
    const mengetahui = sk.mengetahui || {};
    const kelas = sk.kelas || [];
    const namaLengkap = [dosen.gelar_depan, dosen.nama, dosen.gelar_belakang || dosen.gelar].filter(Boolean).join(" ");
    const lampiran = kelas
      .map(
        (k, i) => `<tr>
          <td class="c">${i + 1}</td>
          <td>${esc(k.course_code)}</td>
          <td>${esc(k.course_name)}<div class="sub">${esc(k.class_name || "")}</div></td>
          <td class="c">${esc(k.sks)}</td>
          <td>${esc(k.program_name)}</td>
          <td>${esc(k.schedule) || "—"}</td>
        </tr>`
      )
      .join("");
    const kota = kop.kota || "Kampus";
    const penetapDetail = [
      penetap.nip ? `NIP. ${penetap.nip}` : penetap.nidn ? `NIDN. ${penetap.nidn}` : "",
      [penetap.pangkat, penetap.golongan ? `(${penetap.golongan})` : ""].filter(Boolean).join(" "),
    ].filter(Boolean).join(" · ");
    const mengetahuiDetail = mengetahui.nip ? `NIP. ${mengetahui.nip}` : mengetahui.nidn ? `NIDN. ${mengetahui.nidn}` : "";
    const toSigner = (role, fallback) => {
      const s = (res?.signers || []).find((x) => x.role === role) || {};
      return {
        jabatan: s.jabatan || fallback.jabatan || "",
        nama: s.nama || fallback.nama || "",
        ident: s.ident || fallback.ident || "",
        qr: s.qr_png || "",
      };
    };
    const sigPenetap = toSigner("penetap", { jabatan: penetap.jabatan, nama: penetap.nama, ident: penetapDetail });
    const sigMengetahui = toSigner("mengetahui", { jabatan: mengetahui.jabatan, nama: mengetahui.nama, ident: mengetahuiDetail });
    const ttdBox = (s, prefix) => `
  <div class="ttd-box">
    ${prefix ? `<div class="jabatan">${esc(prefix)}<br />${esc(s.jabatan || "")}</div>` : `<div class="jabatan">${esc(s.jabatan || "")}</div>`}
    <img class="qr" src="${esc(s.qr)}" alt="QR TTD Elektronik" />
    <div class="nama">${esc(s.nama || "( .............................. )")}</div>
    <div class="detail">${esc(s.ident || "")}</div>
  </div>`;
    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>SK Mengajar ${esc(dosen.nama)}</title>
<style>
  body { font-family: "Times New Roman", Times, serif; color: #111; font-size: 12px; margin: 0; padding: 32px; background: #fff; }
  .kop { text-align: center; padding-bottom: 6px; }
  .kop .kop-img { width: 100%; object-fit: contain; display: block; }
  .kop .kop-img.header { margin-bottom: 6px; }
  .kop .instansi { font-size: 16px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
  .kop .alamat { font-size: 10.5px; margin-top: 2px; color: #333; }
  .kop .rule { border-bottom: 2px solid #000; margin-top: 6px; }
  .kop .rule2 { border-bottom: 1px solid #000; margin-top: 2px; }
  h2.judul { text-align: center; font-size: 13px; margin: 18px 0 2px; }
  .nomor { text-align: center; font-weight: 700; margin: 2px 0 6px; }
  .judul2 { text-align: center; font-weight: 700; margin: 6px 0 10px; }
  .body { line-height: 1.55; }
  .body p { margin: 6px 0; text-align: justify; }
  .daftar { margin: 0; padding-left: 22px; }
  .daftar li { margin: 4px 0; text-align: justify; }
  .body .indent { padding-left: 40px; }
  table.list { width: 100%; border-collapse: collapse; margin: 10px 0; }
  table.list th, table.list td { border: 1px solid #000; padding: 4px 6px; font-size: 11px; vertical-align: top; }
  table.list th { background: #f3f4f6; }
  .c { text-align: center; }
  .sub { color: #555; font-size: 10px; }
  .ttd-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; }
  .ttd-box { text-align: center; min-width: 240px; }
  .ttd-box .jabatan { font-size: 11px; margin-bottom: 8px; }
  .ttd-box .qr { width: 96px; height: 96px; margin: 6px auto; display: block; }
  .ttd-box .nama { font-weight: 700; text-decoration: underline; }
  .ttd-box .detail { font-size: 11px; margin-top: 2px; }
  .ttd-date { text-align: center; margin-top: 26px; font-size: 11px; }
  .foot { margin-top: 22px; font-size: 9.5px; color: #555; text-align: center; border-top: 1px solid #ddd; padding-top: 8px; }
  .foot .kop-img { width: 100%; object-fit: contain; display: block; margin-top: 8px; }
  @media print { body { padding: 10mm; } }
</style>
</head>
<body>
  <div class="kop">
    ${kop.header_url ? `<img class="kop-img header" src="${esc(new URL(kop.header_url, API_BASE).href)}" alt="kop" />` : ""}
    <div class="instansi">${esc(kop.instansi || "")}</div>
    <div class="alamat">${esc(kop.alamat || "")}</div>
    <div class="rule"></div><div class="rule2"></div>
  </div>

  <h2 class="judul">SURAT KEPUTUSAN ${esc((penetap.jabatan || "DIREKTUR").toUpperCase())} ${esc(kop.instansi || "")}</h2>
  <div class="nomor">NOMOR: ${esc(sk.nomor_sk || "")}</div>
  <div class="judul2">TENTANG PENUGASAN MENGAJAR DOSEN</div>
  <div class="judul2">SEMESTER ${esc(sk.semester || "")} TAHUN AKADEMIK ${esc(sk.tahun_ajaran || "")}</div>

  <div class="body">
    <p>${esc((penetap.jabatan || "DIREKTUR").toUpperCase())} ${esc(kop.instansi || "")},</p>
    <p>Menimbang:</p>
    <ol class="daftar">
      <li>bahwa untuk kelancaran proses belajar mengajar semester ${esc(sk.semester || "")} Tahun Akademik ${esc(sk.tahun_ajaran || "")}, perlu ditetapkan penugasan mengajar bagi dosen;</li>
      <li>bahwa dosen yang namanya tercantum dalam surat keputusan ini dipandang cakap dan memenuhi syarat untuk melaksanakan tugas mengajar;</li>
    </ol>
    <p>Mengingat:</p>
    <ol class="daftar">
      <li>Undang-Undang Republik Indonesia Nomor 14 Tahun 2005 tentang Guru dan Dosen;</li>
      <li>Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi tentang dosen dan pembelajaran;</li>
      <li>Kalender akademik ${esc(kop.instansi || "")} Semester ${esc(sk.semester || "")} Tahun Akademik ${esc(sk.tahun_ajaran || "")}.</li>
    </ol>
    <p>Memperhatikan: beban kerja dosen dan kesesuaian bidang keahlian pada penetapan mata kuliah.</p>
    <p>MEMUTUSKAN:</p>
    <p class="indent">Menetapkan:</p>
    <ol class="daftar">
      <li>Menugaskan Saudara <b>${esc(namaLengkap)}</b>, NIDN ${esc(dosen.nidn || "—")}${dosen.pangkat ? `, ${esc(dosen.pangkat)}${dosen.golongan ? ` (${esc(dosen.golongan)})` : ""}` : ""}${dosen.prodi_nama ? `, dosen ${esc(dosen.prodi_nama)}` : ""} sebagai dosen pengampu mata kuliah pada Semester ${esc(sk.semester || "")} Tahun Akademik ${esc(sk.tahun_ajaran || "")};</li>
      <li>Daftar mata kuliah beserta jumlah SKS yang diampu sebagaimana tercantum dalam Lampiran I surat keputusan ini merupakan bagian yang tidak terpisahkan;</li>
      <li>Segala biaya yang timbul akibat diterbitkannya Surat Keputusan ini dibebankan kepada anggaran yang bersangkutan;</li>
      <li>Surat Keputusan ini berlaku sejak tanggal ditetapkan sampai dengan berakhirnya Semester ${esc(sk.semester || "")} Tahun Akademik ${esc(sk.tahun_ajaran || "")} dan akan ditinjau kembali apabila terdapat kekeliruan;</li>
    </ol>

    <p class="c">LAMPIRAN I — DAFTAR MATA KULIAH PENGAMPUAN DOSEN</p>
    <p class="c">${esc(namaLengkap)} — Semester ${esc(sk.semester || "")} TA ${esc(sk.tahun_ajaran || "")}</p>
    <table class="list">
      <thead>
        <tr><th>No</th><th>Kode MK</th><th>Mata Kuliah</th><th>SKS</th><th>Prodi</th><th>Jadwal</th></tr>
      </thead>
      <tbody>${lampiran || `<tr><td colspan="6" class="c">Tidak ada mata kuliah.</td></tr>`}</tbody>
    </table>
  </div>

  <div class="ttd-row">
    ${ttdBox(sigMengetahui, "Mengetahui,")}
    ${ttdBox(sigPenetap, "")}
  </div>

  <div class="ttd-date">Ditetapkan di ${esc(kota)} pada tanggal ${esc(fmtTanggal(sk.tanggal_sk) || "......................")}</div>

  <div class="foot">Dokumen diterbitkan secara elektronik oleh Sistem Informasi Akademik. Tanda tangan pejabat menggunakan TTD Elektronik — keabsahannya dapat diverifikasi dengan memindai QR di atas nama masing-masing pejabat. ${sk.jumlah_mk ?? 0} mata kuliah (${sk.total_sks ?? 0} SKS) tercetak.
    ${kop.footer_url ? `<img class="kop-img" src="${esc(new URL(kop.footer_url, API_BASE).href)}" alt="kop" />` : ""}
  </div>
  <script>
    window.onload = function () { setTimeout(function () { window.print(); }, 300); };
  <\/script>
</body>
</html>`;
    const win = window.open("", "_blank", "width=1000,height=800");
    if (!win) {
      setError("Browser memblokir jendela cetak. Izinkan pop-up untuk halaman ini.");
      return;
    }
    win.document.write(html);
    win.document.close();
  };

  const periodeLabel = [filterSemester, filterTa].filter(Boolean).join(" ") || "Semua Periode";

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <FileText className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">SK Mengajar Dosen</h1>
            <p className="text-slate-500 text-sm">Persuratan akademik — penerbitan Surat Keputusan Penugasan Mengajar (lampiran BKD)</p>
          </div>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 gap-1">
          <button
            onClick={() => setTab("generate")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${tab === "generate" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            Generate SK
          </button>
          <button
            onClick={() => setTab("list")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${tab === "list" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            Daftar SK
          </button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <select
            value={filterTa}
            onChange={(e) => setFilterTa(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">Semua Tahun Ajaran</option>
            {tahunValues.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={filterSemester}
            onChange={(e) => setFilterSemester(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">Semua Semester</option>
            <option value="Ganjil">Ganjil</option>
            <option value="Genap">Genap</option>
          </select>
          {tab === "list" && (
            <input
              type="text"
              placeholder="Cari nomor SK / nama dosen..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              className="w-full lg:w-72 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          )}
          <div className="flex-1" />
          {tab === "generate" && (
            <Btn size="sm" onClick={loadRekap} variant="secondary">
              <RefreshCw className="w-3.5 h-3.5" /> Muat Ulang
            </Btn>
          )}
        </div>
      </Card>

      {error && <InfoBox variant="error">{error}</InfoBox>}
      {notice && <InfoBox variant="success">{notice}</InfoBox>}

      {tab === "generate" ? (
        <>
          <InfoBox variant="info">
            Menampilkan rekap dosen pengampu periode <strong>{periodeLabel}</strong>. Centang dosen lalu klik
            "Generate SK" untuk membuat draf SK Mengajar. Draf dapat difinalisasi (nomor terkunci) dan dicetak
            dengan QR validasi dari tab <strong>Daftar SK</strong>.
          </InfoBox>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" /> Dosen Pengampu Periode {periodeLabel}
              </div>
              <StatusBadge color="blue">{dosenRekap.length} Dosen</StatusBadge>
            </div>
            {loading ? (
              <div className="py-10 text-center text-slate-400 text-sm">Memuat data...</div>
            ) : dosenRekap.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">Belum ada dosen pengampu pada periode ini.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-2 w-8">
                        <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-indigo-600" />
                      </th>
                      <th className="py-2 pr-2">Dosen</th>
                      <th className="py-2 pr-2">Homebase</th>
                      <th className="py-2 pr-2 text-center">MK</th>
                      <th className="py-2 pr-2 text-center">SKS</th>
                      <th className="py-2">Status SK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dosenRekap.map((d) => {
                      const meta = STATUS_META[d.sk_status] || { label: "Belum", color: "gray" };
                      return (
                        <tr key={d.dosen_id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 pr-2">
                            <input
                              type="checkbox"
                              checked={Boolean(selected[d.dosen_id])}
                              onChange={() => toggleOne(d.dosen_id)}
                              className="accent-indigo-600"
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <div className="font-medium text-slate-800">{d.nama}</div>
                            <div className="text-xs text-slate-400">NIDN {d.nidn || "—"}</div>
                          </td>
                          <td className="py-2 pr-2 text-slate-600">{d.prodi_nama || "—"}</td>
                          <td className="py-2 pr-2 text-center text-slate-600">{d.jumlah_mk}</td>
                          <td className="py-2 pr-2 text-center text-slate-600">{d.total_sks}</td>
                          <td className="py-2">
                            <StatusBadge color={meta.color}>{meta.label}{d.sk_nomor ? ` · ${d.sk_nomor}` : ""}</StatusBadge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-end pt-4 gap-2">
              <Btn onClick={generateSk} disabled={generating || checkedCount === 0}>
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                {generating ? "Membuat SK..." : `Generate SK (${checkedCount})`}
              </Btn>
            </div>
          </Card>
        </>
      ) : (
        <>
          <InfoBox variant="info">
            Daftar SK Mengajar periode <strong>{periodeLabel}</strong>. SK <strong>Draft</strong> dapat dihapus;
            <strong> Final</strong> terkunci dan siap dicetak sebagai lampiran BKD.
          </InfoBox>
          <Card className="p-4">
            {loading ? (
              <div className="py-10 text-center text-slate-400 text-sm">Memuat data...</div>
            ) : skList.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">Belum ada SK pada filter ini. Generate terlebih dahulu.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-3">Nomor SK</th>
                      <th className="py-2 pr-3">Dosen</th>
                      <th className="py-2 pr-3">Prodi</th>
                      <th className="py-2 pr-3 text-center">MK</th>
                      <th className="py-2 pr-3 text-center">SKS</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Tanggal SK</th>
                      <th className="py-2 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skList.map((sk) => {
                      const meta = STATUS_META[sk.status] || { label: sk.status, color: "gray" };
                      return (
                        <tr key={sk.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 pr-3 font-medium text-slate-800">{sk.nomor_sk || <span className="text-slate-400">— belum bernomor</span>}</td>
                          <td className="py-2 pr-3">
                            <div className="text-slate-800">{sk.dosen?.nama}</div>
                            <div className="text-xs text-slate-400">NIDN {sk.dosen?.nidn || "—"}</div>
                          </td>
                          <td className="py-2 pr-3 text-slate-600">{sk.prodi?.nama || "—"}</td>
                          <td className="py-2 pr-3 text-center text-slate-600">{sk.jumlah_mk}</td>
                          <td className="py-2 pr-3 text-center text-slate-600">{sk.total_sks}</td>
                          <td className="py-2 pr-3"><StatusBadge color={meta.color}>{meta.label}</StatusBadge></td>
                          <td className="py-2 pr-3 text-slate-600">{fmtTanggal(sk.tanggal_sk) || "—"}</td>
                          <td className="py-2">
                            <div className="flex items-center justify-end gap-1.5">
                              <Btn size="sm" variant="secondary" onClick={() => openDetail(sk)} disabled={busyId === sk.id}>
                                <Eye className="w-3.5 h-3.5" /> Detail
                              </Btn>
                              <Btn size="sm" onClick={() => printSk(sk)} disabled={busyId === sk.id}>
                                <Printer className="w-3.5 h-3.5" /> Cetak
                              </Btn>
                              {sk.status === "draft" && (
                                <>
                                  <Btn size="sm" variant="success" onClick={() => openFinalize(sk)} disabled={busyId === sk.id}>
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Final
                                  </Btn>
                                  <Btn size="sm" variant="danger" onClick={() => deleteSk(sk)} disabled={busyId === sk.id}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Btn>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {detailSk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setDetailSk(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <div className="font-bold text-slate-900">Detail SK Mengajar</div>
                <div className="text-xs text-slate-500">{detailSk.nomor_sk} · {detailSk.dosen?.nama}</div>
              </div>
              <button onClick={() => setDetailSk(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none px-2">×</button>
            </div>
            <div className="p-5 space-y-4">
              {detailSk.status === "draft" && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-3">
                  <div className="text-sm font-semibold text-indigo-900">Penomoran Surat (input manual operator)</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-indigo-700 block mb-1">Nomor Surat</label>
                      <input
                        type="text"
                        value={detailEdit.nomor_sk}
                        onChange={(e) => setDetailEdit((p) => ({ ...p, nomor_sk: e.target.value }))}
                        placeholder="cth: 002/SKM/2026/I"
                        className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-indigo-700 block mb-1">Tanggal Penetapan</label>
                      <input
                        type="date"
                        value={detailEdit.tanggal_sk}
                        onChange={(e) => setDetailEdit((p) => ({ ...p, tanggal_sk: e.target.value }))}
                        className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Btn size="sm" onClick={saveDetailEdit} disabled={busyId === detailSk.id}>
                      {busyId === detailSk.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Simpan Nomor & Tanggal
                    </Btn>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><div className="text-xs text-slate-400">Periode</div><div className="font-medium">{detailSk.semester} {detailSk.tahun_ajaran}</div></div>
                <div><div className="text-xs text-slate-400">Prodi</div><div className="font-medium">{detailSk.prodi?.nama || "—"}</div></div>
                <div><div className="text-xs text-slate-400">Jumlah MK</div><div className="font-medium">{detailSk.jumlah_mk}</div></div>
                <div><div className="text-xs text-slate-400">Total SKS</div><div className="font-medium">{detailSk.total_sks}</div></div>
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <Award className="w-4 h-4 text-slate-400" /> Data Dosen
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm bg-slate-50 rounded-lg p-3">
                  <div><div className="text-xs text-slate-400">Nama</div><div className="font-medium">{detailSk.dosen?.nama}</div></div>
                  <div><div className="text-xs text-slate-400">NIDN</div><div className="font-medium">{detailSk.dosen?.nidn || "—"}</div></div>
                  <div><div className="text-xs text-slate-400">NIP/NIK</div><div className="font-medium">{detailSk.dosen?.nip || detailSk.dosen?.nik || "—"}</div></div>
                  <div><div className="text-xs text-slate-400">Pangkat/Golongan</div><div className="font-medium">{detailSk.dosen?.pangkat || "—"}{detailSk.dosen?.golongan ? ` (${detailSk.dosen.golongan})` : ""}</div></div>
                  <div><div className="text-xs text-slate-400">Jabatan Fungsional</div><div className="font-medium">{detailSk.dosen?.jabatan || "—"}</div></div>
                  <div><div className="text-xs text-slate-400">Status</div><div className="font-medium">{(STATUS_META[detailSk.status] || {}).label || detailSk.status}</div></div>
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800 mb-2">Lampiran Mata Kuliah</div>
                {detailSk.kelas?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-200 text-xs">
                          <th className="py-2 pr-2">Kode MK</th>
                          <th className="py-2 pr-2">Mata Kuliah</th>
                          <th className="py-2 pr-2 text-center">SKS</th>
                          <th className="py-2 pr-2">Prodi</th>
                          <th className="py-2">Jadwal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailSk.kelas.map((k, i) => (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="py-2 pr-2 text-slate-600">{k.course_code}</td>
                            <td className="py-2 pr-2 text-slate-800">{k.course_name}</td>
                            <td className="py-2 pr-2 text-center text-slate-600">{k.sks}</td>
                            <td className="py-2 pr-2 text-slate-600">{k.program_name}</td>
                            <td className="py-2 text-slate-600">{k.schedule || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400">Tidak ada mata kuliah.</div>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="text-xs text-slate-400">
                  {detailSk.penetap?.jabatan}: {detailSk.penetap?.nama || "—"} · Mengetahui: {detailSk.mengetahui?.nama || "—"}
                </div>
                <Btn size="sm" onClick={() => { setDetailSk(null); printSk(detailSk); }}>
                  <Printer className="w-3.5 h-3.5" /> Cetak SK
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {finalSk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setFinalSk(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <div className="font-bold text-slate-900">Finalisasi SK Mengajar</div>
                <div className="text-xs text-slate-500">{finalSk.dosen?.nama} · {finalSk.semester} {finalSk.tahun_ajaran}</div>
              </div>
              <button onClick={() => setFinalSk(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none px-2">×</button>
            </div>
            <div className="p-5 space-y-4">
              <InfoBox variant="info">
                Isi nomor surat & tanggal penetapan secara manual. Setelah final, nomor surat terkunci dan SK siap dicetak sebagai lampiran BKD.
              </InfoBox>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Nomor Surat</label>
                <input
                  type="text"
                  value={nomorInput}
                  onChange={(e) => setNomorInput(e.target.value)}
                  placeholder="cth: 002/SKM/2026/I"
                  autoFocus
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Tanggal Penetapan</label>
                <input
                  type="date"
                  value={tanggalInput}
                  onChange={(e) => setTanggalInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Btn variant="secondary" onClick={() => setFinalSk(null)}>Batal</Btn>
                <Btn onClick={submitFinalize} disabled={busyId === finalSk.id}>
                  {busyId === finalSk.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Finalisasi
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}