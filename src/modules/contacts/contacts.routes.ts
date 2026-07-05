/**
 * Contacts route'ları. POST /contacts → form/ingest girişi (upsert).
 * Dernek-guard sayesinde her zaman req.dernekContext (kullanıcının kendi derneği) kullanılır.
 */
import type { FastifyInstance } from "fastify";
import { readItem, readItems } from "@directus/sdk";
import { requirePermission } from "../../auth/auth.plugin.js";
import { upsertContact, type ContactInput, type ConsentSource } from "./upsert.service.js";
import { handleEvent } from "../journeys/journey.engine.js";
import { logger } from "../../lib/logger.js";

export async function registerContactRoutes(app: FastifyInstance) {
  // Kontakt listesi (canlı Directus'tan, arama + sayfalama)
  app.get("/contacts", { preHandler: requirePermission("contacts.read") }, async (req) => {
    const ctx = req.dernekContext!;
    const q = req.query as { search?: string; page?: string; limit?: string };
    const search = q.search?.trim();
    const limit = Math.min(Number(q.limit ?? 25), 100);
    const page = Math.max(Number(q.page ?? 1), 1);
    const filter = search
      ? {
          _or: [
            { first_name: { _icontains: search } },
            { last_name: { _icontains: search } },
            { phone: { _contains: search } },
            { email: { _icontains: search } },
          ],
        }
      : undefined;
    const { readItems } = await import("@directus/sdk");
    const contacts = await ctx.directus.request(
      readItems("Contacts", {
        ...(filter ? { filter: filter as any } : {}),
        fields: ["id", "first_name", "last_name", "phone", "email", "whatsapp_optin", "mail_optin", "sms_optin", "donation_count", "donation_total", "last_donation_at"],
        sort: ["-date_created"],
        limit,
        page,
      }),
    );
    return { contacts, page, limit };
  });

  // Kontakt pazarlama özeti (salt-okunur): RFM + izin geçmişi + giden kampanyalar + Directus linki
  app.get("/contacts/:id/summary", { preHandler: requirePermission("contacts.read") }, async (req) => {
    const ctx = req.dernekContext!;
    const { id } = req.params as { id: string };
    const contact = await ctx.directus.request(
      readItem("Contacts", id, {
        fields: ["id", "first_name", "last_name", "phone", "email", "mvr_uid", "referans", "ulke",
          "whatsapp_optin", "mail_optin", "sms_optin",
          "donation_count", "donation_total", "last_donation_at", "first_donation_at", "donation_type_list"],
      }),
    );
    const consent = await ctx.directus.request(
      readItems("consent_log", { filter: { contact_id: { _eq: id } } as any, sort: ["-occurred_at"], limit: 20,
        fields: ["channel", "action", "source", "occurred_at"] }),
    );
    const campaigns = await ctx.directus.request(
      readItems("campaign_recipients", { filter: { contact_id: { _eq: id } } as any, sort: ["-updated_at"], limit: 50,
        fields: ["status", "to", "updated_at", "campaign_id.name", "campaign_id.channel"] }),
    );
    let events: unknown[] = [];
    try {
      events = await ctx.directus.request(
        readItems("attribution_events", { filter: { mvruid_eslestirme: { _eq: id } } as any, sort: ["-timestamp"], limit: 20,
          fields: ["timestamp", "action_type", "source", "action_details"] }),
      );
    } catch { /* attribution boş olabilir */ }
    return { contact, consent, campaigns, events, directusUrl: ctx.config.directus.url };
  });

  app.post(
    "/contacts",
    { preHandler: requirePermission("contacts.write") },
    async (req, reply) => {
      const ctx = req.dernekContext;
      if (!ctx) return reply.code(401).send({ error: "Dernek bağlamı yok" });

      const body = (req.body ?? {}) as ContactInput & { source?: ConsentSource };
      if (!body.phone && !body.email) {
        return reply.code(400).send({ error: "phone veya email zorunlu" });
      }

      const ip = req.headers["x-forwarded-for"]?.toString() ?? req.ip;
      const result = await upsertContact(ctx, body, body.source ?? "form", { ip });

      // Yeni kontakt → dinamik akış motorunu tetikle (contact_created)
      if (result.created) {
        handleEvent(ctx, { type: "contact_created", contactId: String(result.contact.id) }).catch((e) =>
          logger.warn(`akış tetikleme hatası: ${e.message}`),
        );
      }

      return reply.code(result.created ? 201 : 200).send({
        created: result.created,
        matchedBy: result.matchedBy,
        contact: result.contact,
      });
    },
  );
}
