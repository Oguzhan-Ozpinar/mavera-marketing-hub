/**
 * Idempotency — webhook'lar aynı olayı birden çok kez gönderebilir.
 * webhook_events koleksiyonunda olay id ile tekilleştirilir.
 */
import { createItem, readItems } from "@directus/sdk";
import type { DernekContext } from "../dernek/dernek.context.js";

export async function alreadyProcessed(ctx: DernekContext, eventId: string): Promise<boolean> {
  const rows = (await ctx.directus.request(
    readItems("webhook_events", { filter: { id: { _eq: eventId } }, limit: 1, fields: ["id"] }),
  )) as Array<{ id: string }>;
  return rows.length > 0;
}

export async function markProcessed(
  ctx: DernekContext,
  eventId: string,
  provider: string,
  hash: string,
): Promise<void> {
  const now = new Date().toISOString();
  await ctx.directus.request(
    createItem("webhook_events", {
      id: eventId,
      provider,
      payload_hash: hash,
      received_at: now,
      processed_at: now,
    }),
  );
}
