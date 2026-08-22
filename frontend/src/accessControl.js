const ADMIN_ONLY = "__admin_only__";

const ALWAYS_AVAILABLE_PAGES = new Set(["profile", "guide"]);

// Halaman ini merupakan administrasi institusi/operator, bukan privilese
// struktural Kaprodi. Penolakan eksplisit mencegah templat lama yang masih
// menyimpan izin gabungan menampilkan kembali menu di luar scope Kaprodi.
const KAPRODI_RESTRICTED_PAGES = new Set([
  "master_fakultas",
  "master_prodi",
  "sk_mengajar",
  "sk_jabatan",
  "master_jabatan_akademik",
  "enroll_wizard",
  "master_assign_prodi",
]);

// Tendik tidak menjalankan aktivitas mengajar. Walaupun templat lama atau
// penugasan tambahan masih membawa izin ``rekap_nilai``, halaman laporan
// pengajaran tetap tidak boleh muncul untuk role dasar Tendik.
const STAFF_RESTRICTED_PAGES = new Set([
  "rekap",
  "predicates",
  "reports",
  "lecturer_reports",
]);

// Perwalian KRS adalah alur Dosen PA. Operator akademik dapat mengelola data
// KRS/KHS lain melalui API/modul terkait, tetapi tidak membutuhkan antrean ACC
// perwalian di sidebar.
const ACADEMIC_OPERATOR_RESTRICTED_PAGES = new Set(["perwalian"]);

export const ADMIN_PAGE_MODULES = Object.freeze({
  dashboard: "dashboard",
  materials: "materials",
  assignments: "assignments",
  rps: "rps",
  attendance: "attendance",
  grading: "grading",
  weights: "grading",
  rekap: "rekap_nilai",
  predicates: "rekap_nilai",
  reports: "rekap_nilai",
  lecturer_reports: "rekap_nilai",
  calendar: "academic_calendar",
  perwalian: ["krs_khs", "academic_advising"],
  keuangan_admin: "keuangan",
  pmb: "pmb",
  master_config: ADMIN_ONLY,
  wizard_semester: ADMIN_ONLY,
  master_tahun_ajaran: ADMIN_ONLY,
  master_fakultas: ADMIN_ONLY,
  master_prodi: "academic_structure",
  master_gedung: ADMIN_ONLY,
  master_ruangan: ADMIN_ONLY,
  master_kurikulum: "curriculum_schedule",
  progress_kurikulum: "curriculum_schedule",
  master_pembuatan_kelas: "curriculum_schedule",
  master_jadwal_mengajar: "curriculum_schedule",
  progres_nilai_prodi: "progres_nilai_prodi",
  analisis_mahasiswa_prodi: "analisis_mahasiswa_prodi",
  analisis_rps_prodi: "analisis_rps_prodi",
  sk_mengajar: "sk_mengajar",
  sk_jabatan: "sk_jabatan",
  students: "student_records",
  lecturers: "lecturer_records",
  master_jabatan_akademik: "lecturer_records",
  staff: ADMIN_ONLY,
  enroll_wizard: ADMIN_ONLY,
  master_assign_prodi: ADMIN_ONLY,
  master_dosen_wali: "academic_advising",
  settings: "campus_settings",
  user_access: "access_control",
  sso: "sso",
  integrasi: "integration_api",
  feeder: "feeder",
  drive: "cloud_storage",
  whatsapp: "whatsapp",
  email: "email",
  migration_old_siap: "old_siakad_migration",
  backups: "database_backup",
  clean: "data_maintenance",
});

export const STUDENT_PAGE_MODULES = Object.freeze({
  home: "dashboard",
  calendar: "academic_calendar",
  krs: "krs_khs",
  khs: "krs_khs",
  keuangan: "keuangan",
  courses: "materials",
  assignments: "assignments",
  rps: "rps",
  attendance: "attendance",
  grades: "grading",
});

export function normalizeUserRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "administrator") return "admin";
  if (normalized === "dosen") return "lecturer";
  if (normalized === "mahasiswa") return "student";
  if (["tendik", "staf", "pegawai"].includes(normalized)) return "staff";
  return normalized;
}

export function userHasModuleAction(user, moduleKey, action = "view") {
  if (normalizeUserRole(user?.role) === "admin") return true;
  return Boolean(user?.effective_permissions?.[moduleKey]?.[action]);
}

function canAccessMappedPage(user, page, pageModules) {
  if (ALWAYS_AVAILABLE_PAGES.has(page)) return true;
  const required = pageModules[page];
  if (!required) return false;
  if (required === ADMIN_ONLY) return normalizeUserRole(user?.role) === "admin";
  const modules = Array.isArray(required) ? required : [required];
  return modules.some((moduleKey) => userHasModuleAction(user, moduleKey));
}

export function canAccessAdminPage(user, page) {
  if (isKaprodiUser(user) && KAPRODI_RESTRICTED_PAGES.has(page)) return false;
  if (normalizeUserRole(user?.role) === "staff" && STAFF_RESTRICTED_PAGES.has(page)) return false;
  if (isAcademicOperatorUser(user) && ACADEMIC_OPERATOR_RESTRICTED_PAGES.has(page)) return false;
  return canAccessMappedPage(user, page, ADMIN_PAGE_MODULES);
}

export function canAccessStudentPage(user, page) {
  return canAccessMappedPage(user, page, STUDENT_PAGE_MODULES);
}

export function isKaprodiUser(user) {
  const synchronizedRoles = user?.access_roles;
  if (Array.isArray(synchronizedRoles)) {
    const normalizedRoles = synchronizedRoles.map((role) => String(role || "").toLowerCase());
    return normalizedRoles.includes("kaprodi") || normalizedRoles.includes("sekprodi");
  }
  const legacyPosition = String(
    user?.jabatan_akademik || user?.tugas_tambahan || user?.jabatan || "",
  ).toLowerCase();
  return Boolean(
    user?.is_kaprodi ||
      user?.kaprodi_prodi_id ||
      legacyPosition.includes("kaprodi") ||
      legacyPosition.includes("ketua prodi") ||
      legacyPosition.includes("ketua program studi")
  );
}

export function isAcademicOperatorUser(user) {
  const synchronizedRoles = user?.access_roles;
  if (Array.isArray(synchronizedRoles)) {
    return synchronizedRoles
      .map((role) => String(role || "").trim().toLowerCase())
      .includes("academic_operator");
  }
  const legacyPosition = String(
    user?.jabatan_akademik || user?.tugas_tambahan || user?.jabatan || "",
  ).toLowerCase();
  return legacyPosition.includes("akademik") || legacyPosition.includes("baak");
}
