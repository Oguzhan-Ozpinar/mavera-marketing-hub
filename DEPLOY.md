# Mavera Marketing Hub — Coolify Deploy Rehberi

Bu rehber, Hub'ı Coolify (Contabo sunucun) üzerinde adım adım yayına almanı sağlar.
Her adımı **tek tek** uygula; ✅ ile işaretle.

## Mimari (ne deploy ediyoruz?)

3 uygulama + 1 servis:

| Bileşen | Ne | Kaynak |
|---|---|---|
| **hub-api** | Fastify REST API (`:3000`) | kök `Dockerfile` |
| **hub-worker** | BullMQ worker + zamanlayıcı | aynı `Dockerfile`, farklı komut |
| **web** | Yönetim paneli (statik SPA) | `web/Dockerfile` (nginx) |
| **redis** | Kuyruk + rate-limit + blacklist cache | Coolify Redis |

> Directus'lar zaten ayrı/canlı (her dernek kendi Directus'u). Onları deploy ETMİYORUZ; Hub onlara bağlanır.
> Postgres da Directus'ların kendi DB'si — Hub'ın ayrı DB'si yok.

---

## 0. Ön hazırlık ✅
- [ ] Coolify kurulu (Contabo) ve GitHub reposu bağlı: `Oguzhan-Ozpinar/mavera-marketing-hub`
- [ ] Elinde: her derneğin **Directus URL + admin token**, EO/Netgsm/MonoChat anahtarları, BTS API URL/key
- [ ] Bir alan adı planı: örn. `hub-api.mavera.org` (API) + `hub.mavera.org` (panel)

---

## 1. Redis oluştur ✅
- Coolify → **+ New → Database → Redis** → oluştur.
- Bağlantı adresini not et → `REDIS_URL` (örn. `redis://default:PAROLA@HOST:6379`).

---

## 2. Dernek registry'yi hazırla (secret) ✅
Prod'da `config/derneks.json` repoda YOK (gitignore). Bunun yerine **`DERNEK_REGISTRY`** env'ine JSON string olarak verilir.

Örnek (tek satıra sıkıştır, gerçek değerlerle):
```json
{"dernek-a":{"name":"Serhat Derneği","directus":{"url":"https://crm.serhat.org","token":"DIRECTUS_ADMIN_TOKEN"},"monochat":{"slug":"serhatdernegi-1","token":"MC_TOKEN","businessPhone":"15559595830","baseUrl":"https://app.monochat.ai"},"netgsm":{"user":"5392337721","pass":"...","msgheader":"SERHAT DER.","iysBrandCode":"761810"},"emailoctopus":{"apiKey":"eo_...","listId":"EO_LIST_ID"},"bts":{"dernekRef":"serhat"}}}
```
> Not: MonoChat/Netgsm/EO anahtarlarını panelden (API Ayarları) da girebilirsin; registry sadece Directus URL/token + BTS için yeterli. Ama en pratiği hepsini registry'ye koymak.

---

## 3. hub-api uygulaması ✅
- Coolify → **+ New → Application → Docker (Dockerfile)** → repo seç.
- **Build:** Dockerfile yolu `Dockerfile`, port `3000`.
- **Start command:** (boş bırak — varsayılan `node dist/server.js`)
- **Environment variables:**
  ```
  NODE_ENV=production
  PORT=3000
  REDIS_URL=redis://...        (1. adımdaki)
  JWT_SECRET=uzun-rastgele-bir-deger
  DERNEK_REGISTRY={...}         (2. adımdaki JSON string)
  BTS_API_URL=https://bts...
  BTS_API_KEY=...
  WEBHOOK_NETGSM_SECRET=...     (İYS webhook için, opsiyonel)
  WEBHOOK_MONOCHAT_TOKEN=...
  WEBHOOK_BTS_SECRET=...
  ```
- **Domain:** `hub-api.mavera.org` ata (Coolify otomatik TLS).
- Deploy et. `https://hub-api.mavera.org/health` → `{"status":"ok"}` görmelisin. ✅

---

## 4. hub-worker uygulaması ✅
- Yine **+ New → Application → Dockerfile** → **aynı repo**.
- **Start command:** `node dist/worker.js`  ← tek fark bu
- **Environment variables:** hub-api ile **aynı** (REDIS_URL, DERNEK_REGISTRY, BTS_*, JWT_SECRET vb.)
- **Domain gerekmez** (dışarı port açmaz).
- Deploy et. Loglarda "worker çalışıyor (send + journey + zamanlayıcı)" görmelisin. ✅

---

## 5. web (panel) uygulaması ✅
- **+ New → Application → Dockerfile** → repo, Dockerfile yolu `web/Dockerfile`, port `80`.
- **Build argument:** `VITE_API_URL=https://hub-api.mavera.org` (3. adımdaki API domaini!)
- **Domain:** `hub.mavera.org` ata.
- Deploy et. `https://hub.mavera.org` açılınca giriş ekranı gelmeli. ✅

> Önemli: `VITE_API_URL` **build anında** gömülür. API domaini değişirse web'i yeniden build et.

---

## 6. Her derneğin Directus'una şema uygula ✅
Hub yeni koleksiyonlar/alanlar ekliyor (consent_log, campaigns, automation_rules, integration_settings, Contacts'a RFM alanları vb.). Bunu **her dernek Directus'una bir kez** uygula.

Lokalinden (repo klasöründe), her dernek için:
```bash
DIRECTUS_URL=https://crm.serhat.org DIRECTUS_TOKEN=DIRECTUS_ADMIN_TOKEN \
  npx tsx src/scripts/schema-additions.ts
```
Script idempotent — tekrar çalıştırmak zarar vermez. Her dernek için URL/token değiştirerek çalıştır. ✅

---

## 7. Deploy sonrası ayarlar ✅
- [ ] **API Ayarları** ekranından (panelde, admin ile) EO **list id** ve gerekiyorsa kanal anahtarlarını gir.
- [ ] **MonoChat panelinde** teslim/okundu webhook URL'ini `https://hub-api.mavera.org/webhooks/monochat/dernek-a` yap → read/delivered otomatik akar.
- [ ] **Netgsm İYS** webhook'unu `https://hub-api.mavera.org/webhooks/netgsm-iys/dernek-a` yap.
- [ ] **BTS resolveDonor** cron'unun URL'ini `https://hub-api.mavera.org/webhooks/bts/dernek-a/donation?crm_key=WEBHOOK_BTS_SECRET` yap → bağışlar + RFM akar.
- [ ] Panelde bir kullanıcı ile giriş yap, küçük bir **test kampanyası** (kendi numarana) gönder.

---

## Güncelleme (sonraki deploy'lar)
Repo'ya push → Coolify otomatik build/deploy (webhook ayarlıysa) veya "Redeploy" butonu. Şema değişince 6. adımı tekrar çalıştır.

## Sorun giderme
- **Panel API'ye bağlanmıyor:** web'in `VITE_API_URL`'i doğru mu + API domaini TLS'li mi?
- **Kampanya kuyruğa giriyor ama gitmiyor:** hub-worker çalışıyor mu? REDIS_URL ikisinde de aynı mı?
- **Şablonlar gelmiyor:** MonoChat token/slug/businessPhone doğru mu (API Ayarları veya registry)?
- **401:** JWT_SECRET api ve worker'da aynı olmalı; Directus admin token geçerli mi?
