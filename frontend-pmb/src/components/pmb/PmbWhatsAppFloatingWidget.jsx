import React, { useState } from "react";
import { X, Send, Sparkles, CheckCircle2, ShieldCheck } from "lucide-react";
import { resolveMediaUrl } from "@/lib/utils";

// Official WhatsApp Logo Vector (Wikipedia / Meta)
export function WhatsAppOfficialIcon({ className = "w-7 h-7" }) {
  return (
    <svg
      viewBox="0 0 293.5 293.5"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="WhatsApp"
    >
      <circle cx="146.75" cy="146.75" r="146.75" fill="#25D366" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#FFFFFF"
        d="M223.777,70.979c-19.623-19.646-45.719-30.47-73.522-30.482
        c-57.288,0-103.914,46.623-103.937,103.929c-0.007,18.318,4.778,36.198,13.874,51.961l-14.745,53.858l55.098-14.453
        c15.181,8.28,32.273,12.645,49.668,12.651h0.043c57.282,0,103.912-46.629,103.936-103.936
        C254.202,116.737,243.4,90.624,223.777,70.979z M150.256,230.89h-0.035c-15.501-0.006-30.705-4.171-43.968-12.042l-3.155-1.871
        l-32.696,8.576l8.727-31.878l-2.054-3.27c-8.647-13.753-13.215-29.65-13.208-45.974c0.019-47.63,38.772-86.38,86.424-86.38
        c23.073,0.008,44.764,9.005,61.074,25.335c16.31,16.329,25.286,38.033,25.277,61.116
        C236.623,192.136,197.87,230.89,150.256,230.89z M197.641,166.189c-2.597-1.299-15.364-7.582-17.745-8.449
        c-2.38-0.865-4.112-1.299-5.843,1.301c-1.731,2.6-6.709,8.449-8.224,10.183c-1.515,1.732-3.03,1.95-5.626,0.649
        c-2.598-1.299-10.965-4.042-20.885-12.89c-7.72-6.886-12.932-15.39-14.447-17.991c-1.515-2.6-0.162-4.005,1.139-5.3
        c1.168-1.164,2.597-3.034,3.896-4.55s1.731-2.6,2.597-4.333s0.433-3.25-0.217-4.549c-0.649-1.301-5.843-14.084-8.007-19.284
        c-2.108-5.063-4.249-4.378-5.843-4.458c-1.513-0.075-3.246-0.092-4.978-0.092c-1.731,0-4.544,0.65-6.925,3.25
        c-2.38,2.6-9.089,8.883-9.089,21.666c0,12.783,9.305,25.131,10.604,26.865c1.298,1.733,18.313,27.964,44.364,39.214
        c6.195,2.676,11.033,4.273,14.805,5.471c6.222,1.977,11.883,1.697,16.357,1.029c4.99-0.746,15.365-6.283,17.529-12.349
        c2.164-6.067,2.164-11.267,1.515-12.35C201.969,168.14,200.238,167.49,197.641,166.189z"
      />
    </svg>
  );
}

function normalizeWhatsAppNumber(raw) {
  if (!raw) return "6281234567890";
  let cleaned = String(raw).replace(/\D/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.slice(1);
  } else if (cleaned.startsWith("8")) {
    cleaned = "62" + cleaned;
  }
  return cleaned || "6281234567890";
}

const QUICK_QUESTIONS = [
  "Halo Admin PMB, saya ingin tanya syarat pendaftaran prodi.",
  "Halo Admin PMB, bagaimana skema cicilan biaya kuliah?",
  "Halo Admin PMB, apa saja syarat beasiswa yang tersedia?",
  "Halo Admin PMB, saya butuh bantuan pengisian formulir online."
];

