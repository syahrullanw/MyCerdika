/**
 * KurikulumComponents.jsx
 * Komponen UI untuk Manajemen Kurikulum, Struktur Beban SKS (Teori + Praktikum),
 * Matriks MK per Semester Paket, dan Penugasan Dosen Pengampu MK / Team Teaching.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Users,
  Award,
  Layers,
  ChevronLeft,
  Loader2,
  Check,
  Building2,
  Inbox,
  AlertCircle,
  FileSpreadsheet,
  UserCheck,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const EmptyState = ({ Icon = Inbox, title, desc }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <Icon className="w-12 h-12 text-slate-300 mb-3" strokeWidth={1.5} />
    <p className="font-semibold text-slate-700 text-base">{title}</p>
    {desc && <p className="text-sm text-slate-400 mt-1 max-w-xs">{desc}</p>}
  </div>
);

// ─── MAIN KURIKULUM MASTER PAGE ────────────────────────────────────────────────

export function KurikulumMasterPage({ user }) {
  const [kurikulumList, setKurikulumList] = useState([]);
  const [prodiList, setProdiList] = useState([]);
  const [dosenList, setDosenList] = useState([]);
  const [selectedProdi, setSelectedProdi] = useState("");
  const [activeKurikulum, setActiveKurikulum] = useState(null); // Detail view
  const [selectedRpsCourse, setSelectedRpsCourse] = useState(null); // Modal RPS Silabus

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

  // Form Kurikulum Master
  const [showKurForm, setShowKurForm] = useState(false);
  const [editingKurId, setEditingKurId] = useState(null);
  const [kurForm, setKurForm] = useState({ kode: "", nama: "", prodi_id: "", tahun_mulai: "2024", total_sks_lulus: 144, deskripsi: "", status: "active" });
  const [kurLoading, setKurLoading] = useState(false);

  // Detail Courses di Kurikulum yang dibuka
  const [courses, setCourses] = useState([]);
  const [activeSemesterTab, setActiveSemesterTab] = useState(1);

  // Form Course MK
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [courseForm, setCourseForm] = useState({
    kode: "",
    nama: "",
    sks_teori: 2,
    sks_praktikum: 0,
    semester_paket: 1,
    sifat: "wajib",
    dosen_utama_id: "",
    dosen_anggota_ids: [],
  });
  const [courseLoading, setCourseLoading] = useState(false);

  const loadData = useCallback(() => {
    API("/api/v1/kurikulum").then((d) => Array.isArray(d) && setKurikulumList(d));
    API("/api/v1/master/prodi").then((d) => Array.isArray(d) && setProdiList(d));
    API("/api/v1/master/dosen").then((d) => Array.isArray(d) && setDosenList(d));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadKurikulumCourses = useCallback((kurId) => {
    API(`/api/v1/kurikulum/${kurId}/courses`).then((d) => Array.isArray(d) && setCourses(d));
  }, []);

  const openDetail = (kur) => {
    setActiveKurikulum(kur);
    loadKurikulumCourses(kur.id);
    setActiveSemesterTab(1);
  };

  const saveKurikulum = async () => {
    setKurLoading(true);
    if (editingKurId) {
      await API(`/api/v1/kurikulum/${editingKurId}`, { method: "PUT", body: JSON.stringify(kurForm) });
    } else {
      await API("/api/v1/kurikulum", { method: "POST", body: JSON.stringify(kurForm) });
    }
    setKurLoading(false);
    setShowKurForm(false);
    setEditingKurId(null);
    setKurForm({ kode: "", nama: "", prodi_id: "", tahun_mulai: "2024", total_sks_lulus: 144, deskripsi: "", status: "active" });
    loadData();
  };

  const saveCourse = async () => {
    if (!activeKurikulum) return;
    setCourseLoading(true);

    const dosenUtama = dosenList.find((d) => d.id === courseForm.dosen_utama_id);
    const dosenAnggota = dosenList.filter((d) => courseForm.dosen_anggota_ids.includes(d.id));

    const payload = {
      kurikulum_id: activeKurikulum.id,
      prodi_id: activeKurikulum.prodi_id,
      kode: courseForm.kode,
      nama: courseForm.nama,
      sks_teori: parseInt(courseForm.sks_teori) || 0,
      sks_praktikum: parseInt(courseForm.sks_praktikum) || 0,
      semester_paket: parseInt(courseForm.semester_paket) || 1,
      sifat: courseForm.sifat,
      dosen_utama_id: courseForm.dosen_utama_id || null,
      dosen_utama_nama: dosenUtama ? dosenUtama.name : null,
      dosen_anggota_ids: courseForm.dosen_anggota_ids || [],
      dosen_anggota_namas: dosenAnggota.map((d) => d.name),
    };

    if (editingCourseId) {
      await API(`/api/v1/kurikulum/courses/${editingCourseId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await API("/api/v1/kurikulum/courses", { method: "POST", body: JSON.stringify(payload) });
    }

    setCourseLoading(false);
    setShowCourseForm(false);
    setEditingCourseId(null);
    setCourseForm({
      kode: "",
      nama: "",
      sks_teori: 2,
      sks_praktikum: 0,
      semester_paket: activeSemesterTab,
      sifat: "wajib",
      dosen_utama_id: "",
      dosen_anggota_ids: [],
    });
    loadKurikulumCourses(activeKurikulum.id);
  };

  const deleteCourse = async (cid) => {
    if (!window.confirm("Hapus Mata Kuliah ini dari Kurikulum?")) return;
    await API(`/api/v1/kurikulum/courses/${cid}`, { method: "DELETE" });
    if (activeKurikulum) loadKurikulumCourses(activeKurikulum.id);
  };

  const kaprodiProdiObj = useMemo(() => {
    if (!kaprodiProdiId) return null;
    const target = String(kaprodiProdiId).toLowerCase();
    return prodiList.find((p) => String(p.id).toLowerCase() === target || String(p.kode).toLowerCase() === target);
  }, [prodiList, kaprodiProdiId]);

  const filteredKurikulum = useMemo(() => {
    if (isKaprodi && kaprodiProdiId) {
      const target = String(kaprodiProdiId).toLowerCase();
      return kurikulumList.filter((k) =>
        String(k.prodi_id || "").toLowerCase() === target ||
        String(k.prodi_kode || "").toLowerCase() === target ||
        String(k.prodi_nama || "").toLowerCase().includes(target)
      );
    }
    if (selectedProdi) {
      return kurikulumList.filter((k) => k.prodi_id === selectedProdi);
    }
    return kurikulumList;
  }, [kurikulumList, isKaprodi, kaprodiProdiId, selectedProdi]);

  const prodiOptions = isKaprodi && kaprodiProdiId
    ? [[kaprodiProdiId, kaprodiProdiObj ? `${kaprodiProdiObj.nama} (${kaprodiProdiObj.kode})` : kaprodiProdiId]]
    : [
        ["", "-- Semua Program Studi --"],
        ...prodiList.map((p) => [p.id, `${p.nama} (${p.kode})`]),
      ];

  const dosenOptions = [
    ["", "-- Pilih Dosen Utama / Koordinator MK --"],
    ...dosenList.map((d) => [d.id, `${d.name}${d.nip ? ` (NIP: ${d.nip})` : ""}`]),
  ];

  // Calculated totals for active Kurikulum
  const totalSksTeori = courses.reduce((acc, c) => acc + (parseInt(c.sks_teori || c.sks || 0)), 0);
  const totalSksPrak = courses.reduce((acc, c) => acc + (parseInt(c.sks_praktikum || 0)), 0);
  const totalSksKurikulum = courses.reduce((acc, c) => acc + (parseInt(c.total_sks || c.sks || 0)), 0);
  const totalSksWajib = courses.filter((c) => c.sifat === "wajib").reduce((acc, c) => acc + (parseInt(c.total_sks || c.sks || 0)), 0);
  const totalSksPilihan = courses.filter((c) => c.sifat === "pilihan").reduce((acc, c) => acc + (parseInt(c.total_sks || c.sks || 0)), 0);

  // Courses filtered by active semester tab
  const semesterCourses = courses.filter((c) => (parseInt(c.semester_paket || c.semester || 1)) === activeSemesterTab);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── DETAIL VIEW KURIKULUM ── */}
      {activeKurikulum ? (
        <div className="space-y-6">
          {/* Header Navigation */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveKurikulum(null)}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900">{activeKurikulum.nama}</h1>
                  <StatusBadge color={activeKurikulum.status === "active" ? "green" : "gray"}>
                    {activeKurikulum.kode}
                  </StatusBadge>
                </div>
                <p className="text-slate-500 text-sm">
                  {activeKurikulum.prodi_nama || "Program Studi"} — Berlaku Mulai {activeKurikulum.tahun_mulai}
                </p>
              </div>
            </div>
            <Btn onClick={() => {
              setEditingCourseId(null);
              setCourseForm({
                kode: "",
                nama: "",
                sks_teori: 2,
                sks_praktikum: 0,
                semester_paket: activeSemesterTab,
                sifat: "wajib",
                dosen_utama_id: "",
                dosen_anggota_ids: [],
              });
              setShowCourseForm(true);
            }}>
              <Plus className="w-4 h-4" /> Tambah Mata Kuliah
            </Btn>
          </div>

          {/* Stats Cards Breakdown */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="p-4 bg-indigo-50/50 border-indigo-100">
              <span className="text-xs font-medium text-indigo-600">Total Beban Kurikulum</span>
              <p className="text-2xl font-bold text-indigo-900 mt-1">{totalSksKurikulum} <span className="text-sm font-normal text-indigo-600">SKS</span></p>
              <p className="text-xs text-indigo-500 mt-0.5">Target Lulus: {activeKurikulum.total_sks_lulus || 144} SKS</p>
            </Card>
            <Card className="p-4 bg-blue-50/50 border-blue-100">
              <span className="text-xs font-medium text-blue-600">Rincian Kuliah & Praktikum</span>
              <p className="text-lg font-bold text-blue-900 mt-1">{totalSksTeori} <span className="text-xs font-normal">SKS Teori</span> + {totalSksPrak} <span className="text-xs font-normal">SKS Prak</span></p>
              <p className="text-xs text-blue-500 mt-0.5">{courses.length} Total Mata Kuliah</p>
            </Card>
            <Card className="p-4 bg-emerald-50/50 border-emerald-100">
              <span className="text-xs font-medium text-emerald-600">MK Wajib</span>
              <p className="text-2xl font-bold text-emerald-900 mt-1">{totalSksWajib} <span className="text-sm font-normal text-emerald-600">SKS</span></p>
              <p className="text-xs text-emerald-500 mt-0.5">{courses.filter((c) => c.sifat === "wajib").length} Mata Kuliah Wajib</p>
            </Card>
            <Card className="p-4 bg-purple-50/50 border-purple-100">
              <span className="text-xs font-medium text-purple-600">MK Pilihan</span>
              <p className="text-2xl font-bold text-purple-900 mt-1">{totalSksPilihan} <span className="text-sm font-normal text-purple-600">SKS</span></p>
              <p className="text-xs text-purple-500 mt-0.5">{courses.filter((c) => c.sifat === "pilihan").length} Mata Kuliah Pilihan</p>
            </Card>
          </div>

          {/* Form Modal Add / Edit Course */}
          {showCourseForm && (
            <Card className="p-5 space-y-4 border-indigo-200 bg-indigo-50/30">
              <h3 className="font-semibold text-slate-800">
                {editingCourseId ? "Edit Mata Kuliah & Dosen Pengampu" : `Tambah MK (Semester Paket ${activeSemesterTab})`}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <FieldInput label="Kode MK" value={courseForm.kode} onChange={(v) => setCourseForm((p) => ({ ...p, kode: v }))} placeholder="IF201" required />
                <FieldInput label="Nama Mata Kuliah" value={courseForm.nama} onChange={(v) => setCourseForm((p) => ({ ...p, nama: v }))} placeholder="Pemrograman Web" required />
                
                <FieldInput label="SKS Teori / Tatap Muka" type="number" value={courseForm.sks_teori} onChange={(v) => setCourseForm((p) => ({ ...p, sks_teori: v }))} required />
                <FieldInput label="SKS Praktikum / Lab" type="number" value={courseForm.sks_praktikum} onChange={(v) => setCourseForm((p) => ({ ...p, sks_praktikum: v }))} required />

                <FieldSelect
                  label="Semester Paket"
                  value={courseForm.semester_paket}
                  onChange={(v) => setCourseForm((p) => ({ ...p, semester_paket: v }))}
                  options={[1, 2, 3, 4, 5, 6, 7, 8].map((s) => [s, `Semester Paket ${s}`])}
                />

                <FieldSelect
                  label="Sifat Mata Kuliah"
                  value={courseForm.sifat}
                  onChange={(v) => setCourseForm((p) => ({ ...p, sifat: v }))}
                  options={[["wajib", "Wajib"], ["pilihan", "Pilihan"]]}
                />

                <FieldSelect
                  label="Dosen Pengampu Utama (Koordinator)"
                  value={courseForm.dosen_utama_id || ""}
                  onChange={(v) => setCourseForm((p) => ({ ...p, dosen_utama_id: v }))}
                  options={dosenOptions}
                  hint="Dosen penanggung jawab mata kuliah"
                />

                {/* Team Teaching Dosen Anggota Multi-Select */}
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-slate-700">Team Teaching (Dosen Anggota)</label>
                  <div className="border border-slate-300 rounded-lg p-2.5 max-h-32 overflow-y-auto space-y-1 bg-white">
                    {dosenList.map((d) => (
                      <label key={d.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:bg-slate-50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={courseForm.dosen_anggota_ids.includes(d.id)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setCourseForm((p) => ({
                              ...p,
                              dosen_anggota_ids: checked
                                ? [...p.dosen_anggota_ids, d.id]
                                : p.dosen_anggota_ids.filter((id) => id !== d.id),
                            }));
                          }}
                        />
                        <span>{d.name} {d.nip && `(${d.nip})`}</span>
                      </label>
                    ))}
                  </div>
                  <span className="text-xs text-slate-400">Pilih dosen pendamping mengajar</span>
                </div>
              </div>

              {/* SKS Total Preview Badge */}
              <div className="bg-indigo-100/60 border border-indigo-200 rounded-lg p-3 flex items-center justify-between text-sm">
                <span className="text-indigo-800 font-medium">Beban Total Mata Kuliah:</span>
                <span className="font-bold text-indigo-900 text-base">
                  {(parseInt(courseForm.sks_teori) || 0) + (parseInt(courseForm.sks_praktikum) || 0)} SKS
                  <span className="text-xs font-normal text-indigo-600 ml-1.5">
                    ({courseForm.sks_teori || 0} Teori + {courseForm.sks_praktikum || 0} Prak)
                  </span>
                </span>
              </div>

              <div className="flex gap-2 justify-end">
                <Btn variant="secondary" onClick={() => setShowCourseForm(false)}>Batal</Btn>
                <Btn onClick={saveCourse} disabled={courseLoading || !courseForm.kode || !courseForm.nama}>
                  {courseLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {courseLoading ? "Menyimpan..." : "Simpan MK"}
                </Btn>
              </div>
            </Card>
          )}

          {/* Semester Tabs (Semester 1 s.d. 8) */}
          <div className="border-b border-slate-200 flex gap-1 overflow-x-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => {
              const semCourses = courses.filter((c) => (parseInt(c.semester_paket || c.semester || 1)) === s);
              const semSks = semCourses.reduce((acc, c) => acc + (parseInt(c.total_sks || c.sks || 0)), 0);
              const active = activeSemesterTab === s;
              return (
                <button
                  key={s}
                  onClick={() => setActiveSemesterTab(s)}
                  className={`px-4 py-2.5 font-medium text-sm border-b-2 transition flex items-center gap-2 whitespace-nowrap
                    ${active ? "border-indigo-600 text-indigo-600 bg-indigo-50/50" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                  <span>Semester {s}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? "bg-indigo-100 text-indigo-700 font-semibold" : "bg-slate-100 text-slate-500"}`}>
                    {semSks} SKS
                  </span>
                </button>
              );
            })}
          </div>

          {/* Table Courses in Selected Semester */}
          <Card>
            {semesterCourses.length === 0 ? (
              <EmptyState Icon={BookOpen} title={`Belum ada MK di Semester Paket ${activeSemesterTab}`} desc="Klik 'Tambah Mata Kuliah' untuk menambahkan MK ke semester ini." />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Kode</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Mata Kuliah</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-600">Rincian SKS</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-600">Total SKS</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Sifat</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Dosen Pengampu Utama</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Team Teaching</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {semesterCourses.map((c) => {
                    const totalSks = (parseInt(c.sks_teori) || parseInt(c.sks) || 0) + (parseInt(c.sks_praktikum) || 0);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-mono font-semibold text-indigo-700">{c.code || c.kode}</td>
                        <td className="px-4 py-3 font-medium">{c.name || c.nama}</td>
                        <td className="px-4 py-3 text-center text-xs text-slate-500">
                          {c.sks_teori || c.sks || 0} T + {c.sks_praktikum || 0} P
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-900">{totalSks} SKS</td>
                        <td className="px-4 py-3">
                          <StatusBadge color={c.sifat === "wajib" ? "green" : "purple"}>
                            {c.sifat === "wajib" ? "Wajib" : "Pilihan"}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-slate-800 font-medium">
                          {c.dosen_utama_nama ? (
                            <div className="flex items-center gap-1.5">
                              <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                              <span>{c.dosen_utama_nama}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">Belum di-assign</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {Array.isArray(c.dosen_anggota_namas) && c.dosen_anggota_namas.length > 0 ? (
                            <span>{c.dosen_anggota_namas.join(", ")}</span>
                          ) : (
                            <span className="text-slate-400 italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Btn
                              size="sm"
                              variant="secondary"
                              onClick={() => setSelectedRpsCourse(c)}
                              className="text-xs text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100"
                            >
                              <BookOpen className="w-3.5 h-3.5" /> RPS
                            </Btn>
                            <Btn
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingCourseId(c.id);
                                setCourseForm({
                                  kode: c.code || c.kode || "",
                                  nama: c.name || c.nama || "",
                                  sks_teori: c.sks_teori || c.sks || 2,
                                  sks_praktikum: c.sks_praktikum || 0,
                                  semester_paket: parseInt(c.semester_paket || c.semester || activeSemesterTab),
                                  sifat: c.sifat || "wajib",
                                  dosen_utama_id: c.dosen_utama_id || "",
                                  dosen_anggota_ids: c.dosen_anggota_ids || [],
                                });
                                setShowCourseForm(true);
                              }}
                            >
                              Edit
                            </Btn>
                            <Btn size="sm" variant="ghost" onClick={() => deleteCourse(c.id)} className="text-red-600 hover:bg-red-50">
                              Hapus
                            </Btn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          {/* Modal RPS Silabus Feeder */}
          {selectedRpsCourse && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
              <div className="w-full max-w-3xl bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200 my-8">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 font-display flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-indigo-600" />
                      Rencana Pembelajaran Semester (RPS): {selectedRpsCourse.name || selectedRpsCourse.nama}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Kode: {selectedRpsCourse.kode || selectedRpsCourse.code} · Total SKS: {selectedRpsCourse.sks_teori || selectedRpsCourse.sks || 2} Teori + {selectedRpsCourse.sks_praktikum || 0} Prak
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedRpsCourse(null)}
                    className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-xs font-semibold text-slate-700 transition"
                  >
                    Tutup
                  </button>
                </div>

                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                  {Array.isArray(selectedRpsCourse.rps_rencana_pembelajaran) && selectedRpsCourse.rps_rencana_pembelajaran.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-slate-500 font-medium pb-2 border-b border-slate-100">
                        <span>Menampilkan {selectedRpsCourse.rps_rencana_pembelajaran.length} Rencana Pertemuan Silabus</span>
                        <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Ter-sinkron Feeder PDDIKTI</span>
                      </div>
                      <div className="space-y-2.5">
                        {selectedRpsCourse.rps_rencana_pembelajaran.map((rp, idx) => (
                          <div key={idx} className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 hover:border-indigo-300 transition">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                                Pertemuan ke-{rp.pertemuan || idx + 1}
                              </span>
                              {rp.metode_pembelajaran && (
                                <span className="text-[11px] text-slate-500 font-medium bg-slate-200 px-2 py-0.5 rounded">
                                  {rp.metode_pembelajaran}
                                </span>
                              )}
                            </div>
                            <h4 className="font-semibold text-sm text-slate-900 mt-1.5">{rp.materi_pembelajaran || rp.topik || rp.bahasan}</h4>
                            {rp.kemampuan_akhir && (
                              <p className="text-xs text-slate-600 mt-1">
                                <span className="font-medium text-slate-700">Capaian:</span> {rp.kemampuan_akhir}
                              </p>
                            )}
                            {rp.indikator_penilaian && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                <span className="font-medium text-slate-600">Evaluasi:</span> {rp.indikator_penilaian}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
                      <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="font-semibold text-slate-700 text-sm">Belum Ada Dokumen RPS Digital</p>
                      <p className="text-xs text-slate-500 mt-1">Mata kuliah ini belum memiliki detail silabus 16 pertemuan dari Feeder PDDIKTI.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── MASTER KURIKULUM LIST VIEW ── */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Kurikulum & Dosen Pengampu</h1>
                <p className="text-slate-500 text-sm">Kelola versi kurikulum, paket MK per semester, rincian SKS, dan penugasan Dosen</p>
              </div>
            </div>
            <Btn onClick={() => {
              setEditingKurId(null);
              setKurForm({ kode: "", nama: "", prodi_id: selectedProdi || "", tahun_mulai: "2024", total_sks_lulus: 144, deskripsi: "", status: "active" });
              setShowKurForm(true);
            }}>
              <Plus className="w-4 h-4" /> Buat Kurikulum Baru
            </Btn>
          </div>

          {isKaprodi && (
            <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-4 flex items-center gap-3 text-indigo-900 shadow-sm">
              <div className="h-9 w-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                <Award className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm">Hak Akses Kaprodi: Program Studi {prodiList.find(p => p.id === kaprodiProdiId)?.nama || kaprodiProdiId}</p>
                <p className="text-xs text-indigo-700 mt-0.5">
                  Sebagai Ketua Program Studi (Kaprodi), Anda memiliki wewenang penuh menyusun Kurikulum, daftar Mata Kuliah, dan menugaskan Dosen Pengampu (Dosen Utama & Team Teaching) untuk prodi Anda.
                </p>
              </div>
            </div>
          )}

          {/* Filter per Prodi */}
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

          {/* Form Modal Add / Edit Master Kurikulum */}
          {showKurForm && (
            <Card className="p-5 space-y-4 border-indigo-200 bg-indigo-50/30">
              <h3 className="font-semibold text-slate-800">{editingKurId ? "Edit Kurikulum Master" : "Buat Kurikulum Master Baru"}</h3>
              <div className="grid grid-cols-2 gap-4">
                <FieldInput label="Kode Kurikulum" value={kurForm.kode} onChange={(v) => setKurForm((p) => ({ ...p, kode: v }))} placeholder="KUR-2024-TI" required />
                <FieldInput label="Nama Kurikulum" value={kurForm.nama} onChange={(v) => setKurForm((p) => ({ ...p, nama: v }))} placeholder="Kurikulum 2024 MBKM" required />
                
                <FieldSelect
                  label="Program Studi (Prodi)"
                  value={kurForm.prodi_id || ""}
                  onChange={(v) => setKurForm((p) => ({ ...p, prodi_id: v }))}
                  options={prodiOptions}
                />

                <FieldInput label="Tahun Berlaku" value={kurForm.tahun_mulai} onChange={(v) => setKurForm((p) => ({ ...p, tahun_mulai: v }))} placeholder="2024" required />
                <FieldInput label="Syarat SKS Lulus" type="number" value={kurForm.total_sks_lulus} onChange={(v) => setKurForm((p) => ({ ...p, total_sks_lulus: parseInt(v) || 144 }))} hint="Standard Sarjana (S1): 144 SKS" />
                <FieldSelect label="Status" value={kurForm.status} onChange={(v) => setKurForm((p) => ({ ...p, status: v }))} options={[["active", "Aktif"], ["inactive", "Nonaktif"], ["draft", "Draft"]]} />
              </div>
              <div className="flex gap-2 justify-end">
                <Btn variant="secondary" onClick={() => setShowKurForm(false)}>Batal</Btn>
                <Btn onClick={saveKurikulum} disabled={kurLoading || !kurForm.kode || !kurForm.nama}>
                  {kurLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {kurLoading ? "Menyimpan..." : "Simpan Kurikulum"}
                </Btn>
              </div>
            </Card>
          )}

          {/* List Kurikulum Cards */}
          <div className="space-y-4">
            {filteredKurikulum.length === 0 ? (
              <Card><EmptyState Icon={BookOpen} title="Belum ada Kurikulum" desc="Klik 'Buat Kurikulum Baru' untuk menambahkan versi kurikulum baru." /></Card>
            ) : (
              filteredKurikulum.map((kur) => (
                <Card key={kur.id} className="p-5 hover:border-indigo-300 transition group">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-600">{kur.kode}</span>
                        <h3 className="font-bold text-slate-900 text-lg">{kur.nama}</h3>
                        <StatusBadge color={kur.status === "active" ? "green" : "gray"}>
                          {kur.status === "active" ? "Aktif" : kur.status}
                        </StatusBadge>
                      </div>
                      <p className="text-sm text-slate-500">
                        Prodi: <strong>{kur.prodi_nama || "Semua Prodi"}</strong> — Berlaku {kur.tahun_mulai} — Syarat Lulus: <strong>{kur.total_sks_lulus || 144} SKS</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Btn variant="secondary" onClick={() => {
                        setEditingKurId(kur.id);
                        setKurForm({
                          kode: kur.kode || "",
                          nama: kur.nama || "",
                          prodi_id: kur.prodi_id || "",
                          tahun_mulai: kur.tahun_mulai || "2024",
                          total_sks_lulus: kur.total_sks_lulus || 144,
                          deskripsi: kur.deskripsi || "",
                          status: kur.status || "active",
                        });
                        setShowKurForm(true);
                      }}>
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Btn>
                      <Btn onClick={() => openDetail(kur)}>
                        Kelola MK & SKS →
                      </Btn>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
