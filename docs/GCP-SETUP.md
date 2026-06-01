# GCP Setup — Deploy manual a Cloud Run

Runbook para deployar Xepe Bet a Cloud Run manualmente. **Sin CI/CD por ahora** —
cuando IT/SRE Xepelin habilite los permisos de Workload Identity Federation, se
puede agregar GitHub Actions, pero hoy todo se hace desde la laptop.

**Stack**: Cloud Run + Artifact Registry + Secret Manager + Cloud Scheduler.

---

## 1. Estado actual

| Recurso | Estado |
|---|---|
| Project `dm-agents` | ✅ creado |
| APIs habilitadas | ✅ `run`, `artifactregistry`, `secretmanager`, `cloudscheduler`, `iam`, `cloudbuild`, `sts` |
| Artifact Registry | ✅ `us-central1-docker.pkg.dev/dm-agents/mundial-betting` |
| Service Account `github-deployer` | ⏸️ creada pero NO bindeada (se usaría para CI/CD) |
| Secret Manager | ⏸️ creas los 3 secrets corriendo `setup-secrets.sh` |
| Cloud Run service | ⏸️ se crea automáticamente en el primer `deploy.sh` |
| Cloud Scheduler | ⏸️ se crea con `setup-cron.sh` después del primer deploy |

---

## 2. Setup (una vez)

### 2.1. Variables públicas en `.env.local`

```bash
cp .env.example .env.local
```

Editá `.env.local` y completá los `NEXT_PUBLIC_*`. La anon key de Supabase
**no es secreta** (sale en el bundle del cliente igual), por eso vive en
`.env.local` y no en Secret Manager.

Para el primer deploy podés dejar `NEXT_PUBLIC_SITE_URL=https://placeholder.a.run.app`.
Después del primer deploy, lo actualizás con la URL real y re-deployás.

### 2.2. Cargar secrets en Secret Manager

```bash
./scripts/setup-secrets.sh
```

Pide:
- `SUPABASE_SERVICE_ROLE_KEY` (Supabase Dashboard → Settings → API → service_role)
- `THE_ODDS_API_KEY` (the-odds-api.com)

`CRON_SECRET` se autogenera. Los valores se leen con `read -s` (no se imprimen,
no quedan en `history`).

El script también intenta darle al runtime SA (`<NUM>-compute@developer.gserviceaccount.com`)
el rol `roles/secretmanager.secretAccessor`. Si falla por permisos, muestra el
comando exacto para que IT lo corra.

### 2.3. Docker corriendo

```bash
open -a Docker
```

Esperá unos segundos hasta que esté listo (icono verde en la barra superior).

---

## 3. Deploy

```bash
./scripts/deploy.sh
```

Lo que hace:
1. Carga `NEXT_PUBLIC_*` desde `.env.local`.
2. `docker buildx build --platform linux/amd64` con el Dockerfile.
3. Push de la imagen a `us-central1-docker.pkg.dev/dm-agents/mundial-betting`.
4. `gcloud run deploy` con `--set-env-vars` (públicas) y `--set-secrets`
   apuntando a Secret Manager (privadas).
5. Imprime la URL del servicio.

Tag de la imagen: si no pasás argumento, usa timestamp (`20260531-143020`).
Para nombrar uno custom: `./scripts/deploy.sh hotfix-cashout`.

### 3.1. Primer deploy

Probable secuencia:
```bash
# 1. NEXT_PUBLIC_SITE_URL=https://placeholder.a.run.app en .env.local
./scripts/deploy.sh

# 2. Sale la URL real, ej. https://mundial-betting-abc123-uc.a.run.app

# 3. Updateá .env.local con esa URL
sed -i '' "s|NEXT_PUBLIC_SITE_URL=.*|NEXT_PUBLIC_SITE_URL=https://mundial-betting-abc123-uc.a.run.app|" .env.local

# 4. Re-deploy para que el bundle tenga la URL correcta
./scripts/deploy.sh
```

Si el bundle del cliente tiene la URL vieja, el script avisa con `⚠️`.

### 3.2. Smoke test

```bash
SERVICE_URL=$(gcloud run services describe mundial-betting --region=us-central1 --format='value(status.url)')
curl -s "${SERVICE_URL}/api/health" | jq .
```

---

## 4. Pasos post-deploy (primera vez)

### 4.1. OAuth redirect en Supabase

Supabase Dashboard → Authentication → URL Configuration → Redirect URLs:
- Agregar: `${SERVICE_URL}/api/auth/callback`
- Mantener `http://localhost:3000/api/auth/callback` para dev.

