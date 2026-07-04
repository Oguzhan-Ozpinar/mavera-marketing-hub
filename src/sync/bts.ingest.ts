/**
 * BTS bağış ingest — BTS'in mevcut push'u (resolveDonor cron) bizim Hub'a bağış gönderir.
 * Yaptıklarımız:
 *   1) Telefonla kontakt upsert (kimlik çözümleme — phone.ts)
 *   2) RFM ÖZETİ güncelle (tam mirror YOK; kontakt üstünde toplam/adet/tip)
 *   3) donation_created olayını akış motoruna ver (şükür kurbanı vb.)
 *   4) mvr_uid döndür (BTS Bagislar.mvr_uuid'ye yazar)
 *
 * Not: BTS'te consent YOK → burada optin set etmiyoruz (KVKK izni forma/İYS'ye ait).
 * Idempotency (bts_id) çağıran route'ta webhook_events ile sağlanır.
 */
import { randomUUID } from "node:crypto";
import { updateItem } from "@directus/sdk";
import type { DernekContext } from "../dernek/dernek.context.js";
import { upsertContact } from "../modules/contacts/upsert.service.js";
import { handleEvent } from "../modules/journeys/journey.engine.js";
import { logger } from "../lib/logger.js";

export interface BtsDonationPayload {
  bts_id: string; // Bagislar._id (ObjectId)
  cep_no?: string;
  email?: string;
  adi?: string;
  soyadi?: string;
  bagis_turu?: string; // donation_type (proje tipine bağlı string)
  miktari?: number; // tutar
  verilis_tarihi?: string; // ISO tarih
}

export interface IngestResult {
  contactId: string;
  mvr_uid: string;
  created: boolean;
}

function mergeDonationTypes(
  existing: Record<string, { count: number; last: string }> | null | undefined,
  type: string | undefined,
  when: string,
): Record<string, { count: number; last: string }> {
  const out = { ...(existing ?? {}) };
  if (!type) return out;
  const prev = out[type];
  out[type] = { count: (prev?.count ?? 0) + 1, last: when };
  return out;
}

export async function ingestDonation(ctx: DernekContext, p: BtsDonationPayload): Promise<IngestResult> {
  const when = p.verilis_tarihi ?? new Date().toISOString();

  // 1) Kimlik çözümleme (telefon birincil)
  const { contact, created } = await upsertContact(
    ctx,
    { first_name: p.adi, last_name: p.soyadi, phone: p.cep_no, email: p.email },
    "bts",
  );

  // 2) RFM özeti güncelle
  const amount = Number(p.miktari ?? 0);
  const prevCount = Number(contact.donation_count ?? 0);
  const prevTotal = Number(contact.donation_total ?? 0);
  const prevFirst: string | null = contact.first_donation_at ?? null;
  const prevLast: string | null = contact.last_donation_at ?? null;

  const mergedTypes = mergeDonationTypes(contact.donation_types, p.bagis_turu, when);
  const rfm: Record<string, unknown> = {
    donation_count: prevCount + 1,
    donation_total: prevTotal + amount,
    last_donation_at: !prevLast || when > prevLast ? when : prevLast,
    first_donation_at: !prevFirst || when < prevFirst ? when : prevFirst,
    donation_types: mergedTypes,
    donation_type_list: Object.keys(mergedTypes).join(","), // segment filtresi için düz liste
  };

  // 3) mvr_uid garanti et (yoksa üret — BTS bunu Bagislar.mvr_uuid'ye yazar)
  const mvr_uid: string = contact.mvr_uid || randomUUID();
  if (!contact.mvr_uid) rfm.mvr_uid = mvr_uid;

  await ctx.directus.request(updateItem("Contacts", contact.id, rfm));

  // 4) Akış motoru: donation_created (+ donation_type tetikleyicileri)
  handleEvent(ctx, {
    type: "donation_created",
    contactId: String(contact.id),
    payload: { donation_type: p.bagis_turu, amount },
  }).catch((e) => logger.warn(`akış tetikleme (bağış) hatası: ${e.message}`));

  return { contactId: String(contact.id), mvr_uid, created };
}
