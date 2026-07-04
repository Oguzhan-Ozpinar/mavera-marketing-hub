/**
 * Hedef kitle oluşturma — Directus'tan segment filtresine göre kontaktları çeker.
 * segment: Directus filtre nesnesi (örn. {"donation_total":{"_gte":500},"ulke":{"_eq":"Türkiye"}}).
 */
import { readItems } from "@directus/sdk";
import type { DernekContext } from "../../dernek/dernek.context.js";
import type { AudienceContact } from "./filter.service.js";

export async function buildAudience(
  ctx: DernekContext,
  segment: Record<string, unknown> | null | undefined,
  limit = 10000,
): Promise<AudienceContact[]> {
  const rows = (await ctx.directus.request(
    readItems("Contacts", {
      filter: (segment ?? {}) as any,
      fields: ["id", "email", "phone", "first_name", "last_name", "mvr_uid", "referans", "ulke", "mail_optin", "whatsapp_optin", "sms_optin"],
      limit,
    }),
  )) as AudienceContact[];
  return rows;
}
