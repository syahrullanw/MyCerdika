import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") || window.location.origin;
const api = axios.create({ baseURL: BACKEND_URL });
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  UserCheck,
  Banknote,
  ReceiptText
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
  const isAdmin = user?.role === "admin";
  const auth = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
  const [components, setComponents] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [students, setStudents] = useState([]);
  const [dashboard, setDashboard] = useState({});
  const [clearance, setClearance] = useState(null);
  const [tab, setTab] = useState("bills");
  const [selectedBill, setSelectedBill] = useState(null);
  const [selectedSchemeId, setSelectedSchemeId] = useState("");
  const [paymentForm, setPaymentForm] = useState({ amount: "", payment_method: "TRANSFER", reference_number: "", proof_url: "", notes: "" });
  const [adjustmentForm, setAdjustmentForm] = useState({ adjustment_type: "discount", amount: "", reason: "", component_id: "" });
  const [componentForm, setComponentForm] = useState({ code: "", name: "", category: "tuition", default_amount: "", scholarship_eligible: true, discount_eligible: true });
  const [schemeForm, setSchemeForm] = useState({ code: "", name: "", academic_year: "", prodi_id: "", krs_min_payment_percent: 0, uts_min_payment_percent: 45, uas_min_payment_percent: 100 });
  const [ruleForm, setRuleForm] = useState({ component_id: "", amount: "", quantity: 1, charge_stage: "registration" });
  const [manualForm, setManualForm] = useState({ student_id: "", academic_period_id: "", title: "", amount: "", due_date: "", installment_count: 1 });
  const [generateForm, setGenerateForm] = useState({ scheme_id: "", academic_period_id: "", due_date: "", installment_count: 1 });

  const rupiah = (value) => `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
  const statusTone = (status) => ({
    paid: "bg-emerald-600 text-white",
    partial: "bg-sky-600 text-white",
    awaiting_verification: "bg-amber-500 text-white",
    rejected: "bg-rose-600 text-white",
  }[status] || "bg-slate-500 text-white");
  const statusLabel = (status) => ({
    paid: "Lunas", partial: "Sebagian", awaiting_verification: "Menunggu Verifikasi",
    unpaid: "Belum Lunas", overdue: "Jatuh Tempo", pending: "Menunggu Verifikasi", rejected: "Ditolak",
  }[status] || status || "—");

  const load = async () => {
    try {
      setLoading(true);
      if (isAdmin) {
        const [billRes, componentRes, schemeRes, periodRes, studentRes, dashboardRes] = await Promise.all([
          api.get("/api/v1/keuangan/bills", auth),
          api.get("/api/v1/keuangan/components", auth),
          api.get("/api/v1/keuangan/schemes", auth),
          api.get("/api/v1/keuangan/periods", auth),
          api.get("/api/v1/keuangan/students", auth),
          api.get("/api/v1/keuangan/dashboard", auth),
        ]);
        setBills(billRes.data.bills || []);
        setComponents(componentRes.data.items || []);
        setSchemes(schemeRes.data.items || []);
        setPeriods(periodRes.data.items || []);
        setStudents(studentRes.data.items || []);
        setDashboard(dashboardRes.data || {});
      } else {
        const [billRes, clearanceRes] = await Promise.all([
          api.get("/api/v1/keuangan/my-bills", auth),
          api.get("/api/v1/keuangan/my-clearance?stage=krs", auth),
        ]);
        setBills(billRes.data.bills || []);
        setClearance(clearanceRes.data.clearance || null);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal memuat data pembiayaan"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token, isAdmin]);

  const submitPayment = async (event) => {
    event.preventDefault();
    if (!selectedBill) return;
    try {
      await api.post("/api/v1/keuangan/pay", {
        bill_id: selectedBill.id,
        ...paymentForm,
        amount: Number(paymentForm.amount || 0),
      }, auth);
      toast.success("Pengajuan pembayaran dikirim ke bendahara untuk diverifikasi");
      setSelectedBill(null);
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Pengajuan pembayaran gagal"));
    }
  };

  const saveComponent = async (event) => {
    event.preventDefault();
    try {
      await api.post("/api/v1/keuangan/components", { ...componentForm, default_amount: Number(componentForm.default_amount || 0) }, auth);
      setComponentForm({ code: "", name: "", category: "tuition", default_amount: "", scholarship_eligible: true, discount_eligible: true });
      toast.success("Komponen biaya ditambahkan");
      await load();
    } catch (err) { toast.error(apiErrorMessage(err, "Komponen biaya gagal disimpan")); }
  };

  const saveScheme = async (event) => {
    event.preventDefault();
    try {
      const res = await api.post("/api/v1/keuangan/schemes", schemeForm, auth);
      setSelectedSchemeId(res.data.scheme?.id || "");
      setGenerateForm((prev) => ({ ...prev, scheme_id: res.data.scheme?.id || prev.scheme_id }));
      setSchemeForm({ code: "", name: "", academic_year: "", prodi_id: "", krs_min_payment_percent: 0, uts_min_payment_percent: 45, uas_min_payment_percent: 100 });
      toast.success("Skema pembiayaan ditambahkan");
      await load();
    } catch (err) { toast.error(apiErrorMessage(err, "Skema pembiayaan gagal disimpan")); }
  };

  const saveRule = async (event) => {
    event.preventDefault();
    if (!selectedSchemeId) return toast.error("Pilih skema pembiayaan terlebih dahulu");
    try {
      await api.post(`/api/v1/keuangan/schemes/${selectedSchemeId}/rules`, { ...ruleForm, amount: Number(ruleForm.amount || 0), quantity: Number(ruleForm.quantity || 1) }, auth);
      setRuleForm({ component_id: "", amount: "", quantity: 1, charge_stage: "registration" });
      toast.success("Aturan tarif ditambahkan");
      await load();
    } catch (err) { toast.error(apiErrorMessage(err, "Aturan tarif gagal disimpan")); }
  };

  const createManualBill = async (event) => {
    event.preventDefault();
    try {
      await api.post("/api/v1/keuangan/bills", { ...manualForm, amount: Number(manualForm.amount || 0), installment_count: Number(manualForm.installment_count || 1) }, auth);
      setManualForm({ student_id: "", academic_period_id: "", title: "", amount: "", due_date: "", installment_count: 1 });
      toast.success("Tagihan manual dibuat");
      await load();
    } catch (err) { toast.error(apiErrorMessage(err, "Tagihan manual gagal dibuat")); }
  };

  const generateBills = async (event) => {
    event.preventDefault();
    try {
      const res = await api.post("/api/v1/keuangan/generate", { ...generateForm, installment_count: Number(generateForm.installment_count || 1) }, auth);
      toast.success(res.data.message || "Tagihan berhasil digenerate");
      await load();
    } catch (err) { toast.error(apiErrorMessage(err, "Generator tagihan gagal dijalankan")); }
  };

  const verifyPayment = async (paymentId, action) => {
    try {
      await api.post(`/api/v1/keuangan/payments/${paymentId}/verify`, { action }, auth);
      toast.success(action === "approve" ? "Pembayaran diverifikasi" : "Pembayaran ditolak");
      await load();
    } catch (err) { toast.error(apiErrorMessage(err, "Verifikasi pembayaran gagal")); }
  };

  const submitAdjustment = async (event) => {
    event.preventDefault();
    if (!selectedBill) return;
    try {
      const res = await api.post(`/api/v1/keuangan/bills/${selectedBill.id}/adjustments`, {
        ...adjustmentForm,
        amount: Number(adjustmentForm.amount || 0),
      }, auth);
      setSelectedBill(res.data.bill || selectedBill);
      setAdjustmentForm({ adjustment_type: "discount", amount: "", reason: "", component_id: "" });
      toast.success("Penyesuaian tagihan disimpan");
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Penyesuaian tagihan gagal disimpan"));
    }
  };

  const openBill = (bill) => {
    setSelectedBill(bill);
    setPaymentForm({ amount: String(bill.remaining_amount ?? Math.max((bill.amount || 0) - (bill.paid_amount || 0), 0)), payment_method: "TRANSFER", reference_number: "", proof_url: "", notes: "" });
    setAdjustmentForm({ adjustment_type: "discount", amount: "", reason: "", component_id: "" });
  };

  const selectedScheme = schemes.find((scheme) => scheme.id === selectedSchemeId);
  const summary = dashboard.summary || {};

  if (loading) return <div className="py-16 text-center text-slate-500">Memuat data pembiayaan…</div>;

  const BillsTable = () => (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-slate-50">
        <CardTitle className="text-base">Tagihan Mahasiswa</CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Mahasiswa / Tagihan</TableHead><TableHead>Periode</TableHead><TableHead>Tagihan</TableHead><TableHead>Terbayar</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {bills.length === 0 ? <TableRow><TableCell colSpan={6} className="h-28 text-center text-slate-400">Belum ada tagihan.</TableCell></TableRow> : bills.map((bill) => (
              <TableRow key={bill.id}>
                <TableCell><p className="font-semibold">{isAdmin ? bill.student_name : bill.title}</p><p className="text-xs text-slate-500">{isAdmin ? bill.nim : bill.academic_period_name}</p></TableCell>
                <TableCell className="text-xs">{bill.academic_period_name || bill.academic_period_id}</TableCell>
                <TableCell className="font-semibold">{rupiah(bill.amount)}</TableCell>
                <TableCell>{rupiah(bill.paid_amount)}<p className="text-[11px] text-slate-500">Sisa {rupiah(bill.remaining_amount)}</p></TableCell>
                <TableCell><Badge className={statusTone(bill.status)}>{statusLabel(bill.status)}</Badge></TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => openBill(bill)}>{isAdmin ? "Rincian" : "Lihat / Bayar"}</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 flex items-center gap-2"><Banknote className="h-7 w-7 text-indigo-600" /> Pembiayaan Mahasiswa</h2>
          <p className="text-sm text-slate-500 mt-1">Tagihan berkomponen, beasiswa/potongan, cicilan, serta verifikasi pembayaran.</p>
        </div>
        {!isAdmin && clearance && <Badge className={clearance.is_clear ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"}>Clearance KRS: {clearance.paid_percent}% / min. {clearance.required_percent}%</Badge>}
      </div>

      {isAdmin ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[["Total Tagihan", summary.total_billed], ["Terverifikasi", summary.total_paid], ["Sisa", summary.total_outstanding], ["Menunggu Verifikasi", summary.pending_payment_amount]].map(([label, value]) => (
              <Card key={label}><CardContent className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="text-lg font-bold mt-1">{rupiah(value)}</p></CardContent></Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-b pb-3">
            {[['bills', 'Tagihan'], ['schemes', 'Skema & Tarif'], ['verification', `Verifikasi (${summary.pending_payment_count || 0})`]].map(([id, label]) => <Button key={id} size="sm" variant={tab === id ? "default" : "outline"} onClick={() => setTab(id)}>{label}</Button>)}
          </div>

          {tab === "bills" && <div className="space-y-5">
            <div className="grid lg:grid-cols-2 gap-5">
              <Card><CardHeader><CardTitle className="text-base">Generate Tagihan dari Skema</CardTitle><CardDescription>Membuat item tagihan sesuai prodi dan periode, satu kali untuk tiap mahasiswa.</CardDescription></CardHeader><CardContent>
                <form onSubmit={generateBills} className="grid gap-3 sm:grid-cols-2">
                  <select className="border rounded-md px-3 h-10" required value={generateForm.scheme_id} onChange={(e) => setGenerateForm({ ...generateForm, scheme_id: e.target.value })}><option value="">Pilih skema</option>{schemes.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}</select>
                  <select className="border rounded-md px-3 h-10" value={generateForm.academic_period_id} onChange={(e) => setGenerateForm({ ...generateForm, academic_period_id: e.target.value })}><option value="">Periode aktif</option>{periods.map((p) => <option key={p.id} value={p.id}>{p.name || p.code}</option>)}</select>
                  <Input type="date" value={generateForm.due_date} onChange={(e) => setGenerateForm({ ...generateForm, due_date: e.target.value })} />
                  <Input type="number" min="1" max="24" value={generateForm.installment_count} onChange={(e) => setGenerateForm({ ...generateForm, installment_count: e.target.value })} placeholder="Jumlah cicilan" />
                  <Button className="sm:col-span-2"><Banknote className="h-4 w-4 mr-2" />Generate Tagihan</Button>
                </form>
              </CardContent></Card>
              <Card><CardHeader><CardTitle className="text-base">Tagihan Manual / Dispensasi</CardTitle><CardDescription>Untuk biaya insidental atau tagihan custom mahasiswa tertentu.</CardDescription></CardHeader><CardContent>
                <form onSubmit={createManualBill} className="grid gap-3 sm:grid-cols-2">
                  <select className="border rounded-md px-3 h-10 sm:col-span-2" required value={manualForm.student_id} onChange={(e) => setManualForm({ ...manualForm, student_id: e.target.value })}><option value="">Pilih mahasiswa</option>{students.map((s) => <option key={s.id} value={s.id}>{s.nim} — {s.name}</option>)}</select>
                  <Input required value={manualForm.title} onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })} placeholder="Nama tagihan" />
                  <Input required type="number" min="0" value={manualForm.amount} onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })} placeholder="Nominal" />
                  <select className="border rounded-md px-3 h-10" value={manualForm.academic_period_id} onChange={(e) => setManualForm({ ...manualForm, academic_period_id: e.target.value })}><option value="">Periode aktif</option>{periods.map((p) => <option key={p.id} value={p.id}>{p.name || p.code}</option>)}</select>
                  <Input type="date" value={manualForm.due_date} onChange={(e) => setManualForm({ ...manualForm, due_date: e.target.value })} />
                  <Button className="sm:col-span-2">Buat Tagihan Manual</Button>
                </form>
              </CardContent></Card>
            </div>
            <BillsTable />
          </div>}

          {tab === "schemes" && <div className="space-y-5">
            <div className="grid lg:grid-cols-2 gap-5">
              <Card><CardHeader><CardTitle className="text-base">Master Komponen Biaya</CardTitle></CardHeader><CardContent className="space-y-4">
                <form onSubmit={saveComponent} className="grid gap-3 sm:grid-cols-2">
                  <Input required value={componentForm.code} onChange={(e) => setComponentForm({ ...componentForm, code: e.target.value })} placeholder="Kode, mis. UKT" />
                  <Input required value={componentForm.name} onChange={(e) => setComponentForm({ ...componentForm, name: e.target.value })} placeholder="Nama komponen" />
                  <Input type="number" min="0" value={componentForm.default_amount} onChange={(e) => setComponentForm({ ...componentForm, default_amount: e.target.value })} placeholder="Nominal default" />
                  <select className="border rounded-md px-3 h-10" value={componentForm.category} onChange={(e) => setComponentForm({ ...componentForm, category: e.target.value })}><option value="tuition">Kuliah / UKT</option><option value="admission">Pendaftaran</option><option value="facility">Sarana</option><option value="academic">Akademik</option></select>
                  <Button className="sm:col-span-2"><Plus className="h-4 w-4 mr-2" />Tambah Komponen</Button>
                </form>
                <div className="max-h-64 overflow-auto border rounded-md divide-y">{components.length ? components.map((component) => <div key={component.id} className="p-2 flex justify-between text-sm"><span><strong>{component.code}</strong> · {component.name}</span><span>{rupiah(component.default_amount)}</span></div>) : <p className="p-4 text-sm text-slate-400">Belum ada komponen.</p>}</div>
              </CardContent></Card>
              <Card><CardHeader><CardTitle className="text-base">Skema Pembiayaan / BIPOT</CardTitle></CardHeader><CardContent>
                <form onSubmit={saveScheme} className="grid gap-3 sm:grid-cols-2">
                  <Input required value={schemeForm.code} onChange={(e) => setSchemeForm({ ...schemeForm, code: e.target.value })} placeholder="Kode skema" />
                  <Input required value={schemeForm.name} onChange={(e) => setSchemeForm({ ...schemeForm, name: e.target.value })} placeholder="Nama skema" />
                  <Input value={schemeForm.academic_year} onChange={(e) => setSchemeForm({ ...schemeForm, academic_year: e.target.value })} placeholder="Tahun, mis. 2026/2027" />
                  <Input value={schemeForm.prodi_id} onChange={(e) => setSchemeForm({ ...schemeForm, prodi_id: e.target.value })} placeholder="ID Program Studi (opsional)" />
                  {[['krs_min_payment_percent', 'Min. KRS %'], ['uts_min_payment_percent', 'Min. UTS %'], ['uas_min_payment_percent', 'Min. UAS %']].map(([field, label]) => <Input key={field} type="number" min="0" max="100" value={schemeForm[field]} onChange={(e) => setSchemeForm({ ...schemeForm, [field]: Number(e.target.value) })} placeholder={label} />)}
                  <Button className="sm:col-span-2">Simpan Skema</Button>
                </form>
              </CardContent></Card>
            </div>
            <Card><CardHeader><CardTitle className="text-base">Aturan Tarif Skema</CardTitle><CardDescription>Pilih skema lalu tambahkan komponen. Ini setara BIPOT2 pada sistem lama.</CardDescription></CardHeader><CardContent className="space-y-4">
              <select className="border rounded-md px-3 h-10 w-full" value={selectedSchemeId} onChange={(e) => setSelectedSchemeId(e.target.value)}><option value="">Pilih skema untuk dikelola</option>{schemes.map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.code} — {scheme.name}</option>)}</select>
              {selectedScheme && <><form onSubmit={saveRule} className="grid gap-3 sm:grid-cols-4"><select className="border rounded-md px-3 h-10" required value={ruleForm.component_id} onChange={(e) => setRuleForm({ ...ruleForm, component_id: e.target.value })}><option value="">Komponen</option>{components.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><Input required type="number" min="0" value={ruleForm.amount} onChange={(e) => setRuleForm({ ...ruleForm, amount: e.target.value })} placeholder="Nominal" /><Input type="number" min="1" value={ruleForm.quantity} onChange={(e) => setRuleForm({ ...ruleForm, quantity: e.target.value })} placeholder="Qty" /><Button>Tambah Tarif</Button></form><div className="border rounded-md divide-y">{(selectedScheme.rules || []).map((rule) => <div className="p-3 flex justify-between text-sm" key={rule.id}><span>{rule.component_name} <span className="text-slate-400">· {rule.charge_stage}</span></span><strong>{rupiah(rule.amount * rule.quantity)}</strong></div>)}{!(selectedScheme.rules || []).length && <p className="p-4 text-sm text-slate-400">Belum ada aturan tarif.</p>}</div></>}
            </CardContent></Card>
          </div>}

          {tab === "verification" && <Card><CardHeader><CardTitle className="text-base">Verifikasi Pembayaran</CardTitle><CardDescription>Pembayaran baru memengaruhi kelunasan setelah disetujui bendahara.</CardDescription></CardHeader><CardContent className="p-0 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Mahasiswa</TableHead><TableHead>Nominal</TableHead><TableHead>Metode / Referensi</TableHead><TableHead>Bukti</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader><TableBody>{(dashboard.pending_payments || []).length ? dashboard.pending_payments.map((payment) => <TableRow key={payment.id}><TableCell><strong>{payment.student_name}</strong><p className="text-xs text-slate-500">{payment.nim}</p></TableCell><TableCell>{rupiah(payment.amount)}</TableCell><TableCell>{payment.payment_method}<p className="text-xs text-slate-500">{payment.reference_number || "—"}</p></TableCell><TableCell>{payment.proof_url ? <a href={payment.proof_url} target="_blank" rel="noreferrer" className="text-indigo-600 underline">Buka bukti</a> : "—"}</TableCell><TableCell className="space-x-2"><Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => verifyPayment(payment.id, "approve")}>Setujui</Button><Button size="sm" variant="outline" className="text-rose-600" onClick={() => verifyPayment(payment.id, "reject")}>Tolak</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="h-28 text-center text-slate-400">Tidak ada pembayaran yang menunggu verifikasi.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>}
        </>
      ) : <BillsTable />}

      {selectedBill && <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"><Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg flex items-center gap-2"><ReceiptText className="h-5 w-5 text-indigo-600" />{selectedBill.title}</CardTitle><CardDescription>{selectedBill.academic_period_name || selectedBill.academic_period_id}</CardDescription></div><Badge className={statusTone(selectedBill.status)}>{statusLabel(selectedBill.status)}</Badge></div></CardHeader><CardContent className="space-y-5"><div className="grid grid-cols-3 gap-3 text-sm"><div className="rounded-md bg-slate-50 p-3"><p className="text-xs text-slate-500">Tagihan</p><strong>{rupiah(selectedBill.amount)}</strong></div><div className="rounded-md bg-slate-50 p-3"><p className="text-xs text-slate-500">Terbayar</p><strong>{rupiah(selectedBill.paid_amount)}</strong></div><div className="rounded-md bg-slate-50 p-3"><p className="text-xs text-slate-500">Sisa</p><strong>{rupiah(selectedBill.remaining_amount)}</strong></div></div><div className="border rounded-md divide-y">{(selectedBill.items || []).map((item) => <div key={item.id} className="flex justify-between p-3 text-sm"><span>{item.component_name}<small className="block text-slate-500">{item.status === "paid" ? "Lunas" : `Terbayar ${rupiah(item.paid_amount)}`}</small></span><strong>{rupiah(item.net_amount)}</strong></div>)}</div>{(selectedBill.installments || []).length > 1 && <p className="text-xs text-slate-500">Cicilan: {(selectedBill.installments || []).map((item) => `${item.sequence}. ${rupiah(item.amount)}`).join(" · ")}</p>}{!isAdmin && selectedBill.status !== "paid" && <form onSubmit={submitPayment} className="border-t pt-4 space-y-3"><h3 className="font-semibold text-sm">Ajukan Pembayaran</h3><div className="grid sm:grid-cols-2 gap-3"><div><Label>Nominal</Label><Input required type="number" min="1" max={selectedBill.remaining_amount} value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} /></div><div><Label>Metode</Label><select className="border rounded-md px-3 h-10 w-full" value={paymentForm.payment_method} onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}>{["TRANSFER", "QRIS", "VA_BCA", "VA_MANDIRI", "CASH", "MANUAL"].map((method) => <option key={method} value={method}>{method}</option>)}</select></div><div><Label>No. Referensi</Label><Input value={paymentForm.reference_number} onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })} placeholder="No. transfer / VA" /></div><div><Label>URL Bukti Bayar</Label><Input value={paymentForm.proof_url} onChange={(e) => setPaymentForm({ ...paymentForm, proof_url: e.target.value })} placeholder="https://…" /></div></div><Textarea value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} placeholder="Catatan untuk bendahara (opsional)" /><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSelectedBill(null)}>Tutup</Button><Button className="bg-indigo-600"><CreditCard className="h-4 w-4 mr-2" />Ajukan Pembayaran</Button></div></form>}{isAdmin && <div className="border-t pt-4 space-y-3"><h3 className="font-semibold text-sm">Potongan, Beasiswa, atau Pembebasan</h3>{selectedBill.paid_amount > 0 ? <p className="text-xs text-slate-500">Penyesuaian dikunci setelah ada pembayaran yang terverifikasi.</p> : <form onSubmit={submitAdjustment} className="grid sm:grid-cols-2 gap-3"><select className="border rounded-md px-3 h-10" value={adjustmentForm.adjustment_type} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, adjustment_type: e.target.value })}><option value="discount">Potongan</option><option value="scholarship">Beasiswa</option><option value="waiver">Pembebasan</option></select><select className="border rounded-md px-3 h-10" value={adjustmentForm.component_id} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, component_id: e.target.value })}><option value="">Semua komponen yang memenuhi syarat</option>{(selectedBill.items || []).map((item) => <option key={item.id} value={item.component_id}>{item.component_name}</option>)}</select><Input required type="number" min="1" value={adjustmentForm.amount} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, amount: e.target.value })} placeholder="Nominal penyesuaian" /><Input required value={adjustmentForm.reason} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })} placeholder="Dasar / keterangan" /><Button className="sm:col-span-2">Simpan Penyesuaian</Button></form>}<div className="flex justify-end"><Button variant="outline" onClick={() => setSelectedBill(null)}>Tutup</Button></div></div>}</CardContent></Card></div>}
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
