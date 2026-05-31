# Xepe Bet (mundial-betting) — Architecture & Engineering Playbook

> Versión 1.0 · Última actualización: 2026-04-25
> Stack target: **Next.js 16 (App Router) + Supabase Pro + Cloud Run (GCP `dm-agents`) + GitHub Actions CI/CD + TypeScript 5**

Este documento es la **fuente de verdad mandatoria** de cómo se piensa, se escribe y se opera este código. No reemplaza a [`CLAUDE.md`](../CLAUDE.md) (guía operativa rápida para agentes), sino que lo profundiza: decisiones, rationale, trade-offs y standards que después se auditan, miden y refactorizan.

**Si una regla acá entra en conflicto con CLAUDE.md, gana este documento y CLAUDE.md se actualiza para reflejarlo. No es opcional seguirlo — cualquier PR que viole lo de acá no se mergea.**

---

## Tabla de contenido

1. [Cómo usar este documento](#1-cómo-usar-este-documento)
2. [North Star — principios de diseño](#2-north-star--principios-de-diseño)
3. [Arquitectura por capas](#3-arquitectura-por-capas)
4. [Modelo de datos y Supabase](#4-modelo-de-datos-y-supabase)
5. [Data flow patterns](#5-data-flow-patterns)
6. [Integraciones externas](#6-integraciones-externas)
7. [Reglas de código](#7-reglas-de-código)
8. [Performance budgets](#8-performance-budgets)
9. [Escalabilidad](#9-escalabilidad)
10. [Ciberseguridad — mandatory](#10-ciberseguridad--mandatory)
11. [Deploy en Cloud Run + CI/CD GitHub Actions](#11-deploy-en-cloud-run--cicd-github-actions)
12. [Code Review — proceso estricto](#12-code-review--proceso-estricto)
13. [Definition of Done y PR checklist](#13-definition-of-done-y-pr-checklist)
14. [Sistema de documentación](#14-sistema-de-documentación)
15. [Casino & games — security and fairness](#15-casino--games--security-and-fairness)
16. [Roadmap y deuda técnica](#16-roadmap-y-deuda-técnica)
17. [Glosario](#17-glosario)

---

## 1. Cómo usar este documento

**Quién lo lee.**
- Devs nuevos al entrar al repo (lectura obligatoria antes del primer PR).
- Code reviewers cuando juzgan un PR.
- Agentes de IA (Claude, Cursor) antes de modificar arquitectura.
- Auditores de seguridad y compliance cuando hacen findings.

**Cuándo actualizarlo.**
- Cuando un ADR (Architecture Decision Record) introduce una decisión que cambia un standard de acá.
- Cuando una auditoría descubre que la realidad del código se alejó de la doc — entonces o se cierra el gap (refactor) o se actualiza la doc (la realidad ganó).
- **No** se actualiza ante cualquier cambio de código. Esto es contrato, no log.

**Cómo se relaciona con los otros docs.**
- [`CLAUDE.md`](../CLAUDE.md) — quick reference operacional.
- `docs/adr/*.md` — decisiones puntuales con su rationale.
- `docs/audits/*.md` — auditorías point-in-time.
- `docs/findings/*.md` — issues específicos encontrados.
- `docs/plans/*.md` — master plan + subfases de trabajo.

El sistema completo se describe en la [sección 14](#14-sistema-de-documentación).

---

## 2. North Star — principios de diseño

Estos no son reglas — son la brújula. Cuando una regla específica no aplica o tira para dos lados, gana el principio.

**1. La base de datos es la fuente de verdad.**
Supabase Postgres manda. Toda lógica que cambia estado vive en la DB (RLS + RPCs + constraints) o lo más cerca posible (Server Action que llama RPC). El cliente es una **vista** de la DB, no un actor con estado propio que después se "sincroniza".

**2. Server-first; cliente al margen.**
Server Components son el default. `'use client'` solo donde hay interacción (hooks, event handlers, browser APIs). Los componentes de cliente son **hojas** del árbol, no nodos intermedios.

**3. Type-safety end-to-end.**
Schema en SQL → tipos generados con Supabase CLI → consumidos en TS strict. `any` está prohibido. `unknown + guard` está bien. Si el tipado duele, es señal de que el modelo está mal, no de que TS sea molesto.

**4. Dominios autocontenidos.**
Cada feature en `features/<name>/` es un módulo cerrado. Features **no** se importan entre sí. Si dos features necesitan algo común, eso vive en `lib/` o `components/`. Eliminación de un feature debería ser borrar una carpeta.

**5. Idempotencia en escrituras costosas.**
Toda escritura que toca una API externa con cuota o que puede repetirse por retry tiene que ser idempotente. `upsert` con `onConflict`, claves externas únicas, locks transaccionales, atomic SQL functions. **Doble click no doble crédito.**

**6. Costos y latencias se presupuestan.**
LCP, Supabase queries, llamadas a APIs externas, Cloud Run invocations, créditos Odds API: todo tiene un budget explícito ([sección 8](#8-performance-budgets)). Se mide. Si se rompe, no se ignora.

**7. RLS es el perímetro de seguridad, no la UI.**
No confiamos en que el cliente "no llame al endpoint malo". Confiamos en que **la DB no le deje hacer la operación a quien no debe**. RLS habilitado en cada tabla, sin excepción. El cliente es público; la DB es la fortaleza.

**8. Errores explícitos, nunca silenciosos.**
`catch {}` está prohibido. Server Actions retornan resultados discriminados (`{ ok: true, data } | { ok: false, error }`). Si un error es no-recuperable, se loggea con contexto y se propaga.

**9. Comentarios explican *por qué*, no *qué*.**
El código dice qué hace. El comentario dice por qué ese trade-off, qué edge case está cubriendo, qué se intentó antes que no funcionó.

**10. Optimizar para escribir poco código, no para escribir poco al teclado.**
Mejor un módulo de 100 líneas claro que uno de 30 líneas críptico. Brevedad ≠ calidad.

**11. Server-authoritative para dinero virtual.**
Toda operación que mueve créditos (bets, casino, refunds) calcula montos y resultados **server-side**. Cliente solo informa la intención. RNG vive en Postgres o Server Actions.

**12. Seguridad por defecto, no por opción.**
Endpoints requieren auth por defecto. Secrets en Secret Manager, nunca en código ni env files. Validación Zod en cada borde. Audit trail en cada acción sensible.

---

## 3. Arquitectura por capas

```
┌─────────────────────────────────────────────────────────┐
│ app/         Routing — solo composición                 │
├─────────────────────────────────────────────────────────┤
│ features/    Dominios — UI + actions + queries          │
├─────────────────────────────────────────────────────────┤
│ components/  Shared UI + layout                         │
├─────────────────────────────────────────────────────────┤
│ lib/         Infra — Supabase, APIs externas, sync      │
├─────────────────────────────────────────────────────────┤
│ supabase/    Schema, migrations, RLS, RPCs              │
└─────────────────────────────────────────────────────────┘
                      ↓ (one-way deps)
```

### 3.1. Reglas de dependencia (estrictas)

- `app/` → puede importar de `features/`, `components/`, `lib/`.
- `features/<X>` → puede importar de `components/`, `lib/`. **NO** de otras features.
- `components/` → puede importar de `lib/` (utils, types). **NO** de features.
- `hooks/` → puede importar de `lib/`. **NO** de features.
- `lib/` → puede importar de sí mismo. **NO** de features ni de app.
- `supabase/` → SQL puro, no importa nada de TS.

**Violación común:** `features/bets/...` que importa algo de `features/matches/...`. Cuando pasa, ese "algo" tiene que mudarse a `lib/` o a `components/`.

### 3.2. Responsabilidades por capa

**`app/`** — routing y composición.
- Páginas son finas: cargan data en Server Components y la pasan a componentes de feature.
- **Cero lógica de negocio.** Si una página tiene un `if (user.credits < amount)` adentro, eso va al feature.
- Layouts comparten chrome (nav, footer) y proveedores (Toaster, etc.).
- `loading.tsx` y `error.tsx` en cada ruta que lo amerite.

**`features/<name>/`** — módulo de dominio.

Estructura canónica:
```
features/<name>/
├── components/      ← UI específica de este feature
├── actions.ts       ← Server Actions ('use server')
├── queries.ts       ← Server-side reads (async functions)
├── types.ts         ← Tipos del dominio
├── schema.ts        ← Zod schemas para validación
└── README.md        ← qué hace, qué no, decisiones puntuales
```

Reglas:
- Actions y queries son async functions, no clases.
- `types.ts` extiende los tipos generados de Supabase con tipos del UI/dominio.
- `schema.ts` exporta los Zod schemas Y los tipos inferidos.
- `README.md` del feature es corto pero existe.

**`components/`** — UI shared, design system local.
- Primitivos (Button, Input, Card) + layout (Header, Footer).
- **Sin lógica de dominio.** Un componente acá no debería saber qué es una "apuesta".

**`lib/`** — infraestructura.
```
lib/
├── supabase/
│   ├── client.ts        ← createBrowserClient
│   ├── server.ts        ← createServerClient
│   └── admin.ts         ← service role — USO RESTRINGIDO
├── odds-api/            ← cliente The Odds API
├── sync/                ← workers de sincronización (corren en Cron)
├── utils/               ← derived-odds, cash-out, resolve-pick-odds
├── types/               ← tipos globales + generated database types
├── auth/                ← helpers de sesión + cron auth
└── constants.ts         ← INITIAL_CREDITS, LOCK_HOURS, etc.
```

**`supabase/`** — el schema vivo.
```
supabase/
├── schema.sql                          ← schema base
├── migrations-*.sql                    ← migraciones idempotentes
├── seed-matches.sql                    ← seed data
└── README.md                           ← decisiones de schema
```

---

## 4. Modelo de datos y Supabase

### 4.1. Convenciones de schema

- **snake_case** en SQL.
- **Timestamps con timezone** (`timestamptz`), nunca `timestamp` ni `date` para eventos.
- **`created_at` y `updated_at`** en toda tabla relevante. `updated_at` mantenido con trigger.
- **Foreign keys con `on delete` explícito**. Default `restrict`; `cascade` solo donde es semánticamente correcto.
- **`uuid` como PK** por default (`gen_random_uuid()`).
- **No nulls salvo intención clara.** `not null default` es la regla.
- **CHECK constraints** para enums de status, montos no negativos, etc.

### 4.2. Tablas core actuales

| Tabla | Propósito | Relaciones clave |
|---|---|---|
| `profiles` | Extiende `auth.users` (créditos, displayName, is_admin) | 1:1 con `auth.users` |
| `teams` | Selecciones del Mundial y teams importados | — |
| `matches` | Partidos con odds, scores, external_id de Odds API | FK a `teams` |
| `predictions` | Prode | FK a `profiles`, `matches` |
| `bets` | Apuestas single | FK a `profiles`, `matches` |
| `parlays` | Combinadas (cabecera) | FK a `profiles` |
| `parlay_legs` | Selecciones del parlay | FK a `parlays`, `matches` |
| `casino_sessions` | Audit ledger de partidas casino | FK a `profiles` |
| `penalty_sessions` / `mines_sessions` / `scratch_sessions` / `felipe_sessions` | Estado server-side de juegos multi-turno | FK a `profiles` |
| `credit_transactions` | Audit trail de toda mutación de créditos | FK a `profiles` |
| `odds_api_usage` | Tracking de consumo Odds API | — |
| `activity_feed` | Muro social de eventos | FK a `profiles` |
| `trivia_*` | Sistema de trivia | FK a `profiles` |

El schema real está en `supabase/schema.sql` + migraciones. Si difieren con esta tabla, el SQL gana y este doc se actualiza.

### 4.3. RLS — la regla más importante

**Toda tabla tiene RLS habilitado. Sin excepción.** Una tabla creada sin RLS es un **bug de seguridad crítico**, no un descuido.

Patrones canónicos:

**Lectura pública** (ej: `matches`, `teams`):
```sql
create policy "matches are public" on matches for select using (true);
```

**Owner-only read/write** (ej: `bets`):
```sql
create policy "users read own bets" on bets for select using (auth.uid() = user_id);
create policy "users insert own bets" on bets for insert with check (auth.uid() = user_id);
```

**Admin-only write** (ej: `matches` modificable solo por admins):
```sql
create policy "only admins modify matches" on matches for all
using (exists (select 1 from profiles where id = auth.uid() and is_admin));
```

**Service role only** (ej: `credit_transactions`, `odds_api_usage`):
```sql
-- Sin policies de write → solo service role (bypasea RLS) puede escribir.
-- Policy de read solo para admins:
create policy "admins read audit" on credit_transactions for select
using (exists (select 1 from profiles where id = auth.uid() and is_admin));
```

**Reglas duras:**
- Nunca `using (true)` en `insert/update/delete`. Eso es deshabilitar RLS con extra pasos.
- Toda política tiene tanto `using` (qué filas se ven) como `with check` (qué filas se permiten escribir) cuando aplica.
- El **service role bypassa RLS**. Por eso vive solo en `lib/supabase/admin.ts` y se importa solo desde Server Actions / Cron handlers — nunca desde código que el cliente pueda invocar directamente.

### 4.4. RPCs vs queries directas

**Usar RPC (Postgres function)** cuando:
- La operación toca múltiples tablas y debe ser atómica.
- Hay lógica de negocio que no puede confiarse al cliente.
- Se necesita un `select for update`, transacción explícita, o atomic decrement.

**Usar query directa del cliente** cuando:
- Es una lectura simple de una tabla con RLS protegiendo.
- Es un `insert/update` single-row owner-only protegido por RLS y constraints.

Ejemplos en este proyecto:
- `deduct_credits_atomic(user_id, amount)` → **RPC** (UPDATE atómico con guard de saldo).
- `add_credits_atomic(user_id, amount)` → **RPC** (UPDATE atómico).
- Resolución de bets / parlays → **Server Action** que orquesta UPDATEs idempotentes.
- Listado de bets del user → **query directa** vía Server Component (RLS filtra por auth.uid).

### 4.5. Migrations

- Formato: `supabase/migrations-<descriptive-name>-v<N>.sql`. Versionadas explícitamente.
- **Una migración = un cambio atómico** (una tabla nueva, una columna, una policy, una function). No mezclar.
- **Idempotentes**: `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS`. Una migración debe poder correrse 2 veces sin error.
- **Up-only por default.** Si una migration sale rota a prod, se hace una nueva que arregla — no se reescribe la vieja.
- **Aplicación en prod:** vía Supabase SQL Editor o Supabase CLI. **Nunca** editar tablas a mano sin migración correspondiente. Si pasa por emergencia, se documenta en `docs/findings/`.
- **Generated types regenerados** después de cada migration: `npx supabase gen types typescript --linked > lib/types/database.ts`. Comitearlo.

### 4.6. Branded types para IDs (recomendado)

En hot paths donde es fácil mezclar IDs:

```ts
// lib/types/ids.ts
export type MatchId = string & { readonly __brand: 'MatchId' }
export type BetId   = string & { readonly __brand: 'BetId' }
export type UserId  = string & { readonly __brand: 'UserId' }
```

---

## 5. Data flow patterns

Cuatro patrones cubren el 100% de los flujos.

### 5.1. Server Component fetch — el default

```ts
// app/bets/page.tsx
import { getUserBets } from '@/features/bets/queries'

export default async function BetsPage() {
  const bets = await getUserBets()
  return <BetsList items={bets} />
}
```

- Sin estados de loading manuales — `loading.tsx` los maneja.
- Sin error handling manual — `error.tsx` los maneja.
- Tipos vienen del retorno de `getUserBets`, derivados del generated type.

### 5.2. Server Action mutation

```ts
// features/bets/actions.ts
'use server'

import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const PlaceBetSchema = z.object({
  matchId: z.string().uuid(),
  amount:  z.number().int().positive().max(MAX_BET),
  pick: z.enum(['home', 'draw', 'away']),
  odds: z.number().positive(),
})

export type PlaceBetResult =
  | { ok: true;  betId: string }
  | { ok: false; error: 'insufficient_credits' | 'locked' | 'odds_changed' | 'unknown' }

export async function placeBet(input: unknown): Promise<PlaceBetResult> {
  const parsed = PlaceBetSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'unknown' }

  // ... validate match open, validate odds server-side, deduct atomic, insert
}
```

Reglas:
- **Zod en input**, siempre, incluso si TS ya tipa — el input es `unknown` en runtime.
- **Resultado discriminado** (`ok: true | ok: false`).
- **`revalidatePath` o `revalidateTag`** después de escribir.
- **Sin throws** salvo errores no recuperables.
- **Logs estructurados** con `event` y contexto.

### 5.3. Realtime — Supabase channels

Cuándo: activity feed live, credits del user.
Cuándo NO: cualquier cosa que tolera 60s de latencia.

Reglas:
- **Cleanup obligatorio** en el return del `useEffect`.
- **Hook chiquito en componente leaf.** No subscribir desde un wrapper grande.
- **Filtrar al nivel de DB** (`filter: 'id=eq.X'`).

### 5.4. Sync workers — Cloud Scheduler + Cloud Run

Patrón:
```
app/api/cron/sync-odds/route.ts    ← handler con Bearer auth
lib/sync/odds.ts                    ← lógica reusable
Cloud Scheduler job                 ← schedule + Authorization header
```

```ts
// app/api/cron/sync-odds/route.ts
import { syncOdds } from '@/lib/sync/odds'
import { verifyCronAuth } from '@/lib/auth/cron'

export async function POST(request: Request) {
  const unauthorized = verifyCronAuth(request)
  if (unauthorized) return unauthorized

  const result = await syncOdds()
  return Response.json(result)
}
```

Reglas:
- **Idempotente**: `upsert` con `onConflict` o claves externas únicas.
- **Validar el header `Authorization: Bearer ${CRON_SECRET}`** — Cloud Scheduler lo envía como configurado.
- **Budget-aware**: contar requests a APIs externas. Si pasa del 90% del límite mensual, no ejecutar.
- **Loguear duración + filas afectadas** para detectar regresiones.

---

## 6. Integraciones externas

### 6.1. The Odds API

- **Budget**: 500 créditos/mes en plan free.
- **Estrategia**:
  - Cron diario `sync-odds` 12:00 UTC: 1 crédito por sport con matches pending.
  - Cron diario `sync-scores` 13:00 UTC: 2 créditos por sport con matches recién terminados.
  - Discover (gratis) corre dentro del cron de odds para descubrir events nuevos.
- **Cache**: en la tabla `matches` (columnas `odds_*`), TTL implícito por el sync.
- **Audit**: cada call queda en `odds_api_usage` con `credits_used` y `remaining`.
- **Failure mode**: si la API falla, **no sobreescribir** odds existentes; loggear y reintentar al próximo cron.

### 6.2. Anthropic Claude API

- **Uso**: generación del AI feed diario (cron `generate-feed`).
- **Budget**: monitor desde la consola Anthropic.
- **Prompt caching**: obligatorio para reducir costos en runs repetidos del feed.
- **Inputs sanitizados**: cualquier user-generated content que llegue al prompt va por `JSON.stringify` con escape.

### 6.3. Patrones obligatorios para cualquier integración

**Idempotency**: toda fila que viene de una API externa tiene un `external_id` con UNIQUE constraint. El upsert usa `onConflict: 'external_id'`.

**Rate limit awareness**: contador en memoria por proceso + en DB (tabla `odds_api_usage`). Si se acerca al 90% del límite mensual, el sync se salta a sí mismo con log claro.

**Validación de respuesta**: shape de la API externa validado con Zod antes de persistir.

**Logs estructurados**:
```ts
console.log(JSON.stringify({
  event: 'odds_sync_complete',
  source: 'the-odds-api',
  matches_updated: count,
  duration_ms: Date.now() - start,
  credits_remaining: remaining,
}))
```

---

## 7. Reglas de código

Estas extienden lo que ya está en CLAUDE.md.

### 7.1. TypeScript strict

`tsconfig.json` debe tener (mínimo):
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true
  }
}
```

- **`any` prohibido**. Falla en CI.
- **`unknown` + type guard** sobre `any` cuando viene de afuera.
- **`as Foo`** solo después de validar runtime (Zod, `typeof`, `in`, etc.).

### 7.2. Error handling

| Capa | Patrón de error |
|---|---|
| Server Action | Retorna `{ ok: false, error: '...' }` con tipo discriminado. |
| Server Component / RPC call | Throw → captura `error.tsx`. |
| Cron handler | Loguea, retorna 200 con `{ ok: false }` para que Scheduler no reintente loops infinitos. |
| Client hook | Devuelve `{ data, error, isLoading }` o lanza para Suspense/ErrorBoundary. |
| Adapter (lib) | Throw con error tipado. El caller decide. |

**Prohibido (falla en code review):**
- `catch {}` sin nada adentro.
- `catch (e) { /* ignore */ }`.
- `throw new Error('msg')` plano cuando hay un tipo más específico.

Si un catch silencioso es genuinamente necesario (telemetría fire-and-forget), comentar el porqué.

### 7.3. Validación con Zod

- **En todo input de Server Action**, sin excepción.
- **En toda respuesta de API externa** que se vaya a persistir.
- El schema vive en `features/<X>/schema.ts` y se exporta junto con el tipo inferido.

### 7.4. Logging

**Server side:**
```ts
console.log(JSON.stringify({ event, ...ctx, ts: new Date().toISOString() }))
```
- Un `event` por log (snake_case).
- Sin PII en producción salvo `userId` (UUID interno OK).
- `console.error` para errores; `console.warn` para degradaciones; `console.log` para eventos normales.
- Los logs llegan a **Cloud Logging** automáticamente desde Cloud Run.

**Client side:**
- En desarrollo: libre.
- En producción: solo errores (idealmente a Sentry o similar).
- **Sin `console.log` dejados** en código que va a prod. ESLint rule `no-console: ['error', { allow: ['warn', 'error'] }]` recomendada.

### 7.5. Tests

Stack recomendado (cuando se introduzca):
- **Vitest** para unit + integration.
- **React Testing Library** para componentes con interactividad.
- **Playwright** para E2E críticos.

Mínimo por feature crítico (place bet, cash out, casino):
- 1 test happy path.
- 1 test error path.
- 1 test edge case.
- 1 test de seguridad (input malicioso rechazado).

Mock al borde: `vi.mock('@/lib/supabase/server')`, **no** mockear funciones internas del feature.

### 7.6. Convenciones de archivo y estilo

- **No comments salvo *por qué***.
- **No commented-out code**. Git tiene la historia.
- **No magic numbers**. `const LOCK_HOURS_BEFORE_MATCH = 24` con nombre semántico.
- **Funciones < 50 líneas** como regla, < 100 como límite.
- **Componentes < 200 líneas**. Si crece, descomponer en sub-componentes en el mismo directorio.

### 7.7. Clean Code — principios mandatorios

Adoptados de Uncle Bob (Robert C. Martin) adaptados a TS/React/Next:

**Naming:**
- Nombres **revelan intención**. `daysSinceLastSync` > `d`. `MIN_BET` > `m`.
- **Pronunciables** y **buscables**. `userProfile` > `usrPrf`.
- **Sustantivos para clases/componentes/tipos**, **verbos para funciones**. `Button`, `placeBet`, no `Buttoning` o `bet`.
- **Sin redundancia**. `userObject` no — ya es objeto. `userInfo` no — todo es info.
- **Boolean con prefijo `is/has/can/should`**. `isLocked`, `hasOdds`, `canCashOut`.
- **Plurales en colecciones**. `bets: Bet[]`, no `betsList` ni `betArray`.

**Functions:**
- **Hacen UNA cosa**. Si en la descripción hay un "Y", refactorizar.
- **Pocos parámetros**. 0 ideal, 1-2 ok, 3 sospechoso, 4+ inaceptable — usar objeto.
- **Sin side effects ocultos**. Si una función pura cambia algo externo, el nombre debe gritarlo (`syncOdds()` ok, `getOdds()` que también escribe → bug).
- **Single Level of Abstraction**: una función no mezcla nivel alto y nivel bajo. `placeBet()` no parsea fechas inline — llama a helpers.
- **DRY pragmático**: tres casos similares antes de abstraer. Dos no son patrón.
- **Command-Query Separation**: o cambia estado o retorna data, no las dos cosas.

**Comments:**
- Comentarios buenos: por qué, edge case, link a issue/spec, TODO con contexto.
- Comentarios malos: explican el qué (renombrar la variable mejor), parafrasean el código, código comentado.
- **Si el código necesita comentario para entenderse, el código está mal escrito**.

### 7.8. SOLID adaptado a TS / React

**S — Single Responsibility**:
- Cada feature module hace UNA cosa (bets, casino, predictions).
- Cada función / componente tiene UNA razón para cambiar.
- Cada Server Action es UN flujo de negocio.

**O — Open/Closed**:
- Extensible sin modificar lo existente. Ej: agregar un sport_key nuevo a `ACTIVE_SPORT_KEYS` sin tocar el cron.
- Helpers como `resolveServerOdds` se extienden con nuevos pick types sin modificar el caller.

**L — Liskov Substitution**:
- Componentes que aceptan `User` deben aceptar cualquier subtipo correctamente.
- Tipos discriminados (`Result<T> = { ok: true; data: T } | { ok: false; error: E }`) en lugar de excepciones.

**I — Interface Segregation**:
- Props mínimos. `<MatchCard match={...} />` no `<MatchCard everything={state} />`.
- Hooks específicos: `useCredits()` y `useBalance()` separados, no `useEverything()`.

**D — Dependency Inversion**:
- Server Actions no dependen de Supabase client directo; dependen de la abstracción de `lib/supabase/server.ts`.
- Helpers como `lib/odds-api/client.ts` exponen funciones puras; los callers no conocen el detalle del fetch.

### 7.9. Functional Core, Imperative Shell

- **Core puro**: cálculos sin side effects (`calculateCashOut`, `getRoomMultiplier`, `resolveServerOdds`, `pickWinningRoomServer`).
  - Sin IO. Sin random. Sin fechas (recibir como param). Sin Supabase.
  - Testables como funciones matemáticas.
- **Shell imperativo**: orquesta IO (Server Action), llama al core, persiste resultados.

**Patrón canónico**:
```ts
// lib/utils/calc-payout.ts — CORE PURO
export function calcPayout(bet: number, odds: number): number {
  return Math.round(bet * odds * 100) / 100
}

// features/bets/actions.ts — SHELL
export async function placeBet(input: unknown) {
  // ... auth + zod + read DB
  const payout = calcPayout(amount, serverOdds)  // ← core
  // ... write DB + revalidate
}
```

### 7.10. Immutability por default

- `const` siempre. `let` solo cuando se mutará y el `for/while` lo justifica.
- Arrays/objetos: spread (`[...arr, x]`, `{...obj, k: v}`) en vez de `push`/asignación.
- `Object.freeze()` para constantes exportadas críticas.
- React state: nunca mutar, siempre setter con nueva referencia.

### 7.11. Testing — pirámide y disciplina

```
       ┌──┐         E2E (Playwright) — 5%
       │  │           flows críticos: login, place bet, cash out, casino
      ┌┴──┴┐        Integration (Vitest + Supabase real local) — 25%
      │    │           actions, queries, RPCs
   ┌──┴────┴──┐     Unit (Vitest) — 70%
   │          │        core puro: calc-payout, resolve-odds, pickWinner
   └──────────┘
```

**Reglas**:
- Todo helper del core puro tiene test unit. Es barato y previene regresiones.
- Server Actions tienen test de integración mockeando solo el cliente Supabase.
- E2E para los 5-10 flujos más críticos. No para cada feature.
- **No test = no merge** para features críticas (créditos, casino, auth).
- **Test-Driven Development** recomendado para core puro (RTP de juegos, cash out formulas).

### 7.12. Refactoring — cuándo y cómo

**Boy Scout Rule**: "Deja el código más limpio que como lo encontraste". Cada PR puede mejorar 1-2 cosas chicas relacionadas al cambio principal.

**Smell triggers** que merecen refactor en el mismo PR:
- Función > 50 líneas → extraer helpers.
- Tres parámetros del mismo grupo lógico → introducir tipo.
- Mismo patrón copiado 3 veces → extraer función.
- Condicional `if-else` profundo > 3 niveles → early returns o polimorfismo.
- Variable temporal usada una sola vez → inline.
- Nombre de variable no revela intención → renombrar.

**Refactor grande** (cambios cross-feature) → PR separado, no mezclar con bug fix o feature.

### 7.13. YAGNI — You Aren't Gonna Need It

- No agregar features "por si acaso".
- No abstraer hasta que haya tres casos concretos.
- No build-system mejoras sin necesidad medida.
- No introducir librería para algo que se hace con 20 líneas.

**Excepción legítima**: cuando el costo de no hacerlo ahora es mucho mayor que después (ej: encriptar columna sensible desde el inicio).

### 7.14. Git workflow — trunk-based development

- **`main` es siempre deployable**. Si rompe prod, revert antes que fix.
- **Branches efímeras**: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`. Viven < 3 días idealmente.
- **No `develop` branch**, no GitFlow. Trunk + feature branches cortos.
- **PRs chicos** (< 400 LOC).
- **Squash & merge**. Un commit por PR en main.
- **Conventional commits** en el squash: `feat(scope): qué`, `fix(scope): qué`, `chore`, `docs`, `refactor`, `test`, `perf`.
- **Feature flags** para esconder código no terminado en main:
  ```ts
  if (process.env.NEXT_PUBLIC_FEATURE_FELIPE_V2 === 'true') { ... }
  ```
- **No force push a main**. Nunca.
- **Co-authoring** explícito si el código fue escrito junto a otro (humano o agente):
  ```
  Co-Authored-By: Nombre <email>
  ```

### 7.15. 12-Factor App principles (cuáles aplican)

| Factor | Cómo se cumple |
|---|---|
| 1. Codebase | Un repo único `mundial-betting` → un deploy Cloud Run |
| 2. Dependencies | `package-lock.json` versionado; `npm ci` en CI |
| 3. Config | Env vars vía Secret Manager (prod) / `.env.local` (dev). Nunca en código |
| 4. Backing services | Supabase como recurso attachable (URL en env, swappable) |
| 5. Build, release, run | GitHub Actions hace build → image → release a Cloud Run. Separados |
| 6. Processes | Cloud Run es stateless. Estado en Supabase |
| 7. Port binding | Next.js standalone bindea `$PORT` (3000) |
| 8. Concurrency | Cloud Run autoescala. Concurrency=80 por instance |
| 9. Disposability | Cloud Run mata instances en cualquier momento — no asumir nada persistente en memoria |
| 10. Dev/prod parity | Stack idéntico (Next.js + Supabase). Schemas en migrations versionadas |
| 11. Logs | `console.*` → Cloud Logging automático |
| 12. Admin processes | Migrations corren manual en Supabase SQL Editor o via Supabase CLI |

### 7.16. Observability — tres pilares

**Logs** (qué pasó):
```ts
console.log(JSON.stringify({
  event: 'bet_placed',
  user_id: userId,
  match_id: matchId,
  amount,
  duration_ms: Date.now() - start,
}))
```
Estructurados, con event, contexto y duración.

**Metrics** (cuánto/cuán seguido):
- Cloud Monitoring auto-tracks: request count, latencies, error rate por revisión.
- Custom metrics futuras: `bets_placed_total`, `cash_outs_total`, `casino_rtp_observed_by_game`.

**Traces** (correlación entre componentes):
- OpenTelemetry recomendado cuando se introduzca multi-service.
- Por ahora: incluir `requestId` (`crypto.randomUUID()`) en cada Server Action y propagarlo al log.

### 7.17. Code quality metrics

Targets a vigilar (sin gate hard salvo el primero):

| Métrica | Target | Tool |
|---|---|---|
| Cyclomatic complexity por función | < 10 | ESLint plugin `complexity` |
| Cognitive complexity | < 15 | SonarJS rule |
| Cobertura de tests core puro | > 80% | Vitest coverage |
| Bundle size first load | < 90KB | next build |
| TS strict | obligatorio | tsconfig |
| ESLint errors | 0 | CI |
| Dependencies desactualizadas | mensual review | Dependabot |

### 7.18. Accesibilidad (a11y) y responsive

Standards mínimos:
- **Semantic HTML**: `<button>` para acciones, `<a>` para navegación. Nada de `<div onClick>`.
- **Labels en inputs**: `<label htmlFor>` o `aria-label`.
- **Contraste WCAG AA**: 4.5:1 para texto normal, 3:1 para texto grande.
- **Keyboard navigation**: `tab` debe alcanzar todo elemento interactivo.
- **`alt` en imágenes** (vacío `alt=""` si decorativa).
- **Focus visible**: nunca `outline: none` sin reemplazo claro.
- **Responsive**: mobile-first. Probar en ≥ 360px de ancho.

### 7.19. Internacionalización (i18n) — futuro

Por ahora app es ES-only para usuarios @xepelin.com. Si en algún momento se internacionaliza:
- Strings UI en archivos JSON por locale (`/i18n/es.json`, `/i18n/en.json`).
- Hooks `useTranslation()` server y client.
- Fechas/números con `Intl.*` API nativa.

### 7.20. Documentación como código

- **JSDoc para funciones públicas** del core puro:
  ```ts
  /**
   * Calcula el cash out de una bet usando odds originales y actuales.
   * RTP-neutral (sin house edge baked-in).
   *
   * @param oddsOriginal — odds al momento de placear
   * @param oddsCurrent — odds actuales del mismo pick
   * @param amount — monto apostado
   * @returns valor de cash out, 0 si oddsCurrent es inválido
   */
  export function calculateCashOut(...) { ... }
  ```
- **README por feature** corto pero existente.
- **Changelog opcional** (si se introduce versionado público; hoy no).

---

## 8. Performance budgets

| Métrica | Objetivo | Crítico (rompe DoD) |
|---|---|---|
| LCP (home, /bets, /casino) | < 1.5s | > 2.5s |
| TTFB (Server Component render) | < 200ms | > 500ms |
| JS first load shipped (per page) | < 90KB | > 150KB |
| Server Action latency p95 | < 300ms | > 1000ms |
| Supabase query p95 | < 100ms | > 500ms |
| External API call (Odds) | < 800ms | timeout 3000ms |
| INP (input delay) | < 200ms | > 500ms |
| Cloud Run cold start | < 2.5s | > 5s |

**Cómo se mide:**
- LCP, TTFB, INP → Lighthouse + auditorías manuales.
- JS bundle → `next build` output o `next-bundle-analyzer`.
- Server Action latency → log estructurado con `duration_ms` + Cloud Logging.
- Supabase query → Supabase Dashboard → Logs → Slow queries.
- Cloud Run cold start → Cloud Monitoring → Cloud Run dashboard.

**Qué hacer cuando se rompe:**
1. **LCP alto** → revisar imágenes (`next/image`), reducir client JS, mover componentes pesados a Server.
2. **Bundle grande** → `next-bundle-analyzer`, sospechar de libs cliente pesadas.
3. **Server Action lento** → ¿hay N+1 en la query? ¿RPC lenta?
4. **Query Supabase lenta** → `explain analyze`, agregar índice, paginar.
5. **Cold start lento** → `--min-instances=1` en Cloud Run para los críticos, evaluar instance startup time.

---

## 9. Escalabilidad

A escala 450 users internos (con picos de 80-100 concurrentes), **el cuello de botella es Supabase, no Cloud Run**. Cloud Run autoescala; Supabase requiere atención al schema, índices y al plan.

### 9.1. Indexes obligatorios

| Tabla | Index | Por qué |
|---|---|---|
| `predictions` | `(user_id, match_id) UNIQUE` | Evita doble prediction; acelera lookups. |
| `bets` | `(user_id, created_at DESC)` | Historial del usuario. |
| `bets` | `(match_id, status)` | Listado de bets activos por partido. |
| `matches` | `(starts_at)` | "próximos partidos". |
| `matches` | `(status, starts_at)` | "live now" / "upcoming". |
| `casino_sessions` | `(user_id, created_at DESC)` | Historial casino. |
| `credit_transactions` | `(user_id, created_at DESC)` | Audit lookups. |
| `odds_api_usage` | `(endpoint, created_at DESC)` | Tracking de consumo. |
| Cualquier FK | índice en la columna FK | Joins eficientes. |

### 9.2. Connection pooling

- Supabase Pro provee pgBouncer. **Usar la URL del pooler** (`*.pooler.supabase.com:6543`) en server actions / RPCs.
- **NO usar el pooler para realtime** (necesita conexión persistente; usar `db.*.supabase.co:5432`).
- Cloud Run reusa instances → pool de conexiones compartido por instancia, ~3-5 max por instance.

### 9.3. Capas de cache

| Capa | Dónde | TTL típico | Cuándo usar |
|---|---|---|---|
| L1: React `cache()` | Server Component, por request | request | Deduplicar misma query en un render. |
| L2: Next data cache | `fetch()` con `next: { revalidate }` | minutos a horas | Páginas con data semi-estática. |
| L3: Cloud Run instance memory | módulo top-level | hasta instance death | Config readonly, listas pequeñas. |
| L4: Tabla materializada | Supabase (`casino_rtp_observed`) | 1h | Data cara de regenerar. |

**Cuándo NO cachear**: data crítica de dinero (créditos del usuario). Siempre fresh.

### 9.4. Cost ceilings (Supabase Pro + GCP)

Configurar alertas:

| Servicio | Plan | Umbral de alerta |
|---|---|---|
| Cloud Run invocations | pay-per-use | > $20/mes |
| Cloud Run egress | pay-per-use | > $10/mes |
| Supabase Pro DB | 8 GB | 6 GB |
| Supabase Pro egress | 250 GB/mes | 175 GB |
| Supabase Pro Realtime | 500 concurrent | 350 |
| The Odds API | 500 créditos/mes | 350 |
| Anthropic API | budget mensual | 80% del budget |

---

## 10. Ciberseguridad — mandatory

Esta sección es la **más estricta** del documento. Cualquier PR que viole un punto aquí no se mergea.

### 10.1. Capas de defensa

```
1. Cloud Run infra        ← DDoS via Google Frontend, IAM
2. Auth (Supabase + Google OAuth restringido @xepelin.com)
3. RLS                    ← perímetro primario en DB
4. Server Actions         ← validación Zod + requireAuth/requireAdmin
5. Business logic         ← reglas de dominio (locks, créditos atómicos)
6. Audit trail            ← credit_transactions + activity_feed
```

### 10.2. RLS — checklist por tabla

Para cada tabla en `supabase/schema.sql` y migrations:
- [ ] `alter table <X> enable row level security` aplicado.
- [ ] Policy de `select` explícita (auth.uid o pública con razón documentada).
- [ ] Policy de `insert` con `with check (auth.uid() = user_id)` o equivalente.
- [ ] Policy de `update` y `delete` owner-only o admin-only.
- [ ] Si hay bypass de service role, el caller está documentado.

**Test de RLS recomendado**: una suite que se conecta con anon key y prueba que las queries cross-user fallan.

### 10.3. Service role boundary

- **Vive solo en** `lib/supabase/admin.ts`.
- **Se importa solo desde**: Server Actions específicas, Cron handlers, scripts CLI.
- **NUNCA en componente con `'use client'`**, nunca en una API route accesible sin auth-guard.

Auditoría periódica:
```sh
grep -rn "supabase/admin" app/ features/ components/ hooks/
# debería listar solo lugares esperados; cualquier nuevo uso requiere review explícita
```

### 10.4. Server-side validation OBLIGATORIA

**Toda Server Action**:
1. `requireAuth()` o `requireAdmin()` al principio.
2. Zod `safeParse` del input.
3. Validación contra DB (no confiar en valores derivados del cliente):
   - Odds: `resolveServerOdds(match, pick)` y comparar contra `input.odds` con tolerancia.
   - Amounts: validar `MIN_BET <= amount <= MAX_BET`.
   - IDs: validar que pertenecen al user (no se puede operar sobre recursos ajenos).
4. Atomic SQL functions para mutaciones críticas (`deduct_credits_atomic`, `add_credits_atomic`).
5. Guards de status en UPDATEs idempotentes: `.eq('status', 'pending')`.

**Toda API route que recibe POST/PUT**:
- Verificar auth (`createServerClient().auth.getUser()`).
- Validar input con Zod.
- Crons: verificar `Authorization: Bearer ${CRON_SECRET}` via `verifyCronAuth`.

### 10.5. Env var hygiene

- Variables `NEXT_PUBLIC_*` quedan **bakeadas en el bundle del cliente**. Nunca poner secretos ahí.
- Variables server-only se acceden solo desde código que corre en server.
- **No commitear `.env*`**. `.gitignore` lo cubre; si por accidente entra a git, **rotar todos los secretos inmediatamente**.
- **Secrets en producción**: GCP Secret Manager (referenciados desde Cloud Run via `--set-secrets`).
- **Secrets en CI**: GitHub Repository Secrets (referenciados desde Workflow).

### 10.6. Audit trail — `credit_transactions`

**Toda mutación de créditos pasa por `deductCredits` o `addCredits`** en `lib/credits.ts`, que llaman a las RPCs atómicas Y escriben a `credit_transactions`. La integridad del audit depende de esto.

Reglas duras:
- `deductCredits`/`addCredits` validan `amount > 0` al entrar (protege contra signo negativo).
- `reference_id` apunta al `bet_id` / `parlay_id` / `session_id` que motivó la mutación.
- `description` explica el motivo legible.
- Sumar `amount` por user reconstruye el balance.

### 10.7. Authentication

- **Supabase Auth via `@supabase/ssr`** con Google OAuth restringido a `@xepelin.com`.
- **Domain whitelist server-side**: el callback `app/api/auth/callback/route.ts` valida `email.endsWith('@xepelin.com')` después del exchange. Si no matchea, `signOut` + redirect.
- **Open redirect prevention**: el `next` param se sanitiza (rechazar `//`, `http`, paths no relativos).
- **Sesión refresh automático** vía `proxy.ts` (Next 16 rename de middleware.ts).

### 10.8. Casino & games específicos

Ver [sección 15](#15-casino--games--security-and-fairness). Cada juego respeta:
- RNG server-side.
- Sesiones persistentes con guard atómico `.eq('status', 'active')`.
- Validación de chips/bets contra catálogo del server.
- Rollback de créditos si la sesión no se crea.

### 10.9. Vulnerabilidades cerradas (no reintroducir)

Estas son explotaciones reales que se cerraron en commits previos. Si en algún PR aparece un patrón parecido, **rechazar y referenciar acá**:

| Bug | Patrón a evitar | Donde se cerró |
|---|---|---|
| Trivia bypass | `is_correct` del cliente usado para sumar créditos | [features/trivia/actions.ts](/Users/rodrigo.botello/Botello/mundial-betting/features/trivia/actions.ts) |
| Endpoints públicos `/api/test/*` | Routes que usan `createAdminClient()` sin auth | borrados |
| Credits race | `SELECT credits + UPDATE` no atómico | [lib/credits.ts](/Users/rodrigo.botello/Botello/mundial-betting/lib/credits.ts) usa RPC atómica |
| Cash out doble | UPDATE sin verificar rowCount antes de `addCredits` | guard `.maybeSingle()` + check |
| Slots bet=0 | Server confía en `bet` del cliente sin validar rango | costo fijo + validación |
| Odds infladas | Server usa `input.odds` para calcular payout | server-side `resolveServerOdds` con tolerancia |
| OAuth bypass | Callback no valida dominio email server-side | whitelist `@xepelin.com` |
| Open redirect | `next` param redirige a URLs externas | sanitize |

### 10.10. Checklist de seguridad pre-deploy

Antes de cada release:
- [ ] No hay nuevos endpoints públicos sin auth.
- [ ] Nuevas Server Actions tienen Zod + requireAuth/requireAdmin.
- [ ] Nuevas tablas tienen RLS habilitado y policies revisadas.
- [ ] Nuevas migrations son idempotentes y revisadas en SQL editor.
- [ ] Sin `console.log` con secrets / PII.
- [ ] Sin uso nuevo de `createAdminClient` sin justificación.
- [ ] `grep -rn "any" features/ lib/ app/` no muestra nuevos casos.
- [ ] Auditoría del workflow: `permissions` mínimas, no `secrets` filtrados a logs.

---

## 11. Deploy en Cloud Run + CI/CD GitHub Actions

### 11.1. Infraestructura GCP

- **Project**: `dm-agents`
- **Region**: `us-central1`
- **Servicios usados**:
  - **Cloud Run** — compute (Next.js standalone container).
  - **Artifact Registry** (`mundial-betting`) — docker images.
  - **Secret Manager** — secrets de runtime.
  - **Cloud Scheduler** — cron jobs.
  - **IAM + Workload Identity Federation** — auth para GitHub Actions sin keys.

### 11.2. Cloud Run service config

| Setting | Value | Por qué |
|---|---|---|
| Image | `us-central1-docker.pkg.dev/dm-agents/mundial-betting/mundial-betting:<sha>` | Versionado por commit |
| Region | `us-central1` | Más servicios disponibles, menor costo |
| Port | 3000 | Next.js standalone default |
| Memory | 1Gi | Suficiente para Next.js + SSR |
| CPU | 1 | Suficiente para ~80 concurrent |
| Min instances | 0 (dev), 1 (prod) | Min=1 evita cold starts en prod |
| Max instances | 10 | Tope de seguridad para budget |
| Concurrency | 80 | Default razonable de Next.js |
| Timeout | 60s | Suficiente para crons + actions |
| Allow unauthenticated | sí | App pública, auth a nivel app |

### 11.3. Env vars en Cloud Run

Configurar via `--set-env-vars` (públicas) y `--set-secrets` (secretas):

**Public (build args + runtime):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (URL del Cloud Run service)
- `NEXT_PUBLIC_SPORT_KEY`
- `NODE_ENV=production`
- `TZ=America/Santiago`

**Secret (Secret Manager refs):**
- `SUPABASE_SERVICE_ROLE_KEY` ← `supabase-service-role-key:latest`
- `THE_ODDS_API_KEY` ← `the-odds-api-key:latest`
- `CRON_SECRET` ← `cron-secret:latest`
- `ANTHROPIC_API_KEY` ← `anthropic-api-key:latest` (cuando aplique)

### 11.4. CI/CD via GitHub Actions

`.github/workflows/deploy-cloudrun.yml` ejecuta en cada `push` a `main`:

```
1. Checkout
2. Auth a GCP via Workload Identity Federation (sin keys)
3. Configure Docker para Artifact Registry
4. Build Docker image con build args (NEXT_PUBLIC_*)
5. Push image a Artifact Registry (tag: short-sha + latest)
6. Deploy a Cloud Run con --set-env-vars + --set-secrets
7. Output del URL final
```

Reglas:
- **Workload Identity Federation**, no service account keys.
- **Permissions mínimas**: `contents: read`, `id-token: write`.
- **Timeout 20min** — si no terminó, mata el job.
- **Secrets en GitHub Repository Secrets**, jamás en código del workflow.

GitHub Secrets requeridos:
- `GCP_WIF_PROVIDER` (formato `projects/NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER`)
- `GCP_SA_EMAIL` (`github-deployer@dm-agents.iam.gserviceaccount.com`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

### 11.5. Cloud Scheduler — Cron jobs

3 jobs configurados (uno por tarea de sync):

```
sync-odds:    0 12 * * *   POST <SERVICE_URL>/api/cron/sync-odds
sync-scores:  0 13 * * *   POST <SERVICE_URL>/api/cron/sync-scores
generate-feed: 0 14 * * *  POST <SERVICE_URL>/api/cron/generate-feed
```

Cada job envía `Authorization: Bearer ${CRON_SECRET}` header.

Setup vía `scripts/setup-cron.sh`.

### 11.6. Workload Identity Federation (one-time setup)

Comandos one-time (corre tú con tu auth `gcloud`):

```bash
# 1. Crear pool
gcloud iam workload-identity-pools create github-pool \
  --location=global --project=dm-agents

# 2. Crear provider para GitHub
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --workload-identity-pool=github-pool \
  --location=global --project=dm-agents \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='Rbotello100/mundial-betting'"

# 3. Service account para deploys
gcloud iam service-accounts create github-deployer --project=dm-agents

# 4. IAM bindings
gcloud projects add-iam-policy-binding dm-agents \
  --member="serviceAccount:github-deployer@dm-agents.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding dm-agents \
  --member="serviceAccount:github-deployer@dm-agents.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding dm-agents \
  --member="serviceAccount:github-deployer@dm-agents.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# 5. Permitir al GitHub repo asumir el SA
PROJECT_NUMBER=$(gcloud projects describe dm-agents --format='value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding \
  github-deployer@dm-agents.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/Rbotello100/mundial-betting"
```

### 11.7. Observability

| Capa | Herramienta |
|---|---|
| Logs (server, build, cron) | Cloud Logging (vinculado a Cloud Run service) |
| Metrics (CPU, memory, latency) | Cloud Monitoring |
| Errors front+back | Sentry recomendado cuando crezca |
| DB queries, slow log | Supabase Dashboard → Logs |
| Uptime | UptimeRobot apuntando a `/api/health` |

Endpoint `/api/health` requerido:
```ts
// app/api/health/route.ts
export async function GET() {
  return Response.json({ ok: true, ts: new Date().toISOString() })
}
```

### 11.8. Rollback

Cloud Run mantiene revisiones inmutables. Rollback en 30s:
```bash
# Listar revisiones
gcloud run revisions list --service=mundial-betting --region=us-central1

# Promote revisión anterior al 100% del tráfico
gcloud run services update-traffic mundial-betting \
  --region=us-central1 \
  --to-revisions=mundial-betting-00042-abc=100
```

Si el rollback involucra schema de DB, **revertir migrations primero** (manual; no hay auto-revert seguro en DB).

### 11.9. DNS y custom domain (cuando aplique)

Cloud Run permite mapear custom domain (ej. `xepebet.xepelin.com`):
1. Verificar el domain en Search Console (con cuenta que controla DNS).
2. `gcloud run domain-mappings create --service=mundial-betting --domain=xepebet.xepelin.com --region=us-central1`
3. Agregar el CNAME que devuelve el comando al DNS de Xepelin.
4. Esperar provisión del certificado SSL (15-60 min).
5. Actualizar `NEXT_PUBLIC_SITE_URL` y OAuth redirect en Supabase Auth.

---

## 12. Code Review — proceso estricto

Cada PR pasa por **al menos 1 reviewer** además del autor. Sin excepción para cambios productivos.

### 12.1. Roles

- **Author**: abre el PR, responde feedback, hace squash al mergear.
- **Reviewer primario**: revisa código, tests, doc. Aprueba o pide cambios.
- **Reviewer de seguridad** (cuando el PR toca créditos, RLS, auth, casino): revisa específicamente la superficie de ataque.

### 12.2. Tamaño de PR

- **Ideal**: < 400 líneas changed.
- **Aceptable**: 400-800 líneas con buena descripción.
- **Rechazar y pedir split**: > 800 líneas, salvo refactor mecánico documentado.

### 12.3. Lo que SIEMPRE se revisa

1. **`features/<X>/actions.ts`** y **`lib/sync/*.ts`** — superficie crítica. Lectura línea por línea.
2. **Nuevas tablas o columnas** — RLS, índices, FK on-delete.
3. **Nuevas RPCs** — `security definer` + `set search_path`, idempotency, advisory locks si aplica.
4. **Cambios a `lib/credits.ts`** o **`lib/auth/*`** — bloqueante hasta aprobación explícita del owner.
5. **Workflow files `.github/workflows/*`** — permissions, secrets handling.
6. **Cambios a `Dockerfile`** o **`next.config.ts`** — afectan el deploy.

### 12.4. Checklist obligatorio del reviewer

Pegar como comentario en el PR antes de aprobar:

```markdown
**Code Review Checklist**

- [ ] Tipos limpios (`npx tsc --noEmit`), sin `any`.
- [ ] Lint limpio.
- [ ] Tests pasan (si existen).
- [ ] **Seguridad**:
  - [ ] Server Actions tienen `requireAuth`/`requireAdmin` al inicio.
  - [ ] Zod valida todo input externo.
  - [ ] Sin `console.log` con PII / secrets.
  - [ ] Sin uso nuevo no justificado de `createAdminClient()`.
  - [ ] RLS habilitado en nuevas tablas, policies revisadas.
  - [ ] Si toca créditos: usa `deductCredits`/`addCredits`, no UPDATE directo.
  - [ ] Si toca odds: re-calcula server-side, no confía en `input.odds`.
  - [ ] Si toca casino: respeta los patrones de la sección 15.
- [ ] **Performance**:
  - [ ] No introduce queries N+1.
  - [ ] Índices presentes para nuevas queries comunes.
  - [ ] Sin código pesado en client cuando puede ser Server Component.
- [ ] **Arquitectura**:
  - [ ] Respeta las reglas de dependencia (sección 3.1).
  - [ ] Features no se importan entre sí.
  - [ ] Service role solo en lugares autorizados.
- [ ] **Docs**:
  - [ ] PR description responde "qué", "por qué", "qué riesgo".
  - [ ] README del feature actualizado si cambió.
  - [ ] Migration nueva documentada en el commit.
```

### 12.5. Cómo se aprueba

- **Approve** solo si el checklist completo está chequeado.
- **Request changes** si hay puntos rojos. Comentar línea por línea con `sugerencia` cuando aplique.
- **Comment** para nits opcionales.

### 12.6. Cómo se mergea

- **Squash & merge** es el default. Un commit por PR en `main`.
- **Mensaje del squash** sigue el patrón conventional commits: `feat(scope): qué cambia`.
- **Sin merge commits** en `main` salvo emergencia con `git revert`.
- **Branch se borra** post-merge.

### 12.7. Hot-fix workflow

Para bug de prod crítico:
1. Branch desde `main`: `hotfix/<slug>`.
2. PR con `[URGENT]` en el título.
3. Reviewer responde en <30 min o se busca otro.
4. Post-merge: ADR explicando el bug + fix + test que previene regresión.

---

## 13. Definition of Done y PR checklist

### 13.1. Definition of Done (por feature)

- [ ] **Tipos**: `npx tsc --noEmit` sin errores. Sin `any`.
- [ ] **Lint**: `npx eslint .` sin errores ni warnings nuevos.
- [ ] **RLS verificado**: probado con anon key que las queries cross-user fallan.
- [ ] **Server Actions** validan con Zod y retornan `{ ok, ... }` discriminado.
- [ ] **Errores no silenciados** (sin `catch {}`).
- [ ] **Loading + error states**: `loading.tsx` y `error.tsx` donde apliquen.
- [ ] **Mobile responsive**: probado en ≥ 360px de ancho.
- [ ] **Lighthouse**: LCP < 2.5s en preview.
- [ ] **Generated types** regenerados si la migración tocó el schema.
- [ ] **Doc del feature** en `features/<name>/README.md`.
- [ ] **Performance budget** ([sección 8](#8-performance-budgets)) respetado.
- [ ] **Audit trail** presente si toca créditos.

### 13.2. PR checklist (para el author)

- [ ] Título descriptivo: `feat(ámbito): qué cambia` / `fix(...)` / `chore(...)` / `docs(...)`.
- [ ] Descripción responde: **qué cambia**, **por qué**, **qué riesgos hay**.
- [ ] Migration de Supabase incluida si toca schema.
- [ ] Env vars nuevas documentadas en CLAUDE.md y agregadas a Cloud Run + GitHub Secrets si aplica.
- [ ] Cambios visuales probados en preview (link en la descripción).
- [ ] Si el cambio es destructivo (drop column, breaking RLS), aprobación explícita del owner.
- [ ] Commits en español describiendo qué y por qué (Co-Authored-By si aplica).
- [ ] Si hay tests, pasan en CI.
- [ ] Si hay un finding o ADR asociado, linkearlo.

---

## 14. Sistema de documentación

```
docs/
├── ARCHITECTURE.md           ← este archivo (standards mandatorios)
├── README.md                 ← índice de docs vivos
├── adr/                      ← Architecture Decision Records
├── audits/                   ← auditorías point-in-time
├── findings/                 ← issues específicos
└── plans/                    ← master plan + subfases
```

### 14.1. Reglas del sistema

1. **Fecha en el nombre o header** (`YYYY-MM-DD`) para audit, finding y plan.
2. **ADRs son inmutables** — si cambia la decisión, se crea ADR nuevo con `Supersedes: ADR-XXXX`.
3. **Audits y Findings tienen status**: `open → triaged → in-progress → fixed | wontfix`.
4. **Plans se actualizan** mientras están en curso; al cerrar una fase, marcarla `done`.
5. **`docs/README.md`** mantiene índice de docs vivos y su status.

### 14.2. Templates

Los templates de ADR / Audit / Finding / Plan están definidos en `docs/README.md` y se replican del patrón establecido en otros proyectos Xepelin (sii-scrapper, mundialbetting_v2).

---

## 15. Casino & games — security and fairness

Esta sección cubre los standards específicos para los juegos bajo `/casino`. Las reglas generales del documento siguen aplicando; lo de acá las extiende.

### 15.1. Principio rector

**Server-authoritative. Punto.** Toda la lógica de juego (RNG, payout, transiciones de estado) vive en Postgres (RPCs) o en Server Actions. El cliente solo:

1. Manda input validado.
2. Recibe el resultado ya determinado.
3. Anima/dibuja ese resultado.

Si una decisión de diseño implica "el cliente calcula X y lo manda al server", está mal. **Sin excepciones**.

### 15.2. Anatomía de una jugada

```
Cliente → Server Action → (RPC opcional) → DB
  │           │                              │
  │           ├─ requireAuth                  │
  │           ├─ Zod validate                 │
  │           ├─ rate limit check             │
  │           ├─ deductCredits atomic         │
  │           ├─ RNG server-side              │
  │           ├─ outcome + payout calc        │
  │           ├─ UPDATE session atomic        │
  │           └─ addCredits atomic            │
  │←─ resultado ya determinado                │
  └─ animar
```

### 15.3. Sesiones persistentes (multi-turno)

Juegos multi-turno (mines, penalty, scratch, felipe) tienen tabla `<game>_sessions` con:
- `user_id` FK
- `bet_amount`
- estado server-side (positions, cells, etc.)
- `status` con CHECK constraint
- `created_at`, `updated_at`

**Guard atómico obligatorio** en cada UPDATE de status: `.eq('status', 'active')`. Si el rowCount es 0, la operación se rechaza (otro request ganó la carrera o ya cerró).

### 15.4. RNG

- `Math.random()` en Node.js (suficiente para créditos virtuales).
- Para crypto-grade: `crypto.randomBytes(n)` o `crypto.randomInt(...)`.
- **Nunca aceptar un seed desde el cliente**.
- El seed no se expone al cliente bajo ninguna circunstancia.

### 15.5. RTP visible y monitoreable

Cada juego tiene un RTP **teórico** documentado:

| Juego | RTP teórico | Notas |
|---|---|---|
| Slots | ~88% | Fixed $10, paytable |
| Mines | 97% | Fórmula Stake estándar |
| Scratch | ~75% pago | Fixed $15 |
| Penales | variable | Depende del player |
| Felipe | 95% | `multiplier = 0.95 / prob` |

### 15.6. Free play mechanic

- 1 jugada gratis por día por juego, por user.
- Calculado con `(now() at time zone 'utc')::date`.
- Implementado vía consulta a `activity_feed` por simplicidad (o tabla `daily_free_plays` cuando se justifique).
- Free play tiene mismo upside que paga; solo cambia el cost.

### 15.7. Rate limiting

A nivel Server Action, antes de invocar RPC/lógica:
- Máximo **20 jugadas / minuto** por (user, game).
- Implementación pendiente: tabla `casino_rate_limits` con upsert.
- Excedido → `{ ok: false, error: 'rate_limited' }`.

### 15.8. Validación de input (anti-injection)

Toda Server Action de casino valida con Zod **antes** de la lógica:

```ts
export const FelipeBetSchema = z.object({
  bets: z.array(z.object({
    room_id: z.string(),
    amount: z.union([z.literal(50), z.literal(100), z.literal(250), z.literal(500)]),
  })).min(1).max(24),
})
```

### 15.9. RLS

- Tablas `<game>_sessions` con RLS on, policy de select `using (user_id = auth.uid())`.
- **Sin** policies de insert/update — solo las Server Actions (con service role) escriben.

### 15.10. UI — Cliente como "tonto"

El componente cliente:
1. Genera ids locales (sessionId proviene del server).
2. Llama a la Server Action con el input.
3. Recibe el resultado determinado.
4. Anima el outcome.
5. Actualiza UI con balance nuevo.

**Lo que el cliente NO hace nunca:**
- Calcular si ganó/perdió antes de oír al server.
- Mostrar "ganaste!" antes de la response.
- Determinar payout localmente.
- Decidir si la jugada del día es free.
- Tener una copia de la lógica del juego.

### 15.11. Errores discriminados

Server Actions retornan:
```ts
type CasinoResult =
  | { ok: true; round_id: string; payout: number; outcome: unknown; balance_after: number; was_free: boolean }
  | { ok: false; error:
      | 'unauthenticated'
      | 'invalid_input'
      | 'insufficient_credits'
      | 'rate_limited'
      | 'session_closed'
      | 'unknown' }
```

### 15.12. Checklist por juego nuevo

Además del [DoD general](#13-definition-of-done-y-pr-checklist):
- [ ] Tabla `<game>_sessions` con RLS, CHECK de status, índices.
- [ ] Server Actions con `requireAuth` + Zod + atomic credits + guards.
- [ ] RNG server-side.
- [ ] RTP teórico documentado en este doc.
- [ ] Free play mechanic verificada (2 jugadas seguidas → la 2da cobra stake).
- [ ] Idempotency verificada: doble-click no genera doble ronda.
- [ ] Rate limit verificado.
- [ ] RLS verificada: query anon a `<game>_sessions` de otro user → 0 filas.
- [ ] Server Action testea cada path de error.

---

## 16. Roadmap y deuda técnica

| Área | Tipo | Status |
|---|---|---|
| Migración Vercel → Cloud Run | Plan | en ejecución |
| Supabase Free → Pro | Plan | pending |
| CI/CD GitHub Actions → Cloud Run | Plan | en ejecución |
| Audit log de eventos sensibles | Plan | parcial (credit_transactions ya existe) |
| Tests automáticos (Vitest + Playwright) | Plan | pending |
| Rate limiting casino | Plan | pending |
| Generador de knockouts Mundial (post-grupos) | Plan | pending (junio 2026) |
| Vista materializada RTP casino | Plan | pending |
| Sentry para error tracking | Plan | pending |
| Replace Supabase Realtime con SSE (si compliance lo pide) | Plan | not now |

---

## 17. Glosario

- **App Router**: routing de Next.js 13+ basado en `app/`.
- **Server Component**: componente que renderiza en server, no envía JS al cliente.
- **Server Action**: función async marcada `'use server'`, invocable desde el cliente.
- **RLS** (Row Level Security): filtra filas según el usuario que ejecuta la query.
- **RPC**: función SQL/plpgsql en Supabase, invocable via `supabase.rpc('name', params)`.
- **ISR** (Incremental Static Regeneration): páginas estáticas que se regeneran en intervalos.
- **`proxy.ts`**: archivo de "middleware" en Next.js 16 (renombrado).
- **Branded type**: técnica TS para distinguir tipos primitivos.
- **ADR** (Architecture Decision Record): documento corto con decisión + rationale.
- **DoD** (Definition of Done): checklist para feature terminado.
- **WIF** (Workload Identity Federation): mecanismo de GCP para auth sin keys de service account.
- **RTP** (Return To Player): porcentaje teórico de devolución de un juego de casino.
- **Atomic credit**: mutación de créditos via Postgres function que garantiza row lock + check de saldo en una sentencia.

---

**Fin del documento.**

Si encontrás algo que contradice la realidad del código, abrí un finding en `docs/findings/` y, si es un cambio de standard, un ADR en `docs/adr/`. **No modificar este archivo sin ADR asociado.**
