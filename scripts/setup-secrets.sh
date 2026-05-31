#!/usr/bin/env bash
#
# Setup de secrets — Rodrigo puede correrlo HOY (tiene Secret Manager access).
#
# Carga los secrets en:
#   - GCP Secret Manager (los que necesita Cloud Run en runtime)
#   - GitHub Repository Secrets (los que necesita el workflow de build)
#
# Los valores se leen con `read -s` (sin echo), nunca se imprimen ni se persisten.
#
# CÓMO EJECUTAR:
#   ./scripts/setup-secrets.sh
#
# PRE-REQS:
#   - gcloud autenticado en dm-agents
#   - gh autenticado en GitHub

set -euo pipefail

PROJECT_ID="dm-agents"
REPO="Rbotello100/mundial-betting"

echo "→ Project: ${PROJECT_ID}"
echo "→ Repo:    ${REPO}"
echo ""
echo "Vas a pegar 4 valores. No se van a mostrar en pantalla."
echo "Tomalos del dashboard de Supabase (Settings → API) y de the-odds-api.com."
echo ""

# ─────────────────────────────────────────────────────────────
# Secrets de Secret Manager (runtime de Cloud Run)
# ─────────────────────────────────────────────────────────────
create_or_update_secret() {
  local NAME="$1"
  local VALUE="$2"
  if gcloud secrets describe "${NAME}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    echo -n "${VALUE}" | gcloud secrets versions add "${NAME}" --data-file=- --project="${PROJECT_ID}" >/dev/null
    echo "   ✓ ${NAME} (nueva versión)"
  else
    echo -n "${VALUE}" | gcloud secrets create "${NAME}" --data-file=- --project="${PROJECT_ID}" >/dev/null
    echo "   ✓ ${NAME} (creado)"
  fi
}

echo "→ [1/2] Secrets en GCP Secret Manager..."

read -srp "   SUPABASE_SERVICE_ROLE_KEY: " V_SRK && echo
create_or_update_secret "supabase-service-role-key" "${V_SRK}"

read -srp "   THE_ODDS_API_KEY: " V_ODDS && echo
create_or_update_secret "the-odds-api-key" "${V_ODDS}"

# CRON_SECRET se genera localmente
V_CRON=$(openssl rand -hex 32)
create_or_update_secret "cron-secret" "${V_CRON}"
echo "      (cron-secret generado automáticamente, queda en Secret Manager)"

# ─────────────────────────────────────────────────────────────
# Secrets en GitHub (build-time)
# ─────────────────────────────────────────────────────────────
echo ""
echo "→ [2/2] Secrets en GitHub Repository..."

set_gh_secret() {
  local NAME="$1"
  local VALUE="$2"
  echo -n "${VALUE}" | gh secret set "${NAME}" --repo="${REPO}" --body="$(cat)" >/dev/null 2>&1 || \
    echo -n "${VALUE}" | gh secret set "${NAME}" --repo="${REPO}"
  echo "   ✓ ${NAME}"
}

read -srp "   NEXT_PUBLIC_SUPABASE_URL: " V_URL && echo
set_gh_secret "NEXT_PUBLIC_SUPABASE_URL" "${V_URL}"

read -srp "   NEXT_PUBLIC_SUPABASE_ANON_KEY: " V_ANON && echo
set_gh_secret "NEXT_PUBLIC_SUPABASE_ANON_KEY" "${V_ANON}"

# NEXT_PUBLIC_SITE_URL apunta al servicio Cloud Run.
# Como aún no se deployó, dejamos un placeholder que se actualiza después del primer deploy.
echo ""
read -p "   NEXT_PUBLIC_SITE_URL (Cloud Run URL final, o dejá vacío y se completa después del primer deploy): " V_SITE
if [ -n "${V_SITE}" ]; then
  set_gh_secret "NEXT_PUBLIC_SITE_URL" "${V_SITE}"
else
  set_gh_secret "NEXT_PUBLIC_SITE_URL" "https://mundial-betting-PLACEHOLDER.a.run.app"
  echo "      placeholder cargado — actualizar después del primer deploy con la URL real"
fi

# Cleanup
unset V_SRK V_ODDS V_CRON V_URL V_ANON V_SITE

echo ""
echo "→ Listo. Secrets cargados:"
echo "   GCP Secret Manager:  supabase-service-role-key, the-odds-api-key, cron-secret"
echo "   GitHub Secrets:      NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL"
echo ""
echo "→ Falta agregar a GitHub: GCP_WIF_PROVIDER y GCP_SA_EMAIL después que IT corra gcp-bootstrap.sh"
