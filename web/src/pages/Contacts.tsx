import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Contact {
  id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  whatsapp_optin?: boolean;
  mail_optin?: boolean;
  sms_optin?: boolean;
  donation_count?: number;
  donation_total?: number;
  last_donation_at?: string;
}

function Optin({ on, label }: { on?: boolean; label: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs ${on ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
      {label}
    </span>
  );
}

export default function Contacts() {
  const [rows, setRows] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), limit: "25", ...(search ? { search } : {}) });
    api<{ contacts: Contact[] }>(`/contacts?${qs}`)
      .then((r) => setRows(r.contacts))
      .finally(() => setLoading(false));
  };
  useEffect(load, [page]);

  const doSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Kontaklar</h1>
      <form onSubmit={doSearch} className="mb-4 flex gap-2">
        <input
          className="w-80 px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ad, telefon veya e-posta ara…"
        />
        <button className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors">Ara</button>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Yükleniyor…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">Kontakt bulunamadı.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Ad Soyad</th>
                <th className="px-4 py-3 font-medium">Telefon</th>
                <th className="px-4 py-3 font-medium">E-posta</th>
                <th className="px-4 py-3 font-medium">İzinler</th>
                <th className="px-4 py-3 font-medium">Bağış</th>
                <th className="px-4 py-3 font-medium">Son bağış</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—"}</td>
                  <td className="px-4 py-3">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 space-x-1">
                    <Optin on={c.whatsapp_optin} label="WA" />
                    <Optin on={c.mail_optin} label="Mail" />
                    <Optin on={c.sms_optin} label="SMS" />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.donation_count ? `${c.donation_count}× · ${c.donation_total ?? 0}₺` : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {c.last_donation_at ? new Date(c.last_donation_at).toLocaleDateString("tr-TR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm disabled:opacity-40">← Önceki</button>
        <span className="text-sm text-slate-500">Sayfa {page}</span>
        <button disabled={rows.length < 25} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm disabled:opacity-40">Sonraki →</button>
      </div>
    </div>
  );
}
