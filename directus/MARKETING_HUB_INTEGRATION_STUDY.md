# Marketing Hub'u Directus İçine Alma Çalışması

Tarih: 2026-07-05

## Kısa Cevap

Evet, mevcut Vite/React Marketing Hub'u Directus içine alabiliriz. Duplicate Manager'daki gibi Directus sol menüsünde ayrı bir modül olarak görünebilir ve kullanıcı Directus'tan çıkmadan kampanya, segment, otomasyon, kontak ve ayar ekranlarını kullanabilir.

En mantıklı yol, hub'ı ayrı bir site olarak çalıştırmayı bırakıp Directus extension bundle içine bir `marketing-hub` module eklemek. Ancak Duplicate Manager birebir Vue SFC ile yazılmış; Marketing Hub ise React/Vite. Bu yüzden doğrudan kopyala-yapıştır değil, küçük bir adapter/migration işi var.

## Mevcut Durum

### Duplicate Manager

Konum:

```text
directus/extensions/duplicate-manager
```

Yapı:

- Directus bundle extension.
- `module`: `/admin/duplicate-manager` altında Directus sol menüsüne ekran ekliyor.
- `endpoint`: `/duplicate-manager/*` endpointlerini Directus API içine ekliyor.
- `hook`: Contact create/update sonrası dublon taraması yapıyor.
- UI, Directus'un kendi Vue tabanlı app shell'i içinde çalışıyor.
- API çağrılarında `useApi()` kullanıyor ve Directus oturumunu otomatik taşıyor.

### Marketing Hub

Konum:

```text
web
```

Yapı:

- Vite + React + React Router.
- Kendi ayrı login ekranı var.
- Token'ı `localStorage` içinde `mh_token` olarak saklıyor.
- API çağrıları root Fastify servisine gidiyor.
- Ana ekranlar:
  - Dashboard
  - Campaigns
  - NewCampaign
  - CampaignDetail
  - Segments
  - Automations
  - NewAutomation
  - Contacts
  - ContactDetail
  - Settings

Backend:

```text
src/server.ts
src/auth/auth.plugin.ts
src/modules/*
```

Fastify API, kullanıcıyı önce derneğin Directus'una login ediyor, sonra kendi JWT'sini üretiyor. Directus içine taşındığında bu akışı tersine çevirmek gerekir: kullanıcı zaten Directus'ta oturum açmış olur.

## Mimari Seçenekler

### Seçenek 1: Hub'ı Vue ile Baştan Directus Modülü Yapmak

Bu Duplicate Manager'a en çok benzeyen yöntem.

Artıları:

- Directus ile en doğal entegrasyon.
- `useApi`, `private-view`, `v-button` gibi Directus UI parçaları doğrudan kullanılır.
- Uzun vadede en temiz görünür.

Eksileri:

- Mevcut React ekranlarının büyük bölümü yeniden yazılır.
- Segment builder, kampanya formu, otomasyon formu gibi ekranlarda işçilik yüksek.

Tahmini efor: yüksek.

### Seçenek 2: Directus Modülü İçinde React Mount Etmek

Önerilen yol budur.

Directus tarafında küçük bir Vue module component yazılır. Bu component sadece bir container div açar, içine React uygulamasını `createRoot()` ile mount eder. React ekranlarının çoğu korunur.

Örnek fikir:

```text
directus/extensions/marketing-hub
├── src
│   ├── module
│   │   ├── index.ts
│   │   └── Module.vue
│   ├── react
│   │   ├── App.tsx
│   │   ├── pages/*
│   │   ├── components/*
│   │   └── lib/api.ts
│   └── endpoint
│       └── index.ts
```

Artıları:

- Mevcut React ekranları büyük ölçüde korunur.
- Directus sol menüsünde tek modül olarak görünür.
- Ayrı Vite sitesi kalkar.
- Login ekranı kaldırılır; Directus oturumu kullanılır.
- Kademeli geçiş yapılabilir.

Eksileri:

- Directus extension build zincirinin TSX/React bundle'ı için ayarlanması gerekir.
- React Router path'leri `/admin/marketing-hub/...` altında çalışacak şekilde güncellenir.
- Directus app shell ile mevcut hub shell'inin çakışmaması için sol menü/header sadeleştirilir.

