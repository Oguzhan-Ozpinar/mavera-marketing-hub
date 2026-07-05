/**
 * Mavera Hub — Directus şema eklemeleri (idempotent).
 *
 * Mevcut Contacts modeline ekler:
 *   - İzinler: sms_optin, phone_call_optin
 *   - RFM özeti: last_donation_at, first_donation_at, donation_count, donation_total, donation_types
 * Yeni koleksiyonlar:
 *   - consent_log, master_blacklist, campaigns, campaign_recipients, webhook_events, automation_rules
 *
 * Kullanım:
 *   tsx src/scripts/schema-additions.ts                     # LOCAL_DIRECTUS_URL/TOKEN
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... tsx src/scripts/schema-additions.ts
 *
 * NOT: `tenant_id` YOK (her derneğin kendi Directus'u). Tüm derneklere ayrı ayrı çalıştırılır.
 */

const BASE_URL = process.env.DIRECTUS_URL ?? process.env.LOCAL_DIRECTUS_URL ?? "http://localhost:8055";
const TOKEN = process.env.DIRECTUS_TOKEN ?? process.env.LOCAL_DIRECTUS_TOKEN ?? "lokal-admin-token";

async function api(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = json?.errors?.[0]?.message ?? text;
    throw new Error(`${method} ${path} → ${res.status}: ${err}`);
  }
  return json;
}

async function exists(path: string): Promise<boolean> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  return res.ok;
}

// ---- yardımcı alan tanımları ----
const boolField = (field: string, note = "") => ({
  field,
  type: "boolean",
  meta: { interface: "boolean", special: ["cast-boolean"], note, width: "half" },
  schema: { default_value: false },
});
const dtField = (field: string, note = "") => ({
  field,
  type: "timestamp",
  meta: { interface: "datetime", note, width: "half" },
  schema: {},
});
const intField = (field: string, note = "") => ({
  field,
  type: "integer",
  meta: { interface: "input", note, width: "half" },
  schema: { default_value: 0 },
});
const floatField = (field: string, note = "") => ({
  field,
  type: "float",
  meta: { interface: "input", note, width: "half" },
  schema: { default_value: 0 },
});
const jsonField = (field: string, note = "") => ({
  field,
  type: "json",
  meta: { interface: "input-code", options: { language: "json" }, special: ["cast-json"], note },
  schema: {},
});
const strField = (field: string, note = "", opts: Record<string, unknown> = {}) => ({
  field,
  type: "string",
  meta: { interface: "input", note, ...opts },
  schema: {},
});
const textField = (field: string, note = "") => ({
  field,
  type: "text",
  meta: { interface: "input-multiline", note },
  schema: {},
});

const dateCreatedField = {
  field: "date_created",
  type: "timestamp",
  meta: { interface: "datetime", special: ["date-created"], readonly: true, hidden: true },
  schema: {},
};

const pkAuto = {
  field: "id",
  type: "integer",
  meta: { hidden: true },
  schema: { is_primary_key: true, has_auto_increment: true },
};
const pkUuid = {
  field: "id",
  type: "uuid",
  meta: { hidden: true, special: ["uuid"], readonly: true },
  schema: { is_primary_key: true },
};

async function ensureField(collection: string, def: any) {
  if (await exists(`/fields/${collection}/${def.field}`)) {
    console.log(`  = ${collection}.${def.field} (var)`);
    return;
  }
  await api("POST", `/fields/${collection}`, def);
  console.log(`  + ${collection}.${def.field}`);
}

async function ensureCollection(collection: string, meta: Record<string, unknown>, fields: any[]) {
  if (await exists(`/collections/${collection}`)) {
    console.log(`= koleksiyon ${collection} (var)`);
  } else {
    await api("POST", `/collections`, {
      collection,
      meta: { accountability: "all", ...meta },
      schema: { name: collection },
      fields,
    });
    console.log(`+ koleksiyon ${collection}`);
  }
}

async function ensureRelation(rel: {
  collection: string;
  field: string;
  related_collection: string;
  on_delete?: string;
}) {
  // İlişki zaten var mı? (basit kontrol: /relations/{collection}/{field})
  if (await exists(`/relations/${rel.collection}/${rel.field}`)) {
    console.log(`  = ilişki ${rel.collection}.${rel.field} (var)`);
    return;
  }
  await api("POST", `/relations`, {
    collection: rel.collection,
    field: rel.field,
    related_collection: rel.related_collection,
    schema: { on_delete: rel.on_delete ?? "SET NULL" },
  });
  console.log(`  ↔ ilişki ${rel.collection}.${rel.field} → ${rel.related_collection}`);
}

