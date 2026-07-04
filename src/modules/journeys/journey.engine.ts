/**
 * Dinamik akış motoru.
 * Bir olay geldiğinde (yeni kontakt / bağış / geri dönüş...), o derneğin AKTİF automation_rules'ını
 * tarar, tetikleyici + koşul eşleşenleri için BullMQ'ya GECİKMELİ iş yazar.
 * (Kurallar VERİ olarak Directus'ta; kod deploy'u gerektirmez — kullanıcı kurar.)
 */
import { readItems } from "@directus/sdk";
import type { DernekContext } from "../../dernek/dernek.context.js";
import { journeyQueue } from "../../lib/queue.js";
import { logger } from "../../lib/logger.js";
import { delayToMs, evalConditions, matchesTrigger, type AppEvent, type AutomationRule } from "./journey.eval.js";

export async function handleEvent(ctx: DernekContext, event: AppEvent): Promise<number> {
  const rules = (await ctx.directus.request(
    readItems("automation_rules", { filter: { is_active: { _eq: true } }, limit: -1 }),
  )) as AutomationRule[];

  // Koşul için kontaktı bir kez çek
  const contactRows = (await ctx.directus.request(
    readItems("Contacts", { filter: { id: { _eq: event.contactId } }, limit: 1 }),
  )) as Record<string, any>[];
  const contact = contactRows[0];
  if (!contact) return 0;

  let scheduled = 0;
  for (const rule of rules) {
    if (!matchesTrigger(rule, event)) continue;
    if (!evalConditions(rule.conditions, contact)) continue;

    const delay = delayToMs(rule.delay_value, rule.delay_unit);
    await journeyQueue.add(
      "journey",
      { dernek: ctx.id, ruleId: rule.id, contactId: event.contactId },
      { delay, jobId: `${rule.id}:${event.contactId}:${event.type}` }, // idempotent planlama
    );
    scheduled++;
    logger.info(`akış planlandı: kural=${rule.id} kontakt=${event.contactId} gecikme=${delay}ms`);
  }
  return scheduled;
}
