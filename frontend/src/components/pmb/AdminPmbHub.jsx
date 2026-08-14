import React, { useState, useEffect, useMemo, useRef } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { apiErrorMessage, resolveMediaUrl } from "@/lib/utils";
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
  FileSpreadsheet,
  Settings,
  Check,
  Pencil,
  X,
  ClipboardList,
  MonitorSmartphone,
  FileUp,
  Award,
  MapPin,
  UserCheck,
  Search,
  Phone,
  ExternalLink
} from "lucide-react";
import { PmbAnalyticsTab } from "./PmbAnalyticsTab";
import { PmbReferralsTab } from "./PmbReferralsTab";
import { PmbExecutiveReportTab } from "./PmbExecutiveReportTab";
import { PmbLandingCustomizerTab } from "./PmbLandingCustomizerTab";
import { PmbTestSessionsTab } from "./PmbTestSessionsTab";
import { PmbStudentImportTab } from "./PmbStudentImportTab";

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
  const [activeTab, setActiveTab] = useState("overview"); // overview, customizer, analytics, referrals, applicants, student_import, cbt_bank, test_sessions, reregistration, conversion, final_report, settings
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
  const [skFilter, setSkFilter] = useState("");

  // Modals
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [offlineScoreModal, setOfflineScoreModal] = useState(null);
  const [offlineScore, setOfflineScore] = useState(80);
  const [offlineNotes, setOfflineNotes] = useState("");

  // SK Approval Modal State
  const [skApprovalModal, setSkApprovalModal] = useState(null);
  const [skNumber, setSkNumber] = useState("");
  const [skApprover, setSkApprover] = useState("Panitia PMB & BAAK");
  const [skDate, setSkDate] = useState(new Date().toLocaleDateString("id-ID"));

  // Payment History & Remaining Balance Modal State
  const [paymentHistoryModal, setPaymentHistoryModal] = useState(null);

  // Proof Preview Modal State
  const [previewProofModal, setPreviewProofModal] = useState(null);

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

  const handleVerifyPayment = async (applicantId, action = "approve") => {
    try {
      const res = await api.post(
        `/api/v1/pmb/admin/applicants/${applicantId}/verify-payment`,
        { action },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.ok) {
        toast.success(res.data.message || `Pembayaran formulir ${action === "approve" ? "disetujui" : "ditolak"}`);
        fetchData();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal memverifikasi pembayaran formulir");
    }
  };

  const handleVerifyPraStudiPayment = async (applicantId, action = "approve", term = null) => {
    try {
      const res = await api.post(
        `/api/v1/pmb/admin/applicants/${applicantId}/verify-pra-studi-payment`,
        { action, term },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.ok) {
        toast.success(res.data.message || `Pembayaran Uang Pra-Studi ${action === "approve" ? "disetujui" : "ditolak"}`);
        fetchData();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal memverifikasi Uang Pra-Studi");
    }
  };

  const fetchApplicantPaymentSummary = async (applicantId) => {
    try {
      const res = await api.get(`/api/v1/pmb/admin/applicants/${applicantId}/payment-summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.ok) {
        setPaymentHistoryModal({
          applicant: res.data.applicant,
          balances: res.data.balances,
        });
      }
    } catch (err) {
      toast.error("Gagal memuat histori pembayaran");
    }
  };

  const handleVerifyTransaction = async (applicantId, paymentId, action = "approve") => {
    try {
      const res = await api.post(
        `/api/v1/pmb/admin/applicants/${applicantId}/payments/${paymentId}/verify`,
        { action },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.ok) {
        toast.success(res.data.message);
        setPaymentHistoryModal({
          applicant: res.data.applicant,
          balances: res.data.balances,
        });
        fetchData();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal memverifikasi transaksi");
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

  const handleApproveAdmission = async (applicantId, customNumber = "", customDate = "", customApprover = "") => {
    try {
      const res = await api.post(
        `/api/v1/pmb/admin/applicants/${applicantId}/approve-admission`,
        {
          sk_number: customNumber || undefined,
          sk_date: customDate || undefined,
          approved_by: customApprover || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.ok) {
        toast.success(res.data.message || "SK Penerimaan berhasil disetujui!");
        setSkApprovalModal(null);
        fetchData();
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal menyetujui SK Penerimaan"));
    }
  };

  const handleBulkApproveAdmission = async () => {
    if (!window.confirm("Setujui (Approve) SK Penerimaan secara massal untuk seluruh calon mahasiswa yang telah LULUS ujian seleksi?")) return;
    try {
      const res = await api.post(
        "/api/v1/pmb/admin/applicants/bulk-approve-admission",
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.ok) {
        toast.success(res.data.message || "Approval massal SK Penerimaan berhasil!");
        fetchData();
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal approval massal SK"));
    }
  };

  const handleGetCurrentLocationForGps = () => {
    if (!navigator.geolocation) {
      toast.error("Browser tidak mendukung fitur geolokasi GPS");
      return;
    }
    toast.info("Mengambil titik koordinat GPS saat ini...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        setSettings((prev) => ({
          ...prev,
          offline_test_lat: lat,
          offline_test_lng: lng,
        }));
        toast.success(`Koordinat GPS tersimpan: ${lat}, ${lng} (Akurasi: ±${Math.round(pos.coords.accuracy)}m)`);
      },
      (err) => {
        toast.error("Gagal mendapatkan lokasi GPS: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
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
      if (classFilter) {
        if (classFilter === "reguler_offline") {
          if (a.class_type !== "reguler" || a.learning_mode === "online") return false;
        } else if (classFilter === "reguler_online") {
          if (a.class_type !== "reguler" || a.learning_mode !== "online") return false;
        } else if (classFilter === "weekend_online") {
          if (a.class_type !== "weekend") return false;
        } else if (classFilter === "khusus_offline") {
          if (a.class_type !== "khusus") return false;
        } else if (a.class_type !== classFilter) {
          return false;
        }
      }
      if (skFilter) {
        if (skFilter === "approved" && !a.sk_approved) return false;
        if (skFilter === "pending" && (a.sk_approved || (!a.test_completed_at && a.test_status !== "passed" && a.test_score === null && !a.cbt_attempt_id))) return false;
      }
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
          (a.referral_code || "").toLowerCase().includes(s) ||
          (a.sk_number || "").toLowerCase().includes(s);
        if (!match) return false;
      }
      return true;
    });
  }, [applicants, prodiFilter, classFilter, skFilter, statusFilter, search]);

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
          onClick={() => setActiveTab("student_import")}
          className={`px-3 py-2 rounded-lg transition-all ${
            activeTab === "student_import" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1.5" /> Import Mahasiswa Excel
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
          <Card className="border border-slate-200 bg-white shadow-md rounded-2xl overflow-hidden">
            <CardHeader className="p-5 bg-slate-50/90 border-b border-slate-200 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-indigo-600" />
                    Daftar Calon Mahasiswa Baru (PMB)
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 font-semibold mt-0.5">
                    Total <span className="font-extrabold text-indigo-700">{filteredApplicants.length}</span> pendaftar ditemukan
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleBulkApproveAdmission}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 h-9 rounded-xl shadow-xs shrink-0 self-start md:self-auto flex items-center gap-1.5"
                >
                  <Award className="w-4 h-4" /> 1-Click Approve SK Lulus
                </Button>
              </div>

              {/* Filters bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <Input
                    placeholder="Cari nama, NIK, no reg, WA..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full text-xs pl-9 h-9 bg-white border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>
                <select
                  value={prodiFilter}
                  onChange={(e) => setProdiFilter(e.target.value)}
                  className="w-full h-9 border border-slate-300 rounded-xl px-3 text-xs bg-white font-semibold text-slate-700 shadow-2xs focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Semua Prodi</option>
                  {programsList.map((p) => (
                    <option key={p.id} value={p.id}>{p.nama}</option>
                  ))}
                </select>
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="w-full h-9 border border-slate-300 rounded-xl px-3 text-xs bg-white font-semibold text-slate-700 shadow-2xs focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Semua Jenis Kelas</option>
                  <option value="reguler_offline">1. Kelas Reguler Offline</option>
                  <option value="reguler_online">2. Kelas Reguler Online</option>
                  <option value="weekend_online">3. Kelas Weekend Online</option>
                  <option value="khusus_offline">4. Kelas Khusus Offline</option>
                </select>
                <select
                  value={skFilter}
                  onChange={(e) => setSkFilter(e.target.value)}
                  className="w-full h-9 border border-slate-300 rounded-xl px-3 text-xs bg-white font-semibold text-slate-700 shadow-2xs focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Semua Status SK</option>
                  <option value="pending">Menunggu Approval SK</option>
                  <option value="approved">SK Disetujui (Approved)</option>
                </select>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="w-full min-w-[960px]">
                <TableHeader className="bg-slate-100/90 border-b border-slate-200">
                  <TableRow>
                    <TableHead className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider py-3.5 px-4 w-32">No. Registrasi</TableHead>
                    <TableHead className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider py-3.5 px-4 min-w-[180px]">Nama Pendaftar</TableHead>
                    <TableHead className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider py-3.5 px-4 min-w-[180px]">Prodi & Kelas</TableHead>
                    <TableHead className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider py-3.5 px-4 text-center min-w-[150px]">Bayar Form</TableHead>
                    <TableHead className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider py-3.5 px-4 text-center min-w-[140px]">Hasil Tes</TableHead>
                    <TableHead className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider py-3.5 px-4 text-center min-w-[150px]">SK Penerimaan</TableHead>
                    <TableHead className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider py-3.5 px-4 text-center min-w-[120px]">Daftar Ulang</TableHead>
                    <TableHead className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider py-3.5 px-4 text-center min-w-[140px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {filteredApplicants.length > 0 ? (
                    filteredApplicants.map((a) => (
                      <TableRow key={a.id} className="hover:bg-slate-50/80 transition-colors">
                        <TableCell className="align-middle py-3.5 px-4 font-mono font-black text-indigo-700 text-xs">
                          {a.registration_number}
                        </TableCell>
                        <TableCell className="align-middle py-3.5 px-4">
                          <p className="font-extrabold text-slate-900 text-xs leading-snug">{a.name}</p>
                          <p className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            {a.whatsapp || a.email}
                          </p>
                          {a.referrer_name && (
                            <span className="text-[9px] text-emerald-800 font-extrabold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 inline-block mt-1">
                              Promotor: {a.referrer_name}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="align-middle py-3.5 px-4">
                          <p className="font-bold text-slate-900 text-xs leading-snug">{a.prodi_name}</p>
                          <Badge className="mt-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            {a.class_type === "khusus"
                              ? "Khusus Offline"
                              : a.class_type === "weekend"
                              ? "Weekend Online"
                              : a.learning_mode === "online"
                              ? "Reguler Online"
                              : "Reguler Offline"}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-middle py-3.5 px-4 text-center">
                          {a.reg_payment_status === "verified" ? (
                            <div className="space-y-1 flex flex-col items-center">
                              <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black px-2.5 py-1 rounded-lg inline-flex items-center justify-center gap-1">
                                <Check className="w-3 h-3 text-emerald-600" /> Lunas (Verified)
                              </Badge>
                              {a.reg_payment_proof && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewProofModal({ url: resolveMediaUrl(a.reg_payment_proof), title: `Bukti Transfer Form Pendaftaran - ${a.name}` })}
                                  className="text-[10px] text-indigo-600 font-bold hover:underline inline-flex items-center gap-1 mt-0.5 cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" /> Bukti Transfer
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1.5 flex flex-col items-center">
                              <Badge className="bg-amber-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg">
                                Verifikasi Pendaftaran
                              </Badge>
                              {a.reg_payment_proof && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewProofModal({ url: resolveMediaUrl(a.reg_payment_proof), title: `Bukti Transfer Form Pendaftaran - ${a.name}` })}
                                  className="text-[10px] text-indigo-600 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" /> Bukti Transfer
                                </button>
                              )}
                              <div className="flex items-center justify-center gap-1.5 pt-0.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleVerifyPayment(a.id, "approve")}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] h-6 px-2.5 font-bold rounded-md shadow-2xs"
                                >
                                  Approve
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleVerifyPayment(a.id, "reject")}
                                  className="text-[10px] h-6 px-2.5 font-bold rounded-md shadow-2xs"
                                >
                                  Tolak
                                </Button>
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="align-middle py-3.5 px-4 text-center">
                          {a.test_score !== null && a.test_score !== undefined ? (
                            <div className="space-y-1 flex flex-col items-center">
                              <Badge className="bg-indigo-600 text-white font-mono text-[11px] font-black px-2.5 py-0.5 rounded-lg shadow-2xs">
                                Skor: {a.test_score}
                              </Badge>
                              <span className="text-[10px] text-slate-600 font-extrabold uppercase tracking-tight">
                                {a.test_type === "offline" ? "Offline Kampus" : "Online CBT"}
                              </span>
                            </div>
                          ) : a.test_type ? (
                            <Badge variant="outline" className="border-slate-300 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                              {a.test_type === "offline" ? "Offline (Belum Dinilai)" : "Online CBT (Belum Tes)"}
                            </Badge>
                          ) : (
                            <span className="text-slate-400 text-xs font-medium">Belum Tes</span>
                          )}
                          {a.test_type === "offline" && !a.sk_approved && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setOfflineScoreModal(a);
                                setOfflineScore(a.test_score || 80);
                                setOfflineNotes(a.test_notes || "");
                              }}
                              className="text-[10px] text-indigo-600 font-bold hover:bg-indigo-50 mt-1 h-6 px-2 rounded-md"
                            >
                              <Pencil className="w-3 h-3 inline mr-1" /> {a.test_score !== null && a.test_score !== undefined ? "Ubah Nilai" : "Input Nilai"}
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="align-middle py-3.5 px-4 text-center">
                          {a.sk_approved ? (
                            <div className="space-y-1 flex flex-col items-center">
                              <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black px-2.5 py-1 rounded-lg inline-flex items-center gap-1">
                                <Check className="w-3 h-3 text-emerald-600" /> Approved
                              </Badge>
                              <p className="font-mono text-[9px] text-indigo-600 font-extrabold truncate max-w-[120px]">
                                {a.sk_number || "SK-PMB"}
                              </p>
                            </div>
                          ) : (a.test_status === "passed" || a.test_completed_at || a.test_score !== null || a.cbt_attempt_id) ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => {
                                setSkApprovalModal(a);
                                setSkNumber(a.sk_number || `SK-PMB/2026/${a.registration_number}`);
                                setSkApprover("Panitia PMB & BAAK");
                                setSkDate(new Date().toLocaleDateString("id-ID"));
                              }}
                              className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] h-7 px-3 font-extrabold shadow-2xs rounded-lg inline-flex items-center justify-center gap-1 mx-auto"
                            >
                              <Award className="w-3.5 h-3.5" /> Approve SK
                            </Button>
                          ) : (
                            <span className="text-slate-400 text-xs font-medium">-</span>
                          )}
                        </TableCell>
                        <TableCell className="align-middle py-3.5 px-4 text-center">
                          {a.pra_studi_payment_status === "pending_verification" || a.reregistration_status === "pending_verification" ? (
                            <div className="space-y-1 flex flex-col items-center">
                              <Badge className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg">Verifikasi Pra-Studi</Badge>
                              {a.pra_studi_payment_proof && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewProofModal({ url: resolveMediaUrl(a.pra_studi_payment_proof), title: `Bukti Transfer Uang Pra-Studi - ${a.name}` })}
                                  className="text-[10px] text-indigo-600 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" /> Bukti Transfer
                                </button>
                              )}
                              <div className="flex items-center justify-center gap-1 mt-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleVerifyPraStudiPayment(a.id, "approve")}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] h-5 px-2 font-bold"
                                >
                                  Approve
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleVerifyPraStudiPayment(a.id, "reject")}
                                  className="text-[10px] h-5 px-2 font-bold"
                                >
                                  Tolak
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Badge
                              className={
                                a.reregistration_status === "completed"
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300 font-black text-[10px] px-2.5 py-1 rounded-lg"
                                  : a.reregistration_status === "partial"
                                  ? "bg-sky-100 text-sky-800 border border-sky-300 font-black text-[10px] px-2.5 py-1 rounded-lg"
                                  : "bg-slate-100 text-slate-600 border border-slate-200 font-bold text-[10px] px-2.5 py-1 rounded-lg"
                              }
                            >
                              {a.reregistration_status === "completed" ? "Lunas" : a.reregistration_status === "partial" ? "Cicilan" : "Belum"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="align-middle py-3.5 px-4 text-center">
                          <div className="flex flex-col items-center justify-center gap-1.5 min-w-[110px]">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => fetchApplicantPaymentSummary(a.id)}
                              className="w-full text-[10px] text-emerald-800 font-extrabold h-7 px-2.5 border-emerald-300 hover:bg-emerald-100 bg-emerald-50 rounded-lg inline-flex items-center justify-center gap-1 shadow-2xs"
                            >
                              <CreditCard className="w-3.5 h-3.5 text-emerald-600" /> Histori Bayar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedApplicant(a)}
                              className="w-full text-[10px] text-indigo-800 font-extrabold h-7 px-2.5 border-indigo-300 hover:bg-indigo-100 bg-indigo-50 rounded-lg inline-flex items-center justify-center gap-1 shadow-2xs"
                            >
                              <Eye className="w-3.5 h-3.5 text-indigo-600" /> Detail
                            </Button>
                            {a.is_converted_to_student ? (
                              <Badge className="w-full bg-teal-600 text-white text-[9px] font-mono justify-center py-1 rounded-lg">NIM: {a.generated_nim}</Badge>
                            ) : a.test_status === "passed" ? (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleConvertToStudent(a.id)}
                                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[10px] h-7 px-2 rounded-lg shadow-2xs inline-flex items-center justify-center gap-1"
                              >
                                <Rocket className="w-3 h-3" /> Aktivasi SIAKAD
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-slate-500 font-medium">
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

      {/* Sub-tab: Import mahasiswa baru setelah periode PMB selesai */}
      {activeTab === "student_import" && (
        <PmbStudentImportTab token={token} programs={programsList} />
      )}

      {/* Sub-tab 9: Final Executive Report */}
      {activeTab === "final_report" && (
        <PmbExecutiveReportTab token={token} />
      )}

      {/* Sub-tab 10: Global Settings */}
      {activeTab === "settings" && settings && (
        <div className="space-y-6">
          {/* Card 0: Setting Kelas yang Dibuka Per Prodi */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white py-4 px-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2 text-white">
                    <GraduationCap className="w-5 h-5 text-purple-300" />
                    Pengaturan Pilihan Kelas & Mode Kuliah (Per Program Studi)
                  </CardTitle>
                  <CardDescription className="text-purple-100 text-xs mt-0.5">
                    Aktifkan atau matikan jenis kelas (Reguler, Online, Weekend, Khusus) yang dibuka pada formulir pendaftaran camaba untuk setiap Prodi.
                  </CardDescription>
                </div>
                <Badge className="bg-purple-500 text-white text-xs font-bold px-3 py-1 self-start sm:self-auto">
                  {programsList.length} Program Studi
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="p-3 bg-purple-50/80 rounded-xl border border-purple-200 text-xs text-purple-950 flex items-start gap-2.5">
                <span className="text-base">💡</span>
                <div>
                  <p className="font-bold">Panduan Pengaturan Kelas Per Prodi:</p>
                  <p className="text-slate-600 mt-0.5">
                    Pilihan kelas yang Anda aktifkan di sini akan <strong>secara otomatis memfilter</strong> opsi yang tampil pada Formulir Pendaftaran PMB saat calon mahasiswa memilih Program Studi terkait.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
              {/* Global Quick Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-purple-50/60 rounded-xl border border-purple-200 text-xs">
                <span className="font-bold text-purple-950 flex items-center gap-1.5">
                  ⚡ Preset Massal Semua Prodi:
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const newMap = {};
                      programsList.forEach((p) => {
                        newMap[p.id] = ["reguler_offline", "reguler_online", "weekend_online", "khusus_offline"];
                      });
                      setSettings({ ...settings, prodi_class_settings: newMap });
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-600 text-white hover:bg-purple-700 transition-colors shadow-xs cursor-pointer"
                  >
                    Buka Semua Kelas (Semua Prodi)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newMap = {};
                      programsList.forEach((p) => {
                        newMap[p.id] = ["reguler_online", "weekend_online"];
                      });
                      setSettings({ ...settings, prodi_class_settings: newMap });
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-cyan-600 text-white hover:bg-cyan-700 transition-colors shadow-xs cursor-pointer"
                  >
                    Hanya Online (Semua Prodi)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newMap = {};
                      programsList.forEach((p) => {
                        newMap[p.id] = ["reguler_offline", "reguler_online"];
                      });
                      setSettings({ ...settings, prodi_class_settings: newMap });
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-sky-600 text-white hover:bg-sky-700 transition-colors shadow-xs cursor-pointer"
                  >
                    Hanya Reguler (Semua Prodi)
                  </button>
                </div>
              </div>

              {/* Compact Prodi List */}
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                {programsList.map((prodi) => {
                  const prodiId = prodi.id;
                  const openedClasses = settings.prodi_class_settings?.[prodiId] ?? [
                    "reguler_offline",
                    "reguler_online",
                    "weekend_online",
                    "khusus_offline",
                  ];

                  const classDefs = [
                    { id: "reguler_offline", shortLabel: "Reguler Offline", badge: "Tatap Muka", activeBg: "bg-sky-100 border-sky-400 text-sky-950 font-bold" },
                    { id: "reguler_online", shortLabel: "Reguler Online", badge: "Daring Penuh", activeBg: "bg-cyan-100 border-cyan-400 text-cyan-950 font-bold" },
                    { id: "weekend_online", shortLabel: "Weekend Online", badge: "Akhir Pekan", activeBg: "bg-purple-100 border-purple-400 text-purple-950 font-bold" },
                    { id: "khusus_offline", shortLabel: "Khusus Offline", badge: "Eksekutif", activeBg: "bg-indigo-100 border-indigo-400 text-indigo-950 font-bold" },
                  ];

                  const toggleClass = (classId) => {
                    const currentMap = settings.prodi_class_settings || {};
                    const currentList = currentMap[prodiId] ?? [
                      "reguler_offline",
                      "reguler_online",
                      "weekend_online",
                      "khusus_offline",
                    ];
                    let newList;
                    if (currentList.includes(classId)) {
                      newList = currentList.filter((c) => c !== classId);
                    } else {
                      newList = [...currentList, classId];
                    }
                    setSettings({
                      ...settings,
                      prodi_class_settings: {
                        ...currentMap,
                        [prodiId]: newList,
                      },
                    });
                  };

                  const setPreset = (presetType) => {
                    const currentMap = settings.prodi_class_settings || {};
                    let newList = [];
                    if (presetType === "all") {
                      newList = ["reguler_offline", "reguler_online", "weekend_online", "khusus_offline"];
                    } else if (presetType === "online") {
                      newList = ["reguler_online", "weekend_online"];
                    } else if (presetType === "reguler") {
                      newList = ["reguler_offline", "reguler_online"];
                    } else if (presetType === "khusus") {
                      newList = ["khusus_offline", "reguler_offline"];
                    }
                    setSettings({
                      ...settings,
                      prodi_class_settings: {
                        ...currentMap,
                        [prodiId]: newList,
                      },
                    });
                  };

                  return (
                    <div key={prodiId} className="p-3 hover:bg-slate-50/80 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        {/* Title & Info */}
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-xs sm:text-sm">
                            {prodi.nama || prodi.name}
                          </span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {prodi.jenjang || "S1"} • {prodi.kode || prodi.code || prodiId}
                          </span>
                        </div>

                        {/* Preset Actions */}
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-400 font-medium mr-1">Preset:</span>
                          <button
                            type="button"
                            onClick={() => setPreset("all")}
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                          >
                            Semua
                          </button>
                          <span className="text-slate-300">•</span>
                          <button
                            type="button"
                            onClick={() => setPreset("online")}
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold text-cyan-700 hover:bg-cyan-100 transition-colors cursor-pointer"
                          >
                            Online
                          </button>
                          <span className="text-slate-300">•</span>
                          <button
                            type="button"
                            onClick={() => setPreset("reguler")}
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold text-sky-700 hover:bg-sky-100 transition-colors cursor-pointer"
                          >
                            Reguler
                          </button>
                          <span className="text-slate-300">•</span>
                          <button
                            type="button"
                            onClick={() => setPreset("khusus")}
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
                          >
                            Khusus & Reguler
                          </button>
                        </div>
                      </div>

                      {/* Class Chips Toggle */}
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {classDefs.map((c) => {
                          const isOpen = openedClasses.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => toggleClass(c.id)}
                              className={`px-2.5 py-1 rounded-lg border text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                                isOpen
                                  ? `${c.activeBg} border-current shadow-2xs`
                                  : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100"
                              }`}
                            >
                              <span className={`text-[10px] font-extrabold px-1 rounded ${
                                isOpen ? "bg-white/80 text-emerald-700" : "bg-slate-200 text-slate-500"
                              }`}>
                                {isOpen ? "✓" : "✕"}
                              </span>
                              <span>{c.shortLabel}</span>
                              <span className="text-[9px] opacity-75 font-normal">({c.badge})</span>
                            </button>
                          );
                        })}
                        {openedClasses.length === 0 && (
                          <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            ⚠️ Tidak ada kelas dibuka
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Pengaturan Grade Hasil Ujian (Analisis Kategori Camaba) */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white py-4 px-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2 text-white">
                    <Award className="w-5 h-5 text-amber-400" />
                    Pengaturan Grade Hasil Ujian CBT (Rentang Nilai & Analisis Kategori)
                  </CardTitle>
                  <CardDescription className="text-xs text-purple-200 mt-0.5">
                    Atur rentang skor nilai dan nama Grade yang otomatis didapatkan camaba seketika setelah menyelesaikan tes seleksi CBT.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const defaultGrades = [
                        {
                          grade: "Grade A",
                          min_score: 85.0,
                          max_score: 100.0,
                          label: "Sangat Baik / Lolos Utama (Beasiswa)",
                          badge_color: "emerald",
                          description: "Hasil ujian sangat memuaskan. Direkomendasikan beasiswa dan prioritas alokasi kelas.",
                        },
                        {
                          grade: "Grade B",
                          min_score: 70.0,
                          max_score: 84.99,
                          label: "Baik / Lolos Reguler",
                          badge_color: "sky",
                          description: "Lolos seleksi penerimaan mahasiswa baru jalur reguler.",
                        },
                        {
                          grade: "Grade C",
                          min_score: 55.0,
                          max_score: 69.99,
                          label: "Cukup / Lolos Bersyarat",
                          badge_color: "amber",
                          description: "Lolos seleksi bersyarat (wajib mengikuti program matrikulasi dasar).",
                        },
                        {
                          grade: "Grade D",
                          min_score: 0.0,
                          max_score: 54.99,
                          label: "Kurang / Ujian Ulang",
                          badge_color: "rose",
                          description: "Nilai belum mencapai batas kelulusan minimal. Diizinkan ujian remedial / seleksi ulang.",
                        },
                      ];
                      setSettings({ ...settings, cbt_grade_settings: defaultGrades });
                      toast.success("Preset Rentang Grade berhasil di-reset ke nilai standar!");
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/10 text-purple-200 hover:bg-white/20 transition-colors border border-white/20 cursor-pointer"
                  >
                    Reset Preset Standard
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4 bg-white">
              <div className="space-y-3">
                {(settings.cbt_grade_settings || [
                  { grade: "Grade A", min_score: 85, max_score: 100, label: "Sangat Baik / Beasiswa", badge_color: "emerald", description: "Hasil ujian sangat memuaskan. Direkomendasikan beasiswa dan prioritas alokasi kelas." },
                  { grade: "Grade B", min_score: 70, max_score: 84.99, label: "Baik / Lolos Reguler", badge_color: "sky", description: "Lolos seleksi penerimaan mahasiswa baru jalur reguler." },
                  { grade: "Grade C", min_score: 55, max_score: 69.99, label: "Cukup / Lolos Bersyarat", badge_color: "amber", description: "Lolos seleksi bersyarat (wajib mengikuti program matrikulasi dasar)." },
                  { grade: "Grade D", min_score: 0, max_score: 54.99, label: "Kurang / Ujian Ulang", badge_color: "rose", description: "Nilai belum mencapai batas kelulusan minimal." },
                ]).map((g, idx) => {
                  const updateGradeField = (field, val) => {
                    const currentList = [...(settings.cbt_grade_settings || [])];
                    if (!currentList[idx]) return;
                    currentList[idx] = { ...currentList[idx], [field]: val };
                    setSettings({ ...settings, cbt_grade_settings: currentList });
                  };

                  const removeGradeRow = () => {
                    const currentList = (settings.cbt_grade_settings || []).filter((_, i) => i !== idx);
                    setSettings({ ...settings, cbt_grade_settings: currentList });
                  };

                  return (
                    <div key={idx} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white transition-all space-y-2 shadow-2xs">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                        {/* Grade Title & Badge Color */}
                        <div className="sm:col-span-3 flex items-center gap-2">
                          <Input
                            value={g.grade || ""}
                            onChange={(e) => updateGradeField("grade", e.target.value)}
                            placeholder="Nama Grade (misal Grade A)"
                            className="text-xs font-bold bg-white border-slate-300 h-8"
                          />
                          <select
                            value={g.badge_color || "sky"}
                            onChange={(e) => updateGradeField("badge_color", e.target.value)}
                            className="text-[11px] font-bold h-8 px-2 rounded-lg border border-slate-300 bg-white"
                          >
                            <option value="emerald">Hijau (Emerald)</option>
                            <option value="sky">Biru (Sky)</option>
                            <option value="purple">Ungu (Purple)</option>
                            <option value="amber">Kuning (Amber)</option>
                            <option value="rose">Merah (Rose)</option>
                          </select>
                        </div>

                        {/* Min - Max Score Range */}
                        <div className="sm:col-span-3 flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500 shrink-0">Skor:</span>
                          <Input
                            type="number"
                            step="0.1"
                            value={g.min_score ?? 0}
                            onChange={(e) => updateGradeField("min_score", parseFloat(e.target.value) || 0)}
                            className="text-xs font-mono h-8 bg-white text-center"
                            placeholder="Min"
                          />
                          <span className="text-slate-400 font-bold text-xs">-</span>
                          <Input
                            type="number"
                            step="0.1"
                            value={g.max_score ?? 100}
                            onChange={(e) => updateGradeField("max_score", parseFloat(e.target.value) || 100)}
                            className="text-xs font-mono h-8 bg-white text-center"
                            placeholder="Max"
                          />
                        </div>

                        {/* Label / Status */}
                        <div className="sm:col-span-5">
                          <Input
                            value={g.label || ""}
                            onChange={(e) => updateGradeField("label", e.target.value)}
                            placeholder="Status / Label Kategori (misal: Sangat Baik / Lolos Beasiswa)"
                            className="text-xs font-semibold bg-white border-slate-300 h-8"
                          />
                        </div>

                        {/* Delete Action */}
                        <div className="sm:col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={removeGradeRow}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
                            title="Hapus Grade"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Description / Recommendation Note */}
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
                        <span className="text-[10px] font-bold text-slate-500 shrink-0">Catatan Rekomendasi:</span>
                        <Input
                          value={g.description || ""}
                          onChange={(e) => updateGradeField("description", e.target.value)}
                          placeholder="Pesan rekomendasi yang ditampilkan ke camaba setelah ujian (contoh: Lolos seleksi dengan nilai sangat baik...)"
                          className="text-xs text-slate-700 bg-white border-slate-200 h-7 text-[11px]"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const currentList = [...(settings.cbt_grade_settings || [])];
                    currentList.push({
                      grade: `Grade ${String.fromCharCode(65 + currentList.length)}`,
                      min_score: 50,
                      max_score: 69.99,
                      label: "Lolos Kategori",
                      badge_color: "sky",
                      description: "Catatan penentuan grade camaba.",
                    });
                    setSettings({ ...settings, cbt_grade_settings: currentList });
                  }}
                  className="text-xs font-bold text-purple-700 border-purple-300 hover:bg-purple-50 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Tambah Rentang Grade Baru
                </Button>
                <p className="text-[10px] text-slate-500 font-medium italic">
                  💡 Poin nilai camaba akan dihitung otomatis & grade langsung muncul begitu ujian dikumpulkan.
                </p>
              </div>
            </CardContent>
          </Card>

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

          {/* Card: Pengaturan Ruangan Ujian Offline & Validasi Koordinat GPS */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-sky-900 via-indigo-950 to-slate-900 text-white py-4 px-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2 text-white">
                    <MapPin className="w-5 h-5 text-sky-400" />
                    Pengaturan Ruangan CBT Offline & Validasi Geolocation GPS
                  </CardTitle>
                  <CardDescription className="text-slate-300 text-xs mt-0.5">
                    Tentukan titik koordinat GPS laboratorium CBT kampus dan radius toleransi jarak meter untuk memvalidasi kehadiran fisik camaba yang memilih ujian offline.
                  </CardDescription>
                </div>
                <Badge className={`text-xs font-bold px-3 py-1 ${
                  settings.offline_test_enforce_gps !== false ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-300 border border-slate-600"
                }`}>
                  {settings.offline_test_enforce_gps !== false ? "Validasi GPS AKTIF" : "Validasi GPS NONAKTIF"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 text-sm">Wajibkan Verifikasi Radius GPS Ruangan untuk Ujian Offline</h4>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                    Ketika aktif, calon mahasiswa yang memilih ujian offline wajib berada dalam radius ruangan yang ditentukan saat menekan tombol Mulai Ujian CBT di browser mereka.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, offline_test_enforce_gps: settings.offline_test_enforce_gps === false })}
                  className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.offline_test_enforce_gps !== false ? "bg-sky-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.offline_test_enforce_gps !== false ? "translate-x-7" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-bold">Nama Ruangan / Laboratorium Ujian</Label>
                  <Input
                    value={settings.offline_test_room_name || ""}
                    onChange={(e) => setSettings({ ...settings, offline_test_room_name: e.target.value })}
                    placeholder="Lab Komputer Gedung B Lt. 3"
                    className="text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold">Radius Jarak yang Diizinkan (Meter)</Label>
                  <Input
                    type="number"
                    min={10}
                    max={5000}
                    value={settings.offline_test_radius_meters || 100}
                    onChange={(e) => setSettings({ ...settings, offline_test_radius_meters: parseInt(e.target.value) || 100 })}
                    placeholder="100"
                    className="text-xs mt-1"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 p-4 rounded-xl bg-sky-50/50 border border-sky-200">
                <div>
                  <Label className="text-xs font-bold text-sky-950">Latitude Ruangan (Contoh: -6.208800)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={settings.offline_test_lat ?? ""}
                    onChange={(e) => setSettings({ ...settings, offline_test_lat: parseFloat(e.target.value) || null })}
                    placeholder="-6.208800"
                    className="text-xs mt-1 font-mono bg-white"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-sky-950">Longitude Ruangan (Contoh: 106.845600)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={settings.offline_test_lng ?? ""}
                    onChange={(e) => setSettings({ ...settings, offline_test_lng: parseFloat(e.target.value) || null })}
                    placeholder="106.845600"
                    className="text-xs mt-1 font-mono bg-white"
                  />
                </div>
                <div className="sm:col-span-2 flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <p className="text-[11px] text-sky-800">
                    Bisa mengisi koordinat manual dari Google Maps atau klik tombol otomatis di sebelah kanan:
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGetCurrentLocationForGps}
                    className="bg-white border-sky-300 text-sky-800 hover:bg-sky-100 text-xs font-bold shrink-0"
                  >
                    <MapPin className="w-3.5 h-3.5 mr-1.5 text-sky-600" /> Ambil Koordinat GPS Saya Saat Ini
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Program Referal */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-indigo-900 via-violet-900 to-indigo-900 text-white py-4 px-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2 text-white">
                    <Gift className="w-5 h-5 text-amber-300" />
                    Program Referal PMB
                  </CardTitle>
                  <CardDescription className="text-indigo-100 text-xs mt-0.5">
                    Pisahkan status operasional program referal dari penayangan kampanyenya di landing page.
                  </CardDescription>
                </div>
                <Badge className={`text-xs font-bold px-3 py-1 ${
                  settings.referral_enabled !== false ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-300 border border-slate-600"
                }`}>
                  {settings.referral_enabled !== false ? "Referal AKTIF" : "Referal NONAKTIF"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border transition-all ${
                settings.referral_enabled !== false ? "bg-emerald-50/50 border-emerald-300" : "bg-slate-50 border-slate-200"
              }`}>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 text-sm">Aktifkan program referal</h4>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                    Saat Off, pendaftaran promotor dan penggunaan kode referal baru dinonaktifkan. Riwayat promotor serta komisi lama tetap tersimpan.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Aktifkan program referal"
                  aria-pressed={settings.referral_enabled !== false}
                  onClick={() => setSettings({ ...settings, referral_enabled: settings.referral_enabled === false })}
                  className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.referral_enabled !== false ? "bg-emerald-600" : "bg-slate-300"
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    settings.referral_enabled !== false ? "translate-x-7" : "translate-x-0"
                  }`} />
                </button>
              </div>

              <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border transition-all ${
                settings.landing_sections_visibility?.referral !== false ? "bg-violet-50/50 border-violet-300" : "bg-slate-50 border-slate-200"
              }`}>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 text-sm">Tampilkan kampanye referal di landing page</h4>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                    Atur visibilitas section kampanye “Mitra Referal” pada landing page PMB. Switch ini tidak mematikan program referal.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Tampilkan kampanye referal di landing page"
                  aria-pressed={settings.landing_sections_visibility?.referral !== false}
                  onClick={() => setSettings({
                    ...settings,
                    landing_sections_visibility: {
                      ...(settings.landing_sections_visibility || {}),
                      referral: settings.landing_sections_visibility?.referral === false,
                    },
                  })}
                  className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.landing_sections_visibility?.referral !== false ? "bg-violet-600" : "bg-slate-300"
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    settings.landing_sections_visibility?.referral !== false ? "translate-x-7" : "translate-x-0"
                  }`} />
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Perubahan diterapkan setelah menekan tombol <strong>Simpan Seluruh Pengaturan PMB</strong> di bagian bawah halaman.
              </p>
            </CardContent>
          </Card>

          {/* Card 3: Switch Metode Pembayaran PMB */}
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
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs font-bold">Nama Periode / Gelombang Aktif</Label>
                    <Input
                      value={settings.active_period_name || ""}
                      onChange={(e) => setSettings({ ...settings, active_period_name: e.target.value })}
                      className="text-xs mt-1"
                      placeholder="contoh: Tahun Akademik 2026/2027 Gelombang 1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold flex items-center justify-between">
                      <span>Prefix Tahun Ajaran (NIM)</span>
                      <span className="text-[9px] text-indigo-700 font-bold bg-indigo-50 px-1 py-0.5 rounded border border-indigo-200">
                        2627 untuk TA 2026/2027
                      </span>
                    </Label>
                    <Input
                      value={settings.nim_prefix || "2627"}
                      onChange={(e) => setSettings({ ...settings, nim_prefix: e.target.value })}
                      className="text-xs mt-1 font-mono font-bold"
                      placeholder="contoh: 2627"
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

                {/* Penandatangan SK Penerimaan & Lokasi Terbit */}
                <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-3">
                  <h4 className="font-bold text-indigo-950 text-xs flex items-center gap-1.5 uppercase tracking-wider">
                    <FileCheck className="w-4 h-4 text-indigo-600" /> Pengaturan Penandatangan SK Penerimaan & Kota Terbit
                  </h4>
                  <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs font-bold">Kota Terbit SK / Lokasi Kampus</Label>
                      <Input
                        value={settings.campus_city ?? "Jakarta"}
                        onChange={(e) => setSettings({ ...settings, campus_city: e.target.value })}
                        placeholder="contoh: Jakarta / Bandung / Surabaya"
                        className="text-xs mt-1 bg-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold">Nama Ketua Panitia PMB</Label>
                      <Input
                        value={settings.pmb_lead_name ?? "Dr. Muhammad Farhan, S.Kom., M.T."}
                        onChange={(e) => setSettings({ ...settings, pmb_lead_name: e.target.value })}
                        placeholder="contoh: Dr. Muhammad Farhan, S.Kom., M.T."
                        className="text-xs mt-1 bg-white font-bold"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold">NIP / NIDN Ketua PMB</Label>
                      <Input
                        value={settings.pmb_lead_nip ?? "NIP. 198503152010121003"}
                        onChange={(e) => setSettings({ ...settings, pmb_lead_nip: e.target.value })}
                        placeholder="contoh: NIP. 198503152010121003"
                        className="text-xs mt-1 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold">Jabatan Penandatangan</Label>
                      <Input
                        value={settings.pmb_lead_title ?? "Ketua Panitia PMB"}
                        onChange={(e) => setSettings({ ...settings, pmb_lead_title: e.target.value })}
                        placeholder="contoh: Ketua Panitia PMB"
                        className="text-xs mt-1 bg-white"
                      />
                    </div>
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

      {/* SK Approval Modal */}
      {skApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
            <div className="bg-gradient-to-r from-amber-600 to-indigo-700 p-4 text-white flex justify-between items-center">
              <h4 className="font-bold text-sm flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-300" /> Penerbitan SK Penerimaan Mahasiswa Baru
              </h4>
              <button
                onClick={() => setSkApprovalModal(null)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3.5 text-xs">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <p className="text-[10px] text-slate-500 font-bold uppercase">Calon Mahasiswa:</p>
                <p className="font-bold text-slate-900 text-sm">{skApprovalModal.name}</p>
                <p className="text-slate-600 font-mono text-[11px]">{skApprovalModal.registration_number} • {skApprovalModal.prodi_name}</p>
                <div className="flex items-center gap-2 pt-1">
                  <Badge className="bg-emerald-600 text-white text-[9px]">Skor CBT: {skApprovalModal.test_score || 0}</Badge>
                  <Badge variant="outline" className="text-[9px] capitalize">{skApprovalModal.class_type} ({skApprovalModal.learning_mode})</Badge>
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold">Nomor SK Penerimaan (LoA) *</Label>
                <Input
                  value={skNumber}
                  onChange={(e) => setSkNumber(e.target.value)}
                  placeholder={`SK-PMB/2026/${skApprovalModal.registration_number}`}
                  className="mt-1 text-xs font-mono font-bold text-indigo-700 bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold">Tanggal SK Penetapan</Label>
                  <Input
                    value={skDate}
                    onChange={(e) => setSkDate(e.target.value)}
                    placeholder="12/08/2026"
                    className="mt-1 text-xs bg-white"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold">Pejabat / Penandatangan</Label>
                  <Input
                    value={skApprover}
                    onChange={(e) => setSkApprover(e.target.value)}
                    placeholder="Panitia PMB & BAAK"
                    className="mt-1 text-xs bg-white"
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Setelah disetujui, Calon Mahasiswa dapat langsung mencetak Surat Keputusan Penerimaan resmi pada Alur 8 dan melanjutkan ke Daftar Ulang (Alur 9).
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setSkApprovalModal(null)}>
                  Batal
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleApproveAdmission(skApprovalModal.id, skNumber, skDate, skApprover)}
                  className="bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 text-white font-bold"
                >
                  <Check className="w-3.5 h-3.5 mr-1 inline" /> Setujui & Terbitkan SK
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

              {/* 5. Bukti Transfer & Status Pembayaran */}
              <div className="space-y-2">
                <h5 className="font-bold text-indigo-900 uppercase text-[11px] border-b pb-1">5. Bukti Transfer & Status Pembayaran Form</h5>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <div className="p-3 bg-slate-50 rounded-xl border space-y-1">
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase">Status Pendaftaran:</span>
                    <div>
                      <Badge className={selectedApplicant.reg_payment_status === "verified" ? "bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold text-[10px]" : "bg-amber-500 text-white font-bold text-[10px]"}>
                        {selectedApplicant.reg_payment_status === "verified" ? "Lunas & Terverifikasi" : "Menunggu Verifikasi Admin"}
                      </Badge>
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border space-y-1">
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase">Dokumen Bukti Transfer:</span>
                    <div>
                      {selectedApplicant.reg_payment_proof ? (
                        <button
                          type="button"
                          onClick={() => setPreviewProofModal({ url: resolveMediaUrl(selectedApplicant.reg_payment_proof), title: `Bukti Transfer Form Pendaftaran - ${selectedApplicant.name}` })}
                          className="text-xs text-indigo-600 font-extrabold hover:underline inline-flex items-center gap-1 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 mt-0.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" /> Preview Bukti Transfer Bank
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Belum ada unggahan bukti</span>
                      )}
                    </div>
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

      {/* Payment History & Remaining Balance Modal */}
      {paymentHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col animate-fade-in">
            <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-900 p-4 text-white flex justify-between items-center shrink-0">
              <div>
                <h4 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-indigo-300" /> Histori Pembayaran & Sisa Kurang Bayar PMB
                </h4>
                <p className="text-xs text-indigo-200 font-semibold mt-0.5">
                  {paymentHistoryModal.applicant.name} • No. Reg: {paymentHistoryModal.applicant.registration_number} • Prodi: {paymentHistoryModal.applicant.prodi_name}
                </p>
              </div>
              <button
                onClick={() => setPaymentHistoryModal(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white font-bold"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <p className="text-[10px] font-extrabold uppercase text-slate-500">Formulir Pendaftaran</p>
                  <p className="text-xs font-bold text-slate-800">Total: {formatRupiah(paymentHistoryModal.balances.reg_fee_total)}</p>
                  <p className="text-xs font-semibold text-emerald-700">Terbayar: {formatRupiah(paymentHistoryModal.balances.reg_fee_paid)}</p>
                  <p className={`text-xs font-extrabold ${paymentHistoryModal.balances.reg_fee_remaining > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    Sisa: {formatRupiah(paymentHistoryModal.balances.reg_fee_remaining)}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <p className="text-[10px] font-extrabold uppercase text-slate-500">Biaya Pra-Studi</p>
                  <p className="text-xs font-bold text-slate-800">Total: {formatRupiah(paymentHistoryModal.balances.pra_fee_total)}</p>
                  <p className="text-xs font-semibold text-emerald-700">Terbayar: {formatRupiah(paymentHistoryModal.balances.pra_fee_paid)}</p>
                  <p className={`text-xs font-extrabold ${paymentHistoryModal.balances.pra_fee_remaining > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    Sisa: {formatRupiah(paymentHistoryModal.balances.pra_fee_remaining)}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 space-y-1">
                  <p className="text-[10px] font-extrabold uppercase text-indigo-900">Total Sisa Kurang Bayar PMB</p>
                  <p className="text-xl font-black text-rose-600 font-mono">
                    {formatRupiah(paymentHistoryModal.balances.total_remaining_balance)}
                  </p>
                  <Badge className={paymentHistoryModal.balances.total_remaining_balance <= 0 ? "bg-emerald-600 text-white text-[9px] font-bold" : "bg-amber-600 text-white text-[9px] font-bold"}>
                    {paymentHistoryModal.balances.total_remaining_balance <= 0 ? "LUNAS KESELURUHAN" : "MASIH ADA TUNGGAKAN"}
                  </Badge>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="space-y-2">
                <h5 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">Histori Seluruh Transaksi Pembayaran</h5>
                {paymentHistoryModal.balances.payment_history?.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-x-auto">
                    <Table className="text-xs">
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="font-bold">Tanggal</TableHead>
                          <TableHead className="font-bold">Kategori & Skema</TableHead>
                          <TableHead className="font-bold">Nominal Custom</TableHead>
                          <TableHead className="font-bold">Total Ditagih</TableHead>
                          <TableHead className="font-bold">Metode & Bukti</TableHead>
                          <TableHead className="font-bold">Status</TableHead>
                          <TableHead className="text-center font-bold">Aksi Admin</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paymentHistoryModal.balances.payment_history.map((tx, idx) => (
                          <TableRow key={tx.id || idx}>
                            <TableCell className="font-mono text-[10px] whitespace-nowrap">{tx.created_at ? new Date(tx.created_at).toLocaleString("id-ID") : "-"}</TableCell>
                            <TableCell className="capitalize font-bold">
                              {tx.category === "registration" ? "Pendaftaran" : "Pra-Studi"}
                              <span className="block text-[9px] text-slate-500 font-normal">Skema: {tx.scheme || "full"}</span>
                            </TableCell>
                            <TableCell className="font-mono font-bold text-indigo-700">{formatRupiah(tx.custom_amount || tx.billed_amount)}</TableCell>
                            <TableCell className="font-mono text-slate-600">{formatRupiah(tx.billed_amount)} <span className="text-[9px] text-amber-700 block font-bold">Kode: {tx.unique_code || "-"}</span></TableCell>
                            <TableCell>
                              <span className="font-bold block">{tx.payment_method}</span>
                              {tx.payment_proof && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewProofModal({ url: resolveMediaUrl(tx.payment_proof), title: `Bukti Transfer (${tx.category === "registration" ? "Pendaftaran" : "Pra-Studi"}) - ${paymentHistoryModal.applicant?.name || "Pendaftar"}` })}
                                  className="text-[10px] text-indigo-600 font-bold hover:underline flex items-center gap-0.5 cursor-pointer mt-0.5"
                                >
                                  <Eye className="w-3 h-3" /> Preview Bukti
                                </button>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge className={tx.status === "verified" ? "bg-emerald-600 text-white text-[9px] font-bold" : tx.status === "rejected" ? "bg-rose-600 text-white text-[9px] font-bold" : "bg-amber-600 text-white text-[9px] font-bold"}>
                                {tx.status === "verified" ? "Disetujui" : tx.status === "rejected" ? "Ditolak" : "Pending"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              {tx.status !== "verified" ? (
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handleVerifyTransaction(paymentHistoryModal.applicant.id, tx.id, "approve")}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] h-5 px-2 font-bold"
                                  >
                                    Setujui
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleVerifyTransaction(paymentHistoryModal.applicant.id, tx.id, "reject")}
                                    className="text-[9px] h-5 px-2 font-bold"
                                  >
                                    Tolak
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-emerald-700 font-extrabold text-[10px]">Verified</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-xl border border-slate-200">Belum ada transaksi pembayaran custom/reguler yang tercatat.</p>
                )}
              </div>
            </div>

            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-end shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={() => setPaymentHistoryModal(null)}>
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Proof Preview Modal */}
      {previewProofModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 px-5 py-4 text-white flex justify-between items-center shrink-0">
              <div>
                <h4 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                  <Eye className="w-5 h-5 text-sky-400" /> {previewProofModal.title || "Preview Bukti Transfer"}
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewProofModal.url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open / Download File
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewProofModal(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white font-bold transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-100 flex items-center justify-center min-h-[350px]">
              {previewProofModal.url?.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  src={previewProofModal.url}
                  className="w-full h-[70vh] rounded-xl border border-slate-300 shadow-xs"
                  title="Preview PDF Bukti Transfer"
                />
              ) : (
                <div className="relative max-h-[75vh] flex items-center justify-center">
                  <img
                    src={previewProofModal.url}
                    alt="Preview Bukti Transfer"
                    className="max-h-[72vh] max-w-full object-contain rounded-xl shadow-lg border border-slate-200"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      const fallback = e.target.nextSibling;
                      if (fallback) fallback.style.display = 'block';
                    }}
                  />
                  <div style={{ display: 'none' }} className="text-center space-y-3 p-8 bg-white rounded-2xl shadow-sm border border-slate-200">
                    <FileText className="w-12 h-12 text-slate-400 mx-auto" />
                    <p className="text-sm font-bold text-slate-700">Preview dokumen tidak dapat ditampilkan langsung sebagai gambar.</p>
                    <a
                      href={previewProofModal.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs"
                    >
                      <ExternalLink className="w-4 h-4" /> Buka Berkas di Tab Baru
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