export function PmbWhatsAppFloatingWidget({ settings, branding }) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");

  const rawPhone = branding?.campus_whatsapp || branding?.campus_phone || settings?.landing_contact_whatsapp || settings?.landing_contact_phone || "0812-3456-7890";
  const waNumber = normalizeWhatsAppNumber(rawPhone);
  const campusName = branding?.campus_name || branding?.name || "Politeknik SCI";
  const campusLogoUrl = branding?.campus_logo_url || branding?.logo_url;

  const handleSend = (textToSend) => {
    const finalMsg = (textToSend || message || "Halo Admin PMB, saya ingin berkonsultasi seputar pendaftaran mahasiswa baru.").trim();
    const encoded = encodeURIComponent(finalMsg);
    const waUrl = `https://wa.me/${waNumber}?text=${encoded}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-auto">
      {/* 1. Expandable WhatsApp Chat Popup */}
      {isOpen && (
        <div className="mb-3 w-80 sm:w-96 rounded-2xl bg-slate-900 border border-emerald-500/30 shadow-2xl shadow-emerald-950/60 overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200 backdrop-blur-xl">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 p-4 text-white relative">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute top-3.5 right-3.5 p-1 rounded-full text-emerald-100 hover:text-white hover:bg-white/20 transition-colors"
              aria-label="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3">
              <div className="relative">
                {campusLogoUrl ? (
                  <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shadow-md overflow-hidden">
                    <img
                      src={resolveMediaUrl(campusLogoUrl)}
                      alt="Logo"
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-white/20 p-1 flex items-center justify-center shadow-md">
                    <WhatsAppOfficialIcon className="w-7 h-7" />
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 border-2 border-emerald-800 rounded-full animate-pulse" />
              </div>
              <div className="pr-6">
                <div className="flex items-center gap-1.5 font-bold text-sm leading-tight text-white">
                  <span>Helpdesk PMB</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 fill-emerald-300/20" />
                </div>
                <p className="text-[11px] text-emerald-100 font-medium truncate max-w-[200px]">
                  {campusName}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                  <span className="text-[10px] text-emerald-200 font-medium">Online • Balas Cepat</span>
                </div>
              </div>
            </div>
          </div>

          {/* Chat Body */}
          <div className="p-4 space-y-3 bg-slate-950/90 text-xs">
            {/* Admin Message Bubble */}
            <div className="flex gap-2.5 items-start">
              <div className="w-6 h-6 rounded-full bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl rounded-tl-xs p-3 text-slate-200 shadow-md space-y-1.5 leading-relaxed">
                <p className="font-semibold text-emerald-400 text-[11px]">Panitia PMB Resmi</p>
                <p>
                  Halo! Selamat datang di Portal PMB <strong>{campusName}</strong>.
                </p>
                <p className="text-slate-300">
                  Ada yang ingin Anda tanyakan seputar pendaftaran, syarat prodi, jalur beasiswa, atau rincian biaya cicilan?
                </p>
              </div>
            </div>

            {/* Quick Questions Chips */}
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" /> Pertanyaan Cepat:
              </p>
              <div className="flex flex-col gap-1.5">
                {QUICK_QUESTIONS.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(q)}
                    className="text-left text-[11px] p-2 rounded-xl bg-slate-900 border border-emerald-500/20 hover:border-emerald-400/50 hover:bg-emerald-950/40 text-slate-300 hover:text-emerald-300 transition-all flex items-center justify-between group"
                  >
                    <span className="truncate pr-2">{q}</span>
                    <Send className="w-3 h-3 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Input & Send Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(message);
              }}
              className="pt-2 border-t border-slate-800 flex items-center gap-2"
            >
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ketik pesan pertanyaan Anda..."
                className="flex-1 bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400 transition-colors"
              />
              <button
                type="submit"
                className="p-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold shadow-md shadow-emerald-950/40 transition-transform active:scale-95 shrink-0"
                title="Kirim ke WhatsApp"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            <div className="text-center pt-0.5">
              <span className="text-[10px] text-slate-500">
                Terhubung langsung ke WhatsApp Admin: <span className="font-mono text-emerald-400 font-semibold">{rawPhone}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Floating Action Button */}
      <div className="flex items-center gap-2">
        {!isOpen && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/90 border border-emerald-500/40 text-emerald-300 hover:text-white hover:border-emerald-400 text-xs font-bold shadow-xl backdrop-blur-md transition-all hover:scale-105"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span>Tanya Admin PMB</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="WhatsApp Admin PMB"
          className="relative group p-3 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-xl shadow-emerald-600/40 border border-white/20 transition-all transform hover:scale-110 active:scale-95 flex items-center justify-center"
        >
          {/* Pulsing ring when closed */}
          {!isOpen && (
            <span className="absolute -inset-1 rounded-2xl bg-[#25D366]/40 animate-pulse blur-xs -z-10" />
          )}
          {isOpen ? (
            <X className="w-7 h-7 transition-transform duration-200 rotate-90 group-hover:rotate-0 text-white" />
          ) : (
            <WhatsAppOfficialIcon className="w-7 h-7 drop-shadow-md" />
          )}
        </button>
      </div>
    </div>
  );
}

export default PmbWhatsAppFloatingWidget;
