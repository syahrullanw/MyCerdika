import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const BACKEND_URL =
  (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") ||
  (typeof window !== "undefined" && (window.location.port === "3001" || window.location.port === "3000")
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:8000");

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function apiErrorMessage(err, fallback = "Terjadi kesalahan") {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length) {
    const msgs = detail
      .map((e) => (e && typeof e === "object" ? e.msg || e.msg_en : ""))
      .filter(Boolean)
      .map((m) => String(m).replace(/^Value error,\s*/i, ""));
    if (msgs.length) return msgs.join(". ");
  }
  if (detail && typeof detail === "object" && detail.message) return detail.message;
  if (err?.message) return err.message;
  return fallback;
}

export function formatRupiah(num) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num || 0);
}

export function resolveMediaUrl(url) {
  if (!url) return "";
  return url.startsWith("http") ? url : `${BACKEND_URL}${url}`;
}
