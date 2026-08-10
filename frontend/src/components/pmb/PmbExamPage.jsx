import React, { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import {
  Timer,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Send,
  Clock,
  MonitorSmartphone,
  Loader2,
} from "lucide-react";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") || window.location.origin;
const api = axios.create({ baseURL: BACKEND_URL });

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function PmbExamPage({ token, authToken, sessionId, onExit }) {
  const [phase, setPhase] = useState("token"); // token | loading | exam | result | blocked
  const [tokenInput, setTokenInput] = useState(token || "");
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [violationTotal, setViolationTotal] = useState(0);
  const [violationGrace, setViolationGrace] = useState(30);
  const [inViolation, setInViolation] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  const answersRef = useRef(answers);
  const examRef = useRef(exam);
  const violationTotalRef = useRef(0);
  const inViolationRef = useRef(false);
  const exitedAtRef = useRef(null);
  const finishingRef = useRef(false);
  const confirmingRef = useRef(false);
  const phaseRef = useRef(phase);
  const currentIndexRef = useRef(0);

  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { examRef.current = exam; }, [exam]);
  useEffect(() => { violationTotalRef.current = violationTotal; }, [violationTotal]);
  useEffect(() => { inViolationRef.current = inViolation; }, [inViolation]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  const submitExam = useCallback(async (answersToSubmit, auto = false) => {
    const currentExam = examRef.current;
    if (!currentExam || finishingRef.current) return;
    finishingRef.current = true;
    setPhase("loading");
    try {
      const res = await api.post(
        "/api/v1/pmb/cbt/finish",
        { attempt_id: currentExam.attempt_id, answers: answersToSubmit, auto_submitted: auto },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      setResult(res.data);
      setPhase("result");
      try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (_) {}
    } catch (err) {
      finishingRef.current = false;
      setPhase("exam");
      toast.error(err.response?.data?.detail || "Gagal mengumpulkan ujian, coba lagi.");
    }
  }, [authToken]);

  const handleViolationExit = useCallback(async () => {
    const currentExam = examRef.current;
    if (!currentExam || finishingRef.current) return;
    if (inViolationRef.current) return;
    inViolationRef.current = true;
    setInViolation(true);
    exitedAtRef.current = Date.now();
    try {
      await api.post(
        "/api/v1/pmb/cbt/violation",
        { attempt_id: currentExam.attempt_id, event: "exit" },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
    } catch (_) {}
  }, [authToken]);

  const handleViolationEnter = useCallback(async () => {
    const currentExam = examRef.current;
    if (!currentExam || finishingRef.current) return;
    if (!inViolationRef.current) return;
    const total = violationTotalRef.current + (Date.now() - (exitedAtRef.current || Date.now())) / 1000;
    inViolationRef.current = false;
    exitedAtRef.current = null;
    setInViolation(false);
    setViolationTotal(total);
    violationTotalRef.current = total;
    try {
      await api.post(
        "/api/v1/pmb/cbt/violation",
        { attempt_id: currentExam.attempt_id, event: "enter" },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
    } catch (_) {}
  }, [authToken]);

  const startExam = useCallback(async () => {
    setStarting(true);
    try {
      const res = await api.post(
        "/api/v1/pmb/cbt/start",
        { session_id: sessionId, token: tokenInput.trim() },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      const data = res.data;
      const savedAnswers = data.answers || {};
      setAnswers(savedAnswers);
      answersRef.current = savedAnswers;
      setExam(data);
      examRef.current = data;
      setCurrentIndex(0);
      setViolationTotal(0);
      violationTotalRef.current = 0;
      setViolationGrace(data.violation_grace_seconds || 30);
      setTimeLeft(Math.max(0, (new Date(data.deadline_at).getTime() - Date.now()) / 1000));
      setPhase("exam");
      requestFullscreen();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal memulai ujian. Periksa token Anda.");
      setPhase("token");
    } finally {
      setStarting(false);
    }
  }, [authToken, tokenInput, sessionId]);

  const requestFullscreen = () => {
    try {
      const el = document.documentElement;
      const p = el.requestFullscreen
        ? el.requestFullscreen()
        : el.webkitRequestFullscreen
        ? el.webkitRequestFullscreen()
        : el.msRequestFullscreen && el.msRequestFullscreen();
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
  };

  const confirmAndSubmit = () => {
    confirmingRef.current = true;
    const ok = window.confirm("Kumpulkan jawaban sekarang?");
    confirmingRef.current = false;
    if (!ok) return;
    submitExam(answersRef.current, false);
  };

  // Autosave setiap 5 detik selama ujian
  useEffect(() => {
    if (phase !== "exam") return;
    const iv = setInterval(async () => {
      const currentExam = examRef.current;
      if (!currentExam || finishingRef.current) return;
      try {
        await api.post(
          "/api/v1/pmb/cbt/save",
          { attempt_id: currentExam.attempt_id, answers: answersRef.current },
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
      } catch (_) {}
    }, 5000);
    return () => clearInterval(iv);
  }, [phase, authToken]);

  // Timer utama + deteksi violation countdown
  useEffect(() => {
    if (phase !== "exam") return;
    const iv = setInterval(() => {
      const currentExam = examRef.current;
      if (!currentExam || finishingRef.current) return;
      const remaining = (new Date(currentExam.deadline_at).getTime() - Date.now()) / 1000;
      setTimeLeft(remaining);

      let total = violationTotalRef.current;
      if (inViolationRef.current && exitedAtRef.current) {
        total += (Date.now() - exitedAtRef.current) / 1000;
      }
      if (total >= (currentExam.violation_grace_seconds || 30)) {
        submitExam(answersRef.current, true);
        return;
      }
      if (remaining <= 0) {
        submitExam(answersRef.current, true);
        return;
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [phase, submitExam]);

  // Deteksi fullscreen, blur, visibility
  useEffect(() => {
    if (phase !== "exam") return;

    const onFullscreenChange = () => {
      if (phaseRef.current !== "exam") return;
      const fs = document.fullscreenElement || document.webkitFullscreenElement;
      if (!fs) {
        if (finishingRef.current || confirmingRef.current) return;
        handleViolationExit();
      } else {
        handleViolationEnter();
      }
    };

    const onBlur = () => {
      if (phaseRef.current !== "exam") return;
      if (finishingRef.current || confirmingRef.current) return;
      if (!document.hidden) {
        handleViolationExit();
      }
    };
    const onVisibility = () => {
      if (phaseRef.current !== "exam") return;
      if (finishingRef.current || confirmingRef.current) return;
      if (document.hidden) handleViolationExit();
      else handleViolationEnter();
    };
    const onKeyDown = (e) => {
      if (phaseRef.current !== "exam") return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "w" || e.key === "t" || e.key === "r")) {
        e.preventDefault();
      }
    };
    const onContextMenu = (e) => {
      if (phaseRef.current === "exam") e.preventDefault();
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", () => {
      if (phaseRef.current === "exam" && examRef.current && !finishingRef.current) {
        try {
          navigator.sendBeacon(`${BACKEND_URL}/api/v1/pmb/cbt/save`, new Blob(
            [JSON.stringify({ attempt_id: examRef.current.attempt_id, answers: answersRef.current })],
            { type: "application/json" }
          ));
        } catch (_) {}
      }
    });
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("contextmenu", onContextMenu);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [phase, handleViolationExit, handleViolationEnter]);

  const saveAnswer = (qid, value) => {
    const next = { ...answersRef.current, [qid]: value };
    setAnswers(next);
    answersRef.current = next;
  };

  // ---------------- PHASE: TOKEN ----------------
  if (phase === "token") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-slate-700 bg-slate-900 text-white shadow-2xl">
          <CardContent className="p-6 space-y-5">
            <div className="text-center space-y-1.5">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center">
                <MonitorSmartphone className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-lg font-bold text-white">Pelaksanaan Tes Online CBT</h2>
              <p className="text-xs text-slate-400">
                Masukkan token ujian yang diberikan panitia PMB untuk memulai. Halaman akan masuk mode layar penuh.
              </p>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/30 p-3">
                <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                <p className="text-xs text-rose-300">{error}</p>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Token Ujian</label>
              <Input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                placeholder="cth: QYYXRYVE"
                className="bg-slate-800 border-slate-700 text-white text-lg tracking-widest text-center font-bold"
                maxLength={20}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && startExam()}
              />
            </div>
            <Button
              onClick={startExam}
              disabled={starting || tokenInput.trim().length < 4}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-12"
            >
              {starting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Maximize2 className="w-4 h-4 mr-2" />}
              {starting ? "Memulai Ujian..." : "Mulai Ujian Sekarang"}
            </Button>
            <Button variant="ghost" onClick={onExit} className="w-full text-slate-400 hover:text-white">
              Kembali ke Portal
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------- PHASE: RESULT ----------------
  if (phase === "result" && result) {
    const passed = Boolean(result.passed);
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-slate-700 bg-slate-900 text-white shadow-2xl">
          <CardContent className="p-6 space-y-5 text-center">
            <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${passed ? "bg-emerald-500/20" : "bg-rose-500/20"}`}>
              {passed ? (
                <CheckCircle2 className="w-9 h-9 text-emerald-400" />
              ) : (
                <XCircle className="w-9 h-9 text-rose-400" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-black text-white">{passed ? "Ujian Selesai & Dinyatakan LULUS" : "Ujian Selesai"}</h2>
              <p className="text-xs text-slate-400 mt-1">{result.message}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Nilai</p>
                <p className={`text-3xl font-black ${passed ? "text-emerald-400" : "text-rose-400"}`}>{result.score}</p>
                <p className="text-[10px] text-slate-500">Passing grade {result.passing_grade}</p>
              </div>
              <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Benar</p>
                <p className="text-3xl font-black text-white">{result.correct_count}<span className="text-sm text-slate-500">/{result.total_count}</span></p>
                <p className="text-[10px] text-slate-500">Soal terjawab</p>
              </div>
            </div>

            {result.flagged && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-left">
                <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-300">
                  Ujian ditandai <b>mencurigakan</b> karena terdeteksi keluar layar penuh. Hubungi panitia PMB untuk token ujian ulang (retake) bila perlu.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Button onClick={onExit} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                Kembali ke Portal PMB
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------- PHASE: BLOCKED ----------------
  if (phase === "blocked") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-slate-700 bg-slate-900 text-white shadow-2xl">
          <CardContent className="p-6 space-y-4 text-center">
            <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto" />
            <h2 className="text-lg font-bold text-white">Ujian Ditutup</h2>
            <p className="text-xs text-slate-400">{error}</p>
            <Button onClick={onExit} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
              Kembali ke Portal
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------- PHASE: EXAM ----------------
  const questions = exam?.questions || [];
  const q = questions[currentIndex] || null;
  const answeredCount = Object.keys(answers).filter((k) => (answers[k] || "").trim() !== "").length;
  const displayedViolation = inViolation && exitedAtRef.current
    ? violationTotal + (Date.now() - exitedAtRef.current) / 1000
    : violationTotal;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Violation overlay: wajib kembali ke layar penuh */}
      {inViolation && phase === "exam" && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur flex items-center justify-center p-6">
          <div className="w-full max-w-lg bg-slate-900 border border-rose-500/50 rounded-2xl p-8 text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-600 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-black text-rose-100">Anda Keluar dari Layar Penuh</h3>
              <p className="text-sm text-rose-200/80 mt-1">Kembali ke mode layar penuh untuk melanjutkan ujian. Ujian tetap berjalan di latar belakang.</p>
            </div>
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4">
              <p className="text-[11px] uppercase tracking-widest text-rose-300 font-semibold">Sisa Waktu Toleransi</p>
              <p className="font-mono text-4xl font-black text-rose-100">{Math.max(0, Math.ceil(violationGrace - displayedViolation))} detik</p>
              <p className="text-[11px] text-rose-300/80 mt-1">Ujian dikumpulkan otomatis jika waktu toleransi habis.</p>
            </div>
            <Button
              onClick={requestFullscreen}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-6 text-base"
            >
              <Maximize2 className="w-5 h-5 mr-2" /> Kembali ke Ujian (Layar Penuh)
            </Button>
          </div>
        </div>
      )}
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <MonitorSmartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{exam?.session_title || "Ujian CBT"}</p>
              <p className="text-[10px] text-slate-400">
                {answeredCount}/{questions.length} terjawab
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`font-mono text-sm px-3 py-1 ${timeLeft <= 60 ? "bg-rose-600 border-rose-500" : "bg-slate-800 text-emerald-400 border-slate-600"}`}>
              <Clock className="w-3.5 h-3.5 mr-1.5" />
              {formatTime(timeLeft)}
            </Badge>
            <Badge className={`font-mono text-xs px-2.5 py-1 ${displayedViolation >= violationGrace ? "bg-rose-600 border-rose-500" : "bg-slate-800 text-amber-300 border-slate-600"}`}>
              <ShieldAlert className="w-3 h-3 mr-1" />
              {Math.round(displayedViolation)}/{violationGrace}s
            </Badge>
          </div>
        </div>
        {inViolation && (
          <div className="max-w-5xl mx-auto mt-2 rounded-lg bg-rose-500/15 border border-rose-500/40 px-3 py-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <p className="text-[11px] text-rose-200">
              Anda meninggalkan layar penuh! Kembali segera. Ujian akan otomatis dikumpulkan bila melebihi {Math.max(0, Math.ceil(violationGrace - displayedViolation))} detik.
            </p>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-5 grid md:grid-cols-[1fr_200px] gap-5">
        {/* Question */}
        <div className="space-y-4">
          {q ? (
            <Card className="border-slate-700 bg-slate-900 text-white shadow-xl">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-indigo-400 text-[10px] font-bold border-indigo-600">
                    Soal {currentIndex + 1} dari {questions.length}
                  </Badge>
                  <div className="flex items-center gap-1.5">
                    {q.q_type === "isian" ? (
                      <Badge className="bg-violet-600 text-white text-[10px]">Isian Singkat</Badge>
                    ) : (
                      <Badge className="bg-indigo-600 text-white text-[10px]">Pilihan Ganda</Badge>
                    )}
                    <span className="text-[10px] text-slate-500 font-semibold">{q.category}</span>
                  </div>
                </div>
                <p className="font-bold text-base leading-relaxed">{q.question}</p>

                {q.q_type === "isian" ? (
                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Jawaban Anda</label>
                    <Input
                      value={answers[q.id] || ""}
                      onChange={(e) => saveAnswer(q.id, e.target.value)}
                      placeholder="Ketik jawaban singkat..."
                      className="bg-slate-800 border-slate-600 text-white"
                    />
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {(q.options || []).map((opt, oi) => {
                      const selected = (answers[q.id] || "") === opt.key;
                      return (
                        <button
                          key={`${q.id}-${opt.key}-${oi}`}
                          type="button"
                          onClick={() => saveAnswer(q.id, opt.key)}
                          className={`w-full text-left rounded-xl border-2 px-4 py-3 text-sm transition ${
                            selected
                              ? "border-indigo-500 bg-indigo-500/15 text-white"
                              : "border-slate-700 bg-slate-800/60 text-slate-200 hover:border-slate-500"
                          }`}
                        >
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full mr-2 font-bold text-xs ${selected ? "bg-indigo-500 text-white" : "bg-slate-700 text-slate-300"}`}>
                            {opt.key}
                          </span>
                          {opt.text}
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {/* Nav buttons */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              variant="outline"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              className="border-slate-600 text-white hover:bg-slate-800"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Sebelumnya
            </Button>
            <div className="flex gap-2">
              {currentIndex === questions.length - 1 ? (
                <Button
                  onClick={confirmAndSubmit}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  <Send className="w-4 h-4 mr-1.5" /> Kumpulkan
                </Button>
              ) : (
                <Button
                  onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  Berikutnya <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Question navigator */}
        <div className="order-first md:order-last">
          <Card className="border-slate-700 bg-slate-900 text-white sticky top-24">
            <CardContent className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-3">Navigasi Soal</p>
              <div className="grid grid-cols-5 gap-1.5">
                {questions.map((item, idx) => {
                  const answered = (answers[item.id] || "").trim() !== "";
                  const active = idx === currentIndex;
                  return (
                    <button
                      key={`nav-${item.id}-${idx}`}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={`aspect-square rounded-lg text-xs font-bold flex items-center justify-center transition ${
                        active
                          ? "bg-indigo-600 text-white ring-2 ring-indigo-400"
                          : answered
                            ? "bg-emerald-600/80 text-white"
                            : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 space-y-1.5 text-[10px] text-slate-400">
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-600/80 inline-block" /> Terjawab</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-800 border border-slate-700 inline-block" /> Belum dijawab</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-600 inline-block" /> Sedang dikerjakan</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-700 bg-slate-900 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <Timer className="w-3.5 h-3.5" />
            Waktu berjalan otomatis. Jangan tutup tab atau keluar layar penuh.
          </div>
          <Button
            variant="outline"
            onClick={confirmAndSubmit}
            className="border-emerald-600 text-emerald-400 hover:bg-emerald-600/10"
          >
            <Send className="w-3.5 h-3.5 mr-1" /> Kumpulkan Ujian
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PmbExamPage;
