/**
 * Blacklist — gönderim öncesi O(1) engel kontrolü.
 * Redis Set (hız) + Directus master_blacklist (kalıcı doğruluk kaynağı).
 * Anahtar: `bl:{dernek}:{channel}` ve `bl:{dernek}:global`.
 * Dernek başına izole (İYS marka bazlı).
 */
import { createItem, readItems } from "@directus/sdk";
import { redis } from "../../lib/redis.js";
import type { DernekContext } from "../../dernek/dernek.context.js";
import { normalizePhone } from "../../lib/phone.js";

function key(dernek: string, channel: string): string {
  return `bl:${dernek}:${channel}`;
}

/** Değeri normalize et: telefonsa son-10-hane, email ise küçük harf. */
export function normalizeValue(value: string): string {
  const phone = normalizePhone(value);
  if (phone.last10) return phone.last10;
  return value.trim().toLowerCase();
}

/** Directus master_blacklist → Redis Set (başlangıçta / periyodik). */
export async function syncFromDirectus(ctx: DernekContext): Promise<number> {
  const rows = (await ctx.directus.request(
    readItems("master_blacklist", { fields: ["value", "channel"], limit: -1 }),
  )) as Array<{ value: string; channel: string }>;

  const pipe = redis.pipeline();
  for (const r of rows) {
    if (!r.value || !r.channel) continue;
    pipe.sadd(key(ctx.id, r.channel), normalizeValue(r.value));
  }
  await pipe.exec();
  return rows.length;
}

/** Tek değer engelli mi? (kanal + global) */
export async function isBlocked(dernek: string, channel: string, value: string): Promise<boolean> {
  const v = normalizeValue(value);
  const res = await redis
    .pipeline()
    .sismember(key(dernek, channel), v)
    .sismember(key(dernek, "global"), v)
    .exec();
  const inChannel = Number(res?.[0]?.[1] ?? 0);
  const inGlobal = Number(res?.[1]?.[1] ?? 0);
  return inChannel === 1 || inGlobal === 1;
}

/** Toplu filtre: engelli OLMAYAN değerleri döner (kampanya için). */
export async function filterAllowed(dernek: string, channel: string, values: string[]): Promise<Set<string>> {
  if (values.length === 0) return new Set();
  const normalized = values.map(normalizeValue);
  const res = await redis
    .pipeline()
    .smismember(key(dernek, channel), ...normalized)
    .smismember(key(dernek, "global"), ...normalized)
    .exec();
  const chan = (res?.[0]?.[1] as number[]) ?? [];
  const glob = (res?.[1]?.[1] as number[]) ?? [];
  const allowed = new Set<string>();
  values.forEach((orig, i) => {
    if (chan[i] !== 1 && glob[i] !== 1) allowed.add(orig);
  });
  return allowed;
}

/** Engel ekle: hem Directus (kalıcı) hem Redis (hızlı). */
export async function addToBlacklist(
  ctx: DernekContext,
  value: string,
  channel: string,
  reason = "",
): Promise<void> {
  await ctx.directus.request(
    createItem("master_blacklist", { value, channel, reason, blocked_at: new Date().toISOString() }),
  );
  await redis.sadd(key(ctx.id, channel), normalizeValue(value));
}
