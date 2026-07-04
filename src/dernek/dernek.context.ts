/**
 * Dernek bağlamı — bir dernekId için doğru Directus client + kanal anahtarlarını verir.
 * Kanal anahtarları önceliği: Directus `integration_settings` (UI'dan düzenlenebilir) > dosya registry (fallback).
 * Directus URL/token her zaman dosyadan (bootstrap).
 */
import { createDirectus, rest, staticToken, readSingleton } from "@directus/sdk";
import { getDernek, listDernekIds, type DernekConfig } from "../config/derneks.js";
import { logger } from "../lib/logger.js";

export type DirectusClient = ReturnType<typeof buildClient>;

function buildClient(url: string, token: string) {
  return createDirectus(url).with(staticToken(token)).with(rest());
}

const clientCache = new Map<string, DirectusClient>();
const credsCache = new Map<string, DernekConfig>(); // Directus'tan birleştirilmiş config

function client(dernekId: string): DirectusClient {
  let c = clientCache.get(dernekId);
  if (!c) {
    const cfg = getDernek(dernekId);
    c = buildClient(cfg.directus.url, cfg.directus.token);
    clientCache.set(dernekId, c);
  }
  return c;
}

export interface DernekContext {
  id: string;
  config: DernekConfig;
  directus: DirectusClient;
}

export function getDernekContext(dernekId: string): DernekContext {
  const config = credsCache.get(dernekId) ?? getDernek(dernekId);
  return { id: dernekId, config, directus: client(dernekId) };
}

/** Directus integration_settings'i okuyup kanal anahtarlarını birleştir (UI değişiklikleri buradan gelir). */
export async function refreshDernekCreds(dernekId: string): Promise<void> {
  const fileCfg = getDernek(dernekId);
  try {
    const s = (await client(dernekId).request(readSingleton("integration_settings"))) as Record<string, any>;
    const merged: DernekConfig = { ...fileCfg };
    if (s?.mc_token) merged.monochat = { slug: s.mc_slug, token: s.mc_token, businessPhone: s.mc_business_phone, baseUrl: s.mc_base_url };
    if (s?.ng_user) merged.netgsm = { user: s.ng_user, pass: s.ng_pass, msgheader: s.ng_msgheader, iysBrandCode: s.ng_iys_brand };
    if (s?.eo_api_key) merged.emailoctopus = { apiKey: s.eo_api_key, listId: s.eo_list_id };
    credsCache.set(dernekId, merged);
  } catch {
    // Singleton yoksa/boşsa dosya config'i kullanılır
    credsCache.set(dernekId, fileCfg);
  }
}

export async function refreshAllDerneks(): Promise<void> {
  for (const id of listDernekIds()) {
    await refreshDernekCreds(id).catch((e) => logger.warn(`creds refresh (${id}): ${e.message}`));
  }
}
