import {
  CONTACT_FIELDS,
  type ContactRecord,
  type ScoreResult,
  pairKey,
  scoreContacts,
  last10,
  normalizeEmail,
  normalizeText,
  compactName,
} from "./scoring";

type Database = any;

export interface DuplicateCandidate {
  id: number;
  contact_a: string;
  contact_b: string;
  contact_a_name?: string | null;
  contact_b_name?: string | null;
  score: number;
  reasons: string[] | string;
  signals?: Record<string, unknown> | string | null;
  status: "pending" | "rejected" | "merged";
  pair_key: string;
  detected_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export interface HydratedCandidate extends DuplicateCandidate {
  contactA: ContactRecord | null;
  contactB: ContactRecord | null;
}

const DEFAULT_THRESHOLD = 55;

const MERGE_FIELDS = [
  { field: "first_name", label: "Ad", type: "text", strategy: "prefer-master" },
  { field: "last_name", label: "Soyad", type: "text", strategy: "prefer-master" },
  { field: "phone", label: "Telefon", type: "text", strategy: "prefer-master" },
  { field: "email", label: "E-posta", type: "text", strategy: "prefer-master" },
  { field: "mvr_uid", label: "MVR UID", type: "text", strategy: "prefer-master" },
  { field: "referans", label: "Referans", type: "text", strategy: "prefer-master" },
  { field: "ulke", label: "Ulke", type: "text", strategy: "prefer-master" },
  { field: "adres", label: "Adres", type: "text", strategy: "prefer-master" },
  { field: "whatsapp_optin", label: "WhatsApp izni", type: "boolean", strategy: "conservative-consent" },
  { field: "mail_optin", label: "E-posta izni", type: "boolean", strategy: "conservative-consent" },
  { field: "sms_optin", label: "SMS izni", type: "boolean", strategy: "conservative-consent" },
  { field: "phone_call_optin", label: "Arama izni", type: "boolean", strategy: "conservative-consent" },
] as const;

const RELATION_MOVES = [
  { collection: "consent_log", field: "contact_id" },
  { collection: "campaign_recipients", field: "contact_id" },
  { collection: "Notes", field: "contact_id" },
  { collection: "Opportunities", field: "contact_id" },
  { collection: "Tasks", field: "related_contact" },
  { collection: "attribution_events", field: "mvruid_eslestirme" },
];

export async function listCandidates(
  database: Database,
  status = "pending",
  limit = 100,
): Promise<HydratedCandidate[]> {
  const rows = await database("duplicate_candidates")
    .where({ status })
    .orderBy("score", "desc")
    .orderBy("detected_at", "desc")
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 250));

  return hydrateCandidates(database, rows);
}

/**
 * Tüm kişileri tarar — blocking-key yöntemi (ölçeklenebilir).
 * O(n²) yerine kişileri aynı telefon / e-posta / mvr_uid / normalize-isim
 * kovalarına ayırır ve YALNIZCA kova içi çiftleri skorlar. 16k+ kişide bile
 * karşılaştırma sayısı küçük kalır; Directus sürecini dondurmaz.
 */
