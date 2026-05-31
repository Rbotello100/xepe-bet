# GCP Setup — Cloud Run + CI/CD via GitHub Actions

Runbook completo del bootstrap de infraestructura. Sigue este orden.

**Target**: deploy automático a Cloud Run desde GitHub Actions, sin keys de service account, con secrets en Secret Manager.

**Stack**: Cloud Run + Artifact Registry + Cloud Scheduler + Secret Manager + Workload Identity Federation + GitHub Actions.

---

## 1. Estado actual (25-abr-2026)

### ✅ Ya hecho por Rodrigo

| Recurso | Resultado |
|---|---|
| APIs habilitadas | `run`, `artifactregistry`, `secretmanager`, `iam`, `iamcredentials`, `cloudscheduler`, `cloudbuild`, `sts` |
| Artifact Registry repo | `us-central1-docker.pkg.dev/dm-agents/mundial-betting` |
| Service Account | `github-deployer@dm-agents.iam.gserviceaccount.com` (sin roles asignados todavía) |
| Workflow GitHub Actions | [.github/workflows/deploy-cloudrun.yml](../.github/workflows/deploy-cloudrun.yml) |
| Dockerfile | listo, `output: standalone` en next.config.ts |

### ⛔ Pendiente — bloqueado por permisos IAM

Rodrigo tiene `roles/editor + roles/run.admin + roles/storage.admin` pero NO tiene:
- `roles/resourcemanager.projectIamAdmin` (para hacer `setIamPolicy` a nivel proyecto)
- `roles/iam.serviceAccountAdmin` (para bindings sobre service accounts)
- `roles/iam.workloadIdentityPoolAdmin` (para crear pools WIF)

Por eso requiere que **alguien con esos permisos** (IT/SRE Xepelin, GCP project owner) corra `scripts/gcp-bootstrap.sh`. Después, todo lo demás se desbloquea.

---

## 2. Pasos para terminar el setup

### Paso 2.1 — Acción de IT/SRE Xepelin (5 minutos)

El admin del proyecto `dm-agents` corre:

```bash
git clone https://github.com/Rbotello100/mundial-betting.git
cd mundial-betting
gcloud auth login                       # cuenta con projectIamAdmin
gcloud config set project dm-agents
./scripts/gcp-bootstrap.sh
```

El script asigna roles al SA, crea el WIF pool/provider, bindea la identidad GitHub al SA. Al final imprime:

```
GCP_WIF_PROVIDER = projects/<NUMBER>/locations/global/workloadIdentityPools/github-pool/providers/github-provider
GCP_SA_EMAIL     = github-deployer@dm-agents.iam.gserviceaccount.com
```

Esos 2 valores se le pasan a Rodrigo para el paso 2.2.

### Paso 2.2 — Acción de Rodrigo (10 minutos)

Con su gcloud + gh autenticados:

```bash
# Carga secrets (Secret Manager + GitHub)
./scripts/setup-secrets.sh

# Después que IT corrió el bootstrap, cargá los 2 outputs en GitHub:
gh secret set GCP_WIF_PROVIDER --body="<output del bootstrap>" --repo=Rbotello100/mundial-betting
gh secret set GCP_SA_EMAIL     --body="github-deployer@dm-agents.iam.gserviceaccount.com" --repo=Rbotello100/mundial-betting
```

### Paso 2.3 — Primer deploy automático

```bash
# Cualquier push a main dispara el workflow:
git commit --allow-empty -m "chore: trigger first Cloud Run deploy"
git push origin main

# O manual:
gh workflow run deploy-cloudrun --repo=Rbotello100/mundial-betting
```

El workflow va a:
1. Auth a GCP via WIF (sin keys).
2. Build de la imagen Docker con build args inyectados desde GitHub Secrets.
3. Push a Artifact Registry.
4. Deploy a Cloud Run con env vars + secret refs.
5. Imprimir la URL final en el `$GITHUB_STEP_SUMMARY`.

### Paso 2.4 — Actualizar `NEXT_PUBLIC_SITE_URL`

El primer deploy va a salir con la URL placeholder. Después del primer deploy:

