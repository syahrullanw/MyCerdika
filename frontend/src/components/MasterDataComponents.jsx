/**
 * MasterDataComponents.jsx
 * Komponen UI untuk Data Master SIAKAD.
 * Semua icon menggunakan Lucide React — tidak ada emoji.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Settings,
  Building2,
  CalendarDays,
  CalendarRange,
  School,
  Banknote,
  CheckCircle2,
  UserCheck,
  Users,
  BookOpen,
  GraduationCap,
  Inbox,
  ChevronRight,
  Check,
  Wand2,
  AlertCircle,
  Info,
  Loader2,
  Award,
  Sparkles,
  Home,
  CalendarClock,
  Clock,
  MapPin,
  X,
  Search,
  Printer,
  Trash2,
} from "lucide-react";

// ─── helpers ──────────────────────────────────────────────────────────────────

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

// ─── UI primitives ─────────────────────────────────────────────────────────────

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

const FieldInput = ({ label, value, onChange, type = "text", placeholder = "", required = false, hint = "" }) => (
  <div className="flex flex-col gap-1">
    {label && (
      <label className="text-sm font-medium text-slate-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
    )}
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
    />
    {hint && <span className="text-xs text-slate-400">{hint}</span>}
  </div>
);

const FieldSelect = ({ label, value, onChange, options = [], hint = "" }) => (
  <div className="flex flex-col gap-1">
    {label && <label className="text-sm font-medium text-slate-700">{label}</label>}
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white transition"
    >
      {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
    </select>
    {hint && <span className="text-xs text-slate-400">{hint}</span>}
  </div>
);

const Toggle = ({ label, checked, onChange, hint = "" }) => (
  <label className="flex items-center gap-3 cursor-pointer select-none">
    <div className="relative">
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div className={`w-10 h-6 rounded-full transition-colors ${checked ? "bg-indigo-600" : "bg-slate-300"}`} />
      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
    </div>
    <div>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  </label>
);

const EmptyState = ({ Icon = Inbox, title, desc }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <Icon className="w-12 h-12 text-slate-300 mb-3" strokeWidth={1.5} />
    <p className="font-semibold text-slate-700 text-base">{title}</p>
    {desc && <p className="text-sm text-slate-400 mt-1 max-w-xs">{desc}</p>}
  </div>
);

const InfoBox = ({ children, variant = "info", dismissible = false, onDismiss }) => {
  const map = {
    info:    { bg: "bg-blue-50 border-blue-200 text-blue-800",    Icon: Info },
    warning: { bg: "bg-amber-50 border-amber-200 text-amber-800", Icon: AlertCircle },
    success: { bg: "bg-emerald-50 border-emerald-200 text-emerald-800", Icon: CheckCircle2 },
  };
  const { bg, Icon } = map[variant] || map.info;
  return (
    <div className={`flex items-start gap-2 border rounded-lg p-3 text-sm ${bg}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="flex-1">{children}</span>
      {dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs font-bold opacity-60 hover:opacity-100"
          aria-label="Tutup"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

// ─── Konfigurasi Akademik ──────────────────────────────────────────────────────

export function AcademicConfigPage() {
  const [cfg, setCfg] = useState({
    use_fakultas: true,
    krs_mode: "wali_acc",
    ukt_mode: "flat",
    ukt_flat_amount: 0,
    ukt_per_sks_amount: 0,
    kampus_name: "",
    kampus_logo_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    API("/api/v1/master/config").then((d) => { if (!d.detail) setCfg((p) => ({ ...p, ...d })); });
  }, []);

  const save = async () => {
    setSaving(true);
    await API("/api/v1/master/config", { method: "PUT", body: JSON.stringify(cfg) });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
          <Settings className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Konfigurasi Akademik</h1>
          <p className="text-slate-500 text-sm">Atur perilaku sistem SIAKAD sesuai kebutuhan kampus</p>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-2">Identitas Kampus</h2>
        <FieldInput label="Nama Kampus" value={cfg.kampus_name || ""} onChange={(v) => setCfg((p) => ({ ...p, kampus_name: v }))} placeholder="Universitas ..." />
        <FieldInput label="URL Logo Kampus" value={cfg.kampus_logo_url || ""} onChange={(v) => setCfg((p) => ({ ...p, kampus_logo_url: v }))} placeholder="https://..." hint="Opsional — ditampilkan di header aplikasi" />
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-2">Struktur Organisasi</h2>
        <Toggle
          label="Gunakan Hierarki Fakultas"
          checked={cfg.use_fakultas}
          onChange={(v) => setCfg((p) => ({ ...p, use_fakultas: v }))}
          hint="Aktifkan jika kampus memiliki Fakultas di atas Prodi. Nonaktifkan untuk kampus satu prodi."
        />
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-2">Alur KRS</h2>
        <FieldSelect
          label="Mode KRS"
          value={cfg.krs_mode}
          onChange={(v) => setCfg((p) => ({ ...p, krs_mode: v }))}
          options={[
            ["wali_acc", "Wajib ACC Dosen Wali — mahasiswa isi KRS, dosen wali harus approve"],
            ["auto",     "Otomatis Sah — mahasiswa isi KRS langsung terkunci tanpa persetujuan"],
          ]}
        />
        {cfg.krs_mode === "wali_acc"
          ? <InfoBox variant="info">Rekomendasi untuk kampus formal — KRS mahasiswa wajib disetujui dosen wali sebelum berlaku.</InfoBox>
          : <InfoBox variant="info">Cocok untuk kampus tanpa sistem perwalian — KRS langsung sah setelah mahasiswa submit.</InfoBox>
        }
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-2">Sistem UKT</h2>
        <FieldSelect
          label="Mode UKT"
          value={cfg.ukt_mode}
          onChange={(v) => setCfg((p) => ({ ...p, ukt_mode: v }))}
          options={[
            ["flat",    "Flat — semua mahasiswa bayar nominal sama setiap semester"],
            ["per_sks", "Per SKS — nominal dihitung dari jumlah SKS yang diambil"],
            ["custom",  "Custom — admin input tagihan manual per mahasiswa"],
          ]}
        />
        {cfg.ukt_mode === "flat" && (
          <FieldInput label="Nominal UKT Per Semester (Rp)" type="number" value={cfg.ukt_flat_amount || ""} onChange={(v) => setCfg((p) => ({ ...p, ukt_flat_amount: parseFloat(v) || 0 }))} placeholder="5000000" />
        )}
        {cfg.ukt_mode === "per_sks" && (
          <FieldInput label="Nominal Per SKS (Rp)" type="number" value={cfg.ukt_per_sks_amount || ""} onChange={(v) => setCfg((p) => ({ ...p, ukt_per_sks_amount: parseFloat(v) || 0 }))} placeholder="500000" />
        )}
        {cfg.ukt_mode === "custom" && (
          <InfoBox variant="warning">Mode Custom: tagihan diinput manual oleh admin di menu Keuangan setiap semester.</InfoBox>
        )}
      </Card>

      <div className="flex justify-end">
        <Btn onClick={save} disabled={saving} variant={saved ? "success" : "primary"} size="lg">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : saved ? <><Check className="w-4 h-4" /> Tersimpan</> : "Simpan Konfigurasi"}
        </Btn>
      </div>
    </div>
  );
}

// ─── Wizard Setup Semester Baru ────────────────────────────────────────────────

const WIZARD_STEPS = [
  { id: "semester",   label: "Tahun Ajaran", Icon: CalendarDays },
  { id: "krs_period", label: "Periode KRS",  Icon: CalendarRange },
  { id: "kelas",      label: "Setup Kelas",  Icon: School },
  { id: "ukt",        label: "Tagihan UKT",  Icon: Banknote },
  { id: "done",       label: "Selesai",      Icon: CheckCircle2 },
];

export function WizardSemesterBaru({ onDone }) {
  const [step, setStep] = useState(0);
  const [taList, setTaList] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [selectedTa, setSelectedTa] = useState(null);
  const [form, setForm] = useState({ tahun: "", semester: "Ganjil", tanggal_mulai: "", tanggal_selesai: "", krs_buka: "", krs_tutup: "" });
  const [activeProdiTab, setActiveProdiTab] = useState("");
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [genInfo, setGenInfo] = useState("");
  const [mkList, setMkList] = useState([]);
  const [selectedMk, setSelectedMk] = useState([]);
  const [genLog, setGenLog] = useState([]);

  const loadMkList = useCallback(async (taId) => {
    if (!taId) { setMkList([]); return; }
    const d = await API(`/api/v1/master/kelas/mk-baru?tahun_ajaran_id=${taId}`);
    const list = Array.isArray(d) ? d : [];
    setMkList(list);
    // Pra-pilih MK yang sudah punya kelas (terkunci) agar tetap tampil tercentang
    const lockedIds = list.filter((m) => m.sudah_punya_kelas).map((m) => m.id);
    setSelectedMk((prev) => Array.from(new Set([...prev, ...lockedIds])));
  }, []);

  useEffect(() => {
    API("/api/v1/master/tahun-ajaran").then((d) => Array.isArray(d) && setTaList(d));
    API("/api/v1/master/config").then((d) => !d.detail && setCfg(d));
  }, []);

  const createOrSelectTA = async () => {
    setLoading(true); setErrMsg("");
    if (selectedTa) { setLoading(false); setStep(1); return; }
    const res = await API("/api/v1/master/tahun-ajaran", { method: "POST", body: JSON.stringify(form) });
    setLoading(false);
    if (res.id) { setSelectedTa(res); setTaList((p) => [...p, res]); setStep(1); }
    else setErrMsg(res.detail || "Gagal membuat tahun ajaran");
  };

  const updateKRSPeriod = async () => {
    if (!selectedTa) return;
    setLoading(true);
    try {
      await API(`/api/v1/master/tahun-ajaran/${selectedTa.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...selectedTa, krs_buka: form.krs_buka, krs_tutup: form.krs_tutup }),
      });
      await loadMkList(selectedTa.id);
      setGenLog([]);
      setSelectedMk([]);
      setGenInfo("");
      setStep(2);
    } catch (e) {
      setErrMsg(e.message || "Gagal menyimpan periode KRS");
    } finally {
      setLoading(false);
    }
  };

  const generateKelas = async () => {
    setLoading(true);
    setErrMsg("");
    setGenLog([]);
    const toGenerate = selectedMk.filter((id) => {
      const mk = mkList.find((m) => m.id === id);
      return mk && !mk.sudah_punya_kelas && (mk.has_dosen_pengampu || mk.dosen_utama_id);
    });
    const log = toGenerate.map((id) => {
      const mk = mkList.find((m) => m.id === id);
      return { id, name: mk?.name || "", status: "processing", message: "Membuat rombel..." };
    });
    try {
      if (toGenerate.length > 0) {
        setGenLog([...log]);
        const gen = await API("/api/v1/master/kelas/generate-rombel", {
          method: "POST",
          body: JSON.stringify({ tahun_ajaran_id: selectedTa.id, course_ids: toGenerate }),
        });
        const results = (gen && Array.isArray(gen.results)) ? gen.results : [];
        const byId = {};
        results.forEach((r) => { byId[r.course_id] = r; });
        toGenerate.forEach((id, i) => {
          const r = byId[id] || {};
          if (r.status === "created") {
            log[i] = { id, name: r.course_name || "", status: "success", message: "Rombel " + (r.class_name || "baru") + " berhasil dibuat" };
          } else if (r.status === "exists") {
            log[i] = { id, name: r.course_name || "", status: "exists", message: "MK sudah punya kelas (dilewati)" };
          } else if (r.status === "blocked") {
            log[i] = { id, name: r.course_name || "", status: "error", message: r.message || "Dosen pengampu belum ditetapkan" };
          } else {
            log[i] = { id, name: r.course_name || "", status: "error", message: "Gagal membuat rombel" };
          }
        });
        setGenLog([...log]);
        // Segarkan status sudah_punya_kelas setelah generate
        await loadMkList(selectedTa.id);
      }
      setStep(3);
    } catch (e) {
      setErrMsg(e.message || "Gagal membuat kelas");
    } finally {
      setLoading(false);
    }
  };

  const activateSemester = async () => {
    setLoading(true);
    await API(`/api/v1/master/tahun-ajaran/${selectedTa.id}/activate`, { method: "PUT" });
    setLoading(false);
    setStep(4);
  };

  const StepNav = () => (
    <div className="flex items-center mb-8 overflow-x-auto">
      {WIZARD_STEPS.map((s, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <React.Fragment key={s.id}>
            <div className={`flex flex-col items-center min-w-[72px] transition-opacity ${i <= step ? "opacity-100" : "opacity-35"}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all
                ${done   ? "bg-emerald-500 text-white"
                : active ? "bg-indigo-600 text-white ring-4 ring-indigo-100"
                :          "bg-slate-100 text-slate-400"}`}>
                {done ? <Check className="w-4 h-4" /> : <s.Icon className="w-4 h-4" />}
              </div>
              <span className="text-xs mt-1 text-center font-medium text-slate-600 leading-tight">{s.label}</span>
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 min-w-[16px] mx-1 transition-colors ${i < step ? "bg-emerald-400" : "bg-slate-200"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
          <Wand2 className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Setup Semester Baru</h1>
          <p className="text-slate-500 text-sm">Ikuti langkah-langkah untuk membuka semester baru</p>
        </div>
      </div>
      <StepNav />
      {errMsg && <InfoBox variant="warning">{errMsg}</InfoBox>}

      {/* Step 0 — Tahun Ajaran */}
      {step === 0 && (() => {
        const hasActiveRegular = taList.some((ta) => (ta.is_active || ta.status === "active") && ta.semester !== "Pendek");

        return (
          <Card className="p-6 space-y-4">
            <h2 className="font-semibold text-slate-800">Pilih atau buat semester yang akan dibuka</h2>
            
            {/* Opsi Tipe Semester */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
              <label
                className={`p-3.5 rounded-xl border cursor-pointer transition flex items-start gap-3 ${
                  form.semester !== "Pendek" ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-300" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="sem_type"
                  className="mt-1 text-indigo-600 focus:ring-indigo-500"
                  checked={form.semester !== "Pendek"}
                  onChange={() => {
                    setForm((p) => ({ ...p, semester: "Ganjil" }));
                    setErrMsg("");
                  }}
                />
                <div>
                  <div className="font-bold text-slate-800 text-sm">Semester Reguler (Sistem Paket)</div>
                  <div className="text-xs text-slate-500 mt-0.5">Otomatis menyusun paket mata kuliah Ganjil/Genap sesuai Kurikulum Prodi.</div>
                </div>
              </label>

              <label
                className={`p-3.5 rounded-xl border cursor-pointer transition flex items-start gap-3 ${
                  form.semester === "Pendek" ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-300" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="sem_type"
                  className="mt-1 text-indigo-600 focus:ring-indigo-500"
                  checked={form.semester === "Pendek"}
                  onChange={() => {
                    if (hasActiveRegular) {
                      setErrMsg("Peringatan: Semester Pendek (SP) hanya dapat diaktifkan setelah Semester Reguler selesai / ditutup.");
                    } else {
                      setErrMsg("");
                    }
                    setForm((p) => ({ ...p, semester: "Pendek" }));
                  }}
                />
                <div>
                  <div className="font-bold text-slate-800 text-sm">Semester Pendek (SP)</div>
                  <div className="text-xs text-slate-500 mt-0.5">Perbaikan tunggakan nilai (Old-SIAP & Feeder). Aktif setelah reguler selesai.</div>
                </div>
              </label>
            </div>

            {hasActiveRegular && form.semester === "Pendek" && (
              <InfoBox variant="warning">
                <strong>Semester Pendek Belum Bisa Dibuka:</strong> Saat ini masih terdapat semester reguler yang aktif. Selesaikan/tutup semester reguler terlebih dahulu sebelum membuka Semester Pendek.
              </InfoBox>
            )}

            {taList.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-slate-500 font-medium">Atau pilih semester yang sudah ada:</p>
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {taList.map((ta) => (
                    <label key={ta.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${selectedTa?.id === ta.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                      <input type="radio" name="ta" checked={selectedTa?.id === ta.id} onChange={() => { setSelectedTa(ta); setForm((p) => ({ ...p, semester: ta.semester })); }} />
                      <div className="flex items-center gap-2 flex-1">
                        <span className="font-medium text-sm">{ta.semester} {ta.tahun}</span>
                        <StatusBadge color={ta.is_active ? "green" : ta.status === "closed" ? "gray" : "blue"}>{ta.status || "draft"}</StatusBadge>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-400 pt-1">— atau buat baru di bawah —</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 pt-1">
              <FieldInput label="Tahun Akademik" value={form.tahun} onChange={(v) => { setForm((p) => ({ ...p, tahun: v })); setSelectedTa(null); }} placeholder="2025/2026" />
              <FieldSelect
                label="Semester"
                value={form.semester}
                onChange={(v) => { setForm((p) => ({ ...p, semester: v })); setSelectedTa(null); }}
                options={[["Ganjil", "Ganjil"], ["Genap", "Genap"], ["Pendek", "Semester Pendek (SP)"]]}
              />
              <FieldInput label="Tanggal Mulai" type="date" value={form.tanggal_mulai} onChange={(v) => setForm((p) => ({ ...p, tanggal_mulai: v }))} />
              <FieldInput label="Tanggal Selesai" type="date" value={form.tanggal_selesai} onChange={(v) => setForm((p) => ({ ...p, tanggal_selesai: v }))} />
            </div>
            <div className="flex justify-end pt-2">
              <Btn onClick={createOrSelectTA} disabled={loading || (!selectedTa && !form.tahun) || (form.semester === "Pendek" && hasActiveRegular)}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? "Memproses..." : "Lanjut"}
                {!loading && <ChevronRight className="w-4 h-4" />}
              </Btn>
            </div>
          </Card>
        );
      })()}

      {/* Step 1 — Periode KRS */}
      {step === 1 && (
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-slate-800">Tentukan jadwal pembukaan dan penutupan KRS</h2>
          <InfoBox variant="info">Semester: <strong>{selectedTa?.semester} {selectedTa?.tahun}</strong></InfoBox>
          <div className="grid grid-cols-2 gap-4">
            <FieldInput label="KRS Dibuka" type="datetime-local" value={form.krs_buka} onChange={(v) => setForm((p) => ({ ...p, krs_buka: v }))} hint="Tanggal dan jam KRS mulai bisa diisi" />
            <FieldInput label="KRS Ditutup" type="datetime-local" value={form.krs_tutup} onChange={(v) => setForm((p) => ({ ...p, krs_tutup: v }))} hint="Setelah ini KRS tidak bisa diubah" />
          </div>
          {cfg?.krs_mode === "wali_acc" && <InfoBox variant="info">Mode aktif: <strong>Wajib ACC Dosen Wali</strong> — mahasiswa isi KRS lalu dosen wali menyetujui.</InfoBox>}
          {cfg?.krs_mode === "auto"     && <InfoBox variant="info">Mode aktif: <strong>Otomatis Sah</strong> — KRS langsung terkunci setelah mahasiswa submit.</InfoBox>}
          <div className="flex justify-between pt-2">
            <Btn variant="secondary" onClick={() => setStep(0)}>Kembali</Btn>
            <Btn onClick={updateKRSPeriod} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? "Menyimpan..." : "Lanjut"}
              {!loading && <ChevronRight className="w-4 h-4" />}
            </Btn>
          </div>
        </Card>
      )}

      {/* Step 2 — Mata Kuliah yang Ditawarkan */}
      {step === 2 && (() => {
        const targetType = selectedTa?.semester || "Ganjil";

        // Grouping: Prodi -> Semester Paket
        const grouped = mkList.reduce((acc, mk) => {
          const prodiName = mk.prodi_name || "Program Studi Umum";
          const rawSem = mk.semester_paket;
          const semNum = parseInt(rawSem, 10);
          const semLabel = !isNaN(semNum) && semNum > 0 ? `Semester ${semNum}` : "Semester Paket";
          if (!acc[prodiName]) acc[prodiName] = {};
          if (!acc[prodiName][semLabel]) acc[prodiName][semLabel] = [];
          acc[prodiName][semLabel].push(mk);
          return acc;
        }, {});

        const prodiList = Object.keys(grouped);
        const currentProdi = activeProdiTab && prodiList.includes(activeProdiTab) ? activeProdiTab : (prodiList[0] || "");
        const activeProdiGroup = grouped[currentProdi] || {};
        const semList = Object.keys(activeProdiGroup);

        const totalMk = mkList.length;
        const selectedCount = selectedMk.length;
        const toGenerateCount = selectedMk.filter((id) => {
          const mk = mkList.find((m) => m.id === id);
          return mk && !mk.sudah_punya_kelas && (mk.has_dosen_pengampu || mk.dosen_utama_id);
        }).length;

        return (
          <Card className="p-5 space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-900 text-base">Pilih Mata Kuliah yang Ditawarkan</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Semester Target: <strong className="text-indigo-600 font-semibold">{selectedTa?.semester} {selectedTa?.tahun}</strong> (MK {targetType} dari Kurikulum)
                </p>
              </div>
              {prodiList.length > 0 && (
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      const selectableIds = mkList.filter((m) => !m.sudah_punya_kelas && (m.has_dosen_pengampu || m.dosen_utama_id)).map((m) => m.id);
                      const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedMk.includes(id));
                      setSelectedMk((p) => {
                        const locked = mkList.filter((m) => m.sudah_punya_kelas).map((m) => m.id);
                        if (allSelected) {
                          return Array.from(new Set([...locked, ...p.filter((id) => !selectableIds.includes(id))]));
                        }
                        return Array.from(new Set([...p, ...selectableIds]));
                      });
                    }}
                    className="text-xs font-semibold px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
                  >
                    {mkList.filter((m) => !m.sudah_punya_kelas && (m.has_dosen_pengampu || m.dosen_utama_id)).every((m) => selectedMk.includes(m.id)) && mkList.some((m) => !m.sudah_punya_kelas && (m.has_dosen_pengampu || m.dosen_utama_id))
                      ? "Batalkan Semua"
                      : "Pilih Semua (Semua Prodi)"}
                  </button>
                </div>
              )}
            </div>

            <InfoBox variant="info">
              Daftar MK diambil dari halaman <strong>Kurikulum</strong>. MK yang sudah punya kelas pada semester ini
              otomatis tercentang & terkunci. Kelas baru memakai format nama rombel <strong>kode prodi + nomor</strong>,
              misalnya <strong>RKJ01</strong> (maksimal 5 karakter untuk Neo Feeder). Centang MK yang ingin ditawarkan,
              lalu tekan <strong>Generate Kelas</strong>.
            </InfoBox>

            {/* Log transparan proses generate */}
            {genLog.length > 0 && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-1.5" data-testid="wizard-gen-log">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-800 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Proses Generate Rombel</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {genLog.map((g) => (
                    <div key={g.id} className="flex items-center gap-2 bg-white rounded-lg px-2.5 py-1.5 border border-indigo-100 text-xs">
                      <span className={`flex items-center justify-center w-4 h-4 rounded-full shrink-0 ${
                        g.status === "success" ? "bg-emerald-500 text-white"
                        : g.status === "exists" ? "bg-amber-400 text-white"
                        : g.status === "error" ? "bg-red-500 text-white"
                        : "bg-indigo-500 text-white"
                      }`}>
                        {g.status === "success" ? <Check className="w-3 h-3" /> : <Loader2 className={`w-3 h-3 ${g.status === "processing" ? "animate-spin" : ""}`} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-800 truncate">{g.name}</div>
                        <div className="text-[10px] text-slate-500">{g.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {totalMk === 0 ? (
              <EmptyState Icon={School} title={`Belum Ada MK ${targetType} di Kurikulum`} desc={`Tidak ditemukan mata kuliah semester ${targetType} pada halaman Kurikulum. Tambahkan MK di menu Prodi, MK & Kelas.`} />
            ) : (
              <div className="space-y-3">
                {/* Navigation Tabs per Prodi */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
                  {prodiList.map((pName) => {
                    const count = Object.values(grouped[pName]).flat().length;
                    const isActive = pName === currentProdi;
                    return (
                      <button
                        key={pName}
                        type="button"
                        onClick={() => setActiveProdiTab(pName)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                          isActive
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        <GraduationCap className="w-3.5 h-3.5" />
                        <span>{pName}</span>
                        <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-semibold ${isActive ? "bg-indigo-500 text-white" : "bg-slate-200 text-slate-700"}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Konten Prodi Aktif */}
                {currentProdi && (
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {semList.map((semLabel) => {
                      const items = activeProdiGroup[semLabel];
                      const selectable = items.filter((m) => !m.sudah_punya_kelas && (m.has_dosen_pengampu || m.dosen_utama_id));
                      const allSemSelected = selectable.length > 0 && selectable.every((m) => selectedMk.includes(m.id));

                      return (
                        <div key={semLabel} className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/70 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                              <CalendarDays className="w-3.5 h-3.5 text-indigo-600" />
                              <span>{semLabel}</span>
                              <span className="text-[10px] font-normal text-slate-500">({items.length} MK)</span>
                            </div>
                            {selectable.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const ids = selectable.map((m) => m.id);
                                  if (allSemSelected) {
                                    setSelectedMk((p) => p.filter((id) => !ids.includes(id)));
                                  } else {
                                    setSelectedMk((p) => Array.from(new Set([...p, ...ids])));
                                  }
                                }}
                                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                              >
                                {allSemSelected ? "Batal Centang" : "Pilih Semua"}
                              </button>
                            )}
                          </div>

                          {/* Grid MK 3 Kolom */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {items.map((mk) => {
                              const isSelected = selectedMk.includes(mk.id);
                              const locked = mk.sudah_punya_kelas;
                              const hasLecturer = mk.has_dosen_pengampu || mk.dosen_utama_id;
                              return (
                                <label
                                  key={mk.id}
                                  className={`flex items-start gap-2 p-2.5 rounded-lg border transition text-xs ${
                                    locked
                                      ? "bg-emerald-50/50 border-emerald-200 cursor-default"
                                      : !hasLecturer
                                        ? "bg-amber-50/60 border-amber-200 cursor-not-allowed"
                                      : isSelected
                                        ? "bg-white border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-300 shadow-2xs cursor-pointer"
                                        : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    checked={isSelected}
                                    disabled={locked || !hasLecturer}
                                    onChange={(e) =>
                                      setSelectedMk((p) => (e.target.checked ? [...p, mk.id] : p.filter((x) => x !== mk.id)))
                                    }
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-slate-800 truncate leading-tight" title={mk.name}>
                                      {mk.name}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1 mt-1">
                                      {mk.code && (
                                        <span className="text-[10px] font-mono font-semibold px-1 py-0.2 bg-slate-100 text-slate-600 rounded">
                                          {mk.code}
                                        </span>
                                      )}
                                      <span className="text-[10px] font-semibold px-1 py-0.2 bg-indigo-100 text-indigo-800 rounded">
                                        Sem {mk.semester_paket}
                                      </span>
                                      {mk.sks && (
                                        <span className="text-[10px] font-semibold px-1 py-0.2 bg-slate-100 text-slate-600 rounded">
                                          {mk.sks} SKS
                                        </span>
                                      )}
                                      {locked && (
                                        <span className="text-[10px] font-semibold px-1 py-0.2 bg-emerald-100 text-emerald-700 rounded">
                                          Sudah punya kelas
                                        </span>
                                      )}
                                    </div>
                                    {mk.dosen_utama_nama ? (
                                      <div className="text-[10px] text-slate-500 mt-1 truncate" title={mk.dosen_utama_nama}>
                                        <UserCheck className="w-3 h-3 text-indigo-500 inline -mt-0.5 mr-0.5" />
                                        {mk.dosen_utama_nama}
                                      </div>
                                    ) : !hasLecturer ? (
                                      <div className="text-[10px] font-semibold text-amber-700 mt-1">
                                        Dosen pengampu belum ditetapkan
                                      </div>
                                    ) : null}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <span className="font-semibold text-slate-700">
                {selectedCount} dari {totalMk} MK dipilih
                {toGenerateCount > 0 ? ` · ${toGenerateCount} rombel akan dibuat` : " · semua MK sudah punya kelas"}
              </span>
            </div>

            <div className="flex justify-between pt-1">
              <Btn variant="secondary" onClick={() => setStep(1)}>Kembali</Btn>
              <Btn onClick={generateKelas} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? "Membuat kelas..." : "Generate Kelas"}
                {!loading && <ChevronRight className="w-4 h-4" />}
              </Btn>
            </div>
          </Card>
        );
      })()}

      {/* Step 3 — Tagihan UKT */}
      {step === 3 && (
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-slate-800">Konfirmasi dan aktifkan semester</h2>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2.5 text-sm">
            <p className="font-medium text-slate-700 mb-1">Ringkasan</p>
            <div className="flex items-center gap-2 text-slate-600">
              <CalendarDays className="w-4 h-4 text-slate-400" />
              <span>Semester: <strong>{selectedTa?.semester} {selectedTa?.tahun}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <School className="w-4 h-4 text-slate-400" />
              <span>Mata kuliah ditawarkan: <strong>{selectedMk.length} MK</strong></span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <span>Rombel dibuat: <strong>{genLog.filter((g) => g.status === "success").length} kelas</strong></span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Banknote className="w-4 h-4 text-slate-400" />
              <span>Mode UKT: <strong>
                {cfg?.ukt_mode === "flat"    ? `Flat — Rp ${(cfg?.ukt_flat_amount || 0).toLocaleString("id")}`
                : cfg?.ukt_mode === "per_sks" ? `Per SKS — Rp ${(cfg?.ukt_per_sks_amount || 0).toLocaleString("id")}/SKS`
                : "Custom (input manual)"}
              </strong></span>
            </div>
          </div>
          <InfoBox variant="success">Setelah mengklik "Aktifkan Semester", semester ini akan aktif dan mahasiswa dapat mulai mengisi KRS sesuai jadwal.</InfoBox>
          <div className="flex justify-between pt-2">
            <Btn variant="secondary" onClick={() => setStep(2)}>Kembali</Btn>
            <Btn variant="success" onClick={activateSemester} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {loading ? "Mengaktifkan..." : "Aktifkan Semester"}
            </Btn>
          </div>
        </Card>
      )}

      {/* Step 4 — Done */}
      {step === 4 && (
        <Card className="p-10 text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9 text-emerald-600" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Semester Berhasil Diaktifkan</h2>
          <p className="text-slate-500 text-sm">
            <strong>{selectedTa?.semester} {selectedTa?.tahun}</strong> sekarang aktif.<br />
            Mahasiswa dapat mulai mengisi KRS sesuai jadwal yang ditentukan.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Btn variant="secondary" onClick={() => { setStep(0); setSelectedTa(null); setSelectedMk([]); setGenLog([]); setErrMsg(""); }}>
              Setup Semester Lain
            </Btn>
            {onDone && <Btn onClick={onDone}>Kembali ke Dashboard</Btn>}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Fakultas Page ─────────────────────────────────────────────────────────────

export function FakultasPage() {
  const [list, setList] = useState([]);
  const [dosenList, setDosenList] = useState([]);
  const [useFakultas, setUseFakultas] = useState(true);
  const [configLoading, setConfigLoading] = useState(false);
  const [form, setForm] = useState({ kode: "", nama: "", dekan: "", status: "active" });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    API("/api/v1/master/fakultas").then((d) => Array.isArray(d) && setList(d));
    API("/api/v1/master/dosen").then((d) => Array.isArray(d) && setDosenList(d));
    API("/api/v1/master/config").then((d) => {
      if (typeof d?.use_fakultas === "boolean") setUseFakultas(d.use_fakultas);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleUseFakultas = async (val) => {
    setConfigLoading(true);
    setUseFakultas(val);
    await API("/api/v1/master/config", {
      method: "PUT",
      body: JSON.stringify({ use_fakultas: val }),
    });
    setConfigLoading(false);
  };

  const save = async () => {
    setLoading(true);
    if (editing) await API(`/api/v1/master/fakultas/${editing}`, { method: "PUT", body: JSON.stringify(form) });
    else         await API("/api/v1/master/fakultas", { method: "POST", body: JSON.stringify(form) });
    setLoading(false);
    setShowForm(false);
    setEditing(null);
    setForm({ kode: "", nama: "", dekan: "", status: "active" });
    load();
  };

  const dosenOptions = [
    ["", "-- Pilih Dekan (Dosen Aktif) --"],
    ...dosenList.map((d) => [d.name, `${d.name}${d.nip ? ` (NIP: ${d.nip})` : d.email ? ` (${d.email})` : ""}`]),
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Fakultas</h1>
            <p className="text-slate-500 text-sm">Kelola daftar fakultas di kampus Anda</p>
          </div>
        </div>
        {useFakultas && (
          <Btn onClick={() => { setShowForm(true); setEditing(null); setForm({ kode: "", nama: "", dekan: "", status: "active" }); }}>
            Tambah Fakultas
          </Btn>
        )}
      </div>

      {/* Switch Opsi Penggunaan Fakultas */}
      <Card className="p-4 bg-slate-50 border-slate-200 space-y-2">
        <div className="flex items-center justify-between">
          <Toggle
            label="Gunakan Hierarki Fakultas"
            checked={useFakultas}
            onChange={toggleUseFakultas}
            hint="Aktifkan jika kampus Anda mengelompokkan Prodi di bawah Fakultas. Jika Nonaktif, sistem berjalan langsung berbasis Program Studi (PRODI)."
          />
          {configLoading && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
        </div>
      </Card>

      {!useFakultas ? (
        <InfoBox variant="info">
          Hierarki Fakultas saat ini <strong>NONAKTIF</strong>. Sistem sedang berjalan langsung berbasis <strong>Program Studi (PRODI)</strong>. Jika kampus Anda menggunakan Fakultas, aktifkan saklar di atas.
        </InfoBox>
      ) : (
        <>
          {showForm && (
            <Card className="p-5 space-y-4 border-indigo-200 bg-indigo-50/30">
              <h3 className="font-semibold text-slate-800">{editing ? "Edit Fakultas" : "Tambah Fakultas Baru"}</h3>
              <div className="grid grid-cols-2 gap-4">
                <FieldInput label="Kode" value={form.kode} onChange={(v) => setForm((p) => ({ ...p, kode: v }))} placeholder="FT" required />
                <FieldInput label="Nama Fakultas" value={form.nama} onChange={(v) => setForm((p) => ({ ...p, nama: v }))} placeholder="Fakultas Teknik" required />
                <FieldSelect
                  label="Dekan (Dosen Aktif)"
                  value={form.dekan || ""}
                  onChange={(v) => setForm((p) => ({ ...p, dekan: v }))}
                  options={dosenOptions}
                  hint="Pilih dekan dari daftar dosen yang terdaftar di sistem"
                />
                <FieldSelect label="Status" value={form.status} onChange={(v) => setForm((p) => ({ ...p, status: v }))} options={[["active", "Aktif"], ["inactive", "Nonaktif"]]} />
              </div>
              <div className="flex gap-2 justify-end">
                <Btn variant="secondary" onClick={() => setShowForm(false)}>Batal</Btn>
                <Btn onClick={save} disabled={loading || !form.kode || !form.nama}>
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  {loading ? "Menyimpan..." : "Simpan"}
                </Btn>
              </div>
            </Card>
          )}

          <Card>
            {list.length === 0 ? (
              <EmptyState Icon={Building2} title="Belum ada fakultas" desc="Klik Tambah Fakultas untuk memulai" />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["Kode", "Nama Fakultas", "Dekan", "Status", "Aksi"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-mono font-semibold text-indigo-700">{f.kode}</td>
                      <td className="px-4 py-3 font-medium">{f.nama}</td>
                      <td className="px-4 py-3 text-slate-500">{f.dekan || "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge color={f.status === "active" ? "green" : "gray"}>
                          {f.status === "active" ? "Aktif" : "Nonaktif"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <Btn size="sm" variant="ghost" onClick={() => { setEditing(f.id); setForm({ kode: f.kode, nama: f.nama, dekan: f.dekan || "", status: f.status }); setShowForm(true); }}>
                          Edit
                        </Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Program Studi (Prodi) Master Page ────────────────────────────────────────

export function ProdiMasterPage() {
  const [list, setList] = useState([]);
  const [fakultasList, setFakultasList] = useState([]);
  const [dosenList, setDosenList] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [useFakultas, setUseFakultas] = useState(true);

  const [form, setForm] = useState({ kode: "", nama: "", fakultas_id: "", jenjang: "S1", akreditasi: "B", kaprodi: "", status: "active" });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState("");

  // Modal Assign Mahasiswa
  const [activeProdiAssign, setActiveProdiAssign] = useState(null);
  const [selectedMhsIds, setSelectedMhsIds] = useState([]);
  const [mhsSearch, setMhsSearch] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignMsg, setAssignMsg] = useState(null);

  const loadData = useCallback(() => {
    API("/api/v1/master/config").then((c) => c && typeof c.use_fakultas === "boolean" && setUseFakultas(c.use_fakultas));
    API("/api/v1/master/prodi").then((d) => Array.isArray(d) && setList(d.filter((item) => item.status !== "deleted")));
    API("/api/v1/master/fakultas").then((d) => Array.isArray(d) && setFakultasList(d));
    API("/api/v1/master/dosen").then((d) => Array.isArray(d) && setDosenList(d));
    API("/api/students").then((d) => Array.isArray(d?.data) ? setAllStudents(d.data) : Array.isArray(d) && setAllStudents(d));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const save = async () => {
    setLoading(true);
    if (editing) {
      await API(`/api/v1/master/prodi/${editing}`, { method: "PATCH", body: JSON.stringify(form) });
    } else {
      await API("/api/v1/master/prodi", { method: "POST", body: JSON.stringify(form) });
    }
    setLoading(false);
    setShowForm(false);
    setEditing(null);
    setForm({ kode: "", nama: "", fakultas_id: "", jenjang: "S1", akreditasi: "B", kaprodi: "", status: "active" });
    loadData();
  };

  const removeProdi = async (prodi) => {
    const prodiName = prodi.nama || prodi.name || prodi.kode || prodi.id;
    if (!window.confirm(`Hapus program studi ${prodiName}? Data master akan diarsipkan dan tidak muncul lagi di pilihan prodi.`)) return;
    setDeleteLoading(prodi.id);
    const res = await API(`/api/v1/master/prodi/${prodi.id}`, { method: "DELETE" });
    setDeleteLoading("");
    if (!res.ok) {
      window.alert(res.detail || "Program studi tidak dapat dihapus.");
      return;
    }
    loadData();
  };

  const openAssignModal = (prodi) => {
    setActiveProdiAssign(prodi);
    const inProdi = allStudents.filter((m) => m.prodi_id === prodi.id).map((m) => m.id);
    setSelectedMhsIds(inProdi);
    setMhsSearch("");
    setAssignMsg(null);
  };

  const saveAssignProdi = async () => {
    if (!activeProdiAssign) return;
    setAssignLoading(true);
    const res = await API("/api/v1/master/assign-prodi", {
      method: "POST",
      body: JSON.stringify({
        prodi_id: activeProdiAssign.id,
        mahasiswa_ids: selectedMhsIds,
      }),
    });
    setAssignLoading(false);
    if (res.ok) {
      setAssignMsg({ ok: true, text: `Berhasil meng-assign ${res.assigned} mahasiswa ke prodi ${res.prodi}` });
      setTimeout(() => {
        setActiveProdiAssign(null);
        loadData();
      }, 1200);
    } else {
      setAssignMsg({ ok: false, text: res.detail || "Gagal assign prodi" });
    }
  };

  const dosenOptions = [
    ["", "-- Pilih Ketua Prodi / Kaprodi (Dosen Aktif) --"],
    ...dosenList.map((d) => [d.name, `${d.name}${d.nip ? ` (NIP: ${d.nip})` : d.email ? ` (${d.email})` : ""}`]),
  ];

  const fakultasOptions = [
    ["", "-- Tanpa Fakultas --"],
    ...fakultasList.map((f) => [f.id, `${f.nama} (${f.kode})`]),
  ];

  const getFakultasNama = (fid) => {
    const f = fakultasList.find((x) => x.id === fid);
    return f ? f.nama : "—";
  };

  const filteredMhs = allStudents.filter((m) => {
    const q = mhsSearch.toLowerCase().trim();
    return !q || `${m.name} ${m.nim} ${m.prodi_name}`.toLowerCase().includes(q);
  });

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Program Studi (Prodi)</h1>
            <p className="text-slate-500 text-sm">Kelola daftar program studi, Ketua Prodi (Kaprodi), dan penempatan mahasiswa</p>
          </div>
        </div>
        <Btn onClick={() => { setShowForm(true); setEditing(null); setForm({ kode: "", nama: "", fakultas_id: "", jenjang: "D4", akreditasi: "A", kaprodi: "", status: "active" }); }}>
          Tambah Prodi
        </Btn>
      </div>

      {showForm && (
        <Card className="p-5 space-y-4 border-indigo-200 bg-indigo-50/30">
          <h3 className="font-semibold text-slate-800">{editing ? "Edit Program Studi" : "Tambah Program Studi Baru"}</h3>
          <div className="grid grid-cols-2 gap-4">
            <FieldInput label="Kode Prodi" value={form.kode} onChange={(v) => setForm((p) => ({ ...p, kode: v }))} placeholder="IF" required />
            <FieldInput label="Nama Prodi" value={form.nama} onChange={(v) => setForm((p) => ({ ...p, nama: v }))} placeholder="Teknik Informatika" required />
            
            {useFakultas && (
              <FieldSelect
                label="Fakultas"
                value={form.fakultas_id || ""}
                onChange={(v) => setForm((p) => ({ ...p, fakultas_id: v }))}
                options={fakultasOptions}
              />
            )}

            <FieldSelect
              label="Jenjang"
              value={form.jenjang || "D4"}
              onChange={(v) => setForm((p) => ({ ...p, jenjang: v }))}
              options={[["D3", "D3"], ["D4", "D4"], ["S1", "S1"], ["S2", "S2"], ["S3", "S3"]]}
            />

            <FieldSelect
              label="Akreditasi"
              value={form.akreditasi || "A"}
              onChange={(v) => setForm((p) => ({ ...p, akreditasi: v }))}
              options={[["Unggul", "Unggul"], ["Baik Sekali", "Baik Sekali"], ["A", "Akreditasi A"], ["B", "Akreditasi B"], ["C", "Akreditasi C"]]}
            />

            <FieldSelect
              label="Ketua Prodi / Kaprodi (Dosen Aktif)"
              value={form.kaprodi || ""}
              onChange={(v) => setForm((p) => ({ ...p, kaprodi: v }))}
              options={dosenOptions}
              hint="Pilih Kaprodi dari dosen aktif terdaftar"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => setShowForm(false)}>Batal</Btn>
            <Btn onClick={save} disabled={loading || !form.kode || !form.nama}>
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {loading ? "Menyimpan..." : "Simpan"}
            </Btn>
          </div>
        </Card>
      )}

      <Card>
        {list.length === 0 ? (
          <EmptyState Icon={BookOpen} title="Belum ada Program Studi" desc="Klik Tambah Prodi untuk memulai" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Kode</th>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Nama Prodi</th>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Jenjang</th>
                {useFakultas && <th className="text-left px-4 py-3.5 font-bold text-slate-700">Fakultas</th>}
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Ketua Prodi (Kaprodi)</th>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Akreditasi</th>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Mahasiswa</th>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3.5 font-mono font-bold text-indigo-600">{p.kode}</td>
                  <td className="px-4 py-3.5 font-bold text-slate-800">{p.nama}</td>
                  <td className="px-4 py-3.5"><StatusBadge color="blue">{p.jenjang || "D4"}</StatusBadge></td>
                  {useFakultas && <td className="px-4 py-3.5 text-slate-500">{getFakultasNama(p.fakultas_id)}</td>}
                  <td className="px-4 py-3.5 font-semibold text-slate-800">
                    {p.kaprodi ? (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                          <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                        </div>
                        <span className="font-bold text-indigo-950 text-xs">{p.kaprodi}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-xs">— Belum di-set —</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5"><StatusBadge color="green">{p.akreditasi || "A"}</StatusBadge></td>
                  <td className="px-4 py-3.5 font-medium">
                    <StatusBadge color="blue">{p.student_count || 0} Mahasiswa</StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Btn
                        size="sm"
                        variant="secondary"
                        onClick={() => openAssignModal(p)}
                      >
                        <Users className="w-3 h-3" /> Assign Mhs
                      </Btn>
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(p.id);
                          setForm({
                            kode: p.kode || "",
                            nama: p.nama || "",
                            fakultas_id: p.fakultas_id || "",
                            jenjang: p.jenjang || "S1",
                            akreditasi: p.akreditasi || "B",
                            kaprodi: p.kaprodi || "",
                            status: p.status || "active",
                          });
                          setShowForm(true);
                        }}
                      >
                        Edit
                      </Btn>
                      <Btn
                        size="sm"
                        variant="danger"
                        disabled={deleteLoading === p.id}
                        onClick={() => removeProdi(p)}
                        title="Hapus Prodi"
                      >
                        {deleteLoading === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        {deleteLoading === p.id ? "Menghapus..." : "Hapus"}
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Modal Assign Mahasiswa ke Prodi */}
      {activeProdiAssign && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  Assign Mahasiswa ke {activeProdiAssign.nama} ({activeProdiAssign.kode})
                </h3>
                <p className="text-slate-500 text-xs">Centang mahasiswa yang akan ditempatkan pada Program Studi ini</p>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => setActiveProdiAssign(null)}>✕</Btn>
            </div>

            {assignMsg && (
              <InfoBox variant={assignMsg.ok ? "success" : "warning"}>{assignMsg.text}</InfoBox>
            )}

            <div className="flex items-center justify-between gap-4">
              <input
                type="text"
                placeholder="Cari nama atau NIM mahasiswa..."
                className="w-full text-sm p-2 border rounded-md"
                value={mhsSearch}
                onChange={(e) => setMhsSearch(e.target.value)}
              />
              <label className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={filteredMhs.length > 0 && selectedMhsIds.length === filteredMhs.length}
                  onChange={(e) => setSelectedMhsIds(e.target.checked ? filteredMhs.map((m) => m.id) : [])}
                />
                Pilih Semua ({filteredMhs.length})
              </label>
            </div>

            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1 border rounded-md p-2">
              {filteredMhs.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-4">Tidak ada mahasiswa ditemukan</p>
              ) : filteredMhs.map((m) => {
                const isCurrentProdi = m.prodi_id === activeProdiAssign.id;
                return (
                  <label key={m.id} className={`flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer text-sm transition ${selectedMhsIds.includes(m.id) ? "border-indigo-400 bg-indigo-50/80 ring-1 ring-indigo-300" : "border-slate-100 hover:bg-slate-50"}`}>
                    <input
                      type="checkbox"
                      checked={selectedMhsIds.includes(m.id)}
                      onChange={(e) => setSelectedMhsIds((prev) => e.target.checked ? [...prev, m.id] : prev.filter((x) => x !== m.id))}
                    />
                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900 truncate">{m.name}</p>
                        <p className="text-xs text-slate-500">NIM: {m.nim || "—"}</p>
                      </div>
                      {isCurrentProdi ? (
                        <StatusBadge color="green">Terdaftar di Prodi Ini</StatusBadge>
                      ) : m.prodi_name ? (
                        <StatusBadge color="gray">{m.prodi_name}</StatusBadge>
                      ) : (
                        <StatusBadge color="yellow">Belum Ada Prodi</StatusBadge>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Btn variant="secondary" onClick={() => setActiveProdiAssign(null)}>Batal</Btn>
              <Btn onClick={saveAssignProdi} disabled={assignLoading}>
                {assignLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
                {assignLoading ? "Menyimpan..." : `Masukkan ${selectedMhsIds.length} Mahasiswa ke ${activeProdiAssign.kode}`}
              </Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Gedung Master Page ─────────────────────────────────────────────────────────

export function GedungPage() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ kode: "", nama: "", lokasi: "", keterangan: "", status: "active" });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    API("/api/v1/master/gedung").then((d) => Array.isArray(d) && setList(d));
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setLoading(true);
    if (editing) await API(`/api/v1/master/gedung/${editing}`, { method: "PUT", body: JSON.stringify(form) });
    else         await API("/api/v1/master/gedung", { method: "POST", body: JSON.stringify(form) });
    setLoading(false);
    setShowForm(false);
    setEditing(null);
    setForm({ kode: "", nama: "", lokasi: "", keterangan: "", status: "active" });
    load();
  };

  const nonaktifkan = async (g) => {
    if (!window.confirm(`Nonaktifkan gedung "${g.nama}"?`)) return;
    await API(`/api/v1/master/gedung/${g.id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Gedung</h1>
            <p className="text-slate-500 text-sm">Kelola daftar gedung kampus, induk dari Ruangan</p>
          </div>
        </div>
        <Btn onClick={() => { setShowForm(true); setEditing(null); setForm({ kode: "", nama: "", lokasi: "", keterangan: "", status: "active" }); }}>
          Tambah Gedung
        </Btn>
      </div>

      {showForm && (
        <Card className="p-5 space-y-4 border-indigo-200 bg-indigo-50/30">
          <h3 className="font-semibold text-slate-800">{editing ? "Edit Gedung" : "Tambah Gedung Baru"}</h3>
          <div className="grid grid-cols-2 gap-4">
            <FieldInput label="Kode Gedung" value={form.kode} onChange={(v) => setForm((p) => ({ ...p, kode: v }))} placeholder="G1 / A" required />
            <FieldInput label="Nama Gedung" value={form.nama} onChange={(v) => setForm((p) => ({ ...p, nama: v }))} placeholder="Gedung A" required />
            <FieldInput label="Lokasi" value={form.lokasi} onChange={(v) => setForm((p) => ({ ...p, lokasi: v }))} placeholder="Kampus A, Jl. ..." hint="Misal: Kampus A / Kampus B" />
            <FieldSelect label="Status" value={form.status} onChange={(v) => setForm((p) => ({ ...p, status: v }))} options={[["active", "Aktif"], ["inactive", "Nonaktif"]]} />
            <div className="col-span-2">
              <FieldInput label="Keterangan" value={form.keterangan} onChange={(v) => setForm((p) => ({ ...p, keterangan: v }))} placeholder="Opsional" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => setShowForm(false)}>Batal</Btn>
            <Btn onClick={save} disabled={loading || !form.kode || !form.nama}>
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {loading ? "Menyimpan..." : "Simpan"}
            </Btn>
          </div>
        </Card>
      )}

      <Card>
        {list.length === 0 ? (
          <EmptyState Icon={Building2} title="Belum ada gedung" desc="Klik Tambah Gedung untuk memulai" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Kode</th>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Nama Gedung</th>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Lokasi</th>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Ruangan</th>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Status</th>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3.5 font-mono font-bold text-indigo-600">{g.kode}</td>
                  <td className="px-4 py-3.5 font-bold text-slate-800">{g.nama}</td>
                  <td className="px-4 py-3.5 text-slate-500">{g.lokasi || "—"}</td>
                  <td className="px-4 py-3.5"><StatusBadge color="blue">{g.ruangan_count || 0} Ruangan</StatusBadge></td>
                  <td className="px-4 py-3.5">
                    <StatusBadge color={g.status === "active" ? "green" : "gray"}>
                      {g.status === "active" ? "Aktif" : "Nonaktif"}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Btn size="sm" variant="ghost" onClick={() => { setEditing(g.id); setForm({ kode: g.kode, nama: g.nama, lokasi: g.lokasi || "", keterangan: g.keterangan || "", status: g.status || "active" }); setShowForm(true); }}>
                        Edit
                      </Btn>
                      {g.status === "active" && (
                        <Btn size="sm" variant="danger" onClick={() => nonaktifkan(g)}>Nonaktif</Btn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ─── Ruangan Master Page ────────────────────────────────────────────────────────

export function RuanganPage() {
  const [list, setList] = useState([]);
  const [gedungList, setGedungList] = useState([]);
  const [gedungFilter, setGedungFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [form, setForm] = useState({ kode: "", nama: "", gedung_id: "", lantai: "", kapasitas: "", keterangan: "", status: "active" });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    API("/api/v1/master/ruangan").then((d) => Array.isArray(d) && setList(d));
    API("/api/v1/master/gedung").then((d) => Array.isArray(d) && setGedungList(d));
  }, []);

  useEffect(() => { load(); }, [load]);

  const gedungOptions = [
    ["", "-- Pilih Gedung --"],
    ...gedungList.filter((g) => g.status === "active").map((g) => [g.id, `${g.nama} (${g.kode})`]),
  ];

  const getGedungNama = (gid) => {
    const g = gedungList.find((x) => x.id === gid);
    return g ? `${g.nama} (${g.kode})` : "—";
  };

  const filtered = list.filter((r) => {
    if (gedungFilter !== "all" && r.gedung_id !== gedungFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const text = `${r.kode} ${r.nama} ${r.gedung_nama || ""} ${r.lantai || ""}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const save = async () => {
    setLoading(true);
    const payload = { ...form, kapasitas: form.kapasitas === "" ? null : Number(form.kapasitas) };
    if (editing) await API(`/api/v1/master/ruangan/${editing}`, { method: "PATCH", body: JSON.stringify(payload) });
    else         await API("/api/v1/master/ruangan", { method: "POST", body: JSON.stringify(payload) });
    setLoading(false);
    setShowForm(false);
    setEditing(null);
    setForm({ kode: "", nama: "", gedung_id: "", lantai: "", kapasitas: "", keterangan: "", status: "active" });
    load();
  };

  const nonaktifkan = async (r) => {
    if (!window.confirm(`Nonaktifkan ruangan "${r.nama}"?`)) return;
    await API(`/api/v1/master/ruangan/${r.id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <School className="w-5 h-5 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Ruangan</h1>
            <p className="text-slate-500 text-sm">Kelola ruang kuliah / ruangan di bawah Gedung</p>
          </div>
        </div>
        <Btn onClick={() => { setShowForm(true); setEditing(null); setForm({ kode: "", nama: "", gedung_id: gedungFilter !== "all" ? gedungFilter : "", lantai: "", kapasitas: "", keterangan: "", status: "active" }); }}>
          Tambah Ruangan
        </Btn>
      </div>

      {showForm && (
        <Card className="p-5 space-y-4 border-indigo-200 bg-indigo-50/30">
          <h3 className="font-semibold text-slate-800">{editing ? "Edit Ruangan" : "Tambah Ruangan Baru"}</h3>
          <div className="grid grid-cols-2 gap-4">
            <FieldInput label="Kode Ruangan" value={form.kode} onChange={(v) => setForm((p) => ({ ...p, kode: v }))} placeholder="A1101 / R.101" required />
            <FieldInput label="Nama Ruangan" value={form.nama} onChange={(v) => setForm((p) => ({ ...p, nama: v }))} placeholder="Ruang 101" required />
            <FieldSelect
              label="Gedung"
              value={form.gedung_id || ""}
              onChange={(v) => setForm((p) => ({ ...p, gedung_id: v }))}
              options={gedungOptions}
              hint="Pilih gedung tempat ruangan berada"
            />
            <FieldInput label="Lantai" value={form.lantai} onChange={(v) => setForm((p) => ({ ...p, lantai: v }))} placeholder="1" />
            <FieldInput label="Kapasitas" value={form.kapasitas} onChange={(v) => setForm((p) => ({ ...p, kapasitas: v }))} placeholder="30" type="number" />
            <FieldSelect label="Status" value={form.status} onChange={(v) => setForm((p) => ({ ...p, status: v }))} options={[["active", "Aktif"], ["inactive", "Nonaktif"]]} />
            <div className="col-span-2">
              <FieldInput label="Keterangan" value={form.keterangan} onChange={(v) => setForm((p) => ({ ...p, keterangan: v }))} placeholder="Opsional" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => setShowForm(false)}>Batal</Btn>
            <Btn onClick={save} disabled={loading || !form.kode || !form.nama}>
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {loading ? "Menyimpan..." : "Simpan"}
            </Btn>
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <select
            value={gedungFilter}
            onChange={(e) => setGedungFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="all">Semua Gedung</option>
            {gedungList.map((g) => (
              <option key={g.id} value={g.id}>{g.nama} ({g.kode})</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Cari kode / nama ruangan / gedung / lantai..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-80 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <span className="text-xs text-slate-500 sm:ml-auto">{filtered.length} ruangan</span>
        </div>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState Icon={School} title="Tidak ada ruangan" desc="Klik Tambah Ruangan untuk memulai" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Kode</th>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Nama Ruangan</th>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Gedung</th>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Lantai</th>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Kapasitas</th>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Status</th>
                <th className="text-left px-4 py-3.5 font-bold text-slate-700">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3.5 font-mono font-bold text-indigo-600">{r.kode}</td>
                  <td className="px-4 py-3.5 font-bold text-slate-800">{r.nama}</td>
                  <td className="px-4 py-3.5 text-slate-500">{r.gedung_nama || getGedungNama(r.gedung_id)}</td>
                  <td className="px-4 py-3.5 text-slate-500">{r.lantai || "—"}</td>
                  <td className="px-4 py-3.5"><StatusBadge color="blue">{r.kapasitas != null ? `${r.kapasitas} Orang` : "—"}</StatusBadge></td>
                  <td className="px-4 py-3.5">
                    <StatusBadge color={r.status === "active" ? "green" : "gray"}>
                      {r.status === "active" ? "Aktif" : "Nonaktif"}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Btn size="sm" variant="ghost" onClick={() => { setEditing(r.id); setForm({ kode: r.kode, nama: r.nama, gedung_id: r.gedung_id || "", lantai: r.lantai || "", kapasitas: r.kapasitas != null ? String(r.kapasitas) : "", keterangan: r.keterangan || "", status: r.status || "active" }); setShowForm(true); }}>
                        Edit
                      </Btn>
                      {r.status === "active" && (
                        <Btn size="sm" variant="danger" onClick={() => nonaktifkan(r)}>Nonaktif</Btn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ─── Tahun Ajaran Page ─────────────────────────────────────────────────────────
export function TahunAjaranPage() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ tahun: "", semester: "Ganjil", tanggal_mulai: "", tanggal_selesai: "", krs_buka: "", krs_tutup: "" });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => API("/api/v1/master/tahun-ajaran").then((d) => Array.isArray(d) && setList(d)), []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setLoading(true);
    if (editing) await API(`/api/v1/master/tahun-ajaran/${editing}`, { method: "PUT", body: JSON.stringify(form) });
    else         await API("/api/v1/master/tahun-ajaran", { method: "POST", body: JSON.stringify(form) });
    setLoading(false);
    setShowForm(false);
    setEditing(null);
    load();
  };

  const activate = async (id) => {
    if (!window.confirm("Aktifkan semester ini? Semester lain akan dinonaktifkan.")) return;
    await API(`/api/v1/master/tahun-ajaran/${id}/activate`, { method: "PUT" });
    load();
  };

  const close = async (id) => {
    if (!window.confirm("Tutup dan arsipkan semester ini?")) return;
    await API(`/api/v1/master/tahun-ajaran/${id}/close`, { method: "PUT" });
    load();
  };

  const statusColor = { active: "green", draft: "blue", closed: "gray" };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Tahun Ajaran & Semester</h1>
            <p className="text-slate-500 text-sm">Kelola siklus semester dan aktifkan semester yang sedang berjalan</p>
          </div>
        </div>
        <Btn onClick={() => { setShowForm(true); setEditing(null); setForm({ tahun: "", semester: "Ganjil", tanggal_mulai: "", tanggal_selesai: "", krs_buka: "", krs_tutup: "" }); }}>
          Buat Semester Baru
        </Btn>
      </div>

      {showForm && (
        <Card className="p-5 space-y-4 border-indigo-200 bg-indigo-50/30">
          <h3 className="font-semibold text-slate-800">{editing ? "Edit Semester" : "Buat Semester Baru"}</h3>
          <div className="grid grid-cols-2 gap-4">
            <FieldInput label="Tahun Akademik" value={form.tahun} onChange={(v) => setForm((p) => ({ ...p, tahun: v }))} placeholder="2025/2026" required />
            <FieldSelect label="Semester" value={form.semester} onChange={(v) => setForm((p) => ({ ...p, semester: v }))} options={[["Ganjil", "Ganjil"], ["Genap", "Genap"]]} />
            <FieldInput label="Tanggal Mulai" type="date" value={form.tanggal_mulai} onChange={(v) => setForm((p) => ({ ...p, tanggal_mulai: v }))} />
            <FieldInput label="Tanggal Selesai" type="date" value={form.tanggal_selesai} onChange={(v) => setForm((p) => ({ ...p, tanggal_selesai: v }))} />
            <FieldInput label="KRS Dibuka" type="datetime-local" value={form.krs_buka} onChange={(v) => setForm((p) => ({ ...p, krs_buka: v }))} />
            <FieldInput label="KRS Ditutup" type="datetime-local" value={form.krs_tutup} onChange={(v) => setForm((p) => ({ ...p, krs_tutup: v }))} />
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => setShowForm(false)}>Batal</Btn>
            <Btn onClick={save} disabled={loading || !form.tahun}>
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {loading ? "Menyimpan..." : "Simpan"}
            </Btn>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {list.length === 0 ? (
          <Card><EmptyState Icon={CalendarDays} title="Belum ada tahun ajaran" desc="Klik Buat Semester Baru atau gunakan Wizard Setup Semester" /></Card>
        ) : list.map((ta) => (
          <Card key={ta.id} className={`p-4 ${ta.is_active ? "border-emerald-400 ring-1 ring-emerald-200" : ""}`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {ta.is_active && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />}
                <div>
                  <p className="font-semibold text-slate-900">{ta.semester} {ta.tahun}</p>
                  <p className="text-xs text-slate-400">
                    Kode: {ta.kode}
                    {ta.krs_buka && ` — KRS: ${new Date(ta.krs_buka).toLocaleDateString("id")} s.d. ${new Date(ta.krs_tutup).toLocaleDateString("id")}`}
                  </p>
                </div>
                <StatusBadge color={statusColor[ta.status] || "gray"}>
                  {ta.is_active ? "Aktif" : ta.status === "closed" ? "Selesai" : "Draft"}
                </StatusBadge>
              </div>
              <div className="flex gap-2">
                <Btn size="sm" variant="ghost" onClick={() => { setEditing(ta.id); setForm({ tahun: ta.tahun, semester: ta.semester, tanggal_mulai: ta.tanggal_mulai || "", tanggal_selesai: ta.tanggal_selesai || "", krs_buka: ta.krs_buka || "", krs_tutup: ta.krs_tutup || "" }); setShowForm(true); }}>
                  Edit
                </Btn>
                {!ta.is_active && ta.status !== "closed" && (
                  <Btn size="sm" variant="success" onClick={() => activate(ta.id)}>Aktifkan</Btn>
                )}
                {ta.is_active && (
                  <Btn size="sm" variant="danger" onClick={() => close(ta.id)}>Tutup Semester</Btn>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Dosen Wali Page ───────────────────────────────────────────────────────────

export function DosenWaliPage({ user }) {
  const [dosenList, setDosenList] = useState([]);
  const [mhsList, setMhsList] = useState([]);
  const [prodiList, setProdiList] = useState([]);
  const [selectedProdi, setSelectedProdi] = useState("");
  const [selectedDosen, setSelectedDosen] = useState("");
  const [selectedMhs, setSelectedMhs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [result, setResult] = useState(null);

  const isKaprodi = Boolean(
    user &&
    user.role !== "admin" &&
    (user.is_kaprodi || user.kaprodi_prodi_id || (user.jabatan_akademik || "").toLowerCase().includes("kaprodi"))
  );
  const kaprodiProdiId = user?.kaprodi_prodi_id || user?.prodi_id;

  useEffect(() => {
    if (isKaprodi && kaprodiProdiId && !selectedProdi) {
      setSelectedProdi(kaprodiProdiId);
    }
  }, [isKaprodi, kaprodiProdiId, selectedProdi]);

  const loadData = useCallback(() => {
    API("/api/v1/master/dosen").then((d) => Array.isArray(d) && setDosenList(d));
    API("/api/students").then((d) => Array.isArray(d?.data) ? setMhsList(d.data) : Array.isArray(d) && setMhsList(d));
    API("/api/v1/master/prodi").then((d) => Array.isArray(d) && setProdiList(d));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const assign = async () => {
    if (!selectedDosen || selectedMhs.length === 0) return;
    setLoading(true);
    const res = await API("/api/v1/master/assign-wali", {
      method: "POST",
      body: JSON.stringify({ dosen_id: selectedDosen, mahasiswa_ids: selectedMhs }),
    });
    setLoading(false);
    setResult(res.ok ? { ok: true, msg: `${res.assigned} mahasiswa berhasil di-assign ke ${res.dosen}` } : { ok: false, msg: res.detail || "Gagal assign" });
    if (res.ok) {
      setSelectedMhs([]);
      loadData();
    }
  };

  const autoAssign = async () => {
    if (selectedMhs.length === 0) return;
    setAutoLoading(true);
    const res = await API("/api/v1/master/auto-assign-wali", {
      method: "POST",
      body: JSON.stringify({ prodi_id: selectedProdi, mahasiswa_ids: selectedMhs }),
    });
    setAutoLoading(false);
    setResult(res.ok ? { ok: true, msg: `Berhasil membagi ${res.assigned} mahasiswa secara merata ke ${res.dosen_count} dosen homebase!` } : { ok: false, msg: res.detail || "Gagal auto-assign" });
    if (res.ok) {
      setSelectedMhs([]);
      loadData();
    }
  };

  const kaprodiProdiObj = useMemo(() => {
    if (!kaprodiProdiId) return null;
    const target = String(kaprodiProdiId).toLowerCase();
    return prodiList.find((p) => String(p.id).toLowerCase() === target || String(p.kode).toLowerCase() === target);
  }, [prodiList, kaprodiProdiId]);

  // Filtered Students
  const filteredMhs = useMemo(() => {
    if (isKaprodi && kaprodiProdiId) {
      const target = String(kaprodiProdiId).toLowerCase();
      return mhsList.filter((m) =>
        String(m.prodi_id || "").toLowerCase() === target ||
        String(m.prodi_kode || "").toLowerCase() === target ||
        String(m.prodi_name || m.prodi_nama || "").toLowerCase().includes(target)
      );
    }
    if (selectedProdi) {
      return mhsList.filter((m) => m.prodi_id === selectedProdi);
    }
    return mhsList;
  }, [mhsList, isKaprodi, kaprodiProdiId, selectedProdi]);

  const prodiOptions = isKaprodi && kaprodiProdiId
    ? [[kaprodiProdiId, kaprodiProdiObj ? `${kaprodiProdiObj.nama} (${kaprodiProdiObj.kode})` : kaprodiProdiId]]
    : [
        ["", "-- Semua Program Studi --"],
        ...prodiList.map((p) => [p.id, `${p.nama} (${p.kode})`]),
      ];

  const targetProdi = isKaprodi ? kaprodiProdiId : selectedProdi;

  const homebaseDosenList = useMemo(() => {
    if (!targetProdi) return dosenList;
    const target = String(targetProdi).toLowerCase();
    return dosenList.filter((d) => {
      const pId = String(d.prodi_id || "").toLowerCase();
      const kId = String(d.kaprodi_prodi_id || "").toLowerCase();
      const hName = String(d.homebase || "").toLowerCase();
      const pKode = String(d.prodi_kode || "").toLowerCase();
      return pId === target || kId === target || hName.includes(target) || pKode === target;
    });
  }, [dosenList, targetProdi]);

  // Smart Recommendation Lecturer Sorting
  const sortedDosenList = useMemo(() => {
    return [...homebaseDosenList].sort((a, b) => {
      const aLeadership = a.is_kaprodi || a.is_dekan || a.jabatan?.toLowerCase().includes("kaprodi") || a.jabatan?.toLowerCase().includes("dekan");
      const bLeadership = b.is_kaprodi || b.is_dekan || b.jabatan?.toLowerCase().includes("kaprodi") || b.jabatan?.toLowerCase().includes("dekan");
      if (aLeadership && !bLeadership) return -1;
      if (!aLeadership && bLeadership) return 1;

      return (a.bimbingan_count || 0) - (b.bimbingan_count || 0);
    });
  }, [homebaseDosenList]);

  const dosenSelected = dosenList.find((d) => d.id === selectedDosen);

  const toggleSelectAllMhs = (e) => {
    if (e.target.checked) {
      setSelectedMhs(filteredMhs.map((m) => m.id));
    } else {
      setSelectedMhs([]);
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <UserCheck className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Assign Dosen Wali (Smart Recommendation)</h1>
            <p className="text-slate-500 text-sm">Rekomendasi otomatis Dosen Homebase, Kaprodi, dan pembagian bimbingan merata</p>
          </div>
        </div>

        {selectedMhs.length > 0 && (
          <Btn onClick={autoAssign} disabled={autoLoading} variant="success">
            {autoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {autoLoading ? "Membagi..." : `Auto-Assign Merata (${selectedMhs.length} Mhs)`}
          </Btn>
        )}
      </div>

      {isKaprodi && (
        <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-4 flex items-center gap-3 text-indigo-900 shadow-sm">
          <div className="h-9 w-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
            <Award className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-sm">Hak Akses Kaprodi: Program Studi {prodiList.find(p => p.id === kaprodiProdiId)?.nama || kaprodiProdiId}</p>
            <p className="text-xs text-indigo-700 mt-0.5">
              Sebagai Ketua Program Studi (Kaprodi), Anda memiliki wewenang menugaskan Dosen Wali (Pembimbing Akademik) bagi Mahasiswa khusus di Program Studi Anda.
            </p>
          </div>
        </div>
      )}

      {/* Filter Prodi */}
      <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <span className="text-sm font-medium text-slate-700">Filter Program Studi:</span>
        <div className="w-80">
          <FieldSelect
            value={isKaprodi ? kaprodiProdiId : selectedProdi}
            onChange={(v) => !isKaprodi && setSelectedProdi(v)}
            options={prodiOptions}
            disabled={isKaprodi}
          />
        </div>
      </div>

      {result && (
        <InfoBox variant={result.ok ? "success" : "warning"}>{result.msg}</InfoBox>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Panel 1: Dosen Wali dengan Smart Recommendation */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-sm">1. Pilih Dosen Wali</h3>
            <span className="text-xs text-indigo-600 font-medium flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-indigo-600 inline" /> Diurutkan per Rekomendasi</span>
          </div>
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {sortedDosenList.length === 0 ? (
              <EmptyState Icon={Users} title="Belum ada dosen" />
            ) : sortedDosenList.map((d) => {
              const isHomebase = targetProdi && (d.prodi_id === targetProdi || d.kaprodi_prodi_id === targetProdi || (d.homebase || "").toLowerCase().includes(String(targetProdi).toLowerCase()));
              const isLeadership = d.is_kaprodi || d.is_dekan || d.jabatan?.toLowerCase().includes("kaprodi") || d.jabatan?.toLowerCase().includes("dekan");

              return (
                <label key={d.id} className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition ${selectedDosen === d.id ? "border-indigo-500 bg-indigo-50/80 ring-1 ring-indigo-400" : "border-slate-200 hover:bg-slate-50"}`}>
                  <input type="radio" name="dosen" className="mt-1" checked={selectedDosen === d.id} onChange={() => setSelectedDosen(d.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">{d.name}</p>
                      <StatusBadge color="blue">{d.bimbingan_count || 0} Mhs</StatusBadge>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{d.nip ? `NIP: ${d.nip}` : d.email}</p>

                    <div className="flex flex-wrap gap-1 mt-1">
                      {isLeadership && (
                        <StatusBadge color="purple"><Award className="w-3 h-3 inline mr-1" /> Kaprodi / Dekan</StatusBadge>
                      )}
                      {isHomebase && (
                        <StatusBadge color="green"><Building2 className="w-3 h-3 inline mr-1" /> Homebase</StatusBadge>
                      )}
                      {d.is_wali && !isLeadership && !isHomebase && (
                        <StatusBadge color="gray">Dosen Wali</StatusBadge>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </Card>

        {/* Panel 2: Daftar Mahasiswa */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-sm">2. Pilih Mahasiswa</h3>
            <label className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium cursor-pointer">
              <input type="checkbox" onChange={toggleSelectAllMhs} checked={filteredMhs.length > 0 && selectedMhs.length === filteredMhs.length} />
              Pilih Semua ({filteredMhs.length})
            </label>
          </div>
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {filteredMhs.length === 0 ? (
              <EmptyState Icon={Users} title="Belum ada mahasiswa" />
            ) : filteredMhs.map((m) => (
              <label key={m.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer text-sm transition ${selectedMhs.includes(m.id) ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                <input type="checkbox" checked={selectedMhs.includes(m.id)} onChange={(e) => setSelectedMhs((p) => e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id))} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-slate-900">{m.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    NIM: {m.nim || "—"}
                    {m.dosen_wali_name ? ` — Wali: ${m.dosen_wali_name}` : " — (Belum ada wali)"}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-slate-500">
          Tip: Gunakan <strong>Auto-Assign Merata</strong> untuk langsung mengalokasikan bimbingan secara seimbang tanpa repot.
        </p>

        <Btn onClick={assign} disabled={loading || !selectedDosen || selectedMhs.length === 0} size="lg">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
          {loading ? "Menyimpan..." : `Assign Manual ${selectedMhs.length} Mahasiswa${dosenSelected ? ` ke ${dosenSelected.name}` : ""}`}
        </Btn>
      </div>
    </div>
  );
}

// ─── Penempatan Mahasiswa > Prodi Page ───────────────────────────────────────

export function MahasiswaProdiPage() {
  const [prodiList, setProdiList] = useState([]);
  const [mhsList, setMhsList] = useState([]);
  const [selectedProdi, setSelectedProdi] = useState("");
  const [selectedMhs, setSelectedMhs] = useState([]);
  const [filterProdiMode, setFilterProdiMode] = useState("unassigned"); // "all" | "unassigned" | prodi_id
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const loadData = useCallback(() => {
    API("/api/v1/master/prodi").then((d) => Array.isArray(d) && setProdiList(d));
    API("/api/students").then((d) => Array.isArray(d?.data) ? setMhsList(d.data) : Array.isArray(d) && setMhsList(d));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const assignProdi = async () => {
    if (!selectedProdi || selectedMhs.length === 0) return;
    setLoading(true);
    const res = await API("/api/v1/master/assign-prodi", {
      method: "POST",
      body: JSON.stringify({ prodi_id: selectedProdi, mahasiswa_ids: selectedMhs }),
    });
    setLoading(false);
    setResult(
      res.ok
        ? { ok: true, msg: `${res.assigned} mahasiswa berhasil dialokasikan ke Program Studi ${res.prodi}` }
        : { ok: false, msg: res.detail || "Gagal alokasi prodi" }
    );
    if (res.ok) {
      setSelectedMhs([]);
      loadData();
    }
  };

  // Stats
  const totalMhs = mhsList.length;
  const unassignedMhs = mhsList.filter((m) => !m.prodi_id);
  const assignedMhs = mhsList.filter((m) => !!m.prodi_id);

  // Filtered Students
  const filteredMhs = mhsList.filter((m) => {
    // 1. Filter Status
    if (filterProdiMode === "unassigned" && m.prodi_id) return false;
    if (filterProdiMode !== "all" && filterProdiMode !== "unassigned" && m.prodi_id !== filterProdiMode) return false;
    // 2. Search Query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const text = `${m.name || ""} ${m.nim || ""} ${m.prodi_name || ""}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const targetProdiObj = prodiList.find((p) => p.id === selectedProdi);

  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedMhs(filteredMhs.map((m) => m.id));
    } else {
      setSelectedMhs([]);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Penempatan Mahasiswa ➔ Program Studi (Prodi)</h1>
            <p className="text-slate-500 text-sm">Alokasikan mahasiswa ke Program Studi secara efisien dan batch sekaligus</p>
          </div>
        </div>

        {selectedMhs.length > 0 && selectedProdi && (
          <Btn onClick={assignProdi} disabled={loading} variant="success" size="lg">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
            {loading ? "Menyimpan..." : `Alokasikan ${selectedMhs.length} Mhs ke ${targetProdiObj?.kode || "Prodi"}`}
          </Btn>
        )}
      </div>

      {/* Ringkasan Status Mahasiswa */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 bg-slate-50 border-slate-200">
          <p className="text-xs text-slate-500 font-medium">Total Mahasiswa</p>
          <p className="text-2xl font-bold text-slate-900">{totalMhs}</p>
        </Card>
        <Card className="p-4 bg-emerald-50/60 border-emerald-200">
          <p className="text-xs text-emerald-700 font-medium">Sudah Punya Prodi</p>
          <p className="text-2xl font-bold text-emerald-800">{assignedMhs.length}</p>
        </Card>
        <Card className="p-4 bg-amber-50/60 border-amber-200">
          <p className="text-xs text-amber-700 font-medium">Belum Ada Prodi (Perlu Alokasi)</p>
          <p className="text-2xl font-bold text-amber-800">{unassignedMhs.length}</p>
        </Card>
      </div>

      {result && (
        <InfoBox variant={result.ok ? "success" : "warning"}>{result.msg}</InfoBox>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Panel 1: Pilih Program Studi Tujuan */}
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-slate-800 text-sm">1. Pilih Program Studi Tujuan</h3>
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {prodiList.length === 0 ? (
              <EmptyState Icon={BookOpen} title="Belum ada prodi" desc="Buat Prodi terlebih dahulu di Data Master" />
            ) : prodiList.map((p) => (
              <label
                key={p.id}
                className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition ${selectedProdi === p.id ? "border-indigo-500 bg-indigo-50/80 ring-1 ring-indigo-400" : "border-slate-200 hover:bg-slate-50"}`}
              >
                <input type="radio" name="prodi_target" className="mt-1" checked={selectedProdi === p.id} onChange={() => setSelectedProdi(p.id)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{p.nama}</p>
                    <StatusBadge color="blue">{p.student_count || 0} Mhs</StatusBadge>
                  </div>
                  <p className="text-xs font-mono font-medium text-indigo-700">Kode: {p.kode} · {p.jenjang || "S1"}</p>
                  {p.kaprodi && <p className="text-xs text-slate-500 truncate mt-0.5">Kaprodi: {p.kaprodi}</p>}
                </div>
              </label>
            ))}
          </div>
        </Card>

        {/* Panel 2: Pilih Mahasiswa */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-sm">2. Pilih Mahasiswa</h3>
            <label className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium cursor-pointer">
              <input type="checkbox" onChange={toggleSelectAll} checked={filteredMhs.length > 0 && selectedMhs.length === filteredMhs.length} />
              Pilih Semua ({filteredMhs.length})
            </label>
          </div>

          {/* Filter Bar Mahasiswa */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Cari nama / NIM..."
              className="text-xs p-2 border rounded-md w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="text-xs p-2 border rounded-md shrink-0 bg-white"
              value={filterProdiMode}
              onChange={(e) => setFilterProdiMode(e.target.value)}
            >
              <option value="unassigned">Belum Ada Prodi ({unassignedMhs.length})</option>
              <option value="all">Semua Mahasiswa ({totalMhs})</option>
              {prodiList.map((p) => (
                <option key={p.id} value={p.id}>Prodi {p.kode}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {filteredMhs.length === 0 ? (
              <EmptyState Icon={Users} title="Tidak ada mahasiswa" desc="Ubah filter pencarian untuk melihat data" />
            ) : filteredMhs.map((m) => (
              <label key={m.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer text-sm transition ${selectedMhs.includes(m.id) ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                <input type="checkbox" checked={selectedMhs.includes(m.id)} onChange={(e) => setSelectedMhs((prev) => e.target.checked ? [...prev, m.id] : prev.filter((x) => x !== m.id))} />
                <div className="flex-1 min-w-0 flex items-center justify-between gap-1">
                  <div>
                    <p className="font-medium text-slate-900 truncate">{m.name}</p>
                    <p className="text-xs text-slate-400">NIM: {m.nim || "—"}</p>
                  </div>
                  {m.prodi_name ? (
                    <StatusBadge color="gray">{m.prodi_name}</StatusBadge>
                  ) : (
                    <StatusBadge color="yellow">Belum Ada Prodi</StatusBadge>
                  )}
                </div>
              </label>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-slate-500">
          Mahasiswa yang telah dialokasikan akan langsung terhubung dengan kurikulum, paket semester, dan KRS Prodi.
        </p>

        <Btn onClick={assignProdi} disabled={loading || !selectedProdi || selectedMhs.length === 0} size="lg">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
          {loading ? "Menyimpan..." : `Alokasikan ${selectedMhs.length} Mahasiswa${targetProdiObj ? ` ke ${targetProdiObj.nama}` : ""}`}
        </Btn>
      </div>
    </div>
  );
}


export function EnrollWizardPage() {
  const [step, setStep] = useState(1);
  const [prodiList, setProdiList] = useState([]);
  const [mhsList, setMhsList] = useState([]);
  const [classList, setClassList] = useState([]);

  const [selectedProdi, setSelectedProdi] = useState("");
  const [selectedMhs, setSelectedMhs] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [angkatan, setAngkatan] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState("unassigned");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const loadData = useCallback(() => {
    API("/api/v1/master/prodi").then((d) => Array.isArray(d) && setProdiList(d));
    API("/api/students").then((d) => {
      const list = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
      setMhsList(list);
    });
    API("/api/classes").then((d) => Array.isArray(d) && setClassList(d));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const targetProdi = prodiList.find((p) => p.id === selectedProdi);
  const targetClass = classList.find((c) => c.id === selectedClass);

  const prodiClasses = classList.filter(
    (c) => c.status === "active" && (!selectedProdi || c.program_id === selectedProdi),
  );

  const filteredMhs = mhsList.filter((m) => {
    if (filterMode === "unassigned" && m.prodi_id) return false;
    if (filterMode === "in_prodi" && m.prodi_id !== selectedProdi) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const text = `${m.name || ""} ${m.nim || ""} ${m.prodi_name || ""}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const toggleMhs = (id, checked) => {
    setSelectedMhs((prev) => checked ? [...prev, id] : prev.filter((x) => x !== id));
  };

  const toggleAll = (e) => {
    setSelectedMhs(e.target.checked ? filteredMhs.map((m) => m.id) : []);
  };

  const canProceed1 = !!selectedProdi;
  const canProceed2 = selectedMhs.length > 0;

  const doEnroll = async () => {
    if (!selectedProdi || selectedMhs.length === 0) return;
    setLoading(true);
    const payload = {
      prodi_id: selectedProdi,
      mahasiswa_ids: selectedMhs,
      class_id: selectedClass || undefined,
      angkatan: angkatan || undefined,
    };
    const res = await API("/api/v1/master/enroll-wizard", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (res.ok) {
      const parts = [`${res.assigned} mahasiswa berhasil dialokasikan ke Prodi ${res.prodi}`];
      if (res.class_name) parts.push(`dan masuk ke kelas ${res.class_name}`);
      setResult({ ok: true, msg: parts.join(" ") });
      setSelectedMhs([]);
      setStep(1);
      loadData();
    } else {
      setResult({ ok: false, msg: res.detail || "Gagal menjalankan wizard" });
    }
  };

  const stepLabels = ["Pilih Prodi", "Pilih Mahasiswa", "Pilih Kelas & Simpan"];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
          <Wand2 className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Wizard Pendaftaran Mahasiswa</h1>
          <p className="text-slate-500 text-sm">Prodi &rarr; Mahasiswa &rarr; Kelas — dalam satu halaman</p>
        </div>
      </div>

      {result && (
        <InfoBox variant={result.ok ? "success" : "warning"}>{result.msg}</InfoBox>
      )}

      <div className="flex items-center gap-2">
        {stepLabels.map((label, i) => {
          const s = i + 1;
          const active = step === s;
          const done = step > s;
          return (
            <React.Fragment key={s}>
              {i > 0 && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
              <button
                type="button"
                onClick={() => {
                  if (s === 1) setStep(1);
                  if (s === 2 && canProceed1) setStep(2);
                  if (s === 3 && canProceed1 && canProceed2) setStep(3);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  active
                    ? "bg-indigo-600 text-white"
                    : done
                      ? "bg-emerald-100 text-emerald-700 cursor-pointer"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {done ? <Check className="w-3.5 h-3.5" /> : <span>{s}</span>}
                {label}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {step === 1 && (
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold text-slate-800">Langkah 1 — Pilih Program Studi</h3>
          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
            {prodiList.length === 0 ? (
              <EmptyState Icon={BookOpen} title="Belum ada prodi" desc="Buat Prodi terlebih dahulu di Data Master" />
            ) : prodiList.map((p) => (
              <label
                key={p.id}
                className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition ${
                  selectedProdi === p.id
                    ? "border-indigo-500 bg-indigo-50/80 ring-1 ring-indigo-400"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="wizard_prodi"
                  className="mt-1"
                  checked={selectedProdi === p.id}
                  onChange={() => setSelectedProdi(p.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{p.nama || p.name}</p>
                    <StatusBadge color="blue">{p.student_count || 0} Mhs</StatusBadge>
                  </div>
                  <p className="text-xs font-mono font-medium text-indigo-700">
                    Kode: {p.kode || p.code} &middot; {p.jenjang || "S1"}
                  </p>
                </div>
              </label>
            ))}
          </div>
          <div className="flex justify-end pt-2">
            <Btn onClick={() => setStep(2)} disabled={!canProceed1}>
              <ChevronRight className="w-4 h-4" /> Lanjut pilih mahasiswa
            </Btn>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">
              Langkah 2 — Pilih Mahasiswa untuk{" "}
              <span className="text-indigo-600">{targetProdi?.nama || targetProdi?.name}</span>
            </h3>
            <label className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium cursor-pointer">
              <input
                type="checkbox"
                onChange={toggleAll}
                checked={filteredMhs.length > 0 && selectedMhs.length === filteredMhs.length}
              />
              Pilih Semua ({filteredMhs.length})
            </label>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Cari nama / NIM..."
              className="text-xs p-2 border rounded-md w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="text-xs p-2 border rounded-md shrink-0 bg-white"
              value={filterMode}
              onChange={(e) => { setFilterMode(e.target.value); setSelectedMhs([]); }}
            >
              <option value="unassigned">Belum ada prodi</option>
              <option value="all">Semua mahasiswa</option>
              {selectedProdi && (
                <option value="in_prodi">Sudah di prodi ini</option>
              )}
            </select>
          </div>

          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {filteredMhs.length === 0 ? (
              <EmptyState Icon={Users} title="Tidak ada mahasiswa" desc="Ubah filter pencarian" />
            ) : filteredMhs.map((m) => (
              <label
                key={m.id}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer text-sm transition ${
                  selectedMhs.includes(m.id) ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedMhs.includes(m.id)}
                  onChange={(e) => toggleMhs(m.id, e.target.checked)}
                />
                <div className="flex-1 min-w-0 flex items-center justify-between gap-1">
                  <div>
                    <p className="font-medium text-slate-900 truncate">{m.name}</p>
                    <p className="text-xs text-slate-400">NIM: {m.nim || "\u2014"}</p>
                  </div>
                  {m.prodi_name ? (
                    <StatusBadge color="gray">{m.prodi_name}</StatusBadge>
                  ) : (
                    <StatusBadge color="yellow">Belum ada prodi</StatusBadge>
                  )}
                </div>
              </label>
            ))}
          </div>

          {selectedMhs.length > 0 && (
            <InfoBox variant="info">
              {selectedMhs.length} mahasiswa dipilih
            </InfoBox>
          )}

          <div className="flex justify-between pt-2">
            <Btn variant="secondary" onClick={() => setStep(1)}>
              Kembali
            </Btn>
            <Btn onClick={() => setStep(3)} disabled={!canProceed2}>
              <ChevronRight className="w-4 h-4" /> Lanjut pilih kelas
            </Btn>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold text-slate-800">
            Langkah 3 — Pilih Kelas <span className="text-slate-400 font-normal">(opsional)</span>
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Masukkan {selectedMhs.length} mahasiswa langsung ke kelas aktif di prodi{" "}
                <strong>{targetProdi?.nama || targetProdi?.name}</strong>? Atau lewati — mahasiswa tetap terassign ke prodi.
              </p>

              <FieldInput
                label="Angkatan"
                value={angkatan}
                onChange={setAngkatan}
                placeholder="cth: 2025"
                hint="Tahun masuk mahasiswa"
              />

              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                <label
                  className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition ${
                    !selectedClass ? "border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-400" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="wizard_class"
                    checked={!selectedClass}
                    onChange={() => setSelectedClass("")}
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-700">Tanpa kelas (hanya prodi)</p>
                    <p className="text-xs text-slate-400">Mahasiswa bisa join kelas nanti via kode kelas</p>
                  </div>
                </label>
                {prodiClasses.length === 0 && (
                  <p className="text-xs text-slate-400 italic py-2">Tidak ada kelas aktif di prodi ini</p>
                )}
                {prodiClasses.map((c) => (
                  <label
                    key={c.id}
                    className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition ${
                      selectedClass === c.id
                        ? "border-indigo-500 bg-indigo-50/80 ring-1 ring-indigo-400"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="wizard_class"
                      checked={selectedClass === c.id}
                      onChange={() => setSelectedClass(c.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {c.course_name} — {c.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {c.academic_year} {c.semester} &middot; Kode: {c.class_code || "\u2014"}
                        {c.lecturer_name && ` \u00b7 ${c.lecturer_name}`}
                      </p>
                    </div>
                    <StatusBadge color="blue">{(c.student_ids || []).length} Mhs</StatusBadge>
                  </label>
                ))}
              </div>
            </div>

            <Card className="p-4 bg-slate-50 space-y-3">
              <h4 className="font-semibold text-sm text-slate-700">Ringkasan</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Program Studi</span>
                  <span className="font-medium text-slate-900">{targetProdi?.nama || targetProdi?.name || "\u2014"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Mahasiswa</span>
                  <span className="font-medium text-slate-900">{selectedMhs.length} orang</span>
                </div>
                {angkatan && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Angkatan</span>
                    <span className="font-medium text-slate-900">{angkatan}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Kelas</span>
                  <span className="font-medium text-slate-900">
                    {targetClass ? `${targetClass.course_name} — ${targetClass.name}` : "Tanpa kelas"}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <Btn onClick={doEnroll} disabled={loading} variant="success" size="lg" className="w-full justify-center">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {loading ? "Memproses..." : "Simpan & Proses"}
                </Btn>
              </div>
            </Card>
          </div>

          <div className="flex justify-between pt-2">
            <Btn variant="secondary" onClick={() => setStep(2)}>
              Kembali
            </Btn>
          </div>
        </Card>
      )}
    </div>
  );
}


export function MigrationPage() {
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchSummary = useCallback(() => {
    API("/api/migration/old-siap/summary").then(setSummary);
  }, []);

  const fetchStatus = useCallback(() => {
    API("/api/migration/old-siap/status").then(setStatus);
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchStatus();
  }, [fetchSummary, fetchStatus]);

  useEffect(() => {
    if (status?.status === "running") {
      const timer = setInterval(fetchStatus, 1500);
      return () => clearInterval(timer);
    }
  }, [status?.status, fetchStatus]);

  const handleStartMigration = async () => {
    if (!window.confirm("Apakah Anda yakin ingin memulihkan & memigrasikan data dari OLD-SIAP ke database saat ini?")) return;
    setLoading(true);
    await API("/api/migration/old-siap/run", { method: "POST" });
    setLoading(false);
    fetchStatus();
  };

  const isRunning = status?.status === "running";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <Wand2 className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Migrasi Data OLD-SIAP</h1>
            <p className="text-slate-500 text-sm">Impor & konversi data dari database lama (OLD-SIAP) ke sistem baru</p>
          </div>
        </div>

        {summary?.exists && !isRunning && (
          <Btn onClick={handleStartMigration} disabled={loading} variant="primary" size="lg">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {loading ? "Menyiapkan..." : "Mulai Migrasi Data"}
          </Btn>
        )}
      </div>

      {/* Ringkasan File & Entitas */}
      {summary && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h3 className="font-semibold text-slate-800 text-base">File Sumber Migration</h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">/Users/syahrulanwar/Documents/Project Web/OLD-SIAP/siap_siakad.json</p>
            </div>
            <StatusBadge color={summary.exists ? "green" : "red"}>
              {summary.exists ? `Tersedia (${summary.file_size_mb} MB)` : "File Tidak Ditemukan"}
            </StatusBadge>
          </div>

          {summary.exists && summary.entities && (
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-500">Program Studi</p>
                <p className="text-lg font-bold text-slate-800">{summary.entities.prodi || 0} Prodi</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-500">Dosen & Pegawai</p>
                <p className="text-lg font-bold text-slate-800">{summary.entities.pegawai_dosen || 0} Akun</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-500">Mahasiswa</p>
                <p className="text-lg font-bold text-slate-800">{summary.entities.mahasiswa || 0} Mahasiswa</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-500">Mata Kuliah</p>
                <p className="text-lg font-bold text-slate-800">{summary.entities.mata_kuliah || 0} Matkul</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-500">Kelas / Jadwal</p>
                <p className="text-lg font-bold text-slate-800">{summary.entities.kelas_jadwal || 0} Kelas</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-500">KRS (Registrasi Matkul)</p>
                <p className="text-lg font-bold text-slate-800">{summary.entities.krs || 0} Record</p>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Status Progress Real-time */}
      {status && status.status !== "idle" && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-base">Progress Migrasi</h3>
            <StatusBadge color={status.status === "success" ? "green" : status.status === "running" ? "blue" : "red"}>
              {status.status === "running" ? "Sedang Memproses..." : status.status === "success" ? "Selesai Sukses" : "Gagal"}
            </StatusBadge>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-medium text-slate-600">
              <span>{status.step || "Memproses..."}</span>
              <span>{status.progress_percent || 0}%</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border">
              <div
                className={`h-full transition-all duration-300 ${status.status === "success" ? "bg-emerald-500" : "bg-indigo-600"}`}
                style={{ width: `${status.progress_percent || 0}%` }}
              />
            </div>
          </div>

          {/* Logs */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-600">Log Aktivitas:</p>
            <div className="bg-slate-950 text-slate-200 p-3 rounded-lg font-mono text-xs max-h-48 overflow-y-auto space-y-1">
              {(status.logs || []).map((log, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-slate-500 select-none">&gt;</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Result Stats */}
          {status.result && (
            <InfoBox variant="success">
              Hasil Migrasi: {status.result.prodi} Prodi, {status.result.dosen} Dosen, {status.result.mahasiswa} Mahasiswa, {status.result.mk} Mata Kuliah, {status.result.kelas} Kelas berhasil dipindahkan.
            </InfoBox>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── Jadwal Mengajar Page ───────────────────────────────────────────────────────

const JADWAL_HARI = [
  ["1", "Senin"],
  ["2", "Selasa"],
  ["3", "Rabu"],
  ["4", "Kamis"],
  ["5", "Jumat"],
  ["6", "Sabtu"],
  ["7", "Minggu"],
];

const HARI_LABEL = { 1: "Senin", 2: "Selasa", 3: "Rabu", 4: "Kamis", 5: "Jumat", 6: "Sabtu", 7: "Minggu" };

export function JadwalMengajarPage() {
  const [list, setList] = useState([]);
  const [tahunAjaranList, setTahunAjaranList] = useState([]);
  const [prodiList, setProdiList] = useState([]);
  const [dosenList, setDosenList] = useState([]);
  const [ruanganList, setRuanganList] = useState([]);
  const [gedungList, setGedungList] = useState([]);

  const [filterTa, setFilterTa] = useState("");
  const [filterSemester, setFilterSemester] = useState("Ganjil");
  const [filterProdi, setFilterProdi] = useState("");
  const [filterDosen, setFilterDosen] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("week");

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ hari: "1", jam_mulai: "08:00", jam_selesai: "09:40", ruangan_id: "", gedung_id: "" });
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadMaster = useCallback(() => {
    API("/api/v1/master/tahun-ajaran").then((d) => {
      if (!Array.isArray(d)) return;
      setTahunAjaranList(d);
      const active = d.find((t) => t.is_active) || d[0];
      if (active) {
        setFilterTa((prev) => prev || active.tahun || active.tahun_ajaran || "");
        setFilterSemester((prev) => prev || active.semester || "Ganjil");
      }
    });
    API("/api/v1/master/prodi").then((d) => Array.isArray(d) && setProdiList(d));
    API("/api/lecturers").then((d) => Array.isArray(d) && setDosenList(d));
    API("/api/v1/master/ruangan").then((d) => Array.isArray(d) && setRuanganList(d));
    API("/api/v1/master/gedung").then((d) => Array.isArray(d) && setGedungList(d));
  }, []);

  useEffect(() => { loadMaster(); }, [loadMaster]);

  const loadSeqRef = useRef(0);

  const load = useCallback(() => {
    const seq = ++loadSeqRef.current;
    const params = new URLSearchParams();
    if (filterTa) params.set("tahun_ajaran", filterTa);
    if (filterSemester) params.set("semester", filterSemester);
    if (filterProdi) params.set("prodi_id", filterProdi);
    if (filterDosen) params.set("dosen_id", filterDosen);
    setLoading(true);
    API(`/api/v1/master/jadwal-mengajar?${params.toString()}`)
      .then((d) => {
        if (seq !== loadSeqRef.current) return;
        if (Array.isArray(d)) setList(d);
      })
      .finally(() => {
        if (seq === loadSeqRef.current) setLoading(false);
      });
  }, [filterTa, filterSemester, filterProdi, filterDosen]);

  useEffect(() => { load(); }, [load]);

  const tahunOptions = tahunAjaranList.map((t) => [t.tahun || t.tahun_ajaran || t.id, `${t.tahun || t.tahun_ajaran || "?"} ${t.semester || ""}`]);
  const tahunValues = [...new Set(tahunOptions.map(([v]) => v))];

  const prodiOptions = [["", "-- Semua Prodi --"], ...prodiList.map((p) => [p.id, p.nama])];
  const dosenOptions = [["", "-- Semua Dosen --"], ...dosenList.map((d) => [d.id, d.nama])];

  const gedungOptions = [["", "-- Pilih Gedung --"], ...gedungList.filter((g) => g.status === "active").map((g) => [g.id, `${g.nama} (${g.kode})`])];
  const ruanganOptions = (gid) => {
    const base = [["", "-- Pilih Ruangan --"]];
    return [...base, ...ruanganList.filter((r) => r.status === "active" && (!gid || r.gedung_id === gid)).map((r) => [r.id, `${r.kode} — ${r.nama}${r.kapasitas ? ` (${r.kapasitas})` : ""}`])];
  };

  const openEdit = (item) => {
    setEditing(item.class_id);
    setError("");
    setForm({
      hari: item.jadwal_hari ? String(item.jadwal_hari) : "1",
      jam_mulai: item.jam_mulai || "08:00",
      jam_selesai: item.jam_selesai || "09:40",
      ruangan_id: item.ruangan_id || "",
      gedung_id: "",
    });
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const { gedung_id, ...payload } = form;
      const res = await API(`/api/v1/master/jadwal-mengajar/${editing}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (res && res.detail) {
        setError(res.detail);
      } else {
        setEditing(null);
        load();
      }
    } catch (e) {
      setError(e.message || "Gagal menyimpan jadwal");
    } finally {
      setSaving(false);
    }
  };

  const filtered = list.filter((item) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const text = `${item.class_code} ${item.course_name} ${item.class_name} ${item.dosen_name} ${item.ruangan_kode}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const scheduledCount = list.filter((i) => i.jadwal_hari).length;

  const toMin = (t) => {
    if (!t) return -1;
    const p = String(t).split(":");
    return parseInt(p[0], 10) * 60 + parseInt(p[1] || "0", 10);
  };

  const weekData = useMemo(() => {
    const scheduled = filtered.filter((i) => i.jadwal_hari && i.jam_mulai && i.jam_selesai);
    if (scheduled.length === 0) return { days: [], byDay: {} };

    const byDay = {};
    for (const s of scheduled) {
      if (!byDay[s.jadwal_hari]) byDay[s.jadwal_hari] = [];
      byDay[s.jadwal_hari].push(s);
    }
    for (const d of Object.keys(byDay)) {
      byDay[d].sort((a, b) => (toMin(a.jam_mulai) || 0) - (toMin(b.jam_mulai) || 0));
    }
    const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => byDay[d]?.length > 0);
    return { days, byDay };
  }, [filtered]);

  const COURSE_COLORS = ["bg-indigo-500", "bg-emerald-500", "bg-rose-500", "bg-amber-500", "bg-sky-500", "bg-violet-500", "bg-teal-500", "bg-orange-500"];
  const colorFor = (courseName) => {
    let hash = 0;
    for (let i = 0; i < courseName.length; i++) hash = (hash * 31 + courseName.charCodeAt(i)) >>> 0;
    return COURSE_COLORS[hash % COURSE_COLORS.length];
  };

  const esc = (v) =>
    String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const cetakPayload = () => ({
    tahun_ajaran: filterTa,
    semester: filterSemester,
    prodi_id: filterProdi,
    dosen_id: filterDosen,
    validate_base_url: window.location.origin,
  });

  const filterLabel = (res) => {
    if (res?.filter_type === "dosen") return `Jadwal Dosen: ${res.dosen_name || filterDosen}`;
    if (res?.filter_type === "prodi") return `Jadwal Program Studi: ${res.prodi_nama || filterProdi}`;
    return "Jadwal Seluruh Kelas";
  };

  const buildPrintWindow = (res, rows) => {
    const periode = res?.periode?.semester && res?.periode?.tahun_ajaran
      ? `${res.periode.semester} ${res.periode.tahun_ajaran}`
      : "Semua Periode";
    const sig = res?.signature || {};
    const sorted = [...rows].sort((a, b) => {
      const da = a.jadwal_hari ? a.jadwal_hari : 99;
      const db = b.jadwal_hari ? b.jadwal_hari : 99;
      if (da !== db) return da - db;
      return (toMin(a.jam_mulai) || 0) - (toMin(b.jam_mulai) || 0);
    });
    const bodyRows = sorted
      .map(
        (r, i) => `<tr>
          <td class="c">${i + 1}</td>
          <td>${esc(r.class_code)}</td>
          <td>${esc(r.course_name)}<div class="sub">${esc(r.class_name || "")}</div></td>
          <td class="c">${esc(r.sks)}</td>
          <td>${esc(r.program_name)}</td>
          <td>${esc(r.dosen_name)}</td>
          <td class="c">${r.jadwal_hari ? esc(HARI_LABEL[r.jadwal_hari]) : "—"}</td>
          <td class="c">${r.jam_mulai ? `${esc(r.jam_mulai)}–${esc(r.jam_selesai)}` : "—"}</td>
          <td class="c">${esc(r.ruangan_kode) || "—"}</td>
        </tr>`
      )
      .join("");
    const tanggal = new Date().toLocaleDateString("id-ID", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>Cetak Jadwal Mengajar</title>
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Times New Roman", Times, serif; color: #111; font-size: 12px; padding: 32px; }
  .kop { text-align: center; margin-bottom: 18px; }
  .kop .kop-img { width: 100%; object-fit: contain; display: block; }
  .kop .kop-img.header { margin-bottom: 6px; }
  .kop .instansi { font-size: 16px; font-weight: 700; letter-spacing: .5px; }
  .kop .alamat { font-size: 11px; color: #333; margin-top: 2px; }
  .judul { text-align: center; font-weight: 700; font-size: 14px; margin: 14px 0 2px; text-decoration: underline; }
  .meta { text-align: center; margin: 4px 0 14px; font-size: 12px; }
  table.list { width: 100%; border-collapse: collapse; margin-top: 10px; }
  table.list th, table.list td { border: 1px solid #000; padding: 5px 6px; font-size: 11px; vertical-align: top; }
  table.list th { background: #f3f4f6; }
  .c { text-align: center; }
  .sub { color: #555; font-size: 10px; }
  .ftr { display: flex; justify-content: flex-end; margin-top: 40px; }
  .ttd { text-align: center; min-width: 230px; }
  .ttd .mengetahui { margin-bottom: 4px; }
  .ttd .jabatan { font-size: 11px; margin-bottom: 8px; }
  .ttd .qr { width: 96px; height: 96px; margin: 6px auto; display: block; }
  .ttd .nama { font-weight: 700; text-decoration: underline; }
  .ttd .detail { font-size: 11px; margin-top: 2px; }
  .foot { margin-top: 22px; font-size: 9.5px; color: #555; text-align: center; border-top: 1px solid #ddd; padding-top: 8px; }
  .foot .kop-img { width: 100%; object-fit: contain; display: block; margin-top: 8px; }
  @media print { body { padding: 10mm; } }
</style>
</head>
<body>
  <div class="kop">
    ${res?.kop?.header_url ? `<img class="kop-img header" src="${esc(new URL(res.kop.header_url, window.location.origin).href)}" alt="kop" />` : ""}
    <div class="instansi">${esc(res?.kop?.instansi || "SISTEM INFORMASI AKADEMIK")}</div>
    <div class="alamat">${esc(res?.kop?.alamat || "Dokumen resmi diterbitkan secara elektronik oleh aplikasi")}</div>
  </div>
  <div class="judul">JADWAL MENGAJAR PERKULIAHAN</div>
  <div class="meta">
    <div><b>${filterLabel(res)}</b> · Periode: <b>${esc(periode)}</b></div>
    <div>Dicetak pada ${esc(tanggal)}</div>
  </div>
  <table class="list">
    <thead>
      <tr><th>No</th><th>Kode Kelas</th><th>Mata Kuliah</th><th>SKS</th><th>Prodi</th><th>Dosen</th><th>Hari</th><th>Jam</th><th>Ruang</th></tr>
    </thead>
    <tbody>${bodyRows || `<tr><td colspan="9" class="c">Belum ada kelas pada filter ini.</td></tr>`}</tbody>
  </table>
  <div class="ftr">
    <div class="ttd">
      <div class="mengetahui">Mengetahui,</div>
      <div class="jabatan">${esc((res?.signer?.jabatan) || sig.jabatan || "")}</div>
      <img class="qr" src="${esc(res?.signer?.qr_png || "")}" alt="QR TTD Elektronik" />
      <div class="nama">${esc((res?.signer?.nama) || sig.penandatangan || "( .............................. )")}</div>
      <div class="detail">${esc((res?.signer?.ident) || sig.detail || "")}</div>
    </div>
  </div>
  <div class="foot">Dokumen ini diterbitkan secara elektronik dengan tanda tangan digital (TTD Elektronik). Keaslian dan keabsahan dokumen dapat diverifikasi dengan memindai QR pada blok tanda tangan. ${res?.jumlah_kelas ?? 0} kelas tercetak.
    ${res?.kop?.footer_url ? `<img class="kop-img" src="${esc(new URL(res.kop.footer_url, window.location.origin).href)}" alt="kop" />` : ""}
  </div>
  <script>
    window.onload = function () { setTimeout(function () { window.print(); }, 250); };
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

  const handleCetak = async () => {
    setPrinting(true);
    setError("");
    try {
      const res = await API("/api/v1/master/jadwal-mengajar/cetak", {
        method: "POST",
        body: JSON.stringify(cetakPayload()),
      });
      if (!res || res.detail) {
        setError((res && res.detail) || "Gagal membuat dokumen cetak");
        return;
      }
      buildPrintWindow(res, list);
    } catch (e) {
      setError(e?.message || "Gagal membuat dokumen cetak");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <CalendarClock className="w-5 h-5 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Jadwal Mengajar</h1>
            <p className="text-slate-500 text-sm">Atur hari, jam, dan ruangan untuk setiap kelas perkuliahan</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Btn size="sm" onClick={handleCetak} disabled={printing}>
            <Printer className="w-3.5 h-3.5" />
            {printing ? "Menyiapkan..." : "Cetak Jadwal"}
          </Btn>
          <StatusBadge color="blue">{scheduledCount} Terjadwal / {list.length} Kelas</StatusBadge>
        </div>
      </div>

      <Card className="p-4 space-y-4">
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
          <select
            value={filterProdi}
            onChange={(e) => setFilterProdi(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {prodiOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select
            value={filterDosen}
            onChange={(e) => setFilterDosen(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {dosenOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input
            type="text"
            placeholder="Cari kode / MK / dosen / ruangan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full lg:w-72 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </Card>

      {filterTa && (
        <InfoBox variant="info">
          Menampilkan jadwal kelas periode <strong>{filterSemester} {filterTa}</strong>.
        </InfoBox>
      )}

      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 gap-1">
          <button
            onClick={() => setViewMode("week")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${viewMode === "week" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            Mingguan
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${viewMode === "table" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            Daftar
          </button>
        </div>
        <StatusBadge color="blue">{scheduledCount} Terjadwal / {list.length} Kelas</StatusBadge>
      </div>

      {viewMode === "week" && (
        <Card className="overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
          ) : weekData.days.length === 0 ? (
            <EmptyState Icon={CalendarClock} title="Belum ada jadwal untuk ditampilkan" desc="Atur jadwal kelas terlebih dahulu untuk melihat tampilan mingguan" />
          ) : (
            <div className="overflow-x-auto">
              <div className="grid gap-4 p-4" style={{ gridTemplateColumns: `repeat(${weekData.days.length}, minmax(220px, 1fr))` }}>
                {weekData.days.map((d) => (
                  <div key={d} className="min-w-[220px]">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-2 text-center">
                      <span className="font-bold text-slate-800">{HARI_LABEL[d]}</span>
                      <span className="block text-xs text-slate-400">{weekData.byDay[d].length} kelas</span>
                    </div>
                    <div className="space-y-2">
                      {weekData.byDay[d].map((it) => (
                        <button
                          key={it.class_id}
                          onClick={() => openEdit(it)}
                          className={`w-full text-left rounded-lg px-3 py-2.5 text-white shadow-sm hover:opacity-90 hover:shadow transition ${colorFor(it.course_name)}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wide opacity-90">{it.class_code}</span>
                            <span className="text-[10px] font-semibold opacity-90 whitespace-nowrap">{it.jam_mulai}–{it.jam_selesai}</span>
                          </div>
                          <div className="text-xs font-bold leading-tight mt-0.5">{it.course_name}</div>
                          <div className="flex items-center gap-1 text-[10px] opacity-90 mt-1">
                            <MapPin className="w-3 h-3" /> {it.ruangan_kode || "Ruang?"}
                          </div>
                          <div className="text-[10px] opacity-80 truncate">{it.dosen_name || ""} · {it.class_name}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {viewMode === "table" && (
      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState Icon={CalendarClock} title="Belum ada kelas di periode ini" desc="Ubah filter atau atur jadwal dari daftar kelas" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3.5 font-bold text-slate-700">Kelas</th>
                  <th className="text-left px-4 py-3.5 font-bold text-slate-700">Mata Kuliah</th>
                  <th className="text-left px-4 py-3.5 font-bold text-slate-700">Prodi</th>
                  <th className="text-left px-4 py-3.5 font-bold text-slate-700">Dosen</th>
                  <th className="text-left px-4 py-3.5 font-bold text-slate-700">Hari</th>
                  <th className="text-left px-4 py-3.5 font-bold text-slate-700">Jam</th>
                  <th className="text-left px-4 py-3.5 font-bold text-slate-700">Ruangan</th>
                  <th className="text-left px-4 py-3.5 font-bold text-slate-700">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => (
                  <tr key={item.class_id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-800">{item.course_name}</div>
                      <div className="text-xs text-slate-500 font-mono">{item.class_code}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-slate-700">{item.class_name}</div>
                      <div className="text-xs text-slate-400">{item.sks ? `SKS ${item.sks}` : ""}</div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">{item.program_name || "—"}</td>
                    <td className="px-4 py-3.5 text-slate-600">{item.dosen_name || "—"}</td>
                    <td className="px-4 py-3.5">
                      {item.jadwal_hari ? (
                        <StatusBadge color="purple">{HARI_LABEL[item.jadwal_hari]}</StatusBadge>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {item.jam_mulai ? `${item.jam_mulai}–${item.jam_selesai}` : "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      {item.ruangan_kode ? (
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" /> {item.ruangan_kode}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Btn size="sm" variant={item.jadwal_hari ? "secondary" : "primary"} onClick={() => openEdit(item)}>
                        <Clock className="w-3.5 h-3.5" /> {item.jadwal_hari ? "Ubah" : "Atur"}
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Atur Jadwal Mengajar</h3>
                <p className="text-sm text-slate-500">Set hari, jam, dan ruangan kelas.</p>
              </div>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setEditing(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && <InfoBox variant="warning">{error}</InfoBox>}

            <div className="grid grid-cols-2 gap-4">
              <FieldSelect
                label="Hari"
                value={form.hari}
                onChange={(v) => setForm((p) => ({ ...p, hari: v }))}
                options={JADWAL_HARI}
              />
              <FieldSelect
                label="Gedung"
                value={form.gedung_id}
                onChange={(v) => setForm((p) => ({ ...p, gedung_id: v, ruangan_id: "" }))}
                options={gedungOptions}
                hint="Pilih gedung untuk mempersempit daftar ruangan"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FieldInput label="Jam Mulai" type="time" value={form.jam_mulai} onChange={(v) => setForm((p) => ({ ...p, jam_mulai: v }))} required />
              <FieldInput label="Jam Selesai" type="time" value={form.jam_selesai} onChange={(v) => setForm((p) => ({ ...p, jam_selesai: v }))} required />
            </div>
            <FieldSelect
              label="Ruangan"
              value={form.ruangan_id}
              onChange={(v) => setForm((p) => ({ ...p, ruangan_id: v }))}
              options={ruanganOptions(form.gedung_id)}
              hint="Pilih ruangan yang tersedia"
            />
            <div className="flex gap-2 justify-end">
              <Btn variant="secondary" onClick={() => setEditing(null)}>Batal</Btn>
              <Btn onClick={save} disabled={saving || !form.hari || !form.jam_mulai || !form.jam_selesai}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {saving ? "Menyimpan..." : "Simpan Jadwal"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
