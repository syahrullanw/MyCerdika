import React, { useState } from "react";
import {
  Briefcase,
  CheckCircle2,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const emptyStaffForm = {
  employee_id: "",
  nip: "",
  nik: "",
  nuptk: "",
  username: "",
  name: "",
  email: "",
  whatsapp: "",
  password: "Tendik123!",
  status: "active",
  jabatan_id: "",
  jabatan: "",
  unit_organisasi: "",
  unit_organisasi_id: "",
  jenis_pegawai: "",
  status_pegawai: "",
  status_kerja: "",
  no_sk: "",
  tanggal_masuk: "",
  alamat: "",
  kota: "",
  provinsi: "",
  foto_url: "",
};

function StaffFormField({ label, value, onChange, type = "text", required = false, placeholder = "" }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-semibold text-slate-700">{label}{required && <span className="text-red-500"> *</span>}</span>
      <Input
        type={type}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

export function StaffPage({
  staff = [],
  jabatanOptions = [],
  unitOrganisasiOptions = [],
  forms,
  setForms,
  saveStaff,
  resetStaffPassword,
  deleteStaff,
}) {
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const staffForm = forms.staff || emptyStaffForm;
  const editing = Boolean(staffForm.id);
  const filteredStaff = staff.filter((item) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return `${item.name || ""} ${item.username || ""} ${item.email || ""} ${item.employee_id || ""} ${item.nip || ""} ${item.jabatan || ""} ${item.unit_organisasi || ""}`
      .toLowerCase()
      .includes(query);
  });

  function updateForm(changes) {
    setForms((current) => ({ ...current, staff: { ...current.staff, ...changes } }));
  }

  function openCreate() {
    setForms((current) => ({ ...current, staff: { ...emptyStaffForm } }));
    setShowModal(true);
  }

  function openEdit(item) {
    const normalize = (value) => String(value || "").trim().toLowerCase();
    const jabatan = jabatanOptions.find((option) => normalize(option.id) === normalize(item.jabatan_id)
      || normalize(option.nama) === normalize(item.jabatan));
    const unit = unitOrganisasiOptions.find((option) => normalize(option.id) === normalize(item.unit_organisasi_id)
      || normalize(option.nama) === normalize(item.unit_organisasi));
    setForms((current) => ({
      ...current,
      staff: {
        ...emptyStaffForm,
        ...item,
        jabatan_id: jabatan?.id || "",
        jabatan: jabatan?.nama || item.jabatan || "",
        unit_organisasi_id: unit?.id || "",
        unit_organisasi: unit?.nama || item.unit_organisasi || "",
        password: "",
      },
    }));
    setShowModal(true);
  }

  async function submit(event) {
    event.preventDefault();
    const saved = await saveStaff(event);
    if (saved !== false) setShowModal(false);
  }

  return (
    <div className="space-y-6" data-testid="staff-page">
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-slate-900">
            <Briefcase className="h-6 w-6 text-emerald-600" /> Data Tendik Kampus
          </h1>
          <p className="mt-1 text-sm text-slate-500">Buat akun pegawai non-dosen/non-mahasiswa. Akses Keuangan atau Akademik diberikan melalui Hak Akses User.</p>
        </div>
        <Button type="button" onClick={openCreate} className="bg-emerald-600 text-white hover:bg-emerald-700">
          <Plus /> Tambah Tendik
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-md shadow-none"><CardContent className="p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Tendik</div><div className="mt-1 text-2xl font-bold text-slate-900">{staff.length}</div></CardContent></Card>
        <Card className="rounded-md shadow-none"><CardContent className="p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aktif</div><div className="mt-1 text-2xl font-bold text-emerald-700">{staff.filter((item) => item.status === "active").length}</div></CardContent></Card>
        <Card className="rounded-md shadow-none"><CardContent className="p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nonaktif</div><div className="mt-1 text-2xl font-bold text-slate-600">{staff.filter((item) => item.status !== "active").length}</div></CardContent></Card>
      </div>

      <Card className="rounded-md shadow-none">
        <CardHeader className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle>Daftar Akun Tendik</CardTitle><p className="mt-1 text-xs text-slate-500">{filteredStaff.length} akun ditampilkan</p></div>
          <div className="relative w-full sm:w-80"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Cari nama, username, NIP, unit..." className="pl-9" /></div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredStaff.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500"><Users className="mx-auto mb-2 h-9 w-9 text-slate-300" />Belum ada akun Tendik.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr><th className="p-4">Identitas</th><th className="p-4">Unit & Jabatan</th><th className="p-4">Status</th><th className="p-4 text-right">Aksi</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStaff.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="p-4"><div className="font-semibold text-slate-900">{item.name}</div><div className="text-xs text-slate-500">@{item.username} · {item.email}</div><div className="mt-1 text-xs font-mono text-indigo-700">{item.employee_id || item.nip || item.nik || "Nomor identitas belum diisi"}</div></td>
                      <td className="p-4"><div className="font-medium text-slate-800">{item.unit_organisasi || "Unit belum diisi"}</div><div className="text-xs text-slate-500">{item.jabatan || "Jabatan belum diisi"}</div></td>
                      <td className="p-4"><Badge className={item.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}>{item.status === "active" ? "Aktif" : "Nonaktif"}</Badge></td>
                      <td className="p-4"><div className="flex justify-end gap-1.5"><Button type="button" size="sm" variant="outline" onClick={() => openEdit(item)}><Pencil /> Edit</Button><Button type="button" size="sm" variant="outline" onClick={() => resetStaffPassword(item)}><KeyRound /> Reset Pass</Button><Button type="button" size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => deleteStaff(item)}><Trash2 /></Button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4">
          <div className="my-8 w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4"><div><h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900"><Briefcase className="h-5 w-5 text-emerald-600" />{editing ? "Edit Data Tendik" : "Tambah Tendik Baru"}</h2><p className="mt-1 text-xs text-slate-500">Role utama akun ini akan disimpan sebagai Tendik.</p></div><button type="button" onClick={() => setShowModal(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200"><X /></button></div>
            <form onSubmit={submit} className="max-h-[75vh] space-y-5 overflow-y-auto p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <StaffFormField label="Nama Lengkap" value={staffForm.name} onChange={(value) => updateForm({ name: value })} required />
                <StaffFormField label="Username" value={staffForm.username} onChange={(value) => updateForm({ username: value })} required placeholder="contoh: operator.akademik" />
                <StaffFormField label="Email" type="email" value={staffForm.email} onChange={(value) => updateForm({ email: value })} required />
                <StaffFormField label="WhatsApp" value={staffForm.whatsapp} onChange={(value) => updateForm({ whatsapp: value })} />
                <StaffFormField label="NIP / ID Pegawai" value={staffForm.employee_id} onChange={(value) => updateForm({ employee_id: value })} />
                <StaffFormField label="NIK" value={staffForm.nik} onChange={(value) => updateForm({ nik: value })} />
                {!editing && <StaffFormField label="Password Awal" type="password" value={staffForm.password} onChange={(value) => updateForm({ password: value })} required />}
                <label className="space-y-1 text-sm"><span className="font-semibold text-slate-700">Status</span><select value={staffForm.status} onChange={(event) => updateForm({ status: event.target.value })} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3"><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-slate-700">Jabatan / Fungsi<span className="text-red-500"> *</span></span>
                  <select
                    value={staffForm.jabatan_id || ""}
                    onChange={(event) => {
                      const option = jabatanOptions.find((item) => item.id === event.target.value);
                      updateForm({ jabatan_id: event.target.value, jabatan: option?.nama || "" });
                    }}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    required
                  >
                    <option value="">Pilih jabatan / fungsi</option>
                    {jabatanOptions.filter((item) => item.status !== "inactive").map((item) => (
                      <option key={item.id} value={item.id}>{item.kode ? `${item.kode} — ` : ""}{item.nama}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-slate-700">Unit Organisasi<span className="text-red-500"> *</span></span>
                  <select
                    value={staffForm.unit_organisasi_id || ""}
                    onChange={(event) => {
                      const option = unitOrganisasiOptions.find((item) => item.id === event.target.value);
                      updateForm({ unit_organisasi_id: event.target.value, unit_organisasi: option?.nama || "" });
                    }}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    required
                  >
                    <option value="">Pilih unit organisasi</option>
                    {unitOrganisasiOptions.filter((item) => item.status !== "inactive").map((item) => (
                      <option key={item.id} value={item.id}>{item.kode ? `${item.kode} — ` : ""}{item.nama}</option>
                    ))}
                  </select>
                </label>
                <StaffFormField label="Jenis Pegawai" value={staffForm.jenis_pegawai} onChange={(value) => updateForm({ jenis_pegawai: value })} />
                <StaffFormField label="Status Kepegawaian" value={staffForm.status_pegawai} onChange={(value) => updateForm({ status_pegawai: value })} />
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"><strong className="block">Langkah setelah akun dibuat</strong><span>Untuk memberi akses pekerjaan, buka Hak Akses User lalu pilih template Tendik, Operator Akademik, atau Staf Keuangan sesuai kebutuhan.</span></div>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4"><Button type="button" variant="outline" onClick={() => setShowModal(false)}>Batal</Button><Button type="submit" className="bg-emerald-600 text-white hover:bg-emerald-700"><CheckCircle2 /> {editing ? "Simpan Perubahan" : "Buat Akun Tendik"}</Button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
