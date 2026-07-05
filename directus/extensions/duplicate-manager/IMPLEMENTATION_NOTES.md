# Mavera CRM Duplicate Manager - Teknik ve Operasyon Dokumani

Version: `0.2.0`
Tarih: `2026-07-05`
Kapsam: Directus CRM icinde contact dublon tespiti, review, reject memory, merge preview, soft merge ve audit.

## 1. Bu Dokuman Ne Icin?

Bu dokuman, projeyi hic bilmeyen bir yazilimcinin duplicate-manager extension'ini devralabilmesi icin yazildi.

Burada sunlar anlatilir:

- Neden bu extension var?
- Hangi dosya ne ise yarar?
- Directus'a nasil yuklenir?
- Hangi schema alanlari gerekir?
- Skor algoritmasi nasil calisir?
- Contact merge sirasinda hangi alanlara dokunulur?
- Hangi alanlara bilerek dokunulmaz?
- API endpointleri nasil kullanilir?
- UI akisi nasil calisir?
- Hook'lar hangi otomatik davranislari saglar?
- Debug ve bakim nasil yapilir?

## 2. Problem Tanimi

CRM'de ayni kisi farkli kaynaklardan birden fazla contact olarak gelebiliyor. Ornekler:

- Ayni telefon, farkli ad yazimi.
- Ayni e-posta, farkli telefon.
- Turkce karakter farklari: `Ozdemir` / `Oezdemir`, `Celik` / `Çelik`.
- Formdan gelen kayit ile ERP/BTS'den gelen kaydin ayrismasi.
- Kullanici hatasi ile ayni kisinin tekrar eklenmesi.

Bu extension'in hedefi otomatik ve riskli bir "sil-birlestir" yapmak degil. Hedef, CRM kullanicisina guvenli bir review ekrani vermek:

- Sistem adaylari bulur.
- Neden aday oldugunu aciklar.
- Kullanici master kaydi secer.
- Alan bazli son hal gorulur.
- Kullanici onaylarsa merge yapilir.
- Duplicate fiziksel silinmez, pasiflenir.
- Yapilan islem audit koleksiyonuna yazilir.

## 3. Mimari Ozet

Extension bir Directus bundle extension'dir. Bundle icinde 3 parcadan olusur:

```text
directus/extensions/duplicate-manager
├── src
│   ├── endpoint
│   │   └── index.ts
│   ├── hook
│   │   └── index.ts
│   ├── module
│   │   ├── index.ts
│   │   └── Module.vue
│   └── shared
│       ├── engine.ts
│       └── scoring.ts
├── package.json
├── package-lock.json
├── tsconfig.json
├── README.md
└── IMPLEMENTATION_NOTES.md
```

### 3.1 Module

Dosyalar:

```text
src/module/index.ts
src/module/Module.vue
```

Directus admin panelde sol menuye `Dublon Kontrol` adinda bir module ekler.

Route:

```text
/admin/duplicate-manager
```

Bu ekran raw Directus collection edit ekraninin yerine tasarlandi. Kullanici bu ekranda:

- Pending adaylari listeler.
- Iki contact'i kart olarak gorur.
- Contact detayina gider.
- Master contact secer.
- Neden dublon dedigimizi gorur.
- Merge preview tablosunu gorur.
- Alan bazli son degerleri degistirebilir.
- Reject veya merge yapabilir.
- Merge/reject/scan sonrasi mesaj gorur.

### 3.2 Endpoint

Dosya:

```text
src/endpoint/index.ts
```

Directus API icinde `/duplicate-manager` route'unu ekler.

Endpointler:

```text
GET  /duplicate-manager/candidates
POST /duplicate-manager/scan
POST /duplicate-manager/:id/reject
POST /duplicate-manager/:id/preview
POST /duplicate-manager/:id/merge
```

Tum endpointler `req.accountability` uzerinden oturum kontrolu yapar. Admin veya user yoksa `401` doner.

