/**
 * Dashboard istatistikleri — genel bakış için özet sayılar + son kampanyalar + gönderim durumları.
 */
import type { FastifyInstance } from "fastify";
import { aggregate, readItems } from "@directus/sdk";
import { requirePermission } from "../../auth/auth.plugin.js";
import type { DernekContext } from "../../dernek/dernek.context.js";

async function count(ctx: DernekContext, collection: string, filter?: Record<string, unknown>): Promise<number> {
  try {
    if (filter) {
      // Filtreli sayım — readItems length (aggregate+filter bazı sürümlerde sorunlu)
      const rows = (await ctx.directus.request(
        readItems(collection as any, { filter: filter as any, fields: ["id"], limit: -1 }),
      )) as unknown[];
      return rows.length;
    }
    const res = (await ctx.directus.request(
      aggregate(collection as any, { aggregate: { count: "*" } }),
    )) as Array<{ count: number | string }>;
    return Number(res?.[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/stats", { preHandler: requirePermission("campaigns.read") }, async (req) => {
    const ctx = req.dernekContext!;

    const [contacts, campaigns, automationsActive] = await Promise.all([
      count(ctx, "Contacts"),
      count(ctx, "campaigns"),
      count(ctx, "automation_rules", { is_active: { _eq: true } }),
    ]);

    // Gönderim durumları (delivered/read/failed...)
    let byStatus: Record<string, number> = {};
    try {
      const rows = (await ctx.directus.request(
        aggregate("campaign_recipients" as any, { aggregate: { count: "*" }, groupBy: ["status"] }),
      )) as Array<{ status: string; count: number | string }>;
      byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
    } catch { /* yoksa boş */ }

    const recent = await ctx.directus.request(
      readItems("campaigns", {
        fields: ["id", "name", "channel", "status", "counts", "triggered_at"],
        sort: ["-date_created"],
        limit: 6,
      }),
    );

    return { contacts, campaigns, automationsActive, byStatus, recent };
  });
}
