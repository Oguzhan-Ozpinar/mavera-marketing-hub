/**
 * Telefon normalizasyonu — kontaktın TEKİL ANAHTARI (BTS ile uyumlu).
 *
 * Strateji (bkz. Faz 1 planı §6):
 *  - Agresif normalizasyon → kanonik E.164 (+90XXXXXXXXXX)
 *  - `last10` = ülke kodsuz son 10 hane → GÜVENLİ otomatik-birleştirme anahtarı
 *  - Daha bulanık eşleşme (1-2 hane fark) burada YAPILMAZ; o insan onayına düşer.
 *
 * Varsayılan ülke: Türkiye (90). İleride dernek bazlı override edilebilir.
 */

export interface NormalizedPhone {
  /** Kanonik uluslararası form, örn. "+905321234567". Geçersizse null. */
  e164: string | null;
  /** Ülke kodsuz son 10 hane, örn. "5321234567". Eşleştirme anahtarı. */
  last10: string | null;
  /** Girilen ham değer. */
  raw: string;
  /** TR GSM formatına uyuyor mu (90 + 5XXXXXXXXX). */
  valid: boolean;
}

const DEFAULT_COUNTRY = "90";

export function normalizePhone(
  input: string | null | undefined,
  defaultCountry: string = DEFAULT_COUNTRY,
): NormalizedPhone {
  const raw = String(input ?? "");
  const hadPlus = raw.trim().startsWith("+");

  // Sadece rakamlar
  let d = raw.replace(/\D/g, "");

  // 00 uluslararası öneki → at
  if (d.startsWith("00")) d = d.slice(2);

  if (!hadPlus) {
    // "0532..." (11 hane, baştaki 0) → ülke kodu ile değiştir
    if (d.length === 11 && d.startsWith("0")) {
      d = defaultCountry + d.slice(1);
    }
    // "532..." (10 hane, ülke kodsuz) → ülke kodu ekle
    else if (d.length === 10) {
      d = defaultCountry + d;
    }
    // 12 hane ve ülke kodu ile başlıyorsa dokunma
  }

  const last10 = d.length >= 10 ? d.slice(-10) : null;
  const e164 = d.length >= 11 ? `+${d}` : null;
  const valid =
    d.length === 12 &&
    d.startsWith(defaultCountry) &&
    last10 !== null &&
    last10.startsWith("5");

  return { e164, last10, raw, valid };
}

/**
 * İki numaranın AYNI kişiye ait sayılıp sayılamayacağı (otomatik birleştirme için).
 * Sadece son-10-hane KESİN eşleşmesinde true. Bulanık eşleşme burada YOK.
 */
export function isSamePhone(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizePhone(a).last10;
  const nb = normalizePhone(b).last10;
  return na !== null && nb !== null && na === nb;
}
