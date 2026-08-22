/**
 * KurikulumComponents.jsx
 * Komponen UI untuk Manajemen Kurikulum, Struktur Beban SKS (Teori + Praktikum),
 * Matriks MK per Semester Paket, dan Penugasan Dosen Pengampu MK / Team Teaching.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { isKaprodiUser } from "@/accessControl";
import { lecturerHomebase } from "@/utils/lecturerHomebase";
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Wifi,
  WifiOff,
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
  BarChart3,
  UserCheck,
  Search,
  X,
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
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium ${map[color] || map.blue}`}>
      {children}
    </span>
  );
};

const Card = ({ children, className = "" }) => (
  <div className={`min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
);

const Btn = ({ children, onClick, variant = "primary", size = "md", disabled = false, className = "" }) => {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all focus:outline-none";
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-5 py-2.5 text-base" };
  const variants = {
    primary:   "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50",
    secondary: "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50",
    danger:    "bg-red-600 text-white hover:bg-red-700",
    success:   "bg-emerald-600 text-white hover:bg-emerald-700",
    ghost:     "text-slate-600 hover:bg-slate-100",
  };
  return (
    <button type="button" className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
};

const FieldInput = ({ label, value, onChange, type = "text", placeholder = "", required = false, hint = "", disabled = false }) => (
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
      disabled={disabled}
      className="min-w-0 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
    />
    {hint && <span className="text-xs text-slate-400">{hint}</span>}
  </div>
);

const FieldSelect = ({ label, value, onChange, options = [], hint = "", disabled = false }) => (
  <div className="flex flex-col gap-1">
    {label && <label className="text-sm font-medium text-slate-700">{label}</label>}
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="min-w-0 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
    >
      {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
    </select>
    {hint && <span className="text-xs text-slate-400">{hint}</span>}
  </div>
);

const lecturerName = (lecturer) => (
  lecturer?.name || lecturer?.nama || lecturer?.username || lecturer?.id || "Dosen"
);

const lecturerIdentifiers = (lecturer) => [
  lecturer?.nidn ? `NIDN ${lecturer.nidn}` : "",
  lecturer?.nip ? `NIP ${lecturer.nip}` : "",
  lecturer?.nuptk ? `NUPTK ${lecturer.nuptk}` : "",
  !lecturer?.nidn && !lecturer?.nip && lecturer?.employee_id
    ? `ID ${lecturer.employee_id}`
    : "",
].filter(Boolean);

const LecturerSearchField = ({
  label,
  lecturers = [],
  programs = [],
  selectedIds = [],
  onChange,
  multiple = false,
  excludeIds = [],
  hint = "",
  disabled = false,
}) => {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase("id-ID");
  const excluded = useMemo(() => new Set(excludeIds.filter(Boolean)), [excludeIds]);
  const selected = useMemo(
    () => selectedIds
      .map((id) => lecturers.find((lecturer) => lecturer.id === id) || { id, name: id })
      .filter((lecturer) => !excluded.has(lecturer.id)),
    [excluded, lecturers, selectedIds],
  );
  const results = useMemo(() => {
    if (normalizedQuery.length < 2) return [];
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return lecturers
      .filter((lecturer) => !excluded.has(lecturer.id))
      .filter((lecturer) => !multiple || !selectedIds.includes(lecturer.id))
      .filter((lecturer) => {
        const searchable = [
          lecturerName(lecturer),
          lecturer.id,
          lecturer.nidn,
          lecturer.nip,
          lecturer.nuptk,
          lecturer.employee_id,
          lecturerHomebase(lecturer, programs).code,
          lecturerHomebase(lecturer, programs).name,
        ].filter(Boolean).join(" ").toLocaleLowerCase("id-ID");
        return terms.every((term) => searchable.includes(term));
      })
      .slice(0, 8);
  }, [excluded, lecturers, multiple, normalizedQuery, programs, selectedIds]);

  const chooseLecturer = (lecturerId) => {
    if (disabled) return;
    onChange(multiple ? [...selectedIds, lecturerId] : [lecturerId]);
    setQuery("");
    if (!multiple) setFocused(false);
  };

  const removeLecturer = (lecturerId) => {
    if (disabled) return;
    onChange(selectedIds.filter((id) => id !== lecturerId));
  };

  const showResults = focused && normalizedQuery.length >= 2;

  return (
    <div
      className="relative flex min-w-0 flex-col gap-1"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setFocused(false);
              event.currentTarget.blur();
            }
          }}
          placeholder="Cari nama, NIDN, NIP, atau NUPTK..."
          autoComplete="off"
          role="combobox"
          aria-expanded={showResults}
          aria-autocomplete="list"
          className="min-w-0 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm transition placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        />

        {showResults && (
          <div
            role="listbox"
            className="absolute z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
          >
            {results.length > 0 ? results.map((lecturer) => {
              const identifiers = lecturerIdentifiers(lecturer);
              const homebase = lecturerHomebase(lecturer, programs);
              const isSelected = selectedIds.includes(lecturer.id);
              return (
                <button
                  key={lecturer.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseLecturer(lecturer.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none"
                >
                  <span className="min-w-0">
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-slate-800">
                        {lecturerName(lecturer)}
                      </span>
                      <span
                        title={homebase.name}
                        className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          homebase.valid
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        Homebase {homebase.code}
                      </span>
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {identifiers.join(" · ") || `ID ${lecturer.id}`}
                    </span>
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-indigo-600" />}
                </button>
              );
            }) : (
              <p className="px-3 py-5 text-center text-xs text-slate-500">
                Dosen tidak ditemukan untuk kata kunci tersebut.
              </p>
            )}
          </div>
        )}
      </div>

      {normalizedQuery.length === 1 && focused && (
        <span className="text-xs text-slate-400">Ketik minimal 2 karakter untuk mencari.</span>
      )}

      {selected.length > 0 && (
        <div className={multiple ? "flex flex-wrap gap-1.5 pt-1" : "pt-1"}>
          {selected.map((lecturer) => {
            const homebase = lecturerHomebase(lecturer, programs);
            return (
              <span
                key={lecturer.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 py-1 pl-2.5 pr-1.5 text-xs text-indigo-800"
              >
                <span className="truncate">{lecturerName(lecturer)}</span>
                <span
                  title={homebase.name}
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                    homebase.valid
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {homebase.code}
                </span>
                {!disabled && <button
                  type="button"
                  onClick={() => removeLecturer(lecturer.id)}
                  className="shrink-0 rounded-full p-0.5 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  aria-label={`Hapus ${lecturerName(lecturer)}`}
                >
                  <X className="h-3 w-3" />
                </button>}
              </span>
            );
          })}
        </div>
      )}

      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
};

const EmptyState = ({ Icon = Inbox, title, desc }) => (
  <div className="flex flex-col items-center justify-center px-4 py-12 text-center sm:py-16">
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

  const isKaprodi = Boolean(user && user.role !== "admin" && isKaprodiUser(user));
  const kaprodiProdiId = user?.kaprodi_prodi_id || user?.prodi_id;
  const isOrdinaryLecturer = Boolean(
    user
    && ["lecturer", "dosen"].includes(String(user.role || "").toLowerCase())
    && !isKaprodi
    && (!Array.isArray(user.access_roles) || user.access_roles.length === 0),
  );
  const scopedProdiId = isKaprodi ? kaprodiProdiId : (isOrdinaryLecturer ? user?.prodi_id : "");
  const prodiFilterLocked = Boolean(scopedProdiId && (isKaprodi || isOrdinaryLecturer));

  useEffect(() => {
    if (prodiFilterLocked && scopedProdiId && selectedProdi !== scopedProdiId) {
      setSelectedProdi(scopedProdiId);
    }
  }, [prodiFilterLocked, scopedProdiId, selectedProdi]);

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
  const [courseError, setCourseError] = useState("");
  const [courseLifecycleLocked, setCourseLifecycleLocked] = useState(false);
  const [retiringCourse, setRetiringCourse] = useState(null);
  const [retireReason, setRetireReason] = useState("");
  const [replacementCourseId, setReplacementCourseId] = useState("");
  const [retireEffectiveFrom, setRetireEffectiveFrom] = useState("");
  const [retireLoading, setRetireLoading] = useState(false);
  const [retireError, setRetireError] = useState("");

  useEffect(() => {
    if (!showCourseForm) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !courseLoading) setShowCourseForm(false);
    };
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [courseLoading, showCourseForm]);

  const loadData = useCallback(() => {
    API("/api/v1/kurikulum").then((d) => Array.isArray(d) && setKurikulumList(d));
    API("/api/v1/master/prodi").then((d) => Array.isArray(d) && setProdiList(d));
    API("/api/v1/master/dosen?selection_context=curriculum_course_mapping")
      .then((d) => Array.isArray(d) && setDosenList(d));
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
    setCourseError("");

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

    let response;
    try {
      response = editingCourseId
        ? await API(`/api/v1/kurikulum/courses/${editingCourseId}`, { method: "PUT", body: JSON.stringify(payload) })
        : await API("/api/v1/kurikulum/courses", { method: "POST", body: JSON.stringify(payload) });
    } catch (error) {
      setCourseError(error.message || "Gagal menyimpan Mata Kuliah");
      setCourseLoading(false);
      return;
    }
    if (response?.detail) {
      setCourseError(typeof response.detail === "string" ? response.detail : "Perubahan Mata Kuliah tidak dapat disimpan.");
      setCourseLoading(false);
      return;
    }

    setCourseLoading(false);
    setShowCourseForm(false);
    setEditingCourseId(null);
    setCourseLifecycleLocked(false);
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

  const openRetireCourse = (course) => {
    setRetiringCourse(course);
    setRetireReason("");
    setReplacementCourseId("");
    setRetireEffectiveFrom("");
    setRetireError("");
  };

  const retireCourse = async () => {
    if (!retiringCourse || retireReason.trim().length < 3) {
      setRetireError("Alasan minimal 3 karakter wajib diisi.");
      return;
    }
    setRetireLoading(true);
    setRetireError("");
    try {
      const response = await API(`/api/v1/kurikulum/courses/${retiringCourse.id}/retire`, {
        method: "POST",
        body: JSON.stringify({
          reason: retireReason.trim(),
          replacement_course_id: replacementCourseId || null,
          effective_from: retireEffectiveFrom.trim() || null,
        }),
      });
      if (response?.detail) throw new Error(typeof response.detail === "string" ? response.detail : "MK tidak dapat diarsipkan.");
      setRetiringCourse(null);
      if (activeKurikulum) loadKurikulumCourses(activeKurikulum.id);
    } catch (error) {
      setRetireError(error.message || "MK tidak dapat diarsipkan.");
    } finally {
      setRetireLoading(false);
    }
  };

  const restoreCourse = async (course) => {
    if (!window.confirm(`Aktifkan kembali ${course.name || course.nama || "Mata Kuliah"}? MK akan tersedia kembali untuk penawaran periode baru.`)) return;
    const response = await API(`/api/v1/kurikulum/courses/${course.id}/restore`, { method: "POST" });
    if (response?.detail) {
      window.alert(typeof response.detail === "string" ? response.detail : "Mata Kuliah tidak dapat diaktifkan kembali.");
      return;
    }
    if (activeKurikulum) loadKurikulumCourses(activeKurikulum.id);
  };

  const replacementOptions = useMemo(
    () => courses.filter((course) =>
      course.id !== retiringCourse?.id
      && !["deleted", "inactive", "retired"].includes(String(course.status || "active").toLowerCase())
    ),
    [courses, retiringCourse],
  );

  const editCourse = (course) => {
    setEditingCourseId(course.id);
    setCourseForm({
      kode: course.code || course.kode || "",
      nama: course.name || course.nama || "",
      sks_teori: course.sks_teori || course.sks || 2,
      sks_praktikum: course.sks_praktikum || 0,
      semester_paket: parseInt(course.semester_paket || course.semester || activeSemesterTab),
      sifat: course.sifat || "wajib",
      dosen_utama_id: course.dosen_utama_id || "",
      dosen_anggota_ids: course.dosen_anggota_ids || [],
    });
    setCourseError("");
    setCourseLifecycleLocked(Boolean(course.lifecycle_locked));
    setShowCourseForm(true);
  };

  const scopedProdiObj = useMemo(() => {
    if (!scopedProdiId) return null;
    const target = String(scopedProdiId).toLowerCase();
    return prodiList.find((p) => String(p.id).toLowerCase() === target || String(p.kode).toLowerCase() === target);
  }, [prodiList, scopedProdiId]);

  const filteredKurikulum = useMemo(() => {
    if (prodiFilterLocked && scopedProdiId) {
      const target = String(scopedProdiId).toLowerCase();
      return kurikulumList.filter((k) =>
        String(k.prodi_id || "").toLowerCase() === target ||
        String(k.prodi_kode || "").toLowerCase() === target ||
        String(k.prodi_nama || "").toLowerCase() === String(scopedProdiObj?.nama || scopedProdiObj?.name || "").toLowerCase()
      );
    }
    if (selectedProdi) {
      return kurikulumList.filter((k) => k.prodi_id === selectedProdi);
    }
    return kurikulumList;
  }, [kurikulumList, prodiFilterLocked, scopedProdiId, scopedProdiObj, selectedProdi]);

  const prodiOptions = prodiFilterLocked && scopedProdiId
    ? [[scopedProdiId, scopedProdiObj ? `${scopedProdiObj.nama} (${scopedProdiObj.kode})` : scopedProdiId]]
    : [
        ["", "-- Semua Program Studi --"],
        ...prodiList.map((p) => [p.id, `${p.nama} (${p.kode})`]),
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
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4 overflow-x-hidden sm:space-y-6" data-testid="kurikulum-master-page">
      {/* ── DETAIL VIEW KURIKULUM ── */}
      {activeKurikulum ? (
        <div className="min-w-0 space-y-4 sm:space-y-6">
          {/* Header Navigation */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3 sm:items-center">
              <button
                onClick={() => setActiveKurikulum(null)}
                className="shrink-0 p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
                aria-label="Kembali ke daftar kurikulum"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="min-w-0 break-words text-lg font-bold leading-tight text-slate-900 sm:text-xl">{activeKurikulum.nama}</h1>
                  <StatusBadge color={activeKurikulum.status === "active" ? "green" : "gray"}>
                    {activeKurikulum.kode}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">
                  {activeKurikulum.prodi_nama || "Program Studi"} — Berlaku Mulai {activeKurikulum.tahun_mulai}
                </p>
              </div>
            </div>
            {!isOrdinaryLecturer && <Btn onClick={() => {
              setEditingCourseId(null);
              setCourseError("");
              setCourseLifecycleLocked(false);
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
            }} className="w-full sm:w-auto">
              <Plus className="w-4 h-4" /> Tambah Mata Kuliah
            </Btn>}
          </div>

          {/* Stats Cards Breakdown */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
            <Card className="p-3 sm:p-4 bg-indigo-50/50 border-indigo-100">
              <span className="text-xs font-medium text-indigo-600">Total Beban Kurikulum</span>
              <p className="mt-1 text-xl font-bold text-indigo-900 sm:text-2xl">{totalSksKurikulum} <span className="text-sm font-normal text-indigo-600">SKS</span></p>
              <p className="text-xs text-indigo-500 mt-0.5">Target Lulus: {activeKurikulum.total_sks_lulus || 144} SKS</p>
            </Card>
            <Card className="p-3 sm:p-4 bg-blue-50/50 border-blue-100">
              <span className="text-xs font-medium text-blue-600">Rincian Kuliah & Praktikum</span>
              <p className="mt-1 text-base font-bold leading-snug text-blue-900 sm:text-lg">{totalSksTeori} <span className="text-xs font-normal">SKS Teori</span> + {totalSksPrak} <span className="text-xs font-normal">SKS Prak</span></p>
              <p className="text-xs text-blue-500 mt-0.5">{courses.length} Total Mata Kuliah</p>
            </Card>
            <Card className="p-3 sm:p-4 bg-emerald-50/50 border-emerald-100">
              <span className="text-xs font-medium text-emerald-600">MK Wajib</span>
              <p className="mt-1 text-xl font-bold text-emerald-900 sm:text-2xl">{totalSksWajib} <span className="text-sm font-normal text-emerald-600">SKS</span></p>
              <p className="text-xs text-emerald-500 mt-0.5">{courses.filter((c) => c.sifat === "wajib").length} Mata Kuliah Wajib</p>
            </Card>
            <Card className="p-3 sm:p-4 bg-purple-50/50 border-purple-100">
              <span className="text-xs font-medium text-purple-600">MK Pilihan</span>
              <p className="mt-1 text-xl font-bold text-purple-900 sm:text-2xl">{totalSksPilihan} <span className="text-sm font-normal text-purple-600">SKS</span></p>
              <p className="text-xs text-purple-500 mt-0.5">{courses.filter((c) => c.sifat === "pilihan").length} Mata Kuliah Pilihan</p>
            </Card>
          </div>

          {/* Form Modal Add / Edit Course */}
          {showCourseForm && (
            <div
              className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/55 p-2 sm:p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="course-form-title"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !courseLoading) setShowCourseForm(false);
              }}
            >
              <div className="flex min-h-full items-start justify-center sm:items-center">
                <div
                  className="my-0 flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-2xl sm:my-4 sm:max-h-[calc(100dvh-2rem)]"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600">
                        {editingCourseId ? "Perbarui data" : `Semester Paket ${activeSemesterTab}`}
                      </p>
                      <h3 id="course-form-title" className="mt-1 break-words text-lg font-bold leading-tight text-slate-800 sm:text-xl">
                        {editingCourseId ? "Edit Mata Kuliah & Dosen Pengampu" : "Tambah Mata Kuliah"}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCourseForm(false)}
                      disabled={courseLoading}
                      className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Tutup formulir mata kuliah"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-6">
                    <div className="space-y-4">
                      {courseError && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">
                          {courseError}
                        </div>
                      )}
                      {courseLifecycleLocked && (
                        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm leading-5 text-indigo-900">
                          MK ini sudah dipakai kelas/KRS sehingga identitasnya dikunci. Dosen master di bawah ini menjadi
                          default untuk penawaran kelas berikutnya; untuk kelas yang sedang berjalan, gunakan menu
                          <strong> Jadwal Mengajar → Ganti Dosen</strong> agar riwayat pembelajaran tetap aman.
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FieldInput label="Kode MK" value={courseForm.kode} onChange={(v) => setCourseForm((p) => ({ ...p, kode: v }))} placeholder="IF201" required disabled={courseLifecycleLocked} />
                        <FieldInput label="Nama Mata Kuliah" value={courseForm.nama} onChange={(v) => setCourseForm((p) => ({ ...p, nama: v }))} placeholder="Pemrograman Web" required disabled={courseLifecycleLocked} />

                        <FieldInput label="SKS Teori / Tatap Muka" type="number" value={courseForm.sks_teori} onChange={(v) => setCourseForm((p) => ({ ...p, sks_teori: v }))} required disabled={courseLifecycleLocked} />
                        <FieldInput label="SKS Praktikum / Lab" type="number" value={courseForm.sks_praktikum} onChange={(v) => setCourseForm((p) => ({ ...p, sks_praktikum: v }))} required disabled={courseLifecycleLocked} />

                        <FieldSelect
                          label="Semester Paket"
                          value={courseForm.semester_paket}
                          onChange={(v) => setCourseForm((p) => ({ ...p, semester_paket: v }))}
                          options={[1, 2, 3, 4, 5, 6, 7, 8].map((s) => [s, `Semester Paket ${s}`])}
                          disabled={courseLifecycleLocked}
                        />

                        <FieldSelect
                          label="Sifat Mata Kuliah"
                          value={courseForm.sifat}
                          onChange={(v) => setCourseForm((p) => ({ ...p, sifat: v }))}
                          options={[["wajib", "Wajib"], ["pilihan", "Pilihan"]]}
                          disabled={courseLifecycleLocked}
                        />

                        <LecturerSearchField
                          label="Dosen Pengampu Utama (Koordinator)"
                          lecturers={dosenList}
                          programs={prodiList}
                          selectedIds={courseForm.dosen_utama_id ? [courseForm.dosen_utama_id] : []}
                          onChange={(ids) => setCourseForm((previous) => ({
                            ...previous,
                            dosen_utama_id: ids[0] || "",
                            dosen_anggota_ids: previous.dosen_anggota_ids.filter(
                              (id) => id !== ids[0],
                            ),
                          }))}
                          hint="Dosen penanggung jawab mata kuliah"
                        />

                        <LecturerSearchField
                          label="Team Teaching (Dosen Anggota)"
                          lecturers={dosenList}
                          programs={prodiList}
                          selectedIds={courseForm.dosen_anggota_ids}
                          onChange={(ids) => setCourseForm((previous) => ({
                            ...previous,
                            dosen_anggota_ids: ids,
                          }))}
                          multiple
                          excludeIds={[courseForm.dosen_utama_id]}
                          hint="Cari dan pilih satu atau beberapa dosen pendamping"
                        />
                      </div>

                      <div className="flex flex-col items-start gap-1 rounded-lg border border-indigo-200 bg-indigo-100/60 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <span className="font-medium text-indigo-800">Beban Total Mata Kuliah:</span>
                        <span className="break-words text-base font-bold text-indigo-900 sm:text-right">
                          {(parseInt(courseForm.sks_teori) || 0) + (parseInt(courseForm.sks_praktikum) || 0)} SKS
                          <span className="ml-1.5 text-xs font-normal text-indigo-600">
                            ({courseForm.sks_teori || 0} Teori + {courseForm.sks_praktikum || 0} Prak)
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-white px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:flex sm:justify-end sm:px-6 sm:py-4">
                    <Btn variant="secondary" onClick={() => setShowCourseForm(false)} disabled={courseLoading} className="w-full sm:w-auto">Batal</Btn>
                    <Btn onClick={saveCourse} disabled={courseLoading || !courseForm.kode || !courseForm.nama} className="w-full sm:w-auto">
                      {courseLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {courseLoading ? "Menyimpan..." : "Simpan MK"}
                    </Btn>
                  </div>
                </div>
              </div>
            </div>
          )}

          {retiringCourse && (
            <div
              className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="retire-course-title"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !retireLoading) setRetiringCourse(null);
              }}
            >
              <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-amber-200 bg-white p-4 shadow-2xl sm:max-w-xl sm:rounded-2xl sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">Arsipkan mata kuliah</p>
                    <h3 id="retire-course-title" className="mt-1 text-lg font-bold text-slate-900">{retiringCourse.name || retiringCourse.nama}</h3>
                    <p className="mt-1 text-xs text-slate-500">{retiringCourse.code || retiringCourse.kode} · Histori akademik tidak akan dihapus.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRetiringCourse(null)}
                    disabled={retireLoading}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                    aria-label="Tutup arsip mata kuliah"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  <InfoBox variant="warning">
                    MK akan dikeluarkan dari penawaran kelas dan KRS baru, tetapi kelas lama, KRS, presensi, nilai, dan laporan BKD tetap tersimpan.
                  </InfoBox>
                  {retireError && <InfoBox variant="warning">{retireError}</InfoBox>}
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700" htmlFor="retire-course-reason">Alasan tidak lagi digunakan<span className="ml-0.5 text-red-500">*</span></label>
                    <textarea
                      id="retire-course-reason"
                      value={retireReason}
                      onChange={(event) => setRetireReason(event.target.value)}
                      placeholder="Contoh: Digantikan oleh MK baru pada revisi kurikulum 2026"
                      rows={3}
                      className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <FieldInput
                    label="Mulai periode (opsional)"
                    value={retireEffectiveFrom}
                    onChange={setRetireEffectiveFrom}
                    placeholder="Contoh: Ganjil 2026/2027"
                  />
                  <FieldSelect
                    label="MK pengganti (opsional)"
                    value={replacementCourseId}
                    onChange={setReplacementCourseId}
                    options={[["", "Tidak ada MK pengganti"], ...replacementOptions.map((course) => [course.id, `${course.code || course.kode || "Tanpa kode"} — ${course.name || course.nama}`])]}
                    hint="MK pengganti harus berada pada prodi yang sama."
                  />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                  <Btn variant="secondary" onClick={() => setRetiringCourse(null)} disabled={retireLoading} className="w-full sm:w-auto">Batal</Btn>
                  <Btn variant="danger" onClick={retireCourse} disabled={retireLoading || retireReason.trim().length < 3} className="w-full sm:w-auto">
                    {retireLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {retireLoading ? "Mengarsipkan..." : "Arsipkan MK"}
                  </Btn>
                </div>
              </div>
            </div>
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
              <>
                <div className="divide-y divide-slate-100 md:hidden">
                  {semesterCourses.map((c) => {
                    const totalSks = (parseInt(c.sks_teori) || parseInt(c.sks) || 0) + (parseInt(c.sks_praktikum) || 0);
                    return (
                      <article key={c.id} className="space-y-3 p-4" data-testid={`kurikulum-course-mobile-${c.id}`}>
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-mono text-xs font-bold text-indigo-700">{c.code || c.kode}</p>
                            <h3 className="mt-0.5 break-words text-sm font-semibold leading-5 text-slate-900">{c.name || c.nama}</h3>
                          </div>
                          <div className="flex flex-wrap justify-end gap-1">
                            <StatusBadge color={c.sifat === "wajib" ? "green" : "purple"}>
                              {c.sifat === "wajib" ? "Wajib" : "Pilihan"}
                            </StatusBadge>
                            {c.status === "retired" && <StatusBadge color="gray">Tidak Aktif</StatusBadge>}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
                          <div>
                            <p className="text-slate-500">Rincian SKS</p>
                            <p className="mt-0.5 font-semibold text-slate-800">{c.sks_teori || c.sks || 0} Teori + {c.sks_praktikum || 0} Praktik</p>
                          </div>
                          <div className="border-l border-slate-200 pl-3">
                            <p className="text-slate-500">Total beban</p>
                            <p className="mt-0.5 font-bold text-slate-900">{totalSks} SKS</p>
                          </div>
                        </div>

                        <div className="space-y-2 text-xs">
                          <div className="flex items-start gap-2">
                            <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
                            <div className="min-w-0">
                              <p className="text-slate-500">Dosen utama</p>
                              <p className={`break-words font-medium ${c.dosen_utama_nama ? "text-slate-800" : "italic text-slate-400"}`}>
                                {c.dosen_utama_nama || "Belum di-assign"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                            <div className="min-w-0">
                              <p className="text-slate-500">Team teaching</p>
                              <p className="break-words text-slate-700">
                                {Array.isArray(c.dosen_anggota_namas) && c.dosen_anggota_namas.length > 0
                                  ? c.dosen_anggota_namas.join(", ")
                                  : "—"}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                          <Btn
                            size="sm"
                            variant="secondary"
                            onClick={() => setSelectedRpsCourse(c)}
                            className="w-full border-indigo-200 bg-indigo-50 px-2 text-xs text-indigo-700 hover:bg-indigo-100"
                          >
                            <BookOpen className="h-3.5 w-3.5" /> RPS
                          </Btn>
                          {!isOrdinaryLecturer && (
                            <>
                              <Btn size="sm" variant="ghost" onClick={() => editCourse(c)} className="w-full px-2">Edit</Btn>
                              {c.status === "retired" ? (
                                <Btn size="sm" variant="ghost" onClick={() => restoreCourse(c)} className="w-full px-2 text-emerald-700 hover:bg-emerald-50">Aktifkan</Btn>
                              ) : (
                                <Btn size="sm" variant="ghost" onClick={() => openRetireCourse(c)} className="w-full px-2 text-amber-700 hover:bg-amber-50">Nonaktifkan</Btn>
                              )}
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[920px] text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Kode</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Mata Kuliah</th>
                        <th className="px-4 py-3 text-center font-medium text-slate-600">Rincian SKS</th>
                        <th className="px-4 py-3 text-center font-medium text-slate-600">Total SKS</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Sifat</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Dosen Pengampu Utama</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Team Teaching</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {semesterCourses.map((c) => {
                        const totalSks = (parseInt(c.sks_teori) || parseInt(c.sks) || 0) + (parseInt(c.sks_praktikum) || 0);
                        return (
                          <tr key={c.id} className="transition hover:bg-slate-50">
                            <td className="px-4 py-3 font-mono font-semibold text-indigo-700">{c.code || c.kode}</td>
                            <td className="px-4 py-3 font-medium">{c.name || c.nama}</td>
                            <td className="px-4 py-3 text-center text-xs text-slate-500">
                              {c.sks_teori || c.sks || 0} T + {c.sks_praktikum || 0} P
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-slate-900">{totalSks} SKS</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                <StatusBadge color={c.sifat === "wajib" ? "green" : "purple"}>
                                  {c.sifat === "wajib" ? "Wajib" : "Pilihan"}
                                </StatusBadge>
                                {c.status === "retired" && <StatusBadge color="gray">Tidak Aktif</StatusBadge>}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-800">
                              {c.dosen_utama_nama ? (
                                <div className="flex items-center gap-1.5">
                                  <UserCheck className="h-3.5 w-3.5 text-indigo-600" />
                                  <span>{c.dosen_utama_nama}</span>
                                </div>
                              ) : (
                                <span className="text-xs italic text-slate-400">Belum di-assign</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600">
                              {Array.isArray(c.dosen_anggota_namas) && c.dosen_anggota_namas.length > 0 ? (
                                <span>{c.dosen_anggota_namas.join(", ")}</span>
                              ) : (
                                <span className="italic text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <Btn
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setSelectedRpsCourse(c)}
                                  className="border-indigo-200 bg-indigo-50 text-xs text-indigo-700 hover:bg-indigo-100"
                                >
                                  <BookOpen className="h-3.5 w-3.5" /> RPS
                                </Btn>
                                {!isOrdinaryLecturer && (
                                  <>
                                    <Btn size="sm" variant="ghost" onClick={() => editCourse(c)}>Edit</Btn>
                                    {c.status === "retired" ? (
                                      <Btn size="sm" variant="ghost" onClick={() => restoreCourse(c)} className="text-emerald-700 hover:bg-emerald-50">Aktifkan</Btn>
                                    ) : (
                                      <Btn size="sm" variant="ghost" onClick={() => openRetireCourse(c)} className="text-amber-700 hover:bg-amber-50">Nonaktifkan</Btn>
                                    )}
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
              </>
            )}
          </Card>

          {/* Modal RPS Silabus Feeder */}
          {selectedRpsCourse && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
              <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl">
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6 sm:py-4">
                  <div className="min-w-0">
                    <h2 className="flex items-start gap-2 break-words text-base font-bold leading-5 text-slate-900 sm:text-lg sm:leading-6">
                      <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                      <span>Rencana Pembelajaran Semester (RPS): {selectedRpsCourse.name || selectedRpsCourse.nama}</span>
                    </h2>
                    <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                      Kode: {selectedRpsCourse.kode || selectedRpsCourse.code} · Total SKS: {selectedRpsCourse.sks_teori || selectedRpsCourse.sks || 2} Teori + {selectedRpsCourse.sks_praktikum || 0} Prak
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedRpsCourse(null)}
                    className="shrink-0 rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-300"
                  >
                    Tutup
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
                  {Array.isArray(selectedRpsCourse.rps_rencana_pembelajaran) && selectedRpsCourse.rps_rencana_pembelajaran.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-2 border-b border-slate-100 pb-2 text-xs font-medium text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                        <span>Menampilkan {selectedRpsCourse.rps_rencana_pembelajaran.length} Rencana Pertemuan Silabus</span>
                        <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Ter-sinkron Feeder PDDIKTI</span>
                      </div>
                      <div className="space-y-2.5">
                        {selectedRpsCourse.rps_rencana_pembelajaran.map((rp, idx) => (
                          <div key={idx} className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 hover:border-indigo-300 transition">
                            <div className="flex flex-wrap items-center justify-between gap-2">
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
        <div className="min-w-0 space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3 sm:items-center">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                <BookOpen className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="min-w-0">
                <h1 className="break-words text-lg font-bold leading-tight text-slate-900 sm:text-xl">Kurikulum &amp; Dosen Pengampu</h1>
                <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">Kelola versi kurikulum, paket MK per semester, rincian SKS, dan penugasan Dosen</p>
              </div>
            </div>
	            {!isOrdinaryLecturer && <Btn onClick={() => {
              setEditingKurId(null);
              setKurForm({ kode: "", nama: "", prodi_id: selectedProdi || "", tahun_mulai: "2024", total_sks_lulus: 144, deskripsi: "", status: "active" });
              setShowKurForm(true);
            }} className="w-full sm:w-auto">
              <Plus className="w-4 h-4" /> Buat Kurikulum Baru
	            </Btn>}
          </div>

          {isKaprodi && (
            <div className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50/80 p-3 text-indigo-900 shadow-sm sm:p-4">
              <div className="h-9 w-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                <Award className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="break-words text-sm font-bold leading-5">Hak Akses Kaprodi: Program Studi {prodiList.find(p => p.id === kaprodiProdiId)?.nama || kaprodiProdiId}</p>
                <p className="mt-1 text-xs leading-5 text-indigo-700">
                  Sebagai Ketua Program Studi (Kaprodi), Anda memiliki wewenang penuh menyusun Kurikulum, daftar Mata Kuliah, dan menugaskan Dosen Pengampu (Dosen Utama & Team Teaching) untuk prodi Anda.
                </p>
              </div>
            </div>
          )}

          {/* Filter per Prodi */}
          <div className="flex flex-col items-stretch gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:gap-4">
            <span className="text-sm font-medium text-slate-700">Filter Program Studi:</span>
            <div className="w-full min-w-0 sm:w-80">
              <FieldSelect
	                value={prodiFilterLocked ? scopedProdiId : selectedProdi}
	                onChange={(v) => !prodiFilterLocked && setSelectedProdi(v)}
	                options={prodiOptions}
	                disabled={prodiFilterLocked}
              />
            </div>
          </div>

          {/* Form Modal Add / Edit Master Kurikulum */}
          {showKurForm && (
            <Card className="space-y-4 border-indigo-200 bg-indigo-50/30 p-4 sm:p-5">
              <h3 className="break-words font-semibold text-slate-800">{editingKurId ? "Edit Kurikulum Master" : "Buat Kurikulum Master Baru"}</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <Btn variant="secondary" onClick={() => setShowKurForm(false)} className="w-full sm:w-auto">Batal</Btn>
                <Btn onClick={saveKurikulum} disabled={kurLoading || !kurForm.kode || !kurForm.nama} className="w-full sm:w-auto">
                  {kurLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {kurLoading ? "Menyimpan..." : "Simpan Kurikulum"}
                </Btn>
              </div>
            </Card>
          )}

          {/* List Kurikulum Cards */}
          <div className="space-y-4">
            {filteredKurikulum.length === 0 ? (
	              <Card><EmptyState Icon={BookOpen} title="Belum ada Kurikulum" desc={isOrdinaryLecturer ? "Belum ada kurikulum pada prodi homebase Anda." : "Klik 'Buat Kurikulum Baru' untuk menambahkan versi kurikulum baru."} /></Card>
            ) : (
              filteredKurikulum.map((kur) => (
                <Card key={kur.id} className="group p-4 transition hover:border-indigo-300 sm:p-5">
                  <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-all font-mono text-sm font-bold text-indigo-600 sm:text-base">{kur.kode}</span>
                        <h3 className="break-words text-base font-bold text-slate-900 sm:text-lg">{kur.nama}</h3>
                        <StatusBadge color={kur.status === "active" ? "green" : "gray"}>
                          {kur.status === "active" ? "Aktif" : kur.status}
                        </StatusBadge>
                      </div>
                      <p className="break-words text-xs leading-5 text-slate-500 sm:text-sm">
                        Prodi: <strong>{kur.prodi_nama || "Semua Prodi"}</strong> — Berlaku {kur.tahun_mulai} — Syarat Lulus: <strong>{kur.total_sks_lulus || 144} SKS</strong>
                      </p>
                    </div>

                    <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
	                      {!isOrdinaryLecturer && <Btn variant="secondary" onClick={() => {
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
                      }} className="w-full sm:w-auto">
                        <Pencil className="w-3.5 h-3.5" /> Edit
	                      </Btn>}
	                      <Btn onClick={() => openDetail(kur)} className="w-full px-2 sm:w-auto sm:px-4">
	                        {isOrdinaryLecturer ? "Lihat MK & Dosen →" : "Kelola MK & SKS →"}
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

function progressBarColor(value) {
  if (value >= 100) return "bg-emerald-500";
  if (value >= 70) return "bg-indigo-500";
  if (value > 0) return "bg-amber-500";
  return "bg-slate-300";
}

function progressStatusColor(status) {
  if (status === "Lengkap") return "green";
  if (status === "Belum dimulai") return "gray";
  if (status === "Dosen pengampu belum lengkap") return "yellow";
  return "blue";
}

function formatProgressDate(value) {
  if (!value) return "Belum ada perubahan";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Belum ada perubahan";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function progressWebSocketUrl(token) {
  const configuredBase = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");
  const base = configuredBase || window.location.origin;
  return `${base.replace(/^http/, "ws")}/api/v1/kurikulum/progress/ws?token=${encodeURIComponent(token || "")}`;
}

export function KurikulumProgressPage() {
  const [payload, setPayload] = useState({ summary: {}, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);

  const loadProgress = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await API("/api/v1/kurikulum/progress");
      if (response?.detail) throw new Error(response.detail);
      setPayload({ summary: response?.summary || {}, items: Array.isArray(response?.items) ? response.items : [] });
      setError("");
    } catch (loadError) {
      setError(loadError.message || "Progres kurikulum gagal dimuat.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProgress();
    const interval = window.setInterval(() => loadProgress(true), 30000);
    return () => window.clearInterval(interval);
  }, [loadProgress]);

  useEffect(() => {
    const token = localStorage.getItem("elearn_token");
    if (!token || typeof WebSocket === "undefined") return undefined;
    let disposed = false;
    let retryTimer;
    let socket;

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(progressWebSocketUrl(token));
      socket.onopen = () => setLiveConnected(true);
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "curriculum_progress_updated") loadProgress(true);
        } catch (parseError) {
          // Ignore malformed heartbeat data and keep the polling fallback active.
        }
      };
      socket.onerror = () => setLiveConnected(false);
      socket.onclose = () => {
        setLiveConnected(false);
        if (!disposed) retryTimer = window.setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [loadProgress]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("id-ID");
    return payload.items.filter((item) => {
      const searchable = `${item.prodi_nama || ""} ${item.prodi_kode || ""}`.toLocaleLowerCase("id-ID");
      const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
      const matchesStatus = !onlyIncomplete || item.overall_progress < 100;
      return matchesSearch && matchesStatus;
    });
  }, [onlyIncomplete, payload.items, search]);

  const summary = payload.summary || {};

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5" data-testid="kurikulum-progress-page">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100">
            <BarChart3 className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Progres Kurikulum &amp; Dosen Pengampu</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Pantau kelengkapan input kurikulum dan penugasan dosen pengampu pada setiap Program Studi.
              Data diperbarui otomatis ketika ada perubahan.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">
          {liveConnected ? <Wifi className="h-3.5 w-3.5 text-emerald-600" /> : <WifiOff className="h-3.5 w-3.5 text-amber-600" />}
          {liveConnected ? "Realtime aktif" : "Mode polling"}
          <button type="button" onClick={() => loadProgress()} className="ml-1 rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-indigo-600" title="Muat ulang progres">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Rata-rata progres", `${summary.average_progress || 0}%`, "Kurikulum + dosen pengampu", "bg-indigo-50 text-indigo-700"],
          ["Progres kurikulum", `${summary.average_curriculum_progress || 0}%`, "Berdasarkan capaian SKS", "bg-blue-50 text-blue-700"],
          ["Progres dosen", `${summary.average_lecturer_progress || 0}%`, "MK sudah memiliki pengampu", "bg-amber-50 text-amber-700"],
          ["Prodi lengkap", `${summary.completed_program_count || 0}/${summary.program_count || 0}`, "Kurikulum dan dosen 100%", "bg-emerald-50 text-emerald-700"],
        ].map(([label, value, hint, tone]) => (
          <Card key={label} className={`border-transparent p-4 ${tone}`}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            <p className="mt-1 text-xs opacity-80">{hint}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Detail progres per Program Studi</h2>
            <p className="mt-1 text-xs text-slate-500">Terakhir dihitung: {formatProgressDate(summary.last_updated_at)}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari prodi atau kode..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 sm:w-56"
            />
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={onlyIncomplete} onChange={(event) => setOnlyIncomplete(event.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              Hanya belum lengkap
            </label>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Memuat progres...</div>
        ) : filteredItems.length === 0 ? (
          <EmptyState Icon={CheckCircle2} title="Tidak ada data progres" desc={search || onlyIncomplete ? "Sesuaikan filter untuk melihat Program Studi lain." : "Belum ada Program Studi aktif yang dapat dipantau."} />
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredItems.map((item) => (
              <div key={item.prodi_id} className="grid gap-4 p-4 lg:grid-cols-[minmax(180px,1.15fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-600">{item.prodi_kode || "-"}</span>
                    <StatusBadge color={progressStatusColor(item.status_label)}>{item.status_label}</StatusBadge>
                  </div>
                  <p className="mt-2 truncate font-semibold text-slate-900" title={item.prodi_nama}>{item.prodi_nama}</p>
                  <p className="mt-1 truncate text-xs text-slate-500" title={item.kurikulum_nama || ""}>{item.kurikulum_nama || "Belum ada kurikulum"}</p>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600"><span>Total</span><span>{item.overall_progress}%</span></div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all ${progressBarColor(item.overall_progress)}`} style={{ width: `${item.overall_progress}%` }} /></div>
                  <p className="mt-1 text-[11px] text-slate-400">Kombinasi dua indikator</p>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600"><span>Kurikulum</span><span>{item.curriculum_progress}%</span></div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all ${progressBarColor(item.curriculum_progress)}`} style={{ width: `${item.curriculum_progress}%` }} /></div>
                  <p className="mt-1 text-[11px] text-slate-400">{item.entered_sks} / {item.target_sks} SKS · {item.course_count} MK</p>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600"><span>Dosen pengampu</span><span>{item.lecturer_progress}%</span></div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all ${progressBarColor(item.lecturer_progress)}`} style={{ width: `${item.lecturer_progress}%` }} /></div>
                  <p className="mt-1 text-[11px] text-slate-400">{item.assigned_course_count} / {item.course_count} MK terisi</p>
                </div>
                <div className="text-left text-xs text-slate-400 lg:text-right">
                  <p>{formatProgressDate(item.last_updated_at)}</p>
                  <p className="mt-1 text-[11px]">{item.kurikulum_kode || "Tanpa kode kurikulum"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
