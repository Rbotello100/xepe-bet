#!/usr/bin/env bash
#
# GCP Bootstrap — comandos one-time que requieren IAM Admin / Project IAM Admin.
#
# CONTEXTO:
#   - Rodrigo (rodrigo.botello@xepelin.com) tiene roles/editor + roles/run.admin + roles/storage.admin
#     en el proyecto dm-agents, pero NO tiene roles/iam.serviceAccountAdmin ni
#     roles/resourcemanager.projectIamAdmin.
#   - Por eso este script DEBE ser ejecutado por alguien con esos roles (típicamente IT/SRE de Xepelin).
#   - Lo que está aca son únicamente bindings de IAM + Workload Identity Federation.
#   - El resto del setup (APIs, Artifact Registry, Service Account) ya está hecho.
#
# PREREQUISITOS YA REALIZADOS POR RODRIGO:
#   - gcloud services enable run/artifactregistry/secretmanager/iam/iamcredentials/cloudscheduler/sts.googleapis.com
#   - gcloud artifacts repositories create mundial-betting --repository-format=docker --location=us-central1
#   - gcloud iam service-accounts create github-deployer
#
# CÓMO EJECUTARLO:
#   1. Login con cuenta que tenga roles/resourcemanager.projectIamAdmin (o roles/owner) en dm-agents:
#        gcloud auth login
#        gcloud config set project dm-agents
#   2. Correr:
#        ./scripts/gcp-bootstrap.sh
#   3. Pasar los outputs (WIF_PROVIDER, SA_EMAIL) a Rodrigo para que los cargue como
#      GitHub Repository Secrets.

set -euo pipefail

PROJECT_ID="dm-agents"
REGION="us-central1"
SA_NAME="github-deployer"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
WIF_POOL="github-pool"
WIF_PROVIDER="github-provider"
REPO="Rbotello100/mundial-betting"

echo "→ Project: ${PROJECT_ID}"
echo "→ Service Account: ${SA_EMAIL}"
echo "→ GitHub Repo: ${REPO}"
echo ""

# ─────────────────────────────────────────────────────────────
# 1. Bindings al proyecto para el SA github-deployer
# ─────────────────────────────────────────────────────────────
echo "→ [1/4] Asignando roles al SA github-deployer..."

ROLES=(
  "roles/run.admin"                  # deploy + update Cloud Run services
  "roles/iam.serviceAccountUser"     # actuar como otras SAs si hace falta
  "roles/artifactregistry.writer"    # push de imágenes Docker
  "roles/cloudscheduler.admin"       # crear/update cron jobs
  "roles/secretmanager.secretAccessor"  # leer secrets en runtime (Cloud Run los inyecta)
)

for role in "${ROLES[@]}"; do
  echo "   - $role"
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

# ─────────────────────────────────────────────────────────────
# 2. Workload Identity Federation — pool + provider
# ─────────────────────────────────────────────────────────────
echo "→ [2/4] Creando WIF pool y provider..."

if ! gcloud iam workload-identity-pools describe "${WIF_POOL}" \
       --location=global --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "${WIF_POOL}" \
    --location=global \
    --display-name="GitHub Actions pool" \
    --description="WIF pool for GitHub Actions deploys" \
    --project="${PROJECT_ID}"
else
  echo "   - pool ya existe"
fi

if ! gcloud iam workload-identity-pools providers describe "${WIF_PROVIDER}" \
       --workload-identity-pool="${WIF_POOL}" --location=global \
       --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "${WIF_PROVIDER}" \
    --workload-identity-pool="${WIF_POOL}" \
    --location=global \
    --project="${PROJECT_ID}" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
    --attribute-condition="assertion.repository=='${REPO}'"
else
  echo "   - provider ya existe"
fi

# ─────────────────────────────────────────────────────────────
# 3. Bind WIF identity al SA — permite a GitHub Actions asumir el SA
# ─────────────────────────────────────────────────────────────
echo "→ [3/4] Bindeando WIF identity al SA..."

PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')

gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${REPO}" \
  --project="${PROJECT_ID}" \
  --quiet >/dev/null

# ─────────────────────────────────────────────────────────────
# 4. Outputs para los GitHub Secrets
# ─────────────────────────────────────────────────────────────
echo "→ [4/4] Outputs para configurar en GitHub Secrets:"
echo ""
echo "─────────────────────────────────────────────────────────"
echo "GCP_WIF_PROVIDER = projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}"
echo "GCP_SA_EMAIL     = ${SA_EMAIL}"
echo "─────────────────────────────────────────────────────────"
echo ""
echo "→ Pasar estos 2 valores a Rodrigo para cargarlos con:"
echo "    gh secret set GCP_WIF_PROVIDER --body=\"<value>\" --repo=${REPO}"
echo "    gh secret set GCP_SA_EMAIL     --body=\"<value>\" --repo=${REPO}"
echo ""
echo "→ Done."
