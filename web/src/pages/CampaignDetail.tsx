import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";

interface Recipient {
  id: string | number;
  to?: string;
  status: string;
  provider_message_id?: string;
  error?: string;
  contact_id?: { first_name?: string; last_name?: string } | null;
}
interface Report {
  campaign: { id: string; name: string; channel: string; status: string; counts?: any; triggered_at?: string; scheduled_at?: string; template_ref?: string; audience_type?: string };
  byStatus: Record<string, number>;
  recipients: Recipient[];
}

const CHANNEL: Record<string, string> = { email: "E-posta", whatsapp: "WhatsApp", sms: "SMS" };
const RSTATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: "Kuyrukta", cls: "bg-slate-100 text-slate-600" },
  sent: { label: "Gönderildi", cls: "bg-blue-100 text-blue-700" },
  delivered: { label: "Ulaştı", cls: "bg-cyan-100 text-cyan-700" },
  read: { label: "Okundu", cls: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Başarısız", cls: "bg-red-100 text-red-700" },
  skipped: { label: "Atlandı", cls: "bg-amber-100 text-amber-700" },
};

export default function CampaignDetail() {
  const { id } = useParams();
  const [r, setR] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [newTime, setNewTime] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => api<Report>(`/campaigns/${id}/report`).then(setR).finally(() => setLoading(false));
  useEffect(() => { load(); }, [id]);

  const cancel = async () => {
    setMsg("");
    try { await api(`/campaigns/${id}/cancel`, { method: "POST" }); setMsg("İptal edildi"); load(); }
    catch (e: any) { setMsg("✗ " + e.message); }
  };
  const reschedule = async () => {
    if (!newTime) return;
    setMsg("");
    try { await api(`/campaigns/${id}/schedule`, { method: "PATCH", body: JSON.stringify({ scheduled_at: new Date(newTime).toISOString() }) }); setMsg("Zaman güncellendi"); setNewTime(""); load(); }
    catch (e: any) { setMsg("✗ " + e.message); }
  };

  if (loading) return <div className="text-slate-400">Yükleniyor…</div>;
  if (!r) return <div className="text-slate-400">Kampanya bulunamadı.</div>;

  const c = r.campaign;
  return (
    <div>
      <Link to="/campaigns" className="text-sm text-indigo-600 hover:text-indigo-800">← Kampanyalar</Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">{c.name}</h1>
      <p className="text-slate-500 mb-6">
        {CHANNEL[c.channel] ?? c.channel}
        {c.template_ref ? ` · ${c.template_ref}` : ""}
        {c.audience_type === "manual" ? " · manuel liste" : ""}
        {c.triggered_at ? ` · ${new Date(c.triggered_at).toLocaleString("tr-TR")}` : ""}
      </p>

      {c.status === "scheduled" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6 space-y-3">
          <div className="text-sm">🕐 <b>Planlandı:</b> {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString("tr-TR") : "—"}</div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="datetime-local" className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
            <button onClick={reschedule} className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium hover:bg-white active:bg-slate-100 transition-colors">Zamanı değiştir</button>
            <button onClick={cancel} className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 active:bg-red-800 transition-colors">İptal et</button>
            {msg && <span className="text-sm text-slate-600">{msg}</span>}
          </div>
        </div>
      )}
      {c.status === "cancelled" && (
        <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 mb-6 text-sm text-slate-600">Bu kampanya iptal edildi.</div>
      )}

      {/* Özet */}
      <div className="flex flex-wrap gap-3 mb-6">
        {Object.entries(r.byStatus).map(([k, v]) => {
          const st = RSTATUS[k] ?? { label: k, cls: "bg-slate-100 text-slate-600" };
          return (
            <div key={k} className="bg-white rounded-xl border border-slate-200 px-5 py-3">
              <div className="text-2xl font-semibold">{v}</div>
              <div className={`text-xs mt-1 px-2 py-0.5 rounded-full inline-block ${st.cls}`}>{st.label}</div>
            </div>
          );
        })}
        {Object.keys(r.byStatus).length === 0 && <p className="text-sm text-slate-400">Henüz alıcı yok.</p>}
      </div>

      {/* Alıcılar */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Alıcı</th>
              <th className="px-4 py-3 font-medium">Adres</th>
              <th className="px-4 py-3 font-medium">Durum</th>
              <th className="px-4 py-3 font-medium">Not / hata</th>
            </tr>
          </thead>
          <tbody>
            {r.recipients.map((rec) => {
              const st = RSTATUS[rec.status] ?? { label: rec.status, cls: "bg-slate-100 text-slate-600" };
              const name = rec.contact_id ? `${rec.contact_id.first_name ?? ""} ${rec.contact_id.last_name ?? ""}`.trim() : "";
              return (
                <tr key={rec.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{name || <span className="text-slate-400">(manuel)</span>}</td>
                  <td className="px-4 py-3 font-mono text-xs">{rec.to ?? "—"}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs ${st.cls}`}>{st.label}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{rec.error ?? rec.provider_message_id ?? "—"}</td>
                </tr>
              );
            })}
            {r.recipients.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Alıcı kaydı yok.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
