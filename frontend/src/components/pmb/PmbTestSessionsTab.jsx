import React, { useState, useEffect, useCallback } from "react";
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
  Plus,
  Trash2,
  Edit3,
  Copy,
  RefreshCw,
  KeyRound,
  Eye,
  EyeOff,
  MonitorSmartphone,
  X,
  CheckCircle2,
  Clock,
  ShieldAlert,
  RotateCcw,
  Globe,
  Building2,
  MapPin,
} from "lucide-react";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") || window.location.origin;
const api = axios.create({ baseURL: BACKEND_URL });

const EMPTY_FORM = {
  title: "",
  description: "",
  test_type: "all",
  room_name: "",
  start_at: "",
  end_at: "",
  duration_minutes: 45,
  passing_grade: 70,
  retake_allowed: true,
  shuffle: true,
  status: "active",
  violation_grace_seconds: 30,
};

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(local) {
  if (!local) return "";
  return new Date(local).toISOString();
}

function stateBadge(state) {
  const map = {
    open: { label: "Sedang Berlangsung", cls: "bg-emerald-600 text-white" },
    not_started: { label: "Belum Mulai", cls: "bg-amber-600 text-white" },
    expired: { label: "Berakhir", cls: "bg-slate-500 text-white" },
    inactive: { label: "Tidak Aktif", cls: "bg-slate-400 text-white" },
  };
  return map[state] || { label: state, cls: "bg-slate-400 text-white" };
}

