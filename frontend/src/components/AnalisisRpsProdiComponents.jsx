import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  GraduationCap,
  RefreshCw,
  Search,
  ShieldAlert,
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

const STATUS_META = {
  not_started: { label: "Belum ada RPS", className: "border-slate-200 bg-slate-100 text-slate-600" },
  draft: { label: "Draft / Belum Lengkap", className: "border-amber-200 bg-amber-50 text-amber-700" },
  pending: { label: "Menunggu Approval", className: "border-sky-200 bg-sky-50 text-sky-700" },
  approved: { label: "Disetujui", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  rejected: { label: "Perlu Revisi", className: "border-rose-200 bg-rose-50 text-rose-700" },
};

function tokenFromProps(propToken) {
  if (propToken) return propToken;
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem("token") || localStorage.getItem("elearn_token") || localStorage.getItem("auth_token") || "";
  }
  return "";
}

function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.not_started;
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function StatCard({ icon: Icon, label, value, helper, tone = "indigo" }) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    sky: "bg-sky-50 text-sky-600",
    rose: "bg-rose-50 text-rose-600",
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

function StatusBadge({ status }) {
  const meta = statusMeta(status);
  return <Badge className={`whitespace-nowrap border ${meta.className}`}>{meta.label}</Badge>;
}

function ProgressBar({ value, tone = "indigo" }) {
  const colors = { indigo: "bg-indigo-500", emerald: "bg-emerald-500", sky: "bg-sky-500", amber: "bg-amber-500" };
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full transition-all ${colors[tone] || colors.indigo}`} style={{ width: `${Math.max(0, Math.min(100, Number(value) || 0))}%` }} />
    </div>
  );
}

export function AnalisisRpsProdiPage({ user, token, selectedSemester }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewClass, setReviewClass] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (selectedSemester && selectedSemester !== "all") params.set("semester_id", selectedSemester);
      const authToken = tokenFromProps(token);
      const response = await fetch(`${BACKEND_URL}/api/prodi/analisis-rps${params.toString() ? `?${params}` : ""}`, {
        headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `Gagal memuat analisis RPS (HTTP ${response.status})`);
      setData(payload);
    } catch (fetchError) {
      setError(fetchError.message || "Terjadi kesalahan saat memuat analisis RPS");
    } finally {
      setLoading(false);
    }
  }, [selectedSemester, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredClasses = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (data?.classes || []).filter((item) => {
      const matchesSearch = !keyword
        || String(item.course_name || "").toLowerCase().includes(keyword)
        || String(item.course_code || "").toLowerCase().includes(keyword)
        || String(item.class_name || "").toLowerCase().includes(keyword)
        || String(item.lecturer_name || "").toLowerCase().includes(keyword);
      return matchesSearch && (statusFilter === "all" || item.approval_status === statusFilter);
    });
  }, [data?.classes, search, statusFilter]);

  async function submitApproval(action) {
    if (!reviewClass || reviewLoading) return;
    setReviewLoading(true);
    try {
      const authToken = tokenFromProps(token);
      const response = await fetch(`${BACKEND_URL}/api/prodi/rps/${reviewClass.id}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ action, note: reviewNote.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Approval RPS gagal diproses");
      setReviewClass(null);
      setReviewNote("");
      await fetchData();
    } catch (approvalError) {
      setError(approvalError.message || "Approval RPS gagal diproses");
    } finally {
      setReviewLoading(false);
    }
  }

  const summary = data?.summary || {};
  const approvalRate = summary.approval_percent || 0;
  const completenessRate = summary.completeness_percent || 0;

  return (
    <div className="space-y-6 pb-12" data-testid="analisis-rps-prodi-page">
      <section className="relative overflow-hidden rounded-2xl border border-indigo-900/50 bg-gradient-to-r from-slate-950 via-indigo-950 to-blue-900 p-6 text-white shadow-xl md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-blue-400/10 blur-3xl" />
        <div className="relative z-10 flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-100">
                <GraduationCap className="h-3.5 w-3.5" />
                Quality Assurance Prodi
              </span>
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-200">
                Periode: {data?.period?.label || "Memuat..."}
              </span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Analisis &amp; Approval RPS</h1>
            <p className="mt-2 max-w-2xl text-sm text-indigo-100/85">
              Memantau kelengkapan RPS seluruh mata kuliah di {data?.scope?.prodi_name || user?.prodi_nama || "Program Studi"} dan memberikan persetujuan akademik.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={fetchData} className="self-start border-0 bg-indigo-600 text-white shadow-md hover:bg-indigo-500 md:self-center" data-testid="analisis-rps-refresh-button">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh RPS
          </Button>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700" data-testid="analisis-rps-error">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-bold">Gagal memuat analisis RPS</p><p className="mt-1 text-sm">{error}</p><Button type="button" variant="outline" size="sm" onClick={fetchData} className="mt-3 border-rose-300 bg-white text-rose-700">Coba Lagi</Button></div>
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center shadow-sm"><RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-indigo-600" /><p className="font-semibold text-slate-700">Menganalisis RPS seluruh mata kuliah...</p><p className="mt-1 text-xs text-slate-500">Memeriksa 16 sesi, dokumen, dan status approval.</p></div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard icon={BookOpen} label="Total Mata Kuliah" value={summary.total_courses ?? 0} helper={`${summary.offered_courses ?? 0} dibuka pada periode ini`} />
            <StatCard icon={FileText} label="RPS Tersedia" value={`${summary.rps_count ?? 0}/${summary.total_classes ?? 0}`} helper={`${summary.not_started ?? 0} kelas belum punya RPS`} tone="sky" />
            <StatCard icon={CheckCircle2} label="RPS Lengkap" value={summary.complete_rps ?? 0} helper={`${completenessRate}% dari kelas`} tone="emerald" />
            <StatCard icon={ClipboardCheck} label="Disetujui" value={summary.approved ?? 0} helper={`${summary.pending_approval ?? 0} menunggu review`} tone="indigo" />
            <StatCard icon={ShieldAlert} label="Perlu Perhatian" value={(summary.draft ?? 0) + (summary.rejected ?? 0)} helper={`${summary.rejected ?? 0} perlu revisi`} tone="rose" />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card className="border-slate-200/80 shadow-sm lg:col-span-2">
              <CardHeader className="border-b border-slate-100 pb-4"><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-5 w-5 text-indigo-600" />Progress Quality Assurance RPS</CardTitle></CardHeader>
              <CardContent className="grid gap-5 p-5 sm:grid-cols-2">
                <div><div className="mb-2 flex justify-between text-xs font-semibold text-slate-600"><span>Kelengkapan RPS</span><span>{completenessRate}%</span></div><ProgressBar value={completenessRate} tone="emerald" /><p className="mt-2 text-[11px] text-slate-500">RPS memiliki CPMK, deskripsi, referensi, dan 16 sesi terisi.</p></div>
                <div><div className="mb-2 flex justify-between text-xs font-semibold text-slate-600"><span>Approval Kaprodi</span><span>{approvalRate}%</span></div><ProgressBar value={approvalRate} tone="indigo" /><p className="mt-2 text-[11px] text-slate-500">Persentase RPS yang sudah disetujui dari RPS yang tersedia.</p></div>
              </CardContent>
            </Card>
            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-4"><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-5 w-5 text-sky-600" />Status Review</CardTitle></CardHeader>
              <CardContent className="space-y-2 p-5 text-xs">
                {Object.entries(STATUS_META).map(([status, meta]) => <button type="button" key={status} onClick={() => setStatusFilter(statusFilter === status ? "all" : status)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition hover:shadow-sm ${meta.className} ${statusFilter === status ? "ring-2 ring-indigo-400 ring-offset-1" : ""}`}><span className="font-semibold">{meta.label}</span><span className="font-extrabold">{data.status_distribution?.[status] || 0}</span></button>)}
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-4"><CardTitle className="flex items-center gap-2 text-base"><BookOpen className="h-5 w-5 text-indigo-600" />Ringkasan Semua Mata Kuliah</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Mata Kuliah</th><th className="px-3 py-3 text-center">Kelas</th><th className="px-3 py-3 text-center">RPS</th><th className="px-3 py-3 text-center">Lengkap</th><th className="px-3 py-3 text-center">Pending</th><th className="px-4 py-3 text-center">Disetujui</th></tr></thead><tbody className="divide-y divide-slate-100">{(data.courses || []).map((item) => <tr key={`${item.course_id}-${item.course_code}`} className="hover:bg-slate-50"><td className="px-4 py-3"><p className="font-bold text-slate-900">{item.course_name || "Mata Kuliah"}</p><p className="text-[11px] text-slate-500">{item.course_code || "-"} · {item.program_name || data.scope?.prodi_name || "Prodi"}</p></td><td className="px-3 py-3 text-center font-semibold">{item.class_count}</td><td className="px-3 py-3 text-center">{item.rps_count}/{item.class_count}</td><td className="px-3 py-3 text-center font-semibold text-emerald-600">{item.complete_count}</td><td className="px-3 py-3 text-center font-semibold text-sky-600">{item.pending_count}</td><td className="px-4 py-3 text-center font-semibold text-indigo-600">{item.approved_count}</td></tr>)}</tbody></table>{!(data.courses || []).length && <div className="p-10 text-center text-sm text-slate-500">Belum ada mata kuliah pada scope Prodi ini.</div>}</CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><CardTitle className="flex items-center gap-2 text-base"><FileCheck2 className="h-5 w-5 text-indigo-600" />Daftar RPS &amp; Approval Per Kelas <span className="text-xs font-normal text-slate-500">({filteredClasses.length})</span></CardTitle><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari mata kuliah, kelas, dosen..." className="h-9 w-full pl-9 text-xs sm:w-72" /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"><option value="all">Semua status</option>{Object.entries(STATUS_META).map(([status, meta]) => <option key={status} value={status}>{meta.label}</option>)}</select></div></div></CardHeader>
            <CardContent className="p-0"><div className="max-h-[680px] overflow-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Mata Kuliah / Kelas</th><th className="px-3 py-3">Dosen</th><th className="px-3 py-3 text-center">Kelengkapan</th><th className="px-3 py-3 text-center">Approval</th><th className="px-3 py-3 text-center">Update</th><th className="px-4 py-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredClasses.map((item) => <tr key={item.id} className="hover:bg-slate-50" data-testid={`analisis-rps-row-${item.id}`}><td className="px-4 py-3"><p className="font-bold text-slate-900">{item.course_name || "Mata Kuliah"}</p><p className="text-[11px] text-slate-500">{item.course_code || "-"} · Kelas {item.class_name || "-"} · {item.academic_year || ""} {item.semester || ""}</p></td><td className="px-3 py-3"><p className="font-semibold text-slate-800">{item.lecturer_name || "Belum ditentukan"}</p><p className="text-[10px] text-slate-400">{item.student_count || 0} mahasiswa</p></td><td className="px-3 py-3 text-center"><strong className={item.is_complete ? "text-emerald-600" : "text-amber-600"}>{item.meetings_count}/{item.meetings_target}</strong><p className="text-[10px] text-slate-400">{item.is_complete ? "Lengkap" : "Belum lengkap"}</p></td><td className="px-3 py-3 text-center"><StatusBadge status={item.approval_status} /></td><td className="px-3 py-3 text-center text-[10px] text-slate-500">{formatDate(item.updated_at)}</td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-1.5"><Button type="button" variant="outline" size="sm" onClick={() => { setReviewClass(item); setReviewNote(item.approval_note || ""); }} className="h-8 text-xs">Detail</Button>{item.approval_status !== "approved" && <Button type="button" size="sm" disabled={!item.is_complete || reviewLoading} onClick={() => { setReviewClass(item); setReviewNote(""); }} className="h-8 bg-indigo-600 text-xs hover:bg-indigo-700">Review</Button>}</div></td></tr>)}</tbody></table>{!filteredClasses.length && <div className="p-10 text-center text-sm text-slate-500">Tidak ada kelas yang cocok dengan filter.</div>}</div></CardContent>
          </Card>
        </>
      ) : null}

      {reviewClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 bg-slate-950 p-6 text-white"><div><div className="mb-2 flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-indigo-300" /><span className="text-xs font-semibold uppercase tracking-wider text-indigo-200">Review RPS Prodi</span></div><h2 className="text-xl font-extrabold">{reviewClass.course_name}</h2><p className="mt-1 text-xs text-slate-300">Kelas {reviewClass.class_name} · {reviewClass.lecturer_name || "Dosen belum ditentukan"}</p></div><button type="button" onClick={() => setReviewClass(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button></div>
            <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status={reviewClass.approval_status} /><span className="text-xs text-slate-500">Kelengkapan: <strong>{reviewClass.meetings_count}/{reviewClass.meetings_target} sesi</strong></span><span className="text-xs text-slate-500">Dokumen: <strong>{reviewClass.document_file_name || (reviewClass.has_rps ? "Data RPS tersedia" : "Belum ada")}</strong></span></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><StatCard icon={BookOpen} label="Sesi RPS" value={`${reviewClass.meetings_count}/16`} tone="indigo" /><StatCard icon={CheckCircle2} label="Status" value={reviewClass.is_complete ? "Lengkap" : "Draft"} tone={reviewClass.is_complete ? "emerald" : "amber"} /><StatCard icon={Users} label="Mahasiswa" value={reviewClass.student_count || 0} tone="sky" /><StatCard icon={Clock3} label="Update" value={reviewClass.updated_at ? formatDate(reviewClass.updated_at).split(" ")[0] : "-"} tone="amber" /></div>
              {!reviewClass.is_complete && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800"><p className="font-bold">RPS belum dapat disetujui.</p><ul className="mt-2 list-disc space-y-1 pl-4">{(reviewClass.missing_fields || []).map((field) => <li key={field}>{field}</li>)}</ul></div>}
              {reviewClass.approval_note && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800"><p className="font-bold">Catatan review sebelumnya</p><p className="mt-1">{reviewClass.approval_note}</p></div>}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"><h3 className="text-sm font-bold text-slate-900">Ringkasan isi RPS</h3><div className="mt-3 grid gap-3 text-xs text-slate-700"><div><p className="font-bold text-slate-500">CPMK</p><p className="mt-1 whitespace-pre-line">{reviewClass.rps_preview?.cpmk || "Belum diisi"}</p></div><div><p className="font-bold text-slate-500">Deskripsi</p><p className="mt-1 whitespace-pre-line">{reviewClass.rps_preview?.description || "Belum diisi"}</p></div><div><p className="font-bold text-slate-500">Referensi</p><p className="mt-1 whitespace-pre-line">{reviewClass.rps_preview?.references || "Belum diisi"}</p></div><div><p className="font-bold text-slate-500">Topik pertemuan</p><div className="mt-2 grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2">{(reviewClass.rps_preview?.meetings || []).map((meeting) => <div key={meeting.meeting_number} className={`rounded-lg border px-2.5 py-2 ${meeting.is_exam ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}><span className="font-bold">Sesi {meeting.meeting_number}:</span> {meeting.topic || "Belum diisi"}<p className="mt-0.5 text-[10px] text-slate-500">{meeting.materials || "Materi belum diisi"}</p></div>)}{!(reviewClass.rps_preview?.meetings || []).length && <p className="text-slate-500">Belum ada data pertemuan.</p>}</div></div></div></div>
              <div><label className="mb-1 block text-xs font-bold text-slate-700" htmlFor="rps-review-note">Catatan approval / revisi</label><textarea id="rps-review-note" rows={4} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Tuliskan catatan untuk dosen jika diperlukan..." className="w-full rounded-lg border border-slate-200 p-3 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="outline" onClick={() => setReviewClass(null)}>Tutup</Button><Button type="button" variant="outline" disabled={reviewLoading} onClick={() => submitApproval("reject")} className="border-rose-300 text-rose-700 hover:bg-rose-50"><AlertTriangle className="mr-1.5 h-4 w-4" />Tolak / Minta Revisi</Button><Button type="button" disabled={!reviewClass.is_complete || reviewLoading} onClick={() => submitApproval("approve")} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="mr-1.5 h-4 w-4" />Setujui RPS</Button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