Tahmini efor: orta.

### Seçenek 3: Vite Build'ini Directus İçinde Static/Iframe Olarak Sunmak

Vite `dist` çıktısı Directus endpoint üzerinden servis edilir veya Directus module içinde iframe ile açılır.

Artıları:

- En hızlı prototip.
- Mevcut UI neredeyse hiç değişmez.

Eksileri:

- Directus shell içinde ayrı bir mini site gibi davranır.
- Auth aktarımı daha kırılgan olur.
- Routing, refresh, asset path ve CSP sorunları çıkabilir.
- Uzun vadede "ayrı siteyi Directus içine sakladık" hissi verir.

Tahmini efor: düşük/orta, ama teknik borç üretir.

## Önerilen Karar

Seçenek 2: Directus module içinde React mount yaklaşımı.

Bu yaklaşım "ayrı site olmasın" hedefini karşılıyor, ama mevcut Vite/React yatırımını da çöpe atmıyor. Duplicate Manager kadar Directus'a gömülü görünür; sadece UI framework içeride React olarak kalır.

## Yapılması Gereken Ana Değişiklikler

### 1. Yeni Directus Extension

Yeni klasör:

```text
directus/extensions/marketing-hub
```

Bundle entries:

- `module`: `Marketing Hub` menü ekranı.
- `endpoint`: gerekirse `/marketing-hub/*` proxy veya native endpointler.

Başlangıç route:

```text
/admin/marketing-hub
```

### 2. React App'i Modül İçine Taşımak

`web/src` altındaki ekranlar yeni extension içine alınabilir.

Kaldırılacak/değiştirilecek parçalar:

- `Login.tsx`
- `AuthProvider` içindeki `/auth/login` akışı
- `mh_token` localStorage kullanımı
- Harici Vite `BrowserRouter` root path varsayımları

Korunabilecek parçalar:

- Page componentleri
- SegmentBuilder
- WhatsappTemplateFields
- API kullanım şeklinin çoğu
- Tailwind/CSS sınıfları, gerekirse extension CSS içine alınarak

### 3. Auth Modelini Değiştirmek

Mevcut:

```text
React UI -> Fastify /auth/login -> Directus login -> Hub JWT -> Hub API
```

Hedef:

```text
Directus logged-in user -> Marketing Hub Directus module -> Directus session/access token -> Marketing Hub endpoint/API
```

İki uygulanabilir alt yol var:

#### 3A. Fastify API Directus Token Kabul Etsin

React modülü Directus'un mevcut access token'ını kullanarak Fastify API'ye çağrı yapar. Fastify, token'ı ilgili Directus instance üzerinde `/users/me` ile doğrular ve rolü map eder.

Artı: Mevcut `src/modules/*` büyük ölçüde korunur.

Eksi: Fastify servisi yine ayrı runtime olarak kalır; sadece web sitesi kalkar.

#### 3B. Fastify Route'larını Directus Endpoint'e Taşımak

`src/modules/*` içindeki route mantığı Directus extension endpointleri altına taşınır.

Artı: Hem UI hem API Directus içinde olur.

Eksi: Fastify request/reply, plugin ve auth yapısı değişeceği için işçilik daha yüksek.

Öneri: İlk fazda 3A, ikinci fazda ihtiyaç olursa 3B.

### 4. Dernek/Tenant Mantığı

Mevcut sistem "her derneğin kendi Directus'u" modelini kullanıyor:

```text
config/derneks.json -> dernek id -> Directus url/token
```

Directus içine gömüldüğünde kullanıcı zaten belli bir derneğin Directus instance'ında olacak. Bu yüzden login dropdown ve `dernek` seçimi kalkmalı.

Fastify API tarafında dernek tespiti için iki yol var:

- Her Directus instance'a kendi `MARKETING_HUB_DERNEK_ID` konfigürasyonu verilir.
- Ya da Fastify, gelen token'ın doğrulandığı Directus URL'sinden derneği registry üzerinden bulur.

Operasyonel olarak ilk yol daha basit ve güvenli.

### 5. UI Shell'i Sadeleştirmek

Marketing Hub şu an kendi koyu sidebar'ını ve header'ını çiziyor. Directus içinde bu tekrar olur.