export function PmbTestSessionsTab({ token }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showTokens, setShowTokens] = useState({});
  const [monitorSession, setMonitorSession] = useState(null);
  const [monitorData, setMonitorData] = useState(null);

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchSessions = useCallback(async () => {
    try {
      const res = await api.get("/api/v1/pmb/admin/test-sessions", authHeaders);
      if (res.data?.ok) setSessions(res.data.sessions || []);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal memuat sesi ujian"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const fetchMonitor = useCallback(async () => {
    if (!monitorSession) return;
    try {
      const res = await api.get(`/api/v1/pmb/admin/test-sessions/${monitorSession.id}/attempts`, authHeaders);
      if (res.data?.ok) setMonitorData(res.data);
    } catch (_) {}
  }, [monitorSession, token]);

  useEffect(() => {
    if (!monitorSession) return;
    fetchMonitor();
    const iv = setInterval(fetchMonitor, 10000);
    return () => clearInterval(iv);
  }, [monitorSession, fetchMonitor]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({
      title: s.title || "",
      description: s.description || "",
      test_type: s.test_type || "all",
      room_name: s.room_name || "",
      start_at: toLocalInput(s.start_at),
      end_at: toLocalInput(s.end_at),
      duration_minutes: s.duration_minutes || 45,
      passing_grade: s.passing_grade || 70,
      retake_allowed: s.retake_allowed !== false,
      shuffle: s.shuffle !== false,
      status: s.status || "active",
      violation_grace_seconds: s.violation_grace_seconds || 30,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.start_at || !form.end_at) {
      toast.error("Nama sesi dan jadwal wajib diisi");
      return;
    }
    if (new Date(form.end_at) <= new Date(form.start_at)) {
      toast.error("Jadwal berakhir harus setelah jadwal mulai");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      test_type: form.test_type || "all",
      room_name: (form.room_name || "").trim(),
      start_at: toIso(form.start_at),
      end_at: toIso(form.end_at),
      duration_minutes: parseInt(form.duration_minutes, 10) || 45,
      passing_grade: parseFloat(form.passing_grade) || 70,
      violation_grace_seconds: parseInt(form.violation_grace_seconds, 10) || 30,
    };
    try {
      if (editingId) {
        await api.put(`/api/v1/pmb/admin/test-sessions/${editingId}`, payload, authHeaders);
        toast.success("Sesi ujian diperbarui");
      } else {
        await api.post("/api/v1/pmb/admin/test-sessions", payload, authHeaders);
        toast.success("Sesi ujian dibuat. Bagikan token ke peserta.");
      }
      setShowModal(false);
      await fetchSessions();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal menyimpan sesi ujian"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s) => {
    if (!window.confirm(`Hapus sesi "${s.title}" beserta seluruh catatan ujian peserta?`)) return;
    try {
      await api.delete(`/api/v1/pmb/admin/test-sessions/${s.id}`, authHeaders);
      toast.success("Sesi ujian dihapus");
      fetchSessions();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal menghapus sesi"));
    }
  };

  const handleRegenerate = async (s, kind) => {
    const label = kind === "retake" ? "token ujian ulang (retake)" : "token ujian utama";
    if (!window.confirm(`Buat ${label} baru untuk sesi "${s.title}"? Token lama tidak berlaku lagi.`)) return;
    try {
      const res = await api.post(
        `/api/v1/pmb/admin/test-sessions/${s.id}/regenerate-token`,
        { kind },
        authHeaders
      );
      if (res.data?.ok) {
        toast.success(`Token baru: ${res.data.token}`);
        setShowTokens((prev) => ({ ...prev, [s.id]: true }));
        fetchSessions();
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal membuat token"));
    }
  };

  const copyToken = async (value) => {
    try {
      await navigator.clipboard.writeText(value || "");
      toast.success("Token disalin");
    } catch (_) {
      toast.error("Gagal menyalin token");
    }
  };

  const regenerate = (kind) => {
    if (monitorSession) handleRegenerate(monitorSession, kind);
  };

  const handleResetAttempt = async (a) => {
    if (!window.confirm(
      `Reset ujian untuk "${a.name}"? Seluruh percobaan (${a.attempt_count || 1}x) pada sesi ini akan dihapus dan peserta bisa mengikuti ujian dari awal dengan token utama.`
    )) return;
    try {
      const res = await api.post(
        `/api/v1/pmb/admin/test-sessions/${monitorSession.id}/attempts/${a.id}/reset`,
        {},
        authHeaders
      );
      if (res.data?.ok) {
        toast.success(res.data.message);
        fetchMonitor();
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal reset ujian peserta"));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  // ---------------- MONITORING MODE ----------------
  if (monitorSession) {
    const stats = monitorData?.stats;
    const rows = monitorData?.attempts || [];
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <MonitorSmartphone className="w-4 h-4 text-indigo-600" /> Monitoring: {monitorSession.title}
            </h3>
            <p className="text-[11px] text-slate-500">
              Diperbarui otomatis tiap 10 detik • Token utama:{" "}
              <button onClick={() => copyToken(monitorData?.session?.token)} className="font-mono font-bold text-indigo-600 hover:underline">
                {monitorData?.session?.token}
              </button>{" "}
              • Retake:{" "}
              <button onClick={() => copyToken(monitorData?.session?.retake_token)} className="font-mono font-bold text-amber-600 hover:underline">
                {monitorData?.session?.retake_token}
              </button>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={fetchMonitor}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Segarkan
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { regenerate("main"); }}>
              <KeyRound className="w-3.5 h-3.5 mr-1" /> Token Baru
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { regenerate("retake"); }}>
              <KeyRound className="w-3.5 h-3.5 mr-1 text-amber-600" /> Retake Baru
            </Button>
            <Button type="button" size="sm" onClick={() => setMonitorSession(null)}>
              <X className="w-3.5 h-3.5 mr-1" /> Tutup
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            ["Total Peserta", stats?.total || 0],
            ["Total Ujian", stats?.attempts_total || 0],
            ["Sedang Mengerjakan", stats?.running || 0],
            ["Selesai", stats?.finished || 0],
            ["Lulus", stats?.passed || 0],
            ["Mencurigakan", stats?.flagged || 0],
          ].map(([label, val]) => (
            <div key={label} className="rounded-xl bg-white border border-slate-200 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
              <p className={`text-2xl font-black ${label === "Mencurigakan" && val > 0 ? "text-amber-600" : "text-indigo-700"}`}>{val}</p>
            </div>
          ))}
        </div>

        <Card className="border-slate-200">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No</TableHead>
                  <TableHead>Peserta</TableHead>
                  <TableHead>No. Registrasi</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Mulai</TableHead>
                  <TableHead>Selesai</TableHead>
                  <TableHead>Nilai</TableHead>
                  <TableHead>Keluar Layar</TableHead>
                  <TableHead>Tanda</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-slate-400 py-8 text-xs">
                      Belum ada peserta yang mengikuti ujian pada sesi ini.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((a, idx) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs text-slate-500">{idx + 1}</TableCell>
                    <TableCell className="text-xs font-bold text-slate-900">
                      {a.name || "-"}
                      {a.is_retake && <Badge className="ml-1.5 bg-amber-100 text-amber-700 text-[9px]">RET</Badge>}
                      {a.attempt_count > 1 && (
                        <Badge className="ml-1.5 bg-slate-100 text-slate-600 text-[9px]">{a.attempt_count}x ujian</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-slate-600">{a.registration_number || "-"}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${
                        a.status === "running" ? "bg-amber-100 text-amber-700" :
                        a.status === "auto_submitted" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {a.status === "running" ? "Mengerjakan" : a.status === "auto_submitted" ? "Auto Submit" : "Selesai"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] text-slate-500">
                      {a.started_at ? new Date(a.started_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "-"}
                    </TableCell>
                    <TableCell className="text-[10px] text-slate-500">
                      {a.finished_at ? new Date(a.finished_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "-"}
                    </TableCell>
                    <TableCell className="text-xs font-black text-indigo-700">{a.score ?? "-"}</TableCell>
                    <TableCell className="text-[10px] text-slate-600">
                      {a.violation_total_seconds != null && a.violation_total_seconds > 0
                        ? <span className="text-amber-600 font-bold">{a.violation_total_seconds}s / {a.violation_grace_seconds}s</span>
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {a.flagged ? (
                        <Badge className="bg-amber-600 text-white text-[10px]"><ShieldAlert className="w-3 h-3 mr-1" /> Mencurigakan</Badge>
                      ) : a.passed ? (
                        <Badge className="bg-emerald-600 text-white text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" /> Lulus</Badge>
                      ) : a.status !== "running" ? (
                        <Badge className="bg-rose-600 text-white text-[10px]">Tidak Lulus</Badge>
                      ) : (
                        <span className="text-slate-400 text-[10px]">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleResetAttempt(a)}
                        className="text-[10px] text-rose-600 border-rose-200 hover:bg-rose-50"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" /> Reset Ujian
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------- LIST MODE ----------------
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <MonitorSmartphone className="w-4 h-4 text-indigo-600" /> Sesi Pelaksanaan Tes Online CBT ({sessions.length})
        </h3>
        <Button type="button" size="sm" onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs">
          <Plus className="w-3.5 h-3.5 mr-1" /> Buat Sesi Ujian
        </Button>
      </div>

      {sessions.length === 0 && (
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-10 text-center space-y-2">
            <p className="font-bold text-slate-900 text-sm">Belum Ada Sesi Ujian</p>
            <p className="text-xs text-slate-500">
              Buat sesi ujian pertama: tentukan jadwal, durasi, dan passing grade. Sistem akan otomatis membuat token ujian utama & token ujian ulang (retake).
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {sessions.map((s) => {
          const sb = stateBadge(s.state);
          const show = showTokens[s.id];
          return (
            <Card key={s.id} className="border-slate-200 bg-white">
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-900 text-sm">{s.title}</h4>
                      <Badge className={sb.cls}>{sb.label}</Badge>
                      <Badge variant="outline" className={
                        s.test_type === "online" ? "border-indigo-300 text-indigo-700 bg-indigo-50 font-bold text-[10px] inline-flex items-center gap-1" :
                        s.test_type === "offline" ? "border-emerald-300 text-emerald-700 bg-emerald-50 font-bold text-[10px] inline-flex items-center gap-1" :
                        "border-purple-300 text-purple-700 bg-purple-50 font-bold text-[10px] inline-flex items-center gap-1"
                      }>
                        {s.test_type === "online" ? (
                          <><Globe className="w-3 h-3" /> Ujian Online</>
                        ) : s.test_type === "offline" ? (
                          <><Building2 className="w-3 h-3" /> Ujian Offline</>
                        ) : (
                          <><Globe className="w-3 h-3" /><Building2 className="w-3 h-3" /> Online & Offline</>
                        )}
                      </Badge>
                      {s.room_name && (
                        <span className="text-[10px] text-slate-600 font-medium bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-500" /> {s.room_name}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{s.description || "-"}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setMonitorSession(s)} className="text-indigo-600 hover:bg-indigo-50">
                      <Eye className="w-3.5 h-3.5 mr-1" /> Monitor
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(s)} className="text-indigo-600 hover:bg-indigo-50">
                      <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleDelete(s)} className="text-rose-600 hover:bg-rose-50">
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Hapus
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                    <p className="text-[9px] uppercase text-slate-400 font-semibold">Jadwal</p>
                    <p className="font-semibold text-slate-800">
                      {s.start_at ? new Date(s.start_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "-"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                    <p className="text-[9px] uppercase text-slate-400 font-semibold">Durasi</p>
                    <p className="font-semibold text-slate-800">{s.duration_minutes} Menit</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                    <p className="text-[9px] uppercase text-slate-400 font-semibold">Passing Grade</p>
                    <p className="font-semibold text-slate-800">{s.passing_grade}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                    <p className="text-[9px] uppercase text-slate-400 font-semibold">Status Admin</p>
                    <p className="font-semibold text-slate-800 capitalize">{s.status}</p>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2 text-center">
                  {[
                    ["Total", s.stats?.total || 0],
                    ["Mengerjakan", s.stats?.running || 0],
                    ["Selesai", s.stats?.finished || 0],
                    ["Lulus", s.stats?.passed || 0],
                    ["Mencurigakan", s.stats?.flagged || 0],
                  ].map(([label, val]) => (
                    <div key={label} className="rounded-lg bg-indigo-50/60 border border-indigo-100 py-1.5">
                      <p className="text-sm font-black text-indigo-700">{val}</p>
                      <p className="text-[9px] text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-900 p-3">
                  <div className="flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Token:</span>
                    <span className="font-mono font-black text-white text-xs tracking-widest">{show ? s.token : "••••••••"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Retake:</span>
                    <span className="font-mono font-black text-amber-300 text-xs tracking-widest">{show ? s.retake_token : "••••••••"}</span>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowTokens((p) => ({ ...p, [s.id]: !p[s.id] }))} className="text-slate-300 hover:bg-slate-800">
                      {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => copyToken(s.token)} className="text-slate-300 hover:bg-slate-800">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleRegenerate(s, "main")} className="text-slate-300 hover:bg-slate-800">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Modal Buat/Edit Sesi */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <Card className="w-full max-w-lg border-slate-200 bg-white shadow-2xl max-h-[92vh] overflow-y-auto">
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="text-sm font-bold text-slate-900">
                {editingId ? "Edit Sesi Ujian CBT" : "Buat Sesi Ujian CBT"}
              </CardTitle>
              <CardDescription className="text-xs">Token ujian dibuat otomatis untuk sesi baru.</CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-slate-600">Nama Sesi *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="cth: Gelombang 1 — Sesi Pagi" className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-slate-600">Deskripsi</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Instruksi / keterangan sesi" className="text-sm" />
              </div>

              {/* Opsi Mode Ujian: Online & Offline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-slate-600">Pilihan Jalur Ujian *</Label>
                  <select
                    value={form.test_type || "all"}
                    onChange={(e) => setForm({ ...form, test_type: e.target.value })}
                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">Terbuka untuk Online & Offline</option>
                    <option value="online">Ujian Online (CBT Mandiri / Daring)</option>
                    <option value="offline">Ujian Offline (di Kampus / Laboratorium)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-slate-600">Ruangan / Lokasi Ujian (Opsional)</Label>
                  <Input
                    value={form.room_name || ""}
                    onChange={(e) => setForm({ ...form, room_name: e.target.value })}
                    placeholder="cth: Lab Komputer Kampus Lt. 2"
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-slate-600">Buka Ujian *</Label>
                  <Input type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-slate-600">Tutup Ujian *</Label>
                  <Input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} className="text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-slate-600">Durasi Pengerjaan (menit)</Label>
                  <Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-slate-600">Passing Grade</Label>
                  <Input type="number" value={form.passing_grade} onChange={(e) => setForm({ ...form, passing_grade: e.target.value })} className="text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-slate-600">Batas Keluar Layar (detik)</Label>
                  <Input type="number" value={form.violation_grace_seconds} onChange={(e) => setForm({ ...form, violation_grace_seconds: e.target.value })} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-slate-600">Status</Label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="active">Active (Berjalan)</option>
                    <option value="draft">Draft</option>
                    <option value="closed">Closed (Ditutup)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px] font-semibold text-slate-600">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.retake_allowed} onChange={(e) => setForm({ ...form, retake_allowed: e.target.checked })} className="h-4 w-4 rounded accent-indigo-600" />
                  Izinkan ujian ulang (retake)
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.shuffle} onChange={(e) => setForm({ ...form, shuffle: e.target.checked })} className="h-4 w-4 rounded accent-indigo-600" />
                  Acak soal & pilihan
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Batal</Button>
                <Button type="button" onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs">
                  {saving ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                  {editingId ? "Simpan Perubahan" : "Buat Sesi"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default PmbTestSessionsTab;
