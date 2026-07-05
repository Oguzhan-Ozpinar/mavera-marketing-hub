# Duplicate Manager Directus Extension

Version: `0.2.0`

Mavera CRM icin Directus uzerinde calisan dublon contact bulma, inceleme, reddetme ve kontrollu merge extension'i.

Bu extension ilk fazda Directus icine gomulu bir custom module, custom endpoint ve hook olarak tasarlandi. Amac, CRM kullanicisinin Directus'tan cikmadan su akisi kullanabilmesi:

1. Sistem contact kayitlari arasinda dublon adaylarini bulur.
2. Kullanici adaylari `Dublon Kontrol` ekraninda gorur.
3. Sistem neden dublon dedigini aciklar.
4. Kullanici hangi contact'in master kalacagini secer.
5. Merge preview tablosunda alan bazli son degeri gorur ve gerekirse degistirir.
6. `Merge et` ile duplicate contact pasiflenir, master contact guncellenir, iliskiler master kayda tasinir.
7. `Dublon degil` ile aday reddedilir ve ayni cift tekrar onerilmez.

Detayli teknik dokuman:

- [IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md)

## Nerede Duruyor?

Extension klasoru:

```text
directus/extensions/duplicate-manager
```

Schema eklemeleri:

```text
src/scripts/schema-additions.ts
```

Docker mount ayari:

```text
docker-compose.yml
```

Directus module route:

```text
/admin/duplicate-manager
```

Endpoint base path:

```text
/duplicate-manager
```

## Ne Kuruyor?

Extension bundle olarak 3 entry export eder:

- `module`: Directus sol menude `Dublon Kontrol` ekranini ekler.
- `endpoint`: `/duplicate-manager` altindaki API route'larini ekler.
- `hook`: Contact create/update sonrasinda dublon taramasi yapar ve merge edilmis contact'lari varsayilan listeden gizler.

## Local Kurulum

Root proje dizininden baslayin:

```bash
cd /Users/srhtmac/Documents/ide-projects/mavera-marketing-hub
```

Once Directus schema eklemelerini calistirin:

```bash
npm run schema:additions
```

Bu komut varsayilan olarak su env degerlerini kullanir:

```bash
LOCAL_DIRECTUS_URL=http://localhost:8055
LOCAL_DIRECTUS_TOKEN=lokal-admin-token
```

Farkli Directus instance'i icin:

```bash
DIRECTUS_URL=https://crm.example.org DIRECTUS_TOKEN=xxx npm run schema:additions
```

Extension dependency'lerini kurun ve bundle'i uretin:

```bash
cd directus/extensions/duplicate-manager
npm install
npm run build
```

Extension'i validate edin:

```bash
npx directus-extension validate
```

Directus container'i localde `./directus/extensions` klasorunu `/directus/extensions` olarak mount eder. `docker-compose.yml` icinde ilgili ayarlar:

```yaml
EXTENSIONS_AUTO_RELOAD: "true"
volumes:
  - ./directus/extensions:/directus/extensions
```

Container calismiyorsa:

```bash
docker compose up -d directus
```

Build sonrasi Directus admin'i acin ve hard refresh yapin:

```text
Cmd + Shift + R
```

Sonra sol menuden `Dublon Kontrol` ekranina gidin.

## Production Kurulum Mantigi

Production icin minimum sira:

1. Production Directus URL ve token ile `npm run schema:additions` calistirilir.
2. `directus/extensions/duplicate-manager` icinde `npm ci` veya `npm install` calistirilir.
3. `npm run build` ile `dist/app.js` ve `dist/api.js` uretilir.
4. Extension klasoru Directus'un extensions klasorune deploy edilir.
5. Directus yeniden baslatilir veya extension reload edilir.
6. Admin panelde `Dublon Kontrol` module'u kontrol edilir.

