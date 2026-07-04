/**
 * MonoChat (WhatsApp) istemcisi.
 *  - listTemplates: onaylı şablonları çeker (template/list.js) — kampanya değişken eşlemesi için
 *  - sendTemplate: tek alıcıya şablon mesajı (bulk-message/send.js, isMerge)
 * Kaynak: api docs/Whatsapp_Template_API + Bulk_Template_Message_API.
 */
import type { DernekContext } from "../../dernek/dernek.context.js";

interface MC {
  slug: string;
  token: string;
  businessPhone?: string;
  baseUrl?: string;
}

function cfg(ctx: DernekContext): MC | null {
  return (ctx.config.monochat as MC) ?? null;
}

async function mcPost(mc: MC, path: string, body: unknown): Promise<any> {
  const base = mc.baseUrl ?? "https://app.monochat.ai";
  const res = await fetch(`${base}/api/${mc.slug}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${mc.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok || json?.error) {
    const msg = json?.error?.message ?? json?.error?.reason ?? json?.message ?? `MonoChat ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return json;
}

export interface NormalizedTemplate {
  name: string;
  category?: string;
  languageCode?: string;
  status?: string;
  headerFormat?: string; // TEXT | IMAGE | ...
  headerVarCount: number;
  bodyText?: string;
  bodyVarCount: number;
  footerText?: string;
  buttonsVarCount: number;
}

function normalize(t: any): NormalizedTemplate {
  const comps: any[] = t.components ?? [];
  const header = comps.find((c) => c.type === "HEADER");
  const body = comps.find((c) => c.type === "BODY");
  const footer = comps.find((c) => c.type === "FOOTER");
  const buttons = comps.find((c) => c.type === "BUTTONS");
  return {
    name: t.name,
    category: t.category,
    languageCode: t.languageCode,
    status: t.status,
    headerFormat: header?.format,
    headerVarCount: header?.format === "TEXT" ? header?.variables?.length ?? 0 : 0,
    bodyText: body?.text,
    bodyVarCount: body?.variables?.length ?? 0,
    footerText: footer?.text,
    buttonsVarCount: buttons?.variables?.length ?? 0,
  };
}

export async function listTemplates(ctx: DernekContext): Promise<NormalizedTemplate[]> {
  const mc = cfg(ctx);
  if (!mc) throw new Error("MonoChat yapılandırılmamış (dernek registry)");
  const res = await mcPost(mc, "/custom-functions/template-app/api/template/list.js", {
    phoneNumber: mc.businessPhone,
  });
  const arr: any[] = res?.result?.templateMessages ?? res?.result ?? (Array.isArray(res) ? res : []);
  // Sadece gönderilebilir olanlar (APPROVED). REMOVED/REJECTED/PENDING gizlenir.
  return arr.map(normalize).filter((t) => t.status === "APPROVED");
}

export interface WaVariables {
  header?: string[];
  body?: string[];
}

export async function sendTemplate(
  ctx: DernekContext,
  opts: { to: string; templateName: string; languageCode?: string; variables?: WaVariables },
): Promise<string> {
  const mc = cfg(ctx);
  if (!mc) throw new Error("MonoChat yapılandırılmamış");
  const variables: any[] = [];
  if (opts.variables?.header?.length) variables.push({ type: "HEADER", parameters: opts.variables.header });
  if (opts.variables?.body?.length) variables.push({ type: "BODY", parameters: opts.variables.body });

  const res = await mcPost(mc, "/custom-functions/template-app/api/template/send.js", {
    phoneNumber: mc.businessPhone, // WhatsApp Business numarası (+ yok)
    templateMessageName: opts.templateName,
    languageCode: opts.languageCode ?? "tr",
    customerPhoneNumber: opts.to.replace(/\D/g, ""), // alıcı (+ yok)
    variables,
  });
  return res?.result?.messageId ?? res?.result?._id ?? res?.messageId ?? "sent";
}
