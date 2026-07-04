/**
 * Kanal başına TAHMİNİ birim maliyet (TRY). Kampanya tutarı = gönderilebilir kişi × birim.
 * ⚠️ Bunlar tahmini/placeholder — gerçek fiyat pakete/ülkeye/mesaj uzunluğuna göre değişir.
 *   - WhatsApp (Meta pazarlama konuşması + sağlayıcı marjı) ~ mesaj başına
 *   - SMS (Netgsm): Türkçe karakterli mesaj 70 karakter/parça; uzun mesaj = birden çok parça (kat kat)
 *   - E-posta (EmailOctopus): abonelik dahilinde, marjinal ~0
 * İleride dernek/paket bazında override edilebilir.
 */
export const UNIT_COST_TRY: Record<string, number> = {
  whatsapp: 0.35,
  sms: 0.12,
  email: 0,
};

export function estimateCost(channel: string, count: number): number {
  const unit = UNIT_COST_TRY[channel] ?? 0;
  return Math.round(unit * count * 100) / 100;
}
