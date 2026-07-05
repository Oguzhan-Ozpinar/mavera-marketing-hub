/**
 * Kampanya servisi — oluştur + tetikle.
 * Tetikleme akışı: hedef kitle → fail-safe filtre → campaign_recipients + kuyruğa iş.
 */
import { createItem, readItem, readItems, updateItem } from "@directus/sdk";
import type { DernekContext } from "../../dernek/dernek.context.js";
import type { Channel } from "../../channels/sender.js";
import { sendQueue } from "../../lib/queue.js";
import { buildAudience } from "./audience.service.js";
import { filterRecipients } from "./filter.service.js";
import { filterAllowed } from "../blacklist/blacklist.service.js";

export interface CreateCampaignInput {
  name: string;
  channel: Channel;
  template_ref?: string;
  language?: string;
  template_vars?: { header?: string[]; body?: string[] }; // token eşlemesi
  header_media?: string; // medya header'lı şablon için URL
  message?: string; // SMS düz metin
  iysfilter?: "0" | "11" | "12"; // SMS İYS tipi
  segment?: Record<string, unknown>;
  audience_type?: "segment" | "manual";
  manual_recipients?: Array<{ to: string; name?: string }>;
  scheduled_at?: string | null; // ISO — verilirse status=scheduled
}

export async function createCampaign(ctx: DernekContext, input: CreateCampaignInput, createdBy?: string) {
  return ctx.directus.request(
    createItem("campaigns", {
      name: input.name,
      channel: input.channel,
      template_ref: input.template_ref ?? null,
      language: input.language ?? "tr",
      template_vars: input.template_vars ?? {},
      header_media: input.header_media ?? null,
      message: input.message ?? null,
      iysfilter: input.iysfilter ?? "11",
      segment: input.segment ?? {},
      audience_type: input.audience_type ?? "segment",
      manual_recipients: input.manual_recipients ?? [],
      scheduled_at: input.scheduled_at ?? null,
      status: input.scheduled_at ? "scheduled" : "draft",
      created_by: createdBy ?? null,
    }),
  );
}

/** Tüm alıcılar terminal duruma geldiyse kampanyayı done/failed'e çeker + sayımları günceller. */
export async function finalizeCampaign(ctx: DernekContext, campaignId: string): Promise<void> {
  const rows = (await ctx.directus.request(
    readItems("campaign_recipients", { filter: { campaign_id: { _eq: campaignId } } as any, fields: ["status"], limit: -1 }),
  )) as Array<{ status: string }>;
  if (rows.some((r) => r.status === "queued")) return; // hâlâ bekleyen var

  const sent = rows.filter((r) => ["sent", "delivered", "read"].includes(r.status)).length;
  const failed = rows.filter((r) => r.status === "failed").length;
  await ctx.directus.request(
    updateItem("campaigns", campaignId, {
      status: sent > 0 ? "done" : "failed",
      counts: { total: rows.length, sent, failed },
    }),
  );
}

