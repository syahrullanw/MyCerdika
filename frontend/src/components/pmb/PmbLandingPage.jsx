import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  User,
  GraduationCap,
  CreditCard,
  MessageSquare,
  Sparkles,
  Shirt,
  Calendar,
  Building,
  ArrowRight,
  BookOpen,
  Award,
  Video,
  Layers,
  Phone,
  Mail,
  MapPin,
  Gift,
  Monitor,
  Globe,
  Zap,
  ClipboardList,
  KeyRound,
  Target,
  Check,
  Rocket,
  Wallet
} from "lucide-react";
import { PmbDirectRegisterModal } from "./PmbDirectRegisterModal";
import { ReferralRegistrationModal } from "./ReferralComponents";
import { SciBackgroundCanvas } from "./SciBackgroundCanvas";
import { PmbWhatsAppFloatingWidget } from "./PmbWhatsAppFloatingWidget";
import { resolveMediaUrl } from "../../lib/utils";

const WHY_US_ICONS = {
  monitor: Monitor,
  globe: Globe,
  "credit-card": CreditCard,
  zap: Zap,
  sparkles: Sparkles,
};

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") || window.location.origin;
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

export function PmbLandingPage({ onOpenRegister, onOpenLogin, onAuth, branding, onBackToSiakad }) {
  const [programs, setPrograms] = useState([]);
  const [settings, setSettings] = useState(null);
  const [showDirectRegister, setShowDirectRegister] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [selectedProdiForRegister, setSelectedProdiForRegister] = useState("");
  const [activeFaq, setActiveFaq] = useState(null);

  useEffect(() => {
    api.get("/api/v1/pmb/public/config")
      .then(({ data }) => {
        if (data.ok) {
          setPrograms(data.programs || []);
          setSettings(data.settings || {});
        }
      })
      .catch(() => {});
  }, []);

  const handleRegisterProdi = (prodiId) => {
    setSelectedProdiForRegister(prodiId);
    if (onOpenRegister) {
      onOpenRegister(prodiId);
    } else {
      setShowDirectRegister(true);
    }
  };

  const vis = settings?.landing_sections_visibility || {
    announcement: true,
    hero: true,
    why_us: true,
    programs: true,
    steps: true,
    fees: true,
    scholarships: true,
    referral: true,
    faq: true,
    footer: true,
  };

  const whyUsList = settings?.landing_why_us?.length > 0 ? settings.landing_why_us : [
    { icon: "monitor", title: "Kurikulum Berbasis AI & Industri", description: "Materi perkuliahan dirancang langsung bersama praktisi top industri software, data, dan korporasi." },
    { icon: "globe", title: "Fleksibilitas Kuliah Hybrid", description: "Tersedia kelas Reguler Online (Daring Penuh) dan Kelas Khusus Karyawan malam/akhir pekan." },
    { icon: "credit-card", title: "Cicilan Pra-Studi Ringan", description: "Biaya uang pra-studi dapat dicicil 3x termin bulanan tanpa bunga demi kenyamanan finansial keluarga." },
    { icon: "zap", title: "CBT Online & Auto NIM", description: "Ujian mandiri kapan saja dari rumah dan aktivasi akun mahasiswa SIAKAD instan 1-klik." }
  ];

  const scholarshipsList = settings?.landing_scholarships?.length > 0 ? settings.landing_scholarships : [
    { name: "Beasiswa Prestasi Rapor", badge: "Bebas Tes CBT", benefit: "Potongan Uang Pra-Studi 50% - 100%", desc: "Untuk lulusan SMA/SMK dengan rata-rata nilai rapor semester 1-5 minimal 85.00." },
    { name: "Beasiswa KIP-Kuliah", badge: "Biaya 100% Gratis", benefit: "Bebas Biaya Kuliah & Uang Saku", desc: "Program bantuan pemerintah bagi calon mahasiswa berprestasi dari keluarga prasejahtera." },
    { name: "Beasiswa Tahfidz Qur'an", badge: "Khusus Hafidz", benefit: "Bebas Biaya Pendidikan Penuh", desc: "Bagi penghafal Al-Qur'an minimal 5 Juz bersertifikat resmi." },
    { name: "Beasiswa Mitra Industri", badge: "Ikatan Karir", benefit: "Subsidi Pendidikan & Magang", desc: "Program kemitraan perusahaan teknologi dan BUMN dengan penempatan kerja." }
  ];

  const faqsList = settings?.landing_faqs?.length > 0 ? settings.landing_faqs : [
    { q: "Bagaimana alur pendaftaran mahasiswa baru di kampus ini?", a: "Alur pendaftaran terdiri dari 10 tahapan praktis: 1. Isi Formulir Online, 2. Pilih Kelas (Reguler/Khusus), 3. Bayar Biaya Formulir (QRIS/VA), 4. Gabung Grup WhatsApp Resmi, 5. Pilih Jalur Tes (CBT Online / Offline Kampus), 6/7. Ujian & Skor Keluar Instan, 8. Daftar Ulang (Pra-studi & Ukuran Baju), 9. Konfirmasi Sibermaru, dan 10. Penerbitan NIM Resmi SIAKAD." },
    { q: "Apakah tersedia pilihan kuliah Online (Daring Penuh) dan Kelas Karyawan?", a: "Ya! Untuk Kelas Reguler tersedia opsi mode Online (Daring Penuh) dan Offline (Tatap Muka). Untuk Kelas Khusus / Karyawan (jadwal malam / akhir pekan), perkuliahan diselenggarakan secara Tatap Muka di kampus sesuai standar mutu kurikulum." },
    { q: "Apakah biaya uang pra-studi daftar ulang bisa dicicil?", a: "Tentu saja! Kami menyediakan skema cicilan ringan hingga 3x termin: Termin 1 (Uang Muka), Termin 2, dan Termin 3 yang dapat dibayarkan secara bertahap setiap bulan tanpa bunga." },
    { q: "Bagaimana cara mengikuti tes online CBT mandiri?", a: "Setelah menyelesaikan pembayaran formulir, Anda dapat memilih 'Online Test (CBT)'. Ujian berlangsung selama 45 menit via smartphone atau laptop dengan 10 butir soal penalaran dan wawasan, di mana nilai dan status kelulusan Anda akan langsung keluar seketika." },
    { q: "Apa itu Program Mitra Referal PMB?", a: "Program Referal memungkinkan mahasiswa aktif, dosen, maupun masyarakat umum mendapatkan insentif fee komisi tunai (hingga Rp 250.000 / mahasiswa) untuk setiap calon mahasiswa yang diajak mendaftar dan menyelesaikan daftar ulang." }
  ];

  const campusLogoUrl = branding?.campus_logo_url || branding?.logo_url;
  const campusDisplayName = branding?.campus_name || branding?.name || "POLITEKNIK SCI";
  const campusDescription = branding?.campus_motto || "Pusat Penerimaan Mahasiswa Baru & Sistem Informasi Akademik Terpadu.";
  const campusAddress = branding?.campus_address || settings?.landing_contact_address || "";
  const campusPhone = branding?.campus_whatsapp || branding?.campus_phone || settings?.landing_contact_phone || "";
  const campusEmail = branding?.campus_email || settings?.landing_contact_email || "";

  return (
    <div className="min-h-screen sci-landing-bg text-slate-100 font-sans selection:bg-sky-500 selection:text-white relative">
      {/* 0. SSO-SCI Animated 3D Perspective Wave Grid Canvas & Cursor Glow */}
      <SciBackgroundCanvas />

      {/* 1. Top Announcement Bar */}
      {vis.announcement !== false && (
        <div className="relative z-20 bg-gradient-to-r from-blue-900/90 via-sky-800/90 to-indigo-900/90 border-b border-sky-400/20 backdrop-blur-md text-white text-center py-2 px-4 text-xs font-bold flex items-center justify-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
          <span>{settings?.landing_announcement || "Penerimaan Mahasiswa Baru Tahun Akademik 2026/2027 Gelombang 1 Resmi Dibuka! Beasiswa s.d. 100% Tersedia."}</span>
        </div>
      )}

      {/* 2. Main Navbar */}
      <header className="sticky top-0 z-40 bg-[#020d22]/80 backdrop-blur-xl border-b border-sky-500/20 px-4 sm:px-8 py-3.5 shadow-2xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {campusLogoUrl ? (
              <div className="w-11 h-11 rounded-xl bg-white/95 p-1 flex items-center justify-center shadow-lg shadow-sky-500/25 border border-sky-400/40 overflow-hidden shrink-0">
                <img
                  src={resolveMediaUrl(campusLogoUrl)}
                  alt={campusDisplayName}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    e.currentTarget.parentElement.innerHTML = `<div class="w-full h-full rounded-lg bg-gradient-to-tr from-sky-400 to-indigo-700 flex items-center justify-center text-white font-bold"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/></svg></div>`;
                  }}
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-400 via-blue-600 to-indigo-700 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-sky-500/25 border border-sky-400/30 shrink-0">
                <GraduationCap className="w-6 h-6" />
              </div>
            )}
            <div>
              <h1 className="font-extrabold text-base sm:text-lg text-white leading-tight flex items-center gap-1.5">
                {campusDisplayName}
              </h1>
              <p className="text-[11px] text-cyan-400 font-semibold tracking-wider uppercase">
                {settings?.active_period_name || "Portal Resmi PMB 2026/2027"}
              </p>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-6 text-xs font-bold text-slate-300">
            {vis.why_us !== false && <a href="#keunggulan" className="hover:text-cyan-400 transition-colors">Keunggulan</a>}
            {vis.programs !== false && <a href="#prodi" className="hover:text-cyan-400 transition-colors">Program Studi</a>}
            {vis.steps !== false && <a href="#alur" className="hover:text-cyan-400 transition-colors">Alur Pendaftaran</a>}
            {vis.fees !== false && <a href="#biaya" className="hover:text-cyan-400 transition-colors">Biaya & Cicilan</a>}
            {vis.scholarships !== false && <a href="#beasiswa" className="hover:text-cyan-400 transition-colors">Beasiswa</a>}
            {vis.faq !== false && <a href="#faq" className="hover:text-cyan-400 transition-colors">FAQ</a>}
          </nav>

          <div className="flex items-center gap-2">
            {settings?.referral_enabled !== false && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowReferralModal(true)}
                className="text-xs border-sky-500/30 bg-sky-950/40 text-cyan-300 hover:bg-sky-900/60 font-bold hidden sm:flex items-center gap-1.5 backdrop-blur-md"
              >
                <Gift className="w-3.5 h-3.5 text-amber-400" /> Program Referal
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onOpenLogin}
              className="text-xs text-slate-200 hover:bg-sky-950/60 hover:text-white font-bold"
            >
              {settings?.landing_cta_secondary_label || "Login Camaba"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => handleRegisterProdi("")}
              className="bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-extrabold text-xs px-4 py-2 shadow-lg shadow-sky-500/25 border border-sky-400/30"
            >
              <ClipboardList className="w-4 h-4 mr-1.5" /> Daftar Sekarang
            </Button>
          </div>
        </div>
      </header>

      {/* Direct Registration Modal */}
      <PmbDirectRegisterModal
        isOpen={showDirectRegister}
        onClose={() => setShowDirectRegister(false)}
        onAuth={onAuth}
        defaultProdiId={selectedProdiForRegister}
        programs={programs}
      />

      {/* Referral Modal */}
      <ReferralRegistrationModal
        isOpen={showReferralModal}
        onClose={() => setShowReferralModal(false)}
        defaultCategory="student"
      />

      {/* 3. Hero Section */}
      {vis.hero !== false && (
        <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28 px-4 sm:px-8 z-10">
          <div className="max-w-5xl mx-auto text-center space-y-6 relative z-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-950/70 border border-sky-400/40 text-cyan-300 text-xs font-bold shadow-lg shadow-sky-900/30 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>{settings?.landing_hero_badge || "PENERIMAAN MAHASISWA BARU 2026/2027 • GELOMBANG 1"}</span>
            </div>

            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight drop-shadow-md">
              {settings?.landing_hero_title || "Raih Gelar Sarjana Impian & Bangun Karir Masa Depan Gemilang"}
            </h2>

            <p className="text-sm sm:text-base text-slate-200 max-w-2xl mx-auto leading-relaxed drop-shadow">
              {settings?.landing_hero_subtitle || "Pendidikan tinggi berbasis teknologi, kurikulum berstandar industri modern, serta fleksibilitas kuliah Kelas Reguler (Online/Offline) dan Kelas Khusus Karyawan."}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
              <Button
                type="button"
                size="lg"
                onClick={() => handleRegisterProdi("")}
                className="bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-extrabold text-sm px-8 py-3.5 rounded-xl shadow-xl shadow-sky-500/30 border border-sky-400/30 hover:scale-105 transition-transform"
              >
                <ClipboardList className="w-4 h-4 mr-2" /> {settings?.landing_cta_primary_label || "Isi Formulir Pendaftaran Utama"} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={onOpenLogin}
                className="border-sky-500/30 bg-[#041638]/70 hover:bg-[#062459]/80 text-cyan-100 font-bold text-sm px-6 py-3.5 rounded-xl backdrop-blur-md"
              >
                <KeyRound className="w-4 h-4 mr-2" /> {settings?.landing_cta_secondary_label || "Masuk Portal Camaba"}
              </Button>
              {settings?.wa_group_url && (
                <Button
                  type="button"
                  size="lg"
                  asChild
                  className="bg-emerald-600/90 hover:bg-emerald-600 text-white font-bold text-sm px-6 py-3.5 rounded-xl shadow-lg border border-emerald-400/30 backdrop-blur-md"
                >
                  <a
                    href={settings.wa_group_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" /> WhatsApp Hotline
                  </a>
                </Button>
              )}
            </div>

            {/* Quick Trust Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-10 text-left">
              <div className="p-4 bg-[#031533]/70 border border-sky-500/20 rounded-2xl backdrop-blur-md shadow-xl">
                <p className="text-cyan-400 font-bold text-xs">Akreditasi</p>
                <p className="text-base font-black text-white mt-0.5">{settings?.landing_stat_accreditation || "Unggul (A)"}</p>
                <p className="text-[10px] text-slate-300">Standar BAN-PT / LAM</p>
              </div>
              <div className="p-4 bg-[#031533]/70 border border-sky-500/20 rounded-2xl backdrop-blur-md shadow-xl">
                <p className="text-emerald-400 font-bold text-xs">Karir Lulusan</p>
                <p className="text-base font-black text-white mt-0.5">{settings?.landing_stat_career || "98.4% Bekerja"}</p>
                <p className="text-[10px] text-slate-300">Mitra BUMN & Tech Global</p>
              </div>
              <div className="p-4 bg-[#031533]/70 border border-sky-500/20 rounded-2xl backdrop-blur-md shadow-xl">
                <p className="text-amber-400 font-bold text-xs">Beasiswa</p>
                <p className="text-base font-black text-white mt-0.5">{settings?.landing_stat_scholarship || "Hingga 100%"}</p>
                <p className="text-[10px] text-slate-300">KIP-K & Prestasi Rapor</p>
              </div>
              <div className="p-4 bg-[#031533]/70 border border-sky-500/20 rounded-2xl backdrop-blur-md shadow-xl">
                <p className="text-sky-400 font-bold text-xs">Ujian Seleksi</p>
                <p className="text-base font-black text-white mt-0.5">{settings?.landing_stat_selection || "CBT Instan"}</p>
                <p className="text-[10px] text-slate-300">Hasil langsung keluar</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 4. Section Keunggulan Kampus (Why Us) */}
      {vis.why_us !== false && (
        <section id="keunggulan" className="py-16 px-4 sm:px-8 bg-[#020e24]/60 border-y border-sky-500/20 relative z-10 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto space-y-10">
            <div className="text-center space-y-2">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-cyan-400">Mengapa Memilih Kami</h3>
              <h2 className="text-2xl sm:text-4xl font-black text-white">Fasilitas & Standar Akademik Kelas Dunia</h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {whyUsList.map((item, idx) => (
                <div key={idx} className="p-5 bg-[#041738]/80 border border-sky-500/20 rounded-2xl space-y-2.5 hover:border-cyan-400/50 hover:bg-[#072457]/90 transition-all backdrop-blur-md shadow-xl">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-cyan-400 border border-sky-400/20 flex items-center justify-center font-bold text-lg">
                    {(() => {
                      const IconComp = WHY_US_ICONS[item.icon] || Sparkles;
                      return <IconComp className="w-5 h-5" />;
                    })()}
                  </div>
                  <h4 className="font-bold text-white text-sm">{item.title}</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 5. Section Program Studi */}
      {vis.programs !== false && (
        <section id="prodi" className="py-16 px-4 sm:px-8 relative z-10">
          <div className="max-w-7xl mx-auto space-y-10">
            <div className="text-center space-y-2">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-sky-400">Pilihan Fakultas & Jurusan Aktif</h3>
              <h2 className="text-2xl sm:text-4xl font-black text-white">Program Studi Unggulan Masa Depan</h2>
              <p className="text-xs text-slate-300 max-w-lg mx-auto">
                Pilih program studi yang sesuai dengan minat dan target karir profesional Anda. Seluruh data disinkronkan langsung dari Master Data Program Studi.
              </p>
            </div>

            <div className={
              programs.length === 4
                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
                : programs.length === 3
                ? "grid grid-cols-1 sm:grid-cols-3 gap-5"
                : programs.length === 2
                ? "grid grid-cols-1 sm:grid-cols-2 max-w-3xl mx-auto gap-5"
                : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
            }>
              {programs.length > 0 ? (
                programs.map((p) => (
                  <div
                    key={p.id}
                    className="bg-[#031536]/80 border border-sky-500/20 hover:border-cyan-400/50 p-5 rounded-2xl flex flex-col justify-between space-y-3.5 hover:shadow-2xl hover:shadow-sky-500/15 transition-all group backdrop-blur-md"
                  >
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center">
                        <Badge className="bg-sky-500/20 text-cyan-300 border border-sky-400/30 text-[10px] font-bold px-2 py-0.5">
                          {p.jenjang || "S1"}
                        </Badge>
                        <span className="text-[10px] font-mono text-cyan-400/80 font-bold bg-sky-950/60 px-2 py-0.5 rounded border border-sky-500/20">{p.kode}</span>
                      </div>
                      <h4 className="text-sm sm:text-base font-black text-white group-hover:text-cyan-300 transition-colors uppercase leading-snug line-clamp-2 min-h-[2.6rem]">
                        {p.nama}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-medium truncate">{p.fakultas || "Fakultas Teknologi & Bisnis"}</p>
                      <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed min-h-[2rem]">
                        {p.deskripsi}
                      </p>
                      <div className="p-2 bg-[#020b1c]/80 rounded-lg border border-sky-500/20 text-[10px] text-slate-300 line-clamp-2 min-h-[2.4rem]">
                        <span className="font-bold text-cyan-300"><Target className="w-3 h-3 inline mr-1 -mt-0.5 text-cyan-400" /> Prospek Karir: </span>
                        {p.prospek_karir}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-sky-500/20 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-emerald-400 font-bold shrink-0">
                        Akreditasi {p.akreditasi || "Unggul"}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleRegisterProdi(p.id)}
                        className="bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-[11px] h-8 px-3 shadow-sm border border-sky-400/30 whitespace-nowrap"
                      >
                        Daftar Prodi Ini
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center py-10 text-slate-400 text-xs">
                  Memuat daftar program studi aktif...
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 6. Section 10 Alur Seleksi PMB */}
      {vis.steps !== false && (
        <section id="alur" className="py-16 px-4 sm:px-8 bg-[#020e24]/60 border-y border-sky-500/20 relative z-10 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto space-y-10">
            <div className="text-center space-y-2">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-cyan-400">Mudah & Terpadu</h3>
              <h2 className="text-2xl sm:text-4xl font-black text-white">10 Tahapan Alur Pendaftaran PMB</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {STEPS.map((st) => (
                <div key={st.id} className="p-3.5 bg-[#041738]/80 border border-sky-500/20 rounded-xl space-y-1 text-center backdrop-blur-md">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 text-white font-bold text-xs flex items-center justify-center mx-auto mb-1.5 shadow-md shadow-sky-500/20 border border-sky-300/30">
                    {st.id}
                  </div>
                  <p className="font-bold text-white text-xs">{st.label}</p>
                  <p className="text-[10px] text-slate-300 leading-tight">{st.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 7. Section Biaya & Skema Cicilan */}
      {vis.fees !== false && (
        <section id="biaya" className="py-16 px-4 sm:px-8 relative z-10">
          <div className="max-w-5xl mx-auto space-y-10">
            <div className="text-center space-y-2">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-emerald-400">Transparan & Terjangkau</h3>
              <h2 className="text-2xl sm:text-4xl font-black text-white">Rincian Biaya & Skema Cicilan Pra-Studi</h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div className="p-6 bg-[#031536]/80 border border-sky-500/20 rounded-2xl space-y-4 backdrop-blur-md shadow-xl">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400 uppercase">Biaya Formulir Pendaftaran</span>
                  <Badge className="bg-sky-500/20 text-cyan-300 border border-sky-400/30 text-[10px]">Satu Kali Bayar</Badge>
                </div>
                <h3 className="text-3xl font-black text-white">{formatRupiah(settings?.registration_fee || 250000)}</h3>
                <ul className="text-xs text-slate-300 space-y-2">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> Akses ujian seleksi online CBT mandiri</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> Verifikasi berkas & konsultasi jurusan</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> Keanggotaan grup resmi calon mahasiswa</li>
                </ul>
              </div>

              <div className="p-6 bg-gradient-to-br from-[#062354]/90 to-[#021029]/90 border border-cyan-500/30 rounded-2xl space-y-4 backdrop-blur-md shadow-xl">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-amber-300 uppercase">Uang Pra-Studi & Daftar Ulang</span>
                  <Badge className="bg-amber-500 text-slate-950 font-bold text-[10px]">Bisa Cicil 3x</Badge>
                </div>
                <h3 className="text-3xl font-black text-amber-300">{formatRupiah(settings?.pra_studi_total_fee || 3500000)}</h3>
                <ul className="text-xs text-slate-300 space-y-2">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-amber-300 shrink-0" /> Termin 1 (Uang Muka): {formatRupiah(settings?.installment_1_amount || 1500000)}</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-amber-300 shrink-0" /> Termin 2 (Bulan ke-2): {formatRupiah(settings?.installment_2_amount || 1000000)}</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-amber-300 shrink-0" /> Termin 3 (Pelunasan): {formatRupiah(settings?.installment_3_amount || 1000000)}</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-amber-300 shrink-0" /> Termasuk Jas Almamater, Seragam, & Sibermaru</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 8. Section Program Beasiswa */}
      {vis.scholarships !== false && (
        <section id="beasiswa" className="py-16 px-4 sm:px-8 bg-[#020e24]/60 border-y border-sky-500/20 relative z-10 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto space-y-10">
            <div className="text-center space-y-2">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-amber-400">Peluang Emas</h3>
              <h2 className="text-2xl sm:text-4xl font-black text-white">Program Beasiswa Pendidikan</h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {scholarshipsList.map((sc, idx) => (
                <div key={idx} className="p-5 bg-[#041738]/80 border border-sky-500/20 rounded-2xl space-y-2.5 flex flex-col justify-between backdrop-blur-md shadow-xl">
                  <div className="space-y-2">
                    <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                      {sc.badge}
                    </Badge>
                    <h4 className="font-bold text-white text-sm">{sc.name}</h4>
                    <p className="text-xs text-cyan-300 font-semibold">{sc.benefit}</p>
                    <p className="text-[11px] text-slate-300">{sc.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 9. Section Referal Program Callout */}
      {vis.referral !== false && settings?.referral_enabled !== false && (
        <section className="py-12 px-4 sm:px-8 bg-gradient-to-r from-[#062459]/90 via-[#031536]/90 to-[#020f26]/90 border-y border-sky-500/30 relative z-10 backdrop-blur-md">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
            <div className="space-y-1">
              <Badge className="bg-amber-400 text-slate-950 font-extrabold text-[10px]"><Wallet className="w-3 h-3 mr-1 inline" /> PROGRAM MITRA REFERAL</Badge>
              <h3 className="text-xl sm:text-2xl font-black text-white">Dapatkan Fee Komisi hingga Rp 250.000 / Mahasiswa</h3>
              <p className="text-xs text-slate-300 max-w-lg">
                Terbuka untuk Mahasiswa Aktif, Dosen, Guru BK, dan Masyarakat Umum yang mempromosikan kampus kami.
              </p>
            </div>
            <Button
              type="button"
              size="lg"
              onClick={() => setShowReferralModal(true)}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs px-6 py-3 rounded-xl shadow-lg shrink-0"
            >
              <Rocket className="w-4 h-4 mr-2 inline" /> Daftar Jadi Promotor
            </Button>
          </div>
        </section>
      )}

      {/* 10. Section FAQ */}
      {vis.faq !== false && (
        <section id="faq" className="py-16 px-4 sm:px-8 relative z-10">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center space-y-2">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-cyan-400">Bantuan & Informasi</h3>
              <h2 className="text-2xl sm:text-3xl font-black text-white">Pertanyaan yang Sering Diajukan (FAQ)</h2>
            </div>

            <div className="space-y-3">
              {faqsList.map((faq, idx) => (
                <div
                  key={idx}
                  className="border border-sky-500/20 rounded-xl bg-[#031536]/80 overflow-hidden backdrop-blur-md shadow-lg"
                >
                  <button
                    type="button"
                    onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                    className="w-full p-4 text-left font-bold text-xs sm:text-sm text-slate-100 flex justify-between items-center hover:bg-sky-950/40"
                  >
                    <span>{faq.q}</span>
                    <span className="text-cyan-400 text-base">{activeFaq === idx ? "−" : "+"}</span>
                  </button>
                  {activeFaq === idx && (
                    <div className="px-4 pb-4 text-xs text-slate-300 leading-relaxed border-t border-sky-500/20 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 11. CTA Penutup */}
      <section className="py-16 px-4 sm:px-8 bg-gradient-to-t from-[#020c20] to-[#041738]/90 text-center space-y-6 relative z-10 backdrop-blur-sm border-t border-sky-500/20">
        <div className="max-w-3xl mx-auto space-y-4">
          <h2 className="text-2xl sm:text-4xl font-black text-white">
            Siap Menjadi Bagian dari Generasi Unggul?
          </h2>
          <p className="text-xs sm:text-sm text-slate-300">
            Pendaftaran Gelombang 1 dibuka dalam kuota terbatas. Segera amankan kursi program studi impian Anda!
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Button
              type="button"
              size="lg"
              onClick={() => handleRegisterProdi("")}
              className="bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 text-white font-extrabold text-xs sm:text-sm px-8 py-3 rounded-xl shadow-xl shadow-sky-500/30 border border-sky-400/30"
            >
              <ClipboardList className="w-4 h-4 mr-2" /> Daftar Formulir Utama Sekarang
            </Button>
          </div>
        </div>
      </section>

      {/* 12. Footer */}
      {vis.footer !== false && (
        <footer className="py-10 px-4 sm:px-8 border-t border-sky-500/20 bg-[#010817]/90 text-xs text-slate-400 space-y-6 relative z-10 backdrop-blur-md">
          <div className="max-w-7xl mx-auto grid sm:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                {campusLogoUrl && (
                  <div className="w-8 h-8 rounded-lg bg-white/95 p-1 flex items-center justify-center border border-sky-400/30 overflow-hidden shrink-0">
                    <img
                      src={resolveMediaUrl(campusLogoUrl)}
                      alt={campusDisplayName}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
                <h4 className="font-bold text-white text-sm">{campusDisplayName}</h4>
              </div>
              <p className="text-xs text-slate-400">{campusDescription}</p>
              {campusAddress && (
                <p className="text-xs text-slate-300 flex items-center gap-2 pt-1">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> {campusAddress}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <h5 className="font-bold text-slate-200">Kontak & Layanan PMB</h5>
              {campusPhone && (
                <p className="flex items-center gap-2 text-xs">
                  <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> {campusPhone}
                </p>
              )}
              {campusEmail && (
                <p className="flex items-center gap-2 text-xs">
                  <Mail className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> {campusEmail}
                </p>
              )}
            </div>

            <div className="space-y-2 sm:text-right">
              <h5 className="font-bold text-slate-200">Tautan Cepat</h5>
              <div className="flex flex-col sm:items-end gap-1 text-xs">
                <button type="button" onClick={onBackToSiakad} className="text-cyan-400 hover:underline">
                  Portal Login SIAKAD
                </button>
                <button type="button" onClick={() => setShowReferralModal(true)} className="text-sky-400 hover:underline">
                  Portal Program Referal
                </button>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-800/80 pt-4 text-center text-[11px] text-slate-500">
            © {new Date().getFullYear()} {campusDisplayName}. Hak Cipta Dilindungi.
          </div>
        </footer>
      )}

      {/* Floating WhatsApp Instant Consultation Widget */}
      <PmbWhatsAppFloatingWidget settings={settings} branding={branding} />
    </div>
  );
}

export default PmbLandingPage;
