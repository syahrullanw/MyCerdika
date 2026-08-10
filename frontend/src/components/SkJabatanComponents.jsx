/**
 * SkJabatanComponents.jsx
 * Persuratan Akademik — SK (Surat Keputusan) Jabatan Akademik Dosen.
 * Alur: rekap dosen + jabatan saat ini → operator isi jabatan baru/pangkat/golongan/TMT →
 * generate SK (draft) → isi nomor & tanggal manual → finalisasi → cetak (kop resmi + QR TTD).
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
  BadgeCheck,
} from "lucide-react";

const API = (path, opt = {}) => {
  const base = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") || window.location.origin;
  const token = localStorage.getItem("elearn_token");
  return fetch(`${base}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opt,
  }).then((r) => r.json());
};

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

const JABATAN_AKADEMIK_OPTIONS = [
  "Tenaga Pengajar",
  "Asisten Ahli",
  "Lektor",
  "Lektor Kepala",
  "Guru Besar",
];

const PANGKAT_OPTIONS = [
  "",
  "Penata Muda",
  "Penata Muda Tingkat I",
  "Penata",
  "Penata Tingkat I",
  "Pembina",
  "Pembina Tingkat I",
  "Pembina Utama Muda",
  "Pembina Utama Madya",
  "Pembina Utama",
];

const GOLONGAN_OPTIONS = [
  "",
  "III/a",
  "III/b",
  "III/c",
  "III/d",
  "IV/a",
  "IV/b",
  "IV/c",
  "IV/d",
  "IV/e",
];

export function SkJabatanPage() {
  const [tab, setTab] = useState("generate");
  const [dosenRekap, setDosenRekap] = useState([]);
  const [skList, setSkList] = useState([]);
  const [selected, setSelected] = useState({});
  const [searchQ, setSearchQ] = useState("");
  const [filterTahun, setFilterTahun] = useState("");
  const [filterJabatan, setFilterJabatan] = useState("");
  const [genJabatan, setGenJabatan] = useState("Asisten Ahli");
  const [genPangkat, setGenPangkat] = useState("");
  const [genGolongan, setGenGolongan] = useState("");
  const [genTmt, setGenTmt] = useState(new Date().toISOString().slice(0, 10));
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detailSk, setDetailSk] = useState(null);
  const [finalSk, setFinalSk] = useState(null);
  const [nomorInput, setNomorInput] = useState("");
  const [tanggalInput, setTanggalInput] = useState("");
  const [detailEdit, setDetailEdit] = useState({});
  const reqSeq = useRef(0);

  const loadRekap = useCallback(() => {
    setLoading(true);
    setError("");
    const seq = ++reqSeq.current;
    const p = new URLSearchParams();
    if (searchQ.trim()) p.set("q", searchQ.trim());
    if (filterJabatan) p.set("jabatan", filterJabatan);
    API(`/api/v1/sk-jabatan/rekap/dosen?${p.toString()}`)
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
  }, [searchQ, filterJabatan]);

  const loadSkList = useCallback(() => {
    setLoading(true);
    setError("");
    const seq = ++reqSeq.current;
    const p = new URLSearchParams();
    if (filterTahun) p.set("tahun_sk", filterTahun);
    if (searchQ.trim()) p.set("q", searchQ.trim());
    API(`/api/v1/sk-jabatan?${p.toString()}`)
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
  }, [filterTahun, searchQ]);

  useEffect(() => {
    if (tab === "generate") loadRekap();
    else loadSkList();
  }, [tab, loadRekap, loadSkList]);

  const tahunOptions = [...new Set(skList.map((s) => s.tahun_sk).filter(Boolean))].sort().reverse();

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
    if (!genJabatan.trim()) {
      setError("Jabatan akademik baru wajib diisi");
      return;
    }
    if (!genTmt.trim()) {
      setError("TMT (terhitung mulai tanggal) wajib diisi");
      return;
    }
    setGenerating(true);
    setError("");
    setNotice("");
    try {
      const res = await API("/api/v1/sk-jabatan/generate", {
        method: "POST",
        body: JSON.stringify({
          dosen_ids: ids,
          jabatan_akademik: genJabatan,
          pangkat: genPangkat,
          golongan: genGolongan,
          tmt: genTmt,
        }),
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
      const res = await API(`/api/v1/sk-jabatan/${sk.id}/final`, {
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
    const tmt = (detailEdit.tmt || "").trim();
    if (!nomor) {
      setError("Nomor surat tidak boleh kosong.");
      return;
    }
    if (!tanggal) {
      setError("Tanggal penetapan tidak boleh kosong.");
      return;
    }
    if (!tmt) {
      setError("TMT tidak boleh kosong.");
      return;
    }
    setBusyId(detailSk.id);
    setError("");
    try {
      const res = await API(`/api/v1/sk-jabatan/${detailSk.id}`, {
        method: "PUT",
        body: JSON.stringify({
          nomor_sk: nomor,
          tanggal_sk: tanggal,
          jabatan_akademik: detailEdit.jabatan_akademik || "",
          pangkat: detailEdit.pangkat || "",
          golongan: detailEdit.golongan || "",
          tmt,
        }),
      });
      if (!res || res.detail) {
        setError((res && res.detail) || "Gagal menyimpan");
        return;
      }
      setDetailSk(res.sk);
      setDetailEdit({
        nomor_sk: res.sk.nomor_sk || "",
        tanggal_sk: res.sk.tanggal_sk || "",
        jabatan_akademik: res.sk.jabatan_baru || "",
        pangkat: res.sk.pangkat || "",
        golongan: res.sk.golongan || "",
        tmt: res.sk.tmt || "",
      });
      setNotice("Data SK berhasil disimpan.");
      loadSkList();
      loadRekap();
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
      const res = await API(`/api/v1/sk-jabatan/${sk.id}`, { method: "DELETE" });
      if (!res || res.detail) {
        setError((res && res.detail) || "Gagal menghapus SK");
        return;
      }
      loadSkList();
      loadRekap();
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
      const d = await API(`/api/v1/sk-jabatan/${sk.id}`);
      if (!d || d.detail) {
        setError((d && d.detail) || "Gagal memuat detail SK");
      } else {
        setDetailSk(d);
        setDetailEdit({
          nomor_sk: d.nomor_sk || "",
          tanggal_sk: d.tanggal_sk || "",
          jabatan_akademik: d.jabatan_baru || "",
          pangkat: d.pangkat || "",
          golongan: d.golongan || "",
          tmt: d.tmt || "",
        });
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
      const res = await API(`/api/v1/sk-jabatan/${sk.id}/cetak`, {
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
    const namaLengkap = [dosen.gelar_depan, dosen.nama, dosen.gelar_belakang || dosen.gelar].filter(Boolean).join(" ");
    const kota = kop.kota || "Kampus";
    const identDosen = [
      dosen.nip ? `NIP. ${dosen.nip}` : "",
      dosen.nidn ? `NIDN. ${dosen.nidn}` : "",
    ].filter(Boolean).join(" / ");
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
    const jabatanDari = sk.jabatan_lama ? `, dari jabatan akademik ${esc(sk.jabatan_lama)}` : "";
    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>SK Jabatan Akademik ${esc(dosen.nama)}</title>
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
  .ttd-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 48px; }
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
    ${kop.header_url ? `<img class="kop-img header" src="${esc(new URL(kop.header_url, window.location.origin).href)}" alt="kop" />` : ""}
    <div class="instansi">${esc(kop.instansi || "")}</div>
    <div class="alamat">${esc(kop.alamat || "")}</div>
    <div class="rule"></div><div class="rule2"></div>
  </div>

  <h2 class="judul">SURAT KEPUTUSAN ${esc((penetap.jabatan || "DIREKTUR").toUpperCase())} ${esc(kop.instansi || "")}</h2>
  <div class="nomor">NOMOR: ${esc(sk.nomor_sk || "")}</div>
  <div class="judul2">TENTANG</div>
  <div class="judul2">PENETAPAN JABATAN AKADEMIK DOSEN</div>

  <div class="body">
    <p>${esc((penetap.jabatan || "DIREKTUR").toUpperCase())} ${esc(kop.instansi || "")},</p>
    <p>Menimbang:</p>
    <ol class="daftar">
      <li>bahwa berdasarkan kelengkapan persyaratan dan hasil penilaian angka kredit, Saudara <b>${esc(namaLengkap)}</b> dinyatakan memenuhi syarat untuk ditetapkan dalam jabatan akademik <b>${esc(sk.jabatan_baru || "")}</b>;</li>
      <li>bahwa sehubungan dengan hal tersebut, perlu diterbitkan Surat Keputusan tentang Penetapan Jabatan Akademik Dosen.</li>
    </ol>
    <p>Mengingat:</p>
    <ol class="daftar">
      <li>Undang-Undang Republik Indonesia Nomor 14 Tahun 2005 tentang Guru dan Dosen;</li>
      <li>Peraturan Pemerintah Republik Indonesia Nomor 37 Tahun 2009 tentang Dosen;</li>
      <li>Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi tentang tata cara kenaikan jabatan fungsional dosen;</li>
      <li>Peraturan lain yang berkaitan.</li>
    </ol>
    <p>Memperhatikan: usulan Ketua Program Studi ${esc(prodi.nama || "")} dan hasil penilaian angka kredit yang bersangkutan.</p>
    <p>MEMUTUSKAN:</p>
    <p class="indent">Menetapkan:</p>
    <ol class="daftar">
      <li>Terhitung mulai tanggal <b>${esc(fmtTanggal(sk.tmt) || "")}</b>, Saudara <b>${esc(namaLengkap)}</b>, ${esc(identDosen) || "NIDN " + esc(dosen.nidn || "—")}${dosen.prodi_nama ? `, dosen ${esc(dosen.prodi_nama)}` : ""}${jabatanDari}, ditetapkan dalam jabatan akademik <b>${esc(sk.jabatan_baru || "")}</b>${sk.pangkat ? ` dengan pangkat ${esc(sk.pangkat)}${sk.golongan ? ` golongan ${esc(sk.golongan)}` : ""}` : ""};</li>
      <li>Surat Keputusan ini mulai berlaku sejak tanggal ditetapkan;</li>
      <li>Apabila di kemudian hari terdapat kekeliruan dalam surat keputusan ini, akan diadakan perbaikan sebagaimana mestinya.</li>
    </ol>
  </div>

  <div class="ttd-row">
    ${ttdBox(sigMengetahui, "Mengetahui,")}
    ${ttdBox(sigPenetap, "")}
  </div>

  <div class="ttd-date">Ditetapkan di ${esc(kota)} pada tanggal ${esc(fmtTanggal(sk.tanggal_sk) || "......................")}</div>

  <div class="foot">Dokumen diterbitkan secara elektronik oleh Sistem Informasi Akademik. Tanda tangan pejabat menggunakan TTD Elektronik — keabsahannya dapat diverifikasi dengan memindai QR di atas nama masing-masing pejabat.
    ${kop.footer_url ? `<img class="kop-img" src="${esc(new URL(kop.footer_url, window.location.origin).href)}" alt="kop" />` : ""}
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

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <BadgeCheck className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">SK Jabatan Akademik Dosen</h1>
            <p className="text-slate-500 text-sm">Persuratan akademik — Surat Keputusan Penetapan Jabatan Akademik (Fungsional) Dosen</p>
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
          {tab === "list" ? (
            <select
              value={filterTahun}
              onChange={(e) => setFilterTahun(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">Semua Tahun SK</option>
              {tahunOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          ) : (
            <select
              value={filterJabatan}
              onChange={(e) => setFilterJabatan(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">Semua Jabatan</option>
              {JABATAN_AKADEMIK_OPTIONS.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          )}
          <input
            type="text"
            placeholder={tab === "generate" ? "Cari nama dosen..." : "Cari nomor SK / dosen / jabatan..."}
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="w-full lg:w-72 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <div className="flex-1" />
          <Btn size="sm" onClick={tab === "generate" ? loadRekap : loadSkList} variant="secondary">
            <RefreshCw className="w-3.5 h-3.5" /> Muat Ulang
          </Btn>
        </div>
      </Card>

      {error && <InfoBox variant="error">{error}</InfoBox>}
      {notice && <InfoBox variant="success">{notice}</InfoBox>}

      {tab === "generate" ? (
        <>
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Jabatan Akademik Baru *</label>
                <select
                  value={genJabatan}
                  onChange={(e) => setGenJabatan(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  {JABATAN_AKADEMIK_OPTIONS.map((j) => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Pangkat Baru</label>
                <select
                  value={genPangkat}
                  onChange={(e) => setGenPangkat(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  {PANGKAT_OPTIONS.map((p) => <option key={p || "_"} value={p}>{p || "— tanpa pangkat —"}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Golongan Baru</label>
                <select
                  value={genGolongan}
                  onChange={(e) => setGenGolongan(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  {GOLONGAN_OPTIONS.map((g) => <option key={g || "_"} value={g}>{g || "— tanpa golongan —"}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">TMT (Berlaku Mulai) *</label>
                <input
                  type="date"
                  value={genTmt}
                  onChange={(e) => setGenTmt(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div className="flex items-end">
                <Btn className="w-full justify-center" onClick={generateSk} disabled={generating || checkedCount === 0}>
                  {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  {generating ? "Membuat SK..." : `Generate SK (${checkedCount})`}
                </Btn>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Jabatan baru, pangkat, golongan, dan TMT di atas akan diterapkan ke semua dosen yang dicentang. Nilai jabatan/pangkat lama dosen diambil otomatis dari profil dosen.
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" /> Dosen & Jabatan Akademik Saat Ini
              </div>
              <StatusBadge color="blue">{dosenRekap.length} Dosen</StatusBadge>
            </div>
            {loading ? (
              <div className="py-10 text-center text-slate-400 text-sm">Memuat data...</div>
            ) : dosenRekap.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">Belum ada data dosen pada filter ini.</div>
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
                      <th className="py-2 pr-2">Jabatan Akademik</th>
                      <th className="py-2 pr-2">Pangkat / Golongan</th>
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
                          <td className="py-2 pr-2 text-slate-600">{d.jabatan || "—"}</td>
                          <td className="py-2 pr-2 text-slate-600">
                            {d.pangkat || "—"}{d.golongan ? ` (${d.golongan})` : ""}
                          </td>
                          <td className="py-2">
                            <StatusBadge color={meta.color}>{meta.label}{d.sk_jabatan_baru ? ` · ${d.sk_jabatan_baru}` : ""}</StatusBadge>
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
      ) : (
        <>
          <InfoBox variant="info">
            Daftar SK Jabatan Akademik. SK <strong>Draft</strong> dapat diedit & dihapus; <strong>Final</strong> terkunci dan siap dicetak dengan QR validasi.
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
                      <th className="py-2 pr-3">Jabatan Baru</th>
                      <th className="py-2 pr-3">Pangkat / Golongan</th>
                      <th className="py-2 pr-3">TMT</th>
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
                          <td className="py-2 pr-3">
                            <div className="text-slate-800">{sk.jabatan_baru || "—"}</div>
                            {sk.jabatan_lama ? <div className="text-xs text-slate-400">dari {sk.jabatan_lama}</div> : null}
                          </td>
                          <td className="py-2 pr-3 text-slate-600">{sk.pangkat || "—"}{sk.golongan ? ` (${sk.golongan})` : ""}</td>
                          <td className="py-2 pr-3 text-slate-600">{fmtTanggal(sk.tmt) || "—"}</td>
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
                <div className="font-bold text-slate-900">Detail SK Jabatan Akademik</div>
                <div className="text-xs text-slate-500">{detailSk.nomor_sk || "(belum bernomor)"} · {detailSk.dosen?.nama}</div>
              </div>
              <button onClick={() => setDetailSk(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none px-2">×</button>
            </div>
            <div className="p-5 space-y-4">
              {detailSk.status === "draft" && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-3">
                  <div className="text-sm font-semibold text-indigo-900">Penomoran Surat & Rincian Jabatan (input manual operator)</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-indigo-700 block mb-1">Nomor Surat</label>
                      <input
                        type="text"
                        value={detailEdit.nomor_sk}
                        onChange={(e) => setDetailEdit((p) => ({ ...p, nomor_sk: e.target.value }))}
                        placeholder="cth: 010/SKJ/2026"
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
                    <div>
                      <label className="text-xs text-indigo-700 block mb-1">TMT (Berlaku Mulai)</label>
                      <input
                        type="date"
                        value={detailEdit.tmt}
                        onChange={(e) => setDetailEdit((p) => ({ ...p, tmt: e.target.value }))}
                        className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-indigo-700 block mb-1">Jabatan Akademik Baru</label>
                      <select
                        value={detailEdit.jabatan_akademik}
                        onChange={(e) => setDetailEdit((p) => ({ ...p, jabatan_akademik: e.target.value }))}
                        className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        {JABATAN_AKADEMIK_OPTIONS.map((j) => <option key={j} value={j}>{j}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-indigo-700 block mb-1">Pangkat Baru</label>
                      <select
                        value={detailEdit.pangkat}
                        onChange={(e) => setDetailEdit((p) => ({ ...p, pangkat: e.target.value }))}
                        className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        {PANGKAT_OPTIONS.map((p) => <option key={p || "_"} value={p}>{p || "— tanpa pangkat —"}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-indigo-700 block mb-1">Golongan Baru</label>
                      <select
                        value={detailEdit.golongan}
                        onChange={(e) => setDetailEdit((p) => ({ ...p, golongan: e.target.value }))}
                        className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        {GOLONGAN_OPTIONS.map((g) => <option key={g || "_"} value={g}>{g || "— tanpa golongan —"}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Btn size="sm" onClick={saveDetailEdit} disabled={busyId === detailSk.id}>
                      {busyId === detailSk.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Simpan
                    </Btn>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><div className="text-xs text-slate-400">TMT</div><div className="font-medium">{fmtTanggal(detailSk.tmt) || "—"}</div></div>
                <div><div className="text-xs text-slate-400">Prodi</div><div className="font-medium">{detailSk.prodi?.nama || "—"}</div></div>
                <div><div className="text-xs text-slate-400">Jabatan Lama</div><div className="font-medium">{detailSk.jabatan_lama || "—"}</div></div>
                <div><div className="text-xs text-slate-400">Status</div><div className="font-medium">{(STATUS_META[detailSk.status] || {}).label || detailSk.status}</div></div>
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <Award className="w-4 h-4 text-slate-400" /> Data Dosen
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm bg-slate-50 rounded-lg p-3">
                  <div><div className="text-xs text-slate-400">Nama</div><div className="font-medium">{detailSk.dosen?.nama}</div></div>
                  <div><div className="text-xs text-slate-400">NIDN</div><div className="font-medium">{detailSk.dosen?.nidn || "—"}</div></div>
                  <div><div className="text-xs text-slate-400">NIP/NIK</div><div className="font-medium">{detailSk.dosen?.nip || detailSk.dosen?.nik || "—"}</div></div>
                  <div><div className="text-xs text-slate-400">Jabatan Lama</div><div className="font-medium">{detailSk.jabatan_lama || "—"}</div></div>
                  <div><div className="text-xs text-slate-400">Pangkat Lama</div><div className="font-medium">{detailSk.pangkat_lama || "—"}{detailSk.golongan_lama ? ` (${detailSk.golongan_lama})` : ""}</div></div>
                  <div><div className="text-xs text-slate-400">Homebase</div><div className="font-medium">{detailSk.dosen?.prodi_nama || "—"}</div></div>
                </div>
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
                <div className="font-bold text-slate-900">Finalisasi SK Jabatan Akademik</div>
                <div className="text-xs text-slate-500">{finalSk.dosen?.nama} · {finalSk.jabatan_baru}</div>
              </div>
              <button onClick={() => setFinalSk(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none px-2">×</button>
            </div>
            <div className="p-5 space-y-4">
              <InfoBox variant="info">
                Isi nomor surat & tanggal penetapan secara manual. Setelah final, data terkunci dan SK siap dicetak.
              </InfoBox>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Nomor Surat</label>
                <input
                  type="text"
                  value={nomorInput}
                  onChange={(e) => setNomorInput(e.target.value)}
                  placeholder="cth: 010/SKJ/2026"
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
