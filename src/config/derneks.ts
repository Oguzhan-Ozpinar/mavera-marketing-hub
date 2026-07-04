/**
 * Dernek Registry — "telefon rehberi".
 *
 * Model B: her derneğin KENDİ Directus'u + kendi kanal anahtarları var.
 * Bu dosya config/derneks.json'u okur, doğrular ve dernek bazlı erişim sağlar.
 * (tenant_id YOK — izolasyon fiziksel; registry hangi dernek→hangi bağlantı bilgisini tutar.)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { env } from "./env.js";

const directusSchema = z.object({
  url: z.string().url(),
  token: z.string().min(1),
});

// Kanal anahtarları lokal geliştirmede opsiyonel; prod'da dolu olmalı.
const dernekSchema = z.object({
  name: z.string(),
  directus: directusSchema,
  emailoctopus: z.object({ apiKey: z.string(), listId: z.string().optional() }).optional(),
  netgsm: z.object({ user: z.string(), pass: z.string(), msgheader: z.string().optional(), iysBrandCode: z.string().optional() }).optional(),
  monochat: z
    .object({
      slug: z.string(),
      token: z.string(),
      businessPhone: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .optional(),
  bts: z.object({ dernekRef: z.string() }).optional(),
});

export type DernekConfig = z.infer<typeof dernekSchema> & { id: string };

// "_" ile başlayan anahtarlar (açıklama vb.) yok sayılır.
const registrySchema = z.record(z.string(), dernekSchema.or(z.any())).transform((obj) => {
  const out: Record<string, DernekConfig> = {};
  for (const [id, val] of Object.entries(obj)) {
    if (id.startsWith("_")) continue;
    const parsed = dernekSchema.parse(val);
    out[id] = { id, ...parsed };
  }
  return out;
});

let registry: Record<string, DernekConfig> | null = null;

export function loadRegistry(): Record<string, DernekConfig> {
  if (registry) return registry;
  // Öncelik: DERNEK_REGISTRY env (JSON string, prod/Coolify) → yoksa dosya
  let raw: string;
  if (env.DERNEK_REGISTRY) {
    raw = env.DERNEK_REGISTRY;
  } else {
    const path = resolve(process.cwd(), env.DERNEK_REGISTRY_PATH);
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      throw new Error(`Dernek registry bulunamadı: DERNEK_REGISTRY env ya da ${path}`);
    }
  }
  registry = registrySchema.parse(JSON.parse(raw));
  return registry;
}

export function getDernek(id: string): DernekConfig {
  const reg = loadRegistry();
  const d = reg[id];
  if (!d) throw new Error(`Bilinmeyen dernek: ${id}`);
  return d;
}

export function hasDernek(id: string): boolean {
  return Boolean(loadRegistry()[id]);
}

export function listDernekIds(): string[] {
  return Object.keys(loadRegistry());
}

/** Login dropdown'u için (id + görünen ad; secret içermez). */
export function listDerneks(): Array<{ id: string; name: string }> {
  return Object.values(loadRegistry()).map((d) => ({ id: d.id, name: d.name }));
}
