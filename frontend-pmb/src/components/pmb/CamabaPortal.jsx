import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { apiErrorMessage, resolveMediaUrl, BACKEND_URL } from "@/lib/utils";
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
  Lock
} from "lucide-react";
import { ReferralRegistrationModal } from "./ReferralComponents";
import { PmbExamPage } from "./PmbExamPage";
import { PmbWhatsAppFloatingWidget } from "./PmbWhatsAppFloatingWidget";

const api = axios.create({ baseURL: BACKEND_URL });

const STEPS = [
  { id: 1, label: "Formulir", desc: "Data Diri & Asal Sekolah", icon: User },
  { id: 2, label: "Pilih Kelas", desc: "Reguler / Khusus", icon: BookOpen },
  { id: 3, label: "Pembayaran", desc: "Biaya Pendaftaran", icon: CreditCard },
  { id: 4, label: "Grup WA", desc: "Gabung Grup Resmi", icon: MessageSquare },
  { id: 5, label: "Pilih Tes", desc: "Online CBT / Offline", icon: Layers },
  { id: 6, label: "Tes Offline", desc: "Jadwal & Hasil Kampus", icon: Building },
  { id: 7, label: "Tes Online", desc: "CBT Mandiri & Hasil", icon: Video },
  { id: 8, label: "Daftar Ulang", desc: "Pra-Studi & Ukuran Baju", icon: Shirt },
  { id: 9, label: "Sibermaru", desc: "Informasi Orientasi", icon: Calendar },
  { id: 10, label: "Masuk SIAKAD", desc: "NIM & SK Kelulusan", icon: Award },
];

function formatRupiah(num) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num || 0);
}

