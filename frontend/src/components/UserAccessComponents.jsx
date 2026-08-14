/**
 * UserAccessComponents.jsx
 * Komponen UI Manajemen Hak Akses User & Modul SIAKAD
 * Mengikuti Sistem Desain UI Aplikasi (Clean White Cards, Indigo Accents, Crisp Typography)
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Shield,
  Users,
  CheckCircle2,
  XCircle,
  Search,
  Plus,
  Edit3,
  Trash2,
  Save,
  Check,
  X,
  Loader2,
  Info,
  Sliders,
  Sparkles,
  Layers,
  GraduationCap,
  Briefcase,
  UserCog,
} from "lucide-react";

const resolveUserAccessBackendUrl = () => {
  const configuredUrl = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");
  if (configuredUrl) return configuredUrl;
  if (typeof window !== "undefined" && window.location?.port === "3000") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return window.location.origin;
};

const API = async (path, opt = {}) => {
  const base = resolveUserAccessBackendUrl();
  const token = localStorage.getItem("elearn_token");
  const res = await fetch(`${base}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opt,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Terjadi kesalahan pada server");
  }
  return res.json();
};

// ─── DEFAULT CONSTANTS (FALLBACK SAFETY) ───────────────────────────────────

const DEFAULT_SYSTEM_MODULES = [
  { key: "dashboard", name: "Dashboard & Ringkasan", category: "Utama", description: "Statistik, aktivitas, dan ringkasan pekerjaan akademik." },
  { key: "materials", name: "Materi & Diskusi Pembelajaran", category: "Pembelajaran", description: "Materi kuliah, file modul, dan forum diskusi kelas." },
  { key: "assignments", name: "Tugas & Kuis", category: "Pembelajaran", description: "Tugas, kuis, pengumpulan, dan penilaian aktivitas kelas." },
  { key: "rps", name: "RPS & Pertemuan", category: "Pembelajaran", description: "RPS 16 pertemuan, capaian pembelajaran, dan rencana sesi." },
  { key: "analisis_rps_prodi", name: "Analisis & Approval RPS Prodi", category: "Mutu Akademik Prodi", description: "Analisis kelengkapan RPS seluruh mata kuliah Prodi dan persetujuan Kaprodi." },
  { key: "attendance", name: "Presensi & Kehadiran", category: "Pembelajaran", description: "Presensi mahasiswa dan rekap kehadiran perkuliahan." },
  { key: "grading", name: "Penilaian, Bobot & Predikat", category: "Evaluasi", description: "Input nilai, komponen bobot, serta predikat nilai." },
  { key: "rekap_nilai", name: "Rekap Nilai, Laporan & BKD", category: "Evaluasi", description: "Rekap nilai, laporan akademik, BKD, dan portofolio dosen." },
  { key: "progres_nilai_prodi", name: "Progres Nilai Prodi", category: "Mutu Akademik Prodi", description: "Monitoring progres input dan finalisasi nilai seluruh kelas dalam Prodi." },
  { key: "analisis_mahasiswa_prodi", name: "Analisis Mahasiswa Prodi", category: "Mutu Akademik Prodi", description: "Analisis kehadiran, nilai, tugas, aktivitas, dan risiko akademik mahasiswa Prodi." },
  { key: "krs_khs", name: "KRS, Perwalian & KHS", category: "SIAKAD", description: "Pengisian dan persetujuan KRS, KHS, serta transkrip mahasiswa." },
  { key: "keuangan", name: "Keuangan, UKT & BIPOT", category: "SIAKAD", description: "Komponen BIPOT, skema UKT, tagihan, pembayaran, dan verifikasi." },
  { key: "pmb", name: "PMB (Penerimaan Mahasiswa Baru)", category: "SIAKAD", description: "Pendaftaran, seleksi, registrasi ulang, dan konversi calon mahasiswa." },
  { key: "academic_setup", name: "Konfigurasi & Periode Akademik", category: "Data Master Akademik", description: "Konfigurasi akademik, setup semester, dan tahun ajaran." },
  { key: "academic_calendar", name: "Kalender Akademik", category: "Data Master Akademik", description: "Kalender kegiatan institusi, publikasi agenda, dan pengaturan tenggat akademik." },
  { key: "academic_structure", name: "Struktur Akademik", category: "Data Master Akademik", description: "Data fakultas dan program studi beserta status aktifnya." },
  { key: "curriculum_schedule", name: "Kurikulum, Mata Kuliah & Jadwal", category: "Data Master Akademik", description: "Kurikulum, dosen pengampu mata kuliah, dan jadwal mengajar." },
  { key: "facilities", name: "Gedung & Ruangan", category: "Data Master Akademik", description: "Master gedung, ruangan, dan kapasitas sarana perkuliahan." },
  { key: "sk_mengajar", name: "SK Mengajar Dosen", category: "Data Master Akademik", description: "Pembuatan, pengelolaan, finalisasi, dan cetak SK Mengajar Dosen." },
  { key: "sk_jabatan", name: "SK Jabatan Akademik Dosen", category: "Data Master Akademik", description: "Penetapan dan persuratan jabatan akademik fungsional dosen." },
  { key: "student_records", name: "Data Mahasiswa", category: "Data Sivitas", description: "Biodata, status studi, detail akademik, dan dokumen mahasiswa." },
  { key: "lecturer_records", name: "Data Dosen & Jabatan Akademik", category: "Data Sivitas", description: "Biodata dosen, NIDN/NUPTK, dan jabatan akademik." },
  { key: "academic_advising", name: "Penempatan & Dosen Wali", category: "Data Sivitas", description: "Penempatan mahasiswa ke prodi/kelas dan penugasan dosen wali." },
  { key: "access_control", name: "Hak Akses User", category: "Sistem & Integrasi", description: "Role, templat, dan pengecualian hak akses per pengguna." },
  { key: "campus_settings", name: "Pengaturan Kampus", category: "Sistem & Integrasi", description: "Identitas kampus, pengaturan aplikasi, dan preferensi operasional." },
  { key: "integration_api", name: "Integrasi API", category: "Sistem & Integrasi", description: "Konfigurasi koneksi dan layanan API eksternal kampus." },
  { key: "feeder", name: "PDDikti Feeder", category: "Sistem & Integrasi", description: "Koneksi, sinkronisasi, dan migrasi data ke PDDikti Neo Feeder." },
  { key: "sso", name: "Login SSO", category: "Sistem & Integrasi", description: "Single Sign-On dan pengaturan autentikasi institusi." },
  { key: "cloud_storage", name: "Google Drive", category: "Sistem & Integrasi", description: "Koneksi penyimpanan dokumen Google Drive." },
  { key: "whatsapp", name: "WhatsApp", category: "Sistem & Integrasi", description: "Konfigurasi notifikasi dan pesan WhatsApp kampus." },
  { key: "email", name: "Email", category: "Sistem & Integrasi", description: "Konfigurasi pengiriman email dan notifikasi sistem." },
  { key: "old_siakad_migration", name: "Migrasi OLD-SIAKAD", category: "Pemeliharaan", description: "Preview dan impor inkremental data dari sistem SIAKAD lama." },
  { key: "database_backup", name: "Backup Database", category: "Pemeliharaan", description: "Pembuatan, pemulihan, dan pemantauan cadangan data sistem." },
  { key: "data_maintenance", name: "Pemeliharaan & Bersihkan Data", category: "Pemeliharaan", description: "Audit, pembersihan data, dan pemeliharaan operasional sistem." }
];

const DEFAULT_ACTIONS = [
  { key: "view", label: "Lihat / Baca" },
  { key: "create", label: "Tambah / Buat" },
  { key: "edit", label: "Ubah / Edit" },
  { key: "delete", label: "Hapus" },
  { key: "export", label: "Export / Cetak" }
];

const templateTargetLabel = (template) => {
  if (template?.id === "tpl_kaprodi") return "Role struktural: Kaprodi / Sekprodi";
  return template?.role_target === "all"
    ? "Semua Role"
    : `Target Role: ${template?.role_target || "all"}`;
};

const createRoleMatrixFallback = (rCode) => {
  const matrix = {};
  DEFAULT_SYSTEM_MODULES.forEach((mod) => {
    if (rCode === "admin") {
      matrix[mod.key] = { view: true, create: true, edit: true, delete: true, export: true };
    } else if (rCode === "lecturer") {
      const isAcademic = ["dashboard", "materials", "assignments", "rps", "attendance", "grading", "rekap_nilai", "krs_khs"].includes(mod.key);
      matrix[mod.key] = {
        view: isAcademic,
        create: ["materials", "assignments", "rps", "attendance", "grading"].includes(mod.key),
        edit: ["materials", "assignments", "rps", "attendance", "grading", "krs_khs"].includes(mod.key),
        delete: isAcademic && ["materials", "assignments"].includes(mod.key),
        export: ["materials", "assignments", "rps", "attendance", "grading", "rekap_nilai", "krs_khs"].includes(mod.key),
      };
    } else {
      const isStudentMod = ["dashboard", "materials", "assignments", "rps", "attendance", "grading", "krs_khs", "keuangan"].includes(mod.key);
      matrix[mod.key] = {
        view: isStudentMod,
        create: mod.key === "assignments" || mod.key === "krs_khs",
        edit: mod.key === "krs_khs",
        delete: false,
        export: ["grading", "krs_khs", "keuangan"].includes(mod.key),
      };
    }
  });
  return matrix;
};

export function UserAccessPage() {
  const [activeTab, setActiveTab] = useState("role_matrix"); // "role_matrix" | "users" | "templates" | "positions"
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState(DEFAULT_SYSTEM_MODULES);
  const [actions, setActions] = useState(DEFAULT_ACTIONS);
  const [templates, setTemplates] = useState([]);
  const [positionMappings, setPositionMappings] = useState([]);
  const [savingPositionMappingId, setSavingPositionMappingId] = useState(null);

  // State Role Permissions Matrix
  const [rolePermissionsList, setRolePermissionsList] = useState([
    { role: "lecturer", name: "Dosen Pengampu", user_count: 0, permissions: createRoleMatrixFallback("lecturer") },
    { role: "student", name: "Mahasiswa", user_count: 0, permissions: createRoleMatrixFallback("student") },
    { role: "admin", name: "Administrator", user_count: 0, permissions: createRoleMatrixFallback("admin") }
  ]);
  const [selectedRoleCode, setSelectedRoleCode] = useState("lecturer");
  const [roleMatrix, setRoleMatrix] = useState(createRoleMatrixFallback("lecturer"));
  const [savingRoleMatrix, setSavingRoleMatrix] = useState(false);

  // State User List
  const [users, setUsers] = useState([]);
  const [userTotal, setUserTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (msg, type = "success") => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // State Modal User Permission Editor
  const [editingUser, setEditingUser] = useState(null);
  const [userAccessDetail, setUserAccessDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingUserPerm, setSavingUserPerm] = useState(false);

  // State Modal Template Editor
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    id: "",
    name: "",
    description: "",
    role_target: "all",
    permissions: {},
  });
  const [savingTemplate, setSavingTemplate] = useState(false);

  // State Modal Bulk Assign
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedBulkTemplate, setSelectedBulkTemplate] = useState("");
  const [savingBulk, setSavingBulk] = useState(false);

  // Fetch Metadata & Roles API
  const loadMetadata = useCallback(async () => {
    try {
      const [modRes, tplRes, rolesRes, positionsRes] = await Promise.all([
        API("/api/v1/user-access/modules").catch(() => null),
        API("/api/v1/user-access/templates").catch(() => null),
        API("/api/v1/user-access/roles").catch(() => null),
        API("/api/v1/user-access/position-mappings").catch(() => null),
      ]);

      if (modRes?.modules && modRes.modules.length > 0) setModules(modRes.modules);
      if (modRes?.actions && modRes.actions.length > 0) setActions(modRes.actions);
      if (Array.isArray(tplRes)) setTemplates(tplRes);
      if (Array.isArray(positionsRes?.data)) setPositionMappings(positionsRes.data);

      if (Array.isArray(rolesRes) && rolesRes.length > 0) {
        setRolePermissionsList(rolesRes);
        const currentRoleDoc = rolesRes.find((r) => r.role === selectedRoleCode) || rolesRes[0];
        if (currentRoleDoc?.permissions) {
          setRoleMatrix(currentRoleDoc.permissions);
        }
      }
    } catch (err) {
      console.warn("Using default module fallback matrix", err);
    }
  }, [selectedRoleCode]);

  // Fetch User Access List API
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (roleFilter !== "all") params.append("role", roleFilter);
      if (searchQuery.trim()) params.append("search", searchQuery.trim());

      const res = await API(`/api/v1/user-access/users?${params.toString()}`).catch(() => null);
      if (res) {
        setUsers(res.data || []);
        setUserTotal(res.total || 0);
      }
    } catch (err) {
      console.warn("User list error", err);
    } finally {
      setLoading(false);
    }
  }, [roleFilter, searchQuery]);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Select Role Switcher
  const handleSelectRole = (rCode) => {
    setSelectedRoleCode(rCode);
    const target = rolePermissionsList.find((r) => r.role === rCode);
    if (target?.permissions) {
      setRoleMatrix(target.permissions);
    } else {
      setRoleMatrix(createRoleMatrixFallback(rCode));
    }
  };

  // Toggle Action Checkbox in Role Matrix
  const handleToggleRolePermission = (modKey, actKey) => {
    const current = roleMatrix[modKey]?.[actKey] || false;
    setRoleMatrix((prev) => ({
      ...prev,
      [modKey]: {
        ...(prev[modKey] || {}),
        [actKey]: !current,
      },
    }));
  };

  // Bulk set permissions in Role Matrix
  const handleRoleBulkSetPermissions = (mode) => {
    const updated = {};
    modules.forEach((mod) => {
      updated[mod.key] = {
        view: mode === "all" || mode === "view_only",
        create: mode === "all",
        edit: mode === "all",
        delete: mode === "all",
        export: mode === "all",
      };
    });
    setRoleMatrix(updated);
  };

  // Save Role Matrix
  const handleSaveRoleMatrix = async () => {
    setSavingRoleMatrix(true);
    try {
      await API(`/api/v1/user-access/roles/${selectedRoleCode}`, {
        method: "POST",
        body: JSON.stringify({ permissions: roleMatrix }),
      });

      const roleName = selectedRoleCode === "lecturer" ? "Dosen" : selectedRoleCode === "student" ? "Mahasiswa" : "Administrator";
      showToast(`Hak akses modul untuk role '${roleName}' berhasil disimpan`);
      loadMetadata();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSavingRoleMatrix(false);
    }
  };

  // Open User Permission Matrix Modal
  const handleOpenUserDetail = async (user) => {
    setEditingUser(user);
    setDetailLoading(true);
    try {
      const detail = await API(`/api/v1/user-access/users/${user.id}`);
      setUserAccessDetail(detail);
    } catch (err) {
      showToast(err.message, "error");
      setEditingUser(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // Toggle Single Action Checkbox in User Detail Modal
  const handleToggleUserPermission = (modKey, actKey) => {
    if (!userAccessDetail) return;
    const current = userAccessDetail.custom_permissions[modKey]?.[actKey] || false;
    const updated = {
      ...userAccessDetail.custom_permissions,
      [modKey]: {
        ...(userAccessDetail.custom_permissions[modKey] || {}),
        [actKey]: !current,
      },
    };
    setUserAccessDetail((prev) => ({
      ...prev,
      custom_permissions: updated,
    }));
  };

  // Save User Permission
  const handleSaveUserPermissions = async () => {
    if (!editingUser || !userAccessDetail) return;
    setSavingUserPerm(true);
    try {
      await API(`/api/v1/user-access/users/${editingUser.id}/permissions`, {
        method: "POST",
        body: JSON.stringify({
          mode: userAccessDetail.access_mode,
          template_id: userAccessDetail.template_id,
          custom_permissions: userAccessDetail.custom_permissions,
        }),
      });
      showToast(`Hak akses untuk ${editingUser.name} berhasil disimpan`);
      setEditingUser(null);
      loadUsers();
      loadMetadata();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSavingUserPerm(false);
    }
  };

  // Open Template Modal (Create / Edit)
  const handleOpenTemplateModal = (tpl = null) => {
    if (tpl) {
      setEditingTemplate(tpl);
      setTemplateForm({
        id: tpl.id,
        name: tpl.name,
        description: tpl.description || "",
        role_target: tpl.role_target || "all",
        permissions: tpl.permissions || {},
      });
    } else {
      const defaultPerms = {};
      modules.forEach((m) => {
        defaultPerms[m.key] = { view: false, create: false, edit: false, delete: false, export: false };
      });
      setEditingTemplate("new");
      setTemplateForm({
        id: "",
        name: "",
        description: "",
        role_target: "all",
        permissions: defaultPerms,
      });
    }
  };

  // Save Template
  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) {
      showToast("Nama templat wajib diisi", "error");
      return;
    }
    setSavingTemplate(true);
    try {
      const isNew = editingTemplate === "new";
      const endpoint = isNew ? "/api/v1/user-access/templates" : `/api/v1/user-access/templates/${templateForm.id}`;
      const method = isNew ? "POST" : "PUT";

      await API(endpoint, {
        method,
        body: JSON.stringify({
          name: templateForm.name,
          description: templateForm.description,
          role_target: templateForm.role_target,
          permissions: templateForm.permissions,
        }),
      });

      showToast(`Templat ${templateForm.name} berhasil disimpan`);
      setEditingTemplate(null);
      loadMetadata();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSavingTemplate(false);
    }
  };

  // Delete Template
  const handleDeleteTemplate = async (tpl) => {
    if (tpl.is_default) {
      showToast("Templat sistem bawaan tidak dapat dihapus", "error");
      return;
    }
    if (!window.confirm(`Apakah Anda yakin ingin menghapus templat '${tpl.name}'?`)) return;

    try {
      await API(`/api/v1/user-access/templates/${tpl.id}`, { method: "DELETE" });
      showToast(`Templat '${tpl.name}' berhasil dihapus`);
      loadMetadata();
      loadUsers();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // Select All Users
  const handleSelectAllUsers = (e) => {
    if (e.target.checked) {
      setSelectedUserIds(users.map((u) => u.id));
    } else {
      setSelectedUserIds([]);
    }
  };

  const handleSelectUser = (id) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Start applying a template directly from its card. The user selection still
  // happens in the user tab, so admins can review the exact recipients first.
  const handleStartTemplateApplication = (tpl) => {
    setSelectedBulkTemplate(tpl.id);
    setActiveTab("users");
    setSelectedUserIds([]);
    setSearchQuery("");
    setRoleFilter(tpl.role_target === "all" ? "all" : tpl.role_target);
    showToast(`Templat '${tpl.name}' siap diterapkan. Pilih pengguna penerima.`);
  };

  const handleSavePositionMapping = async (mapping, templateId) => {
    setSavingPositionMappingId(mapping.jabatan_id);
    try {
      await API(`/api/v1/user-access/position-mappings/${mapping.jabatan_id}`, {
        method: "PUT",
        body: JSON.stringify({
          enabled: Boolean(templateId),
          template_id: templateId || null,
        }),
      });
      showToast(`Pemetaan akses untuk ${mapping.jabatan_nama} berhasil disimpan`);
      await Promise.all([loadMetadata(), loadUsers()]);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSavingPositionMappingId(null);
    }
  };

  // Bulk Apply Template
  const handleBulkAssign = async () => {
    if (!selectedBulkTemplate) {
      showToast("Pilih templat yang ingin diterapkan", "error");
      return;
    }
    setSavingBulk(true);
    try {
      await API("/api/v1/user-access/bulk-assign", {
        method: "POST",
        body: JSON.stringify({
          user_ids: selectedUserIds,
          template_id: selectedBulkTemplate,
        }),
      });
      showToast(`Templat berhasil diterapkan ke ${selectedUserIds.length} pengguna`);
      setShowBulkModal(false);
      setSelectedUserIds([]);
      setSelectedBulkTemplate("");
      loadUsers();
      loadMetadata();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSavingBulk(false);
    }
  };

  const categories = Array.from(new Set(modules.map((m) => m.category || "Lainnya")));
  const pendingBulkTemplate = templates.find((tpl) => tpl.id === selectedBulkTemplate) || null;
  const activePositionMappingCount = positionMappings.filter((mapping) => mapping.enabled && mapping.template_id).length;
  const selectedRoleObj = rolePermissionsList.find((r) => r.role === selectedRoleCode) || {
    name: selectedRoleCode === "lecturer" ? "Dosen Pengampu" : selectedRoleCode === "student" ? "Mahasiswa" : "Administrator",
    user_count: 0
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border transition-all ${
            toastMessage.type === "error"
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          {toastMessage.type === "error" ? (
            <XCircle className="w-5 h-5 text-red-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          )}
          <span className="text-sm font-medium">{toastMessage.msg}</span>
        </div>
      )}

      {/* ── APP HEADER SECTION ──────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 shadow-2xs">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Hak Akses User & Modul</h1>
            <p className="text-slate-500 text-sm">
              Kelola izin modul berdasarkan <strong>Role utama</strong>, tugas tambahan/jabatan struktural, templat akses, maupun kustomisasi per user.
            </p>
          </div>
        </div>

        {/* Header Stats */}
        <div className="flex items-center gap-2 bg-slate-100/80 p-1 rounded-xl border border-slate-200 shrink-0 text-xs font-semibold">
          <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80 shadow-2xs flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <span className="text-slate-600">Total User:</span>
            <span className="font-bold text-slate-900">{userTotal}</span>
          </div>
          <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80 shadow-2xs flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-500" />
            <span className="text-slate-600">Templat:</span>
            <span className="font-bold text-indigo-600">{templates.length}</span>
          </div>
          <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200/80 shadow-2xs flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="text-slate-600">Custom User:</span>
            <span className="font-bold text-amber-600">{users.filter((u) => u.has_custom).length}</span>
          </div>
        </div>
      </div>

      {/* ── APP TAB SWITCHER ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap border-b border-slate-200 gap-1 bg-white p-1 rounded-xl border shadow-2xs">
        <button
          onClick={() => setActiveTab("role_matrix")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
            activeTab === "role_matrix"
              ? "bg-indigo-600 text-white shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Akses Modul Per Role Utama (Admin / Dosen / Mahasiswa)
        </button>

        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
            activeTab === "users"
              ? "bg-indigo-600 text-white shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <Users className="w-4 h-4" />
          Custom Per-Individual User ({userTotal})
        </button>

        <button
          onClick={() => setActiveTab("templates")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
            activeTab === "templates"
              ? "bg-indigo-600 text-white shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <Layers className="w-4 h-4" />
          Templat Hak Akses ({templates.length})
        </button>

        <button
          onClick={() => setActiveTab("positions")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
            activeTab === "positions"
              ? "bg-indigo-600 text-white shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <Briefcase className="w-4 h-4" />
          Jabatan → Akses ({activePositionMappingCount})
        </button>
      </div>

      {/* ── TAB 1: AKSES MODUL PER ROLE ──────────────────────────────────────── */}
      {activeTab === "role_matrix" && (
        <div className="space-y-5">
          {/* Role Selector Card */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-2">Pilih Role:</span>
              <button
                onClick={() => handleSelectRole("lecturer")}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  selectedRoleCode === "lecturer"
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <Briefcase className="w-4 h-4" />
                Dosen Pengampu ({rolePermissionsList.find((r) => r.role === "lecturer")?.user_count || 0})
              </button>

              <button
                onClick={() => handleSelectRole("student")}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  selectedRoleCode === "student"
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <GraduationCap className="w-4 h-4" />
                Mahasiswa ({rolePermissionsList.find((r) => r.role === "student")?.user_count || 0})
              </button>

              <button
                onClick={() => handleSelectRole("admin")}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  selectedRoleCode === "admin"
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <UserCog className="w-4 h-4" />
                Administrator ({rolePermissionsList.find((r) => r.role === "admin")?.user_count || 0})
              </button>
            </div>

            {/* Quick Bulk Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleRoleBulkSetPermissions("all")}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-xs font-semibold transition"
              >
                Buka Semua
              </button>
              <button
                type="button"
                onClick={() => handleRoleBulkSetPermissions("view_only")}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-semibold transition"
              >
                Hanya Lihat
              </button>
              <button
                type="button"
                onClick={() => handleRoleBulkSetPermissions("none")}
                className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-lg text-xs font-semibold transition"
              >
                Matikan Semua
              </button>
            </div>
          </div>

          {/* Info banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 space-y-1">
              <div className="font-bold text-sm text-slate-900">
                Mengatur Hak Akses Modul untuk Role: <span className="text-indigo-600">{selectedRoleObj.name || selectedRoleCode}</span>
              </div>
              <p>
                Setiap perubahan pada tabel checklist di bawah ini akan secara otomatis berlaku untuk seluruh <strong>{selectedRoleObj.user_count || 0} pengguna</strong> dengan role ini.
              </p>
              <p className="text-emerald-700">
                Kaprodi/Sekprodi menggunakan role utama <strong>Dosen</strong> dan memperoleh modul Prodi melalui templat jabatan pada tab <strong>Jabatan → Akses</strong>.
              </p>
            </div>
          </div>

          {/* Role Permission Matrix Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider">
                    <th className="p-4 text-sm">Modul Sistem</th>
                    {actions.map((act) => (
                      <th key={act.key} className="p-4 text-center w-28 text-sm">
                        {act.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map((cat) => {
                    const catMods = modules.filter((m) => (m.category || "Lainnya") === cat);
                    return (
                      <React.Fragment key={cat}>
                        <tr className="bg-slate-100/60 font-bold text-slate-700 text-xs uppercase tracking-wide">
                          <td colSpan={actions.length + 1} className="px-4 py-2 border-y border-slate-200/80">
                            Kategori: {cat}
                          </td>
                        </tr>
                        {catMods.map((mod) => (
                          <tr key={mod.key} className="hover:bg-slate-50/80 transition">
                            <td className="p-4">
                              <div className="font-bold text-slate-900 text-sm">{mod.name}</div>
                              <div className="text-xs text-slate-500">{mod.description}</div>
                            </td>
                            {actions.map((act) => {
                              const checked = roleMatrix[mod.key]?.[act.key] || false;
                              return (
                                <td key={act.key} className="p-4 text-center">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => handleToggleRolePermission(mod.key, act.key)}
                                    className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer transition"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Save Bar */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-500 font-medium">
                Klik simpan setelah menyesuaikan checklist hak akses di atas.
              </div>
              <button
                onClick={handleSaveRoleMatrix}
                disabled={savingRoleMatrix}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-sm shadow-2xs transition disabled:opacity-50"
              >
                {savingRoleMatrix ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan Akses Role ({selectedRoleObj.name || selectedRoleCode})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: MATRIKS AKSES USER ────────────────────────────────────────── */}
      {activeTab === "users" && (
        <div className="space-y-4">
          {pendingBulkTemplate && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
              <div className="flex items-start gap-2 text-sm text-indigo-900">
                <Layers className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                <div>
                  <div className="font-bold">Siap menerapkan: {pendingBulkTemplate.name}</div>
                  <div className="text-xs text-indigo-700">Pilih pengguna di bawah, lalu klik tombol Terapkan Templat.</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBulkTemplate("")}
                className="self-start sm:self-auto text-xs font-semibold text-indigo-700 hover:text-indigo-900"
              >
                Batalkan
              </button>
            </div>
          )}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama, email, NIM, NIDN..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="all">Semua Role User</option>
                <option value="admin">Administrator</option>
                <option value="lecturer">Dosen</option>
                <option value="student">Mahasiswa</option>
              </select>
            </div>

            {selectedUserIds.length > 0 && (
              <button
                onClick={() => setShowBulkModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-2xs transition"
              >
                <Sliders className="w-4 h-4" />
                {pendingBulkTemplate ? `Terapkan ${pendingBulkTemplate.name}` : "Terapkan Templat"} ({selectedUserIds.length} User)
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600 mb-2" />
                <span>Memuat daftar hak akses user...</span>
              </div>
            ) : users.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <Info className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                <span>Tidak ada data pengguna yang ditemukan.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                      <th className="p-4 w-10">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.length === users.length && users.length > 0}
                          onChange={handleSelectAllUsers}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </th>
                      <th className="p-4">Pengguna</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Status & Templat Hak Akses</th>
                      <th className="p-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((u) => {
                      const isSelected = selectedUserIds.includes(u.id);
                      return (
                        <tr key={u.id} className={`hover:bg-slate-50/80 transition ${isSelected ? "bg-indigo-50/40" : ""}`}>
                          <td className="p-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSelectUser(u.id)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-sm shrink-0">
                                {(u.name || "U")[0].toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900">{u.name}</div>
                                <div className="text-xs text-slate-500">
                                  {u.email} {u.nim ? `• NIM: ${u.nim}` : u.nidn ? `• NIDN: ${u.nidn}` : ""}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                u.role === "admin"
                                  ? "bg-purple-100 text-purple-800 border border-purple-200"
                                  : u.role === "lecturer"
                                  ? "bg-blue-100 text-blue-800 border border-blue-200"
                                  : "bg-slate-100 text-slate-700 border border-slate-200"
                              }`}
                            >
                              {u.role === "admin" ? "Administrator" : u.role === "lecturer" ? "Dosen" : "Mahasiswa"}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="space-y-1.5">
                              {u.has_custom ? (
                                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Custom Override ({u.template_name})</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>Templat: {u.template_name}</span>
                                </div>
                              )}
                              {(u.position_accesses || []).map((access) => (
                                <div key={`${access.jabatan_nama}-${access.template_id}-${access.prodi_id || "inst"}`} className="flex items-center gap-1.5 text-xs text-emerald-800">
                                  <Briefcase className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                                  <span>
                                    Jabatan: <strong>{access.jabatan_nama}</strong> → {access.template_name}
                                    {access.prodi_id ? " (scope prodi)" : ""}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => handleOpenUserDetail(u)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium text-xs transition"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                              Atur Akses
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: TEMPLAT HAK AKSES ───────────────────────────────────────── */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Daftar Templat Role & Modul</h2>
            <button
              onClick={() => handleOpenTemplateModal()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-2xs transition"
            >
              <Plus className="w-4 h-4" />
              Buat Templat Baru
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="bg-white rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs transition p-5 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold shrink-0">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-base leading-tight">{tpl.name}</h3>
                        <span className="text-xs text-slate-500 font-medium">
                          {templateTargetLabel(tpl)}
                        </span>
                      </div>
                    </div>
                    {tpl.is_default && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                        Default
                      </span>
                    )}
                  </div>

                  <p className="text-slate-600 text-xs line-clamp-2">{tpl.description || "Tidak ada deskripsi."}</p>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                    <span>Digunakan oleh:</span>
                    <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                      {tpl.user_count || 0} Pengguna
                    </span>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleStartTemplateApplication(tpl)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold transition"
                  >
                    <Users className="w-3.5 h-3.5" /> Terapkan
                  </button>
                  <button
                    onClick={() => handleOpenTemplateModal(tpl)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-500" /> Edit
                  </button>
                  {!tpl.is_default && (
                    <button
                      onClick={() => handleDeleteTemplate(tpl)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" /> Hapus
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 4: PEMETAAN JABATAN KE AKSES ───────────────────────────────── */}
      {activeTab === "positions" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 flex items-start gap-3">
            <Briefcase className="w-5 h-5 shrink-0 text-indigo-600 mt-0.5" />
            <div className="text-sm text-indigo-950 space-y-1">
              <div className="font-bold">Akses otomatis dari penugasan jabatan</div>
              <p className="text-xs text-indigo-800">
                Role utama akun tetap Dosen, Admin, atau Mahasiswa. Hanya tugas tambahan/struktural yang aktif di halaman Jabatan Akademik yang menambahkan akses dan scope prodi. Jenjang fungsional seperti Asisten Ahli atau Lektor tidak membuka privilese sistem.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            {positionMappings.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <Loader2 className="w-7 h-7 animate-spin mx-auto text-indigo-600 mb-2" />
                <span>Memuat pemetaan jabatan...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                      <th className="p-4">Jabatan Struktural</th>
                      <th className="p-4">Cakupan</th>
                      <th className="p-4 min-w-72">Templat yang Ditambahkan Otomatis</th>
                      <th className="p-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {positionMappings.map((mapping) => (
                      <tr key={mapping.jabatan_id} className="hover:bg-slate-50/80 transition">
                        <td className="p-4">
                          <div className="font-semibold text-slate-900">{mapping.jabatan_nama}</div>
                          <div className="text-xs font-mono text-slate-500">{mapping.jabatan_kode || "-"}</div>
                        </td>
                        <td className="p-4 text-xs text-slate-600">
                          {mapping.scope === "prodi" ? "Per program studi" : "Tingkat institusi"}
                        </td>
                        <td className="p-4">
                          <select
                            value={mapping.enabled ? mapping.template_id || "" : ""}
                            disabled={savingPositionMappingId === mapping.jabatan_id}
                            onChange={(event) => handleSavePositionMapping(mapping, event.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:opacity-60"
                          >
                            <option value="">Tidak menambahkan akses</option>
                            {templates.map((template) => (
                              <option key={template.id} value={template.id}>
                                {template.name} ({templateTargetLabel(template)})
                              </option>
                            ))}
                          </select>
                          {mapping.access_role && (
                            <div className="mt-1 text-[11px] text-slate-500">Role turunan: {mapping.access_role}</div>
                          )}
                        </td>
                        <td className="p-4">
                          {savingPositionMappingId === mapping.jabatan_id ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Menyimpan</span>
                          ) : mapping.enabled && mapping.template_id ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"><Check className="w-3.5 h-3.5" /> Aktif</span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200"><X className="w-3.5 h-3.5" /> Tidak dipetakan</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT USER PERMISSIONS ────────────────────────────────────── */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-indigo-300 font-bold">
                  {(editingUser.name || "U")[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">{editingUser.name}</h3>
                  <div className="text-xs text-slate-300">
                    Role: <span className="font-semibold capitalize">{editingUser.role}</span> • {editingUser.email}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {detailLoading ? (
                <div className="py-12 text-center text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600 mb-2" />
                  <span>Memuat detail hak akses user...</span>
                </div>
              ) : userAccessDetail ? (
                <>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                    <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-indigo-600" /> Mode Pengaturan Hak Akses
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label
                        className={`p-3 rounded-xl border-2 flex items-start gap-3 cursor-pointer transition ${
                          userAccessDetail.access_mode === "template"
                            ? "border-indigo-600 bg-indigo-50/50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="access_mode"
                          checked={userAccessDetail.access_mode === "template"}
                          onChange={() =>
                            setUserAccessDetail((prev) => ({
                              ...prev,
                              access_mode: "template",
                            }))
                          }
                          className="mt-1 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <div className="font-bold text-sm text-slate-900">Gunakan Akses Role Standard</div>
                          <div className="text-xs text-slate-500">
                            Mengikuti batasan izin dari Role / Templat yang dipilih.
                          </div>
                        </div>
                      </label>

                      <label
                        className={`p-3 rounded-xl border-2 flex items-start gap-3 cursor-pointer transition ${
                          userAccessDetail.access_mode === "custom"
                            ? "border-amber-500 bg-amber-50/50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="access_mode"
                          checked={userAccessDetail.access_mode === "custom"}
                          onChange={() =>
                            setUserAccessDetail((prev) => ({
                              ...prev,
                              access_mode: "custom",
                            }))
                          }
                          className="mt-1 text-amber-600 focus:ring-amber-500"
                        />
                        <div>
                          <div className="font-bold text-sm text-slate-900">Kustomisasi Akses (Custom)</div>
                          <div className="text-xs text-slate-500">
                            Mengatur izin spesifik per modul untuk user ini, tanpa mencabut akses dari jabatan aktif.
                          </div>
                        </div>
                      </label>
                    </div>

                    {userAccessDetail.access_mode === "template" && (
                      <div className="pt-2 border-t border-slate-200">
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Pilih Templat Akses:
                        </label>
                        <select
                          value={userAccessDetail.template_id || ""}
                          onChange={(e) =>
                            setUserAccessDetail((prev) => ({
                              ...prev,
                              template_id: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        >
                          {templates.filter((t) => t.role_target === "all" || t.role_target === userAccessDetail.user.role).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({templateTargetLabel(t)})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {(userAccessDetail.position_accesses || []).length > 0 && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-emerald-700" /> Akses otomatis dari jabatan aktif
                      </div>
                      <div className="mt-2 space-y-1.5 text-xs text-emerald-900">
                        {userAccessDetail.position_accesses.map((access) => (
                          <div key={`${access.assignment_id}-${access.template_id}`}>
                            <strong>{access.jabatan_nama}</strong> → {access.template_name}
                            {access.prodi_nama ? ` · scope ${access.prodi_nama}` : " · scope institusi"}
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-emerald-800">Ubah penugasan di Jabatan Akademik atau pemetaannya pada tab Jabatan → Akses. Akses ini tidak dapat dicabut dari form per-user.</p>
                    </div>
                  )}

                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider">
                          <th className="p-3">Modul Sistem</th>
                          {actions.map((act) => (
                            <th key={act.key} className="p-3 text-center w-24">
                              {act.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {categories.map((cat) => {
                          const catMods = modules.filter((m) => (m.category || "Lainnya") === cat);
                          return (
                            <React.Fragment key={cat}>
                              <tr className="bg-slate-50/80 font-bold text-slate-700 text-[11px] uppercase tracking-wide">
                                <td colSpan={actions.length + 1} className="px-3 py-1.5 bg-slate-100/60">
                                  Kategori: {cat}
                                </td>
                              </tr>
                              {catMods.map((mod) => {
                                const isCustom = userAccessDetail.access_mode === "custom";
                                const activeMatrix = isCustom
                                  ? userAccessDetail.custom_permissions
                                  : userAccessDetail.effective_permissions;

                                return (
                                  <tr key={mod.key} className="hover:bg-slate-50 transition">
                                    <td className="p-3">
                                      <div className="font-semibold text-slate-900">{mod.name}</div>
                                      <div className="text-[10px] text-slate-500">{mod.description}</div>
                                    </td>
                                    {actions.map((act) => {
                                      const checked = activeMatrix[mod.key]?.[act.key] || false;
                                      return (
                                        <td key={act.key} className="p-3 text-center">
                                          <input
                                            type="checkbox"
                                            disabled={!isCustom}
                                            checked={checked}
                                            onChange={() => handleToggleUserPermission(mod.key, act.key)}
                                            className={`w-4.5 h-4.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 ${
                                              isCustom ? "cursor-pointer" : "opacity-60 cursor-not-allowed"
                                            }`}
                                          />
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm font-semibold transition"
              >
                Batal
              </button>
              <button
                onClick={handleSaveUserPermissions}
                disabled={savingUserPerm}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-2xs transition disabled:opacity-50"
              >
                {savingUserPerm ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: TEMPLATE EDITOR ──────────────────────────────────────────── */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-indigo-300 font-bold">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">
                    {editingTemplate === "new" ? "Buat Templat Hak Akses Baru" : `Edit Templat: ${templateForm.name}`}
                  </h3>
                  <div className="text-xs text-slate-300">
                    Konfigurasi hak akses standar yang dapat diterapkan ke banyak user sekaligus.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setEditingTemplate(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Nama Templat <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    placeholder="Contoh: Operator Keuangan, Kaprodi, Dosen MK"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Target Role Pengguna</label>
                  <select
                    value={templateForm.role_target}
                    onChange={(e) => setTemplateForm({ ...templateForm, role_target: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="all">Semua Role</option>
                    <option value="admin">Administrator</option>
                    <option value="lecturer">Dosen</option>
                    <option value="student">Mahasiswa</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-slate-700 block mb-1">Deskripsi Templat</label>
                  <input
                    type="text"
                    value={templateForm.description}
                    onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                    placeholder="Keterangan singkat fungsi dan cakupan akses templat ini"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
              <button
                onClick={() => setEditingTemplate(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm font-semibold transition"
              >
                Batal
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={savingTemplate}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-2xs transition disabled:opacity-50"
              >
                {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan Templat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: BULK ASSIGN TEMPLATE ──────────────────────────────────────── */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Terapkan Templat Hak Akses</h3>
              <button
                onClick={() => setShowBulkModal(false)}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Anda memilih <strong className="text-indigo-600">{selectedUserIds.length} pengguna</strong>. Pilih templat yang akan diterapkan secara bersamaan:
            </p>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Pilih Templat Hak Akses:</label>
              <select
                value={selectedBulkTemplate}
                onChange={(e) => setSelectedBulkTemplate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">-- Pilih Templat Akses --</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({templateTargetLabel(t)})
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowBulkModal(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition"
              >
                Batal
              </button>
              <button
                onClick={handleBulkAssign}
                disabled={savingBulk || !selectedBulkTemplate}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-2xs transition disabled:opacity-50"
              >
                {savingBulk ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Terapkan Massal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
