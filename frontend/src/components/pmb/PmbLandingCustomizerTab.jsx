import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { apiErrorMessage } from "@/lib/utils";
import {
  Sparkles,
  Save,
  Eye,
  Plus,
  Trash2,
  Sliders,
  HelpCircle,
  Award,
  Layers,
  Phone,
  Mail,
  MapPin,
  RefreshCw,
  CheckCircle,
  Rocket,
  Trophy,
  GraduationCap,
  Monitor,
  Globe,
  CreditCard,
  Zap
} from "lucide-react";

const WHY_US_ICON_OPTIONS = [
  { key: "monitor", label: "Monitor", icon: Monitor },
  { key: "globe", label: "Globe", icon: Globe },
  { key: "credit-card", label: "Kartu Kredit", icon: CreditCard },
  { key: "zap", label: "Petir", icon: Zap },
  { key: "sparkles", label: "Bintang", icon: Sparkles },
];

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") || window.location.origin;
const api = axios.create({ baseURL: BACKEND_URL });

export function PmbLandingCustomizerTab({ token: propToken, initialSettings, onUpdateSettings }) {
  const token = propToken || (typeof window !== "undefined" ? localStorage.getItem("token") || "" : "");
  const [loading, setLoading] = useState(false);
  const [customData, setCustomData] = useState({
    landing_announcement: initialSettings?.landing_announcement || "",
    landing_hero_badge: initialSettings?.landing_hero_badge || "",
    landing_hero_title: initialSettings?.landing_hero_title || "",
    landing_hero_subtitle: initialSettings?.landing_hero_subtitle || "",
    landing_cta_primary_label: initialSettings?.landing_cta_primary_label || "Isi Formulir Pendaftaran Utama",
    landing_cta_secondary_label: initialSettings?.landing_cta_secondary_label || "Masuk Portal Camaba",
    landing_stat_accreditation: initialSettings?.landing_stat_accreditation || "Unggul (A)",
    landing_stat_career: initialSettings?.landing_stat_career || "98.4% Bekerja",
    landing_stat_scholarship: initialSettings?.landing_stat_scholarship || "Hingga 100%",
    landing_stat_selection: initialSettings?.landing_stat_selection || "CBT Instan",
    landing_why_us: initialSettings?.landing_why_us || [],
    landing_scholarships: initialSettings?.landing_scholarships || [],
    landing_faqs: initialSettings?.landing_faqs || [],
    landing_contact_phone: initialSettings?.landing_contact_phone || "",
    landing_contact_email: initialSettings?.landing_contact_email || "",
    landing_contact_address: initialSettings?.landing_contact_address || "",
    landing_sections_visibility: initialSettings?.landing_sections_visibility || {
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
    },
  });

  const [activeTab, setActiveTab] = useState("hero"); // 'hero' | 'stats' | 'why_us' | 'scholarships' | 'faqs' | 'contact' | 'visibility'

  useEffect(() => {
    if (initialSettings) {
      setCustomData((prev) => ({
        ...prev,
        landing_announcement: initialSettings.landing_announcement ?? prev.landing_announcement,
        landing_hero_badge: initialSettings.landing_hero_badge ?? prev.landing_hero_badge,
        landing_hero_title: initialSettings.landing_hero_title ?? prev.landing_hero_title,
        landing_hero_subtitle: initialSettings.landing_hero_subtitle ?? prev.landing_hero_subtitle,
        landing_cta_primary_label: initialSettings.landing_cta_primary_label ?? prev.landing_cta_primary_label,
        landing_stat_accreditation: initialSettings.landing_stat_accreditation ?? prev.landing_stat_accreditation,
        landing_stat_career: initialSettings.landing_stat_career ?? prev.landing_stat_career,
        landing_stat_scholarship: initialSettings.landing_stat_scholarship ?? prev.landing_stat_scholarship,
        landing_stat_selection: initialSettings.landing_stat_selection ?? prev.landing_stat_selection,
        landing_why_us: initialSettings.landing_why_us ?? prev.landing_why_us,
        landing_scholarships: initialSettings.landing_scholarships ?? prev.landing_scholarships,
        landing_faqs: initialSettings.landing_faqs ?? prev.landing_faqs,
        landing_contact_phone: initialSettings.landing_contact_phone ?? prev.landing_contact_phone,
        landing_contact_email: initialSettings.landing_contact_email ?? prev.landing_contact_email,
        landing_contact_address: initialSettings.landing_contact_address ?? prev.landing_contact_address,
        landing_sections_visibility: initialSettings.landing_sections_visibility ?? prev.landing_sections_visibility,
      }));
    }
  }, [initialSettings]);

  const handleSave = async () => {
    try {
      setLoading(true);
      const res = await api.post("/api/v1/pmb/admin/landing-config", customData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.ok) {
        toast.success(res.data.message || "Kustomisasi Halaman PMB berhasil disimpan!");
        if (onUpdateSettings) onUpdateSettings(res.data.settings);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal menyimpan kustomisasi"));
    } finally {
      setLoading(false);
    }
  };

  // Helper untuk Why Us
  const addWhyUs = () => {
    setCustomData((prev) => ({
      ...prev,
      landing_why_us: [
        ...prev.landing_why_us,
        { icon: "sparkles", title: "Keunggulan Baru", description: "Deskripsi keunggulan fasilitas atau akademik kampus." },
      ],
    }));
  };

  const removeWhyUs = (idx) => {
    setCustomData((prev) => ({
      ...prev,
      landing_why_us: prev.landing_why_us.filter((_, i) => i !== idx),
    }));
  };

  // Helper untuk Beasiswa
  const addScholarship = () => {
    setCustomData((prev) => ({
      ...prev,
      landing_scholarships: [
        ...prev.landing_scholarships,
        { name: "Program Beasiswa Baru", badge: "Kuota Terbatas", benefit: "Potongan Biaya 50%", desc: "Deskripsi syarat pendaftaran beasiswa." },
      ],
    }));
  };

  const removeScholarship = (idx) => {
    setCustomData((prev) => ({
      ...prev,
      landing_scholarships: prev.landing_scholarships.filter((_, i) => i !== idx),
    }));
  };

  // Helper untuk FAQ
  const addFaq = () => {
    setCustomData((prev) => ({
      ...prev,
      landing_faqs: [
        ...prev.landing_faqs,
        { q: "Pertanyaan baru seputar PMB?", a: "Jawaban penjelasan detail untuk calon mahasiswa baru." },
      ],
    }));
  };

  const removeFaq = (idx) => {
    setCustomData((prev) => ({
      ...prev,
      landing_faqs: prev.landing_faqs.filter((_, i) => i !== idx),
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 border border-indigo-800/60 p-5 rounded-2xl text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-bold">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> CMS & Page Customizer
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">
            Kustomisasi Halaman Informasi Terdepan PMB
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl">
            Sesuaikan teks hero, pengumuman, highlight prestasi, kartu beasiswa, dan tanya-jawab (FAQ) secara fleksibel tanpa mengubah kode program.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.open("/#pmb", "_blank")}
            className="border-indigo-400/40 text-indigo-200 hover:bg-indigo-900 text-xs font-bold"
          >
            <Eye className="w-3.5 h-3.5 mr-1.5" /> Pratinjau Live
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md"
          >
            <Save className="w-3.5 h-3.5 mr-1.5" /> {loading ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </div>
      </div>

      {/* Sub-nav Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab("hero")}
          className={`px-3 py-1.5 rounded-lg transition-all ${
            activeTab === "hero" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Rocket className="w-3.5 h-3.5 inline mr-1.5" /> Hero & Headline
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("stats")}
          className={`px-3 py-1.5 rounded-lg transition-all ${
            activeTab === "stats" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Trophy className="w-3.5 h-3.5 inline mr-1.5" /> Highlight Prestasi
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("why_us")}
          className={`px-3 py-1.5 rounded-lg transition-all ${
            activeTab === "why_us" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 inline mr-1.5" /> Keunggulan Kampus ({customData.landing_why_us.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("scholarships")}
          className={`px-3 py-1.5 rounded-lg transition-all ${
            activeTab === "scholarships" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5 inline mr-1.5" /> Program Beasiswa ({customData.landing_scholarships.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("faqs")}
          className={`px-3 py-1.5 rounded-lg transition-all ${
            activeTab === "faqs" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5 inline mr-1.5" /> FAQ / Tanya Jawab ({customData.landing_faqs.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("contact")}
          className={`px-3 py-1.5 rounded-lg transition-all ${
            activeTab === "contact" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Phone className="w-3.5 h-3.5 inline mr-1.5" /> Kontak & Hotline
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("visibility")}
          className={`px-3 py-1.5 rounded-lg transition-all ${
            activeTab === "visibility" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Eye className="w-3.5 h-3.5 inline mr-1.5" /> Visibilitas Section
        </button>
      </div>

      {/* Tab 1: Hero & Headline */}
      {activeTab === "hero" && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-slate-900">Pengaturan Hero & Teks Utama</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Ubah teks judul utama, subjudul promosi, dan banner pengumuman atas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div>
              <Label className="text-xs font-bold">Teks Pengumuman Bar Atas (Announcement Bar)</Label>
              <Input
                value={customData.landing_announcement}
                onChange={(e) => setCustomData({ ...customData, landing_announcement: e.target.value })}
                placeholder="Penerimaan Mahasiswa Baru Gelombang 1 Dibuka..."
                className="text-xs mt-1"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold">Badge Gelombang Hero</Label>
                <Input
                  value={customData.landing_hero_badge}
                  onChange={(e) => setCustomData({ ...customData, landing_hero_badge: e.target.value })}
                  placeholder="PENERIMAAN MAHASISWA BARU 2026/2027 • GELOMBANG 1"
                  className="text-xs mt-1 font-mono uppercase"
                />
              </div>
              <div>
                <Label className="text-xs font-bold">Label Tombol CTA Utama (Formulir)</Label>
                <Input
                  value={customData.landing_cta_primary_label}
                  onChange={(e) => setCustomData({ ...customData, landing_cta_primary_label: e.target.value })}
                  placeholder="Isi Formulir Pendaftaran Utama"
                  className="text-xs mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold">Headline / Judul Utama Hero</Label>
              <Input
                value={customData.landing_hero_title}
                onChange={(e) => setCustomData({ ...customData, landing_hero_title: e.target.value })}
                placeholder="Raih Gelar Sarjana Impian & Bangun Karir Masa Depan Gemilang"
                className="text-xs mt-1 font-bold"
              />
            </div>

            <div>
              <Label className="text-xs font-bold">Subjudul Deskripsi Hero</Label>
              <textarea
                value={customData.landing_hero_subtitle}
                onChange={(e) => setCustomData({ ...customData, landing_hero_subtitle: e.target.value })}
                rows={3}
                placeholder="Pendidikan tinggi berbasis teknologi, kurikulum berstandar industri modern..."
                className="w-full border border-slate-300 rounded-md p-2.5 text-xs mt-1"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Highlight Prestasi */}
      {activeTab === "stats" && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-slate-900">4 Highlight Metrik & Keunggulan</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Angka dan lencana kepercayaan yang ditampilkan di bawah tombol CTA Hero.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <Label className="text-xs font-bold text-indigo-700">1. Akreditasi Institusi</Label>
              <Input
                value={customData.landing_stat_accreditation}
                onChange={(e) => setCustomData({ ...customData, landing_stat_accreditation: e.target.value })}
                placeholder="Unggul (A)"
                className="text-xs font-bold"
              />
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <Label className="text-xs font-bold text-emerald-700">2. Karir & Serapan Kerja</Label>
              <Input
                value={customData.landing_stat_career}
                onChange={(e) => setCustomData({ ...customData, landing_stat_career: e.target.value })}
                placeholder="98.4% Bekerja"
                className="text-xs font-bold"
              />
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <Label className="text-xs font-bold text-amber-700">3. Program Beasiswa</Label>
              <Input
                value={customData.landing_stat_scholarship}
                onChange={(e) => setCustomData({ ...customData, landing_stat_scholarship: e.target.value })}
                placeholder="Hingga 100%"
                className="text-xs font-bold"
              />
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <Label className="text-xs font-bold text-sky-700">4. Metode Seleksi CBT</Label>
              <Input
                value={customData.landing_stat_selection}
                onChange={(e) => setCustomData({ ...customData, landing_stat_selection: e.target.value })}
                placeholder="CBT Instan"
                className="text-xs font-bold"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Keunggulan Kampus (Why Us) */}
      {activeTab === "why_us" && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">Kartu Poin Keunggulan (Why Choose Us)</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Poin-poin pembeda dan fasilitas unggulan kampus.
              </CardDescription>
            </div>
            <Button type="button" size="sm" onClick={addWhyUs} className="bg-indigo-600 text-white font-bold text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" /> Tambah Poin
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {customData.landing_why_us.map((item, idx) => (
              <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid sm:grid-cols-12 gap-3 items-center">
                <div className="sm:col-span-2">
                  <Label className="text-[11px] font-bold">Ikon</Label>
                  <select
                    value={item.icon}
                    onChange={(e) => {
                      const newArr = [...customData.landing_why_us];
                      newArr[idx].icon = e.target.value;
                      setCustomData({ ...customData, landing_why_us: newArr });
                    }}
                    className="mt-1 w-full border border-slate-300 rounded-md p-2 text-xs bg-white font-medium"
                  >
                    {WHY_US_ICON_OPTIONS.map((opt) => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-4">
                  <Label className="text-[11px] font-bold">Judul Keunggulan</Label>
                  <Input
                    value={item.title}
                    onChange={(e) => {
                      const newArr = [...customData.landing_why_us];
                      newArr[idx].title = e.target.value;
                      setCustomData({ ...customData, landing_why_us: newArr });
                    }}
                    placeholder="Kurikulum Berbasis AI..."
                    className="text-xs font-bold"
                  />
                </div>
                <div className="sm:col-span-5">
                  <Label className="text-[11px] font-bold">Deskripsi</Label>
                  <Input
                    value={item.description}
                    onChange={(e) => {
                      const newArr = [...customData.landing_why_us];
                      newArr[idx].description = e.target.value;
                      setCustomData({ ...customData, landing_why_us: newArr });
                    }}
                    placeholder="Penjelasan fasilitas atau benefit..."
                    className="text-xs"
                  />
                </div>
                <div className="sm:col-span-1 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeWhyUs(idx)}
                    className="text-rose-600 hover:bg-rose-50 h-8 w-8 p-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tab 4: Program Beasiswa */}
      {activeTab === "scholarships" && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">Daftar Program Beasiswa</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Informasi skema beasiswa prestasi, KIP-K, dan mitra yang tersedia.
              </CardDescription>
            </div>
            <Button type="button" size="sm" onClick={addScholarship} className="bg-indigo-600 text-white font-bold text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" /> Tambah Beasiswa
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {customData.landing_scholarships.map((item, idx) => (
              <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-[11px] font-bold">Nama Program Beasiswa</Label>
                    <Input
                      value={item.name}
                      onChange={(e) => {
                        const newArr = [...customData.landing_scholarships];
                        newArr[idx].name = e.target.value;
                        setCustomData({ ...customData, landing_scholarships: newArr });
                      }}
                      placeholder="Beasiswa Prestasi Rapor"
                      className="text-xs font-bold"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-bold">Badge / Tagline</Label>
                    <Input
                      value={item.badge}
                      onChange={(e) => {
                        const newArr = [...customData.landing_scholarships];
                        newArr[idx].badge = e.target.value;
                        setCustomData({ ...customData, landing_scholarships: newArr });
                      }}
                      placeholder="Bebas Tes CBT"
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-bold">Benefit Utama</Label>
                    <Input
                      value={item.benefit}
                      onChange={(e) => {
                        const newArr = [...customData.landing_scholarships];
                        newArr[idx].benefit = e.target.value;
                        setCustomData({ ...customData, landing_scholarships: newArr });
                      }}
                      placeholder="Potongan Uang Pra-Studi 100%"
                      className="text-xs text-indigo-700 font-bold"
                    />
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <Label className="text-[11px] font-bold">Syarat & Keterangan</Label>
                    <Input
                      value={item.desc}
                      onChange={(e) => {
                        const newArr = [...customData.landing_scholarships];
                        newArr[idx].desc = e.target.value;
                        setCustomData({ ...customData, landing_scholarships: newArr });
                      }}
                      placeholder="Untuk lulusan dengan rata-rata nilai rapor semester 1-5 minimal 85.00."
                      className="text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeScholarship(idx)}
                    className="text-rose-600 hover:bg-rose-50 self-end h-8 px-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tab 5: FAQ */}
      {activeTab === "faqs" && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">Pertanyaan yang Sering Diajukan (FAQ)</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Pertanyaan dan jawaban penting yang ditampilkan pada akordeon landing page.
              </CardDescription>
            </div>
            <Button type="button" size="sm" onClick={addFaq} className="bg-indigo-600 text-white font-bold text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" /> Tambah FAQ
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {customData.landing_faqs.map((item, idx) => (
              <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-bold text-indigo-900">Pertanyaan #{idx + 1}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFaq(idx)}
                    className="text-rose-600 hover:bg-rose-50 h-6 px-1.5 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <Input
                  value={item.q}
                  onChange={(e) => {
                    const newArr = [...customData.landing_faqs];
                    newArr[idx].q = e.target.value;
                    setCustomData({ ...customData, landing_faqs: newArr });
                  }}
                  placeholder="Bagaimana cara pendaftaran..."
                  className="text-xs font-bold"
                />
                <div>
                  <Label className="text-[11px] font-bold text-slate-600">Jawaban Penjelasan</Label>
                  <textarea
                    value={item.a}
                    onChange={(e) => {
                      const newArr = [...customData.landing_faqs];
                      newArr[idx].a = e.target.value;
                      setCustomData({ ...customData, landing_faqs: newArr });
                    }}
                    rows={2}
                    placeholder="Tuliskan jawaban yang ramah dan jelas..."
                    className="w-full border border-slate-300 rounded-md p-2 text-xs mt-0.5"
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tab 6: Kontak & Hotline */}
      {activeTab === "contact" && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-slate-900">Kontak Panitia & Hotline PMB</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Informasi alamat, nomor telepon panitia, dan email layanan calon mahasiswa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold">No. Telepon / WhatsApp Panitia</Label>
                <Input
                  value={customData.landing_contact_phone}
                  onChange={(e) => setCustomData({ ...customData, landing_contact_phone: e.target.value })}
                  placeholder="0812-3456-7890"
                  className="text-xs mt-1 font-mono"
                />
              </div>
              <div>
                <Label className="text-xs font-bold">Email Layanan PMB</Label>
                <Input
                  type="email"
                  value={customData.landing_contact_email}
                  onChange={(e) => setCustomData({ ...customData, landing_contact_email: e.target.value })}
                  placeholder="pmb@kampus.ac.id"
                  className="text-xs mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold">Alamat Kampus</Label>
              <Input
                value={customData.landing_contact_address}
                onChange={(e) => setCustomData({ ...customData, landing_contact_address: e.target.value })}
                placeholder="Jl. Kampus Unggul No. 1, Jakarta Selatan"
                className="text-xs mt-1"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 7: Visibilitas Section */}
      {activeTab === "visibility" && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-slate-900">Visibilitas Bagian (Section Toggle)</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Aktifkan atau nonaktifkan bagian tertentu pada halaman landing page sesuai kebutuhan periode penerimaan.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {Object.entries({
              announcement: "Pengumuman Bar Atas",
              hero: "Hero & Headline Utama",
              why_us: "Section Keunggulan Kampus",
              programs: "Section Program Studi (Fakultas)",
              steps: "Section 10 Alur Seleksi PMB",
              fees: "Section Biaya & Cicilan",
              scholarships: "Section Program Beasiswa",
              referral: "Section Program Mitra Referal",
              faq: "Section Tanya Jawab (FAQ)",
              footer: "Footer Resmi PMB",
            }).map(([key, label]) => (
              <label
                key={key}
                className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between cursor-pointer hover:bg-slate-100"
              >
                <span className="font-bold text-slate-800">{label}</span>
                <input
                  type="checkbox"
                  checked={customData.landing_sections_visibility?.[key] !== false}
                  onChange={(e) => {
                    setCustomData({
                      ...customData,
                      landing_sections_visibility: {
                        ...customData.landing_sections_visibility,
                        [key]: e.target.checked,
                      },
                    });
                  }}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
              </label>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
