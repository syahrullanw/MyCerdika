import React, { useState, useEffect, useMemo, useRef } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { apiErrorMessage } from "@/lib/utils";
import {
  User,
  CreditCard,
  Building,
  Printer,
  FileCheck,
  RefreshCw,
  Plus,
  Trash2,
  Edit3,
  Sliders,
  DollarSign,
  BarChart3,
  Shirt,
  Sparkles,
  Gift,
  CheckCircle2,
  XCircle,
  Eye,
  GraduationCap,
  TrendingUp,
  Users,
  Monitor,
  Rocket,
  FileText,
  Settings,
  Check,
  Pencil,
  X,
  ClipboardList,
  MonitorSmartphone,
  FileUp
} from "lucide-react";
import { PmbAnalyticsTab } from "./PmbAnalyticsTab";
import { PmbReferralsTab } from "./PmbReferralsTab";
import { PmbExecutiveReportTab } from "./PmbExecutiveReportTab";
import { PmbLandingCustomizerTab } from "./PmbLandingCustomizerTab";
import { PmbTestSessionsTab } from "./PmbTestSessionsTab";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") || window.location.origin;
const api = axios.create({ baseURL: BACKEND_URL });

function formatRupiah(num) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num || 0);
}

export function AdminPmbHub({ token: propToken, user, programs: initialPrograms = [] }) {
  const token = propToken || (typeof window !== "undefined" ? localStorage.getItem("token") || "" : "");
  const [activeTab, setActiveTab] = useState("overview"); // overview, customizer, analytics, referrals, applicants, cbt_bank, test_sessions, reregistration, conversion, final_report, settings
  const [stats, setStats] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [settings, setSettings] = useState(null);
  const [programsList, setProgramsList] = useState(initialPrograms);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [search, setSearch] = useState("");
  const [prodiFilter, setProdiFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");

  // Modals
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [offlineScoreModal, setOfflineScoreModal] = useState(null);
  const [offlineScore, setOfflineScore] = useState(80);
  const [offlineNotes, setOfflineNotes] = useState("");

  // Question Form Modal
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [questionForm, setQuestionForm] = useState({
    q_type: "pg",
    category: "Penalaran Umum (TPA)",
    question: "",
    options: [
      { key: "A", text: "" },
      { key: "B", text: "" },
      { key: "C", text: "" },
      { key: "D", text: "" }
    ],
    correct_answer: "A",
    weight: 10,
  });
  const importFileRef = useRef(null);
  const [importing, setImporting] = useState(false);

  const handleImportExcel = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/api/v1/pmb/admin/questions/import", fd, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.ok) {
        toast.success(res.data.message || "Soal berhasil diimpor");
        const warning = res.data.errors?.filter(Boolean);
        if (warning?.length) {
          toast.error(`Sebagian baris gagal: ${warning.join("; ")}`);
        }
        fetchData();
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal mengimpor file Excel"));
    } finally {
      setImporting(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
      const [statsRes, appRes, qRes, setRes, pubConfig] = await Promise.all([
        api.get("/api/v1/pmb/admin/stats", authHeaders).catch((e) => ({ data: { ok: false, error: e } })),
        api.get("/api/v1/pmb/admin/applicants", authHeaders).catch((e) => ({ data: { ok: false, error: e } })),
        api.get("/api/v1/pmb/admin/questions", authHeaders).catch((e) => ({ data: { ok: false, error: e } })),
        api.get("/api/v1/pmb/admin/settings", authHeaders).catch((e) => ({ data: { ok: false, error: e } })),
        api.get("/api/v1/pmb/public/config").catch(() => ({ data: { programs: [] } }))
      ]);

      if (statsRes.data?.ok) setStats(statsRes.data);
      if (appRes.data?.ok) setApplicants(appRes.data.applicants || []);
      if (qRes.data?.ok) setQuestions(qRes.data.questions || []);
      if (setRes.data?.ok) setSettings(setRes.data.settings);
      if (pubConfig.data?.programs?.length > 0) {
        setProgramsList(pubConfig.data.programs);
      } else if (initialPrograms.length > 0) {
        setProgramsList(initialPrograms);
      }

      // Check if all major endpoints failed
      if (!statsRes.data?.ok && !appRes.data?.ok && !setRes.data?.ok) {
        const errorDetail = statsRes.data?.error?.response?.data?.detail 
          || appRes.data?.error?.response?.data?.detail 
          || "Gagal memuat data admin PMB. Pastikan sesi login aktif.";
        toast.error(errorDetail);
      }
    } catch (err) {
      console.error(err);
      toast.error("Gagal memuat data admin PMB");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleVerifyPayment = async (applicantId) => {
    try {
      const res = await api.post(`/api/v1/pmb/admin/applicants/${applicantId}/verify-payment`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.ok) {
        toast.success(res.data.message || "Pembayaran formulir berhasil diverifikasi");
        fetchData();
      }
    } catch (err) {
      toast.error("Gagal verifikasi pembayaran");
    }
  };

  const handleSaveOfflineScore = async () => {
    if (!offlineScoreModal) return;
    try {
      const res = await api.post(
        `/api/v1/pmb/admin/applicants/${offlineScoreModal.id}/offline-score`,
        { score: Number(offlineScore), status: Number(offlineScore) >= (settings?.passing_grade || 70) ? "passed" : "failed", notes: offlineNotes },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.ok) {
        toast.success(res.data.message || "Nilai ujian offline berhasil disimpan");
        setOfflineScoreModal(null);
        fetchData();
      }
    } catch (err) {
      toast.error("Gagal menyimpan nilai offline");
    }
  };

  const handleConvertToStudent = async (applicantId) => {
    try {
      const res = await api.post(`/api/v1/pmb/admin/applicants/${applicantId}/convert-to-student`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.ok) {
        toast.success(res.data.message || "Calon mahasiswa berhasil dikonversi ke SIAKAD!");
        fetchData();
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal konversi ke SIAKAD"));
    }
  };

  const handleBulkConvert = async () => {
    if (!window.confirm("Konversi seluruh calon mahasiswa yang telah lulus dan daftar ulang ke SIAKAD?")) return;
    try {
      const res = await api.post("/api/v1/pmb/admin/applicants/bulk-convert", {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.ok) {
        toast.success(res.data.message || "Konversi massal berhasil!");
        fetchData();
      }
    } catch (err) {
      toast.error("Gagal konversi massal");
    }
  };

  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...questionForm,
        q_type: questionForm.q_type || "pg",
        options: questionForm.q_type === "isian" ? [] : questionForm.options,
        correct_answer: questionForm.correct_answer?.trim() || "A",
      };
      if (editingQuestion) {
        await api.put(`/api/v1/pmb/admin/questions/${editingQuestion.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success("Soal berhasil diperbarui");
      } else {
        await api.post("/api/v1/pmb/admin/questions", payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success("Soal berhasil ditambahkan");
      }
      setShowQuestionModal(false);
      fetchData();
    } catch (err) {
      toast.error("Gagal menyimpan soal");
    }
  };

  const handleDeleteQuestion = async (qId) => {
    if (!window.confirm("Hapus soal ini dari bank soal CBT?")) return;
    try {
      await api.delete(`/api/v1/pmb/admin/questions/${qId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Soal berhasil dihapus");
      fetchData();
    } catch (err) {
      toast.error("Gagal menghapus soal");
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post("/api/v1/pmb/admin/settings", settings, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.ok) {
        toast.success("Pengaturan PMB berhasil disimpan!");
        setSettings(res.data.settings);
      }
    } catch (err) {
      toast.error("Gagal menyimpan pengaturan PMB");
    }
  };

  const filteredApplicants = useMemo(() => {
    return applicants.filter((a) => {
      if (prodiFilter && a.prodi_id !== prodiFilter) return false;
      if (classFilter && a.class_type !== classFilter) return false;
      if (statusFilter) {
        if (statusFilter === "verified_payment" && a.reg_payment_status !== "verified") return false;
        if (statusFilter === "passed" && a.test_status !== "passed") return false;
        if (statusFilter === "converted" && !a.is_converted_to_student) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        const match =
          (a.name || "").toLowerCase().includes(s) ||
          (a.registration_number || "").toLowerCase().includes(s) ||
          (a.email || "").toLowerCase().includes(s) ||
          (a.whatsapp || "").toLowerCase().includes(s) ||
          (a.referral_code || "").toLowerCase().includes(s);
        if (!match) return false;
      }
      return true;
    });
  }, [applicants, prodiFilter, classFilter, statusFilter, search]);

  return (
    <div className="space-y-6">
      {/* Header Hub */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-700 via-indigo-800 to-sky-700 flex items-center justify-center text-white font-black text-2xl shadow-md">
            <GraduationCap className="w-7 h-7" />
          </div>
          <div>
            <h2 className="font-extrabold text-xl text-slate-950">
              Pusat Manajemen PMB & Referal Kampus
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Periode Aktif: <strong className="text-indigo-700">{settings?.active_period_name || "TA 2026/2027"}</strong> • Status:{" "}
              <Badge variant={settings?.is_open ? "default" : "secondary"} className="text-[10px]">
                {settings?.is_open ? "Pendaftaran Dibuka" : "Ditutup"}
              </Badge>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Segarkan Data
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setActiveTab("final_report")}
            className="bg-gradient-to-r from-indigo-600 to-sky-600 text-white font-bold text-xs"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" /> Laporan Akhir PMB
          </Button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`px-3 py-2 rounded-lg transition-all ${
            activeTab === "overview" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5 inline mr-1.5" /> Ringkasan Statistik
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("customizer")}
          className={`px-3 py-2 rounded-lg transition-all ${
            activeTab === "customizer" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 inline mr-1.5" /> Kustomisasi Halaman PMB (CMS)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("analytics")}
          className={`px-3 py-2 rounded-lg transition-all ${
            activeTab === "analytics" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 inline mr-1.5" /> Analisis & Pemetaan Pendaftar
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("referrals")}
          className={`px-3 py-2 rounded-lg transition-all ${
            activeTab === "referrals" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Gift className="w-3.5 h-3.5 inline mr-1.5" /> Sistem Referal & Payout Fee
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("applicants")}
          className={`px-3 py-2 rounded-lg transition-all ${
            activeTab === "applicants" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Users className="w-3.5 h-3.5 inline mr-1.5" /> Calon Mahasiswa ({applicants.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("cbt_bank")}
          className={`px-3 py-2 rounded-lg transition-all ${
            activeTab === "cbt_bank" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Monitor className="w-3.5 h-3.5 inline mr-1.5" /> Bank Soal CBT ({questions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("test_sessions")}
          className={`px-3 py-2 rounded-lg transition-all ${
            activeTab === "test_sessions" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <MonitorSmartphone className="w-3.5 h-3.5 inline mr-1.5" /> Sesi Ujian CBT
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reregistration")}
          className={`px-3 py-2 rounded-lg transition-all ${
            activeTab === "reregistration" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Shirt className="w-3.5 h-3.5 inline mr-1.5" /> Rekap Daftar Ulang & Baju
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("conversion")}
          className={`px-3 py-2 rounded-lg transition-all ${
            activeTab === "conversion" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Rocket className="w-3.5 h-3.5 inline mr-1.5" /> Aktivasi SIAKAD & NIM
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("final_report")}
          className={`px-3 py-2 rounded-lg transition-all ${
            activeTab === "final_report" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <FileText className="w-3.5 h-3.5 inline mr-1.5" /> Laporan Akhir Eksekutif
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`px-3 py-2 rounded-lg transition-all ${
            activeTab === "settings" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Settings className="w-3.5 h-3.5 inline mr-1.5" /> Pengaturan Global
        </button>
      </div>

      {/* Sub-tab 1: Overview */}
      {activeTab === "overview" && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
              <p className="text-xs text-slate-500 font-medium">Total Pendaftar</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{stats.total_applicants || 0}</p>
              <p className="text-[10px] text-slate-400">Target: {stats.target_students || 500} Mhs</p>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
              <p className="text-xs text-slate-500 font-medium">Lulus Seleksi</p>
              <p className="text-2xl font-black text-emerald-600 mt-1">{stats.total_passed || 0}</p>
              <p className="text-[10px] text-emerald-700 font-bold">Passing Grade: {settings?.passing_grade || 70}</p>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
              <p className="text-xs text-slate-500 font-medium">Daftar Ulang (Pra-Studi)</p>
              <p className="text-2xl font-black text-indigo-600 mt-1">{stats.total_reregistered || 0}</p>
              <p className="text-[10px] text-indigo-700 font-bold">{stats.total_converted_to_student || 0} Terdaftar SIAKAD</p>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
              <p className="text-xs text-slate-500 font-medium">Total Penerimaan Bruto</p>
              <p className="text-xl font-black text-sky-700 mt-1 font-mono">{formatRupiah(stats.total_revenue || 0)}</p>
              <p className="text-[10px] text-slate-400">Formulir + Pra-Studi</p>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab 2: CMS Page Customizer */}
      {activeTab === "customizer" && (
        <PmbLandingCustomizerTab
          token={token}
          initialSettings={settings}
          onUpdateSettings={(newSet) => setSettings(newSet)}
        />
      )}

      {/* Sub-tab 3: Analytics & Mapping */}
      {activeTab === "analytics" && (
        <PmbAnalyticsTab token={token} />
      )}

      {/* Sub-tab 4: Referrals & Payout */}
      {activeTab === "referrals" && (
        <PmbReferralsTab token={token} />
      )}

      {/* Sub-tab 5: Applicants Table */}
      {activeTab === "applicants" && (
        <div className="space-y-4">
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <CardTitle className="text-base font-bold">Daftar Calon Mahasiswa Baru</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder="Cari nama, NIK, no reg, WA..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-48 text-xs"
                  />
                  <select
                    value={prodiFilter}
                    onChange={(e) => setProdiFilter(e.target.value)}
                    className="border border-slate-300 rounded-md p-1.5 text-xs bg-white"
                  >
                    <option value="">Semua Program Studi</option>
                    {programsList.map((p) => (
                      <option key={p.id} value={p.id}>{p.nama}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs font-bold">No. Registrasi</TableHead>
                    <TableHead className="text-xs font-bold">Nama Pendaftar</TableHead>
                    <TableHead className="text-xs font-bold">Prodi & Kelas</TableHead>
                    <TableHead className="text-xs font-bold">Bayar Form</TableHead>
                    <TableHead className="text-xs font-bold text-center">Hasil Tes</TableHead>
                    <TableHead className="text-xs font-bold text-center">Daftar Ulang</TableHead>
                    <TableHead className="text-xs font-bold text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredApplicants.length > 0 ? (
                    filteredApplicants.map((a) => (
                      <TableRow key={a.id} className="text-xs hover:bg-slate-50">
                        <TableCell className="font-mono font-bold text-indigo-700">
                          {a.registration_number}
                        </TableCell>
                        <TableCell>
                          <p className="font-bold text-slate-900">{a.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{a.whatsapp || a.email}</p>
                        </TableCell>
                        <TableCell>
                          <p className="font-semibold text-slate-800">{a.prodi_name}</p>
                          <Badge variant="outline" className="capitalize text-[9px] mt-0.5">
                            {a.class_type} ({a.learning_mode})
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {a.reg_payment_status === "verified" ? (
                            <Badge className="bg-emerald-600 text-white text-[9px]"><Check className="w-3 h-3 mr-1 inline" /> Lunas</Badge>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleVerifyPayment(a.id)}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] h-6 px-2 font-bold"
                            >
                              Verifikasi
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={a.test_status === "passed" ? "default" : "outline"} className="capitalize text-[9px]">
                            {a.test_score ? `${a.test_score} (${a.test_status})` : a.test_type ? `${a.test_type}` : "Belum Tes"}
                          </Badge>
                          {a.test_type === "offline" && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setOfflineScoreModal(a);
                                setOfflineScore(a.test_score || 80);
                                setOfflineNotes(a.test_notes || "");
                              }}
                              className="text-[9px] text-indigo-600 font-bold block mx-auto mt-0.5 h-5 p-0"
                            >
                              <Pencil className="w-3 h-3 inline mr-1" /> Input Nilai
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={["partial", "completed"].includes(a.reregistration_status) ? "default" : "outline"} className="text-[9px]">
                            {a.reregistration_status === "completed" ? "Lunas" : a.reregistration_status === "partial" ? "Cicilan" : "Belum"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedApplicant(a)}
                              className="text-[9px] text-indigo-700 font-bold h-6 px-1.5 border-indigo-200 hover:bg-indigo-50"
                            >
                              <Eye className="w-3 h-3 mr-0.5" /> Detail
                            </Button>
                            {a.is_converted_to_student ? (
                              <Badge className="bg-teal-600 text-white text-[9px] font-mono">NIM: {a.generated_nim}</Badge>
                            ) : a.test_status === "passed" ? (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleConvertToStudent(a.id)}
                                className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-[9px] h-6 px-2"
                              >
                                Aktivasi SIAKAD
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-slate-500">
                        Tidak ada pendaftar yang sesuai filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sub-tab 6: CBT Question Bank */}
      {activeTab === "cbt_bank" && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h3 className="font-bold text-sm text-slate-900">Bank Soal Ujian Masuk Online CBT ({questions.length} Soal)</h3>
            <div className="flex items-center gap-2">
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,.xlsm"
                className="hidden"
                onChange={handleImportExcel}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => importFileRef.current?.click()}
                disabled={importing}
                className="text-indigo-700 border-indigo-300 hover:bg-indigo-50 font-bold text-xs"
              >
                {importing ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileUp className="w-3.5 h-3.5 mr-1" />}
                {importing ? "Mengimpor..." : "Import Soal Excel"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditingQuestion(null);
                  setQuestionForm({
                    q_type: "pg",
                    category: "Penalaran Umum (TPA)",
                    question: "",
                    options: [
                      { key: "A", text: "" },
                      { key: "B", text: "" },
                      { key: "C", text: "" },
                      { key: "D", text: "" }
                    ],
                    correct_answer: "A",
                    weight: 10,
                  });
                  setShowQuestionModal(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Tambah Soal CBT
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {questions.map((q, idx) => (
              <Card key={q.id || idx} className="border-slate-200">
                <CardContent className="p-4 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <Badge variant="outline" className="text-indigo-700 text-[10px] font-bold">
                      #{idx + 1} {q.category}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-semibold">Bobot: {q.weight} Poin</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingQuestion(q);
                          setQuestionForm({
                            q_type: q.q_type || "pg",
                            category: q.category || "Penalaran Umum (TPA)",
                            question: q.question || "",
                            options: q.q_type === "isian" ? [] : (q.options || [{ key: "A", text: "" }, { key: "B", text: "" }, { key: "C", text: "" }, { key: "D", text: "" }]),
                            correct_answer: q.correct_answer || "A",
                            weight: q.weight || 10,
                          });
                          setShowQuestionModal(true);
                        }}
                        className="text-indigo-600 hover:bg-indigo-50 h-7 w-7 p-0"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="text-rose-600 hover:bg-rose-50 h-7 w-7 p-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="font-bold text-slate-900 text-sm">{q.question}</p>
                  {q.q_type === "isian" ? (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-violet-600 text-white text-[10px]">Isian Singkat</Badge>
                      <span className="text-[10px] text-slate-500 font-semibold">Kunci: {q.correct_answer}</span>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-2 pt-1">
                      {q.options?.map((opt) => (
                        <div
                          key={opt.key}
                          className={`p-2 rounded-md border text-xs ${
                            opt.key === q.correct_answer
                              ? "bg-emerald-50 border-emerald-300 font-bold text-emerald-900"
                              : "bg-slate-50 border-slate-200 text-slate-700"
                          }`}
                        >
                          <span className="font-bold mr-1">{opt.key}.</span> {opt.text}
                          {opt.key === q.correct_answer && <span className="inline-flex items-center gap-1"> <Check className="w-3 h-3 text-emerald-600" /> Kunci Jawaban</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Sub-tab 7: Sesi Ujian CBT */}
      {activeTab === "test_sessions" && (
        <PmbTestSessionsTab token={token} />
      )}

      {/* Sub-tab 8: Reregistration & Shirt Size */}
      {activeTab === "reregistration" && (
        <div className="space-y-6">
          <Card className="border-slate-200">
            <CardHeader className="py-3.5 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Shirt className="w-4 h-4 text-indigo-600" />
                Rekap Kebutuhan Ukuran Seragam & Jas Almamater
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
                {["S", "M", "L", "XL", "XXL", "XXXL"].map((sz) => {
                  const count = stats?.shirt_size_distribution?.[sz] || 0;
                  return (
                    <div key={sz} className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-1">
                      <p className="font-black text-indigo-950 text-base">Ukuran {sz}</p>
                      <p className="text-xl font-black text-indigo-700">{count}</p>
                      <p className="text-[10px] text-slate-500 font-semibold">Pcs / Jas</p>
                    </div>
                  );
                })}
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden mt-4">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow className="text-[10px]">
                      <TableHead>Nama Mahasiswa</TableHead>
                      <TableHead>Prodi</TableHead>
                      <TableHead className="text-center">Ukuran Baju</TableHead>
                      <TableHead>Catatan Ukuran</TableHead>
                      <TableHead className="text-center">Status Pra-Studi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {applicants
                      .filter((a) => a.shirt_size || a.reregistration_status !== "unpaid")
                      .map((a) => (
                        <TableRow key={a.id} className="text-xs">
                          <TableCell className="font-bold text-slate-900">{a.name}</TableCell>
                          <TableCell>{a.prodi_name}</TableCell>
                          <TableCell className="text-center">
                            <Badge className="bg-indigo-600 text-white font-bold">{a.shirt_size || "-"}</Badge>
                          </TableCell>
                          <TableCell className="text-slate-500 text-[11px]">{a.shirt_notes || "-"}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={a.reregistration_status === "completed" ? "default" : "outline"} className="text-[9px]">
                              {a.reregistration_status === "completed" ? "Lunas" : a.reregistration_status === "partial" ? "Cicilan" : "Belum"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sub-tab 8: Conversion to SIAKAD */}
      {activeTab === "conversion" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-teal-50 p-4 rounded-xl border border-teal-200">
            <div className="space-y-0.5">
              <h4 className="font-bold text-teal-950 text-sm">Konversi Calon Mahasiswa ke Akun SIAKAD</h4>
              <p className="text-xs text-teal-700">
                Calon mahasiswa yang telah lulus dan menyelesaikan daftar ulang dapat langsung diaktifkan dengan penerbitan NIM resmi otomatis.
              </p>
            </div>
            <Button
              type="button"
              onClick={handleBulkConvert}
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-sm"
            >
              <Rocket className="w-4 h-4 mr-1.5 inline" /> Konversi Massal Semua Lolos
            </Button>
          </div>

          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs font-bold">Nama Pendaftar</TableHead>
                  <TableHead className="text-xs font-bold">Prodi Pilihan</TableHead>
                  <TableHead className="text-xs font-bold text-center">Status Tes</TableHead>
                  <TableHead className="text-xs font-bold text-center">Daftar Ulang</TableHead>
                  <TableHead className="text-xs font-bold text-center">Status SIAKAD</TableHead>
                  <TableHead className="text-xs font-bold text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applicants
                  .filter((a) => a.test_status === "passed")
                  .map((a) => (
                    <TableRow key={a.id} className="text-xs">
                      <TableCell>
                        <p className="font-bold text-slate-900">{a.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{a.registration_number}</p>
                      </TableCell>
                      <TableCell className="font-semibold">{a.prodi_name}</TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-emerald-600 text-white text-[9px]">Lulus ({a.test_score})</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={["partial", "completed"].includes(a.reregistration_status) ? "default" : "outline"} className="text-[9px]">
                          {a.reregistration_status === "completed" ? "Lunas" : a.reregistration_status === "partial" ? "Cicilan" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {a.is_converted_to_student ? (
                          <span className="font-mono font-bold text-teal-700 text-xs">NIM: {a.generated_nim}</span>
                        ) : (
                          <span className="text-slate-400">Belum Diaktifkan</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {!a.is_converted_to_student ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleConvertToStudent(a.id)}
                            className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-[9px] h-6 px-2.5"
                          >
                            Aktifkan Akun
                          </Button>
                        ) : (
                          <span className="text-emerald-700 font-bold text-[10px] inline-flex items-center gap-1"><Check className="w-3 h-3" /> Mahasiswa Aktif</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Sub-tab 9: Final Executive Report */}
      {activeTab === "final_report" && (
        <PmbExecutiveReportTab token={token} />
      )}

      {/* Sub-tab 10: Global Settings */}
      {activeTab === "settings" && settings && (
        <div className="space-y-6">
          {/* Card 1: Switch Ujian Online */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white py-4 px-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2 text-white">
                    <Monitor className="w-5 h-5 text-sky-400" />
                    Pengaturan Jalur Ujian Online (CBT)
                  </CardTitle>
                  <CardDescription className="text-slate-300 text-xs mt-0.5">
                    Kontrol ketersediaan opsi ujian online mandiri bagi calon mahasiswa baru di Portal PMB.
                  </CardDescription>
                </div>
                <Badge className={`text-xs font-bold px-3 py-1 ${
                  settings.online_test_enabled ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-300 border border-slate-600"
                }`}>
                  {settings.online_test_enabled ? "Ujian Online AKTIF" : "Ujian Online NONAKTIF (Default: Offline)"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/80">
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 text-sm">Aktifkan Pilihan Ujian Online (CBT Mandiri)</h4>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                    Secara <strong>default ujian online nonaktif (Off)</strong>, sehingga calon mahasiswa hanya diarahkan ke <strong>Ujian Offline di Kampus</strong>. Jika switch ini dinyalakan (On), calon mahasiswa dapat memilih opsi <strong>Ujian Mandiri Online (CBT)</strong> pada Alur 5.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, online_test_enabled: !settings.online_test_enabled })}
                  className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.online_test_enabled ? "bg-indigo-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.online_test_enabled ? "translate-x-7" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Switch Metode Pembayaran PMB */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white py-4 px-6">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-white">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                Metode Pembayaran yang Didukung (On / Off Switch)
              </CardTitle>
              <CardDescription className="text-slate-300 text-xs mt-0.5">
                Pilih metode pembayaran yang aktif untuk Biaya Pendaftaran (Alur 3) dan Uang Pra-Studi (Alur 8).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Calon mahasiswa hanya dapat memilih metode pembayaran yang berstatus <strong>Aktif (On)</strong>.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                {/* 1. QRIS */}
                <div className={`p-4 rounded-xl border transition-all ${
                  (settings.payment_method_qris !== false && settings.payment_methods?.qris !== false)
                    ? "bg-emerald-50/50 border-emerald-300"
                    : "bg-slate-50 border-slate-200 opacity-60"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                        QR
                      </div>
                      <div>
                        <h5 className="font-bold text-slate-900 text-xs">QRIS Instan</h5>
                        <p className="text-[11px] text-slate-500">Scan QR Code Standar Nasional</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = !(settings.payment_method_qris !== false && settings.payment_methods?.qris !== false);
                        setSettings({
                          ...settings,
                          payment_method_qris: nextVal,
                          payment_methods: { ...(settings.payment_methods || {}), qris: nextVal }
                        });
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        (settings.payment_method_qris !== false && settings.payment_methods?.qris !== false) ? "bg-emerald-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          (settings.payment_method_qris !== false && settings.payment_methods?.qris !== false) ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* 2. Transfer Manual */}
                <div className={`p-4 rounded-xl border transition-all ${
                  (settings.payment_method_manual !== false && settings.payment_methods?.manual_transfer !== false)
                    ? "bg-sky-50/50 border-sky-300"
                    : "bg-slate-50 border-slate-200 opacity-60"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-sm">
                        TF
                      </div>
                      <div>
                        <h5 className="font-bold text-slate-900 text-xs">Transfer Bank Manual</h5>
                        <p className="text-[11px] text-slate-500">Transfer & Unggah Bukti Bayar</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = !(settings.payment_method_manual !== false && settings.payment_methods?.manual_transfer !== false);
                        setSettings({
                          ...settings,
                          payment_method_manual: nextVal,
                          payment_methods: { ...(settings.payment_methods || {}), manual_transfer: nextVal }
                        });
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        (settings.payment_method_manual !== false && settings.payment_methods?.manual_transfer !== false) ? "bg-sky-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          (settings.payment_method_manual !== false && settings.payment_methods?.manual_transfer !== false) ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* 3. VA Mandiri */}
                <div className={`p-4 rounded-xl border transition-all ${
                  (settings.payment_method_va_mandiri !== false && settings.payment_methods?.va_mandiri !== false)
                    ? "bg-indigo-50/50 border-indigo-300"
                    : "bg-slate-50 border-slate-200 opacity-60"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                        VA
                      </div>
                      <div>
                        <h5 className="font-bold text-slate-900 text-xs">Virtual Account Mandiri</h5>
                        <p className="text-[11px] text-slate-500">Kode Tagihan VA Bank Mandiri</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = !(settings.payment_method_va_mandiri !== false && settings.payment_methods?.va_mandiri !== false);
                        setSettings({
                          ...settings,
                          payment_method_va_mandiri: nextVal,
                          payment_methods: { ...(settings.payment_methods || {}), va_mandiri: nextVal }
                        });
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        (settings.payment_method_va_mandiri !== false && settings.payment_methods?.va_mandiri !== false) ? "bg-indigo-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          (settings.payment_method_va_mandiri !== false && settings.payment_methods?.va_mandiri !== false) ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* 4. VA BCA */}
                <div className={`p-4 rounded-xl border transition-all ${
                  (settings.payment_method_va_bca !== false && settings.payment_methods?.va_bca !== false)
                    ? "bg-purple-50/50 border-purple-300"
                    : "bg-slate-50 border-slate-200 opacity-60"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">
                        VA
                      </div>
                      <div>
                        <h5 className="font-bold text-slate-900 text-xs">Virtual Account BCA</h5>
                        <p className="text-[11px] text-slate-500">Kode Tagihan VA Bank BCA</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = !(settings.payment_method_va_bca !== false && settings.payment_methods?.va_bca !== false);
                        setSettings({
                          ...settings,
                          payment_method_va_bca: nextVal,
                          payment_methods: { ...(settings.payment_methods || {}), va_bca: nextVal }
                        });
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        (settings.payment_method_va_bca !== false && settings.payment_methods?.va_bca !== false) ? "bg-purple-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          (settings.payment_method_va_bca !== false && settings.payment_methods?.va_bca !== false) ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Biaya, Rekening & Parameter PMB */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Parameter Biaya & Rekening Kampus</CardTitle>
              <CardDescription className="text-xs">
                Konfigurasi periode gelombang aktif, nominal biaya pendaftaran, pra-studi, dan informasi Sibermaru.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-bold">Nama Periode / Gelombang Aktif</Label>
                    <Input
                      value={settings.active_period_name || ""}
                      onChange={(e) => setSettings({ ...settings, active_period_name: e.target.value })}
                      className="text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Target Mahasiswa Baru</Label>
                    <Input
                      type="number"
                      value={settings.target_new_students || 500}
                      onChange={(e) => setSettings({ ...settings, target_new_students: parseInt(e.target.value) })}
                      className="text-xs mt-1"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs font-bold">Biaya Formulir (IDR)</Label>
                    <Input
                      type="number"
                      value={settings.registration_fee || 250000}
                      onChange={(e) => setSettings({ ...settings, registration_fee: parseFloat(e.target.value) })}
                      className="text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Total Uang Pra-Studi (IDR)</Label>
                    <Input
                      type="number"
                      value={settings.pra_studi_total_fee || 3500000}
                      onChange={(e) => setSettings({ ...settings, pra_studi_total_fee: parseFloat(e.target.value) })}
                      className="text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Passing Grade Kelulusan (0-100)</Label>
                    <Input
                      type="number"
                      value={settings.passing_grade || 70}
                      onChange={(e) => setSettings({ ...settings, passing_grade: parseFloat(e.target.value) })}
                      className="text-xs mt-1"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t">
                  <div>
                    <Label className="text-xs font-bold">Nama Bank / E-Wallet</Label>
                    <Input
                      value={settings.bank_account_name || ""}
                      onChange={(e) => setSettings({ ...settings, bank_account_name: e.target.value })}
                      placeholder="Bank Mandiri"
                      className="text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Nomor Rekening / No E-Wallet</Label>
                    <Input
                      value={settings.bank_account_number || ""}
                      onChange={(e) => setSettings({ ...settings, bank_account_number: e.target.value })}
                      placeholder="123-00-9876543-2"
                      className="text-xs mt-1"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs font-bold">Atas Nama Rekening</Label>
                    <Input
                      value={settings.bank_account_holder || ""}
                      onChange={(e) => setSettings({ ...settings, bank_account_holder: e.target.value })}
                      placeholder="YAYASAN KAMPUS HEBAT"
                      className="text-xs mt-1"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs font-bold">URL Gambar QRIS (opsional)</Label>
                    <Input
                      value={settings.qris_image_url || ""}
                      onChange={(e) => setSettings({ ...settings, qris_image_url: e.target.value })}
                      placeholder="https://.../qrpay.png"
                      className="text-xs mt-1"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t">
                  <div>
                    <Label className="text-xs font-bold">Nama Grup WhatsApp Resmi</Label>
                    <Input
                      value={settings.wa_group_name || ""}
                      onChange={(e) => setSettings({ ...settings, wa_group_name: e.target.value })}
                      placeholder="PMB Official 2026"
                      className="text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Link Tautan Grup WhatsApp</Label>
                    <Input
                      value={settings.wa_group_url || ""}
                      onChange={(e) => setSettings({ ...settings, wa_group_url: e.target.value })}
                      placeholder="https://chat.whatsapp.com/..."
                      className="text-xs mt-1"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-4 pt-2 border-t">
                  <div>
                    <Label className="text-xs font-bold">Jadwal Sibermaru (Orientasi)</Label>
                    <Input
                      value={settings.sibermaru_schedule || ""}
                      onChange={(e) => setSettings({ ...settings, sibermaru_schedule: e.target.value })}
                      placeholder="25 - 27 Agustus 2026"
                      className="text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Lokasi Sibermaru</Label>
                    <Input
                      value={settings.sibermaru_location || ""}
                      onChange={(e) => setSettings({ ...settings, sibermaru_location: e.target.value })}
                      placeholder="Auditorium Utama & Hybrid Zoom"
                      className="text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Dresscode Sibermaru</Label>
                    <Input
                      value={settings.sibermaru_dresscode || ""}
                      onChange={(e) => setSettings({ ...settings, sibermaru_dresscode: e.target.value })}
                      placeholder="Kemeja Putih, Celana/Rok Hitam, Jas Almamater"
                      className="text-xs mt-1"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-3 border-t">
                  <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-6 py-2.5 shadow-md">
                    Simpan Seluruh Pengaturan PMB
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Offline Score Modal */}
      {offlineScoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
            <div className="bg-gradient-to-r from-sky-600 to-indigo-700 p-4 text-white flex justify-between items-center">
              <h4 className="font-bold text-sm">Input Nilai Tes Offline Kampus</h4>
              <button
                onClick={() => setOfflineScoreModal(null)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="p-3 bg-slate-50 border rounded-xl space-y-0.5">
                <p className="text-[10px] text-slate-500 font-bold uppercase">Calon Mahasiswa:</p>
                <p className="font-bold text-slate-900 text-sm">{offlineScoreModal.name}</p>
                <p className="text-slate-600 font-mono">{offlineScoreModal.registration_number} • {offlineScoreModal.prodi_name}</p>
              </div>
              <div>
                <Label className="text-xs font-bold">Skor Nilai Masuk (0 - 100) *</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={offlineScore}
                  onChange={(e) => setOfflineScore(e.target.value)}
                  className="mt-1 text-xs font-mono font-black text-indigo-700"
                />
                <p className="text-[10px] text-slate-500 mt-1">Passing Grade Kelulusan: {settings?.passing_grade || 70}</p>
              </div>
              <div>
                <Label className="text-xs font-bold">Catatan Penilaian Penguji</Label>
                <Input
                  value={offlineNotes}
                  onChange={(e) => setOfflineNotes(e.target.value)}
                  placeholder="Catatan wawancara akademik / tes fisik"
                  className="mt-1 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setOfflineScoreModal(null)}>
                  Batal
                </Button>
                <Button type="button" size="sm" onClick={handleSaveOfflineScore} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                  Simpan Nilai & Kelulusan <Check className="w-3.5 h-3.5 ml-1 inline" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CBT Question Modal */}
      {showQuestionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
            <div className="bg-indigo-700 p-4 text-white flex justify-between items-center">
              <h4 className="font-bold text-sm">
                {editingQuestion ? "Edit Butir Soal CBT" : "Tambah Butir Soal CBT"}
              </h4>
              <button
                onClick={() => setShowQuestionModal(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="p-5 space-y-3 text-xs">
              <div>
                <Label className="text-xs font-bold">Tipe Soal</Label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {[
                    { value: "pg", label: "Pilihan Ganda (A-D)" },
                    { value: "isian", label: "Isian Singkat" },
                  ].map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() =>
                        setQuestionForm({
                          ...questionForm,
                          q_type: t.value,
                          options: t.value === "isian" ? [] : questionForm.options?.length ? questionForm.options : [
                            { key: "A", text: "" },
                            { key: "B", text: "" },
                            { key: "C", text: "" },
                            { key: "D", text: "" },
                          ],
                          correct_answer: t.value === "isian" && (questionForm.correct_answer === "A" || questionForm.correct_answer === "B" || questionForm.correct_answer === "C" || questionForm.correct_answer === "D") ? "" : questionForm.correct_answer,
                        })
                      }
                      className={`p-2.5 rounded-lg border text-center font-bold ${
                        (questionForm.q_type || "pg") === t.value
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-slate-50 text-slate-600 border-slate-200"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold">Kategori Soal</Label>
                <Input
                  value={questionForm.category}
                  onChange={(e) => setQuestionForm({ ...questionForm, category: e.target.value })}
                  placeholder="Penalaran Umum / Kuantitatif / Bahasa"
                  className="text-xs mt-1"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-bold">Pertanyaan Soal</Label>
                <textarea
                  value={questionForm.question}
                  onChange={(e) => setQuestionForm({ ...questionForm, question: e.target.value })}
                  rows={3}
                  required
                  placeholder="Tuliskan butir soal di sini..."
                  className="mt-1 w-full border border-slate-300 rounded-md p-2 text-xs"
                />
              </div>

              {questionForm.q_type === "isian" ? (
                <div>
                  <Label className="text-xs font-bold">Kunci Jawaban Isian</Label>
                  <Input
                    value={questionForm.correct_answer}
                    onChange={(e) => setQuestionForm({ ...questionForm, correct_answer: e.target.value })}
                    placeholder="cth: Jakarta|DKI Jakarta"
                    className="text-xs mt-1"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Tulis jawaban yang diterima; beberapa alternatif dipisahkan tanda pipa (|). Tidak case-sensitive.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Pilihan Jawaban (A, B, C, D)</Label>
                    {questionForm.options.map((opt, idx) => (
                      <div key={opt.key} className="flex items-center gap-2">
                        <span className="font-bold text-xs w-6 text-center">{opt.key}</span>
                        <Input
                          value={opt.text}
                          onChange={(e) => {
                            const newOpts = [...questionForm.options];
                            newOpts[idx].text = e.target.value;
                            setQuestionForm({ ...questionForm, options: newOpts });
                          }}
                          placeholder={`Jawaban ${opt.key}`}
                          className="text-xs"
                          required
                        />
                      </div>
                    ))}
                  </div>

                  <div>
                    <Label className="text-xs font-bold">Kunci Jawaban Benar</Label>
                    <select
                      value={questionForm.correct_answer}
                      onChange={(e) => setQuestionForm({ ...questionForm, correct_answer: e.target.value })}
                      className="mt-1 w-full border border-slate-300 rounded-md p-2 text-xs bg-white font-bold"
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="D">D</option>
                    </select>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowQuestionModal(false)}>
                  Batal
                </Button>
                <Button type="submit" size="sm" className="bg-indigo-600 text-white font-bold">
                  Simpan Soal
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Applicant Detail Modal */}
      {selectedApplicant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-fade-in">
            <div className="bg-gradient-to-r from-indigo-800 to-sky-700 p-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-bold text-sm">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Rincian Formulir Pendaftaran PMB</h4>
                  <p className="text-[11px] text-sky-100 font-mono">No. Registrasi: {selectedApplicant.registration_number}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedApplicant(null)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              {/* 1. Identitas Lengkap */}
              <div className="space-y-2">
                <h5 className="font-bold text-indigo-900 uppercase text-[11px] border-b pb-1">1. Identitas Calon Mahasiswa</h5>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <div className="p-2.5 bg-slate-50 rounded-lg border">
                    <span className="text-[10px] text-slate-500 font-bold">Nama Lengkap:</span>
                    <p className="font-bold text-slate-900 text-sm mt-0.5">{selectedApplicant.name}</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border">
                    <span className="text-[10px] text-slate-500 font-bold">Tempat, Tanggal Lahir:</span>
                    <p className="font-semibold text-slate-900 mt-0.5">{selectedApplicant.tempat_lahir || "-"}, {selectedApplicant.tanggal_lahir || "-"}</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border">
                    <span className="text-[10px] text-slate-500 font-bold">NIK / No. KTP:</span>
                    <p className="font-mono font-bold text-slate-900 mt-0.5">{selectedApplicant.nik || "-"}</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border">
                    <span className="text-[10px] text-slate-500 font-bold">NISN:</span>
                    <p className="font-mono font-bold text-slate-900 mt-0.5">{selectedApplicant.nisn || "-"}</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border">
                    <span className="text-[10px] text-slate-500 font-bold">Nama Ibu Kandung:</span>
                    <p className="font-semibold text-slate-900 mt-0.5">{selectedApplicant.nama_ibu_kandung || "-"}</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border">
                    <span className="text-[10px] text-slate-500 font-bold">Tinggi / Berat Badan:</span>
                    <p className="font-semibold text-slate-900 mt-0.5">{selectedApplicant.tinggi_badan || "-"} cm / {selectedApplicant.berat_badan || "-"} kg</p>
                  </div>
                </div>
              </div>

              {/* 2. Kontak & Domisili */}
              <div className="space-y-2">
                <h5 className="font-bold text-emerald-900 uppercase text-[11px] border-b pb-1">2. Kontak & Alamat Lengkap</h5>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <div className="p-2.5 bg-slate-50 rounded-lg border">
                    <span className="text-[10px] text-slate-500 font-bold">No. HP / WhatsApp:</span>
                    <p className="font-mono font-bold text-emerald-700 mt-0.5">{selectedApplicant.whatsapp || "-"}</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border">
                    <span className="text-[10px] text-slate-500 font-bold">Email Aktif:</span>
                    <p className="font-semibold text-slate-900 mt-0.5">{selectedApplicant.email || "-"}</p>
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border">
                  <span className="text-[10px] text-slate-500 font-bold">Alamat Lengkap:</span>
                  <p className="font-medium text-slate-900 mt-0.5">{selectedApplicant.alamat || "-"}</p>
                </div>
              </div>

              {/* 3. Asal Sekolah */}
              <div className="space-y-2">
                <h5 className="font-bold text-sky-900 uppercase text-[11px] border-b pb-1">3. Data Asal Sekolah</h5>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <div className="p-2.5 bg-slate-50 rounded-lg border">
                    <span className="text-[10px] text-slate-500 font-bold">Nama Sekolah:</span>
                    <p className="font-bold text-slate-900 mt-0.5">{selectedApplicant.asal_sekolah || "-"}</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border">
                    <span className="text-[10px] text-slate-500 font-bold">NPSN Sekolah:</span>
                    <p className="font-mono font-bold text-slate-900 mt-0.5">{selectedApplicant.npsn_sekolah || "-"}</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border">
                    <span className="text-[10px] text-slate-500 font-bold">Alamat Sekolah:</span>
                    <p className="font-medium text-slate-900 mt-0.5">{selectedApplicant.alamat_sekolah || "-"}</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border">
                    <span className="text-[10px] text-slate-500 font-bold">Jurusan & Tahun Lulus:</span>
                    <p className="font-semibold text-slate-900 mt-0.5">{selectedApplicant.jurusan_asal || "-"} (Lulus: {selectedApplicant.tahun_lulus || "-"})</p>
                  </div>
                </div>
              </div>

              {/* 4. Pilihan Program Studi & Info */}
              <div className="space-y-2">
                <h5 className="font-bold text-amber-900 uppercase text-[11px] border-b pb-1">4. Pilihan Program Studi & Sumber Informasi</h5>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <div className="p-2.5 bg-sky-50 rounded-lg border border-sky-200">
                    <span className="text-[10px] text-sky-800 font-bold">Prodi Pilihan 1:</span>
                    <p className="font-black text-sky-950 mt-0.5">{selectedApplicant.prodi_name}</p>
                  </div>
                  <div className="p-2.5 bg-indigo-50 rounded-lg border border-indigo-200">
                    <span className="text-[10px] text-indigo-800 font-bold">Prodi Pilihan 2:</span>
                    <p className="font-bold text-indigo-950 mt-0.5">{selectedApplicant.prodi_2_name || "Tidak memilih cadangan"}</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border">
                    <span className="text-[10px] text-slate-500 font-bold">Tipe Kelas:</span>
                    <p className="font-bold text-slate-900 mt-0.5 capitalize">Kelas {selectedApplicant.class_type} ({selectedApplicant.learning_mode})</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border">
                    <span className="text-[10px] text-slate-500 font-bold">Tau info Politeknik SCI dari mana:</span>
                    <p className="font-bold text-slate-900 mt-0.5">{selectedApplicant.info_source || "Media Sosial"}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t flex justify-between items-center">
              <div>
                {selectedApplicant.referral_code && (
                  <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-mono text-[10px]">
                    Promotor: {selectedApplicant.referral_code} ({selectedApplicant.referrer_name || "-"})
                  </Badge>
                )}
              </div>
              <Button type="button" size="sm" onClick={() => setSelectedApplicant(null)} className="text-xs">
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
