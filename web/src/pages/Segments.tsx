import { useEffect, useState } from "react";
import { api } from "../lib/api";
import SegmentBuilder from "../components/SegmentBuilder";
import { buildFilter, type FieldMeta, type Rule } from "../lib/segment";

interface Segment {
  id: string;
  name: string;
  description?: string;
  definition?: { rules?: Rule[] };
}

interface Editing {
  id?: string;
  name: string;
  description: string;
  rules: Rule[];
}

export default function Segments() {
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [list, setList] = useState<Segment[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const load = () => api<{ segments: Segment[] }>("/segments").then((r) => setList(r.segments));
  useEffect(() => {
    api<{ fields: FieldMeta[] }>("/segments/fields").then((r) => setFields(r.fields));
    load();
  }, []);

  const startNew = () => {
    setCount(null);
    setEditing({ name: "", description: "", rules: [] });
  };
  const startEdit = (s: Segment) => {
    setCount(null);
    setEditing({ id: s.id, name: s.name, description: s.description ?? "", rules: s.definition?.rules ?? [] });
  };

  const preview = async () => {
    if (!editing) return;
    const r = await api<{ total: number }>("/segments/preview", {
      method: "POST",
      body: JSON.stringify({ segment: buildFilter(editing.rules, fields) }),
    });
    setCount(r.total);
  };

  const save = async () => {
    if (!editing) return;
    setErr("");
    if (!editing.name) return setErr("Segment adı gerekli");
    const payload = { name: editing.name, description: editing.description, definition: { rules: editing.rules } };
    if (editing.id) await api(`/segments/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/segments", { method: "POST", body: JSON.stringify(payload) });
    setEditing(null);
    load();
  };

  const del = async (id: string) => {
    await api(`/segments/${id}`, { method: "DELETE" });
    load();
  };

  const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 outline-none transition";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Segmentler</h1>
        {!editing && (
          <button onClick={startNew} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors">
            + Yeni Segment
          </button>
        )}
      </div>

      {editing ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Segment adı</label>
            <input className={inputCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Örn. Düzenli bağışçılar" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Açıklama (opsiyonel)</label>
            <input className={inputCls} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Kurallar</label>
            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
              <SegmentBuilder fields={fields} rules={editing.rules} onChange={(rules) => setEditing({ ...editing, rules })} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={preview} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium hover:bg-slate-50">
              Önizle
            </button>
            {count != null && <span className="text-sm text-slate-600"><b>{count}</b> kişi</span>}
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">İptal</button>
            <button onClick={save} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors">Kaydet</button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {list.length === 0 ? (
            <div className="p-8 text-center text-slate-400">Segment yok. “Yeni Segment” ile oluştur.</div>
          ) : (
            list.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-0">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-slate-500">
                    {s.description || `${s.definition?.rules?.length ?? 0} kural`}
                  </div>
                </div>
                <div className="flex gap-3 text-sm">
                  <button onClick={() => startEdit(s)} className="text-indigo-600 hover:text-indigo-800">Düzenle</button>
                  <button onClick={() => del(s.id)} className="text-slate-400 hover:text-red-600">Sil</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
