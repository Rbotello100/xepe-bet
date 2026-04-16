#!/usr/bin/env bash
#
# Create/update Cloud Scheduler jobs for odds and scores sync.
# Run this once after the first deploy. Safe to re-run (uses "describe" to
# decide between create and update).
#
# Prereqs:
#   - cron-secret must exist in Secret Manager (see deploy.sh header)
#   - Cloud Scheduler API must be enabled
#
# Usage:
#   ./scripts/setup-cron.sh https://mundial-betting-xyz.a.run.app
#
set -euo pipefail

SERVICE_URL="${1:?Service URL required as first argument}"
REGION="${REGION:-us-central1}"
PROJECT_ID="${PROJECT_ID:?PROJECT_ID env var required}"

# Fetch CRON_SECRET from Secret Manager
CRON_SECRET=$(gcloud secrets versions access latest --secret=cron-secret)

create_or_update_job() {
  local name="$1"
  local schedule="$2"
  local path="$3"

  if gcloud scheduler jobs describe "${name}" --location "${REGION}" >/dev/null 2>&1; then
    echo "→ Updating ${name}"
    gcloud scheduler jobs update http "${name}" \
      --location "${REGION}" \
      --schedule "${schedule}" \
      --time-zone "America/Santiago" \
      --uri "${SERVICE_URL}${path}" \
      --http-method POST \
      --headers "Authorization=Bearer ${CRON_SECRET},Content-Type=application/json" \
      --message-body '{}'
  else
    echo "→ Creating ${name}"
    gcloud scheduler jobs create http "${name}" \
      --location "${REGION}" \
      --schedule "${schedule}" \
      --time-zone "America/Santiago" \
      --uri "${SERVICE_URL}${path}" \
      --http-method POST \
      --headers "Authorization=Bearer ${CRON_SECRET},Content-Type=application/json" \
      --message-body '{}'
  fi
}

# Odds: every 30 min. The endpoint internally skips matches that are already
# synced or outside the 24h window, so extra triggers are cheap.
create_or_update_job "mundial-sync-odds" "*/30 * * * *" "/api/cron/sync-odds"

# Scores: every 10 min. The endpoint picks up matches that passed 130 min since
# kickoff and haven't been finalised yet.
create_or_update_job "mundial-sync-scores" "*/10 * * * *" "/api/cron/sync-scores"

echo ""
echo "✅ Cloud Scheduler jobs ready"
gcloud scheduler jobs list --location "${REGION}" --filter "name:mundial-sync"
