#!/usr/bin/env bash
#
# Deploy Mundial Betting to Cloud Run + Cloud Scheduler
#
# Prereqs (run ONCE on first setup):
#   1. gcloud auth login
#   2. gcloud config set project YOUR_PROJECT_ID
#   3. gcloud auth configure-docker
#   4. Enable APIs:
#      gcloud services enable run.googleapis.com cloudscheduler.googleapis.com \
#        secretmanager.googleapis.com containerregistry.googleapis.com
#   5. Create secrets (replace values with your real keys):
#      echo -n "YOUR_SUPABASE_SERVICE_ROLE_KEY" | gcloud secrets create supabase-service-role-key --data-file=-
#      echo -n "YOUR_THE_ODDS_API_KEY"          | gcloud secrets create the-odds-api-key         --data-file=-
#      echo -n "YOUR_API_FOOTBALL_KEY"          | gcloud secrets create api-football-key         --data-file=-
#      openssl rand -hex 32 | gcloud secrets create cron-secret --data-file=-
#   6. Grant Secret Accessor to the Cloud Run default service account:
#      PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')
#      for secret in supabase-service-role-key the-odds-api-key api-football-key cron-secret; do
#        gcloud secrets add-iam-policy-binding $secret \
#          --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
#          --role="roles/secretmanager.secretAccessor"
#      done
#
# Usage:
#   ./scripts/deploy.sh v2
#   where "v2" is the image tag
#
set -euo pipefail

# ─── Config ──────────────────────────────────────
PROJECT_ID="${PROJECT_ID:?PROJECT_ID env var required}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="mundial-betting"
IMAGE_TAG="${1:-latest}"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:${IMAGE_TAG}"

# ─── Required env vars you must set before running ──
: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL required}"
: "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?NEXT_PUBLIC_SUPABASE_ANON_KEY required}"
: "${NEXT_PUBLIC_SITE_URL:?NEXT_PUBLIC_SITE_URL required (e.g. https://mundial-betting-xyz.a.run.app)}"

echo "→ Building Docker image: ${IMAGE}"
docker build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  --build-arg NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL}" \
  --build-arg NEXT_PUBLIC_SPORT_KEY="soccer_fifa_world_cup" \
  --build-arg NEXT_PUBLIC_FOOTBALL_LEAGUE_ID="1" \
  --build-arg NEXT_PUBLIC_FOOTBALL_SEASON="2026" \
  -t "${IMAGE}" .

echo "→ Pushing image to Container Registry"
docker push "${IMAGE}"

echo "→ Deploying to Cloud Run (${REGION})"
# NOTE: passing private keys as plain env vars instead of Secret Manager
# because the deployer doesn't have IAM setIamPolicy permission on secrets
# in this GCP project. Swap to --set-secrets when permissions are granted.
: "${SUPABASE_SERVICE_ROLE_KEY:?required}"
: "${THE_ODDS_API_KEY:?required}"
: "${API_FOOTBALL_KEY:?required}"
: "${CRON_SECRET:?required}"

gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 5 \
  --cpu 1 \
  --memory 512Mi \
  --set-env-vars "^|^NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}|NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}|NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}|NEXT_PUBLIC_SPORT_KEY=soccer_fifa_world_cup|NEXT_PUBLIC_FOOTBALL_LEAGUE_ID=1|NEXT_PUBLIC_FOOTBALL_SEASON=2026|TZ=America/Santiago|SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}|THE_ODDS_API_KEY=${THE_ODDS_API_KEY}|API_FOOTBALL_KEY=${API_FOOTBALL_KEY}|CRON_SECRET=${CRON_SECRET}"

SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format 'value(status.url)')
echo ""
echo "✅ Deploy OK"
echo "   URL: ${SERVICE_URL}"
echo ""
echo "Next steps:"
echo "  1. Run Supabase migrations (once):"
echo "     psql \$DATABASE_URL -f supabase/migrations-terms-v1.sql"
echo "     psql \$DATABASE_URL -f supabase/migrations-worldcup-draw-v1.sql"
echo ""
echo "  2. Add redirect URI to Google OAuth (one time):"
echo "     ${SERVICE_URL}/api/auth/callback"
echo ""
echo "  3. Create/update Cloud Scheduler jobs:"
echo "     ./scripts/setup-cron.sh ${SERVICE_URL}"
