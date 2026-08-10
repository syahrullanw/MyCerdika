/**
 * StudentAttendanceComponents.jsx
 * Presensi Mahasiswa — tampilan ringkas khusus akun mahasiswa:
 * kartu kelas + % kehadiran, klaim presensi sesi aktif (PIN/QR),
 * dan riwayat 16 pertemuan dalam satu layar.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  CheckCircle2,
  Lock,
  Search,
  GraduationCap,
  CalendarDays,
  ArrowLeft,
  Key,
  QrCode,
  Clock,
  Loader2,
  RefreshCw,
  UserCheck,
  AlertTriangle,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") || window.location.origin;

const STATUS_STYLE = {
  Hadir: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Izin: "bg-blue-100 text-blue-700 border-blue-200",
  Sakit: "bg-amber-100 text-amber-700 border-amber-200",
  Alpa: "bg-rose-100 text-rose-700 border-rose-200",
};

const STATUS_DOT = {
  Hadir: "bg-emerald-500",
  Izin: "bg-blue-500",
  Sakit: "bg-amber-500",
  Alpa: "bg-rose-500",
};

function formatCountdown(expStr) {
  if (!expStr) return "";
  const diff = Date.parse(expStr) - Date.now();
  if (diff <= 0) return "Kedaluwarsa";
  const totalSec = Math.floor(diff / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(String(v).includes("T") ? v : `${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export function StudentAttendancePage({ data, token, user }) {
  const classes = data?.classes || [];
  const [searchQ, setSearchQ] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [attByClass, setAttByClass] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [claimTab, setClaimTab] = useState("pin");
  const [qrInput, setQrInput] = useState("");
  const [qrScanning, setQrScanning] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const scannerRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadAttendance = useCallback(
    async (classId) => {
      try {
        const res = await fetch(`${API_BASE}/api/classes/${classId}/attendance`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Gagal memuat presensi");
        setAttByClass((prev) => ({ ...prev, [classId]: data }));
      } catch (e) {
        setError(e?.message || "Gagal memuat data presensi");
      }
    },
    [token],
  );

  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    Promise.all(
      (classes || []).map(async (c) => {
        try {
          const res = await fetch(`${API_BASE}/api/classes/${c.id}/attendance`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const d = await res.json();
          if (res.ok) return [c.id, d];
          return [c.id, null];
        } catch {
          return [c.id, null];
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setAttByClass(Object.fromEntries(entries));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [classes, token]);

  const filteredClasses = useMemo(() => {
    if (!searchQ.trim()) return classes;
    const q = searchQ.toLowerCase().trim();
    return classes.filter(
      (c) =>
        (c.course_name || "").toLowerCase().includes(q) ||
        (c.name || "").toLowerCase().includes(q) ||
        (c.program_name || "").toLowerCase().includes(q),
    );
  }, [classes, searchQ]);

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const attData = selectedClassId ? attByClass[selectedClassId] : null;

  const myRow = (att) => {
    const rows = att?.recap || [];
    if (!rows.length) return null;
    return (
      rows.find((r) => r.student_id === user?.id) ||
      rows.find((r) => r.student_nim && r.student_nim === user?.nim) ||
      rows.find((r) => String(r.student_nim || "").trim() === String(user?.username || "").trim()) ||
      null
    );
  };

  const openSession = (att) =>
    (att?.meetings || []).find((m) => m.status === "open" && !m.locked) || null;

  const mySessionStatus = (att, meetingNo) => {
    const m = (att?.meetings || []).find((x) => x.meeting_number === meetingNo);
    const rec = (m?.records || []).find(
      (r) => r.student_id === user?.id || r.student_nim === user?.nim,
    );
    return rec?.status || "";
  };

  const claimPin = async (e) => {
    e.preventDefault();
    if (!pinInput.trim()) {
      setError("Masukkan PIN presensi dari dosen.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/classes/${selectedClassId}/attendance/submit-pin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ meeting_number: openSession(attData).meeting_number, pin_code: pinInput.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "PIN salah atau sesi ditutup");
      setPinInput("");
      setNotice(d.message || "Presensi berhasil!");
      await loadAttendance(selectedClassId);
    } catch (e2) {
      setError(e2?.message || "Presensi gagal");
    } finally {
      setBusy(false);
    }
  };

  const claimQr = async (content) => {
    const raw = String(content || "").trim();
    if (!raw) {
      setError("Kode QR kosong.");
      return;
    }
    const parts = raw.split(":");
    if (parts.length !== 4 || parts[0] !== "QRATT") {
      setError("Kode bukan QR presensi aplikasi ini.");
      return;
    }
    if (parts[1] !== selectedClassId) {
      setError("QR presensi ini untuk kelas lain.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/classes/${selectedClassId}/attendance/submit-qr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ qr_content: raw }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "QR tidak valid atau sesi ditutup");
      setQrInput("");
      stopScanner();
      setNotice(d.message || "Presensi berhasil!");
      await loadAttendance(selectedClassId);
    } catch (e2) {
      setError(e2?.message || "Presensi gagal");
    } finally {
      setBusy(false);
    }
  };

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        await scanner.stop();
        scanner.clear();
      } catch {
        /* ignore */
      }
    }
  };

  useEffect(() => {
    if (!selectedClassId || claimTab !== "qr" || !openSession(attByClass[selectedClassId])) return;
    let cancelled = false;
    let scanner = null;
    const startScan = async () => {
      try {
        scanner = new Html5Qrcode("student-attendance-qr-reader", { verbose: false });
        scannerRef.current = scanner;
        setQrScanning(true);
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 200, height: 200 } },
          (decodedText) => {
            if (!cancelled) claimQr(decodedText);
          },
          () => {},
        );
      } catch {
        if (!cancelled) {
          setQrScanning(false);
          setError("Kamera tidak tersedia / izin ditolak. Gunakan opsi 'Ketik kode QR'.");
        }
      }
    };
    startScan();
    return () => {
      cancelled = true;
      setQrScanning(false);
      if (scanner) {
        scanner.stop().catch(() => {}).finally(() => scanner.clear().catch(() => {}));
      }
      scannerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimTab, selectedClassId, attByClass]);

  const summary = (() => {
    const row = myRow(attData) || {};
    return {
      hadir: row.hadir ?? 0,
      izin: row.izin ?? 0,
      sakit: row.sakit ?? 0,
      alpa: row.alpa ?? 0,
      percentage: row.percentage ?? 0,
      eligible: row.is_eligible_exam ?? false,
    };
  })();

  // ── VIEW 1: Daftar kelas ──────────────────────────────────────────────────
  if (!selectedClassId) {
    return (
      <div className="w-full space-y-5" data-testid="student-attendance-overview">
        <div>
          <p className="text-xs font-semibold tracking-wide text-indigo-600 uppercase">Presensi Kehadiran</p>
          <h2 className="text-xl font-bold text-slate-900">Presensi Saya</h2>
          <p className="text-sm text-slate-500">Lihat kehadiran per mata kuliah dan klaim presensi sesi yang sedang dibuka dosen.</p>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari mata kuliah..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat presensi Anda...
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            Tidak ada kelas aktif pada semester ini.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClasses.map((c) => {
              const att = attByClass[c.id];
              const row = myRow(att) || {};
              const pct = row.percentage ?? 0;
              const session = openSession(att);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedClassId(c.id);
                    setError("");
                    setNotice("");
                  }}
                  className="bg-white rounded-xl border border-slate-200 p-4 text-left shadow-sm hover:shadow-md hover:border-indigo-300 transition space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2">{c.course_name}</h3>
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                        <GraduationCap className="w-3 h-3" /> {c.program_name || "Prodi"} · Rombel {c.name || c.class_code}
                      </p>
                    </div>
                    {session ? (
                      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> BUKA
                      </span>
                    ) : (
                      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                        TUTUP
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-500">Kehadiran Anda</span>
                      <span className={`font-bold ${pct >= 75 ? "text-emerald-600" : "text-rose-600"}`}>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct >= 75 ? "bg-emerald-500" : "bg-rose-500"}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[11px]">
                      <span className="text-slate-400">
                        {row.hadir ?? 0} Hadir · {row.izin ?? 0} Izin · {row.sakit ?? 0} Sakit · {row.alpa ?? 0} Alpa
                      </span>
                      <span className={`font-semibold ${row.is_eligible_exam ? "text-emerald-600" : "text-rose-500"}`}>
                        {row.is_eligible_exam ? "Syarat ujian ✓" : "< 75%"}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── VIEW 2: Detail presensi kelas ─────────────────────────────────────────
  const session = openSession(attData);
  const todayStatus = session ? mySessionStatus(attData, session.meeting_number) : "";
  const meetings = attData?.meetings || Array.from({ length: 16 }, (_, i) => ({ meeting_number: i + 1, status: "draft", records: [] }));

  return (
    <div className="w-full space-y-5" data-testid="student-attendance-detail">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setSelectedClassId("");
            setClaimTab("pin");
            setPinInput("");
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg px-3 py-2 hover:bg-slate-50"
        >
          <ArrowLeft className="w-4 h-4" /> Semua Kelas
        </button>
        <div className="text-right">
          <div className="text-sm font-bold text-slate-900">{selectedClass?.course_name}</div>
          <div className="text-[11px] text-slate-500">
            {selectedClass?.program_name} · Rombel {selectedClass?.name || selectedClass?.class_code}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2.5 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-3 py-2.5 text-sm">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {notice}
        </div>
      )}

      {/* Presensi sekarang */}
      <div className={`rounded-xl border p-4 ${session ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"}`}>
        {session ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Presensi Sesi {session.meeting_number} Sedang Terbuka
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                <Clock className="w-3 h-3 inline-block align-middle mr-1" />
                Sisa: {formatCountdown(session.pin_expires_at || session.qr_expires_at)}
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Topik: {session.topic || `Pertemuan ${session.meeting_number}`} · {fmtDate(session.date)}
            </p>

            {todayStatus === "Hadir" ? (
              <div className="flex items-center gap-2 bg-emerald-600 text-white rounded-lg px-4 py-3 text-sm font-semibold">
                <CheckCircle2 className="w-5 h-5" /> Anda sudah terverifikasi hadir pada sesi ini.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold w-full max-w-xs">
                  <button
                    type="button"
                    onClick={() => setClaimTab("pin")}
                    className={`flex-1 py-2 flex items-center justify-center gap-1.5 ${
                      claimTab === "pin" ? "bg-emerald-600 text-white" : "bg-white text-slate-600"
                    }`}
                  >
                    <Key className="w-3.5 h-3.5" /> Masukkan PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => setClaimTab("qr")}
                    className={`flex-1 py-2 flex items-center justify-center gap-1.5 ${
                      claimTab === "qr" ? "bg-indigo-600 text-white" : "bg-white text-slate-600"
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" /> Scan QR
                  </button>
                </div>

                {claimTab === "pin" ? (
                  <form onSubmit={claimPin} className="flex gap-2 max-w-xs">
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="4 digit PIN"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      className="w-28 border border-slate-300 rounded-lg px-3 py-2 text-center font-mono font-bold text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg px-4 py-2 hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                      Klaim Hadir
                    </button>
                  </form>
                ) : (
                  <div className="space-y-2 max-w-sm">
                    <div
                      id="student-attendance-qr-reader"
                      className="w-full max-h-56 overflow-hidden rounded-lg border border-slate-200 bg-white"
                    />
                    {qrScanning && <p className="text-[11px] text-indigo-600">Kamera aktif... arahkan ke QR presensi.</p>}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="atau ketik kode QR"
                        value={qrInput}
                        onChange={(e) => setQrInput(e.target.value)}
                        className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => claimQr(qrInput)}
                        className="inline-flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg px-4 py-2 hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                        Klaim
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Tidak ada sesi presensi yang sedang berlangsung</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Saat dosen membuka presensi (PIN atau QR), formulir klaim akan muncul di sini.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Rekap saya */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Hadir", value: summary.hadir, cls: "text-emerald-600" },
          { label: "Izin", value: summary.izin, cls: "text-blue-600" },
          { label: "Sakit", value: summary.sakit, cls: "text-amber-600" },
          { label: "Alpa", value: summary.alpa, cls: "text-rose-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-3 text-center shadow-sm">
            <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
            <div className="text-[11px] text-slate-500 font-medium">{s.label}</div>
          </div>
        ))}
        <div className={`rounded-xl border p-3 text-center shadow-sm ${summary.eligible ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}>
          <div className={`text-2xl font-bold ${summary.eligible ? "text-emerald-600" : "text-rose-600"}`}>
            {summary.percentage}%
          </div>
          <div className={`text-[11px] font-semibold ${summary.eligible ? "text-emerald-700" : "text-rose-700"}`}>
            {summary.eligible ? "Syarat ujian ✓" : "Belum 75%"}
          </div>
        </div>
      </div>

      {/* Riwayat 16 sesi */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-indigo-600" /> Riwayat Presensi per Pertemuan
        </h3>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {meetings.map((m) => {
            const st = m.status === "open" && !m.locked ? "open" : mySessionStatus(attData, m.meeting_number) || "";
            return (
              <div
                key={m.meeting_number}
                className={`rounded-lg border px-2 py-2 text-center ${
                  st === "Hadir"
                    ? "bg-emerald-50 border-emerald-200"
                    : st === "Izin"
                    ? "bg-blue-50 border-blue-200"
                    : st === "Sakit"
                    ? "bg-amber-50 border-amber-200"
                    : st === "Alpa"
                    ? "bg-rose-50 border-rose-200"
                    : st === "open"
                    ? "bg-emerald-50 border-emerald-300"
                    : "bg-slate-50 border-slate-200"
                }`}
              >
                <div className="text-[10px] text-slate-500 font-medium">Sesi {m.meeting_number}</div>
                <div className="flex items-center justify-center gap-1 mt-0.5">
                  {st === "open" ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-bold text-emerald-700">BUKA</span>
                    </>
                  ) : st ? (
                    <>
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[st] || "bg-slate-400"}`} />
                      <span className="text-[10px] font-bold text-slate-700">{st}</span>
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-300">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Hadir</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Izin</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Sakit</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Alpa</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Sesi sedang buka</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => loadAttendance(selectedClassId)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Muat ulang data presensi
      </button>
    </div>
  );
}