export async function scanAllContacts(
  database: Database,
  options: { threshold?: number; maxBucket?: number } = {},
) {
  const threshold = Number(options.threshold) || DEFAULT_THRESHOLD;
  // Placeholder/çöp değerler (ör. yüzlerce kayıtta paylaşılan aynı e-posta/telefon)
  // dev kovalar oluşturup O(n²) patlamasına yol açar. Gerçek bir kişinin nadiren
  // 20'den fazla mükerrer kaydı olur; bundan büyük kovalar veri-kalitesi artefaktı
  // sayılıp ATLANIR ve oversizeBuckets olarak raporlanır (ayrıca elle incelenebilir).
  const maxBucket = Math.min(Math.max(Number(options.maxBucket) || 20, 2), 500);

  const contacts: ContactRecord[] = await database("Contacts")
    .select(CONTACT_FIELDS)
    .where((builder: any) => {
      builder.whereNull("is_merged").orWhere("is_merged", false);
    });

  // Blocking kovaları oluştur.
  const buckets = new Map<string, ContactRecord[]>();
  const push = (key: string, c: ContactRecord) => {
    let arr = buckets.get(key);
    if (!arr) { arr = []; buckets.set(key, arr); }
    arr.push(c);
  };
  for (const c of contacts) {
    const phone = String(c.phone_last10 ?? "").trim() || last10(c.phone);
    if (phone) push(`p:${phone}`, c);
    const email = normalizeEmail(c.email);
    if (email) push(`e:${email}`, c);
    const mvr = String(c.mvr_uid ?? "").trim();
    if (mvr) push(`m:${mvr}`, c);
    const name = normalizeText(compactName(c));
    if (name) push(`n:${name}`, c);
  }

  // Kova içi çiftleri skorla (pairKey ile tekilleştir — bir çift birden çok kovada olabilir).
  let compared = 0;
  let oversizeBuckets = 0;
  const oversizeSamples: Array<{ key: string; size: number }> = [];
  const seen = new Set<string>();
  const matches: Array<{ a: ContactRecord; b: ContactRecord; scored: ScoreResult }> = [];
  for (const [key, group] of buckets.entries()) {
    if (group.length < 2) continue;
    if (group.length > maxBucket) {
      oversizeBuckets += 1;
      if (oversizeSamples.length < 20) oversizeSamples.push({ key, size: group.length });
      continue;
    }
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i]!;
        const b = group[j]!;
        const pk = pairKey(String(a.id), String(b.id));
        if (seen.has(pk)) continue;
        seen.add(pk);
        compared += 1;
        const scored = scoreContacts(a, b);
        if (scored.score >= threshold) matches.push({ a, b, scored });
      }
    }
  }

  // Eşik üstü çiftleri aday olarak yaz.
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const m of matches) {
    const result = await writeCandidate(database, m.a, m.b, m.scored);
    if (result === "created") created += 1;
    else if (result === "updated") updated += 1;
    else skipped += 1;
  }

  return {
    scanned: contacts.length,
    buckets: buckets.size,
    oversizeBuckets,
    oversizeSamples: oversizeSamples.sort((a, b) => b.size - a.size),
    compared,
    matched: matches.length,
    created,
    updated,
    skipped,
    maxBucket,
    threshold,
  };
}

export async function scanSingleContact(
  database: Database,
  contactId: string,
  options: { threshold?: number } = {},
) {
  const threshold = Number(options.threshold) || DEFAULT_THRESHOLD;
  const target = await readContact(database, contactId);
  if (!target || target.is_merged) return { scanned: 0, compared: 0, created: 0, updated: 0, skipped: 0, threshold };

  const phone = String(target.phone_last10 ?? "").trim() || last10(target.phone);
  const emailLower = String(target.email ?? "").trim().toLowerCase();
  const mvr = String(target.mvr_uid ?? "").trim();

  // Yalnızca aynı bloğa düşenleri SQL ile getir (telefon / e-posta / mvr_uid).
  const others: ContactRecord[] = await database("Contacts")
    .select(CONTACT_FIELDS)
    .whereNot("id", contactId)
    .where((builder: any) => {
      builder.whereNull("is_merged").orWhere("is_merged", false);
    })
    .andWhere((builder: any) => {
      let has = false;
      if (phone) { builder.orWhere("phone_last10", phone); has = true; }
      if (emailLower) { builder.orWhereRaw("lower(email) = ?", [emailLower]); has = true; }
      if (mvr) { builder.orWhere("mvr_uid", mvr); has = true; }
      if (!has) builder.whereRaw("1 = 0"); // blok anahtarı yoksa eşleşme arama
    });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const other of others) {
    const scored = scoreContacts(target, other);
    const result = scored.score >= threshold ? await writeCandidate(database, target, other, scored) : "skipped";
    if (result === "created") created += 1;
    else if (result === "updated") updated += 1;
    else skipped += 1;
  }

  return { scanned: 1, compared: others.length, created, updated, skipped, threshold };
}