Not: `dist/` localde Directus'un extension'i calistirmasi icin gerekir. Repo tarafinda ignore ediliyorsa production deploy pipeline'i build adimini mutlaka calistirmalidir.

## Endpointler

Tum endpointler oturum acmis Directus kullanicisi ister.

```text
GET  /duplicate-manager/candidates
POST /duplicate-manager/scan
POST /duplicate-manager/:id/reject
POST /duplicate-manager/:id/preview
POST /duplicate-manager/:id/merge
```

Ornek manuel scan:

```bash
curl -X POST http://localhost:8055/duplicate-manager/scan \
  -H "Authorization: Bearer lokal-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"limit":1000,"threshold":55}'
```

Ornek tek contact scan:

```bash
curl -X POST http://localhost:8055/duplicate-manager/scan \
  -H "Authorization: Bearer lokal-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"contactId":"CONTACT_UUID","threshold":55}'
```

## Kullanici Akisi

1. Directus'ta `/admin/duplicate-manager` sayfasina girilir.
2. Sol listede pending dublon adaylari gorulur.
3. Aday secilince iki contact karti, skor, nedenler ve merge preview gorulur.
4. `Master sec` veya radio control ile master contact degistirilebilir.
5. Preview tablosunda son deger alanlari degistirilebilir.
6. `Dublon degil` butonu adayi reject eder.
7. `Merge et` butonu merge yapar.
8. Merge sonrasi ekranda net basari mesaji gorunur: `Hasan Aydin master kaldi; Hassan Aydin pasiflendi ve iliskileri master kayda tasindi.`

## Onemli Davranislar

- Merge fiziksel delete yapmaz.
- Duplicate contact `is_merged = true` olarak pasiflenir.
- Duplicate contact'in `merged_into` alani master contact'a baglanir.
- Varsayilan Contacts listesi merge edilmis kayitlari gizler.
- Explicit `is_merged` filtresi verilirse merge edilmis kayitlar gorulebilir.
- Reject edilen cift ayni `pair_key` ile tekrar pending onerilmez.
- Merge audit kaydi `duplicate_merge_audit` koleksiyonuna yazilir.
- BTS/ERP'den gelen bagis alanlari merge preview ve update disinda tutulur.

## Gelistirme

Watch mod:

```bash
cd directus/extensions/duplicate-manager
npm run dev
```

Normal build:

```bash
npm run build
```

Validate:

```bash
npx directus-extension validate
```

Root typecheck notu:

```bash
npm run typecheck
```

Bu komut su anda duplicate-manager disi mevcut bir hata nedeniyle fail edebilir:

```text
src/modules/campaigns/campaigns.service.ts: Cannot find name 'readItems'
```

Extension build ve validate bu hatadan bagimsiz calisir.

## Hızlı Troubleshooting

`Dublon Kontrol` menude gorunmuyorsa:

- `npm run build` calismis mi?
- `dist/app.js` ve `dist/api.js` uretilmis mi?
- Directus extension klasoru dogru mount edilmis mi?
- Directus panelde hard refresh yapildi mi?
- Directus container loglarinda extension hatasi var mi?

Candidates bos ise:

- `npm run schema:additions` calisti mi?
- `duplicate_candidates` koleksiyonu var mi?
- `/duplicate-manager/scan` endpoint'i calistirildi mi?
- Skor threshold cok yuksek mi?
- Contact'lar `is_merged=true` mi?

Merge oldu ama contact listesinde duplicate gorunuyorsa:

- Directus admin cache'i icin hard refresh yapin.
- Contacts listesinde explicit `is_merged` filtresi kullaniliyor olabilir.
- Hook bundle'i rebuild edilmis mi kontrol edin.

## Daha Fazla Detay

Bu README kurulum ve kullanim icin hizli referanstir. Sistem tasarimi, veri modeli, skor algoritmasi, merge stratejileri, relation move listesi, audit mantigi ve bakim notlari icin:

- [IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md)
