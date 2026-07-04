import { OP_LABEL, type FieldMeta, type Rule } from "../lib/segment";

const inputCls = "px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none";

export default function SegmentBuilder({
  fields,
  rules,
  onChange,
}: {
  fields: FieldMeta[];
  rules: Rule[];
  onChange: (r: Rule[]) => void;
}) {
  const update = (i: number, patch: Partial<Rule>) =>
    onChange(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(rules.filter((_, idx) => idx !== i));
  const add = () => onChange([...rules, { field: fields[0]?.field ?? "", op: fields[0]?.ops[0] ?? "_eq", value: "" }]);

  const metaOf = (f: string) => fields.find((x) => x.field === f);

  return (
    <div className="space-y-3">
      {rules.length === 0 && (
        <p className="text-sm text-slate-500">Kural yok → <b>tüm kontaktlar</b>. Daraltmak için kural ekleyin.</p>
      )}
      {rules.map((r, i) => {
        const meta = metaOf(r.field);
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            {i > 0 && <span className="text-xs font-semibold text-slate-400 w-8">VE</span>}
            {/* Alan */}
            <select
              className={inputCls}
              value={r.field}
              onChange={(e) => {
                const m = metaOf(e.target.value);
                update(i, { field: e.target.value, op: m?.ops[0] ?? "_eq", value: "" });
              }}
            >
              {fields.map((f) => (
                <option key={f.field} value={f.field}>
                  {f.label}
                </option>
              ))}
            </select>
            {/* Operatör */}
            <select className={inputCls} value={r.op} onChange={(e) => update(i, { op: e.target.value })}>
              {(meta?.ops ?? ["_eq"]).map((o) => (
                <option key={o} value={o}>
                  {OP_LABEL[o] ?? o}
                </option>
              ))}
            </select>
            {/* Değer */}
            {meta?.type === "boolean" ? (
              <select className={inputCls} value={r.value} onChange={(e) => update(i, { value: e.target.value })}>
                <option value="">seç…</option>
                <option value="true">Evet</option>
                <option value="false">Hayır</option>
              </select>
            ) : (
              <>
                <input
                  className={inputCls}
                  type={meta?.type === "number" ? "number" : meta?.type === "date" ? "date" : "text"}
                  value={r.value}
                  onChange={(e) => update(i, { value: e.target.value })}
                  placeholder="değer"
                  list={meta?.suggestions ? `sug-${r.field}` : undefined}
                />
                {meta?.suggestions && (
                  <datalist id={`sug-${r.field}`}>
                    {meta.suggestions.map((s) => <option key={s} value={s} />)}
                  </datalist>
                )}
              </>
            )}
            <button onClick={() => remove(i)} className="text-slate-400 hover:text-red-600 px-2" title="Kaldır">
              ✕
            </button>
          </div>
        );
      })}
      <button onClick={add} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
        + Kural ekle
      </button>
    </div>
  );
}