export async function rejectCandidate(database: Database, candidateId: number, userId: string | null) {
  const reviewedAt = new Date().toISOString();
  const rows = await database("duplicate_candidates")
    .where({ id: candidateId })
    .update({ status: "rejected", reviewed_by: userId, reviewed_at: reviewedAt })
    .returning("*");
  return rows[0] ?? null;
}

export async function getMergePreview(
  database: Database,
  candidateId: number,
  masterId?: string,
  fieldValues: Record<string, unknown> = {},
) {
  const candidate = await readCandidate(database, candidateId);
  if (!candidate) return null;

  const chosenMaster = masterId || candidate.contact_a;
  const duplicateId = chosenMaster === candidate.contact_a ? candidate.contact_b : candidate.contact_a;
  const master = await readContact(database, chosenMaster);
  const duplicate = await readContact(database, duplicateId);
  if (!master || !duplicate) return null;

  return {
    candidate: normalizeCandidate(candidate),
    masterId: chosenMaster,
    duplicateId,
    master,
    duplicate,
    preview: buildMergePreview(master, duplicate, fieldValues),
  };
}

export async function mergeCandidate(
  database: Database,
  candidateId: number,
  userId: string | null,
  masterId?: string,
  fieldValues: Record<string, unknown> = {},
) {
  const preview = await getMergePreview(database, candidateId, masterId, fieldValues);
  if (!preview) return null;

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {};
  for (const field of preview.preview.fields) {
    if (field.changed) updatePayload[field.field] = field.value;
  }
  if (typeof updatePayload.phone === "string") {
    const normalizedLast10 = last10(updatePayload.phone);
    if (normalizedLast10) updatePayload.phone_last10 = normalizedLast10;
  }

  if (Object.keys(updatePayload).length > 0) {
    await database("Contacts").where({ id: preview.masterId }).update(updatePayload);
  }

  const relationMoves = [];
  for (const move of RELATION_MOVES) {
    try {
      const count = await database(move.collection)
        .where(move.field, preview.duplicateId)
        .update({ [move.field]: preview.masterId });
      relationMoves.push({ ...move, count });
    } catch (error) {
      relationMoves.push({ ...move, count: 0, skipped: true });
    }
  }

  await database("Contacts")
    .where({ id: preview.duplicateId })
    .update({ is_merged: true, merged_into: preview.masterId, merged_at: now });

  await database("duplicate_candidates")
    .where({ id: candidateId })
    .update({ status: "merged", reviewed_by: userId, reviewed_at: now });

  await database("duplicate_candidates")
    .where((builder: any) => {
      builder.where("contact_a", preview.duplicateId).orWhere("contact_b", preview.duplicateId);
    })
    .where("status", "pending")
    .update({ status: "merged", reviewed_by: userId, reviewed_at: now });

  const auditRows = await database("duplicate_merge_audit")
    .insert({
      candidate_id: candidateId,
      master_contact: preview.masterId,
      merged_contact: preview.duplicateId,
      field_changes: JSON.stringify(preview.preview.fields.filter((field) => field.changed)),
      relation_moves: JSON.stringify(relationMoves),
      merged_by: userId,
      merged_at: now,
    })
    .returning("*");

  return {
    ...preview,
    audit: auditRows[0] ?? null,
    relationMoves,
    updatedFields: Object.keys(updatePayload),
  };
}

async function hydrateCandidates(database: Database, rows: DuplicateCandidate[]): Promise<HydratedCandidate[]> {
  const ids = [...new Set(rows.flatMap((row) => [row.contact_a, row.contact_b]).filter(Boolean))];
  const contacts = ids.length
    ? await database("Contacts").select(CONTACT_FIELDS).whereIn("id", ids)
    : [];
  const byId = new Map<string, ContactRecord>(contacts.map((contact: ContactRecord) => [String(contact.id), contact]));

  return rows.map((row) => ({
    ...normalizeCandidate(row),
    contactA: byId.get(String(row.contact_a)) ?? null,
    contactB: byId.get(String(row.contact_b)) ?? null,
  }));
}