### 3.3 Hook

Dosya:

```text
src/hook/index.ts
```

Iki ana is yapar:

1. `Contacts.items.create` ve `Contacts.items.update` sonrasinda ilgili contact icin single-contact duplicate scan calistirir.
2. `Contacts.items.query` filter'i ile merge edilmis contact'lari varsayilan Contacts listesinde gizler.

Merge edilmis contact'lari gizleme mantigi:

```ts
_or: [
  { is_merged: { _null: true } },
  { is_merged: { _eq: false } }
]
```

Kullanici veya API explicit `is_merged` filtresi verirse hook bu filtreye karismaz. Bu sayede merge edilmis kayitlari aramak mumkun kalir.

### 3.4 Shared Engine

Dosya:

```text
src/shared/engine.ts
```

Business logic burada durur:

- Candidate listeme
- Tum contact'lari scan etme
- Tek contact scan etme
- Candidate upsert
- Reject
- Merge preview
- Merge
- Audit yazma
- Relation move

### 3.5 Scoring

Dosya:

```text
src/shared/scoring.ts
```

Contact normalize etme ve skor hesaplama burada durur:

- Turkce karakter normalize
- E-posta normalize
- Telefon son 10 hane normalize
- Ad soyad similarity
- E-posta similarity
- MVR UID esitligi
- Referans/ulke sinyalleri

## 4. Kurulum

### 4.1 Gereksinimler

- Directus 11 host.
- Node/npm.
- Root projede schema scriptinin calismasi.
- Directus extension klasorunun container'a mount edilmesi.
- Directus admin kullanicisi veya token.

Extension `package.json` icinde Directus host uyumlulugu:

```json
{
  "directus:extension": {
    "type": "bundle",
    "host": "^11.0.0"
  }
}
```

### 4.2 Local Schema Kurulumu

Root dizine gelin:

```bash
cd /Users/srhtmac/Documents/ide-projects/mavera-marketing-hub
```

Schema eklemelerini calistirin:

```bash
npm run schema:additions
```

Script varsayilan olarak sunlari kullanir:

```bash
LOCAL_DIRECTUS_URL=http://localhost:8055
LOCAL_DIRECTUS_TOKEN=lokal-admin-token
```

Farkli instance icin:

```bash
DIRECTUS_URL=https://directus.example.org DIRECTUS_TOKEN=YOUR_TOKEN npm run schema:additions
```

Script idempotent tasarlandi. Yani mevcut koleksiyon/field varsa tekrar yaratmaya calismaz, `var` diyerek gecer. Bazi field meta bilgilerini gunceller.

### 4.3 Extension Build

```bash
cd directus/extensions/duplicate-manager
npm install
npm run build
```

Build sonunda beklenen dosyalar:

```text
dist/app.js
dist/api.js
```

Validate:

```bash
npx directus-extension validate
```

Beklenen sonuc:

```text
Extension is valid
```

### 4.4 Docker/Directus Mount

Local `docker-compose.yml` icinde extension mount'u vardir:

```yaml
EXTENSIONS_AUTO_RELOAD: "true"
volumes:
  - ./directus/extensions:/directus/extensions
```

Directus container'i baslatmak:

```bash
docker compose up -d directus
```

Log kontrolu:

```bash
docker compose logs directus
```

Admin UI cache icin build sonrasi genelde hard refresh gerekir:

```text
Cmd + Shift + R
```

## 5. Schema Detaylari

Schema script:

```text
src/scripts/schema-additions.ts
```

Duplicate Manager icin kritik kisimlar:

### 5.1 Contacts Alanlari

`Contacts` koleksiyonuna eklenen/extension tarafindan kullanilan alanlar:

```text
phone_last10
is_merged
merged_into
merged_at
sms_optin
phone_call_optin
donation_count
donation_total
last_donation_at
first_donation_at
donation_type_list
donation_types
```