export function CamabaPortal({ token, onLogout, onSwitchToStudent, branding }) {
  const [applicant, setApplicant] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(1);
  const [showReferralModal, setShowReferralModal] = useState(false);

  // Form edit states
  const [examSession, setExamSession] = useState(null);
  const [examSessionStatus, setExamSessionStatus] = useState(null);
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
        const curr = res.data.applicant.current_step || 1;
        setActiveStep(curr);
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
      if (res.data.ok) {
        setExamSession(res.data.session || null);
        setExamSessionStatus(res.data.last_attempt || null);
      }
    } catch (_) {
      setExamSession(null);
    }
  };

  useEffect(() => {
    fetchExamSession();
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
      const res = await api.post(
        "/api/v1/pmb/pay-registration",
        { payment_method: method, payment_proof_url: proof_url },
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
        setActiveStep(type === "online" ? 7 : 6);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal memilih metode tes"));
    }
  };

  const handleStartCbt = async () => {
    if (settings?.online_test_enabled === false) {
      toast.error("Ujian Online (CBT) saat ini dinonaktifkan oleh panitia PMB.");
      return;
    }
    if (!examSession?.id) return;
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
      const res = await api.post(
        "/api/v1/pmb/reregister/pay",
        { scheme, term, payment_method: method, payment_proof_url: proof_url },
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
        setActiveStep(9);
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
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-3 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {branding?.campus_logo_url || branding?.logo_url ? (
            <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shadow-md border border-slate-200 overflow-hidden shrink-0">
              <img
                src={resolveMediaUrl(branding.campus_logo_url || branding.logo_url)}
                alt={branding?.campus_name || branding?.name || "Logo Kampus"}
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
          <div>
            <h1 className="font-extrabold text-base sm:text-lg text-slate-900 leading-tight">
              Portal Mahasiswa Baru {branding?.campus_name ? `• ${branding.campus_name}` : ""}
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              No. Registrasi: <span className="font-mono font-bold text-indigo-600">{applicant?.registration_number}</span> • {applicant?.period_name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {settings?.referral_enabled !== false && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowReferralModal(true)}
              className="text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold hidden sm:flex items-center gap-1.5"
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
            className="text-xs text-rose-600 hover:bg-rose-50 font-semibold"
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
      <main className="max-w-6xl mx-auto px-4 sm:px-6 w-full pt-6 space-y-6">
        {/* Banner Referral Promo */}
        {applicant?.referral_code ? (
          <div className="p-3.5 bg-gradient-to-r from-indigo-50 to-sky-50 border border-indigo-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Handshake className="w-5 h-5 text-indigo-600 shrink-0" />
              <p className="text-xs text-indigo-900 font-medium">
                Pendaftaran Anda terhubung dengan Kode Referal Promotor: <strong className="font-mono font-bold text-indigo-700">{applicant.referral_code}</strong> ({applicant.referrer_name || "Mitra Kampus"})
              </p>
            </div>
            <Badge className="bg-indigo-600 text-white text-[10px]">Referal Aktif</Badge>
          </div>
        ) : (
          <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl flex items-center justify-between">
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
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-7 px-3"
            >
              Daftar Referal
            </Button>
          </div>
        )}

        {/* 10-Step Progress Horizontal Stepper */}
        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-900 text-white py-3.5 px-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Alur Seleksi Penerimaan Mahasiswa Baru
                </CardTitle>
                <CardDescription className="text-slate-300 text-xs mt-0.5">
                  Ikuti 10 tahapan resmi berikut untuk menjadi Mahasiswa Aktif
                </CardDescription>
              </div>
              <Badge className="bg-sky-500/20 text-sky-300 border border-sky-400/30 text-xs px-2.5 py-0.5 font-bold">
                Langkah {activeStep} dari 10
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 overflow-x-auto">
            <div className="flex items-center justify-between min-w-[760px] gap-2">
              {STEPS.map((st) => {
                const currentStepNum = applicant?.current_step || 1;
                const isPassed = currentStepNum > st.id;
                const isCurrent = activeStep === st.id;
                const isLocked = currentStepNum < st.id;

                const handleStepClick = () => {
                  if (isPassed) {
                    toast.info(`Alur ${st.id} (${st.label}) telah selesai dilewati dan terkunci.`);
                  } else if (isLocked) {
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
                    className={`flex-1 flex flex-col items-center text-center p-2 rounded-xl transition-all ${
                      isCurrent
                        ? "bg-indigo-50 border-2 border-indigo-600 shadow-sm cursor-pointer"
                        : isPassed
                        ? "bg-emerald-50/60 border border-emerald-200 opacity-90 cursor-not-allowed"
                        : "bg-slate-50 border border-slate-200 opacity-40 cursor-not-allowed"
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                        isCurrent
                          ? "bg-indigo-600 text-white ring-4 ring-indigo-100"
                          : isPassed
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {isPassed ? <Check className="w-4 h-4" /> : isLocked ? <Lock className="w-3.5 h-3.5" /> : st.id}
                    </div>
                    <span className="text-[11px] font-bold text-slate-800 line-clamp-1">{st.label}</span>
                    <span className="text-[9px] text-slate-500 line-clamp-1">
                      {isPassed ? "Selesai ✓" : isCurrent ? "Sedang Berjalan" : "Terkunci 🔒"}
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
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <User className="w-5 h-5 text-indigo-600" />
                    Alur 1: Data Diri & Asal Sekolah Calon Mahasiswa
                  </CardTitle>
                  <Badge className="bg-indigo-600 text-white text-xs font-bold">Langkah 1 / 10</Badge>
                </div>
                <CardDescription className="text-xs">
                  Periksa kelengkapan identitas pribadi dan riwayat pendidikan asal sekolah Anda sebelum melanjutkan.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-5 text-xs">
                {/* 1. Identitas Lengkap */}
                <div className="space-y-2">
                  <p className="font-bold text-indigo-900 uppercase tracking-wider text-[11px]">1. Identitas Calon Mahasiswa</p>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">Nama Lengkap</p>
                      <p className="font-bold text-slate-800 mt-0.5 text-sm">{applicant?.name}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">Tempat, Tanggal Lahir</p>
                      <p className="font-bold text-slate-800 mt-0.5">{applicant?.tempat_lahir || "-"}, {applicant?.tanggal_lahir || "-"}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">No. HP / WhatsApp</p>
                      <p className="font-mono font-bold text-slate-800 mt-0.5">{applicant?.whatsapp || "-"}</p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">NIK</p>
                      <p className="font-mono font-bold text-slate-800 mt-0.5">{applicant?.nik || "-"}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">NISN</p>
                      <p className="font-mono font-bold text-slate-800 mt-0.5">{applicant?.nisn || "-"}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">Nama Ibu Kandung</p>
                      <p className="font-bold text-slate-800 mt-0.5">{applicant?.nama_ibu_kandung || "-"}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">Tinggi / Berat Badan</p>
                      <p className="font-bold text-slate-800 mt-0.5">{applicant?.tinggi_badan || "-"} cm / {applicant?.berat_badan || "-"} kg</p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">Email Aktif</p>
                      <p className="font-bold text-slate-800 mt-0.5">{applicant?.email || "-"}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">Alamat Lengkap</p>
                      <p className="font-medium text-slate-800 mt-0.5 line-clamp-2">{applicant?.alamat || "-"}</p>
                    </div>
                  </div>
                </div>

                {/* 2. Data Asal Sekolah */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <p className="font-bold text-sky-900 uppercase tracking-wider text-[11px]">2. Data Asal Sekolah</p>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">Nama Sekolah</p>
                      <p className="font-bold text-slate-800 mt-0.5">{applicant?.asal_sekolah || "-"}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">NPSN Sekolah</p>
                      <p className="font-mono font-bold text-slate-800 mt-0.5">{applicant?.npsn_sekolah || "-"}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">Alamat Sekolah</p>
                      <p className="font-medium text-slate-800 mt-0.5">{applicant?.alamat_sekolah || "-"}</p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">Jurusan Saat Sekolah</p>
                      <p className="font-bold text-slate-800 mt-0.5">{applicant?.jurusan_asal || "-"}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">Tahun Lulus</p>
                      <p className="font-bold text-slate-800 mt-0.5">{applicant?.tahun_lulus || "-"}</p>
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
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-indigo-600" />
                    Alur 2: Pilihan Program Studi & Tipe Perkuliahan
                  </CardTitle>
                  <Badge className="bg-indigo-600 text-white text-xs font-bold">Langkah 2 / 10</Badge>
                </div>
                <CardDescription className="text-xs">
                  Pastikan pilihan program studi dan jenis kelas kuliah Anda sudah sesuai sebelum melanjutkan ke pembayaran biaya formulir.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-5 text-xs">
                <div className="space-y-2">
                  <p className="font-bold text-emerald-900 uppercase tracking-wider text-[11px]">Pilihan Program Studi Politeknik SCI</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="p-4 bg-sky-50/80 rounded-xl border border-sky-200 space-y-1">
                      <p className="text-sky-800 font-bold text-[10px]">PRODI PILIHAN 1 (UTAMA)</p>
                      <p className="text-sm font-black text-sky-950">{applicant?.prodi_name}</p>
                      <p className="text-[11px] text-sky-700">Kode: {applicant?.prodi_kode || "-"}</p>
                    </div>
                    <div className="p-4 bg-indigo-50/80 rounded-xl border border-indigo-200 space-y-1">
                      <p className="text-indigo-800 font-bold text-[10px]">PRODI PILIHAN 2 (CADANGAN)</p>
                      <p className="text-sm font-black text-indigo-950">{applicant?.prodi_2_name || "Tidak memilih cadangan"}</p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3 pt-2">
                    <div className="p-3.5 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">Tipe Kelas</p>
                      <p className="font-bold text-slate-800 mt-0.5 capitalize">Kelas {applicant?.class_type}</p>
                    </div>
                    <div className="p-3.5 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">Mode Perkuliahan</p>
                      <p className="font-bold text-slate-800 mt-0.5 capitalize">{applicant?.learning_mode || "Hybrid (Online & Offline)"}</p>
                    </div>
                    <div className="p-3.5 bg-slate-50 rounded-lg border">
                      <p className="text-slate-500 text-[10px]">Sumber Informasi Kampus</p>
                      <p className="font-bold text-slate-800 mt-0.5">{applicant?.info_source || "Media Sosial"}</p>
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
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-indigo-600" />
                    Alur 3: Pembayaran Biaya Pendaftaran
                  </CardTitle>
                  <Badge variant={applicant?.reg_payment_status === "verified" ? "default" : "destructive"} className="inline-flex items-center gap-1">
                    {applicant?.reg_payment_status === "verified" ? <><Check className="w-3 h-3" /> Terverifikasi</> : "Menunggu Pembayaran"}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Pilih metode pembayaran yang didukung untuk melunasi biaya pendaftaran calon mahasiswa baru.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-5 text-xs">
                 <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                   {/* Rekening tujuan */}
                   <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                     <div className="space-y-0.5">
                       <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Rekening Tujuan PMB</p>
                       <p className="font-bold text-slate-900">{paymentQuote?.account?.bank_name || settings?.bank_account_name || "-"}</p>
                       <p className="font-mono text-indigo-700 text-sm">{paymentQuote?.account?.bank_account_number || settings?.bank_account_number || "-"}</p>
                       <p className="text-slate-600 text-xs">a.n. {paymentQuote?.account?.bank_account_holder || settings?.bank_account_holder || "-"}</p>
                     </div>
                     {paymentQuote?.qris_image_url && paymentMethod === "QRIS" && (
                       <img src={paymentQuote.qris_image_url} alt="QRIS" className="w-24 h-24 object-contain" />
                     )}
                   </div>

                   {/* Tagihan kode unik */}
                   <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
                     <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Total Tagihan yang Harus Dibayar</p>
                     <p className="text-xs text-slate-500">Biaya pendaftaran: {formatRupiah(paymentQuote?.registration?.fee || 250000)}</p>
                     <p className="font-mono font-black text-indigo-700 text-xl">Rp {(paymentQuote?.registration?.amount || 0).toLocaleString("id-ID")}</p>
                     <p className="text-xs text-amber-700">Kode unik: <strong>{paymentQuote?.registration?.unique_code || "-"}</strong> (3 digit terakhir nominal untuk identifikasi otomatis)</p>
                   </div>

                   {/* Metode pembayaran pilihan */}
                   <div className="space-y-1.5">
                     <Label className="text-[10px] font-bold text-slate-600">Pilih Metode Pembayaran yang Didukung</Label>
                     {availablePaymentMethods.length > 0 ? (
                       <select
                         value={paymentMethod}
                         onChange={(e) => { setPaymentMethod(e.target.value); setProofFile(null); }}
                         className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 font-medium bg-white"
                       >
                         {availablePaymentMethods.map((m) => (
                           <option key={m.id} value={m.id}>
                             {m.label}
                           </option>
                         ))}
                       </select>
                     ) : (
                       <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                         Metode pembayaran sedang dalam pengaturan panitia. Silakan hubungi panitia PMB.
                       </div>
                     )}
                   </div>

                   {/* Upload bukti (MANUAL) */}
                   {paymentMethod === "MANUAL" && (
                     <div className="space-y-1.5 p-3 rounded-xl bg-sky-50/60 border border-sky-200">
                       <Label className="text-[10px] font-bold text-slate-700">Unggah Bukti Transfer Bank</Label>
                       <Input
                         type="file"
                         accept="image/png,image/jpeg,.pdf"
                         onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                         className="bg-white text-xs"
                       />
                       <p className="text-[10px] text-slate-500">Format file PNG/JPG/PDF maks 5 MB. Bukti akan diverifikasi oleh panitia PMB.</p>
                     </div>
                   )}
                 </div>

                 {applicant?.reg_payment_status !== "verified" && (
                   <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                     <div>
                       <p className="text-xs text-slate-500">Total Biaya Pendaftaran</p>
                       <h3 className="text-2xl font-black text-amber-400 mt-0.5">
                         {formatRupiah(paymentQuote?.registration?.amount || applicant?.reg_payment_fee || 250000)}
                       </h3>
                     </div>
                     <Button
                       type="button"
                       onClick={handlePayRegistration}
                       disabled={uploadingProof || availablePaymentMethods.length === 0}
                       className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2.5 shadow-lg"
                     >
                       {uploadingProof ? "Mengunggah..." : paymentMethod === "MANUAL" ? "Konfirmasi Bukti Transfer" : "Bayar Sekarang"}
                     </Button>
                   </div>
                 )}

                {applicant?.reg_payment_status === "verified" && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold"><Check className="w-4 h-4" /></div>
                      <div>
                        <p className="font-bold text-emerald-900">Pembayaran Pendaftaran Selesai</p>
                        <p className="text-[11px] text-emerald-700">Metode: {applicant?.reg_payment_method} • Status: Lunas & Terverifikasi</p>
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
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-emerald-600" />
                    Alur 4: Bergabung ke Grup WhatsApp Calon Mahasiswa Baru
                  </CardTitle>
                  <Badge className="bg-emerald-600 text-white text-xs font-bold">Langkah 4 / 10</Badge>
                </div>
                <CardDescription className="text-xs">
                  Dapatkan informasi penting mengenai jadwal tes, bimbingan her-registrasi, dan koordinasi panitia.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4 text-xs text-center sm:text-left">
                <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-bold text-emerald-950 text-sm">{settings?.wa_group_name || "Grup Resmi PMB Kampus"}</h4>
                    <p className="text-slate-600 text-xs">Klik tombol di samping untuk bergabung langsung via aplikasi WhatsApp dan melanjutkan ke Alur 5.</p>
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
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-600" />
                    Alur 5: Pemilihan Jalur Tes Masuk
                  </CardTitle>
                  <Badge className="bg-indigo-600 text-white text-xs font-bold">Langkah 5 / 10</Badge>
                </div>
                <CardDescription className="text-xs">
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

          {/* STEP 6: OFFLINE TEST INFORMATION */}
          {activeStep === 6 && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Building className="w-5 h-5 text-sky-600" />
                    Alur 6: Jadwal & Pelaksanaan Tes Offline di Kampus
                  </CardTitle>
                  <Badge className="bg-sky-600 text-white text-xs font-bold">Langkah 6 / 10</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-4 text-xs">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl border space-y-1">
                    <p className="text-slate-500 text-[10px] font-bold">JADWAL TES OFFLINE</p>
                    <p className="font-bold text-slate-900 text-sm">{applicant?.offline_test_schedule || settings?.offline_test_schedule_default}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border space-y-1">
                    <p className="text-slate-500 text-[10px] font-bold">LOKASI / RUANG UJIAN</p>
                    <p className="font-bold text-slate-900 text-sm">{applicant?.offline_test_location || settings?.offline_test_location}</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-sky-200 bg-sky-50 space-y-2">
                  <h4 className="font-bold text-sky-950 text-sm">Status Hasil Ujian Offline:</h4>
                  <p className="text-slate-700">
                    Nilai Ujian: <strong className="text-indigo-700 font-bold">{applicant?.test_score || 0} / 100</strong> • Status:{" "}
                    <Badge variant={applicant?.test_status === "passed" ? "default" : "outline"} className="capitalize">
                      {applicant?.test_status || "Menunggu Penilaian Penguji"}
                    </Badge>
                  </p>
                </div>

                {applicant?.test_status === "passed" && (
                  <div className="flex justify-end pt-2">
                    <Button
                      type="button"
                      onClick={() => setActiveStep(8)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 shadow-md"
                    >
                      Lanjut ke Daftar Ulang (Alur 8) <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* STEP 7: PELAKSANAAN TES ONLINE CBT */}
          {activeStep === 7 && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Monitor className="w-5 h-5 text-indigo-600" />
                    Alur 7: Pelaksanaan Tes Online CBT (Resmi)
                  </CardTitle>
                  <Badge className="bg-indigo-600 text-white text-xs font-bold">Langkah 7 / 10</Badge>
                </div>
                <CardDescription className="text-xs">
                  Ujian dilaksanakan pada sesi yang dijadwalkan panitia PMB. Gunakan token ujian yang dibagikan panitia untuk masuk ke ruang ujian layar penuh.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-5 text-xs">
                {!examSession && (
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
                    <h4 className="font-bold text-slate-900 text-base">Belum Ada Sesi Ujian Terjadwal</h4>
                    <p className="text-slate-600">
                      Panitia PMB akan membagikan jadwal sesi ujian online beserta token ujian. Silakan pantau halaman ini secara berkala.
                    </p>
                  </div>
                )}

                {examSession && examSessionStatus?.status === "running" && (
                  <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-amber-950 text-base inline-flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-amber-600 animate-spin" /> Ujian Sedang Berjalan
                      </h4>
                    </div>
                    <p className="text-amber-800">Anda memiliki ujian yang belum dikumpulkan pada sesi <b>{examSession.title}</b>. Lanjutkan atau kumpulkan sebelum waktu habis.</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        type="text"
                        value={examToken}
                        onChange={(e) => setExamToken(e.target.value)}
                        placeholder="Token ujian (dari panitia PMB)"
                        className="bg-white border-amber-300 text-xs py-2.5"
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        onClick={handleStartCbt}
                        className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-6 py-2.5 shadow-md shrink-0"
                      >
                        <Rocket className="w-4 h-4 mr-1.5 inline" /> Lanjutkan Ujian
                      </Button>
                    </div>
                  </div>
                )}

                {examSession && examSessionStatus?.status !== "running" && (
                  <div className="p-5 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-indigo-950 text-base">{examSession.title}</h4>
                        <p className="text-slate-600 text-xs mt-0.5">{examSession.description || "Sesi ujian seleksi masuk CBT online"}</p>
                      </div>
                      <Badge className={`text-white text-xs font-bold px-3 py-1 ${
                        examSession.state === "open" ? "bg-emerald-600" :
                        examSession.state === "not_started" ? "bg-amber-600" :
                        examSession.state === "expired" ? "bg-slate-500" : "bg-slate-400"
                      }`}>
                        {examSession.state_label}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-xl bg-white border border-indigo-100 p-3 text-center">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Jadwal</p>
                        <p className="font-bold text-indigo-950 text-xs mt-1">
                          {examSession.start_at
                            ? new Date(examSession.start_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })
                            : "-"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white border border-indigo-100 p-3 text-center">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Durasi</p>
                        <p className="font-bold text-indigo-950 text-xs mt-1">{examSession.duration_minutes} Menit</p>
                      </div>
                      <div className="rounded-xl bg-white border border-indigo-100 p-3 text-center">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Passing Grade</p>
                        <p className="font-bold text-indigo-950 text-xs mt-1">{examSession.passing_grade}</p>
                      </div>
                    </div>

                    {examSession.state !== "open" ? (
                      <p className="text-slate-600 bg-white border border-indigo-100 rounded-lg p-3">
                        Ujian belum dibuka / telah berakhir. Mohon menunggu jadwal sesi berikutnya dari panitia PMB.
                      </p>
                    ) : (
                      <>
                        {examSessionStatus?.flagged && (
                          <div className="rounded-lg bg-amber-100 border border-amber-300 p-3 text-amber-800">
                            Ujian sebelumnya ditandai <b>mencurigakan</b>. Gunakan token <b>ujian ulang (retake)</b> yang diberikan panitia untuk mengikuti ujian kembali.
                          </div>
                        )}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between bg-white border border-indigo-100 rounded-lg p-4">
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">Ruang Ujian Layar Penuh</p>
                            <p className="text-slate-500 text-[11px]">
                              {examSessionStatus ? "Kumpulkan ujian berjalan atau ikuti sesi berikutnya dengan token baru." : "Masukkan token ujian dari panitia PMB sebelum mulai."}
                            </p>
                          </div>
                          <div className="flex flex-col sm:flex-row items-stretch gap-2">
                            <Input
                              type="text"
                              value={examToken}
                              onChange={(e) => setExamToken(e.target.value)}
                              placeholder="Token ujian"
                              className="bg-white border-indigo-200 text-xs py-2.5 w-full sm:w-48"
                              autoComplete="off"
                            />
                            <Button
                              type="button"
                              onClick={handleStartCbt}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-6 py-2.5 shadow-md shrink-0"
                            >
                              <Rocket className="w-4 h-4 mr-1.5 inline" />
                              {examSessionStatus ? "Masuk Ruang Ujian" : "Mulai Ujian Sekarang"}
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Hasil Nilai CBT */}
                {applicant?.test_status === "passed" && (
                  <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-emerald-950 text-base inline-flex items-center gap-2">
                        <Check className="w-5 h-5 text-emerald-600" /> Selamat! Anda Dinyatakan LULUS
                      </h4>
                      <Badge className="bg-emerald-600 text-white text-xs font-bold px-3 py-1">LULUS SELEKSI</Badge>
                    </div>
                    <p className="text-slate-700">
                      Nilai Ujian CBT Anda: <strong className="text-emerald-800 text-base font-black">{applicant?.test_score} / 100</strong> (Passing Grade: {examSession?.passing_grade || settings?.passing_grade || 70})
                    </p>
                    <div className="flex justify-end pt-2">
                      <Button
                        type="button"
                        onClick={() => setActiveStep(8)}
                        className="bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 shadow-md"
                      >
                        Lanjut ke Daftar Ulang & Ukuran Baju (Alur 8) <ArrowRight className="w-4 h-4 ml-1.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* STEP 8: DAFTAR ULANG (UANG PRA-STUDI & UKURAN BAJU) */}
          {activeStep === 8 && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Shirt className="w-5 h-5 text-indigo-600" />
                    Alur 8: Daftar Ulang (Pembayaran Uang Pra-Studi & Ukuran Baju)
                  </CardTitle>
                  <Badge className="bg-indigo-600 text-white text-xs font-bold">Langkah 8 / 10</Badge>
                </div>
                <CardDescription className="text-xs">
                  Selesaikan her-registrasi dengan skema pembayaran fleksibel serta penentuan ukuran jaket almamater.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6 text-xs">
                {/* 8.1 Skema Cicilan / Lunas Uang Pra-Studi */}
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                    8.1 Pembayaran Uang Pra-Studi ({formatRupiah(applicant?.pra_studi_fee || 3500000)})
                  </h4>

                  {/* Pilih Lunas vs Cicilan */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPraPayScheme("full")}
                      className={`px-4 py-2 rounded-xl border font-bold text-xs transition ${
                        praPayScheme === "full" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      Bayar Lunas (Full)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPraPayScheme("installment")}
                      className={`px-4 py-2 rounded-xl border font-bold text-xs transition ${
                        praPayScheme === "installment" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      Cicil {applicant?.installments?.length || 3}x
                    </button>
                  </div>

                  {/* Metode & Rekening (shared) */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-600">Pilih Metode Pembayaran</Label>
                      {availablePaymentMethods.length > 0 ? (
                        <select
                          value={paymentMethod}
                          onChange={(e) => { setPaymentMethod(e.target.value); setProofFile(null); }}
                          className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 font-medium bg-white"
                        >
                          {availablePaymentMethods.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                          Metode pembayaran sedang dalam pengaturan panitia.
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Rekening Tujuan</p>
                      <p className="font-mono font-bold text-indigo-700 text-sm">{paymentQuote?.account?.bank_account_number || "-"}</p>
                      <p className="text-xs text-slate-600">a.n. {paymentQuote?.account?.bank_account_holder || "-"}</p>
                    </div>
                  </div>
                  {paymentMethod === "MANUAL" && (
                    <div className="space-y-1 p-3 rounded-xl bg-sky-50/60 border border-sky-200">
                      <Label className="text-[10px] font-bold text-slate-700">Bukti Transfer Pra-Studi</Label>
                      <Input
                        type="file"
                        accept="image/png,image/jpeg,.pdf"
                        onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                        className="bg-white text-xs"
                      />
                    </div>
                  )}

                  {/* Tagihan per opsi */}
                  {praPayScheme === "full" ? (
                    <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-4 space-y-2">
                      <p className="text-[10px] uppercase tracking-widest text-indigo-700 font-bold">Tagihan Lunas (Full Payment)</p>
                      <p className="font-mono font-black text-indigo-700 text-xl">Rp {(paymentQuote?.pra_studi?.full_amount || applicant?.pra_studi_fee || 3500000).toLocaleString("id-ID")}</p>
                      <p className="text-xs text-amber-700">Kode unik: <strong>{paymentQuote?.pra_studi?.full_code || "-"}</strong></p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handlePayPraStudi("full")}
                        disabled={uploadingProof}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs mt-2"
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
                            className={`p-3.5 rounded-xl border space-y-2 ${
                              isPaid ? "bg-emerald-50 border-emerald-300" : activeT ? "bg-indigo-50/50 border-indigo-400" : "bg-slate-50 border-slate-200"
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-800 text-[11px]">{inst.name || `Cicilan ${inst.term}`}</span>
                              <Badge variant={isPaid ? "default" : "outline"} className="text-[9px]">
                                {isPaid ? "Lunas" : "Belum Bayar"}
                              </Badge>
                            </div>
                            <p className="text-xl font-black text-indigo-700 font-mono">Rp {(quote?.amount || inst.amount).toLocaleString("id-ID")}</p>
                            {!isPaid && <p className="text-xs text-amber-700">Kode unik: <strong>{quote?.unique_code || "-"}</strong></p>}
                            {!isPaid && (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => { setPraPayTerm(inst.term); handlePayPraStudi("installment", inst.term); }}
                                disabled={uploadingProof}
                                className="w-full bg-indigo-600 text-white font-bold text-[10px] h-7"
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

                {/* 8.2 Pengisian Ukuran Baju Almamater */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                    8.2 Pengisian Informasi Ukuran Baju / Seragam Almamater
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {["S", "M", "L", "XL", "XXL", "XXXL"].map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setSelectedShirtSize(sz)}
                        className={`w-12 h-10 rounded-lg border font-bold text-xs transition-all ${
                          selectedShirtSize === sz
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-white border-slate-300 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">Catatan Khusus Ukuran / Panjang Lengan (Opsional)</Label>
                    <Input
                      value={shirtNotes}
                      onChange={(e) => setShirtNotes(e.target.value)}
                      placeholder="Contoh: Tinggi 175cm, berat 68kg, minta lengan sedikit lebih panjang"
                      className="text-xs mt-1"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleSaveShirtSize}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                  >
                    Simpan Ukuran Baju & Lanjut ke Sibermaru
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 9: INFORMASI SIBERMARU (ORIENTASI) */}
          {activeStep === 9 && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-indigo-600" />
                    Alur 9: Pengisian & Informasi SIBERMARU 2026
                  </CardTitle>
                  <Badge className="bg-indigo-600 text-white text-xs font-bold">Langkah 9 / 10</Badge>
                </div>
                <CardDescription className="text-xs">
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
                      Konfirmasi Kehadiran & Lanjut ke Alur 10 <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 10: PENGUMUMAN MASUK SISTEM & NIM RESMI */}
          {activeStep === 10 && (
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 p-6 text-white text-center space-y-2">
                <div className="w-14 h-14 bg-amber-400 text-slate-950 rounded-2xl flex items-center justify-center font-black text-2xl mx-auto shadow-lg">
                  <Trophy className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-extrabold text-amber-300">Surat Keputusan Penerimaan Mahasiswa Baru</h3>
                <p className="text-xs text-slate-300 max-w-md mx-auto">
                  Selamat atas keberhasilan Anda menyelesaikan seluruh tahapan seleksi PMB 2026/2027!
                </p>
              </div>
              <CardContent className="p-6 space-y-5 text-xs">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid sm:grid-cols-3 gap-3 text-center sm:text-left">
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold">NIM RESMI ANDA</p>
                    <p className="font-mono font-black text-lg text-indigo-700 mt-0.5">
                      {applicant?.generated_nim || "2026010042"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold">PROGRAM STUDI</p>
                    <p className="font-bold text-slate-900 mt-0.5 text-sm">{applicant?.prodi_name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold">STATUS AKUN SIAKAD</p>
                    <Badge className="bg-emerald-600 text-white text-xs mt-1 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Mahasiswa Aktif</Badge>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={() => {
                      if (onSwitchToStudent) onSwitchToStudent(applicant);
                    }}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs px-6 py-3 shadow-lg"
                  >
                    <Rocket className="w-4 h-4 mr-1.5 inline" /> Masuk ke Portal Mahasiswa SIAKAD
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Floating WhatsApp Instant Consultation Widget */}
      <PmbWhatsAppFloatingWidget settings={settings} branding={branding} />
    </div>
  );
}

export default CamabaPortal;
