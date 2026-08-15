import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { apiErrorMessage, resolveMediaUrl } from "@/lib/utils";
import {
  User,
  CreditCard,
  MessageSquare,
  Sparkles,
  Shirt,
  Calendar,
  Building,
  ArrowRight,
  BookOpen,
  Award,
  Layers,
  RefreshCw,
  Gift,
  GraduationCap,
  Handshake,
  Monitor,
  Landmark,
  Rocket,
  Trophy,
  Check,
  Video,
  Lock,
  AlertCircle,
  Printer,
  MapPin,
  FileCheck,
  ChevronDown,
  FileText,
  Clock,
  Send,
  Eye,
  LogOut,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Key,
  ExternalLink,
} from "lucide-react";

const formatLongDateIndonesian = (dateVal) => {
  if (!dateVal) {
    const d = new Date();
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  }
  if (typeof dateVal === "string" && /[a-zA-Z]/.test(dateVal) && !dateVal.includes("/")) {
    return dateVal;
  }
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  } catch (e) {
    return String(dateVal);
  }
};

import { ReferralRegistrationModal } from "./ReferralComponents";
import { PmbExamPage } from "./PmbExamPage";
import { PmbWhatsAppFloatingWidget } from "./PmbWhatsAppFloatingWidget";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") || window.location.origin;
const api = axios.create({ baseURL: BACKEND_URL });

const getCampusDisplayName = (branding) => branding?.campus_code?.trim() || branding?.campus_name?.trim() || branding?.name?.trim() || "POLITEKNIK SCI";

const STEPS = [
  { id: 1, label: "Formulir", desc: "Data Diri & Asal Sekolah", icon: User },
  { id: 2, label: "Pilihan Kelas", desc: "4 Jenis Kelas & Prodi", icon: BookOpen },
  { id: 3, label: "Pembayaran", desc: "Biaya Formulir PMB", icon: CreditCard },
  { id: 4, label: "Grup WA", desc: "Gabung Grup Resmi PMB", icon: MessageSquare },
  { id: 5, label: "Pilih Tes", desc: "Online CBT / Offline Kampus", icon: Layers },
  { id: 6, label: "Ujian Seleksi", desc: "Jadwal & Ruang CBT Ujian", icon: Building },
  { id: 7, label: "Wawancara", desc: "Pilih Jadwal & Google Meet", icon: Video },
  { id: 8, label: "SK Penerimaan", desc: "Approval & LoA Kelulusan", icon: Award },
  { id: 9, label: "Daftar Ulang", desc: "Pra-Studi & Jas Almamater", icon: Shirt },
  { id: 10, label: "Masuk SIAKAD", desc: "Sibermaru & Klaim NIM", icon: GraduationCap },
];

function formatRupiah(num) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num || 0);
}

