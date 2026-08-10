import React, { useState, useEffect } from "react";
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
  Share2,
  Copy,
  DollarSign,
  Users,
  Search,
  CheckCircle,
  Plus,
  RefreshCw,
  Gift,
  GraduationCap,
  UserRound,
  Globe,
  Banknote,
  X,
  Check
} from "lucide-react";

const CATEGORY_LABELS = {
  student: { label: "Mahasiswa", icon: GraduationCap },
  lecturer: { label: "Dosen/Staff", icon: UserRound },
  external: { label: "Umum", icon: Globe },
};
import { ReferralRegistrationModal } from "./ReferralComponents";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") || window.location.origin;
const api = axios.create({ baseURL: BACKEND_URL });

function formatRupiah(num) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num || 0);
}

export function PmbReferralsTab({ token: propToken }) {
  const token = propToken || (typeof window !== "undefined" ? localStorage.getItem("token") || "" : "");
  const [promoters, setPromoters] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  // Payout Modal
  const [selectedPromoter, setSelectedPromoter] = useState(null);
  const [payoutAmount, setPayoutAmount] = useState(0);
  const [payoutRef, setPayoutRef] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [payoutLoading, setPayoutLoading] = useState(false);

  const fetchPromoters = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/v1/pmb/admin/referrals", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.ok) {
        setPromoters(res.data.promoters || []);
        setSummary(res.data.summary);
      }
    } catch (err) {
      console.warn("Referrals error:", err);
      toast.error(apiErrorMessage(err, "Gagal memuat data promotor referal"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromoters();
  }, []);

  const handleOpenPayout = (promoter) => {
    setSelectedPromoter(promoter);
    setPayoutAmount(promoter.balance_due || 0);
    setPayoutRef(`TRF-${Date.now().toString().slice(-6)}`);
    setPayoutNotes("");
  };

  const submitPayout = async (e) => {
    e.preventDefault();
    if (!selectedPromoter) return;
    try {
      setPayoutLoading(true);
      const res = await api.post(
        `/api/v1/pmb/admin/referrals/${selectedPromoter.id}/payout`,
        {
          amount: parseFloat(payoutAmount),
          transfer_reference: payoutRef,
          notes: payoutNotes,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.ok) {
        toast.success("Pencairan komisi berhasil dicatat!");
        setSelectedPromoter(null);
        fetchPromoters();
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal mencatat pencairan komisi"));
    } finally {
      setPayoutLoading(false);
    }
  };

  const copyLink = (link) => {
    navigator.clipboard.writeText(link);
    toast.success("Link referal berhasil disalin!");
  };

  const filtered = promoters.filter(
    (p) =>
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.code?.toLowerCase().includes(search.toLowerCase()) ||
      p.whatsapp?.includes(search)
  );

  return (
    <div className="space-y-6">
      {/* Top Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <p className="text-xs text-slate-500 font-medium">Total Promotor Terdaftar</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{summary?.total_promoters || 0}</p>
          <p className="text-[10px] text-slate-400">Mahasiswa, Dosen, & Umum</p>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <p className="text-xs text-slate-500 font-medium">Mahasiswa Terbina</p>
          <p className="text-2xl font-black text-sky-600 mt-1">{summary?.total_applicants_referred || 0}</p>
          <p className="text-[10px] text-emerald-600 font-semibold">{summary?.total_applicants_reregistered || 0} Daftar Ulang</p>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <p className="text-xs text-slate-500 font-medium">Akumulasi Komisi Hak</p>
          <p className="text-xl font-black text-indigo-700 mt-1 font-mono">{formatRupiah(summary?.total_commission_earned || 0)}</p>
          <p className="text-[10px] text-slate-400">Total Reward Dihasilkan</p>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <p className="text-xs text-slate-500 font-medium">Sisa Belum Dicairkan</p>
          <p className="text-xl font-black text-amber-600 mt-1 font-mono">{formatRupiah(summary?.total_balance_due || 0)}</p>
          <p className="text-[10px] text-emerald-600 font-bold">Terbayar: {formatRupiah(summary?.total_commission_paid || 0)}</p>
        </div>
      </div>

      {/* Main Table Card */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Gift className="w-5 h-5 text-indigo-600" />
                Daftar Promotor & Riwayat Komisi Referal
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Kelola data promotor, saldo komisi perolehan, dan pencairan hak fee pendaftaran & daftar ulang.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => setShowAddModal(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Tambah Promotor
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={fetchPromoters}
                className="text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="pt-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari promotor berdasarkan nama, kode referal, no WA..."
              className="text-xs max-w-sm"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 text-[10px]">
                  <TableHead>Promotor</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Kode & Tautan</TableHead>
                  <TableHead>Rekening Pencairan</TableHead>
                  <TableHead className="text-center">Mhs Binaan</TableHead>
                  <TableHead className="text-right">Total Hak</TableHead>
                  <TableHead className="text-right">Sisa Saldo</TableHead>
                  <TableHead className="text-center">Aksi Payout</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-xs text-slate-400">
                      <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-indigo-600" />
                      Memuat daftar promotor referal...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-xs text-slate-400">
                      Belum ada promotor referal yang terdaftar.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((p) => (
                    <TableRow key={p.id} className="text-xs">
                      <TableCell>
                        <p className="font-bold text-slate-900">{p.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{p.whatsapp || p.email || "-"}</p>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-[10px] font-bold ${
                            p.category === "student"
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                              : p.category === "lecturer"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {(() => {
                            const cat = CATEGORY_LABELS[p.category] || CATEGORY_LABELS.external;
                            const IconComp = cat.icon;
                            return <span className="inline-flex items-center gap-1"><IconComp className="w-3 h-3" /> {cat.label}</span>;
                          })()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge className="bg-slate-900 text-white font-mono text-[10px]">{p.code}</Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => copyLink(p.referral_url)}
                            className="h-6 w-6 p-0 text-slate-500 hover:text-indigo-600"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="font-semibold text-[11px] text-slate-800">{p.bank_name}: {p.bank_account_number || "-"}</p>
                        <p className="text-[10px] text-slate-500">a.n. {p.bank_account_holder || "-"}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono font-bold text-sky-700">{p.total_applicants_referred || 0}</span>
                        <span className="text-[10px] text-slate-400 block font-normal">({p.total_applicants_reregistered || 0} Daftar Ulang)</span>
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-slate-700">
                        {formatRupiah(p.total_commission_earned || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-amber-600">
                        {formatRupiah(p.balance_due || 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          type="button"
                          size="sm"
                          disabled={!p.balance_due || p.balance_due <= 0}
                          onClick={() => handleOpenPayout(p)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] h-7 px-2.5 font-bold"
                        >
                          <Banknote className="w-3.5 h-3.5 mr-1.5 inline" /> Cairkan Fee
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Referral Add Modal */}
      <ReferralRegistrationModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          fetchPromoters();
        }}
      />

      {/* Admin Payout Modal */}
      {selectedPromoter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
            <div className="bg-gradient-to-r from-emerald-700 to-teal-800 p-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-300" />
                <h4 className="font-bold text-sm">Pencairan Komisi Referal</h4>
              </div>
              <button
                onClick={() => setSelectedPromoter(null)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={submitPayout} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Penerima Komisi:</p>
                <p className="text-sm font-black text-slate-900">{selectedPromoter.name}</p>
                <p className="text-slate-600">{selectedPromoter.bank_name}: <strong>{selectedPromoter.bank_account_number}</strong> ({selectedPromoter.bank_account_holder})</p>
                <p className="text-[11px] text-amber-700 font-bold">Sisa Saldo Berhak: {formatRupiah(selectedPromoter.balance_due)}</p>
              </div>

              <div>
                <Label className="text-xs font-bold">Nominal Pencairan (IDR) *</Label>
                <Input
                  type="number"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  max={selectedPromoter.balance_due}
                  min={10000}
                  required
                  className="text-xs mt-1 font-mono font-bold text-emerald-700"
                />
              </div>

              <div>
                <Label className="text-xs font-bold">No. Referensi Transfer Bank / Bukti *</Label>
                <Input
                  value={payoutRef}
                  onChange={(e) => setPayoutRef(e.target.value)}
                  required
                  placeholder="TRF-123456 / No Bukti Transfer"
                  className="text-xs mt-1 font-mono"
                />
              </div>

              <div>
                <Label className="text-xs font-bold">Catatan Payout</Label>
                <Input
                  value={payoutNotes}
                  onChange={(e) => setPayoutNotes(e.target.value)}
                  placeholder="Transfer via m-Banking BCA panitia PMB"
                  className="text-xs mt-1"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedPromoter(null)}>
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={payoutLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4"
                >
                  {payoutLoading ? "Memproses..." : <>Konfirmasi Pembayaran Selesai <Check className="w-3.5 h-3.5 ml-1 inline" /></>}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
