import { useEffect, useState } from "react";
import { api } from "../lib/api";

// Değişken → GERÇEK Directus alanı (+ sabit metin). Kampanya ve otomasyonda ortak.
export const TOKENS = [
  { value: "fullName", label: "Ad Soyad" },
  { value: "first_name", label: "Ad" },
  { value: "last_name", label: "Soyad" },
  { value: "mvr_uid", label: "mvr_uid (Uniq Kod)" },
  { value: "email", label: "E-posta" },
  { value: "phone", label: "Telefon" },
  { value: "id", label: "CRM ID" },
  { value: "referans", label: "Referans" },
  { value: "ulke", label: "Ülke" },
  { value: "__lit__", label: "✏️ Sabit metin" },
];

interface Tmpl {
  name: string; category?: string; languageCode?: string; headerFormat?: string;
  headerVarCount: number; bodyText?: string; bodyVarCount: number; headerExample?: string;
}

export interface WaTemplateValue {
  templateRef: string;
  language: string;
  headerVars: string[];
  bodyVars: string[];
  headerFormat?: string; // TEXT | IMAGE | VIDEO | DOCUMENT
  headerMedia?: string; // medya header URL
}

const MEDIA = ["IMAGE", "VIDEO", "DOCUMENT"];

export default function WhatsappTemplateFields({
  value,
  onChange,
}: {
  value: WaTemplateValue;
  onChange: (v: WaTemplateValue) => void;
}) {
  const [templates, setTemplates] = useState<Tmpl[]>([]);
  const [err, setErr] = useState("");
  const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 outline-none transition";

  useEffect(() => {
    api<{ templates: Tmpl[] }>("/channels/whatsapp/templates")
      .then((r) => setTemplates(r.templates))
      .catch((e) => setErr(e.message));
  }, []);

  const selected = templates.find((t) => t.name === value.templateRef);

  const select = (nm: string) => {
    const t = templates.find((x) => x.name === nm);
    onChange({
      templateRef: nm,
      language: t?.languageCode ?? "tr",
      headerVars: Array.from({ length: t?.headerVarCount ?? 0 }, () => "fullName"),
      bodyVars: Array.from({ length: t?.bodyVarCount ?? 0 }, () => "fullName"),
      headerFormat: t?.headerFormat,
      headerMedia: t?.headerExample ?? "", // şablonun kendi örnek medyasıyla önceden doldur
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">Şablon</label>
        {err ? (
          <p className="text-sm text-red-600">Şablonlar alınamadı: {err}</p>
        ) : (
          <select className={inputCls} value={value.templateRef} onChange={(e) => select(e.target.value)}>
            <option value="">Şablon seç…</option>
            {templates.map((t) => (
              <option key={t.name} value={t.name}>{t.name} · {t.category} · {t.languageCode}</option>
            ))}
          </select>
        )}
      </div>
      {selected && (
        <>
          {selected.bodyText && (
            <div className="text-sm text-slate-500 bg-slate-50 rounded p-3 whitespace-pre-wrap">{selected.bodyText}</div>
          )}
          {MEDIA.includes(selected.headerFormat ?? "") && (
            <div>
              <label className="block text-sm font-medium mb-1">Header medya URL'i ({selected.headerFormat})</label>
              <input
                className={inputCls}
                value={value.headerMedia ?? ""}
                onChange={(e) => onChange({ ...value, headerMedia: e.target.value })}
                placeholder="https://.../gorsel.jpg (herkese açık URL)"
              />
              <p className="text-xs text-slate-400 mt-1">Bu şablonun başlığı medya; göndermek için herkese açık bir görsel/video/döküman URL'i gerekir.</p>
            </div>
          )}
          {value.headerVars.map((v, i) => (
            <VarRow key={`h${i}`} label={`Header {{${i + 1}}}`} value={v}
              onChange={(nv) => onChange({ ...value, headerVars: value.headerVars.map((x, idx) => idx === i ? nv : x) })} />
          ))}
          {value.bodyVars.map((v, i) => (
            <VarRow key={`b${i}`} label={`Body {{${i + 1}}}`} value={v}
              onChange={(nv) => onChange({ ...value, bodyVars: value.bodyVars.map((x, idx) => idx === i ? nv : x) })} />
          ))}
        </>
      )}
    </div>
  );
}

export function VarRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const isLit = value.startsWith("lit:");
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-500 w-28">{label}</span>
      <select
        className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
        value={isLit ? "__lit__" : value}
        onChange={(e) => onChange(e.target.value === "__lit__" ? "lit:" : e.target.value)}
      >
        {TOKENS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      {isLit && (
        <input
          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
          placeholder="sabit metin…"
          value={value.slice(4)}
          onChange={(e) => onChange("lit:" + e.target.value)}
        />
      )}
    </div>
  );
}
