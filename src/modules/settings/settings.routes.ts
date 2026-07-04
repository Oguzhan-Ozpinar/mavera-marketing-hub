/**
 * Entegrasyon ayarları — kanal API anahtarlarını UI'dan düzenleme (yalnızca admin).
 * Directus integration_settings singleton'ında saklanır; kaydedince creds cache yenilenir.
 */
import type { FastifyInstance } from "fastify";
import { readSingleton, updateSingleton } from "@directus/sdk";
import { requirePermission } from "../../auth/auth.plugin.js";
import { refreshDernekCreds } from "../../dernek/dernek.context.js";

export async function registerSettingsRoutes(app: FastifyInstance) {
  app.get("/settings/integrations", { preHandler: requirePermission("settings.read") }, async (req) => {
    const ctx = req.dernekContext!;
    const s = (await ctx.directus.request(readSingleton("integration_settings")).catch(() => ({}))) as Record<string, any>;
    return { settings: s ?? {} };
  });

  app.put("/settings/integrations", { preHandler: requirePermission("settings.write") }, async (req) => {
    const ctx = req.dernekContext!;
    const body = (req.body ?? {}) as Record<string, unknown>;
    // yalnızca bilinen alanlar
    const allowed = [
      "mc_slug", "mc_token", "mc_business_phone", "mc_base_url",
      "ng_user", "ng_pass", "ng_msgheader", "ng_iys_brand",
      "eo_api_key", "eo_list_id",
    ];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) patch[k] = body[k];
    const saved = await ctx.directus.request(updateSingleton("integration_settings", patch));
    await refreshDernekCreds(ctx.id); // yeni anahtarları anında etkin kıl
    return { settings: saved };
  });
}
