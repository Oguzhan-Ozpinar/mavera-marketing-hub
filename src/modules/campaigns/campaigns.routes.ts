import type { FastifyInstance } from "fastify";
import { readItems, readItem, updateItem, deleteItem, deleteItems } from "@directus/sdk";
import { requirePermission } from "../../auth/auth.plugin.js";
import { createCampaign, triggerCampaign, type CreateCampaignInput } from "./campaigns.service.js";

export async function registerCampaignRoutes(app: FastifyInstance) {
  // Kampanya listesi (opsiyonel status filtresi)
  app.get("/campaigns", { preHandler: requirePermission("campaigns.read") }, async (req) => {
    const ctx = req.dernekContext!;
    const { status } = req.query as { status?: string };
    const rows = await ctx.directus.request(
      readItems("campaigns", {
        ...(status ? { filter: { status: { _eq: status } } } : {}),
        fields: ["id", "name", "channel", "status", "triggered_at", "scheduled_at", "counts", "date_created"],
        sort: ["-date_created"],
        limit: 200,
      }),
    );
    return { campaigns: rows };
  });

  // Kampanya detay
  app.get("/campaigns/:id", { preHandler: requirePermission("campaigns.read") }, async (req) => {
    const ctx = req.dernekContext!;
    const { id } = req.params as { id: string };
    const campaign = await ctx.directus.request(readItem("campaigns", id));
    return { campaign };
  });

  // Kampanya raporu: özet + alıcı listesi
  app.get("/campaigns/:id/report", { preHandler: requirePermission("campaigns.read") }, async (req) => {
    const ctx = req.dernekContext!;
    const { id } = req.params as { id: string };
    const campaign = await ctx.directus.request(
      readItem("campaigns", id, { fields: ["id", "name", "channel", "status", "counts", "triggered_at", "scheduled_at", "template_ref", "audience_type"] }),
    );
    const recipients = (await ctx.directus.request(
      readItems("campaign_recipients", {
        filter: { campaign_id: { _eq: id } } as any,
        fields: ["id", "to", "status", "provider_message_id", "error", "updated_at", "contact_id.first_name", "contact_id.last_name"],
        sort: ["-updated_at"],
        limit: 500,
      }),
    )) as Array<{ status: string }>;
    const byStatus: Record<string, number> = {};
    for (const r of recipients) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    return { campaign, byStatus, recipients };
  });
  // Kampanya oluştur
  app.post("/campaigns", { preHandler: requirePermission("campaigns.create") }, async (req, reply) => {
    const ctx = req.dernekContext!;
    const body = (req.body ?? {}) as CreateCampaignInput;
    if (!body.name || !body.channel) return reply.code(400).send({ error: "name ve channel zorunlu" });
    const campaign = await createCampaign(ctx, body, req.user?.sub);
    return reply.code(201).send({ campaign });
  });

  // Kampanya tetikle (gönderim)
  app.post("/campaigns/:id/trigger", { preHandler: requirePermission("campaigns.send") }, async (req, reply) => {
    const ctx = req.dernekContext!;
    const { id } = req.params as { id: string };
    const result = await triggerCampaign(ctx, id);
    return reply.send(result);
  });

  // Planlı kampanyayı İPTAL et (zamanlayıcı tetiklemez)
  app.post("/campaigns/:id/cancel", { preHandler: requirePermission("campaigns.send") }, async (req, reply) => {
    const ctx = req.dernekContext!;
    const { id } = req.params as { id: string };
    const c = (await ctx.directus.request(readItem("campaigns", id, { fields: ["status"] }))) as { status: string };
    if (c.status !== "scheduled") return reply.code(400).send({ error: "Yalnızca planlı kampanya iptal edilebilir" });
    await ctx.directus.request(updateItem("campaigns", id, { status: "cancelled" }));
    return { ok: true };
  });

  // Planlama zamanını değiştir (planlı/iptal/taslak → yeniden planla)
  app.patch("/campaigns/:id/schedule", { preHandler: requirePermission("campaigns.send") }, async (req, reply) => {
    const ctx = req.dernekContext!;
    const { id } = req.params as { id: string };
    const { scheduled_at } = (req.body ?? {}) as { scheduled_at?: string };
    if (!scheduled_at) return reply.code(400).send({ error: "scheduled_at gerekli" });
    await ctx.directus.request(updateItem("campaigns", id, { scheduled_at, status: "scheduled" }));
    return { ok: true };
  });

  // Kampanyayı SİL (alıcı kayıtlarıyla birlikte)
  app.delete("/campaigns/:id", { preHandler: requirePermission("campaigns.send") }, async (req) => {
    const ctx = req.dernekContext!;
    const { id } = req.params as { id: string };
    const recs = (await ctx.directus.request(
      readItems("campaign_recipients", { filter: { campaign_id: { _eq: id } } as any, fields: ["id"], limit: -1 }),
    )) as Array<{ id: string | number }>;
    if (recs.length) await ctx.directus.request(deleteItems("campaign_recipients", recs.map((r) => r.id) as any));
    await ctx.directus.request(deleteItem("campaigns", id));
    return { ok: true };
  });
}
