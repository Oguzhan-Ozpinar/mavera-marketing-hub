/**
 * Otomasyon (dinamik akış) CRUD + sihirbaz metadata.
 * automation_rules koleksiyonu üzerinde çalışır; motor (journey.engine) bunları okur.
 */
import type { FastifyInstance } from "fastify";
import { createItem, deleteItem, readItem, readItems, updateItem } from "@directus/sdk";
import { requirePermission } from "../../auth/auth.plugin.js";

// Sihirbaz dropdown'ları (marketingci-dostu). BTS bağış tipleri canlıda dinamik dolacak.
const META = {
  triggers: [
    { value: "contact_created", label: "Yeni kontakt eklendiğinde", params: [] },
    { value: "donation_created", label: "Herhangi bir bağış yapıldığında", params: [] },
    {
      value: "donation_type",
      label: "Belirli bir bağış tipi yapıldığında",
      params: [{ key: "donation_type", label: "Bağış tipi", type: "text", suggestions: ["KURBAN", "ADAK", "İftar", "Zekat", "Fitre", "Şükür Kurbanı", "Genel"] }],
    },
    {
      value: "inactivity",
      label: "Belirli süredir bağış yapmadığında",
      params: [{ key: "inactivity_days", label: "Kaç gündür", type: "number" }],
    },
    { value: "return_status_changed", label: "Bağış geri dönüşü hazır olduğunda (kurban videosu vb.)", params: [{ key: "return_status", label: "Durum", type: "text" }] },
  ],
  actions: [
    { value: "whatsapp", label: "WhatsApp mesajı gönder", params: ["__whatsapp_template__"] },
    { value: "email", label: "E-posta gönder (EO tag)", params: ["template_ref"] },
    { value: "sms", label: "SMS gönder", params: ["message"] },
    { value: "create_task", label: "CRM görevi oluştur", params: ["title"] },
  ],
  delayUnits: [
    { value: "minutes", label: "dakika" },
    { value: "hours", label: "saat" },
    { value: "days", label: "gün" },
    { value: "weeks", label: "hafta" },
    { value: "months", label: "ay" },
  ],
};

export async function registerAutomationRoutes(app: FastifyInstance) {
  app.get("/automations/meta", { preHandler: requirePermission("automation.read") }, async () => META);

  app.get("/automations", { preHandler: requirePermission("automation.read") }, async (req) => {
    const ctx = req.dernekContext!;
    const rows = await ctx.directus.request(
      readItems("automation_rules", { sort: ["-date_created"], limit: 200 }),
    );
    return { automations: rows };
  });

  app.get("/automations/:id", { preHandler: requirePermission("automation.read") }, async (req) => {
    const ctx = req.dernekContext!;
    const { id } = req.params as { id: string };
    const automation = await ctx.directus.request(readItem("automation_rules", id));
    return { automation };
  });

  app.post("/automations", { preHandler: requirePermission("automation.write") }, async (req, reply) => {
    const ctx = req.dernekContext!;
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!b.name || !b.trigger_type || !b.action_type) {
      return reply.code(400).send({ error: "name, trigger_type, action_type zorunlu" });
    }
    const rule = await ctx.directus.request(
      createItem("automation_rules", { ...b, created_by: req.user?.sub ?? null }),
    );
    return reply.code(201).send({ automation: rule });
  });

  app.put("/automations/:id", { preHandler: requirePermission("automation.write") }, async (req) => {
    const ctx = req.dernekContext!;
    const { id } = req.params as { id: string };
    const rule = await ctx.directus.request(updateItem("automation_rules", id, (req.body ?? {}) as Record<string, unknown>));
    return { automation: rule };
  });

  app.delete("/automations/:id", { preHandler: requirePermission("automation.write") }, async (req) => {
    const ctx = req.dernekContext!;
    const { id } = req.params as { id: string };
    await ctx.directus.request(deleteItem("automation_rules", id));
    return { ok: true };
  });
}
