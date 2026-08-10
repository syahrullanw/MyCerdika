import React, { useState, useEffect } from "react";
import axios from "axios";
import { PmbLandingPage } from "@/components/pmb/PmbLandingPage";
import { CamabaPortal } from "@/components/pmb/CamabaPortal";
import { PmbDirectRegisterModal } from "@/components/pmb/PmbDirectRegisterModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { apiErrorMessage, BACKEND_URL } from "@/lib/utils";
import { LogIn, X, GraduationCap, ArrowRight, Lock, UserCheck, School } from "lucide-react";

const SIAKAD_URL = (process.env.REACT_APP_SIAKAD_URL || "").replace(/\/+$/, "") || "http://localhost:3000";
const api = axios.create({ baseURL: BACKEND_URL });

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("pmb_camaba_token") || "");
  const [applicant, setApplicant] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("pmb_camaba_user") || "null");
    } catch (_) {
      return null;
    }
  });

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [selectedProdiForRegister, setSelectedProdiForRegister] = useState("");
  const [programs, setPrograms] = useState([]);
  const [branding, setBranding] = useState({ name: "POLITEKNIK SCI" });

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Check public config on mount from SIAKAD settings
  useEffect(() => {
    api.get("/api/settings/public")
      .then(({ data }) => {
        if (data) {
          setBranding((prev) => ({
            ...prev,
            campus_name: data.campus_name || prev.campus_name || "POLITEKNIK SCI",
            name: data.campus_name || data.app_name || prev.name || "POLITEKNIK SCI",
            app_name: data.app_name || prev.app_name || "POLITEKNIK SCI",
            campus_logo_url: data.campus_logo_url || prev.campus_logo_url || "",
            logo_url: data.campus_logo_url || prev.logo_url || "",
          }));
        }
      })
      .catch(() => {});

    api.get("/api/v1/pmb/public/config")
      .then(({ data }) => {
        if (data.ok) {
          setPrograms(data.programs || []);
          if (data.branding) {
            setBranding((prev) => ({
              ...prev,
              ...data.branding,
              campus_logo_url: data.branding.campus_logo_url || prev.campus_logo_url || "",
            }));
          }
        }
      })
      .catch(() => {});
  }, []);

  // Handle hash navigation
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash === "#login") {
        setShowLoginModal(true);
      } else if (hash === "#register") {
        setShowRegisterModal(true);
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const handleAuthSuccess = ({ token: newToken, user: newUser }) => {
    setToken(newToken);
    setApplicant(newUser);
    localStorage.setItem("pmb_camaba_token", newToken);
    localStorage.setItem("pmb_camaba_user", JSON.stringify(newUser));
    setShowLoginModal(false);
    setShowRegisterModal(false);
    toast.success(`Selamat datang, ${newUser?.name || "Calon Mahasiswa"}!`);
  };

  const handleLogout = () => {
    setToken("");
    setApplicant(null);
    localStorage.removeItem("pmb_camaba_token");
    localStorage.removeItem("pmb_camaba_user");
    window.location.hash = "";
    toast.info("Anda telah keluar dari Portal PMB");
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginIdentifier.trim() || !loginPassword) {
      toast.error("Harap isi email/NIK/No. WhatsApp dan password akun");
      return;
    }
    setLoginLoading(true);
    try {
      const res = await api.post("/api/v1/pmb/login", {
        identifier: loginIdentifier.trim(),
        password: loginPassword,
      });
      if (res.data.ok) {
        handleAuthSuccess({
          token: res.data.token,
          user: { ...res.data.applicant, role: "camaba" },
        });
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Login gagal. Periksa kembali data pendaftaran Anda."));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSwitchToSiakad = (applicantData) => {
    // Direct redirect to main SIAKAD portal with NIM
    const targetUrl = `${SIAKAD_URL}?nim=${encodeURIComponent(applicantData?.generated_nim || "")}#login`;
    window.location.href = targetUrl;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {token ? (
        <CamabaPortal
          token={token}
          onLogout={handleLogout}
          onSwitchToStudent={handleSwitchToSiakad}
          branding={branding}
        />
      ) : (
        <>
          <PmbLandingPage
            onOpenRegister={(prodiId) => {
              setSelectedProdiForRegister(prodiId || "");
              setShowRegisterModal(true);
            }}
            onOpenLogin={() => setShowLoginModal(true)}
            onAuth={handleAuthSuccess}
            branding={branding}
            onBackToSiakad={() => {
              window.location.href = SIAKAD_URL;
            }}
          />

          {/* Registration Modal */}
          <PmbDirectRegisterModal
            isOpen={showRegisterModal}
            onClose={() => setShowRegisterModal(false)}
            onAuth={handleAuthSuccess}
            defaultProdiId={selectedProdiForRegister}
            programs={programs}
          />

          {/* Login Modal */}
          {showLoginModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm animate-fade-in">
              <div className="w-full max-w-md bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-xl shadow-md">
                      <GraduationCap className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base leading-tight">
                        Login Calon Mahasiswa Baru
                      </h3>
                      <p className="text-xs text-slate-300">
                        Portal Penerimaan Mahasiswa Baru 2026/2027
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLoginModal(false)}
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-sm"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleLoginSubmit} className="p-6 space-y-4 text-xs">
                  <div>
                    <Label className="text-xs font-bold text-slate-700">Email / NIK / No. WhatsApp *</Label>
                    <Input
                      type="text"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      placeholder="Masukkan email, NIK KTP, atau No. WA Anda"
                      required
                      autoFocus
                      className="text-xs mt-1 bg-slate-50 border-slate-300"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-bold text-slate-700">Password Akun PMB *</Label>
                    <Input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Password yang dibuat saat mendaftar"
                      required
                      className="text-xs mt-1 bg-slate-50 border-slate-300"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={loginLoading}
                    className="w-full bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs py-2.5 shadow-md mt-2"
                  >
                    {loginLoading ? "Memverifikasi..." : <><LogIn className="w-4 h-4 mr-1.5 inline" /> Masuk ke Portal Seleksi</>}
                  </Button>

                  <div className="pt-3 border-t border-slate-100 flex flex-col items-center gap-2 text-center">
                    <p className="text-[11px] text-slate-500">
                      Belum memiliki akun PMB?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setShowLoginModal(false);
                          setShowRegisterModal(true);
                        }}
                        className="text-indigo-600 font-bold hover:underline"
                      >
                        Daftar Calon Mahasiswa Baru
                      </button>
                    </p>
                    <a
                      href={SIAKAD_URL}
                      className="text-[11px] text-slate-500 hover:text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      <School className="w-3.5 h-3.5" /> Menuju Portal SIAKAD (Mahasiswa Aktif / Dosen)
                    </a>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
