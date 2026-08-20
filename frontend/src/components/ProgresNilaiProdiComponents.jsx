import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Award,
  CheckCircle2,
  Clock,
  Users,
  FileSpreadsheet,
  Printer,
  Search,
  Filter,
  ShieldCheck,
  ChevronRight,
  Eye,
  BarChart3,
  RefreshCw,
  AlertCircle,
  X,
  FileText,
  Building2,
  Sparkles,
  BookOpen,
  Check,
  QrCode,
  GraduationCap,
  Layers,
  LayoutGrid,
  List,
  Calendar
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Badge } from "./ui/badge";

// Resolve Backend Base URL matching App.js standard
function resolveBackendUrl() {
  const configuredUrl = String(
    process.env.REACT_APP_BACKEND_URL || ""
  ).trim().replace(/\/+$/, "");
  if (configuredUrl) return configuredUrl;
  if (typeof window !== "undefined" && window.location?.origin) {
    if (window.location.port === "3000") {
      return `${window.location.protocol}//${window.location.hostname}:8000`;
    }
    return window.location.origin;
  }
  return "";
}

const BACKEND_URL = resolveBackendUrl();

// Helper to retrieve auth token matching App.js
const getToken = (propToken) => {
  if (propToken) return propToken;
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem("token") || localStorage.getItem("elearn_token") || localStorage.getItem("auth_token") || "";
  }
  return "";
};

