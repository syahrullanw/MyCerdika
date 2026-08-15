import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { apiErrorMessage } from "@/lib/utils";
import {
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Video,
  X,
} from "lucide-react";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") || window.location.origin;
const api = axios.create({ baseURL: BACKEND_URL });

const EMPTY_FORM = {
  title: "",
  description: "",
  start_at: "",
  end_at: "",
  capacity: 10,
  status: "active",
};

function toLocalInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function toIso(local) {
  return local ? new Date(local).toISOString() : "";
}

function formatSlot(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" });
}

function stateClass(state) {
  if (state === "open") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (state === "not_started") return "bg-amber-100 text-amber-800 border-amber-300";
  if (state === "expired") return "bg-slate-100 text-slate-600 border-slate-300";
  return "bg-rose-100 text-rose-800 border-rose-300";
}

export function PmbInterviewSchedulesTab({ token }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/v1/pmb/admin/interview-schedules", authHeaders);
      if (res.data?.ok) setSchedules(res.data.schedules || []);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal memuat jadwal wawancara"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (schedule) => {
    setEditingId(schedule.id);
    setForm({
      title: schedule.title || "",
      description: schedule.description || "",
      start_at: toLocalInput(schedule.start_at),
      end_at: toLocalInput(schedule.end_at),
      capacity: schedule.capacity || 10,
      status: schedule.status || "active",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.start_at || !form.end_at) {
      toast.error("Nama slot dan rentang waktu wajib diisi");
      return;
    }
    if (new Date(form.end_at) <= new Date(form.start_at)) {
      toast.error("Waktu selesai harus setelah waktu mulai");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      start_at: toIso(form.start_at),
      end_at: toIso(form.end_at),
      capacity: Number(form.capacity) || 1,
      status: form.status,
    };
    try {
      if (editingId) {
        await api.put(`/api/v1/pmb/admin/interview-schedules/${editingId}`, payload, authHeaders);
        toast.success("Jadwal wawancara berhasil diperbarui");
      } else {
        await api.post("/api/v1/pmb/admin/interview-schedules", payload, authHeaders);
        toast.success("Jadwal dibuat dan link Google Meet berhasil digenerate");
      }
      setShowModal(false);
      await fetchSchedules();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal menyimpan jadwal wawancara"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (schedule) => {
    if (!window.confirm(`Hapus slot wawancara “${schedule.title}”?`)) return;
    try {
      await api.delete(`/api/v1/pmb/admin/interview-schedules/${schedule.id}`, authHeaders);
      toast.success("Jadwal wawancara dihapus");
      fetchSchedules();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Jadwal tidak dapat dihapus"));
    }
  };

  const copyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url || "");
      toast.success("Link Google Meet disalin");
    } catch (_) {
      toast.error("Gagal menyalin link");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-indigo-200 bg-gradient-to-r from-indigo-50 to-sky-50 shadow-sm">
        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-indigo-950 text-sm">Pengaturan Jadwal Wawancara</h3>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                Setiap slot akan dibuatkan ruang Google Meet otomatis. Link selalu terlihat oleh admin, tetapi baru ditampilkan kepada camaba pada hari wawancara.
              </p>
            </div>
          </div>
          <Button type="button" onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shrink-0">
            <Plus className="w-4 h-4 mr-1.5" /> Tambah Jadwal
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="py-4 border-b border-slate-100 flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-indigo-600" /> Daftar Slot Wawancara
            </CardTitle>
            <CardDescription className="text-[11px] mt-1">Atur kuota dan pantau camaba yang sudah memilih jadwal.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={fetchSchedules} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Segarkan
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[980px]">
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Slot Wawancara</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Kuota</TableHead>
                <TableHead>Link Google Meet</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && schedules.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-xs text-slate-500">Belum ada jadwal wawancara.</TableCell></TableRow>
              )}
              {schedules.map((schedule) => (
                <TableRow key={schedule.id} className="align-top">
                  <TableCell className="py-3">
                    <p className="font-bold text-slate-900 text-xs">{schedule.title}</p>
                    <p className="text-[11px] text-indigo-700 font-semibold mt-1">{formatSlot(schedule.start_at)}</p>
                    <p className="text-[10px] text-slate-500">s.d. {new Date(schedule.end_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</p>
                    {schedule.description && <p className="text-[10px] text-slate-500 mt-1 max-w-sm">{schedule.description}</p>}
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge className={`${stateClass(schedule.state)} border text-[10px] font-bold`}>{schedule.state_label}</Badge>
                    {schedule.status !== "active" && <p className="text-[10px] text-slate-500 mt-1 capitalize">Status: {schedule.status}</p>}
                  </TableCell>
                  <TableCell className="py-3 text-center">
                    <p className="font-black text-indigo-700">{schedule.assigned_count} / {schedule.capacity}</p>
                    <p className="text-[10px] text-slate-500">tersedia {schedule.available_count}</p>
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-1.5 max-w-[330px]">
                      <a href={schedule.meeting_url} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-700 font-mono truncate hover:underline">
                        {schedule.meeting_url || "Link belum tersedia"}
                      </a>
                      {schedule.meeting_url && (
                        <>
                          <Button type="button" variant="ghost" size="sm" onClick={() => copyLink(schedule.meeting_url)} className="h-6 w-6 p-0 shrink-0"><Copy className="w-3.5 h-3.5" /></Button>
                          <a href={schedule.meeting_url} target="_blank" rel="noreferrer" className="text-indigo-600 shrink-0"><ExternalLink className="w-3.5 h-3.5" /></a>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button type="button" variant="outline" size="sm" onClick={() => openEdit(schedule)} className="text-[10px] h-7 px-2"><Pencil className="w-3 h-3 mr-1" /> Ubah</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => handleDelete(schedule)} className="text-[10px] h-7 px-2 text-rose-700 border-rose-200 hover:bg-rose-50" disabled={schedule.assigned_count > 0}><Trash2 className="w-3 h-3 mr-1" /> Hapus</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-700 to-sky-700 p-4 text-white flex items-center justify-between">
              <div><h4 className="font-bold text-sm">{editingId ? "Ubah Jadwal Wawancara" : "Tambah Jadwal Wawancara"}</h4><p className="text-[10px] text-indigo-100 mt-0.5">Link Google Meet dibuat otomatis saat disimpan</p></div>
              <button type="button" onClick={() => setShowModal(false)} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div><Label className="text-xs font-bold">Nama Slot *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Wawancara Gelombang 1 - Sesi Pagi" className="mt-1 text-xs" /></div>
              <div><Label className="text-xs font-bold">Keterangan / Instruksi</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Siapkan kartu identitas dan koneksi internet stabil" className="mt-1 text-xs" /></div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><Label className="text-xs font-bold">Mulai *</Label><Input type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} className="mt-1 text-xs" /></div>
                <div><Label className="text-xs font-bold">Selesai *</Label><Input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} className="mt-1 text-xs" /></div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><Label className="text-xs font-bold">Kuota Camaba *</Label><Input type="number" min="1" max="500" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="mt-1 text-xs" /></div>
                <div><Label className="text-xs font-bold">Status</Label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold"><option value="active">Aktif dan tampil ke camaba</option><option value="draft">Draft</option><option value="closed">Tidak Aktif</option></select></div>
              </div>
              <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-[10px] text-sky-900 leading-relaxed"><Video className="w-3.5 h-3.5 inline mr-1" /> Pastikan integrasi Google Meet di Pengaturan Kampus sudah aktif. Link tidak perlu diinput manual.</div>
              <div className="flex justify-end gap-2 pt-2 border-t"><Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>Batal</Button><Button type="button" size="sm" onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">{saving ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />} {saving ? "Menyimpan..." : "Simpan Jadwal"}</Button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
