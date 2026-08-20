import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock3,
  GraduationCap,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";

function resolveBackendUrl() {
  const configuredUrl = String(process.env.REACT_APP_BACKEND_URL || "").trim().replace(/\/+$/, "");
  if (configuredUrl) return configuredUrl;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.port === "3000"
      ? `${window.location.protocol}//${window.location.hostname}:8000`
      : window.location.origin;
  }
  return "";
}

const BACKEND_URL = resolveBackendUrl();

function tokenFromProps(propToken) {
  if (propToken) return propToken;
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem("token") || localStorage.getItem("elearn_token") || localStorage.getItem("auth_token") || "";
  }
  return "";
}

const riskStyles = {
  "Risiko Tinggi": "border-rose-200 bg-rose-50 text-rose-700",
  "Perlu Perhatian": "border-amber-200 bg-amber-50 text-amber-700",
  "Risiko Rendah": "border-sky-200 bg-sky-50 text-sky-700",
  Aman: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function riskClass(label) {
  return riskStyles[label] || "border-slate-200 bg-slate-50 text-slate-600";
}

function displayPercent(value) {
  return value === null || value === undefined ? "—" : `${value}%`;
}

function displayDate(value) {
  if (!value) return "Belum pernah login";
  try {
    return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function MetricCard({ icon: Icon, label, value, helper, tone = "indigo" }) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600",
    sky: "bg-sky-50 text-sky-600",
  };
  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
          {helper && <p className="mt-0.5 text-[11px] text-slate-500">{helper}</p>}
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.indigo}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalisisMahasiswaProdiPage({ user, token, selectedSemester, programs = [] }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedProdi, setSelectedProdi] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (selectedSemester && selectedSemester !== "all") params.set("semester_id", selectedSemester);
      if (selectedProdi) params.set("prodi_id", selectedProdi);
      const response = await fetch(`${BACKEND_URL}/api/prodi/analisis-mahasiswa${params.toString() ? `?${params}` : ""}`, {
        headers: {
          "Content-Type": "application/json",
          ...(tokenFromProps(token) ? { Authorization: `Bearer ${tokenFromProps(token)}` } : {}),
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `Gagal memuat analisis (HTTP ${response.status})`);
      setData(payload);
    } catch (fetchError) {
      setError(fetchError.message || "Terjadi kesalahan saat memuat analisis mahasiswa");
    } finally {
      setLoading(false);
    }
  }, [selectedProdi, selectedSemester, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (data?.students || []).filter((student) => {
      const matchesSearch = !keyword
        || String(student.name || "").toLowerCase().includes(keyword)
        || String(student.nim || "").toLowerCase().includes(keyword)
        || (student.classes || []).some((item) => String(item.course_name || "").toLowerCase().includes(keyword));
      const matchesRisk = riskFilter === "all" || student.risk?.label === riskFilter;
      return matchesSearch && matchesRisk;
    });
  }, [data?.students, riskFilter, search]);

  const priorityStudents = useMemo(
    () => (data?.students || []).filter((student) => ["Risiko Tinggi", "Perlu Perhatian"].includes(student.risk?.label)).slice(0, 6),
    [data?.students],
  );

  const summary = data?.summary || {};
  const riskDistribution = data?.risk_distribution || {};
  const attendanceBuckets = data?.attendance_buckets || {};
  const canSelectProdi = user?.role === "admin"
    || (user?.access_roles || []).includes("academic_operator")
    || Boolean(data?.scope?.can_select_prodi);
  const programOptions = useMemo(() => {
    const source = Array.isArray(programs) && programs.length ? programs : (data?.prodi_list || []);
    return source.filter((item) => item?.id || item?.code || item?.kode);
  }, [data?.prodi_list, programs]);

  return (
    <div className="space-y-6 pb-12" data-testid="analisis-mahasiswa-prodi-page">
      <section className="relative overflow-hidden rounded-2xl border border-indigo-900/50 bg-gradient-to-r from-slate-950 via-indigo-950 to-blue-900 p-6 text-white shadow-xl md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-blue-400/10 blur-3xl" />
        <div className="relative z-10 flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-100">
                <GraduationCap className="h-3.5 w-3.5" />
                Analisis Akademik Prodi
              </span>
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-200">
                Periode: {data?.period?.label || "Memuat..."}
              </span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Analisis Mahasiswa Prodi</h1>
            <p className="mt-2 max-w-2xl text-sm text-indigo-100/85">
              Pantau kehadiran, capaian nilai, progres tugas, aktivitas, dan risiko akademik mahasiswa pada {data?.scope?.prodi_name || user?.prodi_nama || user?.prodi_name || "Program Studi"}.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 self-start md:w-auto md:self-center">
            {canSelectProdi && (
              <select
                value={selectedProdi}
                onChange={(event) => {
                  setSelectedProdi(event.target.value);
                  setSelectedStudent(null);
                }}
                className="h-10 min-w-64 rounded-md border border-white/25 bg-slate-900/80 px-3 text-sm font-semibold text-white"
                data-testid="analisis-mahasiswa-prodi-selector"
              >
                <option value="">Semua Program Studi</option>
                {programOptions.map((program) => {
                  const id = program.id || program.code || program.kode;
                  return <option key={id} value={id}>{program.name || program.nama || program.code || program.kode}</option>;
                })}
              </select>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={fetchData}
              className="border-0 bg-indigo-600 text-white shadow-md hover:bg-indigo-500"
              data-testid="analisis-mahasiswa-refresh-button"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh Analisis
            </Button>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700" data-testid="analisis-mahasiswa-error">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Gagal memuat analisis mahasiswa</p>
            <p className="mt-1 text-sm">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={fetchData} className="mt-3 border-rose-300 bg-white text-rose-700">Coba Lagi</Button>
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center shadow-sm">
          <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-indigo-600" />
          <p className="font-semibold text-slate-700">Menganalisis seluruh mahasiswa prodi...</p>
          <p className="mt-1 text-xs text-slate-500">Menggabungkan data kehadiran, nilai, tugas, dan aktivitas.</p>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard icon={Users} label="Total Mahasiswa" value={summary.total_students ?? 0} helper={`${summary.active_students ?? 0} mahasiswa aktif`} />
            <MetricCard icon={CheckCircle2} label="Rata-rata Kehadiran" value={displayPercent(summary.average_attendance)} helper="Dari sesi yang tersedia" tone="emerald" />
            <MetricCard icon={BarChart3} label="Rata-rata Nilai" value={summary.average_grade ?? 0} helper="Nilai tugas/komponen" tone="sky" />
            <MetricCard icon={ShieldAlert} label="Risiko Tinggi" value={summary.high_risk ?? 0} helper={`${summary.needs_attention ?? 0} perlu perhatian`} tone="rose" />
            <MetricCard icon={Clock3} label="Rata-rata Pengumpulan" value={displayPercent(summary.average_submission_rate)} helper={`${summary.no_login_activity ?? 0} belum login`} tone="amber" />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Card className="border-slate-200/80 shadow-sm xl:col-span-2">
              <CardHeader className="border-b border-slate-100 pb-4">
                <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-5 w-5 text-rose-500" />Distribusi Risiko Akademik</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 p-5 sm:grid-cols-4">
                {Object.entries({ "Risiko Tinggi": riskDistribution["Risiko Tinggi"] || 0, "Perlu Perhatian": riskDistribution["Perlu Perhatian"] || 0, "Risiko Rendah": riskDistribution["Risiko Rendah"] || 0, Aman: riskDistribution.Aman || 0 }).map(([label, count]) => {
                  const percent = summary.total_students ? Math.round((count / summary.total_students) * 100) : 0;
                  return (
                    <button type="button" key={label} onClick={() => setRiskFilter(label)} className={`rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${riskClass(label)} ${riskFilter === label ? "ring-2 ring-indigo-400 ring-offset-1" : ""}`}>
                      <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold">{label}</span><span className="text-xl font-extrabold">{count}</span></div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70"><div className="h-full rounded-full bg-current opacity-70" style={{ width: `${percent}%` }} /></div>
                      <p className="mt-1 text-[11px] opacity-80">{percent}% dari mahasiswa</p>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-4"><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-5 w-5 text-emerald-500" />Sebaran Kehadiran</CardTitle></CardHeader>
              <CardContent className="space-y-3 p-5">
                {Object.entries(attendanceBuckets).map(([label, count]) => {
                  const percent = summary.total_students ? Math.round((count / summary.total_students) * 100) : 0;
                  return <div key={label}><div className="mb-1 flex justify-between text-xs font-semibold text-slate-600"><span>{label}</span><span>{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} /></div></div>;
                })}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Card className="border-slate-200/80 shadow-sm xl:col-span-2">
              <CardHeader className="border-b border-slate-100 pb-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <CardTitle className="flex items-center gap-2 text-base"><Users className="h-5 w-5 text-indigo-600" />Daftar Analisis Mahasiswa <span className="text-xs font-normal text-slate-500">({filteredStudents.length})</span></CardTitle>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, NIM, mata kuliah..." className="h-9 w-full pl-9 text-xs sm:w-64" /></div>
                    <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700">
                      <option value="all">Semua risiko</option><option>Risiko Tinggi</option><option>Perlu Perhatian</option><option>Risiko Rendah</option><option>Aman</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[620px] overflow-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Mahasiswa</th><th className="px-3 py-3 text-center">Kehadiran</th><th className="px-3 py-3 text-center">Nilai</th><th className="px-3 py-3 text-center">Tugas</th><th className="px-3 py-3 text-center">Risiko</th><th className="px-4 py-3 text-right">Aksi</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredStudents.map((student) => <tr key={student.id} className="hover:bg-slate-50/80" data-testid={`analisis-mahasiswa-row-${student.id}`}>
                        <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700">{String(student.name || "M").charAt(0).toUpperCase()}</div><div className="min-w-0"><p className="truncate font-bold text-slate-900">{student.name}</p><p className="text-[11px] text-slate-500">{student.nim} · {student.class_count} kelas</p></div></div></td>
                        <td className="px-3 py-3 text-center"><strong className={student.attendance?.percentage !== null && student.attendance?.percentage < 75 ? "text-rose-600" : "text-emerald-600"}>{displayPercent(student.attendance?.percentage)}</strong><p className="text-[10px] text-slate-400">{student.attendance?.hadir || 0}/{student.attendance?.total_open || 0} hadir</p></td>
                        <td className="px-3 py-3 text-center"><strong className={student.grades?.average > 0 && student.grades.average < 60 ? "text-rose-600" : "text-slate-800"}>{student.grades?.average || 0}</strong><p className="text-[10px] text-slate-400">{student.grades?.graded_count || 0} nilai</p></td>
                        <td className="px-3 py-3 text-center"><strong className="text-slate-800">{displayPercent(student.learning?.submission_rate)}</strong><p className="text-[10px] text-slate-400">{student.learning?.missing || 0} belum</p></td>
                        <td className="px-3 py-3 text-center"><Badge className={`whitespace-nowrap border ${riskClass(student.risk?.label)}`}>{student.risk?.label}</Badge><p className="mt-1 text-[10px] text-slate-400">Skor {student.risk?.score || 0}</p></td>
                        <td className="px-4 py-3 text-right"><Button type="button" variant="outline" size="sm" onClick={() => setSelectedStudent(student)} className="h-8 text-xs">Detail</Button></td>
                      </tr>)}
                    </tbody>
                  </table>
                  {!filteredStudents.length && <div className="p-10 text-center text-sm text-slate-500">Tidak ada mahasiswa yang cocok dengan filter.</div>}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-4"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-5 w-5 text-amber-500" />Prioritas Tindak Lanjut</CardTitle></CardHeader>
              <CardContent className="space-y-3 p-4">
                {priorityStudents.length ? priorityStudents.map((student) => <button type="button" key={student.id} onClick={() => setSelectedStudent(student)} className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{student.name}</p><p className="text-[11px] text-slate-500">{student.nim}</p></div><Badge className={`border text-[10px] ${riskClass(student.risk?.label)}`}>{student.risk?.score}</Badge></div><p className="mt-2 line-clamp-2 text-[11px] text-slate-600">{student.risk?.reasons?.join(" · ") || "Perlu ditinjau"}</p></button>) : <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">Tidak ada mahasiswa yang masuk prioritas tindak lanjut.</div>}
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-4"><CardTitle className="flex items-center gap-2 text-base"><BookOpen className="h-5 w-5 text-indigo-600" />Analisis Per Kelas</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Mata Kuliah / Kelas</th><th className="px-3 py-3 text-center">Mahasiswa</th><th className="px-3 py-3 text-center">Rata-rata Kehadiran</th><th className="px-3 py-3 text-center">Rata-rata Nilai</th><th className="px-4 py-3 text-center">Risiko Tinggi</th></tr></thead><tbody className="divide-y divide-slate-100">{(data.class_summary || []).map((item) => <tr key={item.id} className="hover:bg-slate-50"><td className="px-4 py-3"><p className="font-bold text-slate-900">{item.course_name || "Mata Kuliah"}</p><p className="text-[11px] text-slate-500">{item.course_code || "-"} · Kelas {item.name || "-"}</p></td><td className="px-3 py-3 text-center font-semibold">{item.student_count}</td><td className="px-3 py-3 text-center font-semibold">{displayPercent(item.average_attendance)}</td><td className="px-3 py-3 text-center font-semibold">{item.average_grade || 0}</td><td className="px-4 py-3 text-center"><span className={item.high_risk_count ? "font-bold text-rose-600" : "text-emerald-600"}>{item.high_risk_count}</span></td></tr>)}</tbody></table></CardContent>
          </Card>
        </>
      ) : null}

      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 bg-slate-950 p-6 text-white"><div><div className="mb-2 flex items-center gap-2"><UserRound className="h-5 w-5 text-indigo-300" /><span className="text-xs font-semibold uppercase tracking-wider text-indigo-200">Detail Analisis Mahasiswa</span></div><h2 className="text-xl font-extrabold">{selectedStudent.name}</h2><p className="mt-1 text-xs text-slate-300">{selectedStudent.nim} · {selectedStudent.email || "Email belum tersedia"}</p></div><button type="button" onClick={() => setSelectedStudent(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button></div>
            <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">
              <div className="flex flex-wrap items-center gap-2"><Badge className={`border ${riskClass(selectedStudent.risk?.label)}`}>{selectedStudent.risk?.label}</Badge><span className="text-xs text-slate-500">Skor risiko: <strong>{selectedStudent.risk?.score || 0}</strong></span><span className="text-xs text-slate-500">Angkatan: <strong>{selectedStudent.angkatan || "-"}</strong></span></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricCard icon={CheckCircle2} label="Kehadiran" value={displayPercent(selectedStudent.attendance?.percentage)} tone="emerald" /><MetricCard icon={BarChart3} label="Nilai" value={selectedStudent.grades?.average || 0} tone="sky" /><MetricCard icon={BookOpen} label="Pengumpulan" value={displayPercent(selectedStudent.learning?.submission_rate)} tone="amber" /><MetricCard icon={Clock3} label="Tidak aktif" value={selectedStudent.inactive_days === null ? "—" : `${selectedStudent.inactive_days}h`} tone="indigo" /></div>
              <div className="grid gap-5 md:grid-cols-2"><div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4"><h3 className="text-sm font-bold text-slate-900">Faktor risiko</h3>{selectedStudent.risk?.reasons?.length ? <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">{selectedStudent.risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p className="mt-2 text-xs text-emerald-700">Tidak ada faktor risiko utama.</p>}</div><div className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-bold text-slate-900">Ringkasan aktivitas</h3><div className="mt-2 space-y-2 text-xs text-slate-600"><p>Login terakhir: <strong className="text-slate-900">{displayDate(selectedStudent.last_login_at)}</strong></p><p>Tugas: <strong className="text-slate-900">{selectedStudent.learning?.submitted || 0}</strong> terkumpul, <strong className="text-rose-600">{selectedStudent.learning?.missing || 0}</strong> belum</p><p>Nilai rendah (&lt;60): <strong className="text-slate-900">{selectedStudent.grades?.low_grade_count || 0}</strong></p><p>Kehadiran: <strong className="text-slate-900">{selectedStudent.attendance?.hadir || 0}</strong> hadir, <strong className="text-rose-600">{selectedStudent.attendance?.alpa || 0}</strong> alpa</p></div></div></div>
              <div><h3 className="mb-2 text-sm font-bold text-slate-900">Kelas yang diikuti</h3><div className="grid gap-2 sm:grid-cols-2">{(selectedStudent.classes || []).map((item) => <div key={item.id} className="rounded-lg border border-slate-200 p-3"><p className="text-xs font-bold text-slate-900">{item.course_name || "Mata Kuliah"}</p><p className="mt-1 text-[11px] text-slate-500">{item.course_code || "-"} · Kelas {item.name || "-"}</p></div>)}{!(selectedStudent.classes || []).length && <p className="text-xs text-slate-500">Belum ada kelas pada periode terpilih.</p>}</div></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