Not: Donation/BTS alanlari skor ve gorunum icin okunabilir, fakat merge update kararinda bilerek kullanilmiyor. Bu alanlar ERP/BTS kaynagi tarafindan beslenecek kabul edildi.

### 5.2 duplicate_candidates

Koleksiyon:

```text
duplicate_candidates
```

Amaç:

Muhtemel dublon contact ciftlerini saklar.

Alanlar:

```text
id                integer primary key
contact_a         m2o -> Contacts
contact_b         m2o -> Contacts
contact_a_name    string
contact_b_name    string
score             integer
reasons           json
signals           json
status            string: pending|rejected|merged
pair_key          string
detected_at       timestamp
reviewed_by       m2o -> directus_users
reviewed_at       timestamp
```

`pair_key`, iki contact id'sinin sirali bicimde birlestirilmis halidir:

```text
CONTACT_A_ID:CONTACT_B_ID
```

Bu alan reject memory icin kritik. Bir cift rejected veya merged olduysa ayni pair tekrar pending candidate yapilmaz.

### 5.3 duplicate_merge_audit

Koleksiyon:

```text
duplicate_merge_audit
```

Amaç:

Yapilan merge operasyonlarini denetim kaydi olarak saklar.

Alanlar:

```text
id               integer primary key
candidate_id     m2o -> duplicate_candidates
master_contact   m2o -> Contacts
merged_contact   m2o -> Contacts
field_changes    json
relation_moves   json
merged_by        m2o -> directus_users
merged_at        timestamp
```

`field_changes`, merge sirasinda master contact uzerinde degisen alanlari tutar.

`relation_moves`, duplicate contact'tan master contact'a tasinmaya calisilan iliskileri ve kac satir tasindigini tutar.

## 6. Skor Algoritmasi

Skor kodu:

```text
src/shared/scoring.ts
```

Ana fonksiyon:

```ts
scoreContacts(a, b)
```

Donus:

```ts
{
  score: number,
  reasons: string[],
  signals: Record<string, number | string | boolean>
}
```

### 6.1 Normalizasyon

Metin normalizasyonu:

- Trim
- Lowercase
- Turkce karakterleri ASCII karsiligina cevirme
- Unicode diacritics temizleme
- Harf/rakam/e-posta karakterleri disinda kalanlari bosluga cevirme
- Fazla bosluklari teke indirme

Turkce karakter map:

```text
ç -> c
ğ -> g
ı -> i
İ -> i
ö -> o
ş -> s
ü -> u
```

E-posta normalizasyonu:

- Normalized text
- Bosluklari tamamen kaldirir

Telefon normalizasyonu:

- Sadece rakamlar alinir.
- En az 10 rakam varsa son 10 hane kullanilir.

### 6.2 Puanlama

Aktif kurallar:

```text
Telefon son 10 hane ayni        +72
E-posta birebir ayni            +68
E-posta cok benzer >= 92%       +28
Ayni domain + email >= 82%      +18
Ad soyad >= 94%                 +32
Ad soyad >= 84%                 +24
Ad soyad >= 72%                 +12
MVR UID ayni                    +45
Referans ayni                   +8
Ulke ayni                       +5
```

Skor 100 ile cap edilir.

Varsayilan threshold:

```text
55
```

Bu nedenle su gibi kayitlar aday olur:

- Ayni telefon ama ad ufak farkli.
- Ayni e-posta ama telefon farkli.
- Ayni e-posta + benzer isim.
- Ayni MVR UID + baska sinyaller.

### 6.3 Explainability

`reasons` alani kullaniciya gosterilen aciklamadir.

Ornek:

```json
[
  "Telefon son 10 hane ayni",
  "E-posta cok benzer (92%)",
  "Ad soyad benzer (93%)",
  "Referans ayni"
]
```

`signals` daha teknik ham sinyalleri tutar.

Ornek:

```json
{
  "phone_last10": true,
  "email_similarity": 92,
  "name_similarity": 93,
  "referans": true,
  "ulke": true
}
```

