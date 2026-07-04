/**
 * Harici servis hız sınırları (dernek BAŞINA uygulanır — bir dernek diğerinin limitini yemez).
 * Değerler placeholder/muhafazakâr; gerçek limitler prod'da dernek/servis bazında ayarlanır.
 *
 * Kaynak notları (PRD/api docs):
 *  - EmailOctopus v2: ~10 istek/sn (biz 8'de tutuyoruz)
 *  - Netgsm rapor: dakikada ~10 (biz 1/dk) — SMS gönderim ayrı; muhafazakâr başlıyoruz
 *  - MonoChat: bulk (istek başına 1-5000 alıcı) + Meta günlük Tier limitleri → istek hızını düşük tutuyoruz
 */
export type ServiceKey = "emailoctopus" | "netgsm" | "monochat";

export interface RateLimit {
  ratePerSec: number; // saniyede yenilenen token
  burst: number; // kova kapasitesi
}

export const RATE_LIMITS: Record<ServiceKey, RateLimit> = {
  emailoctopus: { ratePerSec: 8, burst: 8 },
  netgsm: { ratePerSec: 1, burst: 5 },
  monochat: { ratePerSec: 1, burst: 3 },
};

export const CHANNEL_TO_SERVICE: Record<string, ServiceKey> = {
  email: "emailoctopus",
  sms: "netgsm",
  voice: "netgsm",
  whatsapp: "monochat",
};
