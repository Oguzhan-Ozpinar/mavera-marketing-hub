/**
 * Contacts upsert — "akıllı kapı".
 * Gelen kişi verisini telefonla (E.164 / son-10-hane) eşleştirir:
 *   - Varsa günceller (mükerrer kart açmaz), yoksa yeni ekler.
 *   - İzin değişikliklerini consent_log'a yazar (KVKK kanıtı).
 * Eşleştirme sırası: phone_last10 → email. (mvr_uid GÜVENİLMEZ, kullanılmaz.)
 */
import { createItem, readItems, updateItem } from "@directus/sdk";
import { normalizePhone } from "../../lib/phone.js";
import type { DernekContext } from "../../dernek/dernek.context.js";

export interface ContactInput {
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  mvr_uid?: string;
  referans?: string;
  ulke?: string;
  adres?: string;
  whatsapp_optin?: boolean;
  mail_optin?: boolean;
  sms_optin?: boolean;
  phone_call_optin?: boolean;
}

export type ConsentSource = "form" | "iys" | "eo" | "netgsm" | "manual" | "bts";

interface UpsertResult {
  contact: Record<string, any>;
  created: boolean;
  matchedBy: "phone" | "email" | null;
}

const OPTIN_CHANNELS: Array<{ field: keyof ContactInput; channel: string }> = [
  { field: "mail_optin", channel: "email" },
  { field: "whatsapp_optin", channel: "whatsapp" },
  { field: "sms_optin", channel: "sms" },
  { field: "phone_call_optin", channel: "voice" },
];

export async function upsertContact(
  ctx: DernekContext,
  input: ContactInput,
  source: ConsentSource = "form",
  meta: { ip?: string; consentTextVersion?: string } = {},
): Promise<UpsertResult> {
  const norm = normalizePhone(input.phone);
  const d = ctx.directus;

  // 1) Eşleşen kontaktı bul — önce telefon (son-10-hane), sonra email
  let existing: Record<string, any> | null = null;
  let matchedBy: "phone" | "email" | null = null;

  if (norm.last10) {
    const rows = (await d.request(
      readItems("Contacts", { filter: { phone_last10: { _eq: norm.last10 } }, limit: 1 }),
    )) as Record<string, any>[];
    if (rows[0]) {
      existing = rows[0];
      matchedBy = "phone";
    }
  }
  if (!existing && input.email) {
    const rows = (await d.request(
      readItems("Contacts", { filter: { email: { _eq: input.email } }, limit: 1 }),
    )) as Record<string, any>[];
    if (rows[0]) {
      existing = rows[0];
      matchedBy = "email";
    }
  }

  // 2) Yazılacak alanları hazırla (yalnızca gelenleri; boş değerler mevcut veriyi ezmez)
  const payload: Record<string, any> = {};
  const setIf = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== "") payload[k] = v;
  };
  setIf("first_name", input.first_name);
  setIf("last_name", input.last_name);
  setIf("email", input.email);
  setIf("mvr_uid", input.mvr_uid);
  setIf("referans", input.referans);
  setIf("ulke", input.ulke);
  setIf("adres", input.adres);
  if (norm.e164) {
    payload.phone = norm.e164;
    payload.phone_last10 = norm.last10;
  }
  for (const { field } of OPTIN_CHANNELS) {
    if (typeof input[field] === "boolean") payload[field] = input[field];
  }

  // 3) Upsert
  let contact: Record<string, any>;
  if (existing) {
    contact = (await d.request(updateItem("Contacts", existing.id, payload))) as Record<string, any>;
  } else {
    contact = (await d.request(createItem("Contacts", payload))) as Record<string, any>;
  }

  // 4) İzin değişikliklerini consent_log'a yaz
  await logConsentChanges(ctx, contact.id, existing, input, source, meta);

  return { contact, created: !existing, matchedBy };
}

async function logConsentChanges(
  ctx: DernekContext,
  contactId: string,
  existing: Record<string, any> | null,
  input: ContactInput,
  source: ConsentSource,
  meta: { ip?: string; consentTextVersion?: string },
): Promise<void> {
  const now = new Date().toISOString();
  for (const { field, channel } of OPTIN_CHANNELS) {
    const val = input[field];
    if (typeof val !== "boolean") continue; // izin bilgisi gelmediyse atla
    const prev = existing?.[field];
    if (existing && prev === val) continue; // değişmediyse loglama
    await ctx.directus.request(
      createItem("consent_log", {
        contact_id: contactId,
        channel,
        action: val ? "optin" : "ret",
        source,
        consent_text_version: meta.consentTextVersion ?? null,
        ip: meta.ip ?? null,
        occurred_at: now,
      }),
    );
  }
}
