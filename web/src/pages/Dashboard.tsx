import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../auth/auth";

interface Stats {
  contacts: number;
  campaigns: number;
  automationsActive: number;
  byStatus: Record<string, number>;
  recent: Array<{ id: string; name: string; channel: string; status: string; counts?: { queued?: number; skipped?: number } }>;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Taslak", cls: "bg-slate-100 text-slate-600" },
  scheduled: { label: "Planlandı", cls: "bg-amber-100 text-amber-700" },
  sending: { label: "Gönderiliyor", cls: "bg-blue-100 text-blue-700" },
  done: { label: "Tamamlandı", cls: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Başarısız", cls: "bg-red-100 text-red-700" },
};
const CHANNEL: Record<string, string> = { email: "E-posta", whatsapp: "WhatsApp", sms: "SMS" };
const DELIVERY_LABEL: Record<string, string> = { queued: "Kuyrukta", sent: "Gönderildi", delivered: "Ulaştı", read: "Okundu", failed: "Başarısız", skipped: "Atlandı" };

function Stat({ label, value, to }: { label: string; value: number | string; to?: string }) {
  const inner = (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-300 transition">
      <h3 className="text-sm font-medium text-slate-500 mb-2">{label}</h3>
      <div className="text-3xl font-semibold">{value}</div>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    api<Stats>("/dashboard/stats").then(setS).catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Genel Bakış</h1>
      <p className="text-slate-500 mb-6">Hoş geldin — {user?.email}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Stat label="Toplam kontakt" value={s?.contacts ?? "—"} to="/contacts" />
        <Stat label="Toplam kampanya" value={s?.campaigns ?? "—"} to="/campaigns" />
        <Stat label="Aktif otomasyon" value={s?.automationsActive ?? "—"} to="/automations" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gönderim durumları */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-medium mb-3">Gönderim durumları</h3>
          {s && Object.keys(s.byStatus).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(s.byStatus).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-slate-600">{DELIVERY_LABEL[k] ?? k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Henüz gönderim yok.</p>
          )}
        </div>

        {/* Son kampanyalar */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Son kampanyalar</h3>
            <Link to="/campaigns" className="text-sm text-indigo-600 hover:text-indigo-800">Tümü →</Link>
          </div>
          {s?.recent && s.recent.length > 0 ? (
            <div className="space-y-2">
              {s.recent.map((c) => {
                const st = STATUS[c.status] ?? { label: c.status, cls: "bg-slate-100 text-slate-600" };
                return (
                  <div key={c.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-slate-500">{CHANNEL[c.channel] ?? c.channel}{c.counts?.queued != null ? ` · ${c.counts.queued} gönderildi` : ""}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${st.cls}`}>{st.label}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Henüz kampanya yok.</p>
          )}
        </div>
      </div>
    </div>
  );
}