/** Token'ı kişinin gerçek Directus verisine çöz. "lit:..." = sabit metin. */
export function resolveToken(contact: Record<string, any>, token: string): string {
  if (token?.startsWith("lit:")) return token.slice(4); // sabit metin
  switch (token) {
    case "fullName":
      return contact.full_name || `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim();
    case "first_name":
      return contact.first_name ?? "";
    case "last_name":
      return contact.last_name ?? "";
    case "email":
      return contact.email ?? "";
    case "phone":
      return contact.phone ?? "";
    case "mvr_uid":
      return contact.mvr_uid ?? "";
    case "id":
      return String(contact.id ?? "");
    case "referans":
      return contact.referans ?? "";
    case "ulke":
      return contact.ulke ?? "";
    default:
      return "";
  }
}

export interface TriggerResult {
  campaignId: string;
  total: number;
  queued: number;
  skipped: number;
  skippedReasons: Record<string, number>;
}

export async function triggerCampaign(ctx: DernekContext, campaignId: string): Promise<TriggerResult> {
  const campaign = (await ctx.directus.request(
    readItem("campaigns", campaignId, {
      fields: ["id", "channel", "template_ref", "language", "template_vars", "header_media", "message", "iysfilter", "segment", "audience_type", "manual_recipients", "status"],
    }),
  )) as {
    id: string;
    channel: Channel;
    template_ref?: string;
    language?: string;
    template_vars?: { header?: string[]; body?: string[] };
    header_media?: string;
    message?: string;
    iysfilter?: "0" | "11" | "12";
    segment?: Record<string, unknown>;
    audience_type?: "segment" | "manual";
    manual_recipients?: Array<{ to: string; name?: string }>;
  };

  await ctx.directus.request(updateItem("campaigns", campaignId, { status: "sending", triggered_at: new Date().toISOString() }));

  const tv = campaign.template_vars ?? {};
  const skipped: Array<{ reason: string }> = [];
  let recipients: Array<{ to: string; contactId: string | null; contact: Record<string, any> }> = [];
  let total = 0;

  if (campaign.audience_type === "manual") {
    // Liste-dışı alıcılar (Excel/manuel). Opt-in aranmaz; sadece blacklist.
    const list = campaign.manual_recipients ?? [];
    total = list.length;
    const allowedVals = await filterAllowed(ctx.id, campaign.channel, list.map((m) => m.to));
    for (const m of list) {
      if (!allowedVals.has(m.to)) { skipped.push({ reason: "blacklist" }); continue; }
      recipients.push({ to: m.to, contactId: null, contact: { full_name: m.name ?? "", first_name: m.name ?? "" } });
    }
  } else {
    // Segment tabanlı — fail-safe filtre (izin + iletişim + blacklist)
    const audience = await buildAudience(ctx, campaign.segment);
    total = audience.length;
    const byId = new Map(audience.map((c) => [c.id, c]));
    const requireOptin = !(campaign.channel === "sms" && campaign.iysfilter === "0");
    const res = await filterRecipients(ctx, campaign.channel, audience, { requireOptin });
    for (const s of res.skipped) skipped.push({ reason: s.reason });
    recipients = res.allowed.map((r) => ({ to: r.to, contactId: r.contactId, contact: (byId.get(r.contactId) ?? {}) as Record<string, any> }));
  }

  // Alıcı kaydı + kuyruğa iş (kişi başına değişkenleri çözerek)
  let queued = 0;
  for (const r of recipients) {
    const vars = {
      // Medya header'lı şablon → header param = medya URL; değilse metin değişkenleri
      header: campaign.header_media ? [campaign.header_media] : (tv.header ?? []).map((t) => resolveToken(r.contact, t)),
      body: (tv.body ?? []).map((t) => resolveToken(r.contact, t)),
    };
    const rec = (await ctx.directus.request(
      createItem("campaign_recipients", {
        campaign_id: campaignId,
        contact_id: r.contactId,
        to: r.to,
        status: "queued",
        updated_at: new Date().toISOString(),
      }),
    )) as { id: string | number };

    await sendQueue.add("send", {
      dernek: ctx.id,
      channel: campaign.channel,
      campaignId,
      recipientId: rec.id,
      to: r.to,
      templateRef: campaign.template_ref,
      languageCode: campaign.language,
      vars,
      body: campaign.message,
      iysfilter: campaign.iysfilter,
    });
    queued++;
  }

  const skippedReasons: Record<string, number> = {};
  for (const s of skipped) skippedReasons[s.reason] = (skippedReasons[s.reason] ?? 0) + 1;

  const result: TriggerResult = { campaignId, total, queued, skipped: skipped.length, skippedReasons };

  await ctx.directus.request(
    updateItem("campaigns", campaignId, {
      status: queued > 0 ? "sending" : "done",
      counts: { total: result.total, queued: result.queued, skipped: result.skipped },
    }),
  );

  return result;
}
