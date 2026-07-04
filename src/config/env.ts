import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default("info"),

  REDIS_URL: z.string().default("redis://localhost:6379"),

  DERNEK_REGISTRY_PATH: z.string().default("./config/derneks.json"),
  DERNEK_REGISTRY: z.string().optional(), // JSON string (Coolify/prod'da dosya yerine)
  CREDENTIAL_ENC_KEY: z.string().optional(),

  JWT_SECRET: z
    .string()
    .min(16, "JWT_SECRET en az 16 karakter olmalı")
    .default("dev-only-degistir-uzun-rastgele-secret"),

  BTS_API_URL: z.string().url().optional(),
  BTS_API_KEY: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
  WEBHOOK_NETGSM_SECRET: z.string().optional(),
  WEBHOOK_MONOCHAT_TOKEN: z.string().optional(),
  WEBHOOK_BTS_SECRET: z.string().optional(),

  LOCAL_DIRECTUS_URL: z.string().url().default("http://localhost:8055"),
  LOCAL_DIRECTUS_TOKEN: z.string().default("lokal-admin-token"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("❌ Ortam değişkenleri geçersiz:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
