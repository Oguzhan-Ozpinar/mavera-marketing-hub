import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { api } from "../lib/api";
import SegmentBuilder from "../components/SegmentBuilder";
import WhatsappTemplateFields from "../components/WhatsappTemplateFields";
import { buildFilter, type FieldMeta, type Rule } from "../lib/segment";

// "telefon" veya "telefon,isim" satırları → [{to, name}]
function parseManual(text: string): Array<{ to: string; name?: string }> {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [to, ...rest] = l.split(/[,;\t]/);
      return { to: (to ?? "").trim(), name: rest.join(" ").trim() || undefined };
    })
    .filter((r) => r.to);
}

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-posta" },
  { value: "sms", label: "SMS" },
];
const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-300 bg-white hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 outline-none transition";

interface Preview { total: number; sendable?: number; skipped?: number; skippedReasons?: Record<string, number>; estimatedCostTRY?: number }

export default function NewCampaign() {
  const nav = useNavigate();
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [saved, setSaved] = useState<Array<{ id: string; name: string; definition?: { rules?: Rule[] } }>>([]);

  const [name, setName] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [templateRef, setTemplateRef] = useState("");
  const [language, setLanguage] = useState("tr");
  const [headerVars, setHeaderVars] = useState<string[]>([]);
  const [bodyVars, setBodyVars] = useState<string[]>([]);
  const [headerFormat, setHeaderFormat] = useState<string | undefined>(undefined);
  const [headerMedia, setHeaderMedia] = useState("");
  const [message, setMessage] = useState("");
  const [iysfilter, setIysfilter] = useState("11");
  const [rules, setRules] = useState<Rule[]>([]);
  const [audienceType, setAudienceType] = useState<"segment" | "manual">("segment");
  const [manualText, setManualText] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState("");
  const [testHeader, setTestHeader] = useState<string[]>([]);
  const [testBody, setTestBody] = useState<string[]>([]);
  const [testMedia, setTestMedia] = useState("");

  useEffect(() => {
    api<{ fields: FieldMeta[] }>("/segments/fields").then((r) => setFields(r.fields)).catch(() => {});
    api<{ segments: typeof saved }>("/segments").then((r) => setSaved(r.segments)).catch(() => {});
  }, []);

  const loadSegment = (id: string) => {
    setRules(saved.find((s) => s.id === id)?.definition?.rules ?? []);
    setPreview(null);
  };

  // Excel/CSV → "telefon,isim" satırlarına dök (ilk iki sütun)
  const handleFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false });
    const lines = rows
      .map((r) => [r?.[0], r?.[1]].filter(Boolean).join(","))
      .filter((l) => l && !/telefon|phone|gsm|isim|ad/i.test(l)); // başlık satırını atla
    setManualText(lines.join("\n"));
  };

  const manualRecipients = parseManual(manualText);

  // Örnek Excel indir (kanal'a göre başlık)
  const downloadSample = () => {
    const head = channel === "email" ? ["email", "isim"] : ["telefon", "isim"];
    const sample = channel === "email"
      ? [["ornek@mail.com", "Ahmet Yılmaz"], ["baska@mail.com", "Ayşe Demir"]]
      : [["905321112233", "Ahmet Yılmaz"], ["905334445566", "Ayşe Demir"]];
    const ws = XLSX.utils.aoa_to_sheet([head, ...sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Alicilar");
    XLSX.writeFile(wb, "ornek-liste.xlsx");
  };

  const doPreview = async () => {
    setErr("");
    try {
      const r = await api<Preview>("/segments/preview", {
        method: "POST",
        body: JSON.stringify({ segment: buildFilter(rules, fields), channel, iysfilter }),
      });
      setPreview(r);
    } catch (e: any) { setErr(e.message); }
  };

  const save = async (thenTrigger: boolean) => {
    setErr("");
    if (!name) return setErr("Kampanya adı gerekli");
    if (channel === "whatsapp" && !templateRef) return setErr("Şablon seçin");
    if (channel === "sms" && !message) return setErr("SMS mesajı girin");
    if (audienceType === "manual" && manualRecipients.length === 0) return setErr("Manuel liste boş");
    setBusy(true);
    try {
      const scheduled = scheduledAt ? new Date(scheduledAt).toISOString() : null;
      const { campaign } = await api<{ campaign: { id: string } }>("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name, channel, template_ref: templateRef, language,
          template_vars: { header: headerVars, body: bodyVars },
          header_media: headerMedia,
          message, iysfilter,
          audience_type: audienceType,
          manual_recipients: audienceType === "manual" ? manualRecipients : [],
          segment: audienceType === "segment" ? buildFilter(rules, fields) : {},
          scheduled_at: scheduled,
        }),
      });
      // Planlıysa tetikleme (zamanlayıcı gönderir); değilse istenirse hemen gönder
      if (thenTrigger && !scheduled) await api(`/campaigns/${campaign.id}/trigger`, { method: "POST" });
      nav("/campaigns");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const testSend = async () => {
    setTestMsg("");
    if (!testTo) return setTestMsg("Test numarası/e-posta girin");
    try {
      const r = await api<{ dryRun?: boolean }>("/channels/test-send", {
        method: "POST",
        body: JSON.stringify({
          to: testTo, channel, template_ref: templateRef, language,
          header: testHeader, body: testBody, header_media: testMedia, message, iysfilter,
        }),
      });
      setTestMsg(r.dryRun ? "✓ Gönderildi (dry-run — anahtar yok)" : "✓ Test gönderildi");
    } catch (e: any) { setTestMsg("✗ " + e.message); }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Yeni Kampanya</h1>
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Kampanya adı</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Kurban 2026 Bülteni" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Kanal</label>
          <select className={inputCls} value={channel} onChange={(e) => { setChannel(e.target.value); setTemplateRef(""); setPreview(null); }}>
            {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        {/* WhatsApp: şablon + değişken eşleme */}
        {channel === "whatsapp" && (
          <div className="rounded-lg border border-slate-200 p-4">
            <WhatsappTemplateFields
              value={{ templateRef, language, headerVars, bodyVars, headerFormat, headerMedia }}
              onChange={(v) => {
                setTemplateRef(v.templateRef); setLanguage(v.language);
                setHeaderVars(v.headerVars); setBodyVars(v.bodyVars);
                setHeaderFormat(v.headerFormat); setHeaderMedia(v.headerMedia ?? "");
                setTestHeader(Array(v.headerVars.length).fill("")); setTestBody(Array(v.bodyVars.length).fill("")); setTestMedia("");
              }}
            />
          </div>
        )}

        {/* SMS: düz metin */}
        {channel === "sms" && (
          <div>
            <label className="block text-sm font-medium mb-1">SMS mesajı</label>
            <textarea className={inputCls} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Mesaj metni…" />
            <p className="text-xs text-slate-400 mt-1">Türkçe karakterli mesaj 70 karakter/parça. Uzun mesaj birden çok parça = daha yüksek maliyet.</p>
            <div className="mt-3">
              <label className="block text-sm font-medium mb-1">Mesaj türü</label>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="iys" checked={iysfilter === "11"} onChange={() => setIysfilter("11")} />
                  Ticari / pazarlama <span className="text-slate-400">(İYS onaylı — marka kodu gerekir)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="iys" checked={iysfilter === "0"} onChange={() => setIysfilter("0")} />
                  Bilgilendirme <span className="text-slate-400">(İYS gerekmez)</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {channel === "email" && (
          <div>
            <label className="block text-sm font-medium mb-1">EmailOctopus kampanya/şablon referansı</label>
            <input className={inputCls} value={templateRef} onChange={(e) => setTemplateRef(e.target.value)} placeholder="EO kampanya id/adı" />
          </div>
        )}

        {/* Hedef kitle */}
        <div>
          <label className="block text-sm font-medium mb-2">Hedef kitle</label>
          <div className="flex gap-4 text-sm mb-3">
            <label className="flex items-center gap-2">
              <input type="radio" checked={audienceType === "segment"} onChange={() => { setAudienceType("segment"); setPreview(null); }} />
              Kayıtlı kontaklar (segment)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={audienceType === "manual"} onChange={() => { setAudienceType("manual"); setPreview(null); }} />
              Manuel liste (Excel / yapıştır)
            </label>
          </div>

          {audienceType === "segment" ? (
            <>
              {saved.length > 0 && (
                <select className="w-full mb-3 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm" defaultValue="" onChange={(e) => e.target.value && loadSegment(e.target.value)}>
                  <option value="">Kayıtlı segment seç… (veya aşağıdan kural kur)</option>
                  {saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                <SegmentBuilder fields={fields} rules={rules} onChange={setRules} />
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50 space-y-2">
              <p className="text-xs text-slate-500">
                Her satır: <code>{channel === "email" ? "email" : "telefon"}</code> veya <code>{channel === "email" ? "email,isim" : "telefon,isim"}</code>.
                Liste-dışı kişilere gönderim (opt-in aranmaz, blacklist yine geçerli). WhatsApp / SMS / E-posta için çalışır.
              </p>
              <div className="flex items-center gap-3">
                <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} className="text-sm" />
                <button type="button" onClick={downloadSample} className="text-sm text-indigo-600 hover:text-indigo-800 whitespace-nowrap">↓ Örnek Excel indir</button>
              </div>
              <textarea
                className={`${inputCls} font-mono text-sm`}
                rows={6}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder={channel === "email" ? "ahmet@mail.com,Ahmet Yılmaz\nayse@mail.com,Ayşe Demir" : "905321112233,Ayşe Yılmaz\n905334445566,Mehmet Demir"}
              />
              <p className="text-sm text-slate-600">{manualRecipients.length} alıcı</p>
            </div>
          )}
        </div>

        {/* Planlama */}
        <div>
          <label className="block text-sm font-medium mb-1">Planla (opsiyonel)</label>
          <input type="datetime-local" className={inputCls} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          <p className="text-xs text-slate-400 mt-1">Boş bırakırsan hemen gönderebilirsin. Tarih seçersen o zamanda otomatik gönderilir.</p>
        </div>

        {audienceType === "segment" && (
          <>
            <div className="flex items-center gap-3">
              <button onClick={doPreview} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium hover:bg-slate-50">Önizle (kaç kişi?)</button>
              {preview && (
                <div className="text-sm text-slate-600">
                  <b>{preview.total}</b> eşleşti
                  {preview.sendable != null && <> · <b className="text-emerald-600">{preview.sendable}</b> gönderilebilir · {preview.skipped} atlandı</>}
                  {preview.estimatedCostTRY != null && <> · 💰 ~<b>{preview.estimatedCostTRY} ₺</b> (tahmini)</>}
                </div>
              )}
            </div>
            {preview?.skippedReasons && Object.keys(preview.skippedReasons).length > 0 && (
              <div className="text-xs text-slate-500">Atlananlar: {Object.entries(preview.skippedReasons).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>
            )}
          </>
        )}

        {/* Test gönderim */}
        <div className="rounded-lg border border-dashed border-slate-300 p-4 bg-slate-50 space-y-2">
          <label className="block text-sm font-medium">🧪 Test gönder</label>
          <p className="text-xs text-slate-500">Kampanyayı kaydetmeden tek bir numaraya/e-postaya dene. Değişkenli/medya şablonlarda test değerlerini aşağıya gir.</p>

          {channel === "whatsapp" && headerFormat && ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat) && (
            <input className={inputCls} value={testMedia} onChange={(e) => setTestMedia(e.target.value)} placeholder="Test medya URL'i (görsel/video)" />
          )}
          {channel === "whatsapp" && testHeader.map((v, i) => (
            <input key={`th${i}`} className={inputCls} value={v} onChange={(e) => setTestHeader(testHeader.map((x, idx) => idx === i ? e.target.value : x))} placeholder={`Test Header {{${i + 1}}}`} />
          ))}
          {channel === "whatsapp" && testBody.map((v, i) => (
            <input key={`tb${i}`} className={inputCls} value={v} onChange={(e) => setTestBody(testBody.map((x, idx) => idx === i ? e.target.value : x))} placeholder={`Test Body {{${i + 1}}}`} />
          ))}

          <div className="flex items-center gap-2">
            <input className={inputCls} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={channel === "email" ? "test@ornek.com" : "905XXXXXXXXX"} />
            <button onClick={testSend} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium hover:bg-white active:bg-slate-100 transition-colors whitespace-nowrap">Test gönder</button>
          </div>
          {testMsg && <p className={`text-sm mt-1 ${testMsg.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>{testMsg}</p>}
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button disabled={busy} onClick={() => save(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium hover:bg-slate-50 disabled:opacity-60">Taslak kaydet</button>
          {scheduledAt ? (
            <button disabled={busy} onClick={() => save(false)} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-60">
              {busy ? "İşleniyor…" : "🕐 Planla"}
            </button>
          ) : (
            <button disabled={busy} onClick={() => save(true)} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-60">
              {busy ? "İşleniyor…" : "Kaydet ve Gönder"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
