/**
 * Akış işi çalıştırma (gecikme dolunca worker çağırır).
 * 1) kuralı yeniden yükle (hâlâ aktif mi) 2) recheck_on_fire → koşulu tekrar kontrol
 * 3) fail-safe filtre (izin + blacklist) 4) aksiyon (gönder / görev oluştur).
 */
import { createItem, readItem, readItems } from "@directus/sdk";
import type { DernekContext } from "../../dernek/dernek.context.js";
import { logger } from "../../lib/logger.js";
import { sendMessage, type Channel } from "../../channels/sender.js";
import { filterRecipients, type AudienceContact } from "../campaigns/filter.service.js";
import { resolveToken } from "../campaigns/campaigns.service.js";
import { evalConditions, type AutomationRule } from "./journey.eval.js";

const SEND_CHANNELS: Channel[] = ["whatsapp", "email", "sms"];

export async function executeJourney(ctx: DernekContext, ruleId: string, contactId: string): Promise<string> {
  const rule = (await ctx.directus.request(readItem("automation_rules", ruleId))) as AutomationRule | null;
  if (!rule || !rule.is_active) return "kural pasif/yok";

  const rows = (await ctx.directus.request(
    readItems("Contacts", {
      filter: { id: { _eq: contactId } },
      limit: 1,
      fields: ["id", "email", "phone", "first_name", "last_name", "mvr_uid", "referans", "ulke", "mail_optin", "whatsapp_optin", "sms_optin"],
    }),
  )) as AudienceContact[];
  const contact = rows[0];
  if (!contact) return "kontakt yok";

  // Gönderim anında yeniden kontrol (örn. kişi arada bağış yaptıysa "sizi özledik" iptal)
  if (rule.recheck_on_fire !== false && !evalConditions(rule.conditions, contact)) {
    return "koşul artık geçerli değil (iptal)";
  }

  const action = rule.action_type;
  const params = rule.action_params ?? {};

  if (SEND_CHANNELS.includes(action as Channel)) {
    const channel = action as Channel;
    // Fail-safe: izin + iletişim noktası + blacklist
    const { allowed, skipped } = await filterRecipients(ctx, channel, [contact]);
    if (allowed.length === 0) {
      return `filtrelendi: ${skipped[0]?.reason ?? "bilinmiyor"}`;
    }
    // WhatsApp şablon değişkenlerini kişiye göre çöz
    const tv = (params.template_vars ?? {}) as { header?: string[]; body?: string[] };
    const vars = {
      header: params.header_media ? [params.header_media as string] : (tv.header ?? []).map((t) => resolveToken(contact as Record<string, any>, t)),
      body: (tv.body ?? []).map((t) => resolveToken(contact as Record<string, any>, t)),
    };
    const result = await sendMessage(ctx, {
      channel,
      to: allowed[0]!.to,
      templateRef: params.template_ref,
      languageCode: params.language,
      vars,
      body: params.message,
    });
    logger.info(`akış gönderdi: kural=${ruleId} kontakt=${contactId} kanal=${channel} durum=${result.status}`);
    return `gönderildi (${result.status}${result.dryRun ? ", dry-run" : ""})`;
  }

  if (action === "create_task") {
    try {
      await ctx.directus.request(
        createItem("Tasks", { related_contact: contactId, ...params }),
      );
      return "görev oluşturuldu";
    } catch (e: any) {
      logger.warn(`create_task başarısız (Tasks şeması?): ${e.message}`);
      return "görev oluşturulamadı";
    }
  }

  return `bilinmeyen aksiyon: ${action}`;
}
