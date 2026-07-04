/**
 * Tek seferlik GERÇEK WhatsApp gönderim testi (kullanıcı izniyle).
 * Kullanım: tsx src/scripts/test-send.ts 905312952258
 */
import { getDernekContext } from "../dernek/dernek.context.js";
import { listTemplates, sendTemplate } from "../channels/monochat/mc.client.js";

const to = process.argv[2] ?? "905312952258";

const ctx = getDernekContext("dernek-a");
const templates = await listTemplates(ctx);

// Basit MARKETING şablon: header yok, en fazla 1 body değişkeni
const t =
  templates.find((x) => x.name === "tekrar") ??
  templates.find((x) => x.category === "MARKETING" && !x.headerFormat && x.bodyVarCount <= 1);

if (!t) {
  console.error("Uygun şablon bulunamadı");
  process.exit(1);
}
console.log(`Şablon: ${t.name} (${t.category}, body vars: ${t.bodyVarCount}, header: ${t.headerFormat ?? "yok"})`);
console.log(`Body: ${t.bodyText ?? ""}`);

const res = await sendTemplate(ctx, {
  to,
  templateName: t.name,
  languageCode: t.languageCode,
  variables: { body: t.bodyVarCount ? ["Serhat"] : [] },
});
console.log(`✅ Gönderildi → ${to} · bulkMessageId: ${res}`);
process.exit(0);