```bash
SERVICE_URL=$(gcloud run services describe mundial-betting --region=us-central1 --format='value(status.url)')
gh secret set NEXT_PUBLIC_SITE_URL --body="${SERVICE_URL}" --repo=Rbotello100/mundial-betting

# Re-deploy para que el bundle del cliente tenga la URL correcta
gh workflow run deploy-cloudrun --repo=Rbotello100/mundial-betting
```

### Paso 2.5 — Configurar OAuth callback en Supabase

En Supabase Dashboard → Auth → URL Configuration:
- Agregar a "Redirect URLs": `${SERVICE_URL}/api/auth/callback`
- Mantener también `http://localhost:3000/api/auth/callback` para dev.

### Paso 2.6 — Cloud Scheduler para crons

```bash
SERVICE_URL=$(gcloud run services describe mundial-betting --region=us-central1 --format='value(status.url)')
PROJECT_ID=dm-agents ./scripts/setup-cron.sh "${SERVICE_URL}"
```

Crea 3 jobs (12:00 UTC, 13:00 UTC, 14:00 UTC) que pegan a los endpoints de cron del servicio con el `CRON_SECRET` como Bearer.

### Paso 2.7 — Supabase Pro

Antes del lanzamiento a 450 users, upgrade del plan en Supabase Dashboard → Settings → Billing → Pro ($25/mes). Eso desbloquea:
- 8 GB DB, 250 GB egress, 500 conexiones Realtime, sin auto-pause, backups diarios.

---

## 3. Verificación

Después del primer deploy exitoso:

```bash
# 1. Servicio respondiendo
SERVICE_URL=$(gcloud run services describe mundial-betting --region=us-central1 --format='value(status.url)')
curl -s "${SERVICE_URL}/api/health" | jq .

# 2. Workflow corrió bien
gh run list --workflow=deploy-cloudrun --limit=3 --repo=Rbotello100/mundial-betting

# 3. Cloud Scheduler jobs activos
gcloud scheduler jobs list --location=us-central1

# 4. Secrets accesibles desde el service (probar con un cron manual)
gcloud scheduler jobs run sync-odds --location=us-central1
```

---

## 4. Troubleshooting

**Error: "Permission denied" en el workflow al hacer `gcloud run deploy`**
→ El SA no tiene `roles/run.admin`. Revisar que `gcp-bootstrap.sh` corrió OK.

**Error: "Failed to fetch secret"**
→ El SA no tiene `roles/secretmanager.secretAccessor`. Revisar bootstrap.

**Error: "Could not create Workload Identity Pool"**
→ La cuenta que corre el bootstrap no tiene `roles/iam.workloadIdentityPoolAdmin`. Escalar.

**El sitio carga pero el login OAuth falla con `redirect_uri_mismatch`**
→ Falta agregar `${SERVICE_URL}/api/auth/callback` en Supabase Dashboard → Auth → URL Configuration.

**Cloud Run cold starts demasiado lentos**
→ Pasar a `--min-instances=1` (cuesta ~$5/mes pero elimina cold start para los críticos).

---

## 5. Costos esperados

| Servicio | Costo mensual estimado | Notas |
|---|---|---|
| Cloud Run (us-central1) | $5-15 | autoescala, free tier cubre la mayoría |
| Artifact Registry storage | $1-2 | imágenes Docker |
| Cloud Scheduler | $0 | 3 jobs, free tier hasta 3 |
| Secret Manager | $0 | < 6 versiones activas |
| Cloud Logging | $0 | bajo el free tier (~50 GB/mes) |
| **Supabase Pro** | **$25** | DB + Auth + Realtime |
| The Odds API | $0 | free tier 500 créditos/mes |
| **Total** | **~$30-40/mes** | |

---

## 6. Permisos que faltan a Rodrigo (para futuro)

Si IT/SRE quiere darle autonomía a Rodrigo para administrar este proyecto sin escalas futuras, los roles que faltan son:

- `roles/resourcemanager.projectIamAdmin` — para asignar/quitar roles a nivel proyecto
- `roles/iam.serviceAccountAdmin` — para crear y administrar service accounts
- `roles/iam.workloadIdentityPoolAdmin` — para administrar WIF

Con esos 3 podría correr `gcp-bootstrap.sh` él mismo.
