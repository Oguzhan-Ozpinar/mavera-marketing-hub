import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";

interface Summary {
  contact: any;
  consent: Array<{ channel: string; action: string; source: string; occurred_at: string }>;
  campaigns: Array<{ status: string; to?: string; updated_at?: string; campaign_id?: { name?: string; channel?: string } }>;
  events: Array<{ timestamp?: string; action_type?: string; source?: string; action_details?: string }>;
  directusUrl: string;
}

const CHANNEL: Record<string, string> = { email: "E-posta", whatsapp: "WhatsApp", sms: "SMS", voice: "Arama" };
const ACTION: Record<string, string> = { optin: "İzin verildi", ret: "İzin geri çekildi", hardbounce: "Hard bounce", complaint: "Şikayet" };
const RSTATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: "Kuyrukta", cls: "bg-slate-100 text-slate-600" },
  sent: { label: "Gönderildi", cls: "bg-blue-100 text-blue-700" },
  delivered: { label: "Ulaştı", cls: "bg-cyan-100 text-cyan-700" },
  read: { label: "Okundu", cls: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Başarısız", cls: "bg-red-100 text-red-700" },
  skipped: { label: "Atlandı", cls: "bg-amber-100 text-amber-700" },
};
const fmt = (d?: string) => (d ? new Date(d).toLocaleString("tr-TR") : "—");
const fmtD = (d?: string) => (d ? new Date(d).toLocaleDateString("tr-TR") : "—");

function Optin({ on, label }: { on?: boolean; label: string }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${on ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{label}</span>;
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="font-medium mb-3">{title}</h3>
      {children}
    </div>
  );
}

export default function ContactDetail() {
  const { id } = useParams();
  const [s, setS] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Summary>(`/contacts/${id}/summary`).then(setS).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-slate-400">Yükleniyor…</div>;
  if (!s) return <div className="text-slate-400">Kontakt bulunamadı.</div>;

  const c = s.contact;
  const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "İsimsiz";
  const types = c.donation_type_list ? String(c.donation_type_list).split(",").filter(Boolean) : [];

  return (
    <div className="space-y-4">
      <Link to="/contacts" className="text-sm text-indigo-600 hover:text-indigo-800">← Kontaklar</Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{name}</h1>
          <p className="text-slate-500 text-sm mt-1">{c.phone ?? "—"} · {c.email ?? "—"}</p>
          <div className="flex gap-2 mt-2">
            <Optin on={c.whatsapp_optin} label="WhatsApp" />
            <Optin on={c.mail_optin} label="E-posta" />
            <Optin on={c.sms_optin} label="SMS" />
          </div>
        </div>
        <a
          href={`${s.directusUrl}/admin/content/Contacts/${c.id}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium hover:bg-slate-50 active:bg-slate-100 transition-colors whitespace-nowrap"
        >
          Directus'ta aç ↗
        </a>
      </div>

      {/* RFM */}
      <Card title="Bağış özeti (RFM)">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div><div className="text-2xl font-semibold">{c.donation_count ?? 0}</div><div className="text-xs text-slate-500">Bağış adedi</div></div>
          <div><div className="text-2xl font-semibold">{c.donation_total ?? 0}₺</div><div className="text-xs text-slate-500">Toplam</div></div>
          <div><div className="text-sm font-semibold mt-1.5">{fmtD(c.last_donation_at)}</div><div className="text-xs text-slate-500">Son bağış</div></div>
          <div><div className="text-sm font-semibold mt-1.5">{fmtD(c.first_donation_at)}</div><div className="text-xs text-slate-500">İlk bağış</div></div>
        </div>
        {types.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {types.map((t) => <span key={t} className="px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700">{t}</span>)}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Kampanyalar */}
        <Card title="Giden kampanyalar">
          {s.campaigns.length === 0 ? <p className="text-sm text-slate-400">Henüz kampanya gönderilmedi.</p> : (
            <div className="space-y-2">
              {s.campaigns.map((r, i) => {
                const st = RSTATUS[r.status] ?? { label: r.status, cls: "bg-slate-100 text-slate-600" };
                return (
                  <div key={i} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0">
                    <div>
                      <div className="font-medium">{r.campaign_id?.name ?? "—"}</div>
                      <div className="text-xs text-slate-500">{CHANNEL[r.campaign_id?.channel ?? ""] ?? r.campaign_id?.channel} · {fmtD(r.updated_at)}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${st.cls}`}>{st.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* İzin geçmişi */}
        <Card title="İzin geçmişi (KVKK)">
          {s.consent.length === 0 ? <p className="text-sm text-slate-400">İzin kaydı yok.</p> : (
            <div className="space-y-2">
              {s.consent.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0">
                  <span>{CHANNEL[r.channel] ?? r.channel} — <b>{ACTION[r.action] ?? r.action}</b></span>
                  <span className="text-xs text-slate-500">{r.source} · {fmtD(r.occurred_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {s.events.length > 0 && (
        <Card title="Etkileşimler">
          <div className="space-y-1.5">
            {s.events.map((e, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{e.action_type} <span className="text-slate-400">({e.source})</span></span>
                <span className="text-xs text-slate-500">{fmt(e.timestamp)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
