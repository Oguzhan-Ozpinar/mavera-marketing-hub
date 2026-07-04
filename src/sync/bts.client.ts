/**
 * BTS pull client — YALNIZCA ilk kurulum BACKFILL'i için.
 *
 * Neden gerekli: Günlük akış BTS'in push'uyla gelir (resolveDonor → /webhooks/bts/.../donation).
 * Ama BTS'te ZATEN mvr_uuid'li (eşleşmiş) tarihsel bağışlar tekrar push EDİLMEZ.
 * Bu yüzden bir kereye mahsus, BTS'in PRECOMPUTE RFM'ini (`Bagiscilar.bagis_adedi`/`toplam_miktar`)
 * çekip kontaktların RFM özetini seed'leriz.
 *
 * ⚠️ Durum: Canlı BTS + kesin auth endpoint'i gerektirir (BTS auth = kullanıcı JWT, 1sa TTL).
 * Kesin endpoint/auth doğrulanana kadar guard'lı; BTS_API_URL yoksa no-op.
 * Kaynak: BTS_API.md §4, §8 (Bagiscilar precompute).
 */
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { updateItem } from "@directus/sdk";
import type { DernekContext } from "../dernek/dernek.context.js";
import { upsertContact } from "../modules/contacts/upsert.service.js";

interface BtsBagisci {
  cep_no?: string;
  email?: string;
  adi?: string;
  soyadi?: string;
  bagis_adedi?: number; // F — precompute
  toplam_miktar?: number; // M — precompute
  kayit_tarihi?: string; // ilk bağış
  api_kaynaklari?: string[];
}

/** BTS'e login olup kullanıcı JWT'si alır (1sa TTL). TODO: kesin endpoint doğrula. */
async function login(): Promise<string | null> {
  if (!env.BTS_API_URL || !env.BTS_API_KEY) return null;
  // TODO(canlı): BTS auth endpoint'i (controllers/auth.js) — email/şifre veya servis kullanıcısı.
  //   BTS dış sistemler için kalıcı API key sunmuyor; ideali BTS'e API-key auth eklenmesi (BTS_API.md §7.öneri-1).
  logger.warn("BTS login henüz bağlanmadı (kesin auth endpoint'i gerekli)");
  return null;
}

/**
 * Bagiscilar'dan RFM backfill (bir kereye mahsus).
 * Her bağışçıyı telefonla upsert edip precompute F/M'i kontakta yazar.
 */
export async function backfillRfmFromBagiscilar(ctx: DernekContext): Promise<{ processed: number; skipped: boolean }> {
  const token = await login();
  if (!token) {
    logger.warn(`BTS backfill atlandı (dernek ${ctx.id}): canlı BTS/auth yok`);
    return { processed: 0, skipped: true };
  }

  let processed = 0;
  let page = 1;
  const size = 100;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // TODO(canlı): GET /api/bagisci/listele (offset/limit) — BTS_API.md §4
    const res = await fetch(`${env.BTS_API_URL}/api/bagisci/listele?page=${page}&size=${size}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;
    const json = (await res.json()) as { data?: BtsBagisci[] };
    const rows = json.data ?? [];
    if (rows.length === 0) break;

    for (const b of rows) {
      const { contact } = await upsertContact(
        ctx,
        { first_name: b.adi, last_name: b.soyadi, phone: b.cep_no, email: b.email },
        "bts",
      );
      await ctx.directus.request(
        updateItem("Contacts", contact.id, {
          donation_count: b.bagis_adedi ?? 0,
          donation_total: b.toplam_miktar ?? 0,
          first_donation_at: b.kayit_tarihi ?? null,
        }),
      );
      processed++;
    }
    page++;
  }
  logger.info(`BTS backfill tamam (dernek ${ctx.id}): ${processed} bağışçı`);
  return { processed, skipped: false };
}
