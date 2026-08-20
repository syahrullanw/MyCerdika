import { lazy, Suspense, useEffect, useMemo, useState } from "react";

const FullApp = lazy(() => import("@/App"));

const DEFAULT_DESCRIPTION =
  "Sistem Informasi Akademik terpadu untuk mengelola pembelajaran, presensi, penilaian, dan layanan akademik perguruan tinggi.";
const DEFAULT_BRANDING = {
  app_name: "E-Learning Dosen",
  campus_name: "POLITEKNIK SCI",
  campus_code: "POLITEKNIK SCI",
  meta_description: DEFAULT_DESCRIPTION,
  app_logo_url: "",
  campus_logo_url: "",
};

function resolveBackendUrl() {
  const configuredUrl = String(process.env.REACT_APP_BACKEND_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (configuredUrl) return configuredUrl;
  if (typeof window !== "undefined" && window.location?.origin) {
    if (window.location.port === "3000") {
      return `${window.location.protocol}//${window.location.hostname}:8000`;
    }
    return window.location.origin;
  }
  return "";
}

const BACKEND_URL = resolveBackendUrl();
const API = `${BACKEND_URL}/api`;

function needsFullApp() {
  if (typeof window === "undefined") return true;
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash || "";
  const path = window.location.pathname || "";
  const hasSession = Boolean(
    localStorage.getItem("elearn_token") && localStorage.getItem("elearn_user"),
  );
  const reset = (params.get("reset") || "").toLowerCase();
  const mode = (params.get("mode") || "").toLowerCase();
  const isPasswordFlow =
    reset === "password" || reset === "1" || mode === "forgot";
  const isSsoCallback = Boolean(
    params.get("sso_ticket") || params.get("sso_error"),
  );
  const isPublicRoute =
    path.includes("/public/bkd-bundle/") ||
    hash.includes("/public/bkd-bundle/") ||
    params.get("page") === "pmb" ||
    params.get("page") === "pmb-info" ||
    path.includes("/pmb") ||
    hash.startsWith("#/pmb") ||
    hash === "#pmb";
  return hasSession || isPasswordFlow || isSsoCallback || isPublicRoute;
}

function updateMeta(branding) {
  const appName = branding.app_name?.trim() || DEFAULT_BRANDING.app_name;
  const description =
    branding.meta_description?.trim() || DEFAULT_DESCRIPTION;
  document.title = appName;
  [
    ["name", "description", description],
    ["property", "og:title", appName],
    ["property", "og:description", description],
    ["name", "twitter:title", appName],
    ["name", "twitter:description", description],
  ].forEach(([attribute, key, content]) => {
    let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!element) {
      element = document.createElement("meta");
      element.setAttribute(attribute, key);
      document.head.appendChild(element);
    }
    element.setAttribute("content", content);
  });
}

function FullAppFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center" role="status" aria-live="polite">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
        <p className="mt-4 text-sm font-semibold text-slate-600">
          Menyiapkan aplikasi...
        </p>
      </div>
    </main>
  );
}

