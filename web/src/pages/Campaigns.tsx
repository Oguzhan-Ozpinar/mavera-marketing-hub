import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

interface Campaign {
  id: string;
  name: string;
  channel: string;
  status: string;
  counts?: { total?: number; queued?: number; skipped?: number };
  date_created?: string;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Taslak", cls: "bg-slate-100 text-slate-600" },
  scheduled: { label: "Planlandı", cls: "bg-amber-100 text-amber-700" },
  sending: { label: "Gönderiliyor", cls: "bg-blue-100 text-blue-700" },
  done: { label: "Tamamlandı", cls: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Başarısız", cls: "bg-red-100 text-red-700" },
};
const CHANNEL: Record<string, string> = { email: "E-posta", whatsapp: "WhatsApp", sms: "SMS" };
const TABS = [
  { key: "", label: "Tümü" },
  { key: "draft", label: "Taslaklar" },
  { key: "scheduled", label: "Planlanmış" },
  { key: "done", label: "Gönderilenler" },
];

export default function Campaigns() {
  const [tab, setTab] = useState("");
  const [rows, setRows] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<{ campaigns: Campaign[] }>(`/campaigns${tab ? `?status=${tab}` : ""}`)
      .then((r) => setRows(r.campaigns))
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Kampanyalar</h1>
        <Link to="/campaigns/new" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors">
          + Yeni Kampanya
        </Link>
      </div>

      <div className="flex gap-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab === t.key ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Yükleniyor…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">Kampanya yok. “Yeni Kampanya” ile başla.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Ad</th>
                <th className="px-4 py-3 font-medium">Kanal</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3 font-medium">Gönderim</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const s = STATUS[c.status] ?? { label: c.status, cls: "bg-slate-100 text-slate-600" };
                return (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/campaigns/${c.id}`} className="text-indigo-700 hover:underline">{c.name}</Link>
                    </td>
                    <td className="px-4 py-3">{CHANNEL[c.channel] ?? c.channel}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${s.cls}`}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {c.counts?.queued != null ? `${c.counts.queued} gönderildi · ${c.counts.skipped ?? 0} atlandı` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
