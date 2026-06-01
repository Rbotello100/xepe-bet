#!/usr/bin/env bash
#
# Deploy manual de Xepe Bet a Cloud Run.
#
# Construye la imagen localmente con Docker, la sube a Artifact Registry y
# despliega a Cloud Run inyectando los secrets vía Secret Manager.
#
# Pre-reqs (una sola vez):
#   1. gcloud autenticado en dm-agents              gcloud auth login
#   2. Docker corriendo                              open -a Docker
#   3. Secrets cargados                              ./scripts/setup-secrets.sh
#   4. .env.local con NEXT_PUBLIC_*                  cp .env.example .env.local && edit
#
# Uso:
#   ./scripts/deploy.sh                # tag autogenerado (timestamp)
#   ./scripts/deploy.sh v2-fix         # tag custom

set -euo pipefail

# ─── Config ──────────────────────────────────────
PROJECT_ID="dm-agents"
REGION="us-central1"
SERVICE_NAME="mundial-betting"
AR_REPO="mundial-betting"
TAG="${1:-$(date +%Y%m%d-%H%M%S)}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${SERVICE_NAME}:${TAG}"

# ─── Cargar build args desde .env.local ──────────
if [ ! -f .env.local ]; then
  echo "❌ Falta .env.local con NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL"
  exit 1
fi
set -a
# shellcheck disable=SC1091
. .env.local
set +a

: "${NEXT_PUBLIC_SUPABASE_URL:?required en .env.local}"
: "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?required en .env.local}"
: "${NEXT_PUBLIC_SITE_URL:?required en .env.local — primera vez podés dejar https://placeholder.a.run.app}"
NEXT_PUBLIC_SPORT_KEY="${NEXT_PUBLIC_SPORT_KEY:-soccer_fifa_world_cup}"

# ─── Sanity checks ───────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker no instalado / no en PATH"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker daemon no corriendo. Abrí Docker Desktop y reintentá."
  exit 1
fi

# ─── Docker auth para Artifact Registry (idempotente) ─
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >/dev/null

# ─── Build + push ────────────────────────────────
echo "→ Building ${IMAGE} (linux/amd64)"
docker buildx build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  --build-arg NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL}" \
  --build-arg NEXT_PUBLIC_SPORT_KEY="${NEXT_PUBLIC_SPORT_KEY}" \
  -t "${IMAGE}" \
  --push \
  .

# ─── Deploy ──────────────────────────────────────
echo "→ Deploying to Cloud Run (${REGION})"
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 5 \
  --cpu 1 \
  --memory 1Gi \
  --concurrency 80 \
  --timeout 60s \
  --set-env-vars "^|^NODE_ENV=production|TZ=America/Santiago|NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}|NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}|NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}|NEXT_PUBLIC_SPORT_KEY=${NEXT_PUBLIC_SPORT_KEY}" \
  --set-secrets "SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest,THE_ODDS_API_KEY=the-odds-api-key:latest,CRON_SECRET=cron-secret:latest"

SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" --project "${PROJECT_ID}" \
  --format 'value(status.url)')

echo ""
echo "✅ Deploy OK"
echo "   Image: ${IMAGE}"
echo "   URL:   ${SERVICE_URL}"
echo ""

# Si la URL del bundle no matchea, avisar
if [ "${NEXT_PUBLIC_SITE_URL}" != "${SERVICE_URL}" ]; then
  cat <<EOF
⚠️  NEXT_PUBLIC_SITE_URL no coincide con la URL real:
    .env.local:      ${NEXT_PUBLIC_SITE_URL}
    Cloud Run URL:   ${SERVICE_URL}

  El bundle del cliente tiene la URL vieja. Si es el primer deploy, actualizá
  .env.local con la URL real y volvé a correr ./scripts/deploy.sh.

EOF
fi

cat <<EOF
Siguientes pasos (primera vez):
  1. Configurar OAuth redirect en Supabase Dashboard → Auth → URL Configuration:
       ${SERVICE_URL}/api/auth/callback
  2. Cron jobs:
       PROJECT_ID=${PROJECT_ID} ./scripts/setup-cron.sh ${SERVICE_URL}
  3. Smoke test:
       curl -s ${SERVICE_URL}/api/health
EOF
