import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

interface Rule {
  id: string;
  name: string;
  is_active: boolean;
  trigger_type: string;
  action_type: string;
  delay_value?: number;
  delay_unit?: string;
}
interface Meta {
  triggers: { value: string; label: string }[];
  actions: { value: string; label: string }[];
  delayUnits: { value: string; label: string }[];
}

export default function Automations() {
  const [rows, setRows] = useState<Rule[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => api<{ automations: Rule[] }>("/automations").then((r) => setRows(r.automations)).finally(() => setLoading(false));
  useEffect(() => {
    api<Meta>("/automations/meta").then(setMeta);
    load();
  }, []);

  const label = (arr: { value: string; label: string }[] | undefined, v: string) => arr?.find((x) => x.value === v)?.label ?? v;

  const toggle = async (r: Rule) => {
    await api(`/automations/${r.id}`, { method: "PUT", body: JSON.stringify({ is_active: !r.is_active }) });
    load();
  };
  const del = async (id: string) => {
    await api(`/automations/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Otomasyonlar</h1>
        <Link to="/automations/new" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors">
          + Yeni Otomasyon
        </Link>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Kurallar: <b>NE ZAMAN → BEKLE → YAP</b>. Örn. “Şükür kurbanı yapılınca → 2 hafta sonra → WhatsApp hatır sorma”.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Yükleniyor…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">Otomasyon yok. “Yeni Otomasyon” ile başla.</div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-0">
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-slate-500">
                  {label(meta?.triggers, r.trigger_type)} → {r.delay_value ? `${r.delay_value} ${label(meta?.delayUnits, r.delay_unit ?? "")} sonra → ` : ""}
                  {label(meta?.actions, r.action_type)}
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <button
                  onClick={() => toggle(r)}
                  className={`px-2 py-0.5 rounded-full text-xs ${r.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                >
                  {r.is_active ? "Aktif" : "Pasif"}
                </button>
                <Link to={`/automations/${r.id}/edit`} className="text-indigo-600 hover:text-indigo-800">Düzenle</Link>
                <button onClick={() => del(r.id)} className="text-slate-400 hover:text-red-600">Sil</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
