import type { FastifyInstance } from "fastify";
import { requirePermission } from "../../auth/auth.plugin.js";
import { addToBlacklist, syncFromDirectus } from "./blacklist.service.js";

export async function registerBlacklistRoutes(app: FastifyInstance) {
  // Engel ekle (Directus + Redis)
  app.post("/blacklist", { preHandler: requirePermission("blacklist.write") }, async (req, reply) => {
    const ctx = req.dernekContext!;
    const body = (req.body ?? {}) as { value?: string; channel?: string; reason?: string };
    if (!body.value || !body.channel) return reply.code(400).send({ error: "value ve channel zorunlu" });
    await addToBlacklist(ctx, body.value, body.channel, body.reason ?? "");
    return reply.code(201).send({ ok: true });
  });

  // Directus → Redis senkron (başlangıçta / manuel)
  app.post("/blacklist/sync", { preHandler: requirePermission("blacklist.write") }, async (req) => {
    const ctx = req.dernekContext!;
    const count = await syncFromDirectus(ctx);
    return { synced: count };
  });
}
