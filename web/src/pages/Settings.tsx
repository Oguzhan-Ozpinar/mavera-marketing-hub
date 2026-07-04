import { useEffect, useState } from "react";
import { api } from "../lib/api";

const GROUPS: { title: string; fields: { key: string; label: string; secret?: boolean }[] }[] = [
  {
    title: "MonoChat (WhatsApp)",
    fields: [
      { key: "mc_slug", label: "Slug" },
      { key: "mc_token", label: "API Token", secret: true },
      { key: "mc_business_phone", label: "Business numara (+ yok)" },
      { key: "mc_base_url", label: "Base URL" },
    ],
  },
  {
    title: "Netgsm (SMS)",
    fields: [
      { key: "ng_user", label: "Kullanıcı" },
      { key: "ng_pass", label: "Şifre", secret: true },
      { key: "ng_msgheader", label: "Gönderici başlığı" },
      { key: "ng_iys_brand", label: "İYS marka kodu" },
    ],
  },
  {
    title: "EmailOctopus",
    fields: [
      { key: "eo_api_key", label: "API Key", secret: true },
      { key: "eo_list_id", label: "List ID" },
    ],
  },
];

export default function Settings() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ settings: Record<string, string> }>("/settings/integrations")
      .then((r) => setVals(r.settings ?? {}))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setErr(""); setSaved(false);
    try {
      await api("/settings/integrations", { method: "PUT", body: JSON.stringify(vals) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { setErr(e.message); }
  };

  const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 outline-none transition";

  if (loading) return <div className="text-slate-400">Yükleniyor…</div>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">API Ayarları</h1>
      <p className="text-sm text-slate-500 mb-6">Bu derneğin kanal entegrasyon anahtarları. Kaydedince anında etkin olur.</p>

      <div className="space-y-5">
        {GROUPS.map((g) => (
          <div key={g.title} className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-medium mb-3">{g.title}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {g.fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium mb-1">{f.label}</label>
                  <input
                    className={inputCls}
                    type={f.secret ? "password" : "text"}
                    value={vals[f.key] ?? ""}
                    onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {err && <p className="text-sm text-red-600 mt-4">{err}</p>}
      <div className="flex items-center gap-3 mt-5">
        <button onClick={save} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors">Kaydet</button>
        {saved && <span className="text-sm text-emerald-600">✓ Kaydedildi</span>}
      </div>
    </div>
  );
}