## 7. Scan Davranisi

Kod:

```text
src/shared/engine.ts
```

### 7.1 Tum Contact Scan

Endpoint:

```text
POST /duplicate-manager/scan
```

Body:

```json
{
  "limit": 1000,
  "threshold": 55
}
```

Davranis:

1. `Contacts` koleksiyonundan `is_merged` null veya false olan kayitlari alir.
2. Limit kadar contact icinde ikili kombinasyonlari karsilastirir.
3. Skor threshold altindaysa skip eder.
4. Ustundeyse `duplicate_candidates` icinde pair_key arar.
5. Existing candidate rejected veya merged ise skip eder.
6. Pending varsa update eder.
7. Yoksa yeni pending candidate yaratir.

### 7.2 Tek Contact Scan

Endpoint:

```text
POST /duplicate-manager/scan
```

Body:

```json
{
  "contactId": "CONTACT_UUID",
  "threshold": 55,
  "limit": 1000
}
```

Hook tarafindan create/update sonrasinda kullanilan akis budur.

Davranis:

1. Hedef contact okunur.
2. Contact merge edilmis ise scan yapilmaz.
3. Diger aktif contact'larla karsilastirilir.
4. Candidate upsert edilir.

## 8. Reject Memory

Buton:

```text
Dublon degil
```

Endpoint:

```text
POST /duplicate-manager/:id/reject
```

Davranis:

```text
status = rejected
reviewed_by = current Directus user
reviewed_at = now
```

Reject edilen candidate ayni `pair_key` ile tekrar pending'e donmez. Bu, kullanicinin daha once "bu ikisi dublon degil" dedigi ciftin surekli onune gelmesini engeller.

UI reject sonrasi bilgi mesaji gosterir:

```text
Ali Celik ve Ali Celik dublon degil olarak isaretlendi.
```

## 9. Merge Preview

Endpoint:

```text
POST /duplicate-manager/:id/preview
```

Body:

```json
{
  "masterId": "CONTACT_UUID",
  "fieldValues": {
    "first_name": "Hasan",
    "sms_optin": true
  }
}
```

Preview, master ve duplicate contact'i okuyup alan bazli karar tablosu dondurur.

Her satirda:

```text
field
label
type
strategy
masterValue
duplicateValue
value
changed
conflict
source
```

UI bunu tablo olarak gosterir:

```text
Alan | Master | Diger kayit | Son deger
```

Kullanici `Son deger` alanini degistirdiginde tekrar preview cagrilir.

## 10. Merge Alanlari

Kod:

```text
src/shared/engine.ts
MERGE_FIELDS
```

Aktif merge alanlari:

```text
first_name
last_name
phone
email
mvr_uid
referans
ulke
adres
whatsapp_optin
mail_optin
sms_optin
phone_call_optin
```

### 10.1 Text Alan Stratejisi

`prefer-master`

Mantik:

- Master'da deger varsa master degeri korunur.
- Master bos ise duplicate degeri alinir.
- Kullanici override verdiyse override kullanilir.

### 10.2 Izin Alan Stratejisi

`conservative-consent`

Alanlar:

```text
whatsapp_optin
mail_optin
sms_optin
phone_call_optin
```

Mantik:

- Iki taraftan biri false ise false.
- En az biri true ve hic false yoksa true.
- Ikisi de bos/null ise false.

Bu yaklasim izinlerde daha temkinlidir.

### 10.3 Bilerek Dokunulmayan Alanlar

Su alanlara merge preview/update dokunmaz:

```text
donation_count
donation_total
last_donation_at
first_donation_at
donation_type_list
donation_types
```

Sebep:

Bu alanlar BTS/ERP tarafindan gelecek kaynak veridir. CRM kullanicisinin duplicate merge sirasinda bunlari manuel birlestirmesi istenmiyor. Bu alanlar ileride BTS sync tarafinda master contact'a gore yeniden hesaplanabilir veya ERP kaynagi tarafindan overwrite edilebilir.