Öneri:

- Directus sol menüsünde tek `Marketing Hub` modülü olsun.
- Hub içindeki alt navigasyon yatay tab veya kompakt sol iç menü olabilir.
- Çıkış butonu kaldırılmalı; logout Directus'un kendi shell'inde kalmalı.
- Kullanıcı e-postası/rol bilgisi isteğe bağlı küçük bir üst satırda gösterilebilir.

### 6. Routing

Mevcut route'lar:

```text
/
/campaigns
/campaigns/new
/campaigns/:id
/segments
/automations
/automations/new
/automations/:id/edit
/settings
/contacts
/contacts/:id
```

Directus içinde hedef route'lar:

```text
/admin/marketing-hub
/admin/marketing-hub/campaigns
/admin/marketing-hub/campaigns/new
...
```

React Router `basename` veya `MemoryRouter` ile uyarlanmalı. Directus module route'unda refresh davranışı ayrıca test edilmeli.

## Faz Planı

### Faz 0: Teknik Spike

Amaç: React'in Directus module içinde sorunsuz bundle edilip mount edildiğini kanıtlamak.

İşler:

- `directus/extensions/marketing-hub` oluştur.
- Basit Directus module ekle.
- Vue `Module.vue` içinde React `createRoot()` ile küçük bir component mount et.
- `npm run build` ve `directus-extension validate` çalıştır.
- Directus admin'de `/admin/marketing-hub` açıldığını doğrula.

Başarı kriteri:

- Sol menüde Marketing Hub görünür.
- React component Directus içinde render olur.

### Faz 1: UI Taşıma

Amaç: Mevcut React ekranlarını Directus modülü içinde çalıştırmak.

İşler:

- `web/src/pages`, `components`, `lib` taşınır veya paylaşılır.
- Login/AuthProvider kaldırılır.
- Router base path uyarlanır.
- Shell sadeleştirilir.
- CSS/Tailwind build sorunu çözülür.

Başarı kriteri:

- Dashboard, kampanya listesi, segment listesi Directus içinde açılır.

### Faz 2: Auth/API Uyarlaması

Amaç: Ayrı hub login'i kaldırmak.

İşler:

- UI API client Directus oturumundan token alacak şekilde değiştirilir.
- Fastify API Directus token doğrulamayı destekler.
- `/auth/login`, `/me`, `/derneks` UI bağımlılığı kaldırılır.
- RBAC Directus role mapping ile devam eder.

Başarı kriteri:

- Directus'a login olan kullanıcı Marketing Hub ekranlarında ekstra login olmadan işlem yapar.

### Faz 3: Üretim Paketleme

Amaç: Web container/site'i devreden çıkarmak.

İşler:

- `web` deploy adımı kaldırılır veya sadece kaynak olarak tutulur.
- Directus extension build deploy pipeline'a eklenir.
- Coolify/production Directus extension mount süreci netleştirilir.
- Cache busting ve Directus restart/reload prosedürü dokümante edilir.

Başarı kriteri:

- Production'da tek kullanıcı girişi Directus olur.
- Ayrı Marketing Hub URL'si gerekmez.

## Riskler

- Directus extension build'in React/TSX/Tailwind ile ek ayar istemesi.
- Directus shell CSS'i ile mevcut Tailwind stillerinin çakışması.
- React Router refresh/deep-link davranışı.
- Fastify API'nin Directus token doğrulama ve dernek tespiti.
- Her derneğin kendi Directus instance'ı varsa extension deployment'ın tüm instance'lara yapılması.
- Worker ve webhook'lar Directus içine alınmamalı; ayrı servis olarak kalmalı.

## Net Sonuç

Bu iş yapılabilir. Ayrı siteyi kaldırmak için en dengeli çözüm, Marketing Hub'u Directus bundle extension içinde bir custom module olarak çalıştırmak ve mevcut React UI'ı adapter ile mount etmektir.

İlk iş olarak küçük bir teknik spike yapılmalı. Spike başarılı olursa mevcut web arayüzünün büyük kısmı korunarak Directus içine taşınabilir. Backend tarafında ilk fazda Fastify API kalabilir; sadece auth Directus oturumuna göre uyarlanır.
