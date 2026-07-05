export interface ContactRecord {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  phone?: string | null;
  phone_last10?: string | null;
  email?: string | null;
  mvr_uid?: string | null;
  referans?: string | null;
  ulke?: string | null;
  adres?: string | null;
  is_merged?: boolean | null;
  [key: string]: unknown;
}

export interface ScoreResult {
  score: number;
  reasons: string[];
  signals: Record<string, number | string | boolean>;
}

const TURKISH_CHAR_MAP: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  İ: "i",
  ö: "o",
  ş: "s",
  ü: "u",
};

export const CONTACT_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "phone",
  "phone_last10",
  "email",
  "mvr_uid",
  "referans",
  "ulke",
  "adres",
  "whatsapp_optin",
  "mail_optin",
  "sms_optin",
  "phone_call_optin",
  "donation_count",
  "donation_total",
  "last_donation_at",
  "first_donation_at",
  "donation_type_list",
  "donation_types",
  "is_merged",
  "merged_into",
  "merged_at",
  "date_created",
  "date_updated",
];

export function pairKey(a: string, b: string): string {
  return [String(a), String(b)].sort().join(":");
}

export function compactName(contact: ContactRecord): string {
  const direct = stringValue(contact.full_name);
  if (direct) return direct;
  return [contact.first_name, contact.last_name].map(stringValue).filter(Boolean).join(" ");
}

export function normalizeText(value: unknown): string {
  return stringValue(value)
    .replace(/[çğıİöşü]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEmail(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, "");
}

export function last10(value: unknown): string {
  const digits = stringValue(value).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

export function scoreContacts(a: ContactRecord, b: ContactRecord): ScoreResult {
  let score = 0;
  const reasons: string[] = [];
  const signals: Record<string, number | string | boolean> = {};

  const aPhone = stringValue(a.phone_last10) || last10(a.phone);
  const bPhone = stringValue(b.phone_last10) || last10(b.phone);
  if (aPhone && bPhone && aPhone === bPhone) {
    score += 72;
    reasons.push("Telefon son 10 hane ayni");
    signals.phone_last10 = true;
  }

  const aEmail = normalizeEmail(a.email);
  const bEmail = normalizeEmail(b.email);
  if (aEmail && bEmail && aEmail === bEmail) {
    score += 68;
    reasons.push("E-posta birebir ayni");
    signals.email_exact = true;
  } else if (aEmail && bEmail) {
    const emailSimilarity = similarity(aEmail, bEmail);
    signals.email_similarity = Math.round(emailSimilarity * 100);
    if (emailSimilarity >= 0.92) {
      score += 28;
      reasons.push(`E-posta cok benzer (${Math.round(emailSimilarity * 100)}%)`);
    } else if (sameEmailDomain(aEmail, bEmail) && emailSimilarity >= 0.82) {
      score += 18;
      reasons.push("E-posta domain ayni ve adresler benzer");
    }
  }

  const aName = normalizeText(compactName(a));
  const bName = normalizeText(compactName(b));
  if (aName && bName) {
    const nameSimilarity = similarity(aName, bName);
    signals.name_similarity = Math.round(nameSimilarity * 100);
    if (nameSimilarity >= 0.94) {
      score += 32;
      reasons.push(`Ad soyad neredeyse ayni (${Math.round(nameSimilarity * 100)}%)`);
    } else if (nameSimilarity >= 0.84) {
      score += 24;
      reasons.push(`Ad soyad benzer (${Math.round(nameSimilarity * 100)}%)`);
    } else if (nameSimilarity >= 0.72) {
      score += 12;
      reasons.push(`Ad soyad kismen benzer (${Math.round(nameSimilarity * 100)}%)`);
    }
  }

  const aMvr = stringValue(a.mvr_uid);
  const bMvr = stringValue(b.mvr_uid);
  if (aMvr && bMvr && aMvr === bMvr) {
    score += 45;
    reasons.push("MVR UID ayni");
    signals.mvr_uid = true;
  }

  const aRef = normalizeText(a.referans);
  const bRef = normalizeText(b.referans);
  if (aRef && bRef && aRef === bRef) {
    score += 8;
    reasons.push("Referans ayni");
    signals.referans = true;
  }

  const aCountry = normalizeText(a.ulke);
  const bCountry = normalizeText(b.ulke);
  if (aCountry && bCountry && aCountry === bCountry) {
    score += 5;
    signals.ulke = true;
  }

  const capped = Math.min(100, Math.round(score));
  return { score: capped, reasons, signals };
}

function sameEmailDomain(a: string, b: string): boolean {
  const aDomain = a.split("@")[1];
  const bDomain = b.split("@")[1];
  return Boolean(aDomain && bDomain && aDomain === bDomain);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  const curr = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j]!;
  }

  return prev[b.length]!;
}