/** Skoru verilmiş bir çifti aday tablosuna yazar (rejected/merged ise dokunmaz). */
async function writeCandidate(
  database: Database,
  a: ContactRecord,
  b: ContactRecord,
  scored: ScoreResult,
): Promise<"created" | "updated" | "skipped"> {
  const key = pairKey(String(a.id), String(b.id));
  const existing = await database("duplicate_candidates").where({ pair_key: key }).first();
  if (existing?.status === "rejected" || existing?.status === "merged") return "skipped";

  const payload = {
    contact_a: String(a.id),
    contact_b: String(b.id),
    contact_a_name: displayName(a),
    contact_b_name: displayName(b),
    score: scored.score,
    reasons: JSON.stringify(scored.reasons),
    signals: JSON.stringify(scored.signals),
    pair_key: key,
    status: "pending",
    detected_at: new Date().toISOString(),
  };

  if (existing) {
    await database("duplicate_candidates").where({ id: existing.id }).update(payload);
    return "updated";
  }

  await database("duplicate_candidates").insert(payload);
  return "created";
}

function displayName(contact: ContactRecord): string {
  const name = [contact.first_name, contact.last_name]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join(" ");
  return name || String(contact.email ?? contact.phone ?? contact.id);
}

async function readContact(database: Database, id: string): Promise<ContactRecord | null> {
  const row = await database("Contacts").select(CONTACT_FIELDS).where({ id }).first();
  return row ?? null;
}

async function readCandidate(database: Database, id: number): Promise<DuplicateCandidate | null> {
  const row = await database("duplicate_candidates").where({ id }).first();
  return row ? normalizeCandidate(row) : null;
}

function normalizeCandidate(row: DuplicateCandidate): DuplicateCandidate {
  return {
    ...row,
    reasons: parseJson(row.reasons, []),
    signals: parseJson(row.signals, {}),
  };
}

function buildMergePreview(
  master: ContactRecord,
  duplicate: ContactRecord,
  overrides: Record<string, unknown>,
) {
  const fields = MERGE_FIELDS.map((config) => {
    const masterValue = master[config.field];
    const duplicateValue = duplicate[config.field];
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, config.field);
    const value = hasOverride ? overrides[config.field] : chooseValue(config.strategy, masterValue, duplicateValue);
    const changed = !valuesEqual(masterValue, value);
    const conflict = hasValue(masterValue) && hasValue(duplicateValue) && !valuesEqual(masterValue, duplicateValue);
    return {
      field: config.field,
      label: config.label,
      type: config.type,
      strategy: config.strategy,
      masterValue,
      duplicateValue,
      value,
      changed,
      conflict,
      source: hasOverride ? "manual" : inferSource(masterValue, duplicateValue, value),
    };
  });

  return { fields };
}

function chooseValue(strategy: string, masterValue: unknown, duplicateValue: unknown): unknown {
  if (strategy === "conservative-consent") {
    if (masterValue === false || duplicateValue === false) return false;
    if (masterValue === true || duplicateValue === true) return true;
    return false;
  }
  if (strategy === "sum") return Number(masterValue ?? 0) + Number(duplicateValue ?? 0);
  if (strategy === "max-date") return maxDate(masterValue, duplicateValue);
  if (strategy === "min-date") return minDate(masterValue, duplicateValue);
  if (strategy === "csv-union") return csvUnion(masterValue, duplicateValue);
  return hasValue(masterValue) ? masterValue : duplicateValue ?? null;
}

function inferSource(masterValue: unknown, duplicateValue: unknown, value: unknown): string {
  if (valuesEqual(masterValue, value)) return "master";
  if (valuesEqual(duplicateValue, value)) return "duplicate";
  return "merged";
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function maxDate(a: unknown, b: unknown): string | null {
  const dates = [a, b].map(toDate).filter((date): date is Date => Boolean(date));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString();
}

function minDate(a: unknown, b: unknown): string | null {
  const dates = [a, b].map(toDate).filter((date): date is Date => Boolean(date));
  if (!dates.length) return null;
  return new Date(Math.min(...dates.map((date) => date.getTime()))).toISOString();
}

function toDate(value: unknown): Date | null {
  if (!hasValue(value)) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function csvUnion(a: unknown, b: unknown): string {
  const values = [a, b]
    .flatMap((value) => String(value ?? "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(values)].join(",");
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
