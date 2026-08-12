import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { SchoolSearchInput } from "./SchoolSearchInput";
import { apiErrorMessage, BACKEND_URL } from "@/lib/utils";
import {
  User,
  Phone,
  Building,
  GraduationCap,
  Info,
  ClipboardList,
  X,
  Check,
  Rocket,
  Copy,
  CheckCircle2,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight
} from "lucide-react";
import { WhatsAppOfficialIcon } from "./PmbWhatsAppFloatingWidget";

const api = axios.create({ baseURL: BACKEND_URL });

export function PmbDirectRegisterModal({ isOpen, onClose, onAuth, defaultProdiId = "", programs = [] }) {
  const [availablePrograms, setAvailablePrograms] = useState(Array.isArray(programs) ? programs : []);
  const [formData, setFormData] = useState({
    name: "",
    gender: "L",
    tempat_lahir: "",
    tanggal_lahir: "",
    whatsapp: "",
    alamat: "",
    nik: "",
    nisn: "",
    nama_ibu_kandung: "",
    email: "",
    asal_sekolah: "",
    npsn_sekolah: "",
    alamat_sekolah: "",
    jurusan_asal: "",
    tahun_lulus: "2025",
    tinggi_badan: "",
    berat_badan: "",
    prodi_id: defaultProdiId || "",
    prodi_id_2: "",
    class_type: "reguler",
    learning_mode: "offline",
    info_source: "Media Sosial",
    password: "",
    referral_code: "",
  });
  const [loading, setLoading] = useState(false);
  const [referralFeedback, setReferralFeedback] = useState(null);
  const [successData, setSuccessData] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");

  useEffect(() => {
    setAvailablePrograms(Array.isArray(programs) ? programs : []);
  }, [programs]);

  useEffect(() => {
    if (!isOpen || availablePrograms.length > 0) return undefined;
    let cancelled = false;
    api.get("/api/v1/pmb/public/config")
      .then(({ data }) => {
        if (!cancelled && data?.ok) setAvailablePrograms(data.programs || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [availablePrograms.length, isOpen]);

  useEffect(() => {
    if (defaultProdiId) {
      setFormData((prev) => ({ ...prev, prodi_id: defaultProdiId }));
    }
  }, [defaultProdiId]);

  if (!isOpen) return null;

  const handleCopyText = (text, keyName) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    toast.success(`${keyName} berhasil disalin ke clipboard!`);
    setTimeout(() => setCopiedKey(""), 2000);
  };

  const handleCopyAllCredentials = () => {
    if (!successData?.login_credentials) return;
    const creds = successData.login_credentials;
    const allText = `*AKSES LOGIN PMB POLITEKNIK SCI*\nNo. Registrasi: ${creds.registration_number}\nEmail: ${creds.email}\nPassword: ${creds.password}\nPortal PMB: http://localhost:3001\nPortal SIAKAD: http://localhost:3000`;
    navigator.clipboard.writeText(allText);
    toast.success("Seluruh informasi akses login berhasil disalin!");
  };

  const handleOpenWhatsAppCopy = () => {
    if (successData?.whatsapp_receipt_url) {
      window.open(successData.whatsapp_receipt_url, "_blank", "noopener,noreferrer");
    } else {
      toast.info("Tautan salinan WhatsApp tidak tersedia.");
    }
  };

  const handleProceedToPortal = () => {
    if (onAuth && successData) {
      onAuth({ token: successData.token, user: { ...successData.applicant, role: "camaba" } });
    }
    setSuccessData(null);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.whatsapp || !formData.email || !formData.prodi_id) {
      toast.error("Harap lengkapi seluruh field formulir yang bertanda bintang (*)");
      return;
    }
    if ((formData.asal_sekolah || "").trim().length < 3) {
      toast.error("Pilih atau isi nama sekolah asal minimal 3 karakter");
      return;
    }
    const nik = (formData.nik || "").replace(/\D/g, "");
    if (!/^\d{16}$/.test(nik)) {
      toast.error("NIK harus terdiri dari 16 digit angka sesuai KTP");
      return;
    }
    const nisn = (formData.nisn || "").replace(/\D/g, "");
    if (!/^\d{10}$/.test(nisn)) {
      toast.error("NISN harus terdiri dari 10 digit angka sesuai data Kemendikbud");
      return;
    }
    const wa = (formData.whatsapp || "").replace(/[\s\-.]/g, "");
    if (!/^\+?\d{9,15}$/.test(wa)) {
      toast.error("Nomor WhatsApp tidak valid (harus 9-15 digit angka)");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(formData.email || "")) {
      toast.error("Format email tidak valid");
      return;
    }
    if (formData.tahun_lulus && !/^\d{4}$/.test(formData.tahun_lulus)) {
      toast.error("Tahun lulus harus 4 digit angka (contoh: 2025)");
      return;
    }
    if (!formData.password || formData.password.length < 6) {
      toast.error("Password minimal 6 karakter");
      return;
    }
    try {
      setLoading(true);
      const payload = {
        ...formData,
        tinggi_badan: formData.tinggi_badan ? parseFloat(formData.tinggi_badan) : 0,
        berat_badan: formData.berat_badan ? parseFloat(formData.berat_badan) : 0,
      };
      const res = await api.post("/api/v1/pmb/register", payload);
      if (res.data.ok) {
        toast.success("Pendaftaran berhasil! Salinan dan info login telah disiapkan.");
        setSuccessData(res.data);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Pendaftaran gagal diproses"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md overflow-y-auto text-slate-900">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* ========================================================================= */}
        {/* SCREEN 1: SUCCESS RECEIPT & BACKUP LOGIN MODAL */}
        {/* ========================================================================= */}
        {successData ? (
          <div className="flex flex-col h-full overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 via-teal-700 to-cyan-800 p-6 text-white text-center relative overflow-hidden">
              <div className="w-16 h-16 rounded-2xl bg-white/20 p-2 mx-auto flex items-center justify-center shadow-lg mb-3">
                <CheckCircle2 className="w-10 h-10 text-white" />
              </div>
              <h3 className="font-extrabold text-xl sm:text-2xl leading-tight">
                Pendaftaran Berhasil Diterima! 🎉
              </h3>
              <p className="text-xs text-emerald-100 mt-1 max-w-md mx-auto">
                Salinan pendaftaran dan akses login resmi telah dikirim ke email & WhatsApp Anda.
              </p>
            </div>

            {/* Receipt Body */}
            <div className="p-6 space-y-5 text-xs text-slate-700 bg-slate-50/50">
              
              {/* Notification Status Badges */}
              <div className="grid sm:grid-cols-2 gap-2.5">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-emerald-900">
                  <div className="p-1 rounded-md bg-emerald-200/60 mt-0.5 shrink-0">
                    <Mail className="w-4 h-4 text-emerald-700" />
                  </div>
                  <div>
                    <p className="font-bold text-[11px]">Salinan Email Terkirim</p>
                    <p className="text-[10px] text-emerald-700 truncate max-w-[200px]">
                      {successData.login_credentials?.email}
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-emerald-900">
                  <div className="p-1 rounded-md bg-emerald-200/60 mt-0.5 shrink-0">
                    <WhatsAppOfficialIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-[11px]">Salinan WhatsApp Siap</p>
                    <p className="text-[10px] text-emerald-700 font-mono">
                      {successData.login_credentials?.whatsapp}
                    </p>
                  </div>
                </div>
              </div>

              {/* CREDENTIALS BACKUP CARD */}
              <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-2xl shadow-lg border border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h4 className="font-extrabold text-sm text-white">Akses Akun Login Calon Mahasiswa</h4>
                      <p className="text-[10px] text-slate-400">Simpan informasi ini untuk masuk kembali ke sistem</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyAllCredentials}
                    className="p-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-cyan-300 font-bold text-[10px] flex items-center gap-1 transition-colors"
                  >
                    <Copy className="w-3 h-3" /> Salin Semua
                  </button>
                </div>

                <div className="grid sm:grid-cols-2 gap-3 font-mono">
                  {/* Registration Number */}
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/80 flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-sans text-slate-400 uppercase font-bold tracking-wider">No. Registrasi (ID Login)</p>
                      <p className="text-sm font-bold text-cyan-300 mt-0.5">
                        {successData.login_credentials?.registration_number}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyText(successData.login_credentials?.registration_number, "No. Registrasi")}
                      className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                      title="Salin No. Registrasi"
                    >
                      {copiedKey === "No. Registrasi" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Password */}
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/80 flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-sans text-slate-400 uppercase font-bold tracking-wider">Password Akun</p>
                      <p className="text-sm font-bold text-amber-300 mt-0.5">
                        {showPassword ? successData.login_credentials?.password : "••••••••"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                        title={showPassword ? "Sembunyikan" : "Tampilkan"}
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyText(successData.login_credentials?.password, "Password")}
                        className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                        title="Salin Password"
                      >
                        {copiedKey === "Password" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Candidate Summary */}
                <div className="pt-2 text-[11px] font-sans text-slate-300 space-y-1">
                  <p><span className="text-slate-400">Nama Lengkap:</span> <strong className="text-white">{successData.applicant?.name}</strong></p>
                  <p><span className="text-slate-400">Program Studi:</span> <strong className="text-cyan-300">{successData.applicant?.prodi_name}</strong></p>
                  <p><span className="text-slate-400">Jalur Perkuliahan:</span> Kelas {successData.applicant?.class_type?.toUpperCase()} ({successData.applicant?.learning_mode?.toUpperCase()})</p>
                </div>
              </div>

              {/* WHATSAPP INSTANT BACKUP BUTTON */}
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-[#25D366] text-white shadow-md">
                    <WhatsAppOfficialIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h5 className="font-bold text-xs text-emerald-950">Simpan Salinan ke WhatsApp Saya</h5>
                    <p className="text-[10px] text-emerald-800">Kirim salinan struk pendaftaran dan password ke nomor WhatsApp Anda</p>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={handleOpenWhatsAppCopy}
                  className="bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md shadow-emerald-600/30 whitespace-nowrap w-full sm:w-auto"
                >
                  <WhatsAppOfficialIcon className="w-4 h-4 mr-1.5" /> Kirim ke WhatsApp
                </Button>
              </div>

              {/* ACTION FOOTER */}
              <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-[10px] text-slate-500 text-center sm:text-left">
                  Anda dapat langsung melanjutkan ke proses pembayaran formulir dan ujian CBT.
                </p>
                <Button
                  type="button"
                  onClick={handleProceedToPortal}
                  className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-extrabold text-xs px-6 py-3 rounded-xl shadow-lg shadow-sky-500/25 w-full sm:w-auto"
                >
                  Lanjut ke Portal PMB <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* SCREEN 2: REGISTRATION FORM */
          /* ========================================================================= */
          <>
            {/* Header */}
            <div className="bg-gradient-to-r from-sky-600 via-indigo-700 to-indigo-800 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-bold text-xl">
                  <ClipboardList className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg leading-tight">
                    Formulir Pendaftaran Mahasiswa Baru Politeknik SCI
                  </h3>
                  <p className="text-xs text-sky-100">
                    Penerimaan Mahasiswa Baru Tahun Akademik 2026/2027
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-sm transition-colors"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* SECTION 1: IDENTITAS LENGKAP */}
              <div className="space-y-3 pb-3 border-b border-slate-100">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5 text-indigo-700">
                  <User className="w-4 h-4 text-indigo-600" /> 1. Identitas Calon Mahasiswa
                </h4>

                <div>
                  <Label className="text-xs font-bold">Nama Lengkap *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="Contoh: Muhammad Rizky Pratama"
                    className="text-xs mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold">Jenis Kelamin *</Label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-md p-2 text-xs bg-white"
                  >
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold">Tempat Lahir</Label>
                    <Input
                      value={formData.tempat_lahir}
                      onChange={(e) => setFormData({ ...formData, tempat_lahir: e.target.value })}
                      placeholder="Contoh: Jakarta"
                      className="text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Tanggal Lahir</Label>
                    <Input
                      type="date"
                      value={formData.tanggal_lahir}
                      onChange={(e) => setFormData({ ...formData, tanggal_lahir: e.target.value })}
                      className="text-xs mt-1"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold">NIK (Nomor Induk Kependudukan / KTP) *</Label>
                    <Input
                      value={formData.nik}
                      onChange={(e) => setFormData({ ...formData, nik: e.target.value.replace(/\D/g, "").slice(0, 16) })}
                      required
                      maxLength={16}
                      placeholder="16 Digit Angka Sesuai KTP"
                      className="text-xs mt-1 font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">NISN (Nomor Induk Siswa Nasional) *</Label>
                    <Input
                      value={formData.nisn}
                      onChange={(e) => setFormData({ ...formData, nisn: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                      required
                      maxLength={10}
                      placeholder="10 Digit Angka NISN"
                      className="text-xs mt-1 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold">Nama Ibu Kandung</Label>
                  <Input
                    value={formData.nama_ibu_kandung}
                    onChange={(e) => setFormData({ ...formData, nama_ibu_kandung: e.target.value })}
                    placeholder="Nama lengkap ibu kandung"
                    className="text-xs mt-1"
                  />
                </div>
              </div>

              {/* SECTION 2: KONTAK & ALAMAT */}
              <div className="space-y-3 pb-3 border-b border-slate-100">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5 text-blue-700">
                  <Phone className="w-4 h-4 text-blue-600" /> 2. Kontak & Alamat Domisili
                </h4>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold">No. WhatsApp Aktif (Menerima Salinan Pendaftaran) *</Label>
                    <Input
                      value={formData.whatsapp}
                      onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                      required
                      placeholder="Contoh: 081234567890"
                      className="text-xs mt-1 font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Email Aktif (Menerima Salinan Pendaftaran) *</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      placeholder="nama@email.com"
                      className="text-xs mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold">Alamat Lengkap Tempat Tinggal</Label>
                  <textarea
                    value={formData.alamat}
                    onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
                    rows={2}
                    placeholder="Nama Jalan, RT/RW, Kelurahan, Kecamatan, Kota/Kabupaten, Provinsi"
                    className="mt-1 w-full border border-slate-300 rounded-md p-2 text-xs"
                  />
                </div>
              </div>

              {/* SECTION 3: ASAL SEKOLAH & DATA FISIK */}
              <div className="space-y-3 pb-3 border-b border-slate-100">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5 text-emerald-700">
                  <Building className="w-4 h-4 text-emerald-600" /> 3. Asal Sekolah & Data Fisik
                </h4>

                <div>
                  <Label className="text-xs font-bold">Sekolah Asal *</Label>
                  <SchoolSearchInput
                    value={formData.asal_sekolah}
                    onTyping={(value) => {
                      setFormData((prev) => ({
                        ...prev,
                        asal_sekolah: value,
                        ...(value === prev.asal_sekolah
                          ? {}
                          : { npsn_sekolah: "", alamat_sekolah: "" }),
                      }));
                    }}
                    onSelect={(sch) => {
                      setFormData((prev) => ({
                        ...prev,
                        asal_sekolah: sch.nama || "",
                        npsn_sekolah: sch.npsn || "",
                        alamat_sekolah: [sch.alamat, sch.kecamatan, sch.kabupaten, sch.provinsi]
                          .filter(Boolean)
                          .join(", "),
                      }));
                    }}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold">NPSN Sekolah</Label>
                    <Input
                      value={formData.npsn_sekolah}
                      onChange={(e) => setFormData({ ...formData, npsn_sekolah: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                      placeholder="8 digit NPSN"
                      maxLength={8}
                      className="text-xs mt-1 font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Alamat Sekolah</Label>
                    <Input
                      value={formData.alamat_sekolah}
                      onChange={(e) => setFormData({ ...formData, alamat_sekolah: e.target.value })}
                      placeholder="Alamat sekolah"
                      className="text-xs mt-1"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold">Jurusan di Sekolah</Label>
                    <Input
                      value={formData.jurusan_asal}
                      onChange={(e) => setFormData({ ...formData, jurusan_asal: e.target.value })}
                      placeholder="Contoh: IPA / IPS / Rekayasa Perangkat Lunak"
                      className="text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Tahun Lulus</Label>
                    <Input
                      value={formData.tahun_lulus}
                      onChange={(e) => setFormData({ ...formData, tahun_lulus: e.target.value.slice(0, 4) })}
                      placeholder="2025"
                      className="text-xs mt-1 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold">Tinggi Badan (cm)</Label>
                    <Input
                      type="number"
                      value={formData.tinggi_badan}
                      onChange={(e) => setFormData({ ...formData, tinggi_badan: e.target.value })}
                      placeholder="170"
                      className="text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Berat Badan (kg)</Label>
                    <Input
                      type="number"
                      value={formData.berat_badan}
                      onChange={(e) => setFormData({ ...formData, berat_badan: e.target.value })}
                      placeholder="60"
                      className="text-xs mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: PILIHAN PROGRAM STUDI & KELAS */}
              <div className="space-y-3 pb-3 border-b border-slate-100">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5 text-purple-700">
                  <GraduationCap className="w-4 h-4 text-purple-600" /> 4. Pilihan Program Studi & Kelas (Alur 2)
                </h4>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold">Program Studi Pilihan Utama *</Label>
                    <select
                      value={formData.prodi_id}
                      onChange={(e) => setFormData({ ...formData, prodi_id: e.target.value })}
                      required
                      className="mt-1 w-full border border-slate-300 rounded-md p-2 text-xs bg-white font-medium"
                    >
                      <option value="">-- Pilih Program Studi --</option>
                      {availablePrograms.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nama} ({p.jenjang || "S1"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs font-bold">Pilihan Prodi Cadangan (Opsional)</Label>
                    <select
                      value={formData.prodi_id_2}
                      onChange={(e) => setFormData({ ...formData, prodi_id_2: e.target.value })}
                      className="mt-1 w-full border border-slate-300 rounded-md p-2 text-xs bg-white"
                    >
                      <option value="">-- Tidak ada --</option>
                      {availablePrograms.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nama} ({p.jenjang || "S1"})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold">Pilihan Jenis Kelas & Waktu Kuliah *</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, class_type: "reguler" })}
                      className={`p-2.5 rounded-lg border text-xs font-bold text-left transition-all ${
                        formData.class_type === "reguler"
                          ? "bg-sky-50 border-sky-600 text-sky-900 ring-1 ring-sky-500 shadow-xs"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <p>Kelas Reguler</p>
                      <p className="text-[10px] font-normal text-slate-500">Bisa Kuliah Online / Offline</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, class_type: "khusus", learning_mode: "offline" })}
                      className={`p-2.5 rounded-lg border text-xs font-bold text-left transition-all ${
                        formData.class_type === "khusus"
                          ? "bg-indigo-50 border-indigo-600 text-indigo-900 ring-1 ring-indigo-500 shadow-xs"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <p>Kelas Khusus (Karyawan)</p>
                      <p className="text-[10px] font-normal text-slate-500">Tatap Muka di Kampus</p>
                    </button>
                  </div>
                </div>
              </div>

              {/* SECTION 5: SUMBER INFORMASI & AKUN PMB */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5 text-amber-700">
                  <Info className="w-4 h-4 text-amber-600" /> 5. Sumber Informasi & Buat Password Akun
                </h4>

                <div>
                  <Label className="text-xs font-bold">Tau info Politeknik SCI dari mana? *</Label>
                  <select
                    value={formData.info_source}
                    onChange={(e) => setFormData({ ...formData, info_source: e.target.value })}
                    required
                    className="mt-1 w-full border border-slate-300 rounded-md p-2 text-xs bg-white font-medium"
                  >
                    <option value="Media Sosial (Instagram, TikTok, FB)">Media Sosial (Instagram, TikTok, Facebook)</option>
                    <option value="Website Resmi / Google">Website Resmi / Mesin Pencari Google</option>
                    <option value="Teman / Mahasiswa (Program Referal)">Teman / Mahasiswa (Program Referal)</option>
                    <option value="Guru BK / Kunjungan Sekolah">Guru BK / Sosialisasi Sekolah</option>
                    <option value="Brosur / Spanduk / Baliho">Brosur / Spanduk / Baliho</option>
                    <option value="Iklan Digital">Iklan Digital (Ads)</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold text-slate-700">
                      Kode Referal Promotor <span className="font-normal text-slate-400">(Opsional)</span>
                    </Label>
                    <Input
                      value={formData.referral_code}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setFormData({ ...formData, referral_code: val });
                        if (val.length >= 4) {
                          api.get(`/api/v1/pmb/referrals/public/check/${val}`)
                            .then(({ data }) => {
                              if (data.ok && data.valid) setReferralFeedback(data);
                              else setReferralFeedback(null);
                            })
                            .catch(() => setReferralFeedback(null));
                        } else {
                          setReferralFeedback(null);
                        }
                      }}
                      placeholder="Contoh: REF-BUDI26 (Kosongkan jika tidak ada)"
                      className="text-xs mt-1 font-mono uppercase"
                    />
                    {referralFeedback && (
                      <p className="text-[10px] text-emerald-700 font-bold mt-1 bg-emerald-50 p-1.5 rounded border border-emerald-200 inline-flex items-center gap-1">
                        <Check className="w-3 h-3" /> {referralFeedback.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs font-bold">Buat Password Akun PMB *</Label>
                    <Input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      placeholder="Minimal 6 karakter untuk login"
                      className="text-xs mt-1"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs px-6 py-2.5 shadow-md"
                >
                  {loading ? "Memproses Pendaftaran..." : <>Kirim Formulir Pendaftaran Sekarang <Rocket className="w-3.5 h-3.5 ml-1 inline" /></>}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default PmbDirectRegisterModal;