function LightweightLogin({ onOpenFullApp }) {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [sso, setSso] = useState({
    enabled: false,
    provider: "SCI-ID",
    login_url: "",
    local_login_enabled: true,
  });
  const [login, setLogin] = useState({ identifier: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isDesktop = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches,
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      fetch(`${API}/settings/public`, { signal: controller.signal }).then(
        async (response) => {
          if (!response.ok) throw new Error("Branding tidak tersedia");
          const data = await response.json();
          setBranding((current) => ({ ...current, ...data }));
          updateMeta({ ...DEFAULT_BRANDING, ...data });
        },
      ),
      fetch(`${API}/auth/sso/config`, { signal: controller.signal }).then(
        async (response) => {
          if (!response.ok) throw new Error("Konfigurasi SSO tidak tersedia");
          setSso(await response.json());
        },
      ),
    ]).catch(() => {});
    updateMeta(DEFAULT_BRANDING);
    return () => controller.abort();
  }, []);

  const appName = branding.app_name?.trim() || DEFAULT_BRANDING.app_name;
  const campusName =
    branding.campus_name?.trim() || DEFAULT_BRANDING.campus_name;
  const campusShortName = branding.campus_code?.trim() || campusName;
  const rawLogo =
    branding.app_logo_url?.trim() || branding.campus_logo_url?.trim() || "";
  const logo = rawLogo
    ? rawLogo.startsWith("http")
      ? rawLogo
      : `${BACKEND_URL}${rawLogo}`
    : "/app-icon.svg";

  async function submitLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(login),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || "Username atau password tidak valid");
      }
      localStorage.setItem("elearn_token", payload.token);
      localStorage.setItem("elearn_user", JSON.stringify(payload.user));
      onOpenFullApp();
    } catch (loginError) {
      setError(loginError.message || "Login gagal. Silakan coba kembali.");
    } finally {
      setBusy(false);
    }
  }

  function openForgotPassword() {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "forgot");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    onOpenFullApp();
  }

  return (
    <main
      className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[1.05fr_0.95fr]"
      data-testid="login-screen"
    >
      <section className="relative hidden min-h-screen overflow-hidden bg-slate-950 lg:block">
        {isDesktop && (
          <img
            src="/campus/poltek-campus-main-1280.jpg"
            alt="Gedung utama Politeknik SCI"
            width="1280"
            height="720"
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover opacity-80"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-tr from-[#020b1c] via-[#061a3d]/35 to-sky-950/10" />
        <div className="absolute left-10 top-10 flex items-center gap-3 rounded-2xl border border-white/20 bg-slate-950/35 px-4 py-3 text-white backdrop-blur-md">
          {isDesktop && (
            <img
              src="/campus/poltek-campus-aerial.webp"
              alt="Detail kampus"
              width="48"
              height="48"
              className="h-12 w-12 rounded-xl object-cover"
            />
          )}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">
              Kampus berbasis teknologi
            </p>
            <p className="mt-0.5 text-sm font-extrabold">{campusName}</p>
          </div>
        </div>
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <img
            src={logo}
            alt={`Logo ${appName}`}
            width="64"
            height="64"
            className="mb-8 h-16 w-16 object-contain"
          />
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">
            Portal Akademik Terpadu
          </p>
          <h1 className="font-display text-5xl font-bold leading-tight">
            Tumbuh di kampus yang dirancang untuk masa depan.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-200">
            Satu pintu untuk layanan akademik dan pembelajaran di {campusName}
          </p>
        </div>
      </section>

      <section className="flex min-h-screen items-center px-5 py-10 md:px-12">
        <div className="mx-auto w-full max-w-xl">
          <div className="mb-6 flex items-center gap-3">
            <img
              src={logo}
              alt={`Logo ${appName}`}
              width="48"
              height="48"
              className="h-12 w-12 object-contain"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {campusShortName}
              </p>
              <h2 className="font-display text-3xl font-bold text-slate-950">
                Akses {appName}
              </h2>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-1.5 rounded-2xl border border-blue-200 bg-white p-1 text-xs">
            <button
              type="button"
              className="rounded-xl bg-blue-600 px-3 py-2.5 font-bold text-white shadow-sm"
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={openForgotPassword}
              className="rounded-xl px-3 py-2.5 font-bold text-slate-700 hover:bg-slate-50"
            >
              Lupa
            </button>
          </div>

          <div className="space-y-4 border border-slate-200 bg-white p-6 shadow-sm">
            {sso.enabled && sso.login_url && (
              <>
                <a
                  href={sso.login_url}
                  className="block w-full rounded-md bg-blue-600 px-4 py-3 text-center text-sm font-bold text-white hover:bg-blue-700"
                >
                  Masuk dengan {sso.provider || "SCI-ID"}
                </a>
                {sso.local_login_enabled && (
                  <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />
                    <span>Login lokal sementara</span>
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                )}
              </>
            )}

            {sso.local_login_enabled !== false && (
              <form onSubmit={submitLogin} className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Username
                  </span>
                  <input
                    value={login.identifier}
                    onChange={(event) =>
                      setLogin((current) => ({
                        ...current,
                        identifier: event.target.value,
                      }))
                    }
                    autoComplete="username"
                    required
                    autoFocus
                    placeholder="Masukkan username"
                    className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Password
                  </span>
                  <input
                    type="password"
                    value={login.password}
                    onChange={(event) =>
                      setLogin((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    autoComplete="current-password"
                    required
                    className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                {error && (
                  <p
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
                <button
                  disabled={busy}
                  className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {busy ? "Memeriksa akun..." : "Masuk lokal"}
                </button>
                <button
                  type="button"
                  onClick={openForgotPassword}
                  className="text-sm font-semibold text-blue-700 hover:underline"
                >
                  Lupa password?
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default function BootstrapApp() {
  const [loadFullApp, setLoadFullApp] = useState(needsFullApp);

  if (loadFullApp) {
    return (
      <Suspense fallback={<FullAppFallback />}>
        <FullApp />
      </Suspense>
    );
  }

  return <LightweightLogin onOpenFullApp={() => setLoadFullApp(true)} />;
}
