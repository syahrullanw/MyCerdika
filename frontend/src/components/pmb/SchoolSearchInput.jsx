import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Input } from "@/components/ui/input";
import { Search, School, MapPin, Loader2 } from "lucide-react";

const BACKEND_URL =
  (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") ||
  window.location.origin;
const api = axios.create({ baseURL: BACKEND_URL });

export function SchoolSearchInput({
  value = "",
  onSelect,
  onTyping,
  isVerified = false,
  placeholder = "Ketik nama sekolah untuk pencarian otomatis API...",
  className = "",
}) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const suppressNext = useRef(false);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      if (suppressNext.current) {
        suppressNext.current = false;
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get("/api/v1/pmb/schools/search", {
          params: { q },
        });
        if (data.ok) {
          setResults(data.results || []);
          setOpen(true);
        }
      } catch (err) {
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onMouseDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const handleSelect = (s) => {
    suppressNext.current = true;
    setOpen(false);
    setResults([]);
    setQuery(s.nama);
    if (onSelect) onSelect(s);
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (onTyping) onTyping(e.target.value);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className={`pl-8 pr-8 text-xs ${
            isVerified
              ? "border-emerald-500 bg-emerald-50/30 text-emerald-950 font-bold ring-1 ring-emerald-400"
              : query.length >= 2
              ? "border-amber-400 bg-amber-50/20"
              : ""
          } ${className}`}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-500 animate-spin" />
        )}
      </div>

      {/* Selected Indicator Badge */}
      {isVerified && (
        <p className="text-[10px] text-emerald-700 font-bold mt-1 bg-emerald-50 p-1.5 rounded-md border border-emerald-200 flex items-center justify-between">
          <span>✓ Sekolah berhasil dipilih dari Database API (NPSN & Alamat otomatis terisi)</span>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              if (onTyping) onTyping("");
            }}
            className="text-[9px] text-emerald-800 underline font-semibold ml-2 hover:text-emerald-900"
          >
            Cari Ulang
          </button>
        </p>
      )}

      {/* Warning if typing but not selected yet */}
      {!isVerified && query.length >= 2 && !open && !loading && (
        <p className="text-[10px] text-amber-700 font-medium mt-1 bg-amber-50 p-1.5 rounded-md border border-amber-200">
          ⚠️ <strong>Wajib memilih dari API:</strong> Ketik nama sekolah lalu klik salah satu pilihan sekolah dari daftar dropdown yang muncul.
        </p>
      )}

      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl divide-y divide-slate-100 text-xs">
          <li className="p-2 bg-slate-50 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
            Hasil Pencarian API Sekolah ({results.length} ditemukan) — Klik untuk memilih:
          </li>
          {results.map((s) => (
            <li
              key={s.npsn || s.nama}
              className="cursor-pointer hover:bg-indigo-50 p-2.5 flex gap-2 items-start transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s);
              }}
            >
              <School className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-slate-900 truncate">{s.nama}</p>
                  {s.npsn && (
                    <span className="text-[10px] font-mono bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded shrink-0 ml-2 font-bold">
                      NPSN: {s.npsn}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 flex items-center gap-1.5 truncate mt-0.5">
                  {s.jenis && <span className="font-semibold text-slate-700">{s.jenis}</span>}
                  {(s.alamat || s.kabupaten || s.provinsi) && (
                    <span className="flex items-center gap-0.5 truncate text-slate-600">
                      <MapPin className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                      {[s.alamat, s.kabupaten, s.provinsi].filter(Boolean).join(", ")}
                    </span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SchoolSearchInput;
