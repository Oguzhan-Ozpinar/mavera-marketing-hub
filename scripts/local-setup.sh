#!/usr/bin/env bash
# Lokal geliştirme ortamını sıfırdan hazırlar:
#   1) docker compose (Directus + Postgres + Redis)
#   2) canlı ŞEMAYI uygula (pre-work/snapshot.yaml) — sadece yapı, veri değil
#   3) admin kullanıcı + statik token garanti et
# Kullanım: bash scripts/local-setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DIRECTUS_URL="http://localhost:8055"
TOKEN="lokal-admin-token"
EMAIL="admin@mavera.com"    # NOT: Directus .local uzantısını reddediyor
PASS="admin12345"

echo "▶ docker compose up..."
docker compose up -d

echo "▶ Directus bekleniyor..."
for i in $(seq 1 45); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' $DIRECTUS_URL/server/health)" = "200" ] && break
  sleep 2
done

echo "▶ Şema uygulanıyor (snapshot.yaml)..."
docker compose cp pre-work/snapshot.yaml directus:/directus/snapshot.yaml
docker compose exec -T directus sh -c 'cd /directus && node cli.js schema apply --yes ./snapshot.yaml'

# Admin var mı?
if [ "$(curl -s -H "Authorization: Bearer $TOKEN" $DIRECTUS_URL/users/me?fields=email | grep -c '"email"')" = "0" ]; then
  echo "▶ Admin oluşturuluyor..."
  ROLE_ID=$(docker compose exec -T directus sh -c 'cd /directus && node cli.js roles create --role Administrator --admin' 2>&1 \
    | grep -oiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | tail -1)
  docker compose exec -T directus sh -c "cd /directus && node cli.js users create --email $EMAIL --password $PASS --role $ROLE_ID" || true
  docker compose exec -T postgres psql -U directus -d directus -c "UPDATE directus_users SET token='$TOKEN' WHERE email='$EMAIL';"
fi

echo "✅ Hazır → $DIRECTUS_URL  (email: $EMAIL / pass: $PASS / token: $TOKEN)"