export function ProgresNilaiProdiPage({ user, token, selectedSemester: globalSelectedSemester, programs = [] }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  // Filters
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedProdi, setSelectedProdi] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'in_progress' | 'finalized' | 'incomplete'
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'table'

  // Modals
  const [selectedClassDetail, setSelectedClassDetail] = useState(null);
  const [printModalData, setPrintModalData] = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");

  // Fetch grade progress data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const authToken = getToken(token);
      const params = new URLSearchParams();
      if (globalSelectedSemester && globalSelectedSemester !== "all") {
        params.append("semester_id", globalSelectedSemester);
      }
      if (searchKeyword) params.append("search", searchKeyword);
      if (selectedProdi) params.append("prodi_id", selectedProdi);

      const url = `${BACKEND_URL}/api/v1/krs/progres-nilai${params.toString() ? `?${params.toString()}` : ""}`;

      const res = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Gagal memuat data (HTTP ${res.status})`);
      }

      const resJson = await res.json();
      setData(resJson);
    } catch (err) {
      console.error(err);
      setError(err.message || "Terjadi kesalahan koneksi ke server");
    } finally {
      setLoading(false);
    }
  }, [globalSelectedSemester, searchKeyword, selectedProdi, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Export Excel
  const handleExportExcel = async (classId = "") => {
    const params = new URLSearchParams();
    if (classId) params.append("class_id", classId);
    if (globalSelectedSemester && globalSelectedSemester !== "all") {
      params.append("semester_id", globalSelectedSemester);
    }
    if (selectedProdi) params.append("prodi_id", selectedProdi);
    const url = `${BACKEND_URL}/api/v1/krs/progres-nilai/export.xlsx?${params.toString()}`;
    try {
      const authToken = getToken(token);
      const response = await fetch(url, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Ekspor progres nilai gagal");
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = classId ? `progres-nilai-${classId}.xlsx` : "rekap-progres-nilai-prodi.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (exportError) {
      alert(exportError.message || "Ekspor progres nilai gagal");
    }
  };

  // Handle Cetak & TTD Digital
  const handleFetchCetak = async (classId) => {
    setIsPrinting(true);
    try {
      const authToken = getToken(token);
      const res = await fetch(`${BACKEND_URL}/api/v1/krs/progres-nilai/cetak`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          class_id: classId,
          tahun_ajaran: globalSelectedSemester !== "all" ? globalSelectedSemester : "",
          validate_base_url: window.location.origin
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Gagal membuat dokumen cetak (HTTP ${res.status})`);
      }
      const resJson = await res.json();
      setPrintModalData(resJson);
    } catch (err) {
      alert(err.message || "Gagal memproses dokumen cetak");
    } finally {
      setIsPrinting(false);
    }
  };

  // Filtered classes list based on statusFilter tab
  const filteredClasses = useMemo(() => {
    if (!data?.classes) return [];
    return data.classes.filter(c => {
      if (statusFilter === "in_progress") return c.status !== "finalized" && c.progress_percent < 100;
      if (statusFilter === "finalized") return c.status === "finalized" || c.progress_percent === 100;
      if (statusFilter === "incomplete") return c.progress_percent < 100;
      return true;
    });
  }, [data?.classes, statusFilter]);

  const canSelectProdi = user?.role === "admin"
    || (user?.access_roles || []).includes("academic_operator")
    || Boolean(data?.scope?.can_select_prodi);
  const programOptions = useMemo(() => {
    const source = Array.isArray(programs) && programs.length ? programs : (data?.prodi_list || []);
    return source.filter((item) => item?.id || item?.code || item?.kode);
  }, [data?.prodi_list, programs]);

  const activeProdiName = useMemo(() => {
    if (data?.prodi_name) return data.prodi_name;
    if (data?.scope?.prodi_name) return data.scope.prodi_name;
    if (data?.classes?.[0]?.prodi_name) return data.classes[0].prodi_name;
    if (user?.prodi_nama || user?.prodi_name) return user.prodi_nama || user.prodi_name;
    return "Program Studi Penugasan";
  }, [data, user]);

  const activePeriodName = useMemo(() => {
    const selected = (data?.tahun_ajaran_list || []).find(
      (period) => [period.id, period.kode, period.code]
        .filter((value) => value !== undefined && value !== null)
        .some((value) => String(value) === String(globalSelectedSemester || "")),
    );
    const period = selected || data?.selected_period || data?.active_period;
    if (!period) return globalSelectedSemester && globalSelectedSemester !== "all" ? globalSelectedSemester : "Aktif";
    return period.nama || [period.tahun || period.academic_year, period.semester].filter(Boolean).join(" ") || period.name || period.code || period.id || "Aktif";
  }, [data, globalSelectedSemester]);

  return (
    <div className="space-y-6 pb-12" data-testid="progres-nilai-prodi-page">
      {/* ── HEADER BANNER ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white p-6 md:p-8 shadow-xl border border-indigo-900/50">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-semibold uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-300" />
                {activeProdiName}
              </div>

              {/* Active Period Badge automatically synced from Header */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold">
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                Periode Akademik: {activePeriodName}
              </div>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              Progres Nilai Perkuliahan Prodi
            </h1>
            <p className="text-sm text-indigo-200/90 max-w-2xl">
              Memantau progres penginputan nilai mahasiswa oleh dosen pengampu secara real-time pada <strong>{activeProdiName}</strong>.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center">
            <Button
              variant="outline"
              onClick={() => handleExportExcel("")}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 shadow-sm transition-all"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-400" />
              Ekspor Excel
            </Button>
            <Button
              onClick={fetchData}
              variant="secondary"
              className="bg-indigo-600 hover:bg-indigo-500 text-white border-0 shadow-md transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* ── METRICS SUMMARY CARDS ── */}
      {data?.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Total Kelas */}
          <Card className="border border-slate-200/80 shadow-sm hover:shadow-md transition-all bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Kelas MK</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{data.summary.total_classes}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{data.summary.total_lecturers} Dosen Pengampu</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <BookOpen className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Overall Progress */}
          <Card className="border border-slate-200/80 shadow-sm hover:shadow-md transition-all bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Progres Input Nilai</p>
                <Badge className={data.summary.overall_progress_percent >= 80 ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-amber-100 text-amber-800 border-amber-200"}>
                  {data.summary.overall_progress_percent}%
                </Badge>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{data.summary.overall_progress_percent}%</h3>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, data.summary.overall_progress_percent)}%` }}
                ></div>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Total Mahasiswa Dinilai */}
          <Card className="border border-slate-200/80 shadow-sm hover:shadow-md transition-all bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Mahasiswa Dinilai</p>
                <h3 className="text-2xl font-bold text-emerald-600 mt-1">
                  {data.summary.total_students_graded} <span className="text-xs text-slate-400 font-normal">/ {data.summary.total_students_enrolled}</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Nilai Komponen Lengkap</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Users className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Kelas Finalized */}
          <Card className="border border-slate-200/80 shadow-sm hover:shadow-md transition-all bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Kelas Finalized</p>
                <h3 className="text-2xl font-bold text-indigo-600 mt-1">{data.summary.finalized_classes}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Terkunci &amp; Terverifikasi</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Card 5: Kelas Dalam Proses */}
          <Card className="border border-slate-200/80 shadow-sm hover:shadow-md transition-all bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Dalam Proses</p>
                <h3 className="text-2xl font-bold text-amber-600 mt-1">{data.summary.in_progress_classes}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Penginputan Dosen</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Clock className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── SEARCH & STATUS FILTER CONTROLS ── */}
      <Card className="border border-slate-200/80 shadow-sm bg-white">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
              {canSelectProdi && (
                <select
                  value={selectedProdi}
                  onChange={(event) => {
                    setSelectedProdi(event.target.value);
                    setSelectedClassDetail(null);
                  }}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 sm:w-72"
                  data-testid="progres-nilai-prodi-selector"
                >
                  <option value="">Semua Program Studi</option>
                  {programOptions.map((program) => {
                    const id = program.id || program.code || program.kode;
                    return <option key={id} value={id}>{program.name || program.nama || program.code || program.kode}</option>;
                  })}
                </select>
              )}
              <div className="w-full sm:w-80">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <Input
                    placeholder="Cari Mata Kuliah, Kode, Dosen..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="pl-9 bg-slate-50 border-slate-300 text-sm h-10"
                  />
                </div>
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-2 self-end sm:self-center">
              <div className="bg-slate-100 p-1 rounded-lg flex items-center gap-1 border border-slate-200">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2 rounded-md text-xs font-medium transition-all ${
                    viewMode === "grid" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
                  }`}
                  title="Tampilan Grid Kartu"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  className={`p-2 rounded-md text-xs font-medium transition-all ${
                    viewMode === "table" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
                  }`}
                  title="Tampilan Tabel Detail"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Status Tabs Filter */}
          <div className="flex items-center gap-2 border-t border-slate-100 pt-3 overflow-x-auto">
            {[
              { id: "all", label: "Semua Kelas", count: data?.classes?.length || 0 },
              { id: "in_progress", label: "Progres Penginputan", count: data?.classes?.filter(c => c.status !== "finalized" && c.progress_percent < 100).length || 0 },
              { id: "finalized", label: "Nilai Lengkap / Finalized", count: data?.classes?.filter(c => c.status === "finalized" || c.progress_percent === 100).length || 0 },
              { id: "incomplete", label: "Belum Lengkap", count: data?.classes?.filter(c => c.progress_percent < 100).length || 0 }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 ${
                  statusFilter === tab.id
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tab.label}
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                  statusFilter === tab.id ? "bg-indigo-700 text-white" : "bg-slate-200 text-slate-700"
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── LOADING & ERROR STATES ── */}
      {loading && (
        <div className="py-16 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">Memuat data progres nilai prodi...</p>
          <p className="text-xs text-slate-400 mt-1">Mengagregasi nilai komponen dari seluruh dosen pengampu</p>
        </div>
      )}

      {error && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm">Gagal Memuat Data</h4>
            <p className="text-xs mt-1 text-red-600">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData} className="mt-3 bg-white text-red-700 border-red-300 hover:bg-red-50">
              Coba Lagi
            </Button>
          </div>
        </div>
      )}

      {/* ── CLASS LIST DISPLAY ── */}
      {!loading && !error && filteredClasses.length === 0 && (
        <div className="py-16 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Tidak Ada Kelas Perkuliahan</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Tidak ditemukan kelas yang cocok dengan kriteria pencarian Anda pada prodi ini.
          </p>
        </div>
      )}

      {!loading && !error && filteredClasses.length > 0 && (
        <>
          {viewMode === "grid" ? (
            /* ── GRID CARDS VIEW ── */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredClasses.map((item) => (
                <Card
                  key={item.class_id}
                  className="border border-slate-200/80 shadow-sm hover:shadow-md transition-all bg-white flex flex-col justify-between overflow-hidden"
                >
                  <CardHeader className="p-5 pb-3 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="inline-block px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-mono text-[11px] font-bold mb-1">
                          {item.course_code || "MK"}
                        </span>
                        <CardTitle className="text-base font-bold text-slate-900 leading-snug line-clamp-2">
                          {item.course_name}
                        </CardTitle>
                      </div>
                      <Badge className={
                        item.status === "finalized"
                          ? "bg-indigo-100 text-indigo-800 border-indigo-200 shrink-0"
                          : item.progress_percent === 100
                          ? "bg-emerald-100 text-emerald-800 border-emerald-200 shrink-0"
                          : "bg-amber-100 text-amber-800 border-amber-200 shrink-0"
                      }>
                        {item.status_label}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-2 font-medium">
                      <span>Kelas: <strong className="text-slate-800">{item.class_name}</strong></span>
                      <span>•</span>
                      <span>SKS: <strong className="text-slate-800">{item.sks}</strong></span>
                      <span>•</span>
                      <span className="truncate">{item.prodi_name}</span>
                    </div>
                  </CardHeader>

                  <CardContent className="p-5 space-y-4 flex-1">
                    {/* Dosen Pengampu Info */}
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                        {item.dosen_name ? item.dosen_name.charAt(0) : "D"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Dosen Pengampu</p>
                        <p className="text-xs font-bold text-slate-800 truncate">{item.dosen_name || "Belum Set"}</p>
                        {item.dosen_nidn && (
                          <p className="text-[10px] text-slate-500 font-mono">NIDN: {item.dosen_nidn}</p>
                        )}
                      </div>
                    </div>

                    {/* Progres Bar & Count */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                        <span className="text-slate-600">Mahasiswa Dinilai</span>
                        <span className={item.progress_percent === 100 ? "text-emerald-600" : "text-indigo-600"}>
                          {item.graded_count} / {item.student_count} ({item.progress_percent}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            item.progress_percent === 100
                              ? "bg-emerald-500"
                              : item.progress_percent > 50
                              ? "bg-indigo-600"
                              : "bg-amber-500"
                          }`}
                          style={{ width: `${Math.min(100, item.progress_percent)}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Grade Distribution Counters */}
                    <div className="grid grid-cols-5 gap-1 text-center bg-slate-50/80 p-2 rounded-lg border border-slate-100">
                      {["A", "B", "C", "D", "E"].map((letter) => (
                        <div key={letter}>
                          <span className="block text-[10px] text-slate-400 font-bold">{letter}</span>
                          <span className="text-xs font-bold text-slate-700">{item.grade_distribution?.[letter] || 0}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>

                  {/* Actions Footer */}
                  <div className="p-4 pt-0 gap-2 flex items-center justify-between border-t border-slate-100 mt-auto bg-slate-50/30">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedClassDetail(item)}
                      className="text-xs text-slate-700 border-slate-300 hover:bg-slate-100 flex-1"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1 text-slate-500" />
                      Detail Nilai
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExportExcel(item.class_id)}
                      className="text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                      title="Ekspor Excel Kelas Ini"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleFetchCetak(item.class_id)}
                      className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm"
                      title="Cetak Dokumen + TTD Digital Dosen"
                    >
                      <Printer className="w-3.5 h-3.5 mr-1" />
                      Cetak TTD Digital
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            /* ── TABLE VIEW ── */
            <Card className="border border-slate-200/80 shadow-sm bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800 text-white font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="p-3.5 text-center w-12">No</th>
                      <th className="p-3.5">Mata Kuliah &amp; Kelas</th>
                      <th className="p-3.5">Dosen Pengampu</th>
                      <th className="p-3.5 text-center">Progres Input</th>
                      <th className="p-3.5 text-center">Distribusi (A-E)</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-800">
                    {filteredClasses.map((item, idx) => (
                      <tr key={item.class_id} className="hover:bg-slate-50/80 transition-all">
                        <td className="p-3.5 text-center font-bold text-slate-500">{idx + 1}</td>
                        <td className="p-3.5">
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded mr-1.5 font-semibold">
                            {item.course_code}
                          </span>
                          <strong className="text-slate-900 font-bold text-sm block md:inline">{item.course_name}</strong>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Kelas {item.class_name} • {item.sks} SKS • {item.prodi_name}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span className="font-semibold text-slate-900 block">{item.dosen_name || "Belum Set"}</span>
                          {item.dosen_nidn && <span className="text-[10px] text-slate-400 font-mono">NIDN: {item.dosen_nidn}</span>}
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="font-bold text-indigo-700 text-xs">
                            {item.graded_count} / {item.student_count} ({item.progress_percent}%)
                          </div>
                          <div className="w-24 bg-slate-100 h-1.5 rounded-full mx-auto mt-1 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${item.progress_percent === 100 ? "bg-emerald-500" : "bg-indigo-600"}`}
                              style={{ width: `${Math.min(100, item.progress_percent)}%` }}
                            ></div>
                          </div>
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="inline-flex gap-1.5 font-mono text-[11px] bg-slate-100 px-2 py-1 rounded-md">
                            <span className="text-emerald-700 font-bold">A:{item.grade_distribution?.A || 0}</span>
                            <span className="text-blue-700 font-bold">B:{item.grade_distribution?.B || 0}</span>
                            <span className="text-amber-700 font-bold">C:{item.grade_distribution?.C || 0}</span>
                            <span className="text-red-600 font-bold">D:{item.grade_distribution?.D || 0}</span>
                            <span className="text-slate-500">E:{item.grade_distribution?.E || 0}</span>
                          </div>
                        </td>
                        <td className="p-3.5 text-center">
                          <Badge className={
                            item.status === "finalized"
                              ? "bg-indigo-100 text-indigo-800"
                              : item.progress_percent === 100
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }>
                            {item.status_label}
                          </Badge>
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedClassDetail(item)}
                              className="h-8 text-xs text-slate-700"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" /> Detail
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleFetchCetak(item.class_id)}
                              className="h-8 text-xs bg-indigo-600 text-white hover:bg-indigo-700"
                            >
                              <Printer className="w-3.5 h-3.5 mr-1" /> Cetak TTD
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* ── MODAL DETAIL NILAI MAHASISWA ── */}
      {selectedClassDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header Modal */}
            <div className="p-6 bg-slate-900 text-white flex items-start justify-between gap-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded font-bold border border-indigo-400/30">
                    {selectedClassDetail.course_code}
                  </span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30">
                    Progres: {selectedClassDetail.progress_percent}%
                  </Badge>
                </div>
                <h3 className="text-xl font-bold text-white leading-tight">
                  {selectedClassDetail.course_name}
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  Kelas: <strong>{selectedClassDetail.class_name}</strong> • SKS: {selectedClassDetail.sks} • Dosen: <strong>{selectedClassDetail.dosen_name}</strong> ({selectedClassDetail.dosen_nidn || selectedClassDetail.dosen_nip || "NIDN -"})
                </p>
              </div>

              <button
                onClick={() => { setSelectedClassDetail(null); setStudentSearch(""); }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
              {/* Bobot Components Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Bobot Tugas</span>
                  <span className="text-lg font-extrabold text-slate-800">{selectedClassDetail.grade_weights?.tugas}%</span>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Bobot UTS</span>
                  <span className="text-lg font-extrabold text-slate-800">{selectedClassDetail.grade_weights?.uts}%</span>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Bobot UAS</span>
                  <span className="text-lg font-extrabold text-slate-800">{selectedClassDetail.grade_weights?.uas}%</span>
                </div>
              </div>

              {/* Student Filter & Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    Daftar Nilai Mahasiswa ({selectedClassDetail.students?.length || 0} Mahasiswa)
                  </h4>
                  <div className="w-64">
                    <Input
                      placeholder="Cari NIM / Nama Mahasiswa..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="bg-white border-slate-300 text-xs h-8"
                    />
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[11px] sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="p-3 text-center w-10">No</th>
                          <th className="p-3">NIM</th>
                          <th className="p-3">Nama Mahasiswa</th>
                          <th className="p-3 text-center">Tugas</th>
                          <th className="p-3 text-center">UTS</th>
                          <th className="p-3 text-center">UAS</th>
                          <th className="p-3 text-center font-bold">Nilai Akhir</th>
                          <th className="p-3 text-center font-bold">Huruf</th>
                          <th className="p-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedClassDetail.students
                          ?.filter(s =>
                            !studentSearch ||
                            s.student_name.toLowerCase().includes(studentSearch.toLowerCase()) ||
                            s.student_nim.toLowerCase().includes(studentSearch.toLowerCase())
                          )
                          .map((s, idx) => (
                            <tr key={s.student_id} className="hover:bg-slate-50">
                              <td className="p-3 text-center font-mono text-slate-400">{idx + 1}</td>
                              <td className="p-3 font-mono font-semibold text-indigo-900">{s.student_nim}</td>
                              <td className="p-3 font-bold text-slate-800">{s.student_name}</td>
                              <td className="p-3 text-center font-mono">{s.component_scores?.tugas ?? "-"}</td>
                              <td className="p-3 text-center font-mono">{s.component_scores?.uts ?? "-"}</td>
                              <td className="p-3 text-center font-mono">{s.component_scores?.uas ?? "-"}</td>
                              <td className="p-3 text-center font-bold font-mono text-indigo-700 bg-indigo-50/40">{s.weighted_grade}</td>
                              <td className="p-3 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded font-bold text-xs ${
                                  s.grade_letter === "A" ? "bg-emerald-100 text-emerald-800" :
                                  s.grade_letter === "B" ? "bg-blue-100 text-blue-800" :
                                  s.grade_letter === "C" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
                                }`}>
                                  {s.grade_letter}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                {s.grade_complete ? (
                                  <span className="text-emerald-600 font-semibold text-[11px] inline-flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5" /> Lengkap
                                  </span>
                                ) : (
                                  <span className="text-amber-600 font-semibold text-[11px]">Belum Lengkap</span>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportExcel(selectedClassDetail.class_id)}
                className="text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                Ekspor Excel Kelas
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setSelectedClassDetail(null); setStudentSearch(""); }}
                  className="text-xs"
                >
                  Tutup
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const cid = selectedClassDetail.class_id;
                    setSelectedClassDetail(null);
                    handleFetchCetak(cid);
                  }}
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Printer className="w-4 h-4 mr-1.5" />
                  Cetak Dokumen &amp; TTD Digital
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PRINT PREVIEW MODAL (OFFICIAL LETTERHEAD & DIGITAL SIGNATURE) ── */}
      {printModalData && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[95vh] flex flex-col shadow-2xl overflow-hidden border border-slate-300">
            {/* Control Bar for Print Modal */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between gap-4 shrink-0 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm sm:text-base">Pratinjau Dokumen Cetak &amp; Tandatangan Digital Dosen</h3>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => window.print()}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
                >
                  <Printer className="w-4 h-4 mr-1.5" />
                  Cetak / Download PDF
                </Button>
                <button
                  onClick={() => setPrintModalData(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Document Content */}
            <div className="p-6 sm:p-10 overflow-y-auto flex-1 bg-white text-slate-900 text-xs font-sans print:p-0 print:overflow-visible" id="printable-grade-doc">
              {/* Kop Surat Official */}
              <div className="border-b-4 border-double border-slate-900 pb-4 mb-6 text-center relative">
                {printModalData.kop?.logo_url && (
                  <img
                    src={printModalData.kop.logo_url}
                    alt="Logo Kampus"
                    className="w-16 h-16 absolute left-0 top-0 object-contain hidden sm:block"
                  />
                )}
                <h2 className="text-lg font-extrabold uppercase tracking-wide text-slate-900">
                  {printModalData.kop?.instansi || "SISTEM INFORMASI AKADEMIK"}
                </h2>
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mt-0.5">
                  {printModalData.kop?.sub_instansi || "DIREKTORAT AKADEMIK DAN KEMAHASISWAAN"}
                </h3>
                <p className="text-[11px] text-slate-500 mt-1 max-w-xl mx-auto italic">
                  {printModalData.kop?.alamat}
                </p>
              </div>

              {/* Document Title */}
              <div className="text-center mb-6">
                <h3 className="text-base font-extrabold text-slate-900 uppercase tracking-wider underline">
                  LEMBAR REKAPITULASI &amp; PENGESAHAN NILAI AKADEMIK PERKULIAHAN
                </h3>
                <p className="text-[11px] text-slate-600 font-mono mt-1">
                  Nomor Validasi Dokumen: {printModalData.signature?.token}
                </p>
              </div>

              {/* Metadata Table */}
              <div className="grid grid-cols-2 gap-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div className="space-y-1.5">
                  <div className="flex"><span className="w-32 font-semibold text-slate-500">Mata Kuliah:</span> <strong className="text-slate-900">{printModalData.class_info?.course_name}</strong></div>
                  <div className="flex"><span className="w-32 font-semibold text-slate-500">Kode MK / SKS:</span> <span>{printModalData.class_info?.course_code} ({printModalData.class_info?.sks} SKS)</span></div>
                  <div className="flex"><span className="w-32 font-semibold text-slate-500">Kelas Semester:</span> <strong>{printModalData.class_info?.class_name}</strong></div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex"><span className="w-32 font-semibold text-slate-500">Program Studi:</span> <span>{printModalData.class_info?.prodi_name}</span></div>
                  <div className="flex"><span className="w-32 font-semibold text-slate-500">Periode Akademik:</span> <span>{printModalData.class_info?.semester} {printModalData.class_info?.academic_year}</span></div>
                  <div className="flex"><span className="w-32 font-semibold text-slate-500">Dosen Pengampu:</span> <strong>{printModalData.class_info?.dosen_name}</strong></div>
                </div>
              </div>

              {/* Student Grade Table */}
              <table className="w-full border-collapse border border-slate-300 text-xs mb-6">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 font-bold uppercase text-[10px]">
                    <th className="border border-slate-300 p-2 text-center w-8">No</th>
                    <th className="border border-slate-300 p-2 text-center w-28">NIM</th>
                    <th className="border border-slate-300 p-2 text-left">Nama Mahasiswa</th>
                    <th className="border border-slate-300 p-2 text-center w-16">Tugas</th>
                    <th className="border border-slate-300 p-2 text-center w-16">UTS</th>
                    <th className="border border-slate-300 p-2 text-center w-16">UAS</th>
                    <th className="border border-slate-300 p-2 text-center w-20 font-extrabold">Nilai Akhir</th>
                    <th className="border border-slate-300 p-2 text-center w-14 font-extrabold">Huruf</th>
                    <th className="border border-slate-300 p-2 text-left w-32">Predikat</th>
                  </tr>
                </thead>
                <tbody>
                  {printModalData.class_info?.students?.map((s, idx) => (
                    <tr key={s.student_id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="border border-slate-300 p-2 text-center font-mono">{idx + 1}</td>
                      <td className="border border-slate-300 p-2 text-center font-mono font-semibold">{s.student_nim}</td>
                      <td className="border border-slate-300 p-2 font-bold">{s.student_name}</td>
                      <td className="border border-slate-300 p-2 text-center font-mono">{s.component_scores?.tugas ?? "-"}</td>
                      <td className="border border-slate-300 p-2 text-center font-mono">{s.component_scores?.uts ?? "-"}</td>
                      <td className="border border-slate-300 p-2 text-center font-mono">{s.component_scores?.uas ?? "-"}</td>
                      <td className="border border-slate-300 p-2 text-center font-mono font-extrabold text-indigo-900 bg-slate-100/50">{s.weighted_grade}</td>
                      <td className="border border-slate-300 p-2 text-center font-extrabold">{s.grade_letter}</td>
                      <td className="border border-slate-300 p-2 text-slate-700 text-[11px]">{s.grade_predicate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Grade Stats Distribution Summary */}
              <div className="flex items-center justify-between border border-slate-200 p-3 rounded-lg bg-slate-50 mb-8 text-xs">
                <div>
                  <strong>Ringkasan Peserta:</strong> Total {printModalData.class_info?.student_count} Mahasiswa • Dinilai {printModalData.class_info?.graded_count} Mahasiswa ({printModalData.class_info?.progress_percent}%)
                </div>
                <div className="flex gap-3 font-mono font-bold">
                  <span>A: {printModalData.class_info?.grade_distribution?.A || 0}</span>
                  <span>B: {printModalData.class_info?.grade_distribution?.B || 0}</span>
                  <span>C: {printModalData.class_info?.grade_distribution?.C || 0}</span>
                  <span>D: {printModalData.class_info?.grade_distribution?.D || 0}</span>
                  <span>E: {printModalData.class_info?.grade_distribution?.E || 0}</span>
                </div>
              </div>

              {/* ── DIGITAL SIGNATURE BOX DOSEN PENGAMPU ── */}
              <div className="flex justify-end mt-8 page-break-inside-avoid">
                <div className="w-80 text-center space-y-2">
                  <p className="text-xs font-semibold text-slate-700">
                    {printModalData.kop?.kota || "Jakarta"}, {new Date(printModalData.printed_at || Date.now()).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                  <p className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                    Dosen Pengampu Mata Kuliah
                  </p>

                  {/* Digital Signature Shield & QR Code Container */}
                  <div className="my-3 p-3 bg-slate-50 border border-slate-300 rounded-xl flex flex-col items-center justify-center relative shadow-sm">
                    <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold tracking-wider border border-emerald-300 mb-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      DIGITAL SIGNATURE VERIFIED
                    </div>

                    {printModalData.signature?.qr_png ? (
                      <img
                        src={printModalData.signature.qr_png}
                        alt="QR Validasi TTD Digital"
                        className="w-24 h-24 object-contain border border-slate-200 rounded p-1 bg-white"
                      />
                    ) : (
                      <div className="w-24 h-24 bg-slate-200 flex items-center justify-center text-slate-400 font-mono text-[10px]">
                        QR CODE
                      </div>
                    )}

                    <p className="text-[9px] text-slate-400 font-mono mt-1">
                      Pindai QR untuk Verifikasi Keabsahan
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900 underline">
                      {printModalData.signature?.signer_name || printModalData.class_info?.dosen_name}
                    </h4>
                    <p className="text-xs text-slate-600 font-mono mt-0.5">
                      {printModalData.signature?.signer_ident || "NIDN / NIP Dosen"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
