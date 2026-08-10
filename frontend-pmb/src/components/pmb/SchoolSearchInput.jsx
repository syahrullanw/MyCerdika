import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Input } from "@/components/ui/input";
import { Search, School, MapPin, Loader2 } from "lucide-react";
import { BACKEND_URL } from "@/lib/utils";

const api = axios.create({ baseURL: BACKEND_URL });

export function SchoolSearchInput({
  value = "",
  onSelect,
  onTyping,
  placeholder = "Ketik nama sekolah untuk pencarian otomatis",
  className = "",
}) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fallback, setFallback] = useState(false);
  const containerRef = useRef(null);
  const suppressNext = useRef(false);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
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
          setFallback(false);
        }
      } catch (err) {
        if (err.response?.status === 400) {
          setFallback(true);
          setResults([]);
          setOpen(false);
        }
      } finally {
        setLoading(false);
      }
    }, 350);
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
          className={`pl-8 text-xs ${className}`}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-500 animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg divide-y divide-slate-100 text-xs">
          {results.map((s) => (
            <li
              key={s.npsn || s.nama}
              className="cursor-pointer hover:bg-indigo-50 p-2.5 flex gap-2 items-start"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s);
              }}
            >
              <School className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900 truncate">{s.nama}</p>
                <p className="text-[10px] text-slate-500 flex items-center gap-1.5 truncate">
                  {s.jenis && <span>{s.jenis}</span>}
                  {s.npsn && <span className="font-mono">{s.npsn}</span>}
                  {(s.kabupaten || s.provinsi) && (
                    <span className="flex items-center gap-0.5 truncate">
                      <MapPin className="w-2.5 h-2.5 shrink-0" />
                      {[s.kabupaten, s.provinsi].filter(Boolean).join(", ")}
                    </span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {fallback && (
        <p className="text-[10px] text-amber-700 mt-1 bg-amber-50 p-1.5 rounded border border-amber-200">
          Pencarian otomatis data sekolah belum aktif — silakan ketik manual.
        </p>
      )}
    </div>
  );
}

export default SchoolSearchInput;
