#!/usr/bin/env bash
#
# Carga los 3 secrets de runtime en GCP Secret Manager (proyecto dm-agents).
# Idempotente: si ya existen, agrega una nueva versión.
#
# Los valores se leen con `read -s` (no se imprimen, no se persisten en historial).
#
# Pre-reqs:
#   - gcloud autenticado en dm-agents
#   - Secret Manager API habilitado (ya está)
#
# Uso:
#   ./scripts/setup-secrets.sh

set -euo pipefail

PROJECT_ID="dm-agents"

echo "→ Project: ${PROJECT_ID}"
echo "  Vas a pegar 2 valores. No se muestran en pantalla."
echo ""

create_or_update() {
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

# ─── Secrets de runtime ─────────────────────────
read -srp "   SUPABASE_SERVICE_ROLE_KEY: " V_SRK && echo
create_or_update "supabase-service-role-key" "${V_SRK}"

read -srp "   THE_ODDS_API_KEY:          " V_ODDS && echo
create_or_update "the-odds-api-key" "${V_ODDS}"

# CRON_SECRET se genera local — nadie tiene que pegarlo
V_CRON="$(openssl rand -hex 32)"
create_or_update "cron-secret" "${V_CRON}"
echo "      (cron-secret auto-generado, queda en Secret Manager)"

unset V_SRK V_ODDS V_CRON

# ─── Grant accessor al runtime SA de Cloud Run ───
# Cloud Run usa por default el Compute Engine default SA. Necesita
# roles/secretmanager.secretAccessor sobre cada secret para que --set-secrets
# funcione en runtime.
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo ""
echo "→ Bindeando secretAccessor al runtime SA: ${RUNTIME_SA}"
BIND_FAILED=0
for SECRET in supabase-service-role-key the-odds-api-key cron-secret; do
  if gcloud secrets add-iam-policy-binding "${SECRET}" \
       --member="serviceAccount:${RUNTIME_SA}" \
       --role="roles/secretmanager.secretAccessor" \
       --project="${PROJECT_ID}" --quiet >/dev/null 2>&1; then
    echo "   ✓ ${SECRET}"
  else
    echo "   ⚠️  ${SECRET} — sin permiso para bind. Ver mensaje abajo."
    BIND_FAILED=1
  fi
done

echo ""
echo "✅ Secrets cargados en Secret Manager."

if [ "${BIND_FAILED}" -eq 1 ]; then
  cat <<EOF

⚠️  No pude darle al runtime SA acceso a algunos secrets (necesita
   roles/secretmanager.admin sobre el secret, o roles/owner en el proyecto).

   Pedile a IT que corra:

   for s in supabase-service-role-key the-odds-api-key cron-secret; do
     gcloud secrets add-iam-policy-binding \$s \\
       --member='serviceAccount:${RUNTIME_SA}' \\
       --role='roles/secretmanager.secretAccessor' \\
       --project='${PROJECT_ID}'
   done

   Sin esto, --set-secrets en deploy.sh va a fallar.
EOF
fi

echo ""
echo "→ Próximo paso: ./scripts/deploy.sh"
