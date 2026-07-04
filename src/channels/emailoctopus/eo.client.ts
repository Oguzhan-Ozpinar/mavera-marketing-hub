/**
 * EmailOctopus v2 istemcisi.
 * ⚠️ ÖNEMLİ: EO v2'de kampanya API ile GÖNDERİLEMEZ (campaigns yalnızca okunur).
 * E-posta gönderim akışı: kontağı listeye TAG ile ekle/güncelle → derneğin EO otomasyonu
 * (o tag'e bağlı) e-postayı gönderir. Yani "template_ref" burada EO TAG'idir.
 * Bounce/complaint raporları GET /campaigns/{id}/reports ile çekilir (blacklist için).
 */
import { createHash } from "node:crypto";
import type { DernekContext } from "../../dernek/dernek.context.js";

const BASE = "https://api.emailoctopus.com";

function contactId(email: string): string {
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex"); // EO kontakt id = md5(lowercase email)
}

/** Kontağı listeye upsert eder ve (varsa) tag uygular → EO otomasyonu tetiklenir. */
export async function upsertEoContactTag(
  ctx: DernekContext,
  opts: { email: string; tag?: string; fields?: Record<string, unknown> },
): Promise<string> {
  const c = ctx.config.emailoctopus;
  if (!c?.apiKey) throw new Error("EmailOctopus apiKey eksik");
  if (!c.listId) throw new Error("EmailOctopus list id eksik (API Ayarları)");

  const id = contactId(opts.email);
  const res = await fetch(`${BASE}/lists/${c.listId}/contacts/${id}`, {
    method: "PUT", // v2 PUT upsert (yoksa oluşturur, varsa günceller)
    headers: { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email_address: opts.email,
      status: "subscribed",
      ...(opts.tag ? { tags: { [opts.tag]: true } } : {}),
      ...(opts.fields ? { fields: opts.fields } : {}),
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { title?: string; detail?: string };
    throw new Error(j.detail ?? j.title ?? `EmailOctopus ${res.status}`);
  }
  return id;
}
