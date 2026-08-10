import React, { useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { apiErrorMessage } from "@/lib/utils";
import {
  Share2,
  Copy,
  DollarSign,
  Users,
  Search,
  CheckCircle,
  Gift,
  X,
  ClipboardList,
  Wallet,
  GraduationCap,
  UserRound,
  Globe,
  Rocket,
  Check
} from "lucide-react";

const CATEGORY_ICONS = {
  student: { label: "Mahasiswa", icon: GraduationCap },
  lecturer: { label: "Dosen/Staff", icon: UserRound },
  external: { label: "Agen Luar", icon: Globe },
};

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") || window.location.origin;
const api = axios.create({ baseURL: BACKEND_URL });

function formatRupiah(num) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num || 0);
}

export function ReferralRegistrationModal({ isOpen, onClose, defaultCategory = "student" }) {
  const [activeTab, setActiveTab] = useState("register"); // 'register' | 'check'
  const [formData, setFormData] = useState({
    name: "",
    category: defaultCategory,
    custom_code: "",
    email: "",
    whatsapp: "",
    bank_name: "BCA",
    bank_account_number: "",
    bank_account_holder: "",
  });
  const [loading, setLoading] = useState(false);
  const [createdReferral, setCreatedReferral] = useState(null);

  const [checkCode, setCheckCode] = useState("");
  const [checkLoading, setCheckLoading] = useState(false);
  const [statsData, setStatsData] = useState(null);

  if (!isOpen) return null;

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await api.post("/api/v1/pmb/referrals/register", formData);
      if (res.data.ok) {
        toast.success(res.data.message || "Pendaftaran Promotor Berhasil!");
        setCreatedReferral(res.data.referral);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal mendaftar promotor referal"));
    } finally {
      setLoading(false);
    }
  };

  const handleCheck = async (e) => {
    e.preventDefault();
    if (!checkCode.trim()) return;
    try {
      setCheckLoading(true);
      const res = await api.get(`/api/v1/pmb/referrals/my-stats?code=${checkCode.trim().toUpperCase()}`);
      if (res.data.ok) {
        setStatsData(res.data);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Kode referal tidak ditemukan"));
    } finally {
      setCheckLoading(false);
    }
  };

  const copyLink = (link) => {
    navigator.clipboard.writeText(link);
    toast.success("Link referal berhasil disalin ke clipboard!");
  };

  const shareWA = (code, link) => {
    const text = encodeURIComponent(
      `Halo! Yuk kuliah di kampus terbaik dengan pilihan kelas Reguler (Online/Offline) atau Kelas Karyawan. Daftar sekarang melalui link pendaftaran resmi PMB berikut: ${link} (Kode Referal: ${code})`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto text-slate-900">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] my-auto animate-fade-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-sky-800 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-xl shadow-md">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg leading-tight">
                Program Kemitraan & Promotor Referal PMB
              </h3>
              <p className="text-xs text-sky-200">
                Ajak Calon Mahasiswa Baru & Raih Fee Insentif Tunai
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-sm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-bold">
          <button
            type="button"
            onClick={() => { setActiveTab("register"); setCreatedReferral(null); }}
            className={`flex-1 py-3 text-center transition-all ${
              activeTab === "register"
                ? "bg-white text-indigo-700 border-b-2 border-indigo-600 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5 inline mr-1.5" /> Daftar Jadi Promotor
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("check")}
            className={`flex-1 py-3 text-center transition-all ${
              activeTab === "check"
                ? "bg-white text-indigo-700 border-b-2 border-indigo-600 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Search className="w-3.5 h-3.5 inline mr-1.5" /> Cek Perolehan & Saldo Komisi
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {activeTab === "register" ? (
            createdReferral ? (
              <div className="space-y-4 text-center py-2 animate-fade-in">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                  <Check className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-extrabold text-base text-slate-900">Selamat, Anda Resmi Terdaftar!</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Gunakan kode unik dan tautan berikut untuk mempromosikan formulir PMB kepada rekan/keluarga.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-left">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Nama Promotor:</span>
                    <span className="font-bold text-slate-800">{createdReferral.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Kode Referal Unik:</span>
                    <Badge className="bg-indigo-600 text-white font-mono font-bold text-xs px-2.5 py-1">
                      {createdReferral.code}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-500 font-medium text-[11px]">Tautan Pendaftaran Khusus:</span>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={createdReferral.referral_url}
                        className="text-xs bg-white font-mono text-indigo-800"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => copyLink(createdReferral.referral_url)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 text-xs px-3"
                      >
                        <Copy className="w-3.5 h-3.5 mr-1" /> Salin
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 justify-center pt-2">
                  <Button
                    type="button"
                    onClick={() => shareWA(createdReferral.code, createdReferral.referral_url)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4"
                  >
                    <Share2 className="w-3.5 h-3.5 mr-1.5" /> Bagikan ke WhatsApp
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCheckCode(createdReferral.code);
                      setActiveTab("check");
                    }}
                    className="text-xs font-bold"
                  >
                    Pantau Komisi
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-3">
                  <Wallet className="w-7 h-7 text-indigo-600 shrink-0" />
                  <div className="text-[11px] text-indigo-900">
                    <p className="font-bold">Skema Benefit Insentif Tunai:</p>
                    <p>• <strong>Rp 50.000</strong> per formulir terverifikasi</p>
                    <p>• <strong>Rp 200.000</strong> per pendaftar lunas daftar ulang</p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold">Kategori Promotor *</Label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="mt-1 w-full border border-slate-300 rounded-md p-2 text-xs bg-white font-medium"
                    >
                      <option value="student"><GraduationCap className="w-3 h-3 inline mr-1" /> Mahasiswa Aktif Kampus</option>
                      <option value="lecturer"><UserRound className="w-3 h-3 inline mr-1" /> Dosen / Staff Kampus</option>
                      <option value="external"><Globe className="w-3 h-3 inline mr-1" /> Orang Luar / Mitra / Agen</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Nama Lengkap *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="Nama Sesuai Rekening Bank"
                      className="text-xs mt-1"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold">No. WhatsApp Aktif *</Label>
                    <Input
                      value={formData.whatsapp}
                      onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                      required
                      placeholder="08123456789"
                      className="text-xs mt-1 font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Email Aktif</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@example.com"
                      className="text-xs mt-1"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                  <p className="font-bold text-slate-800 text-[11px]">Rekening Bank Pencairan Fee:</p>
                  <div className="grid sm:grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[11px]">Bank / E-Wallet</Label>
                      <select
                        value={formData.bank_name}
                        onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                        className="mt-1 w-full border border-slate-300 rounded p-1.5 text-xs bg-white"
                      >
                        <option value="BCA">BCA</option>
                        <option value="Mandiri">Mandiri</option>
                        <option value="BRI">BRI</option>
                        <option value="BNI">BNI</option>
                        <option value="BSI">BSI</option>
                        <option value="GoPay/OVO/Dana">E-Wallet</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-[11px]">Nomor Rekening</Label>
                      <Input
                        value={formData.bank_account_number}
                        onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value })}
                        placeholder="1234567890"
                        className="text-xs mt-1 font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Atas Nama</Label>
                      <Input
                        value={formData.bank_account_holder}
                        onChange={(e) => setFormData({ ...formData, bank_account_holder: e.target.value })}
                        placeholder="Nama Pemilik"
                        className="text-xs mt-1"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold">Request Kode Khusus (Opsional)</Label>
                  <Input
                    value={formData.custom_code}
                    onChange={(e) => setFormData({ ...formData, custom_code: e.target.value.toUpperCase() })}
                    placeholder="Contoh: REF-BUDI26 (Kosongkan jika ingin auto-generate)"
                    className="text-xs mt-1 font-mono uppercase"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={onClose}>
                    Tutup
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="bg-gradient-to-r from-indigo-700 to-sky-600 text-white font-bold text-xs px-5 shadow-md"
                  >
                    {loading ? "Mendaftarkan..." : <>Daftar & Dapatkan Link Unik <Rocket className="w-3.5 h-3.5 ml-1 inline" /></>}
                  </Button>
                </div>
              </form>
            )
          ) : (
            <div className="space-y-4">
              <form onSubmit={handleCheck} className="flex gap-2">
                <Input
                  value={checkCode}
                  onChange={(e) => setCheckCode(e.target.value.toUpperCase())}
                  placeholder="Masukkan Kode Referal Anda (e.g. REF-ABC12)"
                  className="font-mono text-xs uppercase"
                  required
                />
                <Button type="submit" disabled={checkLoading} size="sm" className="bg-indigo-600 text-white font-bold px-4">
                  <Search className="w-3.5 h-3.5 mr-1" /> {checkLoading ? "Mengecek..." : "Cari"}
                </Button>
              </form>

              {statsData && statsData.ok && (
                <div className="space-y-4 animate-fade-in">
                  <div className="p-4 bg-slate-900 text-white rounded-xl space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Promotor Terdaftar</p>
                        <h4 className="font-extrabold text-base text-white">{statsData.promoter.name}</h4>
                        <Badge className="bg-indigo-500/30 text-indigo-300 text-[10px] mt-1">
                          {(() => {
                            const cat = CATEGORY_ICONS[statsData.promoter.category] || CATEGORY_ICONS.external;
                            const IconComp = cat.icon;
                            return <span className="inline-flex items-center gap-1"><IconComp className="w-3 h-3" /> {cat.label}</span>;
                          })()}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 uppercase">Sisa Saldo Komisi</p>
                        <p className="text-lg font-black text-amber-400 font-mono">
                          {formatRupiah(statsData.promoter.balance_due)}
                        </p>
                        <p className="text-[10px] text-slate-400">Total Komisi: {formatRupiah(statsData.promoter.total_commission_earned)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-[11px]">
                      <div className="p-2 bg-slate-800/80 rounded-lg">
                        <span className="text-slate-400">Pendaftar Bayar Form:</span>
                        <p className="font-bold text-sky-400 text-sm mt-0.5">{statsData.promoter.total_applicants_paid_form} Orang</p>
                      </div>
                      <div className="p-2 bg-slate-800/80 rounded-lg">
                        <span className="text-slate-400">Pendaftar Daftar Ulang:</span>
                        <p className="font-bold text-emerald-400 text-sm mt-0.5">{statsData.promoter.total_applicants_reregistered} Orang</p>
                      </div>
                    </div>
                  </div>

                  {statsData.applicants?.length > 0 ? (
                    <div>
                      <h5 className="font-bold text-xs text-slate-800 mb-2">Daftar Mahasiswa Binaan ({statsData.applicants.length}):</h5>
                      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50 text-[10px]">
                              <TableHead>Nama</TableHead>
                              <TableHead>Prodi</TableHead>
                              <TableHead>Status Form</TableHead>
                              <TableHead>Daftar Ulang</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {statsData.applicants.map((a, idx) => (
                              <TableRow key={idx} className="text-[11px]">
                                <TableCell className="font-semibold">{a.name}</TableCell>
                                <TableCell>{a.prodi_name}</TableCell>
                                <TableCell>
                                  {a.paid_form ? (
                                    <span className="text-emerald-700 font-bold inline-flex items-center gap-1"><Check className="w-3 h-3" /> Lunas Form</span>
                                  ) : (
                                    <span className="text-slate-400">Belum</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {a.reregistered ? (
                                    <span className="text-indigo-700 font-bold inline-flex items-center gap-1"><Check className="w-3 h-3" /> Daftar Ulang</span>
                                  ) : (
                                    <span className="text-slate-400">Belum</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-slate-400 text-xs py-4">Belum ada calon mahasiswa yang mendaftar via kode ini.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
