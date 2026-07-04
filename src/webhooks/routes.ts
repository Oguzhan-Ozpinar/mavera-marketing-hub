/**
 * Webhook endpoint'leri. Hepsi: imza doğrula → idempotency → işle → 200.
 * Public (JWT yok) ama :dernek param + secret ile korunur.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createItem, readItems, updateItem } from "@directus/sdk";
import { env } from "../config/env.js";
import { hasDernek } from "../config/derneks.js";
import { getDernekContext, type DernekContext } from "../dernek/dernek.context.js";
import { logger } from "../lib/logger.js";
import { normalizePhone } from "../lib/phone.js";
import { addToBlacklist } from "../modules/blacklist/blacklist.service.js";
import { ingestDonation, type BtsDonationPayload } from "../sync/bts.ingest.js";
import { alreadyProcessed, markProcessed } from "./idempotency.js";
import { checkSecret, eventIdFrom, payloadHash } from "./verify.js";

// İYS tip → (optin alanı, kanal)
const IYS_MAP: Record<string, { field: string; channel: string }> = {
  MESAJ: { field: "sms_optin", channel: "sms" }, // İYS MESAJ = SMS (WhatsApp ayrı/Meta)
  ARAMA: { field: "phone_call_optin", channel: "voice" },
  EPOSTA: { field: "mail_optin", channel: "email" },
};

function resolveDernek(req: FastifyRequest, reply: FastifyReply): DernekContext | null {
  const { dernek } = req.params as { dernek: string };
  if (!hasDernek(dernek)) {
    reply.code(404).send({ error: `Bilinmeyen dernek: ${dernek}` });
    return null;
  }
  return getDernekContext(dernek);
}

export async function registerWebhookRoutes(app: FastifyInstance) {
  // --- Netgsm İYS: RET (izin geri çekme) ---
  app.post("/webhooks/netgsm-iys/:dernek", async (req, reply) => {
    if (!checkSecret(req, env.WEBHOOK_NETGSM_SECRET)) return reply.code(401).send({ error: "imza geçersiz" });
    const ctx = resolveDernek(req, reply);
    if (!ctx) return;

    const body = (req.body ?? {}) as any;
    const eventId = eventIdFrom(body, body.id ?? body.eventId);
    if (await alreadyProcessed(ctx, eventId)) return reply.send({ ok: true, duplicate: true });

    // Esnek parse: tek kayıt veya {type,status,recipient/gsm}
    const type = String(body.type ?? "").toUpperCase();
    const status = String(body.status ?? "").toUpperCase();
    const recipient = body.recipient ?? body.gsm ?? body.email ?? "";
    const map = IYS_MAP[type];

    if (status === "RET" && map && recipient) {
      const last10 = normalizePhone(recipient).last10;
      const filter = map.channel === "email" ? { email: { _eq: recipient } } : { phone_last10: { _eq: last10 } };
      const rows = (await ctx.directus.request(
        readItems("Contacts", { filter: filter as any, limit: 1, fields: ["id"] }),
      )) as Array<{ id: string }>;
      if (rows[0]) {
        await ctx.directus.request(updateItem("Contacts", rows[0].id, { [map.field]: false }));
        await ctx.directus.request(
          createItem("consent_log", {
            contact_id: rows[0].id,
            channel: map.channel,
            action: "ret",
            source: "iys",
            occurred_at: new Date().toISOString(),
          }),
        );
      }
      await addToBlacklist(ctx, recipient, map.channel, "İYS RET");
      logger.info(`İYS RET işlendi: ${ctx.id} ${map.channel} ${recipient}`);
    }

    await markProcessed(ctx, eventId, "netgsm-iys", payloadHash(body));
    return reply.send({ ok: true });
  });

  // --- MonoChat: teslim durumu (delivered/read/failed) ---
  app.post("/webhooks/monochat/:dernek", async (req, reply) => {
    if (!checkSecret(req, env.WEBHOOK_MONOCHAT_TOKEN)) return reply.code(401).send({ error: "imza geçersiz" });
    const ctx = resolveDernek(req, reply);
    if (!ctx) return;

    const body = (req.body ?? {}) as any;
    const eventId = eventIdFrom(body, body.messageId ?? body.id);
    if (await alreadyProcessed(ctx, eventId)) return reply.send({ ok: true, duplicate: true });

    const providerMessageId = body.messageId ?? body.id;
    const status = String(body.status ?? "").toLowerCase(); // delivered|read|failed
    if (providerMessageId && status) {
      const rows = (await ctx.directus.request(
        readItems("campaign_recipients", {
          filter: { provider_message_id: { _eq: providerMessageId } },
          limit: 1,
          fields: ["id"],
        }),
      )) as Array<{ id: number | string }>;
      if (rows[0]) {
        await ctx.directus.request(
          updateItem("campaign_recipients", rows[0].id, { status, updated_at: new Date().toISOString() }),
        );
      }
    }

    await markProcessed(ctx, eventId, "monochat", payloadHash(body));
    return reply.send({ ok: true });
  });

  // --- EmailOctopus: bounce / complaint ---
  app.post("/webhooks/emailoctopus/:dernek", async (req, reply) => {
    const ctx = resolveDernek(req, reply);
    if (!ctx) return;

    const body = (req.body ?? {}) as any;
    const eventId = eventIdFrom(body, body.id);
    if (await alreadyProcessed(ctx, eventId)) return reply.send({ ok: true, duplicate: true });

    const email = body.email ?? body?.contact?.email;
    const kind = String(body.type ?? body.event ?? "").toLowerCase(); // bounced|complained
    if (email && (kind.includes("bounce") || kind.includes("complain"))) {
      const rows = (await ctx.directus.request(
        readItems("Contacts", { filter: { email: { _eq: email } }, limit: 1, fields: ["id"] }),
      )) as Array<{ id: string }>;
      if (rows[0]) {
        await ctx.directus.request(updateItem("Contacts", rows[0].id, { mail_optin: false }));
        await ctx.directus.request(
          createItem("consent_log", {
            contact_id: rows[0].id,
            channel: "email",
            action: kind.includes("complain") ? "complaint" : "hardbounce",
            source: "eo",
            occurred_at: new Date().toISOString(),
          }),
        );
      }
      await addToBlacklist(ctx, email, "email", `EmailOctopus ${kind}`);
      logger.info(`EO ${kind} işlendi: ${ctx.id} ${email}`);
    }

    await markProcessed(ctx, eventId, "emailoctopus", payloadHash(body));
    return reply.send({ ok: true });
  });

  // --- BTS bağış ingest (BTS'in resolveDonor cron'u buraya POST'lar) ---
  // BTS `crm_key` query param veya x-webhook-secret header ile doğrulanır.
  app.post("/webhooks/bts/:dernek/donation", async (req, reply) => {
    const crmKey = (req.query as { crm_key?: string }).crm_key;
    const secretOk =
      checkSecret(req, env.WEBHOOK_BTS_SECRET) ||
      (!!env.WEBHOOK_BTS_SECRET && crmKey === env.WEBHOOK_BTS_SECRET);
    if (!secretOk) return reply.code(401).send({ error: "imza geçersiz" });

    const ctx = resolveDernek(req, reply);
    if (!ctx) return;

    const body = (req.body ?? {}) as BtsDonationPayload;
    if (!body.bts_id) return reply.code(400).send({ error: "bts_id zorunlu" });
    if (!body.cep_no && !body.email) return reply.code(400).send({ error: "cep_no veya email zorunlu" });

    const eventId = `bts-donation-${body.bts_id}`;

    // Idempotency: aynı bağış tekrar gelirse RFM'i çift saymadan mevcut mvr_uid'i döndür
    if (await alreadyProcessed(ctx, eventId)) {
      const last10 = normalizePhone(body.cep_no).last10;
      const filter = last10 ? { phone_last10: { _eq: last10 } } : { email: { _eq: body.email } };
      const rows = (await ctx.directus.request(
        readItems("Contacts", { filter: filter as any, limit: 1, fields: ["id", "mvr_uid"] }),
      )) as Array<{ id: string; mvr_uid: string }>;
      return reply.send({ ok: true, duplicate: true, mvr_uid: rows[0]?.mvr_uid ?? null });
    }

    const result = await ingestDonation(ctx, body);
    await markProcessed(ctx, eventId, "bts", payloadHash(body));
    return reply.send({ ok: true, mvr_uid: result.mvr_uid, contactId: result.contactId, created: result.created });
  });
}
