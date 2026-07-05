import { Worker, DelayedError, type Job } from "bullmq";
import { updateItem } from "@directus/sdk";
import { connection } from "./lib/redis.js";
import { logger } from "./lib/logger.js";
import { SEND_QUEUE, JOURNEY_QUEUE, type SendJobData, type JourneyJobData } from "./lib/queue.js";
import { RATE_LIMITS, CHANNEL_TO_SERVICE } from "./config/rate-limits.js";
import { tryConsume } from "./lib/ratelimiter.js";
import { readItems } from "@directus/sdk";
import { getDernekContext, refreshAllDerneks } from "./dernek/dernek.context.js";
import { sendMessage } from "./channels/sender.js";
import { executeJourney } from "./modules/journeys/journey.execute.js";
import { triggerCampaign, finalizeCampaign } from "./modules/campaigns/campaigns.service.js";
import { listDernekIds } from "./config/derneks.js";

const worker = new Worker<SendJobData>(
  SEND_QUEUE,
  async (job: Job<SendJobData>, token?: string) => {
    const d = job.data;
    const service = CHANNEL_TO_SERVICE[d.channel];
    if (!service) throw new Error(`bilinmeyen kanal: ${d.channel}`);
    const rl = RATE_LIMITS[service];
    if (!rl) throw new Error(`rate limit tanımsız: ${service}`);

    // Rate-limit (dernek başına). Token yoksa işi geciktir (limiti aşma).
    const rate = await tryConsume(d.dernek, service, rl);
    if (!rate.allowed && token) {
      await job.moveToDelayed(Date.now() + rate.retryAfterMs, token);
      throw new DelayedError();
    }

    const ctx = getDernekContext(d.dernek);
    const result = await sendMessage(ctx, {
      channel: d.channel,
      to: d.to,
      templateRef: d.templateRef,
      languageCode: d.languageCode,
      vars: d.vars,
      body: d.body,
      iysfilter: d.iysfilter,
    });

    // Alıcı durumunu güncelle
    if (d.recipientId != null) {
      await ctx.directus.request(
        updateItem("campaign_recipients", d.recipientId, {
          status: result.status,
          provider_message_id: result.providerMessageId,
          error: result.error ?? null,
          updated_at: new Date().toISOString(),
        }),
      );
    }

    // Kampanya bitti mi? (tüm alıcılar terminal → done/failed)
    if (d.campaignId) await finalizeCampaign(ctx, d.campaignId).catch(() => {});

    if (result.status === "failed") throw new Error(result.error ?? "gönderim başarısız");
    return result;
  },
  { connection: connection as unknown as never, concurrency: 10 },
);

worker.on("completed", (job) => logger.debug(`✓ iş ${job.id} tamam`));
worker.on("failed", (job, err) => {
  if (err instanceof DelayedError) return; // rate-limit gecikmesi, normal
  logger.error(`✗ iş ${job?.id} hata: ${err.message}`);
});

// --- Journey (dinamik akış) worker ---
const journeyWorker = new Worker<JourneyJobData>(
  JOURNEY_QUEUE,
  async (job: Job<JourneyJobData>) => {
    const { dernek, ruleId, contactId } = job.data;
    const ctx = getDernekContext(dernek);
    const outcome = await executeJourney(ctx, ruleId, contactId);
    logger.info(`akış işi ${job.id}: ${outcome}`);
    return outcome;
  },
  { connection: connection as unknown as never, concurrency: 5 },
);
journeyWorker.on("failed", (job, err) => logger.error(`✗ akış işi ${job?.id} hata: ${err.message}`));

await refreshAllDerneks(); // Directus'tan kanal anahtarları

// --- Planlanmış kampanya zamanlayıcısı (60 sn'de bir) ---
async function runScheduler() {
  const now = new Date().toISOString();
  for (const dernekId of listDernekIds()) {
    try {
      const ctx = getDernekContext(dernekId);
      const due = (await ctx.directus.request(
        readItems("campaigns", {
          filter: { _and: [{ status: { _eq: "scheduled" } }, { scheduled_at: { _lte: now } }] } as any,
          fields: ["id"],
          limit: 20,
        }),
      )) as Array<{ id: string }>;
      for (const c of due) {
        logger.info(`planlı kampanya tetikleniyor: ${dernekId}/${c.id}`);
        await triggerCampaign(ctx, c.id).catch((e) => logger.error(`planlı tetik hata: ${e.message}`));
      }
    } catch {
      /* dernek atlanır */
    }
  }
}
setInterval(() => void runScheduler(), 60_000);

logger.info("mavera-hub worker çalışıyor (send + journey + zamanlayıcı)");
