import React, { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { apiErrorMessage } from "@/lib/utils";
import { Cable, Loader2, Plug, RefreshCw, Save, School, Webhook } from "lucide-react";

const BACKEND_URL =
  (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "") ||
  window.location.origin;
const api = axios.create({ baseURL: BACKEND_URL });

const INTEGRATION_ICONS = {
  sekolah: School,
};

const INTEGRATION_DESCRIPTIONS = {
  sekolah:
    "Autocomplete nama sekolah, NPSN, dan alamat pada formulir pendaftaran PMB.",
};

function IntegrationIcon({ name }) {
  const Icon = INTEGRATION_ICONS[name] || Webhook;
  return <Icon className="w-4 h-4 text-indigo-600" />;
}

export function IntegrationSettingsPage({ token }) {
  const [integrations, setIntegrations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [testing, setTesting] = useState(null);

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    api
      .get("/api/integrations/settings", authHeaders)
      .then(({ data }) => {
        if (data.ok) setIntegrations(data.integrations || {});
      })
      .catch((err) => toast.error(apiErrorMessage(err, "Gagal memuat konfigurasi integrasi")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateConfig = (name, key, value) => {
    setIntegrations((prev) => ({
      ...prev,
      [name]: { ...prev[name], [key]: value },
    }));
  };

  const handleSave = async (name) => {
    setSaving(name);
    try {
      const cfg = { ...integrations[name] };
      delete cfg.api_key_masked;
      if (!cfg.api_key) delete cfg.api_key;
      const { data } = await api.put(
        "/api/integrations/settings",
        { integrations: { [name]: cfg } },
        authHeaders
      );
      if (data.ok) {
        setIntegrations((prev) => ({ ...prev, [name]: data.integrations[name] }));
        toast.success(data.message || "Konfigurasi integrasi berhasil disimpan");
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal menyimpan konfigurasi integrasi"));
    } finally {
      setSaving(null);
    }
  };

  const handleTest = async (name) => {
    if (name !== "sekolah") return;
    setTesting(name);
    try {
      const { data } = await api.get("/api/v1/pmb/schools/search", {
        params: { q: "sman" },
      });
      if (data.ok) {
        toast.success(`Koneksi berhasil! ${data.count} sekolah ditemukan (contoh: "sman").`);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Gagal menguji koneksi API Data Sekolah"));
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 text-sm">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Memuat konfigurasi integrasi...
      </div>
    );
  }

  const integrationNames = Object.keys(integrations || {});

  return (
    <div className="space-y-6" data-testid="integrations-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold flex items-center gap-2" data-testid="integrations-title">
            <Cable className="w-6 h-6 text-indigo-600" /> Integrasi Sistem
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Kelola koneksi ke layanan eksternal (API data publik, gateway, dan integrasi lainnya).
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {integrationNames.length} integrasi terdaftar
        </Badge>
      </div>

      {integrationNames.length === 0 && (
        <Card className="border-slate-200">
          <CardContent className="p-8 text-center text-sm text-slate-500">
            <Plug className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            Belum ada integrasi yang terdaftar.
          </CardContent>
        </Card>
      )}

      {integrationNames.map((name) => {
        const cfg = integrations[name] || {};
        return (
          <Card key={name} className="border-slate-200" data-testid={`integration-card-${name}`}>
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <IntegrationIcon name={name} />
                  <div>
                    <CardTitle className="text-sm font-bold">
                      {cfg.label || name}
                    </CardTitle>
                    <p className="text-[10px] text-slate-500">
                      {INTEGRATION_DESCRIPTIONS[name] || "Integrasi layanan eksternal."}
                    </p>
                  </div>
                </div>
                <Badge variant={cfg.enabled ? "default" : "secondary"} className="text-[10px]">
                  {cfg.enabled ? "Aktif" : "Nonaktif"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-4 text-xs">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-bold">Provider</Label>
                  <Input value={cfg.provider || ""} readOnly className="text-xs mt-1 bg-slate-50" />
                </div>
                <div>
                  <Label className="text-xs font-bold">Base URL API</Label>
                  <Input
                    value={cfg.base_url || ""}
                    onChange={(e) => updateConfig(name, "base_url", e.target.value)}
                    placeholder="https://use.apiindonesia.id"
                    className="text-xs mt-1 font-mono"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 items-start">
                <div>
                  <Label className="text-xs font-bold">API Key (header x-api-key)</Label>
                  <Input
                    type="password"
                    value={cfg.api_key || ""}
                    onChange={(e) => updateConfig(name, "api_key", e.target.value)}
                    placeholder={cfg.api_key_masked || "aip_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
                    className="text-xs mt-1 font-mono"
                  />
                  {cfg.api_key_masked && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      Key tersimpan: <span className="font-mono">{cfg.api_key_masked}</span> — kosongkan untuk mempertahankan key lama.
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-bold">Aktifkan Integrasi</Label>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!cfg.enabled}
                      onChange={(e) => updateConfig(name, "enabled", e.target.checked)}
                      className="w-4 h-4 accent-indigo-600"
                    />
                    <span className="text-[11px] font-bold text-slate-700">
                      {cfg.enabled ? "Aktif — layanan dapat digunakan aplikasi" : "Nonaktif — layanan tidak dipanggil"}
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                {name === "sekolah" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={testing === name || !cfg.enabled}
                    onClick={() => handleTest(name)}
                  >
                    {testing === name ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 inline animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 inline" />
                    )}
                    Uji Koneksi
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                  disabled={saving === name}
                  onClick={() => handleSave(name)}
                >
                  {saving === name ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 inline animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5 mr-1.5 inline" />
                  )}
                  Simpan Konfigurasi
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default IntegrationSettingsPage;
