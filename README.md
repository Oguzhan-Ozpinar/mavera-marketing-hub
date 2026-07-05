# Mavera Marketing Hub

Çok-dernek pazarlama orkestrasyon middleware'i. Her derneğin **kendi Directus'u** (SSOT) vardır; bu servis onların yanında durup EmailOctopus / Netgsm / MonoChat entegrasyonunu, yasal (İYS/KVKK) filtrelemeyi, kuyruk/rate-limit yönetimini ve dinamik bağış-tipi akışlarını yürütür.

> Mimari & plan dokümanları: `notes-vault` → *Mavera Marketing Hub* klasörü
> (Ürün Vizyonu, Faz 1 Teknik Plan, Mimari Değerlendirme, BTS API keşif listesi)

## Mimari özet

- **Model B:** her derneğin kendi Directus'u → `tenant_id` yok, izolasyon fiziksel.
- **Tek middleware, N config:** `config/derneks.json` (dernek registry) her isteği doğru Directus'a + doğru API anahtarlarına yönlendirir.
- **Kontakt tekil anahtarı = telefon (E.164)**, `src/lib/phone.ts`.
- **BTS ortak** (REST API) — sadece okunur.
- **Kuyruk:** BullMQ + Redis. **Deploy:** Coolify (Contabo).

## Gereksinimler
- Node 20+, pnpm (veya npm), Docker

## Lokal kurulum

```bash
# 1) Bağımlılıklar
pnpm install        # veya: npm install

# 2) Ortam
cp .env.example .env
cp config/derneks.example.json config/derneks.json   # lokalde sahte değerlerle

# 3) Lokal altyapı (Directus + Postgres + Redis)
docker compose up -d

# 4) Canlı ŞEMAYI lokal Directus'a uygula (sadece yapı, veri değil)
#    pre-work/snapshot.yaml → lokal Directus
npx directus schema apply --yes ./pre-work/snapshot.yaml
#    (Directus container içinde çalıştırmak gerekebilir; README "şema apply" notuna bak)

# 5) Testler
pnpm test

# 6) API'yi çalıştır
pnpm dev:api        # → http://localhost:3000/health
```

### Şema apply notu
`snapshot.yaml` bir derneğin canlı Directus yapısıdır (bağışçı verisi İÇERMEZ).
Lokal Directus'a uygulamak için container içinden:
```bash
docker compose exec directus npx directus schema apply --yes /directus/snapshot.yaml
# (snapshot'ı önce container'a kopyala: docker compose cp pre-work/snapshot.yaml directus:/directus/snapshot.yaml)
```

## Klasör yapısı (hedef — Faz 1)
```
src/
  server.ts        # Fastify API
  worker.ts        # BullMQ worker (Sprint 4)
  config/          # env, dernek registry, rate-limits
  lib/             # phone, directus, redis, queue, logger, ratelimiter
  auth/            # JWT + RBAC + dernek-guard
  modules/         # contacts, consent, blacklist, campaigns, journeys, segments
  channels/        # emailoctopus, monochat, netgsm
  sync/            # bts
  webhooks/        # verify + idempotency + routes
  jobs/            # BullMQ processorlar
```

## Durum
- [x] Sprint 1 iskelet: repo, docker-compose, env, logger, **phone.ts (+11 test)**, Fastify /health
- [x] Lokal Directus (11.17.4) ayakta + canlı şema uygulandı (`pre-work/snapshot.yaml`)
- [x] **Şema eklemeleri uygulandı & doğrulandı** (`npm run schema:additions`, idempotent):
      Contacts → sms_optin, phone_call_optin, RFM (last/first_donation_at, donation_count/total/types)
      Yeni koleksiyonlar → consent_log, master_blacklist, campaigns, campaign_recipients, webhook_events, automation_rules
- [x] Güncel şema versiyonlandı → `directus/schema-full.yaml`
- [x] **Sprint 2: dernek registry loader + auth (JWT) + RBAC + dernek-guard** — uçtan uca test edildi
      `config/derneks.ts` (registry), `auth/jwt.ts`, `auth/rbac.ts`, `auth/auth.plugin.ts`, `dernek/dernek.context.ts`
      Login → derneğin Directus'una doğrular, bizim JWT'yi verir. onRequest hook token+dernek-guard. `/me`, `/contacts/ping` (RBAC) çalışıyor.
- [x] **Sprint 3 (çekirdek): contacts upsert + consent** — uçtan uca test edildi
      `modules/contacts/upsert.service.ts` (telefon `phone_last10` ile kesin eşleştirme, mükerrer önleme),
      `contacts.routes.ts` (POST /contacts, RBAC: contacts.write). Aynı kişi farklı formatla tek kartta birleşiyor;
      izin değişiklikleri `consent_log`'a yazılıyor (email/whatsapp/sms/voice).
- [x] **blacklist** — Redis Set (dernek:channel + global) + Directus master_blacklist senk (`modules/blacklist`)
- [x] **Sprint 4: kuyruk + rate-limit + kanallar + kampanya** — uçtan uca test edildi
      `lib/redis.ts`, `lib/queue.ts` (BullMQ), `lib/ratelimiter.ts` (Redis token-bucket, dernek başına),
      `channels/sender.ts` (dry-run + gerçek API iskeleti), `modules/campaigns/*` (audience → fail-safe filtre → kuyruk),
      `worker.ts` (rate-limitli tüketim → gönderim → durum). Test: WhatsApp kampanya tetiklendi → dry-run gönderildi;
      filtre: izin-false + blacklist → doğru skip.