### 4.2. Cron jobs

```bash
PROJECT_ID=dm-agents ./scripts/setup-cron.sh "${SERVICE_URL}"
```

Crea 2 jobs:
- `mundial-sync-odds` — cada 30 min, refresca cuotas de partidos en ventana de 24 h.
- `mundial-sync-scores` — cada 10 min, finaliza partidos terminados.

Cada job pega al endpoint correspondiente con `Authorization: Bearer ${CRON_SECRET}`.

### 4.3. Supabase Pro

Antes de abrir a 450 usuarios, upgradeá Supabase Free → Pro ($25/mes):
Supabase Dashboard → Settings → Billing → Pro.

Lo que se desbloquea:
- 8 GB DB, 250 GB egress, 500 conexiones Realtime, sin auto-pause, backups diarios.

---

## 5. Rollback rápido

Cloud Run guarda todas las revisiones inmutables. Si un deploy rompe algo:

```bash
# Listar las últimas revisiones
gcloud run revisions list --service=mundial-betting --region=us-central1 --limit=10

# Mandar el 100% del tráfico a una revisión anterior
gcloud run services update-traffic mundial-betting \
  --region=us-central1 \
  --to-revisions=mundial-betting-00042-abc=100
```

Si el rollback involucra schema de DB, revertir migraciones manualmente
**antes** del traffic switch.

---

## 6. Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `docker: command not found` | Docker no instalado | Instalar Docker Desktop |
| `Cannot connect to the Docker daemon` | Docker no corre | Abrir Docker Desktop, esperar icono verde |
| `denied: Permission "artifactregistry.repositories.uploadArtifacts" denied` | Falta auth de docker | El script lo intenta, pero podés correr manual: `gcloud auth configure-docker us-central1-docker.pkg.dev` |
| `Revision ... not ready` con log `failed to fetch secret` | Runtime SA sin `secretAccessor` | IT corre los `add-iam-policy-binding` del fin de `setup-secrets.sh` |
| OAuth login redirige a `localhost` | `NEXT_PUBLIC_SITE_URL` mal en build | Actualizar `.env.local` y re-deploy |
| Cold starts >5s | `min-instances=0` | `gcloud run services update mundial-betting --min-instances=1` (≈$5/mes extra) |
| Cron jobs fallan 401 | `CRON_SECRET` desactualizado en el header del job | Re-correr `setup-cron.sh` para que actualice los headers |

---

## 7. Costos esperados

| Recurso | Estimado/mes | Notas |
|---|---|---|
| Cloud Run | $5–15 | Autoescala, free tier cubre la mayoría |
| Artifact Registry | $1–2 | Imágenes Docker. Limpiar viejas con `gcloud artifacts versions delete` |
| Cloud Scheduler | $0 | 2 jobs, free tier hasta 3 |
| Secret Manager | $0 | <6 versiones activas |
| Cloud Logging | $0 | Bajo el free tier (~50 GB/mes) |
| **Supabase Pro** | **$25** | DB + Auth + Realtime |
| The Odds API | $0 | Free tier 500 créditos/mes |
| **Total** | **~$30–40/mes** | Hasta ~1k usuarios activos |

---

## 8. Permisos requeridos para deploy manual

Lo que Rodrigo necesita en `dm-agents` (lo tiene hoy):
- ✅ `roles/editor` (incluye build + push + deploy)
- ✅ `roles/run.admin` (deploy + update Cloud Run)
- ✅ `roles/storage.admin` (push a Artifact Registry)

Lo que falta para que `setup-secrets.sh` pueda bindear el runtime SA al secret
automáticamente (sin pedirle a IT):
- ⛔ `roles/secretmanager.admin` (sobre los 3 secrets o sobre el proyecto)

Si no lo tiene, el script genera el comando exacto para que IT lo corra una sola
vez. Después no se necesita más.

---

## 9. Si en el futuro queremos CI/CD

Cuando IT/SRE habilite los 3 roles que faltan en Rodrigo
(`projectIamAdmin` + `serviceAccountAdmin` + `workloadIdentityPoolAdmin`),
se puede:

1. Crear el WIF pool/provider con `gcloud iam workload-identity-pools create ...`.
2. Bindear `roles/iam.workloadIdentityUser` al SA `github-deployer`.
3. Agregar `.github/workflows/deploy-cloudrun.yml` (ver historial git para el template).
4. Cargar `GCP_WIF_PROVIDER` y `GCP_SA_EMAIL` como GitHub Secrets.

Mientras tanto, este runbook es lo que usamos.
