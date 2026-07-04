/**
 * Webhook doğrulama. Webhook'lar JWT taşımaz; imza/secret ile doğrulanır.
 *
 * Şu an: basit paylaşılan-secret kontrolü (header `x-webhook-secret`).
 * TODO (gerçek): sağlayıcıya özel doğrulama —
 *   Netgsm: IP allowlist + secret · MonoChat: verify token · EmailOctopus: HMAC imza.
 */
import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";

export function checkSecret(req: FastifyRequest, expected: string | undefined): boolean {
  if (!expected) return true; // secret tanımlı değilse (lokal/dev) geç — prod'da mutlaka set edilmeli
  const got = req.headers["x-webhook-secret"];
  return typeof got === "string" && got === expected;
}

/** Olay id yoksa payload'dan deterministik id üret. */
export function eventIdFrom(payload: unknown, provided?: string | null): string {
  if (provided) return String(provided);
  const hash = createHash("sha256").update(JSON.stringify(payload ?? {})).digest("hex");
  return hash.slice(0, 32);
}

export function payloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload ?? {})).digest("hex");
}