- [x] **Sprint 5: webhook güvenliği + idempotency + dinamik akış motoru** — uçtan uca test edildi
      `webhooks/` (verify: secret + payload-hash id, idempotency: webhook_events, routes: netgsm-iys/monochat/emailoctopus),
      `modules/journeys/` (engine: olay→kural eşleştir→gecikmeli iş, eval: koşul+recheck, execute: fail-safe+gönder).
      Test: yeni kontakt → contact_created → akış dry-run gönderdi; İYS RET → optin false + consent + blacklist + duplicate koruması.
- [x] **BTS entegrasyonu (push ingest)** — uçtan uca test edildi
      `sync/bts.ingest.ts` + `POST /webhooks/bts/:dernek/donation`: BTS'in mevcut resolveDonor cron'u buraya bağış POST'lar →
      telefonla upsert + RFM özeti güncelle + `donation_created` akış tetikle + `mvr_uid` döndür. Idempotent (bts_id).
      Test: KURBAN bağışı → RFM (count/total/types) + KURBAN akışı dry-run gönderdi; tekrar → duplicate, çift saymadı.
      `sync/bts.client.ts`: ilk kurulum RFM backfill iskeleti (Bagiscilar precompute — canlı BTS + auth gerektirir, TODO).
- [ ] BTS: `resolveDonor` URL'ini Hub'a yönlendir (ofis başına) + `return_status` için CPD `proje_durumu` izleme (BTS'e giden-webhook gerekebilir)
- [ ] Rapor polling (repeatable): EO bounce/complaint pull (webhook yoksa) + Netgsm SMS rapor — gerçek anahtar gelince
- [ ] Gerçek kanal API bağlantıları (EO/Netgsm/MonoChat) — anahtarlar gelince (şu an dry-run)
- [ ] Sprint 1 kalan: apply-to-all (prod'da tüm dernek Directus'larına şema)
- [ ] (ertelendi, kullanıcı isteğiyle) KVKK optin default'ları — bkz. yukarıdaki not

## Directus Eklentisi: Duplicate Manager (dublon yönetimi)
`directus/extensions/duplicate-manager/` — kontakt kartlarındaki **mükerrer kayıtları** tespit edip
pazarlamacıya sade bir ekranda inceletir ve **yumuşak birleştirme (soft-merge)** yaptırır. Hub'ın telefon-tabanlı
upsert'i çoğu dublonu baştan önler; bu eklenti ise telefon dışı yollarla (ad-soyad, e-posta, elle giriş) sızan
tarihsel mükerrerleri temizler.

- **Nasıl çalışır:** bir tarama (scan) aday çiftleri üretir → skorlar → pazarlamacı onaylar/reddeder → onaylanan çift
  tek karta birleşir (kaynak kayıt silinmez, `is_merged`/`merged_into`/`merged_at` ile işaretlenir), tüm işlem
  denetime yazılır. Reddedilen çiftler "reddedildi hafızası"nda tutulur, tekrar aday olarak çıkmaz.
- **Panel:** Directus içinde `/admin/duplicate-manager` modülü.
- **Uç noktalar:** `POST /duplicate-manager/scan` (tarama), `GET /duplicate-manager/candidates` (aday liste),
  `GET /duplicate-manager/:id/preview` (birleştirme önizleme), `POST /duplicate-manager/:id/merge` (birleştir),
  `POST /duplicate-manager/:id/reject` (reddet).
- **Skorlama & motor:** `src/shared/scoring.ts` (benzerlik puanı), `src/shared/engine.ts` (eşleştirme/birleştirme mantığı).
- **İlgili şema:** Contacts → `is_merged`, `merged_into`, `merged_at`; koleksiyonlar → `duplicate_candidates`,
  `duplicate_merge_audit` (`npm run schema:additions` ile eklenir).
- Detay: `directus/extensions/duplicate-manager/IMPLEMENTATION_NOTES.md`.

## ⚠️ KVKK notu (aksiyon gerek)
Production Directus'ta `whatsapp_optin` ve `mail_optin` alanları **default_value = true** → yeni kontaktlar
otomatik "opted-in" oluyor. İYS/KVKK açısından riskli (açık rıza gerekir). Öneri: default'u **false** yapıp
izni forma/kaynağa göre açıkça yakalamak. `sms_optin`/`phone_call_optin` (bizim eklediğimiz) zaten false.
- [ ] Sprint 4: kuyruk + rate-limit + 3 kanal + kampanya
- [ ] Sprint 5: webhook güvenliği + polling + dinamik akış motoru

## Lokal ortam bilgileri (dev)
- Directus: http://localhost:8055 · admin@mavera.com / admin12345 · token: `lokal-admin-token`
- Postgres: localhost:5432 (directus/directus) · Redis: localhost:6379
- Docker daemon: OrbStack
- Tek komutla kurulum: `npm run local:setup`