// m2o alan + ilişki birlikte
async function ensureM2O(collection: string, field: string, related: string, note = "") {
  if (!(await exists(`/fields/${collection}/${field}`))) {
    // Referans verilen tüm koleksiyonların PK'sı uuid (Contacts, campaigns, directus_users)
    await api("POST", `/fields/${collection}`, {
      field,
      type: "uuid",
      meta: { interface: "select-dropdown-m2o", note, special: ["m2o"] },
      schema: {},
    });
    console.log(`  + ${collection}.${field} (m2o)`);
  }
  await ensureRelation({ collection, field, related_collection: related });
}

async function main() {
  console.log(`▶ Hedef Directus: ${BASE_URL}\n`);

  // 1) Contacts eklemeleri
  console.log("Contacts eklemeleri:");
  await ensureField("Contacts", boolField("sms_optin", "İYS MESAJ (SMS) izni"));
  await ensureField("Contacts", boolField("phone_call_optin", "İYS ARAMA izni"));
  await ensureField(
    "Contacts",
    strField("phone_last10", "Telefon son-10-hane (kesin kimlik eşleştirme anahtarı)", { width: "half" }),
  );
  await ensureField("Contacts", dtField("last_donation_at", "RFM: son bağış (Recency)"));
  await ensureField("Contacts", dtField("first_donation_at", "RFM: ilk bağış"));
  await ensureField("Contacts", intField("donation_count", "RFM: bağış adedi (Frequency)"));
  await ensureField("Contacts", floatField("donation_total", "RFM: toplam tutar (Monetary)"));
  await ensureField("Contacts", jsonField("donation_types", "RFM: {tip:{count,last}} — BTS özet"));
  await ensureField("Contacts", strField("donation_type_list", "Bağış türleri (virgüllü, segment filtresi için)"));

  // 2) consent_log
  await ensureCollection("consent_log", { icon: "gavel", note: "İzin geçmişi (KVKK/İYS kanıtı)" }, [pkAuto]);
  await ensureM2O("consent_log", "contact_id", "Contacts");
  await ensureField("consent_log", strField("channel", "email|whatsapp|sms|voice"));
  await ensureField("consent_log", strField("action", "optin|ret|hardbounce|complaint"));
  await ensureField("consent_log", strField("source", "form|iys|eo|netgsm|manual"));
  await ensureField("consent_log", strField("consent_text_version"));
  await ensureField("consent_log", strField("ip"));
  await ensureField("consent_log", dtField("occurred_at", "olay zamanı"));

  // 3) master_blacklist
  await ensureCollection("master_blacklist", { icon: "block", note: "Kanal bazlı engel listesi" }, [pkAuto]);
  await ensureField("master_blacklist", strField("value", "telefon (E.164) veya email"));
  await ensureField("master_blacklist", strField("channel", "email|whatsapp|sms|voice|global"));
  await ensureField("master_blacklist", strField("reason"));
  await ensureField("master_blacklist", dtField("blocked_at", "engellenme"));

  // 4) campaigns
  await ensureCollection("campaigns", { icon: "campaign", note: "Kampanyalar" }, [pkUuid]);
  await ensureField("campaigns", strField("name"));
  await ensureField("campaigns", strField("channel", "email|whatsapp|sms"));
  await ensureField("campaigns", strField("template_ref"));
  await ensureField("campaigns", jsonField("segment", "hedef kitle filtresi"));
  await ensureField("campaigns", strField("status", "draft|queued|sending|done|failed"));
  await ensureField("campaigns", dtField("triggered_at"));
  await ensureField("campaigns", jsonField("counts", "{total,sent,failed,skipped}"));
  await ensureField("campaigns", strField("language", "şablon dili (tr, tr-TR...)"));
  await ensureField("campaigns", jsonField("template_vars", "{header:[tokens], body:[tokens]} — değişken eşleme"));
  await ensureField("campaigns", strField("header_media", "medya header'lı şablonlar için görsel/video URL'i"));
  await ensureField("campaigns", textField("message", "SMS/düz metin gövdesi"));
  await ensureField("campaigns", strField("iysfilter", "SMS İYS: 11=ticari(İYS), 0=bilgilendirme(İYS yok)"));
  await ensureField("campaigns", strField("audience_type", "segment | manual"));
  await ensureField("campaigns", jsonField("manual_recipients", "[{to, name?}] — liste-dışı alıcılar (Excel/manuel)"));
  await ensureField("campaigns", dtField("scheduled_at", "planlanmış gönderim zamanı"));
  await ensureField("campaigns", dateCreatedField);
  await ensureM2O("campaigns", "created_by", "directus_users");

  // 5) campaign_recipients
  await ensureCollection("campaign_recipients", { icon: "how_to_reg", note: "Kampanya gönderim logu" }, [pkAuto]);
  await ensureM2O("campaign_recipients", "campaign_id", "campaigns");
  await ensureM2O("campaign_recipients", "contact_id", "Contacts");
  await ensureField("campaign_recipients", strField("to", "gönderilen adres (telefon/email)"));
  await ensureField("campaign_recipients", strField("status", "queued|sent|delivered|read|failed|skipped"));
  await ensureField("campaign_recipients", strField("provider_message_id"));
  await ensureField("campaign_recipients", textField("error"));
  await ensureField("campaign_recipients", dtField("updated_at"));

  // 6) webhook_events (idempotency) — id = provider event id (string PK)
  await ensureCollection("webhook_events", { icon: "webhook", note: "Webhook idempotency" }, [
    { field: "id", type: "string", meta: { hidden: false }, schema: { is_primary_key: true } },
  ]);
  await ensureField("webhook_events", strField("provider", "netgsm|monochat|emailoctopus|woo"));
  await ensureField("webhook_events", strField("payload_hash"));
  await ensureField("webhook_events", dtField("received_at"));
  await ensureField("webhook_events", dtField("processed_at"));

  // 7) automation_rules (dinamik akış motoru)
  await ensureCollection("automation_rules", { icon: "smart_toy", note: "Dinamik bağış-tipi akış kuralları" }, [pkUuid]);
  await ensureField("automation_rules", strField("name"));
  await ensureField("automation_rules", boolField("is_active", "kural aktif mi"));
  await ensureField("automation_rules", strField("trigger_type", "donation_type|inactivity|contact_created|..."));
  await ensureField("automation_rules", jsonField("trigger_params", "{donation_type, inactivity_days, ...}"));
  await ensureField("automation_rules", jsonField("conditions", "[{field, op, value}]"));
  await ensureField("automation_rules", intField("delay_value", "gecikme miktarı"));
  await ensureField("automation_rules", strField("delay_unit", "minutes|hours|days|weeks|months"));
  await ensureField("automation_rules", strField("action_type", "whatsapp|email|sms|create_task"));
  await ensureField("automation_rules", jsonField("action_params", "{template_ref, vars, assignee}"));
  await ensureField("automation_rules", boolField("recheck_on_fire", "gönderim anında koşulu tekrar kontrol et"));
  await ensureField("automation_rules", dateCreatedField);
  await ensureM2O("automation_rules", "created_by", "directus_users");

  // 8) segments (kayıtlı hedef kitleler)
  await ensureCollection("segments", { icon: "filter_alt", note: "Kayıtlı hedef kitle segmentleri" }, [pkUuid]);
  await ensureField("segments", strField("name"));
  await ensureField("segments", textField("description"));
  await ensureField("segments", jsonField("definition", "{rules:[{field,op,value}]}"));
  await ensureField("segments", dateCreatedField);
  await ensureM2O("segments", "created_by", "directus_users");

  // 9) integration_settings (kanal anahtarları — UI'dan düzenlenebilir, singleton)
  await ensureCollection(
    "integration_settings",
    { icon: "key", note: "Kanal API ayarları (MonoChat / Netgsm / EmailOctopus)", singleton: true },
    [pkAuto],
  );
  for (const f of [
    strField("mc_slug", "MonoChat slug"),
    strField("mc_token", "MonoChat API token"),
    strField("mc_business_phone", "WhatsApp Business no (+ yok)"),
    strField("mc_base_url", "MonoChat base URL"),
    strField("ng_user", "Netgsm kullanıcı"),
    strField("ng_pass", "Netgsm şifre"),
    strField("ng_msgheader", "Netgsm gönderici başlığı"),
    strField("ng_iys_brand", "İYS marka kodu"),
    strField("eo_api_key", "EmailOctopus API key"),
    strField("eo_list_id", "EmailOctopus list id"),
  ]) {
    await ensureField("integration_settings", f);
  }

  console.log("\n✅ Şema eklemeleri tamam.");
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
