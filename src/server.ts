import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { registerAuth, requirePermission } from "./auth/auth.plugin.js";
import { registerContactRoutes } from "./modules/contacts/contacts.routes.js";
import { registerCampaignRoutes } from "./modules/campaigns/campaigns.routes.js";
import { registerBlacklistRoutes } from "./modules/blacklist/blacklist.routes.js";
import { registerWebhookRoutes } from "./webhooks/routes.js";
import { registerSegmentRoutes } from "./modules/segments/segments.routes.js";
import { registerAutomationRoutes } from "./modules/automations/automations.routes.js";
import { registerChannelRoutes } from "./modules/channels/channels.routes.js";
import { registerSettingsRoutes } from "./modules/settings/settings.routes.js";
import { registerDashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { refreshAllDerneks } from "./dernek/dernek.context.js";
import { listDerneks } from "./config/derneks.js";

const app = Fastify({
  logger:
    env.NODE_ENV === "production"
      ? { level: env.LOG_LEVEL }
      : {
          level: env.LOG_LEVEL,
          transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } },
        },
});

// CORS — yönetim arayüzü (web/) için (dev: tüm origin; prod'da kısıtla)
await app.register(cors, { origin: true, credentials: true });

// Public
app.get("/health", async () => ({
  status: "ok",
  service: "mavera-hub-api",
  ts: new Date().toISOString(),
}));

// Public: login dropdown için dernek listesi (secret içermez)
app.get("/derneks", async () => ({ derneks: listDerneks() }));

await registerAuth(app);

// Korumalı: kimliğim ne? (herhangi bir giriş yapmış kullanıcı)
app.get("/me", async (req) => ({ user: req.user, dernek: req.dernekContext?.id }));

// Korumalı + RBAC örneği: kontakt okuma yetkisi gerekir
app.get("/contacts/ping", { preHandler: requirePermission("contacts.read") }, async (req) => ({
  ok: true,
  dernek: req.dernekContext?.id,
  role: req.user?.role,
}));

// Sprint 3: contacts upsert
await registerContactRoutes(app);
// Sprint 4: kampanya oluştur/tetikle
await registerCampaignRoutes(app);
await registerBlacklistRoutes(app);
await registerSegmentRoutes(app);
await registerAutomationRoutes(app);
await registerChannelRoutes(app);
await registerSettingsRoutes(app);
await registerDashboardRoutes(app);
// Sprint 5: webhook'lar (public, imza+idempotency ile korunur)
await registerWebhookRoutes(app);

// TODO: /segments, /automation (CRUD Directus panelinden), report polling repeatable job'ları

const start = async () => {
  try {
    await refreshAllDerneks(); // Directus'tan kanal anahtarlarını yükle
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    logger.info(`mavera-hub API çalışıyor → http://localhost:${env.PORT}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

start();
