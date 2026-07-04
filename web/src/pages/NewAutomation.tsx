import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import SegmentBuilder from "../components/SegmentBuilder";
import WhatsappTemplateFields, { type WaTemplateValue } from "../components/WhatsappTemplateFields";
import { rulesToConditions, conditionsToRules, type FieldMeta, type Rule } from "../lib/segment";

interface TriggerParam { key: string; label: string; type: string; suggestions?: string[] }
interface Meta {
  triggers: { value: string; label: string; params: TriggerParam[] }[];
  actions: { value: string; label: string; params: string[] }[];
  delayUnits: { value: string; label: string }[];
}
const PARAM_LABEL: Record<string, string> = { template_ref: "EO tag / şablon", title: "Görev başlığı", message: "Mesaj metni" };
const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 outline-none transition";

function Step({ tag, title, children }: { tag: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{tag}</span>
        <h3 className="font-medium">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function NewAutomation() {
  const nav = useNavigate();
  const { id } = useParams();
  const editing = !!id;
  const [meta, setMeta] = useState<Meta | null>(null);
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [triggerType, setTriggerType] = useState("");
  const [triggerParams, setTriggerParams] = useState<Record<string, string>>({});
  const [conditions, setConditions] = useState<Rule[]>([]);
  const [delayValue, setDelayValue] = useState(0);
  const [delayUnit, setDelayUnit] = useState("days");
  const [actionType, setActionType] = useState("");
  const [actionParams, setActionParams] = useState<Record<string, string>>({});
  const [wa, setWa] = useState<WaTemplateValue>({ templateRef: "", language: "tr", headerVars: [], bodyVars: [] });
  const [recheck, setRecheck] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Meta>("/automations/meta").then((m) => {
      setMeta(m);
      if (!editing) {
        setTriggerType(m.triggers[0]?.value ?? "");
        setActionType(m.actions[0]?.value ?? "");
      }
    });
    api<{ fields: FieldMeta[] }>("/segments/fields").then((r) => setFields(r.fields));
  }, [editing]);

  // Düzenleme: mevcut otomasyonu yükle
  useEffect(() => {
    if (!id) return;
    api<{ automation: any }>(`/automations/${id}`).then(({ automation: a }) => {
      setName(a.name ?? "");
      setIsActive(a.is_active !== false);
      setTriggerType(a.trigger_type ?? "");
      setTriggerParams(a.trigger_params ?? {});
      setConditions(conditionsToRules(a.conditions));
      setDelayValue(a.delay_value ?? 0);
      setDelayUnit(a.delay_unit ?? "days");
      setActionType(a.action_type ?? "");
      setRecheck(a.recheck_on_fire !== false);
      const p = a.action_params ?? {};
      if (a.action_type === "whatsapp") {
        setWa({
          templateRef: p.template_ref ?? "",
          language: p.language ?? "tr",
          headerVars: p.template_vars?.header ?? [],
          bodyVars: p.template_vars?.body ?? [],
        });
      } else {
        setActionParams(p);
      }
    });
  }, [id]);

  const trigger = meta?.triggers.find((t) => t.value === triggerType);
  const action = meta?.actions.find((a) => a.value === actionType);

  const save = async () => {
    setErr("");
    if (!name) return setErr("Otomasyon adı gerekli");
    setBusy(true);
    try {
      await api(editing ? `/automations/${id}` : "/automations", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({
          name,
          is_active: isActive,
          trigger_type: triggerType,
          trigger_params: numeric(triggerParams, trigger?.params),
          conditions: rulesToConditions(conditions, fields),
          delay_value: delayValue,
          delay_unit: delayUnit,
          action_type: actionType,
          action_params:
            actionType === "whatsapp"
              ? { template_ref: wa.templateRef, language: wa.language, template_vars: { header: wa.headerVars, body: wa.bodyVars } }
              : actionParams,
          recheck_on_fire: recheck,
        }),
      });
      nav("/automations");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!meta) return <div className="text-slate-400">Yükleniyor…</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{editing ? "Otomasyonu Düzenle" : "Yeni Otomasyon"}</h1>

      <div className="rounded-xl border border-slate-200 bg-white p-5 flex items-center gap-4">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Otomasyon adı — örn. Şükür kurbanı hatır sorma" />
        <label className="flex items-center gap-2 text-sm whitespace-nowrap">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Aktif
        </label>
      </div>

      <Step tag="NE ZAMAN" title="Bu olduğunda…">
        <select className={inputCls} value={triggerType} onChange={(e) => { setTriggerType(e.target.value); setTriggerParams({}); }}>
          {meta.triggers.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {trigger?.params.map((p) => (
          <div key={p.key} className="mt-3">
            <label className="block text-sm font-medium mb-1">{p.label}</label>
            <input
              className={inputCls}
              type={p.type === "number" ? "number" : "text"}
              list={p.suggestions ? `sug-${p.key}` : undefined}
              value={triggerParams[p.key] ?? ""}
              onChange={(e) => setTriggerParams({ ...triggerParams, [p.key]: e.target.value })}
            />
            {p.suggestions && (
              <datalist id={`sug-${p.key}`}>
                {p.suggestions.map((s) => <option key={s} value={s} />)}
              </datalist>
            )}
          </div>
        ))}
      </Step>

      <Step tag="EĞER (opsiyonel)" title="Şu koşullar sağlanıyorsa…">
        <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
          <SegmentBuilder fields={fields} rules={conditions} onChange={setConditions} />
        </div>
      </Step>

      <Step tag="BEKLE" title="Şu kadar sonra…">
        <div className="flex items-center gap-3">
          <input type="number" min={0} className="w-28 px-3 py-2 rounded-lg border border-slate-300" value={delayValue} onChange={(e) => setDelayValue(Number(e.target.value))} />
          <select className="px-3 py-2 rounded-lg border border-slate-300 bg-white" value={delayUnit} onChange={(e) => setDelayUnit(e.target.value)}>
            {meta.delayUnits.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
          <span className="text-sm text-slate-500">(0 = hemen)</span>
        </div>
      </Step>

      <Step tag="YAP" title="Bunu yap">
        <select className={inputCls} value={actionType} onChange={(e) => { setActionType(e.target.value); setActionParams({}); }}>
          {meta.actions.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        {actionType === "whatsapp" ? (
          <div className="mt-3">
            <WhatsappTemplateFields value={wa} onChange={setWa} />
          </div>
        ) : (
          action?.params.map((k) => (
            <div key={k} className="mt-3">
              <label className="block text-sm font-medium mb-1">{PARAM_LABEL[k] ?? k}</label>
              <input className={inputCls} value={actionParams[k] ?? ""} onChange={(e) => setActionParams({ ...actionParams, [k]: e.target.value })} />
            </div>
          ))
        )}
        <label className="flex items-center gap-2 text-sm mt-3 text-slate-600">
          <input type="checkbox" checked={recheck} onChange={(e) => setRecheck(e.target.checked)} />
          Gönderim anında koşulu tekrar kontrol et (örn. kişi arada bağış yaptıysa iptal)
        </label>
      </Step>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-3">
        <button onClick={() => nav("/automations")} className="px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">İptal</button>
        <button disabled={busy} onClick={save} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-60">
          {busy ? "Kaydediliyor…" : "Otomasyonu kaydet"}
        </button>
      </div>
    </div>
  );
}

// number tipli trigger paramlarını sayıya çevir
function numeric(params: Record<string, string>, defs?: TriggerParam[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    const def = defs?.find((d) => d.key === k);
    out[k] = def?.type === "number" ? Number(v) : v;
  }
  return out;
}
