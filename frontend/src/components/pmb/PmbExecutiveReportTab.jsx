import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { apiErrorMessage } from "@/lib/utils";
import {
  Printer,
  FileCheck,
  RefreshCw,
  Award,
  TrendingUp,
  DollarSign,
  GraduationCap
} from "lucide-react";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") || window.location.origin;
const api = axios.create({ baseURL: BACKEND_URL });

function formatRupiah(num) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num || 0);
}

export function PmbExecutiveReportTab({ token: propToken, branding }) {
  const token = propToken || (typeof window !== "undefined" ? localStorage.getItem("token") || "" : "");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/v1/pmb/admin/final-report", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.ok) {
        setReport(res.data.report);
      }
    } catch (err) {
      console.warn("Final report error:", err);
      toast.error(apiErrorMessage(err, "Gagal memuat dokumen laporan akhir eksekutif PMB"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-indigo-600" />
        Menyusun naskah laporan eksekutif PMB...
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-10 text-slate-500 text-xs">
        Dokumen laporan akhir PMB belum tersedia.
      </div>
    );
  }

  const {
    institution = {},
    document_meta = {},
    executive_summary = {},
    financial_balance_sheet = {},
    programs_performance = [],
    referral_performance = {},
    evaluation_and_recommendations = [],
    sign_off = {},
  } = report;

  return (
    <div className="space-y-6">
      {/* Print Control Toolbar */}
      <div className="flex items-center justify-between bg-slate-900 text-white p-4 rounded-xl shadow-lg print:hidden">
        <div>
          <h3 className="font-bold text-sm flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-emerald-400" />
            Laporan Akhir Eksekutif PMB (Siap Cetak / PDF)
          </h3>
          <p className="text-[11px] text-slate-400">
            Nomor Dokumen: <span className="font-mono text-amber-300">{document_meta.document_number}</span> • Periode: {document_meta.academic_period}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchReport}
            className="border-slate-700 text-slate-200 hover:bg-slate-800 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Segarkan
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handlePrint}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" /> Cetak Dokumen Resmi (PDF)
          </Button>
        </div>
      </div>

      {/* Printable Sheet (Formal Executive Document) */}
      <div className="bg-white p-8 sm:p-12 rounded-2xl border border-slate-200 shadow-md print:shadow-none print:border-none print:p-0 max-w-4xl mx-auto space-y-8 text-slate-900 font-serif">
        {/* 1. Official Letterhead / Kop Surat */}
        <div className="border-b-4 border-double border-slate-900 pb-4 flex items-center justify-between gap-4">
          <div className="w-16 h-16 rounded-xl bg-indigo-900 flex items-center justify-center text-white font-black text-2xl shrink-0">
            <GraduationCap className="w-9 h-9" />
          </div>
          <div className="text-center flex-1 space-y-0.5">
            <h1 className="font-black text-lg sm:text-xl tracking-tight uppercase">
              {institution.name || branding?.name || "INSTITUT TEKNOLOGI & BISNIS KAMPUS"}
            </h1>
            <p className="text-xs font-sans text-slate-600">
              PANITIA PENERIMAAN MAHASISWA BARU (PMB) TAHUN AKADEMIK 2026/2027
            </p>
            <p className="text-[10px] font-sans text-slate-500">
              {institution.address || "Jl. Kampus Unggul No. 1, Jakarta Selatan"} • Telp: {institution.phone || "(021) 7890-1234"} • Email: {institution.email || "pmb@kampus.ac.id"}
            </p>
          </div>
          <div className="w-16 text-right font-mono text-[10px] text-slate-500">
            RAHASIA
          </div>
        </div>

        {/* 2. Document Title */}
        <div className="text-center space-y-1">
          <h2 className="font-bold text-base sm:text-lg uppercase tracking-wider underline">
            LAPORAN AKHIR EKSEKUTIF PENERIMAAN MAHASISWA BARU
          </h2>
          <p className="text-xs font-mono text-slate-600">
            Nomor: {document_meta.document_number} • Tanggal Penetapan: {document_meta.date_formatted}
          </p>
        </div>

        {/* 3. Executive KPI Summary */}
        <div className="font-sans space-y-3">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
            I. Ringkasan Eksekutif & Ketercapaian Target (KPI)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Target Mahasiswa</span>
              <p className="text-xl font-black text-slate-900 mt-0.5">{executive_summary.target_new_students}</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Total Pendaftar</span>
              <p className="text-xl font-black text-sky-700 mt-0.5">{executive_summary.total_applicants}</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Diterima & Daftar Ulang</span>
              <p className="text-xl font-black text-emerald-700 mt-0.5">{executive_summary.total_accepted_and_reregistered}</p>
            </div>
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
              <span className="text-[10px] text-indigo-700 uppercase font-semibold">% Capaian Target</span>
              <p className="text-xl font-black text-indigo-900 mt-0.5">{executive_summary.kpi_achievement_percentage}%</p>
            </div>
          </div>
        </div>

        {/* 4. Financial Balance Sheet */}
        <div className="font-sans space-y-3">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1 flex items-center justify-between">
            <span>II. Neraca Finansial & Penerimaan PMB</span>
            <Badge className="bg-emerald-700 text-white font-mono text-[10px]">
              Net Revenue: {formatRupiah(financial_balance_sheet.net_pmb_revenue)}
            </Badge>
          </h3>

          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="font-semibold">1. Realisasi Penerimaan Biaya Formulir</TableCell>
                  <TableCell className="text-right font-mono font-bold text-sky-800">{formatRupiah(financial_balance_sheet.registration_fees_collected)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">2. Realisasi Penerimaan Uang Pra-Studi & Daftar Ulang</TableCell>
                  <TableCell className="text-right font-mono font-bold text-sky-800">{formatRupiah(financial_balance_sheet.pra_studi_fees_collected)}</TableCell>
                </TableRow>
                <TableRow className="bg-slate-50 font-bold">
                  <TableCell>Total Penerimaan Bruto (Gross Inflow)</TableCell>
                  <TableCell className="text-right font-mono text-indigo-900 font-black">{formatRupiah(financial_balance_sheet.gross_revenue)}</TableCell>
                </TableRow>
                <TableRow className="text-rose-700">
                  <TableCell className="font-semibold">3. Pengeluaran Komisi & Insentif Mitra Referal</TableCell>
                  <TableCell className="text-right font-mono font-bold">- {formatRupiah(financial_balance_sheet.referral_commissions_paid)}</TableCell>
                </TableRow>
                <TableRow className="bg-emerald-50 text-emerald-950 font-black text-sm">
                  <TableCell>Penerimaan Bersih PMB (Net Inflow)</TableCell>
                  <TableCell className="text-right font-mono">{formatRupiah(financial_balance_sheet.net_pmb_revenue)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        {/* 5. Program Study Performance */}
        <div className="font-sans space-y-3">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
            III. Kinerja Program Studi & Tingkat Keterisian Kuota
          </h3>
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 text-[10px]">
                  <TableHead>Program Studi</TableHead>
                  <TableHead className="text-center">Jenjang</TableHead>
                  <TableHead className="text-center">Peminat</TableHead>
                  <TableHead className="text-center">Lulus</TableHead>
                  <TableHead className="text-center">Daftar Ulang</TableHead>
                  <TableHead className="text-center">Kuota</TableHead>
                  <TableHead className="text-right">% Terisi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {programs_performance.map((p, idx) => (
                  <TableRow key={idx} className="text-[11px]">
                    <TableCell className="font-bold">{p.nama}</TableCell>
                    <TableCell className="text-center">{p.jenjang}</TableCell>
                    <TableCell className="text-center font-mono">{p.applicants_count}</TableCell>
                    <TableCell className="text-center font-mono">{p.passed_count}</TableCell>
                    <TableCell className="text-center font-mono font-bold text-emerald-700">{p.reregistered_count}</TableCell>
                    <TableCell className="text-center font-mono">{p.quota}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-indigo-700">{p.fill_rate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* 6. Referral Evaluation */}
        <div className="font-sans space-y-2 text-xs">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
            IV. Evaluasi Program Kemitraan & Referal
          </h3>
          <p className="text-slate-700 leading-relaxed text-[11px]">
            Program referal melibatkan <strong>{referral_performance.total_promoters} promotor aktif</strong> (mahasiswa, dosen, dan mitra luar) yang menyumbang <strong>{referral_performance.applicants_acquired} pendaftar baru</strong> dengan total komisi terdistribusi sebesar <strong>{formatRupiah(referral_performance.total_commission_paid)}</strong>.
          </p>
        </div>

        {/* 7. Strategic Notes */}
        <div className="font-sans space-y-2 text-xs">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1">
            V. Catatan Evaluasi & Rekomendasi Tahun Akademik Berikutnya
          </h3>
          <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-700 leading-relaxed">
            {evaluation_and_recommendations.map((rec, idx) => (
              <li key={idx}>{rec}</li>
            ))}
          </ol>
        </div>

        {/* 8. Official Sign-Off */}
        <div className="pt-8 grid grid-cols-2 gap-8 text-center text-xs font-sans">
          <div className="space-y-16">
            <div>
              <p className="text-slate-600">Mengetahui & Menyetujui,</p>
              <p className="font-bold text-slate-900">{sign_off.approver_title || "Rektor / Direktur Kampus"}</p>
            </div>
            <div>
              <p className="font-bold text-slate-900 underline">{sign_off.approver_name || "Prof. Dr. Ir. H. Ahmad Santoso, M.Kom."}</p>
              <p className="text-[10px] text-slate-500">NIP. 19750815 200212 1 001</p>
            </div>
          </div>

          <div className="space-y-16">
            <div>
              <p className="text-slate-600">Jakarta, {document_meta.date_formatted}</p>
              <p className="font-bold text-slate-900">{sign_off.lead_title || "Ketua Panitia PMB 2026"}</p>
            </div>
            <div>
              <p className="font-bold text-slate-900 underline">{sign_off.lead_name || "Dr. Muhammad Farhan, S.Kom., M.T."}</p>
              <p className="text-[10px] text-slate-500">NIP. 19830412 200801 1 003</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
