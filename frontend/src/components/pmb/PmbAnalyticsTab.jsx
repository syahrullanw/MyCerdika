import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { apiErrorMessage } from "@/lib/utils";
import {
  TrendingUp,
  BarChart3,
  PieChart,
  RefreshCw,
  Award,
  AlertCircle,
  Building,
  MapPin,
  CheckCircle2,
  Users
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

export function PmbAnalyticsTab({ token: propToken }) {
  const token = propToken || (typeof window !== "undefined" ? localStorage.getItem("token") || "" : "");
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/v1/pmb/admin/analytics", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.ok) {
        setAnalytics(res.data.analytics);
      }
    } catch (err) {
      console.warn("Analytics error:", err);
      toast.error(apiErrorMessage(err, "Gagal memuat modul analisis pendaftar"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-indigo-600" />
        Memuat analisis & pemetaan pendaftar PMB...
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-10 text-slate-500 text-xs">
        Data analisis pendaftar belum tersedia.
      </div>
    );
  }

  const {
    grade_clusters = {},
    financial_clusters = {},
    city_clusters = [],
    province_clusters = [],
    feeder_schools = [],
    high_school_majors = [],
    prodi_tightness = [],
    conversion_funnel = {},
  } = analytics;

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            Analisis Calon Mahasiswa, Segmentasi & Pemetaan Wilayah
          </h3>
          <p className="text-xs text-slate-500">
            Wawasan komprehensif profil pendaftar, klaster nilai CBT, pemetaan sekolah mitra, dan rekomendasi panitia.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={fetchAnalytics}
          className="text-xs font-bold shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Segarkan Data
        </Button>
      </div>

      {/* Row 1: Klaster Nilai & Status Finansial */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Klaster Nilai Seleksi */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              1. Klaster Nilai Seleksi Masuk (CBT / Offline)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Rata-rata Nilai: <strong>{grade_clusters.average_score || 0}</strong> • Nilai Tertinggi: <strong>{grade_clusters.max_score || 0}</strong> • Kelulusan: <strong>{grade_clusters.passing_rate || 0}%</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <Badge className="bg-emerald-600 text-white text-[10px]">Grade A (≥ 85)</Badge>
                <p className="text-lg font-black text-emerald-900 mt-1">{grade_clusters.grade_a_high?.count || 0}</p>
                <p className="text-[10px] text-emerald-700 font-semibold">{grade_clusters.grade_a_high?.percentage || 0}% Pendaftar</p>
                <p className="text-[9px] text-slate-500 mt-0.5">Sangat Baik / Beasiswa</p>
              </div>

              <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl">
                <Badge className="bg-sky-600 text-white text-[10px]">Grade B (70 - 84)</Badge>
                <p className="text-lg font-black text-sky-900 mt-1">{grade_clusters.grade_b_standard?.count || 0}</p>
                <p className="text-[10px] text-sky-700 font-semibold">{grade_clusters.grade_b_standard?.percentage || 0}% Pendaftar</p>
                <p className="text-[9px] text-slate-500 mt-0.5">Standar Kelulusan</p>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <Badge className="bg-amber-600 text-white text-[10px]">Grade C (&lt; 70)</Badge>
                <p className="text-lg font-black text-amber-900 mt-1">{grade_clusters.grade_c_below?.count || 0}</p>
                <p className="text-[10px] text-amber-700 font-semibold">{grade_clusters.grade_c_below?.percentage || 0}% Pendaftar</p>
                <p className="text-[9px] text-slate-500 mt-0.5">Perlu Pembinaan</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Klaster Finansial */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-indigo-600" />
              2. Segmentasi Status Finansial & Penerimaan Uang Pra-Studi
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Total Penerimaan Masuk: <strong>{formatRupiah(financial_clusters.total_revenue_collected || 0)}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                <span className="text-[11px] font-bold text-indigo-900">Lunas 100%</span>
                <p className="text-lg font-black text-indigo-900 mt-1">{financial_clusters.paid_full?.count || 0}</p>
                <p className="text-[10px] text-indigo-700 font-semibold">{financial_clusters.paid_full?.percentage || 0}%</p>
                <p className="text-[9px] text-slate-500 mt-0.5">Pra-Studi Selesai</p>
              </div>

              <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl">
                <span className="text-[11px] font-bold text-sky-900">Skema Cicilan</span>
                <p className="text-lg font-black text-sky-900 mt-1">{financial_clusters.paid_installment?.count || 0}</p>
                <p className="text-[10px] text-sky-700 font-semibold">{financial_clusters.paid_installment?.percentage || 0}%</p>
                <p className="text-[9px] text-slate-500 mt-0.5">Termin Bertahap</p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] font-bold text-slate-700">Belum Bayar</span>
                <p className="text-lg font-black text-slate-700 mt-1">{financial_clusters.unpaid?.count || 0}</p>
                <p className="text-[10px] text-slate-500 font-semibold">{financial_clusters.unpaid?.percentage || 0}%</p>
                <p className="text-[9px] text-slate-500 mt-0.5">Pending Tagihan</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Pemetaan Geografis & Feeder Schools */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Pemetaan Geografis */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-rose-500" />
              3. Persebaran Wilayah Pendaftar Terbanyak (Top 10 Kota)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Analisis konsentrasi demografi pendaftar baru.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {city_clusters.length > 0 ? (
              city_clusters.map((c, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-slate-800">{c.city}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-slate-600 font-bold">{c.count} Mhs</span>
                    <Badge variant="outline" className="text-[10px] bg-white">{c.percentage}%</Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-400 text-center py-4">Belum ada data domisili pendaftar.</p>
            )}
          </CardContent>
        </Card>

        {/* Top Feeder Schools */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building className="w-4 h-4 text-indigo-600" />
              4. Peringkat Sekolah Asal Mitra (Top Feeder Schools)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Sekolah SMA/SMK penyumbang pendaftar terbanyak.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {feeder_schools.length > 0 ? (
              feeder_schools.map((s, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-slate-800">{s.school}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-slate-600 font-bold">{s.count} Mhs</span>
                    <Badge variant="outline" className="text-[10px] bg-white">{s.percentage}%</Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-400 text-center py-4">Belum ada data sekolah asal pendaftar.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Analisis Keketatan Prodi & Funnel Drop-Off */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Keketatan Prodi */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              5. Analisis Keketatan & Daya Tampung Program Studi
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Perbandingan total peminat terhadap kuota penerimaan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 text-[10px]">
                    <TableHead>Program Studi</TableHead>
                    <TableHead className="text-center">Peminat</TableHead>
                    <TableHead className="text-center">Daftar Ulang</TableHead>
                    <TableHead className="text-center">Kuota</TableHead>
                    <TableHead className="text-right">Keketatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prodi_tightness.map((p, idx) => (
                    <TableRow key={idx} className="text-[11px]">
                      <TableCell className="font-semibold">{p.prodi_name}</TableCell>
                      <TableCell className="text-center font-mono font-bold text-sky-700">{p.total_applicants}</TableCell>
                      <TableCell className="text-center font-mono font-bold text-emerald-700">{p.reregistered_students}</TableCell>
                      <TableCell className="text-center font-mono text-slate-600">{p.quota}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-indigo-700">{p.competitiveness_ratio}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Funnel Bottleneck & Rekomendasi */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              6. Analisis Bottleneck Funnel & Rekomendasi Panitia
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Deteksi penurunan pendaftar terbesar dan saran perbaikan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {conversion_funnel.biggest_dropoff && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-600 text-white text-[10px]">Bottleneck Terbesar</Badge>
                  <span className="font-bold text-amber-950 text-xs">
                    {conversion_funnel.biggest_dropoff.stage} ({conversion_funnel.biggest_dropoff.drop_count} Orang Drop)
                  </span>
                </div>
                <p className="text-[11px] text-amber-900 font-medium">
                  {conversion_funnel.biggest_dropoff.description}
                </p>
              </div>
            )}

            <div className="p-3.5 bg-slate-900 text-white rounded-xl space-y-2">
              <p className="font-bold text-sky-300 text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Rekomendasi Strategis Panitia PMB:
              </p>
              <ul className="text-[11px] text-slate-300 space-y-1.5 list-disc list-inside">
                {conversion_funnel.recommendations?.map((rec, idx) => (
                  <li key={idx} className="leading-relaxed">{rec}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
