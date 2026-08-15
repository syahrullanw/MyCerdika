import React, { useMemo, useRef, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { apiErrorMessage } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  FileUp,
  Info,
  RefreshCw,
  Upload,
} from "lucide-react";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") || window.location.origin;
const api = axios.create({ baseURL: BACKEND_URL });
const TEMPLATE_URL = "/templates/template-import-mahasiswa-baru.xlsx";

function statusBadge(status) {
  if (status === "imported" || status === "valid") {
    return <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px]">{status === "imported" ? "Berhasil" : "Valid"}</Badge>;
  }
  if (status === "skipped") {
    return <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px]">Dilewati</Badge>;
  }
  return <Badge className="bg-rose-100 text-rose-800 border border-rose-200 text-[10px]">Perlu diperbaiki</Badge>;
}

export function PmbStudentImportTab({ token, programs = [] }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [defaultProdiId, setDefaultProdiId] = useState("");
  const [defaultPassword, setDefaultPassword] = useState("");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const sortedPrograms = useMemo(
    () => [...programs].sort((a, b) => String(a.nama || a.name || "").localeCompare(String(b.nama || b.name || ""))),
    [programs],
  );

  const authConfig = { headers: { Authorization: `Bearer ${token}` } };

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0] || null;
    event.target.value = "";
    setFile(selected);
    setPreview(null);
  };

  const buildFormData = () => {
    const form = new FormData();
    form.append("file", file);
    form.append("default_prodi_id", defaultProdiId);
    form.append("default_password", defaultPassword);
    return form;
  };

  const handlePreview = async () => {
    if (!file) {
      toast.error("Pilih file Excel terlebih dahulu");
      return;
    }
    setLoading(true);
    try {
      const response = await api.post("/api/v1/pmb/admin/students/import/preview", buildFormData(), authConfig);
      setPreview(response.data);
      toast.success(`Preview selesai: ${response.data.valid_rows || 0} baris siap diimpor`);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Gagal membaca file Excel"));
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error("Pilih file Excel terlebih dahulu");
      return;
    }
    if (!preview) {
      toast.error("Lakukan preview sebelum import");
      return;
    }
    if (!(preview.valid_rows > 0)) {
      toast.error("Tidak ada baris valid yang dapat diimpor");
      return;
    }
    if (!window.confirm(`Import ${preview.valid_rows} mahasiswa baru ke SIAKAD dan buat NIM otomatis?`)) return;
    setImporting(true);
    try {
      const response = await api.post("/api/v1/pmb/admin/students/import", buildFormData(), authConfig);
      setPreview(response.data);
      toast.success(response.data.message || "Mahasiswa baru berhasil diimpor");
      setFile(null);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Gagal mengimpor mahasiswa baru"));
    } finally {
      setImporting(false);
    }
  };

  const rows = preview?.rows || [];

  return (
    <div className="space-y-5">
      <Card className="border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-sky-50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-indigo-950 text-base">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600" /> Import Mahasiswa Baru dari Excel
              </CardTitle>
              <CardDescription className="mt-1 max-w-3xl text-xs leading-relaxed">
                Data akan dibuat sebagai akun mahasiswa SIAKAD sekaligus ditampilkan di Calon Mahasiswa dengan tanda <strong>Import Excel · Perlu dilengkapi</strong>. Admin dapat melengkapi status pembayaran, nilai/grade tes, dan SK secara manual.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open(TEMPLATE_URL, "_blank", "noopener,noreferrer")}
              className="border-indigo-300 text-indigo-700 hover:bg-indigo-100 font-bold text-xs shrink-0"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" /> Unduh Template Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-1 space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">File Excel</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 justify-start text-xs border-slate-300 bg-white"
                >
                  <Upload className="w-4 h-4 mr-2 text-indigo-600" /> Pilih File
                </Button>
                <input ref={fileRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={handleFileChange} />
              </div>
              <p className="text-[11px] text-slate-500 truncate" title={file?.name || "Belum ada file"}>
                {file?.name || "Belum ada file yang dipilih"}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Prodi Default (opsional)</Label>
              <select
                value={defaultProdiId}
                onChange={(event) => setDefaultProdiId(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">Gunakan kolom Prodi di Excel</option>
                {sortedPrograms.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.kode || program.code || program.id} — {program.nama || program.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">Dipakai bila kolom prodi_id/prodi_kode dikosongkan.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Password Default (opsional)</Label>
              <input
                type="text"
                value={defaultPassword}
                onChange={(event) => setDefaultPassword(event.target.value)}
                placeholder="Kosong = password sama dengan NIM"
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <p className="text-[11px] text-slate-500">Password pada baris Excel memiliki prioritas lebih tinggi.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={handlePreview} disabled={loading || importing || !file} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold">
              {loading ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
              {loading ? "Membaca Excel..." : "Preview & Validasi"}
            </Button>
            <Button type="button" onClick={handleImport} disabled={loading || importing || !preview?.valid_rows} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
              {importing ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5 mr-1.5" />}
              {importing ? "Mengimpor..." : "Import Mahasiswa Valid"}
            </Button>
          </div>

          <div className="flex gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-[11px] text-sky-900">
            <Info className="w-4 h-4 shrink-0 text-sky-600" />
            <p>NIM dikirim dari Excel bila diisi. Jika kosong, sistem membuat NIM otomatis berdasarkan periode aktif, kode Prodi, dan nomor urut yang belum dipakai.</p>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="border-b border-slate-100 py-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">Hasil Validasi Import</CardTitle>
                <CardDescription className="text-[11px]">Prefix periode NIM: <strong>{preview.year_prefix || "-"}</strong></CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px]">
                <Badge className="bg-slate-100 text-slate-700">Total {preview.total_rows ?? rows.length}</Badge>
                <Badge className="bg-emerald-100 text-emerald-800">Valid {preview.valid_rows ?? 0}</Badge>
                <Badge className="bg-rose-100 text-rose-800">Perlu diperbaiki {preview.invalid_rows ?? 0}</Badge>
                {preview.created !== undefined && <Badge className="bg-indigo-100 text-indigo-800">Terimpor {preview.created}</Badge>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[430px] overflow-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="text-[11px]">Baris</TableHead>
                    <TableHead className="text-[11px]">Status</TableHead>
                    <TableHead className="text-[11px]">NIM</TableHead>
                    <TableHead className="text-[11px]">Nama</TableHead>
                    <TableHead className="text-[11px]">Prodi</TableHead>
                    <TableHead className="text-[11px]">Email</TableHead>
                    <TableHead className="text-[11px]">Keterangan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={`${row.row || index}-${row.nim || index}`} className="text-xs">
                      <TableCell className="text-slate-500">{row.row || index + 1}</TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell className="font-mono font-bold text-indigo-700">{row.nim || "-"}</TableCell>
                      <TableCell className="font-semibold text-slate-900">{row.nama || "-"}</TableCell>
                      <TableCell>{row.prodi || "-"}</TableCell>
                      <TableCell className="text-slate-600">{row.email || "-"}</TableCell>
                      <TableCell className={row.status === "error" ? "text-rose-700" : "text-slate-500"}>
                        {row.message || (row.status === "imported" ? "Akun mahasiswa dibuat" : "Siap diimpor")}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!rows.length && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-slate-500">Tidak ada data pada file.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {(preview.invalid_rows || 0) > 0 && (
              <div className="flex items-center gap-2 border-t border-rose-100 bg-rose-50 p-3 text-[11px] text-rose-800">
                <AlertCircle className="w-4 h-4 shrink-0" /> Baris bermasalah tidak akan dibuat. Perbaiki file lalu lakukan preview ulang.
              </div>
            )}
            {preview.created > 0 && (
              <div className="flex items-center gap-2 border-t border-emerald-100 bg-emerald-50 p-3 text-[11px] text-emerald-800">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Mahasiswa sudah masuk ke SIAKAD dan siap digunakan untuk analisis akademik.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
