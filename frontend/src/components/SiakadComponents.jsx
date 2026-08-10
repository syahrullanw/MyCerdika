import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") || window.location.origin;
const api = axios.create({ baseURL: BACKEND_URL });
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { apiErrorMessage } from "@/lib/utils";
import {
  GraduationCap,
  FileSpreadsheet,
  FileText,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  CreditCard,
  QrCode,
  ShieldCheck,
  Building,
  UserCheck
} from "lucide-react";

export function KRSPage({ user, token }) {
  const [krs, setKrs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [offering, setOffering] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState("");

  const fetchKRS = async () => {
    try {
      setLoading(true);
      const [resKrs, resOff] = await Promise.all([
        api.get("/api/v1/krs/my-krs", { headers: { Authorization: `Bearer ${token}` } }),
        api.get("/api/v1/krs/offering", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (resKrs.data.ok) {
        setKrs(resKrs.data.krs);
        setItems(resKrs.data.krs.items || []);
      }
      if (resOff.data.ok) {
        setOffering(resOff.data);
      }
    } catch (err) {
      console.error(err);
      toast.error("Gagal memuat data KRS & penawaran MK");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKRS();
  }, []);

  const handleTakePaket = () => {
    if (!offering || !offering.paket_courses || offering.paket_courses.length === 0) {
      toast.error(`Belum ada Paket MK yang ditawarkan untuk Semester ${offering?.calculated_semester || 1}`);
      return;
    }
    const currentCodes = new Set(items.map((i) => i.course_code));
    const newItems = [...items];
    let addedCount = 0;

    offering.paket_courses.forEach((c) => {
      const code = c.code || c.kode;
      if (!currentCodes.has(code)) {
        const sksNum = parseInt(c.total_sks || c.sks) || 3;
        newItems.push({
          course_id: c.id || `c_${Date.now()}_${Math.random()}`,
          course_code: code,
          course_name: c.name || c.nama,
          sks: sksNum,
        });
        addedCount++;
      }
    });

    const totalSKS = newItems.reduce((sum, item) => sum + item.sks, 0);
    if (totalSKS > 24) {
      toast.error("Total SKS paket melebihi batas maksimal 24 SKS");
      return;
    }

    setItems(newItems);
    if (addedCount > 0) {
      toast.success(`Berhasil menambahkan Paket Semester ${offering.calculated_semester} (${addedCount} Mata Kuliah)`);
    } else {
      toast.info("Semua Mata Kuliah Paket Semester sudah ada di draft KRS Anda.");
    }
  };

  const handleAddSelectedCourse = (e) => {
    e.preventDefault();
    if (!selectedCourseId) {
      toast.error("Pilih mata kuliah terlebih dahulu");
      return;
    }
    const course = offering?.all_courses?.find((c) => c.id === selectedCourseId);
    if (!course) return;

    const code = course.code || course.kode;
    if (items.some((i) => i.course_code === code)) {
      toast.error("Mata kuliah ini sudah ada di dalam KRS Anda");
      return;
    }

    const sksNum = parseInt(course.total_sks || course.sks) || 3;
    const totalSKS = items.reduce((sum, item) => sum + item.sks, 0) + sksNum;
    if (totalSKS > 24) {
      toast.error("Total SKS melebihi batas maksimal 24 SKS");
      return;
    }

    setItems([...items, {
      course_id: course.id,
      course_code: code,
      course_name: course.name || course.nama,
      sks: sksNum,
    }]);
    setSelectedCourseId("");
    toast.success(`Mata kuliah ${code} - ${course.name || course.nama} ditambahkan`);
  };

  const handleRemoveItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmitKRS = async () => {
    if (items.length === 0) {
      toast.error("Pilih minimal 1 mata kuliah dalam KRS");
      return;
    }
    try {
      const res = await api.post(
        "/api/v1/krs/submit",
        { items },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.ok) {
        toast.success(res.data.message || "KRS berhasil diajukan ke Dosen Wali");
        fetchKRS();
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal mengajukan KRS"));
    }
  };

  const totalSKS = items.reduce((sum, item) => sum + (item.sks || 0), 0);
  const status = krs?.status || "draft";

  const getStatusBadge = (st) => {
    if (st === "approved") return <Badge className="bg-emerald-600 text-white">Disetujui Dosen Wali (ACC)</Badge>;
    if (st === "submitted") return <Badge className="bg-amber-500 text-white">Menunggu ACC Dosen Wali</Badge>;
    if (st === "rejected") return <Badge className="bg-red-600 text-white">Perlu Revisi</Badge>;
    return <Badge variant="outline">Draft Belum Diajukan</Badge>;
  };

  const studentInfo = offering?.student || {};
  const calcSem = offering?.calculated_semester || 1;

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-sky-600" />
            Kartu Rencana Studi (KRS Online)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Periode Akademik: <span className="font-semibold text-slate-700">{krs?.period_name || "2025/2026 Ganjil"}</span>
          </p>
        </div>
        <div>{getStatusBadge(status)}</div>
      </div>

      {/* Banner Identitas Mahasiswa & Semester Tempuh */}
      <Card className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white border-0">
        <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs text-sky-300 font-medium uppercase tracking-wider">Status Akademik Mahasiswa</span>
            <h3 className="text-xl font-bold">{user?.name} ({user?.nim || "NIM Mahasiswa"})</h3>
            <p className="text-sm text-slate-300">
              Angkatan <strong>{studentInfo.angkatan || "2023"}</strong> — Saat ini menempuh <strong>Semester {calcSem}</strong>
            </p>
            <p className="text-xs text-slate-400">
              Dosen Pembimbing Akademik (Wali): <strong>{studentInfo.dosen_wali_name || "Belum ditentukan"}</strong>
            </p>
          </div>

          {status !== "approved" && (
            <Button
              onClick={handleTakePaket}
              className="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold shadow-lg"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Ambil Paket Semester {calcSem} (1-Klik)
            </Button>
          )}
        </CardContent>
      </Card>

      {krs?.rejection_reason && (
        <Card className="border-red-200 bg-red-50 text-red-900">
          <CardContent className="p-4">
            <p className="font-semibold">Catatan Revisi dari Dosen Wali:</p>
            <p className="text-sm mt-1">{krs.rejection_reason}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Daftar Mata Kuliah Diambil</CardTitle>
              <span className="text-sm font-semibold text-slate-600">Total SKS: {totalSKS} / 24</span>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <p className="text-slate-400 text-sm">Belum ada mata kuliah yang dipilih pada draft KRS ini.</p>
                  {status !== "approved" && (
                    <Button variant="outline" size="sm" onClick={handleTakePaket}>
                      Klik "Ambil Paket Semester {calcSem}" di atas
                    </Button>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No</TableHead>
                      <TableHead>Kode</TableHead>
                      <TableHead>Nama Mata Kuliah</TableHead>
                      <TableHead className="text-center">SKS</TableHead>
                      {status !== "approved" && <TableHead className="text-right">Aksi</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs font-bold text-indigo-700">{item.course_code}</TableCell>
                        <TableCell className="font-medium">{item.course_name}</TableCell>
                        <TableCell className="text-center font-semibold">{item.sks}</TableCell>
                        {status !== "approved" && (
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-800" onClick={() => handleRemoveItem(idx)}>
                              Hapus
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {status !== "approved" && (
                <div className="mt-6 flex justify-end gap-3">
                  <Button onClick={handleSubmitKRS} disabled={items.length === 0} className="bg-sky-600 hover:bg-sky-700">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Kirim KRS ke Dosen Wali
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {status !== "approved" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-5 w-5 text-sky-600" />
                Pilih Dari Penawaran MK
              </CardTitle>
              <CardDescription>Pilih mata kuliah lain dari kurikulum prodi Anda.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddSelectedCourse} className="space-y-4">
                <div>
                  <Label>Mata Kuliah</Label>
                  <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 mt-1"
                  >
                    <option value="">-- Pilih Mata Kuliah --</option>
                    {offering?.all_courses?.map((c) => (
                      <option key={c.id} value={c.id}>
                        [{c.code || c.kode}] {c.name || c.nama} ({c.total_sks || c.sks || 3} SKS) - Sem {c.semester_paket || c.semester || 1}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" className="w-full" disabled={!selectedCourseId}>
                  + Tambah ke KRS
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export function KHSPage({ token, selectedSemester, tahunAjaran = [] }) {
  const [khs, setKhs] = useState(null);
  const [transkrip, setTranskrip] = useState([]);
  const [activeTab, setActiveTab] = useState("khs"); // "khs" | "transkrip"
  const [loading, setLoading] = useState(true);

  const targetTa = useMemo(() => {
    return (tahunAjaran || []).find((t) => String(t.id) === String(selectedSemester));
  }, [tahunAjaran, selectedSemester]);

  const semesterLabel = useMemo(() => {
    if (khs?.period_name) return khs.period_name;
    if (targetTa?.nama) return targetTa.nama;
    if (targetTa?.tahun && targetTa?.semester) return `${targetTa.tahun} ${targetTa.semester}`;
    if (selectedSemester && selectedSemester !== "all") return `Semester ${selectedSemester}`;
    return "Semester Terpilih";
  }, [khs, targetTa, selectedSemester]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = selectedSemester && selectedSemester !== "all" ? { academic_period_id: selectedSemester } : {};
        const resKHS = await api.get("/api/v1/krs/khs", {
          headers: { Authorization: `Bearer ${token}` },
          params,
        });
        if (resKHS.data.ok) setKhs(resKHS.data.khs);

        const resTrans = await api.get("/api/v1/krs/transkrip", { headers: { Authorization: `Bearer ${token}` } });
        if (resTrans.data.ok) setTranskrip(resTrans.data.transkrip || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token, selectedSemester]);

  const transkripGrouped = useMemo(() => {
    if (!transkrip || transkrip.length === 0) return [];
    const groups = {};
    transkrip.forEach((t) => {
      const key = t.semester_ke || 1;
      if (!groups[key]) {
        groups[key] = {
          semester_ke: key,
          nama_semester: t.nama_semester || `Semester ${key}`,
          semester_id: t.semester_id || "",
          courses: [],
          totalSks: 0,
          totalBobot: 0,
        };
      }
      groups[key].courses.push(t);
      const sks = parseFloat(t.sks) || 0;
      const pt = parseFloat(t.grade_point) || 0;
      if (t.grade_letter && t.grade_letter !== "E" && t.grade_letter !== "-") {
        groups[key].totalSks += sks;
        groups[key].totalBobot += sks * pt;
      }
    });

    return Object.values(groups).sort((a, b) => a.semester_ke - b.semester_ke);
  }, [transkrip]);

  const transkripStats = useMemo(() => {
    if (!transkrip || transkrip.length === 0) return { totalSks: 0, ipk: "0.00", totalMk: 0 };
    let totalSks = 0;
    let totalBobot = 0;
    let totalMk = 0;
    transkrip.forEach((t) => {
      const sks = parseFloat(t.sks) || 0;
      const pt = parseFloat(t.grade_point) || 0;
      if (t.grade_letter && t.grade_letter !== "E" && t.grade_letter !== "-") {
        totalSks += sks;
        totalBobot += sks * pt;
        totalMk += 1;
      }
    });
    const ipk = totalSks > 0 ? (totalBobot / totalSks).toFixed(2) : "0.00";
    return { totalSks, ipk, totalMk };
  }, [transkrip]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="h-7 w-7 text-emerald-600" />
            Kartu Hasil Studi (KHS) & Transkrip Nilai Kumulatif
          </h2>
          <p className="text-sm text-slate-500 mt-1">Rekapitulasi perolehan nilai, SKS kumulatif, dan legalitas yudisium resmi.</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab("khs")}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition ${activeTab === "khs" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            KHS ({semesterLabel})
          </button>
          <button
            onClick={() => setActiveTab("transkrip")}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition ${activeTab === "transkrip" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            Transkrip Kumulatif Akhir
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-5">
            <p className="text-xs uppercase font-semibold text-emerald-700">
              {activeTab === "khs" ? "Indeks Prestasi Semester (IPS)" : "Indeks Prestasi Kumulatif (IPK)"}
            </p>
            <p className="text-3xl font-bold text-emerald-950 mt-1">
              {activeTab === "khs" ? (khs?.ips?.toFixed(2) || "0.00") : (transkripStats.ipk || khs?.ipk?.toFixed(2) || "0.00")}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-sky-50 border-sky-200">
          <CardContent className="p-5">
            <p className="text-xs uppercase font-semibold text-sky-700">
              {activeTab === "khs" ? "Indeks Prestasi Kumulatif (IPK)" : "Total SKS Transkrip Lulus"}
            </p>
            <p className="text-3xl font-bold text-sky-950 mt-1">
              {activeTab === "khs" ? (khs?.ipk?.toFixed(2) || "0.00") : `${transkripStats.totalSks} SKS`}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-indigo-50 border-indigo-200">
          <CardContent className="p-5">
            <p className="text-xs uppercase font-semibold text-indigo-700">
              {activeTab === "khs" ? "Total SKS Tempuh Semester" : "Total Mata Kuliah Lulus"}
            </p>
            <p className="text-3xl font-bold text-indigo-950 mt-1">
              {activeTab === "khs" ? `${khs?.total_sks_semester || 0} SKS` : `${transkripStats.totalMk} MK`}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-5">
            <p className="text-xs uppercase font-semibold text-slate-700">Status Akademik</p>
            <Badge className="bg-emerald-600 text-white mt-2">Aktif / Memenuhi</Badge>
          </CardContent>
        </Card>
      </div>

      {activeTab === "khs" ? (
        <Card>
          <CardHeader>
            <CardTitle>Histori Nilai KHS — {semesterLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Mata Kuliah</TableHead>
                  <TableHead className="text-center">SKS</TableHead>
                  <TableHead className="text-center">Nilai Angka</TableHead>
                  <TableHead className="text-center">Nilai Huruf</TableHead>
                  <TableHead className="text-center">Bobot</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(khs?.grades || []).map((g, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs font-bold">{g.code || g.course_code || "-"}</TableCell>
                    <TableCell className="font-medium">{g.name || g.course_name || "-"}</TableCell>
                    <TableCell className="text-center">{g.sks || 0}</TableCell>
                    <TableCell className="text-center font-semibold">{g.score != null ? g.score : (g.final_score != null ? g.final_score : "-")}</TableCell>
                    <TableCell className="text-center">
                      <Badge className="bg-sky-100 text-sky-800">{g.letter || g.grade_letter || "-"}</Badge>
                    </TableCell>
                    <TableCell className="text-center font-medium">{g.point != null ? g.point : (g.grade_point != null ? g.grade_point : 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(!khs?.grades || khs.grades.length === 0) && (
              <p className="text-sm text-slate-500 text-center py-6">Belum ada nilai semester yang dipublikasikan.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-bold text-lg text-slate-900">Transkrip Nilai Kumulatif Per Semester ({transkripGrouped.length} Semester)</h3>
              <p className="text-xs text-slate-500">Daftar nilai seluruh semester perkuliahan yang telah diambil (Tersinkron Feeder PDDIKTI)</p>
            </div>
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 self-start sm:self-auto">
              Dokumen Resmi
            </Badge>
          </div>

          {transkripGrouped.map((grp) => {
            const semIps = grp.totalSks > 0 ? (grp.totalBobot / grp.totalSks).toFixed(2) : "0.00";
            return (
              <Card key={grp.semester_ke} className="border border-slate-200 overflow-hidden shadow-sm hover:shadow transition">
                <CardHeader className="bg-slate-50/90 border-b border-slate-200 py-3.5 px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-indigo-600 text-white font-bold text-sm shadow-sm">
                      {grp.semester_ke}
                    </span>
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900">{grp.nama_semester}</CardTitle>
                      <p className="text-[11px] text-slate-400 font-mono">Periode ID: {grp.semester_id || "-"}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs font-semibold">
                      {grp.courses.length} MK
                    </Badge>
                    <Badge className="bg-sky-50 text-sky-700 border-sky-200 text-xs font-semibold">
                      {grp.totalSks} SKS Lulus
                    </Badge>
                    <Badge className="bg-emerald-600 text-white text-xs font-bold px-2.5">
                      IPS Semester: {semIps}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-slate-100/50 text-xs text-slate-600">
                      <TableRow>
                        <TableHead className="w-12 text-center font-bold">#</TableHead>
                        <TableHead className="w-36 font-semibold">Kode MK</TableHead>
                        <TableHead className="font-semibold">Nama Mata Kuliah</TableHead>
                        <TableHead className="text-center font-semibold">SKS</TableHead>
                        <TableHead className="text-center font-semibold">Nilai Angka</TableHead>
                        <TableHead className="text-center font-semibold">Nilai Huruf</TableHead>
                        <TableHead className="text-center font-semibold">Bobot</TableHead>
                        <TableHead className="font-semibold">Asal Nilai Feeder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grp.courses.map((t, idx) => (
                        <TableRow key={idx} className="hover:bg-slate-50/70 text-xs transition">
                          <TableCell className="text-center font-bold text-slate-400">{idx + 1}</TableCell>
                          <TableCell className="font-mono font-bold text-indigo-700">{t.course_code}</TableCell>
                          <TableCell className="font-semibold text-slate-900">{t.course_name}</TableCell>
                          <TableCell className="text-center font-medium text-slate-700">{t.sks}</TableCell>
                          <TableCell className="text-center font-semibold text-slate-700">{t.score !== null && t.score !== undefined ? t.score : "-"}</TableCell>
                          <TableCell className="text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${t.grade_letter === 'A' || t.grade_letter === 'A-' ? 'bg-emerald-100 text-emerald-800' : t.grade_letter === 'B+' || t.grade_letter === 'B' ? 'bg-sky-100 text-sky-800' : t.grade_letter === 'E' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-800'}`}>
                              {t.grade_letter || "-"}
                            </span>
                          </TableCell>
                          <TableCell className="text-center font-medium text-slate-800">{t.grade_point !== null && t.grade_point !== undefined ? t.grade_point.toFixed(1) : "-"}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${t.asal_nilai?.includes("Konversi") ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                              {t.asal_nilai || "Perkuliahan Reguler"}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}

          {transkripGrouped.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-slate-500">
                Belum ada record transkrip kumulatif per semester dari Feeder PDDIKTI.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export function KeuanganPage({ user, token }) {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState(null);

  const fetchBills = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/v1/keuangan/my-bills", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.ok) setBills(res.data.bills);
    } catch (err) {
      console.error(err);
      toast.error("Gagal memuat daftar tagihan UKT");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
  }, []);

  const handlePay = async (billId, amount) => {
    try {
      const res = await api.post(
        "/api/v1/keuangan/pay",
        { bill_id: billId, amount, payment_method: "QRIS" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.ok) {
        toast.success("Pembayaran tagihan berhasil dikonfirmasi!");
        setSelectedBill(null);
        fetchBills();
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal memproses pembayaran"));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="h-7 w-7 text-indigo-600" />
          Tagihan UKT & Biaya Pendidikan
        </h2>
        <p className="text-sm text-slate-500 mt-1">Pantau status kelunasan tagihan pembayaran registrasi akademik Anda.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {bills.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-slate-400 bg-white rounded-lg border border-slate-200">
            Belum ada tagihan aktif untuk akun ini.
          </div>
        ) : (
          bills.map((bill) => {
            const isPaid = bill.status === "paid";
            return (
              <Card key={bill.id} className={`border-2 ${isPaid ? "border-emerald-200" : "border-amber-200 bg-amber-50/30"}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Badge className={isPaid ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"}>
                      {isPaid ? "LUNAS" : "BELUM LUNAS"}
                    </Badge>
                    <span className="text-xs text-slate-500 font-mono">ID: {bill.id.slice(-6)}</span>
                  </div>
                  <CardTitle className="text-lg mt-2">{bill.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-500 uppercase">Nominal Tagihan</p>
                    <p className="text-2xl font-bold text-slate-950">
                      Rp {Number(bill.amount).toLocaleString("id-ID")}
                    </p>
                  </div>

                  {!isPaid && (
                    <Button onClick={() => setSelectedBill(bill)} className="w-full bg-indigo-600 hover:bg-indigo-700 mt-4">
                      <CreditCard className="mr-2 h-4 w-4" /> Bayar Tagihan
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {selectedBill && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <QrCode className="h-6 w-6 text-indigo-600" />
                Konfirmasi Pembayaran
              </CardTitle>
              <CardDescription>{selectedBill.title}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-slate-100 rounded-lg text-center font-mono">
                <p className="text-xs text-slate-500 uppercase">Total Dibayar</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  Rp {Number(selectedBill.amount).toLocaleString("id-ID")}
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="w-1/2" onClick={() => setSelectedBill(null)}>
                  Batal
                </Button>
                <Button className="w-1/2 bg-emerald-600 hover:bg-emerald-700" onClick={() => handlePay(selectedBill.id, selectedBill.amount)}>
                  Simulasi Bayar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export function PerwalianKRSPage({ token }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/v1/akademik/students/pa", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.ok) setStudents(res.data.students || []);
    } catch (err) {
      console.error(err);
      toast.error("Gagal memuat daftar mahasiswa bimbingan PA");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const krsStatus = (st) => {
    const s = (st || {}).status || "draft";
    if (s === "approved") return { label: "Disetujui (ACC)", cls: "bg-emerald-600 text-white" };
    if (s === "submitted") return { label: "Menunggu ACC", cls: "bg-amber-500 text-white" };
    if (s === "rejected") return { label: "Perlu Revisi", cls: "bg-red-600 text-white" };
    return { label: "Draft (belum diajukan)", cls: "" };
  };

  const doApprove = async (st) => {
    const krsId = st?.krs?.id;
    if (!krsId) {
      toast.error("Mahasiswa belum mengajukan KRS");
      return;
    }
    setProcessing(krsId);
    try {
      const res = await api.post(
        "/api/v1/krs/approve",
        { krs_id: krsId, action: "approve" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(res.data.message || "KRS disetujui");
      const en = res.data.enrollment;
      if (en?.enrolled?.length) {
        toast.info(`Mahasiswa otomatis didaftarkan ke ${en.enrolled.length} kelas rombel`);
      } else if (en?.skipped?.length) {
        toast.warning(`${en.skipped.length} MK belum punya kelas rombel`);
      }
      fetchStudents();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal menyetujui KRS"));
    } finally {
      setProcessing("");
    }
  };

  const doReject = async () => {
    const st = rejectTarget;
    const krsId = st?.krs?.id;
    if (!krsId) return;
    setProcessing(krsId);
    try {
      const res = await api.post(
        "/api/v1/krs/approve",
        { krs_id: krsId, action: "reject", rejection_reason: rejectReason.trim() || "KRS perlu direvisi" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(res.data.message || "KRS ditolak dan dikembalikan");
      setRejectTarget(null);
      setRejectReason("");
      fetchStudents();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal menolak KRS"));
    } finally {
      setProcessing("");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-sky-600" />
          Perwalian Akademik (ACC KRS Dosen PA)
        </h2>
        <p className="text-sm text-slate-500 mt-1">Verifikasi dan setujui draft pengajuan KRS mahasiswa bimbingan Anda.</p>
      </div>

      {rejectTarget && (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="font-semibold text-red-900">Tolak KRS — {rejectTarget.name} ({rejectTarget.nim || "-"})</p>
              <p className="text-xs text-red-700/80 mt-0.5">Mahasiswa akan melihat alasan ini dan dapat merevisi KRS.</p>
            </div>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Alasan penolakan (misal: ada MK yang tidak sesuai semester)"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setRejectTarget(null); setRejectReason(""); }} disabled={!!processing}>
                Batal
              </Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={doReject} disabled={!!processing}>
                {processing ? "Memproses..." : "Tolak KRS"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Daftar Mahasiswa Bimbingan PA</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-slate-400">Memuat data...</p>
          ) : students.length === 0 ? (
            <p className="text-center py-8 text-slate-400">Belum ada mahasiswa yang ditugaskan ke Dosen PA Anda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NIM</TableHead>
                  <TableHead>Nama Mahasiswa</TableHead>
                  <TableHead>Status KRS</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((st) => {
                  const status = krsStatus(st.krs);
                  const submitted = st.krs?.status === "submitted";
                  const busy = processing === st.krs?.id;
                  return (
                    <TableRow key={st.id}>
                      <TableCell className="font-mono text-xs font-bold">{st.nim || "-"}</TableCell>
                      <TableCell className="font-medium">{st.name}</TableCell>
                      <TableCell>
                        {status.cls ? (
                          <Badge className={status.cls}>{status.label}</Badge>
                        ) : (
                          <Badge variant="outline">{status.label}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => doApprove(st)}
                            disabled={!submitted || !!busy}
                          >
                            <UserCheck className="mr-1 h-3.5 w-3.5" /> ACC KRS
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-300 hover:bg-red-50"
                            onClick={() => setRejectTarget(st)}
                            disabled={!submitted || !!busy}
                          >
                            Tolak
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