## 11. Merge Davranisi

Buton:

```text
Merge et
```

Endpoint:

```text
POST /duplicate-manager/:id/merge
```

Body:

```json
{
  "masterId": "CONTACT_UUID",
  "fieldValues": {
    "first_name": "Hasan",
    "sms_optin": true
  }
}
```

Merge akisi:

1. Candidate okunur.
2. Master ve duplicate belirlenir.
3. Preview olusturulur.
4. `changed=true` olan alanlar master contact uzerinde update edilir.
5. Telefon degistiyse `phone_last10` yeniden hesaplanir.
6. Iliskiler duplicate contact'tan master contact'a tasinir.
7. Duplicate contact pasiflenir.
8. Candidate `merged` yapilir.
9. Duplicate contact'i iceren diger pending candidate'lar da `merged` yapilir.
10. Audit kaydi yazilir.
11. UI basari mesaji gosterir.

UI mesaj ornegi:

```text
Hasan Aydin master kaldi; Hassan Aydin pasiflendi ve iliskileri master kayda tasindi.
```

### 11.1 Soft Merge

Duplicate contact fiziksel olarak silinmez.

Duplicate uzerinde set edilen alanlar:

```text
is_merged = true
merged_into = MASTER_CONTACT_ID
merged_at = now
```

Bu nedenle geri izleme mumkundur.

### 11.2 Varsayilan Contacts Listesinde Gizleme

Hook sayesinde merge edilmis kayitlar normal Contacts listesinde gorunmez.

Fakat explicit filtre ile gorulebilir:

```text
is_merged = true
```

Bu debug ve audit icin onemlidir.

## 12. Relation Move

Kod:

```text
src/shared/engine.ts
RELATION_MOVES
```

Aktif relation move listesi:

```text
consent_log.contact_id
campaign_recipients.contact_id
Notes.contact_id
Opportunities.contact_id
Tasks.related_contact
attribution_events.mvruid_eslestirme
```

Merge sirasinda bu koleksiyonlarda duplicate contact id'si master contact id'si ile degistirilir.

Her move try/catch icindedir. Bir koleksiyon veya field yoksa merge komple patlamasin diye skipped olarak audit'e yazilir:

```json
{
  "collection": "Notes",
  "field": "contact_id",
  "count": 0,
  "skipped": true
}
```

Bu davranis MVP icin pratik secildi. Production'da daha kati veri guvenligi istenirse missing relation durumunda merge'i fail ettirmek dusunulebilir.

## 13. Audit

Merge sonunda `duplicate_merge_audit` koleksiyonuna kayit yazilir.

Audit icerigi:

- Candidate id
- Master contact
- Merged contact
- Degisen alanlar
- Relation move sonuclari
- Merge eden kullanici
- Merge zamani

`field_changes` sadece master contact'ta gercekten degisen alanlari tutar.

Ornek:

```json
[
  {
    "field": "phone",
    "label": "Telefon",
    "masterValue": "+905361004005",
    "duplicateValue": "+905369994005",
    "value": "+905361004005",
    "changed": false,
    "conflict": true,
    "source": "master"
  }
]
```

Not: Yukaridaki ornekte `changed=false` oldugu icin gercek audit `field_changes` icine girmez. `field_changes` sadece `changed=true` satirlari yazar.

`relation_moves` her relation icin count bilgisini tutar.

## 14. UI Detaylari

UI dosyasi:

```text
src/module/Module.vue
```

Ana bolumler:

- Sol candidate listesi
- Contact A ve Contact B kartlari
- Contact'a git linkleri
- Benzerlik skoru
- Neden dublon dedim listesi
- Master secim radio'lari
- Merge preview tablosu
- Action footer
- Success/info notice mesaji

### 14.1 Raw Collection Ekrani ile Fark

Directus'ta `duplicate_candidates` koleksiyonu Content altinda gorulebilir. Fakat bu raw edit ekranidir. Butonlu review deneyimi burada degil, custom module'dedir.