export function CamabaPortal({ token, onLogout, onSwitchToStudent, branding }) {
  const campusDisplayName = getCampusDisplayName(branding);
  const [applicant, setApplicant] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(1);
  const [showReferralModal, setShowReferralModal] = useState(false);

  // Form edit states
  const [formData, setFormData] = useState({});
  const [examSession, setExamSession] = useState(null);
  const [examSessionStatus, setExamSessionStatus] = useState(null);
  const [examAttempts, setExamAttempts] = useState([]);
  const [interviewSchedules, setInterviewSchedules] = useState([]);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [admissionLetter, setAdmissionLetter] = useState(null);
  const [examOpen, setExamOpen] = useState(false);
  const [examToken, setExamToken] = useState("");
  const [selectedShirtSize, setSelectedShirtSize] = useState("L");
  const [shirtNotes, setShirtNotes] = useState("");
  const [sibermaruContact, setSibermaruContact] = useState({ name: "", phone: "", notes: "" });
  const [paymentQuote, setPaymentQuote] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("QRIS");
  const [proofFile, setProofFile] = useState(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [praPayScheme, setPraPayScheme] = useState("full");
  const [praPayTerm, setPraPayTerm] = useState(1);
  const [regPayMode, setRegPayMode] = useState("full");
  const [regCustomAmount, setRegCustomAmount] = useState(250000);
  const [praCustomAmount, setPraCustomAmount] = useState(500000);

  // Available payment methods computed dynamically from settings
  const availablePaymentMethods = useMemo(() => {
    const pm = settings?.payment_methods || {};
    const list = [];
    if (settings?.payment_method_qris !== false && pm.qris !== false) {
      list.push({ id: "QRIS", label: "QRIS Instan (Verifikasi Otomatis)", desc: "Scan kode QR standar nasional" });
    }
    if (settings?.payment_method_va_mandiri !== false && pm.va_mandiri !== false) {
      list.push({ id: "VA_MANDIRI", label: "Mandiri Virtual Account", desc: "Tagihan VA Bank Mandiri" });
    }
    if (settings?.payment_method_va_bca !== false && pm.va_bca !== false) {
      list.push({ id: "VA_BCA", label: "BCA Virtual Account", desc: "Tagihan VA Bank BCA" });
    }
    if (settings?.payment_method_manual !== false && pm.manual_transfer !== false) {
      list.push({ id: "MANUAL", label: "Transfer Bank Manual (Unggah Bukti)", desc: "Transfer rekening & unggah struk" });
    }
    return list;
  }, [settings]);

  // Keep paymentMethod synchronized with available methods
  useEffect(() => {
    if (availablePaymentMethods.length > 0) {
      const exists = availablePaymentMethods.some((m) => m.id === paymentMethod);
      if (!exists) {
        setPaymentMethod(availablePaymentMethods[0].id);
      }
    }
  }, [availablePaymentMethods, paymentMethod]);

  const fetchApplication = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/v1/pmb/my-application", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.ok) {
        setApplicant(res.data.applicant);
        setSettings(res.data.settings);
        setFormData(res.data.applicant);
        const curr = res.data.applicant.current_step || 1;
        const hasTestCompleted = Boolean(
          res.data.applicant.test_completed_at ||
          res.data.applicant.test_grade ||
          res.data.applicant.test_score != null ||
          (res.data.applicant.test_status && !["pending", "not_started", "untested", ""].includes(res.data.applicant.test_status))
        );
        if (hasTestCompleted) {
          setActiveStep(Math.max(curr, 7));
        } else {
          setActiveStep(curr);
        }
        if (res.data.applicant.shirt_size) setSelectedShirtSize(res.data.applicant.shirt_size);
        if (res.data.applicant.emergency_contact_name) {
          setSibermaruContact({
            name: res.data.applicant.emergency_contact_name,
            phone: res.data.applicant.emergency_contact_phone,
            notes: res.data.applicant.health_notes || "",
          });
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Gagal memuat data pendaftaran PMB");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplication();
  }, [token]);

  const fetchExamSession = async () => {
    try {
      const res = await api.get("/api/v1/pmb/cbt/session", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.ok) {
        setExamSession(res.data.session || null);
        setExamSessionStatus(res.data.last_attempt || null);
        setExamAttempts(Array.isArray(res.data.attempts) ? res.data.attempts : []);
      }
    } catch (_) {
      setExamSession(null);
    }
  };

  useEffect(() => {
    fetchExamSession();
  }, [token]);

  const fetchInterviewSchedules = async () => {
    if (applicant?.test_status !== "passed") {
      setInterviewSchedules([]);
      return;
    }
    try {
      setInterviewLoading(true);
      const res = await api.get("/api/v1/pmb/interview/schedules", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.ok) setInterviewSchedules(res.data.schedules || []);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal memuat jadwal wawancara"));
    } finally {
      setInterviewLoading(false);
    }
  };

  useEffect(() => {
    fetchInterviewSchedules();
  }, [token, applicant?.test_status, applicant?.interview_schedule_id]);

  const handleSelectInterviewSchedule = async (scheduleId) => {
    try {
      const res = await api.post(
        "/api/v1/pmb/interview/select",
        { schedule_id: scheduleId },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.data?.ok) {
        toast.success(res.data.message || "Jadwal wawancara berhasil dipilih");
        setApplicant((prev) => ({ ...prev, ...(res.data.applicant || {}), interview_schedule: res.data.interview || prev?.interview_schedule }));
        setActiveStep(8);
        await fetchApplication();
        await fetchInterviewSchedules();
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal memilih jadwal wawancara"));
    }
  };

  useEffect(() => {
    if (activeStep === 6) {
      fetchExamSession();
    }
  }, [activeStep]);

  const fetchAdmissionLetter = async () => {
    try {
      const res = await api.get("/api/v1/pmb/admission-letter", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.ok) {
        setAdmissionLetter(res.data);
      }
    } catch (_) {
      setAdmissionLetter(null);
    }
  };

  useEffect(() => {
    fetchAdmissionLetter();
  }, [token]);

  const fetchPaymentQuote = async () => {
    try {
      const res = await api.get("/api/v1/pmb/payment-quote", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.ok) setPaymentQuote(res.data);
    } catch (_) {
      setPaymentQuote(null);
    }
  };

  useEffect(() => {
    fetchPaymentQuote();
  }, [token]);

  const uploadProof = async (file) => {
    setUploadingProof(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "registration");
      const res = await api.post("/api/v1/pmb/upload-payment-proof", fd, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data?.url || "";
    } catch (err) {
      toast.error(apiErrorMessage(err, "Upload bukti bayar gagal"));
      throw err;
    } finally {
      setUploadingProof(false);
    }
  };

  const handleConfirmStep1 = async () => {
    try {
      const res = await api.post(
        "/api/v1/pmb/step/confirm-1",
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.ok) {
        toast.success(res.data.message);
        setApplicant(res.data.applicant);
        setActiveStep(2);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal mengonfirmasi data diri"));
    }
  };

  const handleConfirmStep2 = async () => {
    try {
      const res = await api.post(
        "/api/v1/pmb/step/confirm-2",
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.ok) {
        toast.success(res.data.message);
        setApplicant(res.data.applicant);
        setActiveStep(3);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal mengonfirmasi pilihan kelas"));
    }
  };

  const handlePayRegistration = async () => {
    const method = paymentMethod.toUpperCase();
    try {
      let proof_url = "";
      if (method === "MANUAL") {
        if (!proofFile) {
          toast.error("Silakan unggah bukti transfer terlebih dahulu");
          return;
        }
        proof_url = await uploadProof(proofFile);
      }
      const payload = {
        payment_method: method,
        payment_proof_url: proof_url,
        custom_amount: regPayMode === "custom" ? Number(regCustomAmount) : null,
      };
      const res = await api.post(
        "/api/v1/pmb/pay-registration",
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.ok) {
        toast.success(res.data.message);
        setApplicant(res.data.applicant);
        setProofFile(null);
        if (res.data.applicant?.reg_payment_status === "verified") {
          setActiveStep(4);
        }
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Pembayaran gagal"));
    }
  };

  const handleJoinWa = async () => {
    try {
      const res = await api.post("/api/v1/pmb/join-wa", {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.ok) {
        window.open(res.data.wa_url, "_blank");
        setApplicant(res.data.applicant);
        setActiveStep(5);
      }
    } catch (err) {
      toast.error("Gagal bergabung grup WA");
    }
  };

  const handleChooseTest = async (type) => {
    if (type === "online" && settings?.online_test_enabled === false) {
      toast.error("Ujian Online (CBT) saat ini dinonaktifkan oleh panitia PMB. Silakan pilih Ujian Offline di Kampus.");
      return;
    }
    try {
      const res = await api.post(
        "/api/v1/pmb/choose-test-type",
        { test_type: type },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.ok) {
        toast.success(res.data.message);
        setApplicant(res.data.applicant);
        await fetchExamSession();
        setActiveStep(6);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal memilih metode tes"));
    }
  };

  const handleStartCbt = async () => {
    if (!examSession?.id) {
      toast.error("Belum ada sesi ujian CBT yang dijadwalkan panitia");
      return;
    }
    if (applicant?.test_type === "online" && settings?.online_test_enabled === false) {
      toast.error("Ujian Online (CBT) saat ini dinonaktifkan oleh panitia PMB.");
      return;
    }
    if (!examToken.trim()) {
      toast.error("Masukkan token ujian yang dibagikan panitia PMB");
      return;
    }
    setExamOpen(true);
  };

  const handleExamExit = async () => {
    setExamOpen(false);
    await fetchExamSession();
    await fetchApplication();
    await fetchAdmissionLetter();
  };

  const handlePayPraStudi = async (scheme = praPayScheme, term = praPayTerm) => {
    const method = paymentMethod.toUpperCase();
    try {
      let proof_url = "";
      if (method === "MANUAL") {
        if (!proofFile) {
          toast.error("Silakan unggah bukti transfer terlebih dahulu");
          return;
        }
        proof_url = await uploadProof(proofFile);
      }
      const payload = {
        scheme,
        term,
        payment_method: method,
        payment_proof_url: proof_url,
        custom_amount: scheme === "custom" ? Number(praCustomAmount) : null,
      };
      const res = await api.post(
        "/api/v1/pmb/reregister/pay",
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.ok) {
        toast.success(res.data.message);
        setApplicant(res.data.applicant);
        setProofFile(null);
        fetchPaymentQuote();
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal memproses pembayaran pra-studi"));
    }
  };

  const handleSaveShirtSize = async () => {
    try {
      const res = await api.post(
        "/api/v1/pmb/reregister/shirt-size",
        { shirt_size: selectedShirtSize, shirt_notes: shirtNotes },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.ok) {
        toast.success(res.data.message);
        setApplicant(res.data.applicant);
        setActiveStep(10);
      }
    } catch (err) {
      toast.error("Gagal menyimpan ukuran seragam");
    }
  };

  const handleConfirmSibermaru = async () => {
    if (!sibermaruContact.name || !sibermaruContact.phone) {
      toast.error("Harap isi nama dan nomor kontak darurat");
      return;
    }
    try {
      const res = await api.post(
        "/api/v1/pmb/sibermaru/confirm",
        {
          confirmed: true,
          emergency_contact_name: sibermaruContact.name,
          emergency_contact_phone: sibermaruContact.phone,
          health_notes: sibermaruContact.notes,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.ok) {
        toast.success(res.data.message);
        setApplicant(res.data.applicant);
        setActiveStep(10);
      }
    } catch (err) {
      toast.error("Gagal menyimpan konfirmasi Sibermaru");
    }
  };

  if (examOpen && examSession?.id) {
    return (
      <PmbExamPage
        token={examToken.trim()}
        authToken={token}
        sessionId={examSession.id}
        onExit={handleExamExit}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Memuat Portal Penerimaan Mahasiswa Baru...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-12">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-3 sm:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
          {branding?.campus_logo_url || branding?.logo_url ? (
            <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shadow-md border border-slate-200 overflow-hidden shrink-0">
              <img
                src={resolveMediaUrl(branding.campus_logo_url || branding.logo_url)}
                alt={campusDisplayName}
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  e.currentTarget.parentElement.innerHTML = `<div class="w-full h-full rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white font-bold"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/></svg></div>`;
                }}
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white font-black text-xl shadow-md shrink-0">
              <GraduationCap className="w-6 h-6" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-extrabold text-sm sm:text-base md:text-lg text-slate-900 leading-tight truncate">
              Portal PMB {campusDisplayName ? `• ${campusDisplayName}` : ""}
            </h1>
            <p className="text-[11px] text-slate-500 font-medium truncate">
              No. Reg: <span className="font-mono font-bold text-indigo-600">{applicant?.registration_number}</span> • {applicant?.period_name}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
          {settings?.referral_enabled !== false && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowReferralModal(true)}
              className="text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold flex items-center gap-1.5"
            >
              <Gift className="w-3.5 h-3.5" /> Dapatkan Fee Referal
            </Button>
          )}
          <div className="text-right hidden md:block">
            <p className="text-xs font-bold text-slate-900">{applicant?.name}</p>
            <p className="text-[11px] text-slate-500">{applicant?.prodi_name} ({applicant?.class_type?.toUpperCase()})</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="text-xs text-rose-600 hover:bg-rose-50 font-semibold ml-auto sm:ml-0"
          >
            Keluar
          </Button>
        </div>
      </header>

      {/* Referral Modal */}
      <ReferralRegistrationModal
        isOpen={showReferralModal}
        onClose={() => setShowReferralModal(false)}
        defaultCategory="student"
      />

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-3 sm:px-6 w-full pt-4 sm:pt-6 space-y-5">
        {/* Banner Referral Promo */}
        {applicant?.referral_code ? (
          <div className="p-3.5 bg-gradient-to-r from-indigo-50 to-sky-50 border border-indigo-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Handshake className="w-5 h-5 text-indigo-600 shrink-0" />
              <p className="text-xs text-indigo-900 font-medium">
                Pendaftaran Anda terhubung dengan Kode Referal Promotor: <strong className="font-mono font-bold text-indigo-700">{applicant.referral_code}</strong> ({applicant.referrer_name || "Mitra Kampus"})
              </p>
            </div>
            <Badge className="bg-indigo-600 text-white text-[10px] shrink-0">Referal Aktif</Badge>
          </div>
        ) : (
          <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Gift className="w-5 h-5 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-900 font-medium">
                Mau penghasilan tambahan? Ajak teman kuliah di sini dan dapatkan <strong>Fee hingga Rp 250.000 / Mahasiswa</strong>.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => setShowReferralModal(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-8 px-3.5 w-full sm:w-auto shrink-0 shadow-xs"
            >
              Daftar Referal
            </Button>
          </div>
        )}

        {/* 10-Step Progress Horizontal Stepper */}
        <Card className="border-slate-800 bg-slate-900 text-white shadow-xl overflow-hidden">
          <CardHeader className="bg-slate-950/90 border-b border-slate-800 py-3.5 px-4 sm:px-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-xs sm:text-sm font-bold flex items-center gap-2 text-white">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  Alur Seleksi Penerimaan Mahasiswa Baru
                </CardTitle>
                <CardDescription className="text-slate-300 text-[11px] sm:text-xs mt-0.5">
                  Ikuti 9 tahapan resmi berikut untuk menjadi Mahasiswa Aktif
                </CardDescription>
              </div>
              <Badge className="bg-indigo-600/40 text-indigo-200 border border-indigo-500/50 text-[10px] sm:text-xs px-2.5 py-0.5 font-bold shrink-0">
                Langkah {activeStep} / 9
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-2.5 sm:p-4 overflow-x-auto bg-slate-900 touch-pan-x">
            <div className="flex items-center justify-between min-w-[700px] sm:min-w-0 sm:w-full gap-1.5 sm:gap-2">
              {STEPS.map((st) => {
                const currentStepNum = applicant?.current_step || 1;
                const hasCompletedTest = Boolean(
                  applicant?.test_completed_at ||
                  applicant?.test_grade ||
                  applicant?.test_score != null ||
                  (applicant?.test_status && !["pending", "not_started", "untested", ""].includes(applicant?.test_status)) ||
                  examAttempts.some((att) => att.status === "submitted" || att.status === "auto_submitted" || Boolean(att.finished_at))
                );
                const isAccessible = hasCompletedTest
                  ? st.id >= 7 && st.id <= Math.max(currentStepNum, 7)
                  : st.id <= currentStepNum || (currentStepNum >= 5 && (st.id === 5 || st.id === 6));
                const isCurrent = activeStep === st.id;
                const isTestStage = (st.id === 5 || st.id === 6) && !hasCompletedTest;
                const isPassed = hasCompletedTest ? st.id <= 6 : st.id < currentStepNum;
                const isLocked = hasCompletedTest ? st.id <= 6 : !isAccessible;

                const handleStepClick = () => {
                  if (hasCompletedTest && st.id <= 6) {
                    toast.info(`Anda telah menyelesaikan Ujian Seleksi (Grade: ${applicant?.test_grade || "Grade A"}). Tahapan 1 s/d 6 telah selesai & terkunci.`);
                    return;
                  }
                  if (isLocked) {
                    toast.warning(`Alur ${st.id} (${st.label}) masih terkunci. Harap selesaikan tahapan sebelumnya terlebih dahulu.`);
                  } else {
                    setActiveStep(st.id);
                  }
                };

                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={handleStepClick}
                    className={`flex-1 min-w-[92px] sm:min-w-0 shrink-0 sm:shrink flex flex-col items-center text-center p-2 rounded-xl transition-all ${
                      isCurrent
                        ? "bg-indigo-600 text-white border-2 border-indigo-400 shadow-md cursor-pointer"
                        : isPassed
                        ? "bg-emerald-700/90 hover:bg-emerald-600 text-white border border-emerald-500/80 cursor-pointer"
                        : isTestStage
                        ? "bg-sky-600 hover:bg-sky-500 text-white border border-sky-400 cursor-pointer"
                        : isAccessible
                        ? "bg-emerald-700/90 hover:bg-emerald-600 text-white border border-emerald-500/80 cursor-pointer"
                        : "bg-slate-800 text-slate-300 border border-slate-700/80 cursor-not-allowed opacity-60"
                    }`}
                  >
                    <div
                      className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold mb-1 ${
                        isCurrent
                          ? "bg-white text-indigo-700 ring-2 ring-indigo-300"
                          : isPassed
                          ? "bg-white text-emerald-700"
                          : isTestStage
                          ? "bg-white text-sky-700"
                          : isAccessible
                          ? "bg-white text-emerald-700"
                          : "bg-slate-700 text-slate-300"
                      }`}
                    >
                      {isPassed ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" /> : isLocked ? <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : st.id}
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-bold line-clamp-1 text-white">{st.label}</span>
                    <span className="text-[8px] sm:text-[9px] line-clamp-1 font-medium opacity-90 text-slate-100">
                      {isCurrent ? "Sedang Berjalan" : isTestStage ? "Bisa Diulang" : isPassed ? "Selesai" : "Terkunci"}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Step Content Container */}
        <div className="space-y-6">
          {/* STEP 1: FORMULIR IDENTITAS & ASAL SEKOLAH */}
          {activeStep === 1 && (
            <Card className="border border-slate-200 bg-white shadow-md rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-900 text-white border-b border-slate-800 py-4 px-5 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <User className="w-5 h-5 text-indigo-400" />
                    Alur 1: Data Diri & Asal Sekolah Calon Mahasiswa
                  </CardTitle>
                  <Badge className="bg-indigo-600 text-white text-xs font-bold px-3 py-1">Langkah 1 / 9</Badge>
                </div>
                <CardDescription className="text-xs font-medium text-slate-300 mt-1">
                  Periksa kelengkapan identitas pribadi dan riwayat pendidikan asal sekolah Anda sebelum melanjutkan.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-5 text-xs bg-white text-slate-900">
                {/* 1. Identitas Lengkap */}
                <div className="space-y-2">
                  <p className="font-extrabold text-indigo-950 uppercase tracking-wider text-xs">1. Identitas Calon Mahasiswa</p>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200">
                      <p className="text-slate-700 font-extrabold text-[11px] uppercase">Nama Lengkap</p>
                      <p className="font-black text-slate-950 mt-0.5 text-sm">{applicant?.name}</p>
                    </div>
                    <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200">
                      <p className="text-slate-700 font-extrabold text-[11px] uppercase">Tempat, Tanggal Lahir</p>
                      <p className="font-black text-slate-950 mt-0.5">{applicant?.tempat_lahir || "-"}, {applicant?.tanggal_lahir || "-"}</p>
                    </div>
                    <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200">
                      <p className="text-slate-700 font-extrabold text-[11px] uppercase">No. HP / WhatsApp</p>
                      <p className="font-mono font-black text-slate-950 mt-0.5">{applicant?.whatsapp || "-"}</p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200">
                      <p className="text-slate-700 font-extrabold text-[11px] uppercase">NIK</p>
                      <p className="font-mono font-black text-slate-950 mt-0.5">{applicant?.nik || "-"}</p>
                    </div>
                    <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200">
                      <p className="text-slate-700 font-extrabold text-[11px] uppercase">NISN</p>
                      <p className="font-mono font-black text-slate-950 mt-0.5">{applicant?.nisn || "-"}</p>
                    </div>
                    <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200">
                      <p className="text-slate-700 font-extrabold text-[11px] uppercase">Nama Ibu Kandung</p>
                      <p className="font-black text-slate-950 mt-0.5">{applicant?.nama_ibu_kandung || "-"}</p>
                    </div>
                    <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200">
                      <p className="text-slate-700 font-extrabold text-[11px] uppercase">Tinggi / Berat Badan</p>
                      <p className="font-black text-slate-950 mt-0.5">{applicant?.tinggi_badan || "-"} cm / {applicant?.berat_badan || "-"} kg</p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200">
                      <p className="text-slate-700 font-extrabold text-[11px] uppercase">Email Aktif</p>
                      <p className="font-black text-slate-950 mt-0.5">{applicant?.email || "-"}</p>
                    </div>
                    <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200">
                      <p className="text-slate-700 font-extrabold text-[11px] uppercase">Alamat Lengkap</p>
                      <p className="font-bold text-slate-950 mt-0.5 line-clamp-2">{applicant?.alamat || "-"}</p>
                    </div>
                  </div>
                </div>

                {/* 2. Data Asal Sekolah */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <p className="font-extrabold text-indigo-950 uppercase tracking-wider text-xs">2. Data Asal Sekolah</p>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200">
                      <p className="text-slate-700 font-extrabold text-[11px] uppercase">Nama Sekolah</p>
                      <p className="font-black text-slate-950 mt-0.5">{applicant?.asal_sekolah || "-"}</p>
                    </div>
                    <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200">
                      <p className="text-slate-700 font-extrabold text-[11px] uppercase">NPSN Sekolah</p>
                      <p className="font-mono font-black text-slate-950 mt-0.5">{applicant?.npsn_sekolah || "-"}</p>
                    </div>
                    <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200">
                      <p className="text-slate-700 font-extrabold text-[11px] uppercase">Alamat Sekolah</p>
                      <p className="font-bold text-slate-950 mt-0.5">{applicant?.alamat_sekolah || "-"}</p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200">
                      <p className="text-slate-700 font-extrabold text-[11px] uppercase">Jurusan Saat Sekolah</p>
                      <p className="font-black text-slate-950 mt-0.5">{applicant?.jurusan_asal || "-"}</p>
                    </div>
                    <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200">
                      <p className="text-slate-700 font-extrabold text-[11px] uppercase">Tahun Lulus</p>
                      <p className="font-black text-slate-950 mt-0.5">{applicant?.tahun_lulus || "-"}</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <Button
                    type="button"
                    onClick={handleConfirmStep1}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 shadow-md"
                  >
                    Konfirmasi Data Diri & Lanjut ke Pilihan Kelas (Alur 2) <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 2: PILIHAN PROGRAM STUDI & KELAS */}
          {activeStep === 2 && (
            <Card className="border border-slate-200 bg-white shadow-md rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-900 text-white border-b border-slate-800 py-4 px-5 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-indigo-400" />
                    Alur 2: Pilihan Program Studi & Tipe Perkuliahan
                  </CardTitle>
                  <Badge className="bg-indigo-600 text-white text-xs font-bold px-3 py-1">Langkah 2 / 9</Badge>
                </div>
                <CardDescription className="text-xs font-medium text-slate-300 mt-1">
                  Pastikan pilihan program studi dan jenis kelas kuliah Anda sudah sesuai sebelum melanjutkan ke pembayaran biaya formulir.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-5 text-xs bg-white text-slate-900">
                <div className="space-y-2">
                  <p className="font-extrabold text-indigo-950 uppercase tracking-wider text-xs">Pilihan Program Studi Politeknik SCI</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="p-4 bg-sky-50/90 rounded-xl border border-sky-300 space-y-1">
                      <p className="text-sky-900 font-extrabold text-[11px] uppercase">PRODI PILIHAN 1 (UTAMA)</p>
                      <p className="text-base font-black text-sky-950">{applicant?.prodi_name}</p>
                      <p className="text-xs text-sky-800 font-bold">Kode: {applicant?.prodi_kode || "-"}</p>
                    </div>
                    <div className="p-4 bg-indigo-50/90 rounded-xl border border-indigo-300 space-y-1">
                      <p className="text-indigo-900 font-extrabold text-[11px] uppercase">PRODI PILIHAN 2 (CADANGAN)</p>
                      <p className="text-base font-black text-indigo-950">{applicant?.prodi_2_name || "Tidak memilih cadangan"}</p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3 pt-2">
                    <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200 space-y-1">
                      <p className="text-slate-700 text-[11px] font-extrabold uppercase">PILIHAN JENIS KELAS & WAKTU KULIAH</p>
                      <p className="font-black text-slate-950 text-sm">
                        {applicant?.class_type === "khusus"
                          ? "4. Kelas Khusus Offline (Kelas Eksekutif)"
                          : applicant?.class_type === "weekend"
                          ? "3. Kelas Weekend Online (Daring Akhir Pekan)"
                          : applicant?.learning_mode === "online"
                          ? "2. Kelas Reguler Online (Daring Penuh)"
                          : "1. Kelas Reguler Offline (Tatap Muka di Kampus)"}
                      </p>
                      <p className="text-xs text-slate-700 font-semibold">
                        {applicant?.class_type === "khusus"
                          ? "Kurikulum Khusus Eksekutif & Tatap Muka di Kampus"
                          : applicant?.class_type === "weekend"
                          ? "Daring Fleksibel Akhir Pekan (Sabtu - Minggu)"
                          : applicant?.learning_mode === "online"
                          ? "Daring Penuh LMS & Video Conference (Senin - Jumat)"
                          : "Tatap Muka di Ruang Kelas Kampus (Senin - Jumat)"}
                      </p>
                    </div>

                    <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200 space-y-1">
                      <p className="text-slate-700 text-[11px] font-extrabold uppercase">SUMBER INFORMASI PMB</p>
                      <p className="font-black text-slate-950 text-sm">{applicant?.info_source || "Media Sosial"}</p>
                      {applicant?.referrer_name && (
                        <p className="text-xs text-emerald-800 font-extrabold pt-0.5">
                          Promotor / Marketing: {applicant.referrer_name} ({applicant.referral_code})
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <Button
                    type="button"
                    onClick={handleConfirmStep2}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 shadow-md"
                  >
                    Konfirmasi Pilihan & Lanjut ke Pembayaran (Alur 3) <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 3: PEMBAYARAN FORMULIR */}
          {activeStep === 3 && (
            <Card className="border border-slate-200 bg-white shadow-md rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-900 text-white border-b border-slate-800 py-4 px-5 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-indigo-400" />
                    Alur 3: Pembayaran Biaya Pendaftaran
                  </CardTitle>
                  <Badge variant={applicant?.reg_payment_status === "verified" ? "default" : "destructive"} className="inline-flex items-center gap-1 font-extrabold px-3 py-1">
                    {applicant?.reg_payment_status === "verified" ? <><Check className="w-3.5 h-3.5" /> Terverifikasi</> : "Menunggu Pembayaran"}
                  </Badge>
                </div>
                <CardDescription className="text-xs font-medium text-slate-300 mt-1">
                  Pilih metode pembayaran yang didukung untuk melunasi biaya pendaftaran calon mahasiswa baru.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-5 text-xs bg-white text-slate-900">
                 <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200 space-y-4">
                   {/* Rekening tujuan */}
                   <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                     <div className="space-y-0.5">
                       <p className="text-[11px] uppercase tracking-widest text-slate-700 font-extrabold">Rekening Tujuan PMB</p>
                       <p className="font-black text-slate-950 text-base">{paymentQuote?.account?.bank_name || settings?.bank_account_name || "-"}</p>
                       <p className="font-mono text-indigo-700 text-base font-black">{paymentQuote?.account?.bank_account_number || settings?.bank_account_number || "-"}</p>
                       <p className="text-slate-800 text-xs font-bold">a.n. {paymentQuote?.account?.bank_account_holder || settings?.bank_account_holder || "-"}</p>
                     </div>
                     {paymentQuote?.qris_image_url && paymentMethod === "QRIS" && (
                       <img src={paymentQuote.qris_image_url} alt="QRIS" className="w-24 h-24 object-contain" />
                     )}
                   </div>

                   {/* Tagihan kode unik */}
                   <div className="rounded-xl bg-white border border-slate-200 p-3.5 space-y-2">
                     <p className="text-[11px] uppercase tracking-widest text-slate-700 font-extrabold">Total Tagihan yang Harus Dibayar</p>
                     <p className="text-xs text-slate-700 font-bold">Biaya pendaftaran: {formatRupiah(paymentQuote?.registration?.fee || 250000)}</p>
                     <p className="font-mono font-black text-indigo-700 text-2xl">Rp {(paymentQuote?.registration?.amount || 0).toLocaleString("id-ID")}</p>
                     <p className="text-xs text-amber-900 font-bold bg-amber-50 p-2 rounded-lg border border-amber-200 inline-block">Kode unik: <strong className="text-amber-950 font-black">{paymentQuote?.registration?.unique_code || "-"}</strong> (3 digit terakhir nominal untuk identifikasi otomatis)</p>
                   </div>

                   {/* Metode pembayaran pilihan */}
                   <div className="space-y-1.5">
                      <Label className="text-xs font-extrabold text-slate-900">Pilih Metode Pembayaran yang Didukung</Label>
                      {availablePaymentMethods.length > 0 ? (
                        <div className="relative">
                          <select
                            value={paymentMethod}
                            onChange={(e) => { setPaymentMethod(e.target.value); setProofFile(null); }}
                            className="w-full text-xs sm:text-sm font-extrabold text-slate-900 border-2 border-indigo-500 rounded-xl px-3 py-2.5 bg-white shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-600 appearance-none"
                          >
                            {availablePaymentMethods.map((m) => (
                              <option key={m.id} value={m.id} className="bg-white text-slate-900 font-extrabold py-1.5">
                                {m.label}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-indigo-700">
                            <ChevronDown className="h-4 w-4" />
                          </div>
                        </div>
                      ) : (
                       <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs font-bold">
                         Metode pembayaran sedang dalam pengaturan panitia. Silakan hubungi panitia PMB.
                       </div>
                     )}
                   </div>

                   {/* Upload bukti (MANUAL) */}
                   {paymentMethod === "MANUAL" && (
                     <div className="space-y-1.5 p-3.5 rounded-xl bg-sky-50 border border-sky-300">
                       <Label className="text-xs font-extrabold text-slate-900">Unggah Bukti Transfer Bank</Label>
                       <Input
                         type="file"
                         accept="image/png,image/jpeg,.pdf"
                         onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                         className="bg-white text-xs text-slate-900 font-bold border border-sky-300 rounded-lg"
                       />
                       <p className="text-[11px] text-slate-700 font-semibold">Format file PNG/JPG/PDF maks 5 MB. Bukti akan diverifikasi oleh panitia PMB.</p>
                     </div>
                   )}
                 </div>

                 {applicant?.reg_payment_status === "pending_verification" && (
                    <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <h4 className="font-extrabold text-amber-950 text-sm flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 text-amber-600 animate-spin" />
                          Menunggu Approval Pembayaran Pendaftaran oleh Admin PMB
                        </h4>
                        <Badge className="bg-amber-600 text-white text-[10px] font-bold w-fit">MENUNGGU VERIFIKASI ADMIN</Badge>
                      </div>
                      <p className="text-slate-800 text-xs font-bold leading-relaxed">
                        Terima kasih, bukti pembayaran pendaftaran Anda telah berhasil dikirim. Panitia PMB sedang memverifikasi dan menyetujui pembayaran Anda. Anda akan dapat melanjutkan ke Alur 4 setelah pembayaran disetujui.
                      </p>
                      <div className="flex justify-end pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await fetchApplication();
                            toast.success("Status pembayaran diperbarui");
                          }}
                          className="text-xs border-amber-300 text-amber-900 hover:bg-amber-100 font-bold"
                        >
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Muat Ulang Status Pembayaran
                        </Button>
                      </div>
                    </div>
                  )}

                  {applicant?.reg_payment_status !== "verified" && applicant?.reg_payment_status !== "pending_verification" && (
                    <div className="space-y-4 pt-3 border-t border-slate-200">
                      {/* Skema Pendaftaran: Full vs Custom */}
                      <div className="space-y-2">
                        <Label className="text-xs font-extrabold text-slate-900">Skema Pembayaran Formulir Pendaftaran</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setRegPayMode("full")}
                            className={`py-2.5 px-3 rounded-xl border-2 font-black text-xs transition-all ${
                              regPayMode === "full"
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                                : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            Lunas Full ({formatRupiah(paymentQuote?.registration?.fee || 250000)})
                          </button>
                          <button
                            type="button"
                            onClick={() => setRegPayMode("custom")}
                            className={`py-2.5 px-3 rounded-xl border-2 font-black text-xs transition-all ${
                              regPayMode === "custom"
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                                : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            Nominal Custom (DP/Bebas)
                          </button>
                        </div>
                      </div>

                      {regPayMode === "custom" && (
                        <div className="space-y-1.5 p-3.5 rounded-xl bg-indigo-50/80 border border-indigo-200">
                          <Label className="text-xs font-extrabold text-indigo-950">Masukkan Nominal Pembayaran Pendaftaran Custom (Rp)</Label>
                          <Input
                            type="number"
                            min={10000}
                            step={10000}
                            value={regCustomAmount}
                            onChange={(e) => setRegCustomAmount(e.target.value)}
                            placeholder="Contoh: 50000"
                            className="bg-white text-slate-900 font-black text-sm border-2 border-indigo-400 rounded-xl"
                          />
                          <p className="text-[11px] text-indigo-800 font-semibold">
                            Nominal custom: <strong>{formatRupiah(regCustomAmount)}</strong>. Sisa pembayaran pendaftaran akan dicatat otomatis.
                          </p>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2">
                        <div>
                          <p className="text-xs text-slate-700 font-bold">Total Nominal Ditagihkan</p>
                          <h3 className="text-2xl font-black text-indigo-700 mt-0.5">
                            {formatRupiah(regPayMode === "custom" ? regCustomAmount : (paymentQuote?.registration?.amount || applicant?.reg_payment_fee || 250000))}
                          </h3>
                        </div>
                        <Button
                          type="button"
                          onClick={handlePayRegistration}
                          disabled={uploadingProof || availablePaymentMethods.length === 0}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-6 py-3 rounded-xl shadow-lg w-full sm:w-auto"
                        >
                          {uploadingProof ? "Mengunggah..." : paymentMethod === "MANUAL" ? "Konfirmasi Bukti Transfer" : "Bayar Sekarang"}
                        </Button>
                      </div>
                    </div>
                  )}

                {applicant?.reg_payment_status === "verified" && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold"><Check className="w-4 h-4" /></div>
                      <div>
                        <p className="font-bold text-emerald-900">Pembayaran Pendaftaran Selesai & Disetujui</p>
                        <p className="text-[11px] text-emerald-700">Metode: {applicant?.reg_payment_method} • Status: Lunas & Terverifikasi Admin</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={() => setActiveStep(4)}
                      className="bg-emerald-700 text-white font-bold text-xs"
                    >
                      Lanjut ke Grup WhatsApp (Alur 4) <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* STEP 4: GABUNG GRUP WHATSAPP */}
          {activeStep === 4 && (
            <Card className="border border-slate-200 bg-white shadow-md rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-900 text-white border-b border-slate-800 py-4 px-5 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-emerald-400" />
                    Alur 4: Bergabung ke Grup WhatsApp Calon Mahasiswa Baru
                  </CardTitle>
                  <Badge className="bg-emerald-600 text-white text-xs font-bold px-3 py-1">Langkah 4 / 9</Badge>
                </div>
                <CardDescription className="text-xs font-medium text-slate-300 mt-1">
                  Dapatkan informasi penting mengenai jadwal tes, bimbingan her-registrasi, dan koordinasi panitia.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4 text-xs text-center sm:text-left bg-white text-slate-900">
                <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-extrabold text-emerald-950 text-sm">{settings?.wa_group_name || "Grup Resmi PMB Kampus"}</h4>
                    <p className="text-slate-800 font-semibold text-xs">Klik tombol di samping untuk bergabung langsung via aplikasi WhatsApp dan melanjutkan ke Alur 5.</p>
                  </div>
                  <Button
                    type="button"
                    onClick={handleJoinWa}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2.5 shadow-md flex items-center gap-2 shrink-0"
                  >
                    <MessageSquare className="w-4 h-4" /> Gabung Grup WhatsApp Resmi
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 5: PILIH JALUR TES (ONLINE CBT / OFFLINE) */}
          {activeStep === 5 && (
            <Card className="border border-slate-200 bg-white shadow-md rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-900 text-white border-b border-slate-800 py-4 px-5 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-sky-400" />
                    Alur 5: Pemilihan Jalur Tes Masuk
                  </CardTitle>
                  <Badge className="bg-indigo-600 text-white text-xs font-bold px-3 py-1">Langkah 5 / 9</Badge>
                </div>
                <CardDescription className="text-xs font-medium text-slate-300 mt-1">
                  Pilih salah satu metode pelaksanaan evaluasi seleksi masuk yang tersedia.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Option 1: Online CBT Test */}
                  {settings?.online_test_enabled ? (
                    <button
                      type="button"
                      onClick={() => handleChooseTest("online")}
                      className="p-5 rounded-2xl border-2 border-indigo-200 hover:border-indigo-600 bg-white hover:bg-indigo-50/50 text-left transition-all group space-y-2 cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg group-hover:scale-110 transition-transform">
                        <Monitor className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-sm text-slate-900">1. Online Test (CBT Mandiri)</h4>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Ujian daring mandiri via aplikasi/web. Dilengkapi timer ujian dan <strong>skor hasil ujian keluar instan</strong>.
                      </p>
                      <Badge className="bg-indigo-600 text-white text-[10px]">Ujian Online Aktif</Badge>
                    </button>
                  ) : (
                    <div className="p-5 rounded-2xl border-2 border-slate-200 bg-slate-50/80 text-left space-y-2 opacity-60 cursor-not-allowed">
                      <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-lg">
                        <Lock className="w-5 h-5" />
                      </div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-slate-700">1. Online Test (CBT Mandiri)</h4>
                        <Badge className="bg-slate-500 text-white text-[9px]">Dinonaktifkan Admin</Badge>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Secara default Ujian Online (CBT) saat ini <strong>dinonaktifkan oleh administrator kampus</strong>. Silakan pilih <strong>Ujian Offline di Kampus</strong> di sebelah kanan.
                      </p>
                    </div>
                  )}

                  {/* Option 2: Offline Test in Campus */}
                  <button
                    type="button"
                    onClick={() => handleChooseTest("offline")}
                    className="p-5 rounded-2xl border-2 border-sky-200 hover:border-sky-600 bg-white hover:bg-sky-50/50 text-left transition-all group space-y-2 cursor-pointer shadow-sm"
                  >
                    <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-lg group-hover:scale-110 transition-transform">
                      <Landmark className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-sm text-slate-900">2. Offline Test (di Kampus)</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Ujian tatap muka langsung di laboratorium komputer kampus. Jadwal dan nomor ruangan diumumkan melalui sistem dan grup WA PMB.
                    </p>
                    <Badge className="bg-sky-600 text-white text-[10px]">Tatap Muka di Kampus</Badge>
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 6: PELAKSANAAN UJIAN SELEKSI CBT (ONLINE / OFFLINE) */}
          {activeStep === 6 && (
            <Card className="border border-slate-200 bg-white shadow-md rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-900 text-white border-b border-slate-800 py-4 px-5 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <Building className="w-5 h-5 text-indigo-400" />
                    Alur 6: Jadwal & Pelaksanaan Ujian Seleksi (CBT)
                  </CardTitle>
                  <Badge className="bg-indigo-600 text-white text-xs font-bold px-3 py-1">Langkah 6 / 9</Badge>
                </div>
                <CardDescription className="text-xs font-medium text-slate-300 mt-1">
                  Jadwal dan ruang pelaksanaan ujian seleksi masuk calon mahasiswa baru berbasis Computer-Based Test (CBT).
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-5 text-xs bg-white text-slate-900">
                {/* Switcher / Re-choose Option */}
                {applicant?.test_status !== "passed" && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-slate-100/90 rounded-xl border border-slate-200">
                    <div className="text-slate-800 text-xs flex items-center gap-2">
                      <span className="font-bold text-slate-900">Jalur Terpilih:</span>
                      <Badge className={applicant?.test_type === "online" ? "bg-indigo-600 text-white text-xs px-2.5 py-0.5 font-bold" : "bg-sky-600 text-white text-xs px-2.5 py-0.5 font-bold"}>
                        {applicant?.test_type === "online" ? "Ujian Online (CBT)" : "Ujian Offline (di Kampus)"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setActiveStep(5)}
                        className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-900 font-bold border border-slate-300 shadow-xs"
                      >
                        <Layers className="w-3.5 h-3.5 mr-1.5 text-slate-700" /> Ubah Pilihan Jalur Tes (Alur 5)
                      </Button>
                      {applicant?.test_type === "online" ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleChooseTest("offline")}
                          className="text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold border border-sky-500 shadow-xs"
                        >
                          <Building className="w-3.5 h-3.5 mr-1.5" /> Ganti ke Ujian Offline
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleChooseTest("online")}
                          className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold border border-indigo-500 shadow-xs"
                        >
                          <Monitor className="w-3.5 h-3.5 mr-1.5" /> Ganti ke Ujian Online
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Jadwal Pelaksanaan Ujian */}
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200 space-y-1">
                    <p className="text-indigo-900 text-[10px] font-extrabold uppercase tracking-wider">JADWAL PELAKSANAAN UJIAN</p>
                    <p className="font-extrabold text-slate-900 text-sm sm:text-base">
                      {examSession?.start_at
                        ? new Date(examSession.start_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })
                        : (applicant?.offline_test_schedule || settings?.offline_test_schedule_default || "Sesuai Jadwal PMB")}
                    </p>
                    {examSession?.title && (
                      <p className="text-[11px] text-indigo-700 font-bold truncate">
                        Sesi: {examSession.title}
                      </p>
                    )}
                  </div>
                  <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200 space-y-1">
                    <p className="text-indigo-900 text-[10px] font-extrabold uppercase tracking-wider">LOKASI & RUANG UJIAN</p>
                    <p className="font-extrabold text-slate-900 text-sm sm:text-base">
                      {applicant?.test_type === "online"
                        ? "Sesi CBT Online (Virtual Room / Laptop / HP)"
                        : (examSession?.room_name || settings?.offline_test_room_name || applicant?.offline_test_location || settings?.offline_test_location || "Laboratorium Komputer Kampus")}
                    </p>
                    {applicant?.test_type !== "online" && (examSession?.room_name || settings?.offline_test_room_name) && (
                      <p className="text-[11px] text-emerald-700 font-bold truncate">
                        Ruang: {examSession?.room_name || settings?.offline_test_room_name}
                      </p>
                    )}
                  </div>
                  <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200 space-y-1">
                    <p className="text-indigo-900 text-[10px] font-extrabold uppercase tracking-wider">DURASI & PASSING GRADE</p>
                    <p className="font-extrabold text-slate-900 text-sm sm:text-base">
                      {examSession?.duration_minutes || 45} Menit <span className="text-xs font-semibold text-slate-600">(Passing Grade: {examSession?.passing_grade || settings?.passing_grade || 70})</span>
                    </p>
                  </div>
                </div>

                {/* Status Ujian: Selesai / Ruang Ujian CBT */}
                {(applicant?.test_completed_at || 
                  (applicant?.test_status && !["pending", "not_started", "untested", ""].includes(applicant?.test_status)) || 
                  examAttempts.some((att) => att.status === "submitted" || att.status === "auto_submitted" || Boolean(att.finished_at))
                ) ? (
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white border border-indigo-500/40 space-y-4 shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-800/60 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Award className="w-5 h-5 text-amber-400" />
                          <h4 className="font-extrabold text-white text-base">Hasil Analisis Ujian & Grade Seleksi</h4>
                        </div>
                        <p className="text-[11px] text-indigo-200 mt-0.5">
                          Ujian seleksi Anda telah dikalkulasi secara otomatis oleh sistem PMB.
                        </p>
                      </div>
                      <Badge className="bg-emerald-500 text-white text-xs font-extrabold px-3 py-1 shadow-xs self-start sm:self-auto">
                        ✓ UJIAN SELESAI
                      </Badge>
                    </div>

                    {/* Grade Analysis Shield */}
                    <div className="grid sm:grid-cols-3 gap-3 items-center">
                      <div className="p-4 rounded-xl bg-white/10 border border-white/15 flex flex-col items-center justify-center text-center space-y-1">
                        <span className="text-[10px] font-extrabold text-indigo-300 uppercase tracking-wider">HASIL GRADE ANDA</span>
                        <span className="text-2xl font-black tracking-tight text-amber-300 drop-shadow-sm">
                          {applicant?.test_grade || "Grade A"}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 border border-amber-300/30">
                          {applicant?.test_grade_label || "Sangat Baik / Lolos Seleksi"}
                        </span>
                      </div>

                      <div className="sm:col-span-2 p-4 rounded-xl bg-white/10 border border-white/15 space-y-2">
                        <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                          <span className="text-xs text-slate-300 font-medium">Skor Hasil Ujian:</span>
                          <span className="text-sm font-mono font-black text-emerald-400">
                            {applicant?.test_score != null ? `${applicant.test_score} / 100` : "85.0 / 100"}
                          </span>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Catatan Rekomendasi Seleksi:</p>
                          <p className="text-xs text-slate-200 font-medium leading-relaxed mt-0.5">
                            {applicant?.test_grade_description || "Selamat! Nilai ujian seleksi Anda sangat memuaskan. Berkas Anda direkomendasikan untuk penetapan SK Penerimaan Resmi."}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-indigo-800/60 text-xs text-slate-300">
                      <p className="text-[11px] text-slate-300">
                        📄 Surat Keputusan (SK) Penerimaan sedang diproses oleh Panitia PMB.
                      </p>
                      <Button
                        type="button"
                        onClick={() => setActiveStep(7)}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-5 py-2 shadow-md w-full sm:w-auto"
                      >
                        Pilih Jadwal Wawancara (Alur 7) <ArrowRight className="w-4 h-4 ml-1.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-indigo-950 text-sm">Masuk ke Ruang Ujian Seleksi (CBT)</h4>
                        <p className="text-slate-600 text-[11px]">Masukkan token ujian yang dibagikan panitia PMB untuk memulai ujian.</p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch gap-2 pt-1">
                      <Input
                        type="text"
                        value={examToken}
                        onChange={(e) => setExamToken(e.target.value.toUpperCase())}
                        placeholder="MASUKKAN TOKEN UJIAN"
                        className="bg-white text-slate-900 font-extrabold text-sm placeholder:text-slate-400 border-2 border-indigo-400 focus:border-indigo-600 py-2.5 w-full sm:w-72 font-mono uppercase tracking-wider shadow-xs"
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        onClick={handleStartCbt}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-6 py-2.5 shadow-md shrink-0"
                      >
                        <Rocket className="w-4 h-4 mr-1.5 inline" /> Mulai Ujian CBT Sekarang
                      </Button>
                    </div>
                  </div>
                )}

                {/* Attempt History Table (Tanpa Menampilkan Nilai ke Camaba) */}
                {examAttempts.length > 0 && (
                  <div className="space-y-2.5 pt-2">
                    <p className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                      Riwayat Pelaksanaan Ujian Seleksi PMB
                    </p>
                    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                          <tr>
                            <th className="p-2.5">No. / Waktu Ujian</th>
                            <th className="p-2.5">Tipe Jalur</th>
                            <th className="p-2.5">Status Pengerjaan</th>
                            <th className="p-2.5">Keterangan Evaluasi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {examAttempts.map((att, idx) => (
                            <tr key={att.id || idx} className="hover:bg-slate-50/80 transition">
                              <td className="p-2.5 font-mono text-[11px]">
                                <p className="font-bold text-slate-800">Ujian #{examAttempts.length - idx}</p>
                                <p className="text-[10px] text-slate-500">
                                  {att.finished_at || att.started_at
                                    ? new Date(att.finished_at || att.started_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })
                                    : "-"}
                                </p>
                              </td>
                              <td className="p-2.5">
                                <Badge variant="outline" className="capitalize text-[10px]">
                                  {att.test_type === "online" ? "Online CBT" : att.test_type === "offline" ? "Offline di Kampus" : (att.test_type || "CBT")}
                                </Badge>
                              </td>
                              <td className="p-2.5">
                                <Badge className="bg-emerald-600 text-white text-[10px]">
                                  Selesai / Terkirim
                                </Badge>
                              </td>
                              <td className="p-2.5 font-medium text-slate-600 text-[11px]">
                                Jawaban tersimpan • Menunggu pemilihan jadwal wawancara
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* STEP 7: PEMILIHAN JADWAL & WAWANCARA */}
          {activeStep === 7 && (
            <Card className="border border-slate-200 bg-white shadow-md rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-900 text-white border-b border-slate-800 py-4 px-5 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <Video className="w-5 h-5 text-sky-400" />
                    Alur 7: Pemilihan Jadwal & Wawancara
                  </CardTitle>
                  <Badge className="bg-sky-500 text-white font-black text-xs px-3 py-1">Langkah 7 / 10</Badge>
                </div>
                <CardDescription className="text-xs font-medium text-slate-300 mt-1">
                  Setelah lulus CBT, pilih salah satu jadwal wawancara yang disiapkan Panitia PMB.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-5 text-xs bg-white text-slate-900">
                {applicant?.test_status !== "passed" ? (
                  <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-2">
                    <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                    <h4 className="font-extrabold text-amber-950 text-base">Wawancara belum tersedia</h4>
                    <p className="text-slate-700">Jadwal wawancara dapat dipilih setelah hasil CBT Anda dinyatakan lulus.</p>
                  </div>
                ) : (
                  <>
                    {applicant?.interview_schedule && (
                      <div className="p-5 rounded-2xl bg-indigo-950 text-white border border-indigo-700 space-y-3 shadow-lg">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <p className="text-[10px] text-indigo-300 font-extrabold uppercase tracking-wider">Jadwal Anda</p>
                            <h4 className="font-black text-base mt-1">{applicant.interview_schedule.title}</h4>
                          </div>
                          <Badge className="bg-emerald-500 text-white font-black text-[10px] self-start">TERPILIH</Badge>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="p-3 rounded-xl bg-white/10 border border-white/10">
                            <p className="text-[10px] text-indigo-300 font-bold uppercase">Waktu</p>
                            <p className="font-bold text-white mt-1">{new Date(applicant.interview_schedule.start_at).toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" })}</p>
                            <p className="text-[10px] text-indigo-200 mt-0.5">s.d. {new Date(applicant.interview_schedule.end_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</p>
                          </div>
                          <div className="p-3 rounded-xl bg-white/10 border border-white/10">
                            <p className="text-[10px] text-indigo-300 font-bold uppercase">Google Meet</p>
                            {applicant.interview_schedule.meeting_url_visible && applicant.interview_schedule.meeting_url ? (
                              <a href={applicant.interview_schedule.meeting_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-emerald-300 font-black hover:underline">
                                <Video className="w-4 h-4" /> Buka Ruang Wawancara <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : (
                              <p className="font-semibold text-amber-200 mt-1 leading-relaxed">Link Google Meet akan tampil pada hari wawancara.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="font-extrabold text-indigo-950 text-sm">Pilih Slot Wawancara</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">Anda masih dapat mengganti jadwal selama wawancara belum dimulai.</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={fetchInterviewSchedules} disabled={interviewLoading} className="text-xs">
                        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${interviewLoading ? "animate-spin" : ""}`} /> Segarkan
                      </Button>
                    </div>

                    {interviewLoading ? (
                      <div className="py-10 text-center text-slate-500"><RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600" /><p className="text-xs mt-2">Memuat jadwal...</p></div>
                    ) : interviewSchedules.length === 0 ? (
                      <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
                        <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
                        <h4 className="font-bold text-slate-800">Belum ada jadwal tersedia</h4>
                        <p className="text-slate-500">Panitia PMB akan menambahkan jadwal wawancara. Silakan cek kembali secara berkala.</p>
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-2 gap-3">
                        {interviewSchedules.map((schedule) => (
                          <div key={schedule.id} className={`p-4 rounded-xl border-2 transition-all ${schedule.selected ? "border-indigo-600 bg-indigo-50" : "border-slate-200 bg-white hover:border-indigo-300"}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h5 className="font-extrabold text-slate-900 text-sm">{schedule.title}</h5>
                                <p className="text-[11px] text-indigo-700 font-bold mt-1">{new Date(schedule.start_at).toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" })}</p>
                              </div>
                              {schedule.selected && <Badge className="bg-indigo-600 text-white text-[9px]">Pilihan Anda</Badge>}
                            </div>
                            {schedule.description && <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">{schedule.description}</p>}
                            <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-100">
                              <span className="text-[10px] text-slate-500">Sisa kuota: <strong className="text-slate-800">{schedule.available_count}</strong></span>
                              <Button type="button" size="sm" onClick={() => handleSelectInterviewSchedule(schedule.id)} disabled={schedule.selected} className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold h-7 px-3">
                                {schedule.selected ? <><Check className="w-3 h-3 mr-1" /> Terpilih</> : "Pilih Jadwal"}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* STEP 8: SURAT KEPUTUSAN (SK) PENERIMAAN & KELULUSAN */}
          {activeStep === 8 && (
            <Card className="border border-slate-200 bg-white shadow-md rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-900 text-white border-b border-slate-800 py-4 px-5 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-400" />
                    Alur 8: Surat Keputusan (SK) Penerimaan & Kelulusan
                  </CardTitle>
                  <Badge className="bg-amber-400 text-slate-950 font-black text-xs px-3 py-1">Langkah 8 / 10</Badge>
                </div>
                <CardDescription className="text-xs font-medium text-slate-300 mt-1">
                  Surat Keputusan Resmi Penetapan Kelulusan Penerimaan Mahasiswa Baru dari Panitia PMB.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6 text-xs bg-white text-slate-900">
                {!applicant?.sk_approved ? (
                  <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 space-y-4 text-center sm:text-left">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-2xl shrink-0">
                        <RefreshCw className="w-7 h-7 text-amber-600 animate-spin" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                          <h4 className="font-bold text-amber-950 text-base">Menunggu Proses Approval SK Penerimaan</h4>
                          <Badge className="bg-amber-600 text-white text-[10px]">VERIFIKASI PANITIA PMB</Badge>
                        </div>
                        <p className="text-slate-700 text-xs leading-relaxed">
                          Ujian seleksi Anda telah selesai dikerjakan. Berkas pendaftaran dan hasil evaluasi seleksi Anda saat ini sedang dalam proses review dan approval Surat Keputusan (SK) Penerimaan oleh Panitia PMB & BAAK.
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-amber-200/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <p className="text-[11px] text-amber-800">
                        Panitia akan menerbitkan SK Penerimaan resmi dalam 1x24 jam kerja.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={async () => {
                          await fetchApplication();
                          await fetchAdmissionLetter();
                          toast.success("Status SK Penerimaan diperbarui");
                        }}
                        className="text-xs border-amber-300 text-amber-900 hover:bg-amber-100 font-bold"
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Muat Ulang Status SK
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* OFFICIAL LETTER OF ACCEPTANCE (LoA / SK PENERIMAAN) */
                  <div className="space-y-6">
                    {/* Printable Official Document */}
                    <div id="sk-penerimaan-document" className="bg-white border border-slate-300 rounded-2xl p-4 sm:p-8 shadow-sm space-y-5 text-slate-800">
                      {/* Letterhead (Kop Surat) */}
                      <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-3.5 pb-4 border-b-2 border-slate-900">
                        {branding?.campus_logo_url || branding?.logo_url ? (
                          <img
                            src={resolveMediaUrl(branding.campus_logo_url || branding.logo_url)}
                            alt="Logo"
                            className="w-14 h-14 sm:w-16 sm:h-16 object-contain shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-700 text-white flex items-center justify-center font-bold text-xl sm:text-2xl shrink-0">
                            <GraduationCap className="w-8 h-8 sm:w-9 sm:h-9" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-extrabold text-base sm:text-lg uppercase tracking-wider text-slate-900 leading-tight">
                            {campusDisplayName}
                          </h3>
                          <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium mt-0.5">
                            PANITIA PENERIMAAN MAHASISWA BARU (PMB) TAHUN AKADEMIK {settings?.active_period_name || "2026/2027"}
                          </p>
                          <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5">
                            {branding?.campus_address || "Kampus Utama Politeknik SCI"} • Telp: {branding?.campus_phone || "(021) 8888-9999"} • Web: {branding?.campus_website || "https://sci.ac.id"}
                          </p>
                        </div>
                      </div>

                      {/* Letter Title */}
                      <div className="text-center space-y-1 py-1">
                        <h4 className="font-black text-xs sm:text-sm uppercase tracking-widest text-slate-900 underline underline-offset-4">
                          SURAT KEPUTUSAN PENERIMAAN MAHASISWA BARU
                        </h4>
                        <p className="font-mono text-[11px] sm:text-xs font-bold text-slate-700">
                          Nomor: {admissionLetter?.letter_number || applicant?.sk_number || `SK-PMB/2026/${applicant?.registration_number}`}
                        </p>
                        <p className="text-[10px] sm:text-[11px] text-slate-500">Tanggal Penetapan: {formatLongDateIndonesian(admissionLetter?.date || applicant?.sk_date)}</p>
                      </div>

                      {/* Decision statement */}
                      <p className="text-xs leading-relaxed text-justify text-slate-700">
                        Berdasarkan hasil evaluasi seleksi Computer Based Test (CBT) dan verifikasi kelengkapan dokumen administrasi Calon Mahasiswa Baru Tahun Akademik {settings?.active_period_name || "2026/2027"}, Panitia Penerimaan Mahasiswa Baru dengan ini menetapkan bahwa:
                      </p>

                      {/* Student details table wrapper for responsiveness */}
                      <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-x-auto text-xs">
                        <table className="w-full text-left border-collapse min-w-[320px]">
                          <tbody>
                            <tr className="border-b border-slate-200">
                              <td className="p-2.5 font-bold text-slate-600 w-2/5 sm:w-1/3 bg-slate-100/80">Nama Lengkap</td>
                              <td className="p-2.5 font-bold text-slate-900">{applicant?.name}</td>
                            </tr>
                            <tr className="border-b border-slate-200">
                              <td className="p-2.5 font-mono font-bold text-indigo-700 bg-slate-100/80">Nomor Registrasi PMB</td>
                              <td className="p-2.5 font-mono font-bold text-indigo-700">{applicant?.registration_number}</td>
                            </tr>
                            <tr className="border-b border-slate-200">
                              <td className="p-2.5 font-bold text-slate-600 bg-slate-100/80">Nomor Induk Kependudukan (NIK)</td>
                              <td className="p-2.5 font-mono">{applicant?.nik || "-"}</td>
                            </tr>
                            <tr className="border-b border-slate-200">
                              <td className="p-2.5 font-bold text-slate-600 bg-slate-100/80">Program Studi Diterima</td>
                              <td className="p-2.5 font-extrabold text-emerald-800">{applicant?.prodi_name}</td>
                            </tr>
                            <tr className="border-b border-slate-200">
                              <td className="p-2.5 font-bold text-slate-600 bg-slate-100/80">Pilihan Jenis Kelas</td>
                              <td className="p-2.5 font-bold text-slate-800 capitalize">
                                {applicant?.class_type === "khusus"
                                  ? "Kelas Khusus Offline (Eksekutif - Kurikulum Khusus)"
                                  : applicant?.class_type === "weekend"
                                  ? "Kelas Weekend Online (Daring Akhir Pekan)"
                                  : applicant?.learning_mode === "online"
                                  ? "Kelas Reguler Online (Daring Penuh)"
                                  : "Kelas Reguler Offline (Tatap Muka di Kampus)"}
                              </td>
                            </tr>
                            <tr className="border-b border-slate-200">
                              <td className="p-2.5 font-bold text-slate-600 bg-slate-100/80">Status Evaluasi Seleksi</td>
                              <td className="p-2.5 font-bold text-emerald-700">MEMENUHI SYARAT (LULUS SELEKSI PMB)</td>
                            </tr>
                            <tr>
                              <td className="p-2.5 font-bold text-slate-600 bg-slate-100/80">Keputusan Akhir Seleksi</td>
                              <td className="p-2.5">
                                <Badge className="bg-emerald-600 text-white font-black text-xs px-3 py-1">
                                  DITERIMA SEBAGAI MAHASISWA BARU
                                </Badge>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Statement and Signatory */}
                      <div className="space-y-4 pt-2">
                        <p className="text-xs text-slate-700 leading-relaxed">
                          Keputusan ini bersifat mutlak dan mengikat. Calon mahasiswa diwajibkan untuk menyelesaikan tahapan <strong>Daftar Ulang (Uang Pra-Studi & Ukuran Jaket Almamater)</strong> pada Alur 9 sebelum batas waktu yang ditentukan.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4 pt-4 border-t border-slate-100">
                          <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200 inline-flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-start">
                            <div className="w-14 h-14 bg-white rounded-lg p-1 border border-emerald-300 shadow-xs flex items-center justify-center shrink-0">
                              <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                                  typeof window !== "undefined"
                                    ? `${window.location.origin}/pmb/verify-sk/${applicant?.sk_number || applicant?.registration_number || "SK-PMB"}`
                                    : `https://pmb.kampus.ac.id/verify-sk/${applicant?.sk_number || "SK-PMB"}`
                                )}`}
                                alt="QR Verification SK"
                                className="w-full h-full object-contain"
                              />
                            </div>
                            <div className="text-[10px] text-emerald-950 leading-tight">
                              <div className="flex items-center gap-1 font-extrabold text-emerald-900">
                                <Check className="w-3.5 h-3.5 text-emerald-600 inline" /> Digital Signature Verified
                              </div>
                              <p className="text-emerald-700 font-mono font-bold mt-0.5">{applicant?.sk_number || "SK-PMB-OFFICIAL"}</p>
                              <p className="text-[9px] text-slate-500 mt-0.5">Scan untuk verifikasi keabsahan dokumen SK</p>
                            </div>
                          </div>

                          <div className="text-center sm:text-right space-y-1 w-full sm:w-auto">
                            <p className="text-[11px] text-slate-600 font-medium">
                              {admissionLetter?.campus_city || settings?.campus_city || branding?.campus_city || "Jakarta"}, {formatLongDateIndonesian(admissionLetter?.date || applicant?.sk_date)}
                            </p>
                            <p className="text-[11px] font-bold text-slate-900">
                              {admissionLetter?.pmb_lead_title || settings?.pmb_lead_title || "Ketua Panitia PMB"},
                            </p>
                            <div className="h-12 flex items-center justify-center sm:justify-end">
                              <span className="font-serif italic text-sm font-bold text-indigo-900 border-b border-dashed border-indigo-300 pb-0.5">
                                {admissionLetter?.pmb_lead_name || settings?.pmb_lead_name || applicant?.sk_approved_by || "Dr. Muhammad Farhan, S.Kom., M.T."}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 font-medium font-mono">
                              {admissionLetter?.pmb_lead_nip || settings?.pmb_lead_nip || "NIP. 198503152010121003"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Injected Print Stylesheet for SK Letter Only */}
                    <style>{`
                      @media print {
                        body * {
                          visibility: hidden !important;
                        }
                        #sk-penerimaan-document, #sk-penerimaan-document * {
                          visibility: visible !important;
                        }
                        #sk-penerimaan-document {
                          position: absolute !important;
                          left: 0 !important;
                          top: 0 !important;
                          width: 100% !important;
                          margin: 0 !important;
                          padding: 10mm !important;
                          border: 1px solid #cbd5e1 !important;
                          box-shadow: none !important;
                          border-radius: 12px !important;
                          background: white !important;
                        }
                        .no-print, nav, header, footer, button {
                          display: none !important;
                        }
                      }
                    `}</style>

                    {/* Actions */}
                    <div className="no-print flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => window.print()}
                        className="text-xs font-bold border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1.5 py-2.5 w-full sm:w-auto"
                      >
                        <Printer className="w-4 h-4 text-indigo-600" /> Cetak / Unduh Dokumen SK
                      </Button>

                      <Button
                        type="button"
                        onClick={() => setActiveStep(9)}
                        className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs px-6 py-2.5 shadow-md flex items-center justify-center gap-1.5 w-full sm:w-auto"
                      >
                        <Shirt className="w-4 h-4" /> Lanjut ke Daftar Ulang & Ukuran Jas (Alur 9) <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* STEP 9: DAFTAR ULANG (UANG PRA-STUDI & UKURAN BAJU) */}
          {activeStep === 9 && (
            <Card className="border border-slate-200 bg-white shadow-md rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-900 text-white border-b border-slate-800 py-4 px-5 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <Shirt className="w-5 h-5 text-indigo-400" />
                    Alur 9: Daftar Ulang (Pembayaran Uang Pra-Studi & Ukuran Jas Almamater)
                  </CardTitle>
                  <Badge className="bg-indigo-600 text-white text-xs font-bold px-3 py-1">Langkah 9 / 10</Badge>
                </div>
                <CardDescription className="text-xs font-medium text-slate-300 mt-1">
                  Selesaikan her-registrasi dengan skema pembayaran fleksibel serta penentuan ukuran jaket almamater.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6 text-xs bg-white text-slate-900">
                {/* 8.1 Skema Cicilan / Lunas Uang Pra-Studi */}
                <div className="space-y-4">
                  <h4 className="font-extrabold text-indigo-950 text-xs sm:text-sm uppercase tracking-wider">
                    8.1 Pembayaran Uang Pra-Studi ({formatRupiah(applicant?.pra_studi_fee || 3500000)})
                  </h4>

                  {(applicant?.reregistration_status === "completed" || applicant?.pra_studi_payment_status === "paid") ? (
                    /* CARD LUNAS BILA PEMBAYARAN SUDAH LUNAS */
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950 via-teal-900 to-slate-900 text-white border border-emerald-500/60 space-y-4 shadow-xl">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-800/80 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <Check className="w-5 h-5 text-emerald-400" />
                            <h4 className="font-extrabold text-white text-base">Pembayaran Uang Pra-Studi Lunas & Terverifikasi</h4>
                          </div>
                          <p className="text-[11px] text-emerald-200 mt-0.5">
                            Selamat! Seluruh kewajiban pembayaran her-registrasi Anda telah diverifikasi oleh Panitia PMB.
                          </p>
                        </div>
                        <Badge className="bg-emerald-500 text-white text-xs font-black px-3 py-1 shadow-xs self-start sm:self-auto">
                          ✓ STATUS LUNAS (SELESAI)
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="p-3.5 rounded-xl bg-white/10 border border-white/15">
                          <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider block">Total Biaya Pra-Studi</span>
                          <span className="text-sm sm:text-base font-mono font-black text-emerald-300">{formatRupiah(applicant?.pra_studi_fee || 3500000)}</span>
                        </div>
                        <div className="p-3.5 rounded-xl bg-white/10 border border-white/15">
                          <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider block">Status Her-Registrasi</span>
                          <span className="text-xs font-bold text-emerald-300">Terverifikasi Lunas</span>
                        </div>
                        <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-white/10 border border-white/15">
                          <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider block">Ukuran Jas Almamater</span>
                          <span className="text-xs font-black text-amber-300 uppercase">{selectedShirtSize || applicant?.shirt_size || "Selesai"}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* FORM PEMBAYARAN JIKA BELUM LUNAS ATAU MASIH DICICIL */
                    <div className="space-y-4">
                      {applicant?.reregistration_status === "partial" && (
                        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-amber-900">Status Skema Pembayaran:</span>
                            <Badge className="bg-amber-600 text-white font-extrabold text-[10px]">PARSIAL (SEBAGIAN DICICIL)</Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-amber-200/80">
                            <span className="text-slate-600 font-medium">Sisa Kekurangan Bayar Pra-Studi:</span>
                            <span className="font-mono font-black text-amber-900 text-sm">
                              {formatRupiah(
                                Math.max(
                                  0,
                                  (applicant?.pra_studi_fee || 3500000) -
                                  (applicant?.payment_history || [])
                                    .filter((h) => h.category === "pra_studi" && (h.status === "verified" || h.status === "paid"))
                                    .reduce((acc, curr) => acc + (curr.custom_amount || curr.billed_amount || curr.amount || 0), 0)
                                )
                              )}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Pilih Lunas vs Cicilan vs Custom */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setPraPayScheme("full")}
                          className={`px-4 py-2.5 rounded-xl border-2 font-extrabold text-xs transition-all shadow-xs ${
                            praPayScheme === "full"
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "bg-white border-slate-300 text-slate-900 hover:bg-slate-100"
                          }`}
                        >
                          Bayar Lunas (Full)
                        </button>
                        <button
                          type="button"
                          onClick={() => setPraPayScheme("installment")}
                          className={`px-4 py-2.5 rounded-xl border-2 font-extrabold text-xs transition-all shadow-xs ${
                            praPayScheme === "installment"
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "bg-white border-slate-300 text-slate-900 hover:bg-slate-100"
                          }`}
                        >
                          Cicil {applicant?.installments?.length || 3}x
                        </button>
                        <button
                          type="button"
                          onClick={() => setPraPayScheme("custom")}
                          className={`px-4 py-2.5 rounded-xl border-2 font-extrabold text-xs transition-all shadow-xs ${
                            praPayScheme === "custom"
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "bg-white border-slate-300 text-slate-900 hover:bg-slate-100"
                          }`}
                        >
                          Nominal Custom (DP / Bebas)
                        </button>
                      </div>

                      {/* Metode & Rekening (shared) */}
                      <div className="grid sm:grid-cols-2 gap-4">
                        {/* Metode pembayaran pilihan */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-extrabold text-slate-900">Pilih Metode Pembayaran yang Didukung</Label>
                          {availablePaymentMethods.length > 0 ? (
                            <div className="relative">
                              <select
                                value={paymentMethod}
                                onChange={(e) => { setPaymentMethod(e.target.value); setProofFile(null); }}
                                className="w-full text-xs sm:text-sm font-extrabold text-slate-900 border-2 border-indigo-500 rounded-xl px-3 py-2.5 bg-white shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-600 appearance-none"
                              >
                                {availablePaymentMethods.map((m) => (
                                  <option key={m.id} value={m.id} className="bg-white text-slate-900 font-extrabold py-1.5">
                                    {m.label}
                                  </option>
                                ))}
                              </select>
                              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-indigo-700">
                                <ChevronDown className="h-4 w-4" />
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                              Metode pembayaran sedang dalam pengaturan panitia. Silakan hubungi panitia PMB.
                            </div>
                          )}
                        </div>
                        <div className="p-3.5 bg-indigo-50/80 rounded-xl border border-indigo-200 space-y-1">
                          <p className="text-[10px] uppercase tracking-widest text-indigo-900 font-extrabold">REKENING TUJUAN</p>
                          <p className="font-mono font-extrabold text-indigo-700 text-sm sm:text-base">{paymentQuote?.account?.bank_account_number || "138-00-9876543-2"}</p>
                          <p className="text-xs font-bold text-slate-700">a.n. {paymentQuote?.account?.bank_account_holder || "YAYASAN KAMPUS HEBAT"}</p>
                        </div>
                      </div>
                      {paymentMethod === "MANUAL" && (
                        <div className="space-y-1 p-3.5 rounded-xl bg-sky-50 border border-sky-200">
                          <Label className="text-xs font-extrabold text-slate-800">Bukti Transfer Pra-Studi</Label>
                          <Input
                            type="file"
                            accept="image/png,image/jpeg,.pdf"
                            onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                            className="bg-white text-slate-900 text-xs border border-sky-300 rounded-lg"
                          />
                        </div>
                      )}

                      {(applicant?.pra_studi_payment_status === "pending_verification" || applicant?.reregistration_status === "pending_verification") && (
                        <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 space-y-3 shadow-xs">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <h4 className="font-extrabold text-amber-950 text-sm flex items-center gap-2">
                              <RefreshCw className="w-4 h-4 text-amber-600 animate-spin" />
                              Menunggu Approval Pembayaran Uang Pra-Studi oleh Admin PMB
                            </h4>
                            <Badge className="bg-amber-600 text-white text-[10px] font-bold w-fit">MENUNGGU VERIFIKASI ADMIN</Badge>
                          </div>
                          <p className="text-slate-700 text-xs leading-relaxed">
                            Bukti transfer/pembayaran Uang Pra-Studi Anda telah kami terima. Panitia PMB & Keuangan sedang memverifikasi pembayaran Anda. Status her-registrasi akan aktif setelah disetujui admin.
                          </p>
                          <div className="flex justify-end pt-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                await fetchApplication();
                                toast.success("Status pembayaran diperbarui");
                              }}
                              className="text-xs border-amber-300 text-amber-900 hover:bg-amber-100 font-bold"
                            >
                              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Muat Ulang Status Pembayaran
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Tagihan per opsi */}
                      {praPayScheme === "custom" ? (
                        <div className="rounded-2xl bg-indigo-50/90 border border-indigo-200 p-5 space-y-3 shadow-xs">
                          <p className="text-[10px] uppercase tracking-widest text-indigo-900 font-extrabold">PEMBAYARAN NOMINAL CUSTOM (DP / PARSIAL)</p>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-extrabold text-indigo-950">Masukkan Nominal Pembayaran (Rp)</Label>
                            <Input
                              type="number"
                              min={50000}
                              step={50000}
                              value={praCustomAmount}
                              onChange={(e) => setPraCustomAmount(e.target.value)}
                              placeholder="Contoh: 500000"
                              className="bg-white text-slate-900 font-black text-sm border-2 border-indigo-400 rounded-xl py-2.5"
                            />
                          </div>
                          <p className="text-xs text-indigo-800 font-bold">
                            Nominal yang dibayar: <strong className="text-indigo-950 font-black">{formatRupiah(praCustomAmount)}</strong>
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handlePayPraStudi("custom")}
                            disabled={uploadingProof}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs sm:text-sm py-2.5 rounded-xl shadow-md mt-2"
                          >
                            {uploadingProof ? "Mengunggah..." : "Bayar Custom Nominal & Lanjutkan"}
                          </Button>
                        </div>
                      ) : praPayScheme === "full" ? (
                        <div className="rounded-2xl bg-indigo-50/90 border border-indigo-200 p-5 space-y-3 shadow-xs">
                          <p className="text-[10px] uppercase tracking-widest text-indigo-900 font-extrabold">TAGIHAN LUNAS (FULL PAYMENT)</p>
                          <p className="font-mono font-black text-indigo-700 text-2xl sm:text-3xl">Rp {(paymentQuote?.pra_studi?.full_amount || applicant?.pra_studi_fee || 3500000).toLocaleString("id-ID")}</p>
                          <p className="text-xs text-amber-800 font-bold bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 inline-block">Kode unik: <span className="font-mono font-black text-amber-900">{paymentQuote?.pra_studi?.full_code || "596"}</span></p>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handlePayPraStudi("full")}
                            disabled={uploadingProof}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs sm:text-sm py-2.5 rounded-xl shadow-md mt-2"
                          >
                            {uploadingProof ? "Mengunggah..." : "Bayar Lunas & Lanjutkan"}
                          </Button>
                        </div>
                      ) : (
                        <div className="grid sm:grid-cols-3 gap-3">
                          {(paymentQuote?.pra_studi?.installments || applicant?.installments || []).map((inst, i) => {
                            const quote = paymentQuote?.pra_studi?.installments?.[i];
                            const isPaid = inst?.status === "paid" || quote?.status === "paid";
                            const activeT = praPayTerm === inst.term;
                            return (
                              <div
                                key={inst.term}
                                className={`p-4 rounded-xl border space-y-2 ${
                                  isPaid ? "bg-emerald-50 border-emerald-300" : activeT ? "bg-indigo-50/80 border-indigo-400" : "bg-slate-50 border-slate-200"
                                }`}
                              >
                                <div className="flex justify-between items-center">
                                  <span className="font-extrabold text-slate-900 text-xs">{inst.name || `Cicilan ${inst.term}`}</span>
                                  <Badge variant={isPaid ? "default" : "outline"} className={isPaid ? "bg-emerald-600 text-white font-bold text-[10px]" : "border-slate-300 text-slate-700 font-bold text-[10px]"}>
                                    {isPaid ? "Lunas" : "Belum Bayar"}
                                  </Badge>
                                </div>
                                <p className="text-xl font-black text-indigo-700 font-mono">Rp {(quote?.amount || inst.amount).toLocaleString("id-ID")}</p>
                                {!isPaid && <p className="text-xs text-amber-800 font-semibold">Kode unik: <strong className="text-amber-900">{quote?.unique_code || "-"}</strong></p>}
                                {!isPaid && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => { setPraPayTerm(inst.term); handlePayPraStudi("installment", inst.term); }}
                                    disabled={uploadingProof}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs h-8 rounded-lg mt-1"
                                  >
                                    {uploadingProof && activeT ? "Mengunggah..." : "Bayar"}
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TABEL HISTORI PEMBAYARAN TERKAIT */}
                  {Boolean(applicant?.payment_history && applicant.payment_history.length > 0) && (
                    <div className="space-y-3 pt-4 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm uppercase tracking-wider flex items-center gap-1.5">
                          <CreditCard className="w-4 h-4 text-indigo-600" /> Histori Transaksi Pembayaran
                        </h4>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await fetchApplication();
                            toast.success("Histori pembayaran diperbarui");
                          }}
                          className="text-[11px] text-indigo-700 font-bold border-indigo-200 hover:bg-indigo-50 h-7"
                        >
                          <RefreshCw className="w-3 h-3 mr-1" /> Muat Ulang
                        </Button>
                      </div>

                      <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xs">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider">
                              <tr>
                                <th className="p-3">Kategori Pembayaran</th>
                                <th className="p-3">Nominal Transaksi</th>
                                <th className="p-3">Metode</th>
                                <th className="p-3">Tanggal</th>
                                <th className="p-3 text-center">Status Verifikasi Admin</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {applicant.payment_history.map((tx, idx) => {
                                const isVer = tx.status === "verified" || tx.status === "paid";
                                const isPend = tx.status === "pending" || tx.status === "pending_verification";
                                const txAmount = tx.custom_amount || tx.billed_amount || tx.amount || 0;
                                return (
                                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-3 font-bold text-slate-900">
                                      <p>{tx.category === "pra_studi" ? "Uang Pra-Studi (Daftar Ulang)" : "Biaya Formulir PMB"}</p>
                                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                                        {tx.scheme ? `Skema: ${tx.scheme}` : tx.notes || `Kode Unik: ${tx.unique_code || "-"}`}
                                      </p>
                                    </td>
                                    <td className="p-3 font-mono font-black text-indigo-700 text-sm">
                                      {formatRupiah(txAmount)}
                                    </td>
                                    <td className="p-3 text-slate-700">
                                      <Badge variant="outline" className="text-[10px] uppercase font-extrabold border-slate-300 bg-slate-50">
                                        {tx.payment_method || "MANUAL"}
                                      </Badge>
                                    </td>
                                    <td className="p-3 text-slate-600 text-[11px]">
                                      {formatLongDateIndonesian(tx.created_at || tx.paid_at || new Date())}
                                    </td>
                                    <td className="p-3 text-center">
                                      <Badge
                                        className={
                                          isVer
                                            ? "bg-emerald-600 text-white text-[10px] font-black px-2.5 py-0.5"
                                            : isPend
                                            ? "bg-amber-500 text-white text-[10px] font-black px-2.5 py-0.5"
                                            : "bg-rose-500 text-white text-[10px] font-black px-2.5 py-0.5"
                                        }
                                      >
                                        {isVer ? "✓ VERIFIED (LUNAS)" : isPend ? "⏳ MENUNGGU VERIFIKASI" : "✕ DITOLAK"}
                                      </Badge>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 8.2 Pengisian Ukuran Baju Almamater */}
                {(() => {
                  const isShirtSaved = Boolean(applicant?.shirt_size);
                  return (
                    <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50/90 space-y-4 shadow-xs overflow-hidden">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                        <h4 className="font-extrabold text-indigo-950 text-xs sm:text-sm uppercase tracking-wider">
                          8.2 Pengisian Informasi Ukuran Jas / Seragam Almamater
                        </h4>
                        {isShirtSaved && (
                          <Badge className="bg-emerald-600 text-white font-extrabold text-[10px] px-2.5 py-0.5 shadow-xs">
                            <Check className="w-3 h-3 mr-1 inline" /> TERKUNCI (TELAH DISIMPAN)
                          </Badge>
                        )}
                      </div>

                      {isShirtSaved && (
                        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-950 font-bold">
                          <span>✓ Ukuran Jas Almamater Anda telah terdaftar resmi: <strong className="text-emerald-800 font-black text-sm uppercase ml-1">{applicant.shirt_size}</strong></span>
                          <Lock className="w-4 h-4 text-emerald-700" />
                        </div>
                      )}

                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 w-full">
                        {["S", "M", "L", "XL", "XXL", "XXXL"].map((sz) => {
                          const isSelected = (selectedShirtSize || applicant?.shirt_size) === sz;
                          return (
                            <button
                              key={sz}
                              type="button"
                              disabled={isShirtSaved}
                              onClick={() => !isShirtSaved && setSelectedShirtSize(sz)}
                              className={`w-full h-11 rounded-xl border-2 font-black text-sm transition-all shadow-xs flex items-center justify-center ${
                                isSelected
                                  ? isShirtSaved
                                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm opacity-100 cursor-not-allowed"
                                    : "bg-indigo-600 text-white border-indigo-600 shadow-md scale-[1.02]"
                                  : isShirtSaved
                                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50"
                                  : "bg-white border-slate-300 text-slate-900 hover:bg-slate-100"
                              }`}
                            >
                              {sz}
                            </button>
                          );
                        })}
                      </div>

                      <div className="space-y-1 w-full">
                        <Label className="text-xs font-extrabold text-slate-800">Catatan Khusus Ukuran / Panjang Lengan (Opsional)</Label>
                        <Input
                          value={shirtNotes || applicant?.shirt_notes || ""}
                          disabled={isShirtSaved}
                          readOnly={isShirtSaved}
                          onChange={(e) => !isShirtSaved && setShirtNotes(e.target.value)}
                          placeholder="Contoh: Tinggi 175cm, berat 68kg, minta lengan sedikit lebih panjang"
                          className={`text-slate-900 font-bold text-xs border-2 py-2.5 rounded-xl mt-1 shadow-xs w-full ${
                            isShirtSaved
                              ? "bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed"
                              : "bg-white placeholder:text-slate-400 border-slate-300 focus:border-indigo-600"
                          }`}
                        />
                      </div>

                      {isShirtSaved ? (
                        <Button
                          type="button"
                          onClick={() => setActiveStep(10)}
                          className="w-full max-w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm py-3 px-4 rounded-xl shadow-md whitespace-normal h-auto leading-relaxed text-center flex items-center justify-center gap-1.5"
                        >
                          <Check className="w-4 h-4" /> Ukuran Jas ({applicant.shirt_size}) Telah Disimpan & Terkunci — Lanjut ke Sibermaru (Alur 10) <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={handleSaveShirtSize}
                          className="w-full max-w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs sm:text-sm py-3 px-4 rounded-xl shadow-md whitespace-normal h-auto leading-relaxed text-center"
                        >
                          Simpan Ukuran Jas & Lanjut ke Sibermaru (Alur 10)
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* STEP 10: INFORMASI SIBERMARU & MASUK SISTEM SIAKAD */}
          {activeStep === 10 && (
            <div className="space-y-6">
              {/* Orientasi Card */}
              <Card className="border border-slate-200 bg-white shadow-md rounded-2xl overflow-hidden">
                <CardHeader className="bg-slate-900 text-white border-b border-slate-800 py-4 px-5 rounded-t-xl">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-indigo-400" />
                      Alur 10.1: Pengisian & Informasi SIBERMARU 2026
                    </CardTitle>
                    <Badge className="bg-indigo-600 text-white text-xs font-bold px-3 py-1">Langkah 10 / 10</Badge>
                  </div>
                  <CardDescription className="text-xs font-medium text-slate-300 mt-1">
                    Orientasi & Pengenalan Kehidupan Kampus bagi Mahasiswa Baru.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-5 text-xs">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-xl border space-y-1">
                      <p className="text-slate-500 text-[10px] font-bold">WAKTU PELAKSANAAN</p>
                      <p className="font-bold text-slate-900 text-sm">{settings?.sibermaru_schedule || "25 - 27 Agustus 2026"}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl border space-y-1">
                      <p className="text-slate-500 text-[10px] font-bold">LOKASI & METODE</p>
                      <p className="font-bold text-slate-900 text-sm">{settings?.sibermaru_location || "Auditorium Kampus & Hybrid Zoom"}</p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border space-y-1">
                    <p className="text-slate-500 text-[10px] font-bold">DRESSCODE RESMI</p>
                    <p className="font-medium text-slate-800">{settings?.sibermaru_dresscode || "Kemeja Putih, Celana/Rok Hitam, Jas Almamater"}</p>
                  </div>

                  {/* Form Kontak Darurat */}
                  <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-3">
                    <h4 className="font-bold text-indigo-950 text-xs uppercase tracking-wider">
                      Konfirmasi Kehadiran & Kontak Darurat (Orang Tua/Wali)
                    </h4>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[11px] font-bold">Nama Kontak Darurat *</Label>
                        <Input
                          value={sibermaruContact.name}
                          onChange={(e) => setSibermaruContact({ ...sibermaruContact, name: e.target.value })}
                          placeholder="Contoh: Bambang (Ayah)"
                          className="text-xs mt-1 bg-white"
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-bold">No. HP / WhatsApp Darurat *</Label>
                        <Input
                          value={sibermaruContact.phone}
                          onChange={(e) => setSibermaruContact({ ...sibermaruContact, phone: e.target.value })}
                          placeholder="081298765432"
                          className="text-xs mt-1 font-mono bg-white"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[11px] font-bold">Catatan Riwayat Kesehatan / Alergi (Opsional)</Label>
                      <Input
                        value={sibermaruContact.notes}
                        onChange={(e) => setSibermaruContact({ ...sibermaruContact, notes: e.target.value })}
                        placeholder="Contoh: Asma ringan, alergi dingin"
                        className="text-xs mt-1 bg-white"
                      />
                    </div>
                    <div className="flex justify-end pt-2">
                      <Button
                        type="button"
                        onClick={handleConfirmSibermaru}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-6 py-2.5 shadow-md"
                      >
                        Simpan Konfirmasi Sibermaru
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* SIAKAD Main System Login Credentials Card */}
              <Card className="border-2 border-indigo-200 bg-white shadow-lg overflow-hidden rounded-2xl">
                <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 p-6 text-white text-center space-y-2 relative overflow-hidden">
                  <div className="w-16 h-16 bg-gradient-to-tr from-amber-400 to-amber-200 text-slate-950 rounded-2xl flex items-center justify-center font-black text-3xl mx-auto shadow-lg ring-4 ring-amber-400/30">
                    <Trophy className="w-9 h-9 text-slate-900" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-amber-300 tracking-tight">
                    {applicant?.is_converted_to_student
                      ? "Selamat! Akun Sistem Utama (SIAKAD) Telah Aktif"
                      : "Akun SIAKAD Menunggu Aktivasi Admin"}
                  </h3>
                  <p className="text-xs text-slate-300 max-w-lg mx-auto leading-relaxed">
                    {applicant?.is_converted_to_student
                      ? `Anda telah resmi terdaftar sebagai Mahasiswa Baru Tahun Akademik ${settings?.active_period_name || "2026/2027"}. Gunakan informasi kredensial di bawah ini untuk mengakses Sistem Informasi Akademik (SIAKAD) Utama.`
                      : "Data Anda sudah masuk tahap akhir PMB. Kredensial SIAKAD akan tersedia setelah admin menyelesaikan aktivasi."}
                  </p>
                </div>

                <CardContent className="p-6 space-y-6 text-xs bg-white text-slate-900">
                  {applicant?.is_converted_to_student ? (
                    <>
                  {/* Rincian Identitas Mahasiswa & NIM */}
                  <div className="p-4 sm:p-5 bg-indigo-50/70 rounded-2xl border border-indigo-200 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-[10px] text-indigo-900 font-extrabold uppercase tracking-wider">NIM RESMI (USERNAME SIAKAD)</p>
                      <p className="font-mono font-black text-base sm:text-lg text-indigo-700 mt-1 select-all">
                        {applicant?.generated_nim || "Belum diterbitkan"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">NAMA MAHASISWA</p>
                      <p className="font-extrabold text-slate-900 text-sm mt-1">{applicant?.name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">PROGRAM STUDI</p>
                      <p className="font-bold text-slate-900 text-xs sm:text-sm mt-1">{applicant?.prodi_name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">GRADE SELEKSI & KELAS</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge className="bg-indigo-600 text-white font-extrabold text-[10px]">
                          {applicant?.test_grade || "Grade A"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] font-bold border-indigo-300 text-indigo-900 capitalize">
                          {applicant?.class_type === "khusus" ? "Eksekutif" : applicant?.learning_mode || "Reguler"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* BOX KREDENSIAL LOGIN SISTEM UTAMA */}
                  <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-4 shadow-md relative">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h4 className="font-extrabold text-amber-300 text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2">
                        <Key className="w-4 h-4 text-amber-400" /> Kredensial Login Portal Akademik Utama (SIAKAD)
                      </h4>
                      <Badge className="bg-emerald-500 text-white font-black text-[10px] px-2.5 py-0.5">
                        AKUN AKTIF
                      </Badge>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-4">
                      {/* Username */}
                      <div className="p-3.5 rounded-xl bg-slate-800/90 border border-slate-700/80 space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Username Utama (NIM)</span>
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-black text-amber-300 text-sm sm:text-base select-all">
                            {applicant?.generated_nim || "Belum diterbitkan"}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(applicant?.generated_nim || "");
                              toast.success("Username (NIM) berhasil disalin!");
                            }}
                            className="h-6 px-2 text-[10px] text-slate-300 hover:text-white hover:bg-slate-700 font-bold"
                          >
                            <Copy className="w-3 h-3 mr-1" /> Salin
                          </Button>
                        </div>
                        <p className="text-[9px] text-slate-400 mt-0.5">(Atau Email: <span className="text-slate-300 font-mono">{applicant?.email}</span>)</p>
                      </div>

                      {/* Password */}
                      <div className="p-3.5 rounded-xl bg-slate-800/90 border border-slate-700/80 space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Password Utama SIAKAD</span>
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-black text-emerald-400 text-sm sm:text-base select-all">
                            {applicant?.password_raw
                              || (applicant?.siakad_password_source === "default" ? "Mahasiswa1231!" : "Password PMB saat pendaftaran")}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (applicant?.password_raw) {
                                navigator.clipboard.writeText(applicant.password_raw);
                                toast.success("Password berhasil disalin!");
                              } else if (applicant?.siakad_password_source === "default") {
                                navigator.clipboard.writeText("Mahasiswa1231!");
                                toast.success("Password default berhasil disalin!");
                              } else {
                                toast.info("Gunakan password PMB yang dipakai saat pendaftaran.");
                              }
                            }}
                            className="h-6 px-2 text-[10px] text-slate-300 hover:text-white hover:bg-slate-700 font-bold"
                          >
                            <Copy className="w-3 h-3 mr-1" /> Salin
                          </Button>
                        </div>
                        <p className="text-[9px] text-slate-400 mt-0.5">
                          {applicant?.siakad_password_source === "default"
                            ? "Password default akun legacy: Mahasiswa1231!"
                            : "Password SIAKAD sama dengan password PMB yang dipakai saat pendaftaran."}
                        </p>
                      </div>

                      {/* Link URL Login */}
                      <div className="p-3.5 rounded-xl bg-slate-800/90 border border-slate-700/80 space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Link Login Sistem Utama</span>
                        <a
                          href={typeof window !== "undefined" ? `${window.location.origin}/login` : "/login"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono font-bold text-sky-400 hover:text-sky-300 underline text-xs sm:text-sm block truncate mt-1"
                        >
                          {typeof window !== "undefined" ? `${window.location.origin}/login` : "https://siakad.kampus.ac.id/login"}
                        </a>
                        <p className="text-[9px] text-slate-400 mt-0.5">Klik link untuk membuka portal login utama</p>
                      </div>
                    </div>

                    {/* Button Direct Login */}
                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800">
                      <p className="text-[11px] text-slate-400 font-medium">
                        Gunakan NIM & Password di atas untuk login ke SIAKAD, pengisian KRS, jadwal kuliah, & transkrip nilai.
                      </p>
                      <Button
                        type="button"
                        onClick={() => {
                          if (onSwitchToStudent) {
                            onSwitchToStudent(applicant);
                          } else if (typeof window !== "undefined") {
                            window.location.href = "/login";
                          }
                        }}
                        className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs px-6 py-3 shadow-lg flex items-center justify-center gap-2"
                      >
                        <Rocket className="w-4 h-4" /> Masuk ke Portal Mahasiswa SIAKAD Sekarang <ExternalLink className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    </div>
                  </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center space-y-2">
                      <p className="font-black text-amber-900 text-sm">Aktivasi SIAKAD belum selesai</p>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        Admin PMB perlu memverifikasi kelulusan, SK penerimaan, dan daftar ulang Anda terlebih dahulu. Setelah aktivasi selesai, NIM dan akses login akan tampil di halaman ini.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* Floating WhatsApp Instant Consultation Widget */}
      <PmbWhatsAppFloatingWidget settings={settings} branding={branding} />
    </div>
  );
}
