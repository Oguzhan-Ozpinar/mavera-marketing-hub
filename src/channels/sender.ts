/**
 * Kanal gönderici soyutlaması.
 * - Kimlik bilgisi (dernek registry'de) VARSA → gerçek API'ye gider.
 * - YOKSA → dry-run: gerçekten göndermez, simüle eder (lokal geliştirme + test için).
 *
 * Not: Gerçek HTTP payload'ları PRD endpoint haritasına göre şekillenir; kesin doğrulama
 * gerçek anahtarlar + api docs geldiğinde tamamlanır (TODO işaretli).
 */
import { logger } from "../lib/logger.js";
import type { DernekContext } from "../dernek/dernek.context.js";
import { sendTemplate } from "./monochat/mc.client.js";
import { sendSmsNetgsm } from "./netgsm/ng.client.js";
import { upsertEoContactTag } from "./emailoctopus/eo.client.js";

export type Channel = "email" | "sms" | "whatsapp";

export interface OutboundMessage {
  channel: Channel;
  to: string; // email veya E.164 telefon
  templateRef?: string;
  languageCode?: string;
  vars?: { header?: string[]; body?: string[] }; // WhatsApp şablon değişkenleri (çözümlenmiş)
  body?: string; // sms için düz metin
  iysfilter?: "0" | "11" | "12"; // SMS: 11=ticari(İYS), 0=bilgilendirme
}

export interface SendResult {
  status: "sent" | "failed";
  providerMessageId: string | null;
  dryRun: boolean;
  error?: string;
}

export async function sendMessage(ctx: DernekContext, msg: OutboundMessage): Promise<SendResult> {
  switch (msg.channel) {
    case "email":
      return sendEmail(ctx, msg);
    case "sms":
      return sendSms(ctx, msg);
    case "whatsapp":
      return sendWhatsapp(ctx, msg);
  }
}

function dryRun(ctx: DernekContext, msg: OutboundMessage): SendResult {
  logger.info(`[dry-run] ${ctx.id} ${msg.channel} → ${msg.to} (${msg.templateRef ?? msg.body ?? ""})`);
  return { status: "sent", providerMessageId: `dry-${msg.channel}-${Date.now()}`, dryRun: true };
}

async function sendEmail(ctx: DernekContext, msg: OutboundMessage): Promise<SendResult> {
  const creds = ctx.config.emailoctopus;
  if (!creds?.apiKey || !creds.listId) return dryRun(ctx, msg); // listId yoksa dry-run
  try {
    // templateRef = EO tag'i; kontağı tag'le → derneğin EO otomasyonu gönderir
    const id = await upsertEoContactTag(ctx, { email: msg.to, tag: msg.templateRef });
    return { status: "sent", providerMessageId: id, dryRun: false };
  } catch (e: any) {
    return { status: "failed", providerMessageId: null, dryRun: false, error: e.message };
  }
}

async function sendSms(ctx: DernekContext, msg: OutboundMessage): Promise<SendResult> {
  const creds = ctx.config.netgsm;
  if (!creds) return dryRun(ctx, msg);
  try {
    const jobId = await sendSmsNetgsm(ctx, { to: msg.to, message: msg.body ?? msg.templateRef ?? "", iysfilter: msg.iysfilter });
    return { status: "sent", providerMessageId: jobId, dryRun: false };
  } catch (e: any) {
    return { status: "failed", providerMessageId: null, dryRun: false, error: e.message };
  }
}

async function sendWhatsapp(ctx: DernekContext, msg: OutboundMessage): Promise<SendResult> {
  const creds = ctx.config.monochat;
  if (!creds) return dryRun(ctx, msg);
  if (!msg.templateRef) return { status: "failed", providerMessageId: null, dryRun: false, error: "şablon seçilmedi" };
  try {
    const id = await sendTemplate(ctx, {
      to: msg.to,
      templateName: msg.templateRef,
      languageCode: msg.languageCode,
      variables: msg.vars,
    });
    return { status: "sent", providerMessageId: id, dryRun: false };
  } catch (e: any) {
    return { status: "failed", providerMessageId: null, dryRun: false, error: e.message };
  }
}