Kullanilmasi gereken ekran:

```text
/admin/duplicate-manager
```

### 14.2 Contact Linkleri

Her contact kartinda:

```text
Contact'a git
```

Link format:

```text
/admin/content/Contacts/{id}
```

Bu sayede kullanici gerekirse raw contact detayini acabilir.

### 14.3 Success/Info Mesajlari

UI'da `notice` state'i var.

Mesajlar:

- Scan tamamlandi.
- Candidate reject edildi.
- Merge basariyla tamamlandi.

Mesajlar 6 saniye sonra otomatik kapanir.

## 15. Endpoint Referansi

### 15.1 GET /duplicate-manager/candidates

Query:

```text
status=pending
limit=100
```

Ornek:

```bash
curl "http://localhost:8055/duplicate-manager/candidates?status=pending&limit=100" \
  -H "Authorization: Bearer lokal-admin-token"
```

Response:

```json
{
  "candidates": [
    {
      "id": 5,
      "contact_a": "uuid-a",
      "contact_b": "uuid-b",
      "contact_a_name": "Hasan Aydin",
      "contact_b_name": "Hassan Aydin",
      "score": 100,
      "reasons": ["Telefon son 10 hane ayni"],
      "signals": { "phone_last10": true },
      "status": "pending",
      "pair_key": "uuid-a:uuid-b",
      "contactA": {},
      "contactB": {}
    }
  ]
}
```

### 15.2 POST /duplicate-manager/scan

Tum kayitlari scan:

```json
{
  "limit": 1000,
  "threshold": 55
}
```

Tek contact scan:

```json
{
  "contactId": "CONTACT_UUID",
  "limit": 1000,
  "threshold": 55
}
```

Response:

```json
{
  "ok": true,
  "scanned": 19,
  "compared": 171,
  "created": 5,
  "updated": 0,
  "skipped": 166,
  "threshold": 55
}
```

### 15.3 POST /duplicate-manager/:id/reject

Response:

```json
{
  "ok": true,
  "candidate": {
    "id": 5,
    "status": "rejected",
    "reviewed_by": "USER_ID",
    "reviewed_at": "2026-07-05T..."
  }
}
```

### 15.4 POST /duplicate-manager/:id/preview

Request:

```json
{
  "masterId": "CONTACT_UUID",
  "fieldValues": {}
}
```

Response:

```json
{
  "candidate": {},
  "masterId": "uuid-master",
  "duplicateId": "uuid-duplicate",
  "master": {},
  "duplicate": {},
  "preview": {
    "fields": []
  }
}
```

### 15.5 POST /duplicate-manager/:id/merge

Request:

```json
{
  "masterId": "CONTACT_UUID",
  "fieldValues": {
    "phone": "+905361004005"
  }
}
```

Response:

```json
{
  "ok": true,
  "candidate": {},
  "masterId": "uuid-master",
  "duplicateId": "uuid-duplicate",
  "audit": {},
  "relationMoves": [],
  "updatedFields": ["phone", "phone_last10"]
}
```

## 16. Test Verisi Notu

Local test icin 15 contact eklenip 5 duplicate pair olusturuldu.

Test edilen duplicate ornekleri:

```text
Mehmet Ozdemir / Mehmet Oezdemir
Fatma Kara / Fadma Kara
Ali Celik / Ali Celik
Zeynep Sahin / Zeynep Sahin
Hasan Aydin / Hassan Aydin
```

Hasan/Hassan pair'i uzerinde merge denenmis ve su davranis dogrulanmistir:

- Hasan Aydin master kaldi.
- Hassan Aydin `is_merged=true` oldu.
- `merged_into` Hasan kaydina baglandi.
- Candidate status `merged` oldu.
- Audit kaydi olustu.
- Varsayilan Contacts listesinde merged kayit gizlendi.

## 17. Debug Rehberi

