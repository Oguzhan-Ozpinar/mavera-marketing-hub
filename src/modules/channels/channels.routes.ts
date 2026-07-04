/**
 * Kanal yardımcı endpoint'leri — kampanya şablon seçimi için.
 * GET /channels/whatsapp/templates → MonoChat onaylı şablonlar (değişken yapısıyla).
 */
import type { FastifyInstance } from "fastify";
import { requirePermission } from "../../auth/auth.plugin.js";
import { listTemplates } from "../../channels/monochat/mc.client.js";
import { sendMessage, type Channel } from "../../channels/sender.js";
import { resolveToken } from "../campaigns/campaigns.service.js";

// Test için örnek kişi (değişkenler bununla doldurulur)
const SAMPLE = {
  full_name: "Test Kullanıcı", first_name: "Test", last_name: "Kullanıcı",
  email: "test@example.com", mvr_uid: "TEST-UID", id: "TEST-ID", referans: "test", ulke: "Türkiye",
};

export async function registerChannelRoutes(app: FastifyInstance) {
  app.get("/channels/whatsapp/templates", { preHandler: requirePermission("campaigns.read") }, async (req, reply) => {
    const ctx = req.dernekContext!;
    try {
      const templates = await listTemplates(ctx);
      return { templates };
    } catch (e: any) {
      return reply.code(502).send({ error: `Şablonlar alınamadı: ${e.message}` });
    }
  });

  // Kampanya taslağını tek bir numaraya TEST gönder
  app.post("/channels/test-send", { preHandler: requirePermission("campaigns.send") }, async (req, reply) => {
    const ctx = req.dernekContext!;
    const b = (req.body ?? {}) as {
      to?: string; channel?: Channel; template_ref?: string; language?: string;
      template_vars?: { header?: string[]; body?: string[] }; message?: string; iysfilter?: "0" | "11" | "12";
    };
    if (!b.to) return reply.code(400).send({ error: "Test numarası/e-posta gerekli" });
    if (!b.channel) return reply.code(400).send({ error: "Kanal gerekli" });

    const tv = b.template_vars ?? {};
    const vars = {
      header: (tv.header ?? []).map((t) => resolveToken(SAMPLE, t)),
      body: (tv.body ?? []).map((t) => resolveToken(SAMPLE, t)),
    };
    const result = await sendMessage(ctx, {
      channel: b.channel, to: b.to, templateRef: b.template_ref, languageCode: b.language,
      vars, body: b.message, iysfilter: b.iysfilter,
    });
    if (result.status === "failed") return reply.code(502).send({ error: result.error ?? "gönderilemedi" });
    return { ok: true, dryRun: result.dryRun, providerMessageId: result.providerMessageId };
  });
}
