import {
  canAccessAdminPage,
  canAccessStudentPage,
  isAcademicOperatorUser,
  isKaprodiUser,
  userHasModuleAction,
} from "./accessControl";

const permissions = (...moduleKeys) => Object.fromEntries(
  moduleKeys.map((moduleKey) => [moduleKey, { view: true }]),
);

test("administrator tetap dapat membuka seluruh halaman", () => {
  const admin = { role: "admin", effective_permissions: {} };

  expect(canAccessAdminPage(admin, "dashboard")).toBe(true);
  expect(canAccessAdminPage(admin, "user_access")).toBe(true);
  expect(canAccessAdminPage(admin, "clean")).toBe(true);
  expect(canAccessAdminPage(admin, "staff")).toBe(true);
});

test("dosen biasa hanya melihat modul yang diberikan matriks efektif", () => {
  const lecturer = {
    role: "lecturer",
    access_roles: [],
    jabatan_akademik: "Ketua Program Studi (Kaprodi)",
    effective_permissions: permissions("dashboard", "materials", "assignments"),
  };

  expect(isKaprodiUser(lecturer)).toBe(false);
  expect(canAccessAdminPage(lecturer, "materials")).toBe(true);
  expect(canAccessAdminPage(lecturer, "master_kurikulum")).toBe(false);
  expect(canAccessAdminPage(lecturer, "progres_nilai_prodi")).toBe(false);
  expect(canAccessAdminPage(lecturer, "settings")).toBe(false);
});

test("jabatan Kaprodi memberi identitas dan scope, bukan akses menu implisit", () => {
  const kaprodi = {
    role: "lecturer",
    access_roles: ["kaprodi"],
    effective_permissions: permissions(
      "dashboard",
      "curriculum_schedule",
      "progres_nilai_prodi",
      "analisis_rps_prodi",
      "academic_structure",
      "sk_mengajar",
      "sk_jabatan",
      "lecturer_records",
      "academic_advising",
    ),
  };

  expect(isKaprodiUser(kaprodi)).toBe(true);
  expect(canAccessAdminPage(kaprodi, "master_kurikulum")).toBe(true);
  expect(canAccessAdminPage(kaprodi, "progres_nilai_prodi")).toBe(true);
  expect(canAccessAdminPage(kaprodi, "master_fakultas")).toBe(false);
  expect(canAccessAdminPage(kaprodi, "master_prodi")).toBe(false);
  expect(canAccessAdminPage(kaprodi, "sk_mengajar")).toBe(false);
  expect(canAccessAdminPage(kaprodi, "sk_jabatan")).toBe(false);
  expect(canAccessAdminPage(kaprodi, "master_jabatan_akademik")).toBe(false);
  expect(canAccessAdminPage(kaprodi, "enroll_wizard")).toBe(false);
  expect(canAccessAdminPage(kaprodi, "master_assign_prodi")).toBe(false);
  expect(canAccessAdminPage(kaprodi, "lecturers")).toBe(true);
  expect(canAccessAdminPage(kaprodi, "master_dosen_wali")).toBe(true);
  expect(canAccessAdminPage(kaprodi, "keuangan_admin")).toBe(false);
  expect(canAccessAdminPage(kaprodi, "user_access")).toBe(false);
  expect(canAccessAdminPage(kaprodi, "feeder")).toBe(false);
});

test("menu Tendik dan Mahasiswa sama-sama mengikuti izin view", () => {
  const staff = {
    role: "staff",
    effective_permissions: permissions("dashboard", "keuangan", "rekap_nilai"),
  };
  const student = {
    role: "student",
    effective_permissions: permissions("dashboard", "krs_khs", "assignments", "rps"),
  };

  expect(canAccessAdminPage(staff, "keuangan_admin")).toBe(true);
  expect(canAccessAdminPage(staff, "master_config")).toBe(false);
  expect(canAccessAdminPage(staff, "rekap")).toBe(false);
  expect(canAccessAdminPage(staff, "predicates")).toBe(false);
  expect(canAccessAdminPage(staff, "reports")).toBe(false);
  expect(canAccessAdminPage(staff, "lecturer_reports")).toBe(false);
  expect(canAccessStudentPage(student, "krs")).toBe(true);
  expect(canAccessStudentPage(student, "khs")).toBe(true);
  expect(canAccessStudentPage(student, "assignments")).toBe(true);
  expect(canAccessStudentPage(student, "rps")).toBe(true);
  expect(canAccessStudentPage(student, "keuangan")).toBe(false);
  expect(userHasModuleAction(student, "assignments", "edit")).toBe(false);
});

test("operator akademik mendapat modul mutu tetapi tidak menu Perwalian KRS", () => {
  const academicOperator = {
    role: "staff",
    access_roles: ["academic_operator"],
    effective_permissions: permissions(
      "dashboard",
      "academic_calendar",
      "academic_setup",
      "academic_structure",
      "facilities",
      "krs_khs",
      "academic_advising",
      "rekap_nilai",
      "progres_nilai_prodi",
      "analisis_mahasiswa_prodi",
      "analisis_rps_prodi",
      "student_records",
    ),
  };

  expect(isAcademicOperatorUser(academicOperator)).toBe(true);
  expect(canAccessAdminPage(academicOperator, "calendar")).toBe(true);
  expect(canAccessAdminPage(academicOperator, "progres_nilai_prodi")).toBe(true);
  expect(canAccessAdminPage(academicOperator, "analisis_mahasiswa_prodi")).toBe(true);
  expect(canAccessAdminPage(academicOperator, "analisis_rps_prodi")).toBe(true);
  expect(canAccessAdminPage(academicOperator, "students")).toBe(true);
  expect(canAccessAdminPage(academicOperator, "perwalian")).toBe(false);
  expect(canAccessAdminPage(academicOperator, "master_config")).toBe(false);
  expect(canAccessAdminPage(academicOperator, "wizard_semester")).toBe(false);
  expect(canAccessAdminPage(academicOperator, "master_tahun_ajaran")).toBe(false);
  expect(canAccessAdminPage(academicOperator, "master_fakultas")).toBe(false);
  expect(canAccessAdminPage(academicOperator, "master_gedung")).toBe(false);
  expect(canAccessAdminPage(academicOperator, "master_ruangan")).toBe(false);
  expect(canAccessAdminPage(academicOperator, "staff")).toBe(false);
  expect(canAccessAdminPage(academicOperator, "enroll_wizard")).toBe(false);
  expect(canAccessAdminPage(academicOperator, "master_assign_prodi")).toBe(false);
  expect(canAccessAdminPage(academicOperator, "master_prodi")).toBe(true);
  expect(canAccessAdminPage(academicOperator, "master_dosen_wali")).toBe(true);
});