### 17.1 Extension Build

```bash
cd directus/extensions/duplicate-manager
npm run build
```

### 17.2 Extension Validate

```bash
npx directus-extension validate
```

### 17.3 Directus Log

```bash
docker compose logs directus
```

### 17.4 Candidate Listeleme

```bash
curl "http://localhost:8055/duplicate-manager/candidates?status=pending&limit=100" \
  -H "Authorization: Bearer lokal-admin-token"
```

### 17.5 Manual Scan

```bash
curl -X POST http://localhost:8055/duplicate-manager/scan \
  -H "Authorization: Bearer lokal-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"limit":1000,"threshold":55}'
```

### 17.6 Merge Edilmis Contactlari Gorme

Directus UI'da Contacts listesinde explicit filtre:

```text
is_merged equals true
```

Veya API:

```bash
curl "http://localhost:8055/items/Contacts?filter[is_merged][_eq]=true" \
  -H "Authorization: Bearer lokal-admin-token"
```

## 18. Sık Karsilasilan Sorunlar

### 18.1 Module gorunmuyor

Kontrol listesi:

- `npm run build` calisti mi?
- `dist/app.js` var mi?
- `dist/api.js` var mi?
- Directus extension path mount edildi mi?
- Directus container yeniden baslatildi mi?
- Browser hard refresh yapildi mi?
- Directus loglarinda extension load hatasi var mi?

### 18.2 Raw Duplicate Candidates ekraninda butonlar yok

Bu normal. Butonlu UI raw collection edit ekraninda degil.

Dogru ekran:

```text
/admin/duplicate-manager
```

### 18.3 Scan candidate uretmiyor

Olasiliklar:

- Threshold yuksek.
- Contact'lar zaten `is_merged=true`.
- Field isimleri beklenenden farkli.
- `phone_last10`, `email`, `first_name`, `last_name` gibi sinyaller bos.
- Candidate daha once rejected veya merged oldugu icin skip ediliyor.

### 18.4 Merge oldu ama listede iki contact gorunuyor

Kontrol:

- Contacts ekraninda explicit `is_merged` filtresi var mi?
- Hook rebuild edildi mi?
- Directus hard refresh yapildi mi?
- API query'sinde custom filter hook'u bypass eden bir durum var mi?

### 18.5 Merge audit field_changes bos

Bu her zaman hata degil. Eger master contact'ta degisen alan yoksa `field_changes` bos olabilir.

Relation move ve duplicate pasifleme yine yapilmis olabilir.

## 19. Bakim ve Gelistirme Notlari

### 19.1 Yeni Skor Sinyali Eklemek

Dosya:

```text
src/shared/scoring.ts
```

Adimlar:

1. `CONTACT_FIELDS` icine gerekli field'i ekle.
2. `scoreContacts` icinde normalize et.
3. Score ekle.
4. `reasons` icine kullaniciya okunur aciklama koy.
5. `signals` icine teknik sinyali koy.
6. Build ve validate calistir.

### 19.2 Yeni Merge Field Eklemek

Dosya:

```text
src/shared/engine.ts
```

Adimlar:

1. `CONTACT_FIELDS` icine field'i ekle.
2. `MERGE_FIELDS` icine config ekle.
3. Gerekirse `chooseValue` icine strategy ekle.
4. UI type desteklemiyorsa `Module.vue` icinde input rendering ekle.
5. Bu alan BTS/ERP kaynakli mi karar ver. Kaynak sistemden geliyorsa merge alanlarina ekleme.

### 19.3 Yeni Relation Move Eklemek

Dosya:

```text
src/shared/engine.ts
```

`RELATION_MOVES` icine ekle:

```ts
{ collection: "collection_name", field: "contact_field" }
```

Sonra test:

1. Duplicate contact'a relation bagla.
2. Merge yap.
3. Relation master contact'a tasindi mi kontrol et.
4. Audit `relation_moves` count dogru mu bak.

### 19.4 Permission Model

