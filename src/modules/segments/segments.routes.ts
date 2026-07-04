/**
 * Segment kurucu destek endpoint'leri (görsel builder için).
 *  - GET  /segments/fields   → segmentlenebilir alanlar + operatörler (dropdown metadata)
 *  - POST /segments/preview  → {segment, channel?} → kaç kişi / kaça gönderilebilir (fail-safe sonrası)
 */
import type { FastifyInstance } from "fastify";
import { createItem, deleteItem, readItems, updateItem } from "@directus/sdk";
import { requirePermission } from "../../auth/auth.plugin.js";
import { buildAudience } from "../campaigns/audience.service.js";
import { filterRecipients } from "../campaigns/filter.service.js";
import { estimateCost } from "../../config/costs.js";
import type { Channel } from "../../channels/sender.js";

// Marketingci-dostu, küratörlü alan listesi (ham DB alanları değil)
const FIELDS = [
  { field: "donation_total", label: "Toplam bağış (₺)", type: "number", ops: ["_gte", "_lte", "_gt", "_lt", "_eq"] },
  { field: "donation_count", label: "Bağış adedi", type: "number", ops: ["_gte", "_lte", "_gt", "_lt", "_eq"] },
  {
    field: "donation_type_list", label: "Bağış türü", type: "text", ops: ["_contains"],
    suggestions: ["KURBAN", "ADAK", "İftar", "Zekat", "Fitre", "Şükür Kurbanı", "Genel"],
  },
  { field: "last_donation_at", label: "Son bağış tarihi", type: "date", ops: ["_gte", "_lte"] },
  { field: "ulke", label: "Ülke", type: "text", ops: ["_eq", "_neq", "_contains"] },
  { field: "referans", label: "Referans / kaynak", type: "text", ops: ["_eq", "_contains"] },
  { field: "whatsapp_optin", label: "WhatsApp izni var", type: "boolean", ops: ["_eq"] },
  { field: "mail_optin", label: "E-posta izni var", type: "boolean", ops: ["_eq"] },
  { field: "sms_optin", label: "SMS izni var", type: "boolean", ops: ["_eq"] },
];

export async function registerSegmentRoutes(app: FastifyInstance) {
  app.get("/segments/fields", { preHandler: requirePermission("segments.read") }, async () => ({ fields: FIELDS }));

  app.post("/segments/preview", { preHandler: requirePermission("segments.read") }, async (req) => {
    const ctx = req.dernekContext!;
    const body = (req.body ?? {}) as { segment?: Record<string, unknown>; channel?: Channel; iysfilter?: string };
    const audience = await buildAudience(ctx, body.segment);
    const result: any = { total: audience.length };
    if (body.channel) {
      const requireOptin = !(body.channel === "sms" && body.iysfilter === "0");
      const { allowed, skipped } = await filterRecipients(ctx, body.channel, audience, { requireOptin });
      const reasons: Record<string, number> = {};
      for (const s of skipped) reasons[s.reason] = (reasons[s.reason] ?? 0) + 1;
      result.sendable = allowed.length;
      result.skipped = skipped.length;
      result.skippedReasons = reasons;
      result.estimatedCostTRY = estimateCost(body.channel, allowed.length);
    }
    return result;
  });

  // --- Kayıtlı segmentler (CRUD) ---
  app.get("/segments", { preHandler: requirePermission("segments.read") }, async (req) => {
    const ctx = req.dernekContext!;
    const rows = await ctx.directus.request(
      readItems("segments", { fields: ["id", "name", "description", "definition", "date_created"], sort: ["-date_created"], limit: 200 }),
    );
    return { segments: rows };
  });

  app.post("/segments", { preHandler: requirePermission("segments.write") }, async (req, reply) => {
    const ctx = req.dernekContext!;
    const body = (req.body ?? {}) as { name?: string; description?: string; definition?: unknown };
    if (!body.name) return reply.code(400).send({ error: "name zorunlu" });
    const seg = await ctx.directus.request(
      createItem("segments", {
        name: body.name,
        description: body.description ?? null,
        definition: body.definition ?? { rules: [] },
        created_by: req.user?.sub ?? null,
      }),
    );
    return reply.code(201).send({ segment: seg });
  });

  app.put("/segments/:id", { preHandler: requirePermission("segments.write") }, async (req) => {
    const ctx = req.dernekContext!;
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { name?: string; description?: string; definition?: unknown };
    const seg = await ctx.directus.request(updateItem("segments", id, body));
    return { segment: seg };
  });

  app.delete("/segments/:id", { preHandler: requirePermission("segments.write") }, async (req) => {
    const ctx = req.dernekContext!;
    const { id } = req.params as { id: string };
    await ctx.directus.request(deleteItem("segments", id));
    return { ok: true };
  });
}
