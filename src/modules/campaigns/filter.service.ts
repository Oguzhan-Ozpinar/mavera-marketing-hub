/**
 * Fail-safe çapraz filtre — gönderim öncesi son güvenlik.
 * (1) izin (optin) kontrolü  (2) geçerli iletişim noktası  (3) blacklist (Redis, O(1)).
 * Eşleşen kişi payload'a ASLA girmez.
 */
import { filterAllowed } from "../blacklist/blacklist.service.js";
import type { DernekContext } from "../../dernek/dernek.context.js";
import type { Channel } from "../../channels/sender.js";

export interface AudienceContact {
  id: string;
  email?: string | null;
  phone?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  mvr_uid?: string | null;
  mail_optin?: boolean | null;
  whatsapp_optin?: boolean | null;
  sms_optin?: boolean | null;
}

export interface Recipient {
  contactId: string;
  to: string;
}

export interface FilterOutcome {
  allowed: Recipient[];
  skipped: Array<{ contactId: string; reason: string }>;
}

const CHANNEL_MAP: Record<Channel, { optin: keyof AudienceContact; point: "email" | "phone" }> = {
  email: { optin: "mail_optin", point: "email" },
  sms: { optin: "sms_optin", point: "phone" },
  whatsapp: { optin: "whatsapp_optin", point: "phone" },
};

export async function filterRecipients(
  dernek: DernekContext,
  channel: Channel,
  contacts: AudienceContact[],
  opts: { requireOptin?: boolean } = {},
): Promise<FilterOutcome> {
  const requireOptin = opts.requireOptin ?? true; // bilgilendirme SMS'te false
  const map = CHANNEL_MAP[channel];
  const skipped: FilterOutcome["skipped"] = [];
  const candidates: Recipient[] = [];

  for (const c of contacts) {
    if (requireOptin && c[map.optin] !== true) {
      skipped.push({ contactId: c.id, reason: "izin yok (optin false)" });
      continue;
    }
    const to = c[map.point];
    if (!to) {
      skipped.push({ contactId: c.id, reason: `iletişim noktası yok (${map.point})` });
      continue;
    }
    candidates.push({ contactId: c.id, to });
  }

  // Blacklist filtresi (kanal + global)
  const values = candidates.map((r) => r.to);
  const allowedValues = await filterAllowed(dernek.id, channel, values);
  const allowed: Recipient[] = [];
  for (const r of candidates) {
    if (allowedValues.has(r.to)) allowed.push(r);
    else skipped.push({ contactId: r.contactId, reason: "blacklist" });
  }

  return { allowed, skipped };
}