Endpointler su an authenticated Directus user/admin kontrolu yapar.

Ileride rol bazli kontrol istenirse:

- Sadece sales/admin merge yapabilsin.
- Marketing sadece candidate gorebilsin.
- Reject yetkisi ayri verilsin.

Bunun icin endpointte `req.accountability` role bilgisi kontrol edilebilir.

## 20. Bilinen Sinirlar

- Pairwise scan O(n^2) calisir. 1000 kayit icin kabul edilebilir; cok buyuk veri setinde batch/index stratejisi gerekir.
- Current MVP fuzzy matching icin Levenshtein kullanir, advanced phonetic/Turkish name matching yoktur.
- Relation move listesi elle tanimlidir; schema introspection ile otomatik tum M2O'lari bulmaz.
- Transaction kullanimi su an explicit degildir. Production kritik merge icin database transaction'a almak iyi olur.
- Directus permission/role bazli granular guard henuz eklenmedi.
- Merge undo akisi yoktur. Soft merge oldugu icin manuel geri alma mumkundur ama UI yoktur.

## 21. Gelecek Faz Onerileri

Oncelik sirasi onerisi:

1. Merge operasyonunu transaction icine almak.
2. Role bazli permission eklemek.
3. Undo merge endpoint'i ve UI'i eklemek.
4. Buyuk veri icin blocking/index yaklasimi eklemek.
5. Phone/email exact match icin DB seviyesinde hizli aday uretimi yapmak.
6. Candidate detayina "audit history" mini paneli eklemek.
7. BTS sync sonrasinda merge edilmis contact'lar icin donation aggregate refresh akisi tasarlamak.
8. Candidate confidence seviyeleri eklemek: high, medium, low.
9. Bulk review klavye kisayollari eklemek.
10. Production observability icin log metric eklemek.

## 22. Degisiklik Ozeti

Bu fazda yapilan islerin yuksek seviyeli ozeti:

- Directus bundle extension scaffold edildi.
- Custom `Dublon Kontrol` module'u yazildi.
- Duplicate Manager endpointleri yazildi.
- Contact create/update hook'u eklendi.
- Merge edilmis contact'lari varsayilan listeden gizleyen query hook'u eklendi.
- Duplicate scoring engine yazildi.
- Reject memory icin `pair_key` kurgulandi.
- Merge preview engine yazildi.
- Soft merge davranisi eklendi.
- Relation move listesi eklendi.
- Merge audit koleksiyonu ve audit yazimi eklendi.
- `reviewed_by` ve `reviewed_at` otomatik set edildi.
- Contact A/B isimleri candidate listesi icin materialize edildi.
- UI'da contact kartlari, contact'a git linkleri, master secimi, reasons, preview table, reject ve merge butonlari eklendi.
- Merge sonrasi basari mesaji eklendi.
- Donation/BTS alanlari merge kapsamindan cikarildi.
- README ve bu detayli teknik dokuman eklendi.

## 23. En Kisa Devralma Ozeti

Yeni gelen yazilimci sadece sunlari bilse bile sistemi calistirabilir:

1. Schema:

```bash
npm run schema:additions
```

2. Extension build:

```bash
cd directus/extensions/duplicate-manager
npm install
npm run build
npx directus-extension validate
```

3. Directus:

```bash
docker compose up -d directus
```

4. UI:

```text
/admin/duplicate-manager
```

5. Manual scan:

```bash
curl -X POST http://localhost:8055/duplicate-manager/scan \
  -H "Authorization: Bearer lokal-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"limit":1000,"threshold":55}'
```

6. Ana kaynak dosyalari:

```text
src/shared/scoring.ts  -> kime dublon diyoruz?
src/shared/engine.ts   -> nasil scan/reject/merge yapiyoruz?
src/module/Module.vue  -> kullanici ekrani
src/endpoint/index.ts  -> API
src/hook/index.ts      -> otomatik scan ve merged contact gizleme
```
