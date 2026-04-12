@AGENTS.md

# Mundial Betting

App de prode/quiniela + casa de apuestas para el Mundial 2026.
Hackathon World Cup Xepelin 2026.

## Stack (versiones exactas)

- **Next.js 16.2.3** (App Router, Turbopack default)
- **React 19.2.4** (useActionState, NOT useFormState)
- **Supabase JS 2.103.0** + @supabase/ssr (auth, DB, realtime)
- **Tailwind CSS 4** (@import "tailwindcss", @theme inline -- NO tailwind.config.ts)
- **TypeScript 5**, ESLint 9 (flat config)
- **Deploy: Cloud Run (GCP)** con Docker (output: standalone)

## Next.js 16 Breaking Changes (MUST follow)

- `middleware.ts` is RENAMED to `proxy.ts`, export function `proxy` (not `middleware`)
- All request APIs (`cookies()`, `headers()`, `params`, `searchParams`) MUST be awaited
- `next lint` removed -- run `npx eslint .` directly
- `fetch()` is NOT cached by default
- Turbopack is default bundler
- Read docs at `node_modules/next/dist/docs/` before using any unfamiliar API

## Commands

- `npm run dev` -- start dev server (Turbopack)
- `npm run build` -- production build
- `npm start` -- production server
- `npx eslint .` -- lint
- `npx tsc --noEmit` -- type-check
- `docker build -t mundial-betting .` -- build Docker image

## Required Environment Variables

```env
# Public (exposed to client)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Private (server only, in Secret Manager on Cloud Run)
SUPABASE_SERVICE_ROLE_KEY=
THE_ODDS_API_KEY=
API_FOOTBALL_KEY=

# Cloud Run
PORT=3000
HOSTNAME=0.0.0.0
```

## Code Conventions

### Language
- UI text in Spanish (es). Code (variables, comments) in English.

### Naming
- Components: PascalCase (`MatchCard.tsx`)
- Hooks: camelCase with `use` prefix (`useMatches.ts`)
- Server actions: camelCase verbs (`placeBet.ts`)
- Types: PascalCase, no `I` prefix (`Match`, `Bet`, `Profile`)
- Constants: SCREAMING_SNAKE_CASE (`INITIAL_CREDITS`)

### Server vs Client
- Default to Server Components (no directive needed)
- Add `'use client'` ONLY for hooks, event handlers, browser APIs
- Keep client components as leaf nodes
- Server Actions in dedicated files with `'use server'` at top

### Imports
- Use `@/` path alias for all imports
- Never use relative imports going up more than one level
- Order: React/Next -> external libs -> @/ internal -> relative -> types

### Data Fetching
- Server Components: `await createServerClient()` from `@/lib/supabase/server`
- Client Components: `createBrowserClient()` from `@/lib/supabase/client`
- Mutations: Server Actions only (no API routes for writes)

## Architecture

```
app/           -- Routing layer (thin, composition only)
lib/           -- Infrastructure (supabase, APIs, sync, types, utils)
features/      -- Domain modules (predictions, matches, bets, trivia, etc.)
components/    -- Shared UI primitives + layout
hooks/         -- Shared hooks
```

Each feature module is self-contained:
```
features/{name}/
  components/  -- UI for this feature
  actions.ts   -- Server Actions (mutations)
  queries.ts   -- Data fetching
  types.ts     -- Feature-specific types
```

## Business Rules

- Predictions lock 24h before match (`starts_at > now() + 24h`)
- Bets close 1h before match (`starts_at > now() + 1h`)
- Cash out available until 1h before match
- No live betting -- all bets are pre-match
- Cash out formula: `(odds_original / odds_current) * amount`
- Initial credits: 1000 per user
- Scoring: 3 pts correct winner, 5 pts exact score (configurable by admin)

## APIs

- **The Odds API**: odds + scores. Sync 3h before matches, every 1h. 500 req/month budget.
- **API-Football**: fixtures, live scores, standings, goalscorers. 100 req/day free tier.
- For dev/testing: use Premier League (`soccer_epl` / `league=39`). Production: World Cup (`soccer_fifa_world_cup` / `league=1`).

## Prohibited Patterns

- `style={{ }}` inline styles -- use Tailwind
- `tailwind.config.ts` -- Tailwind 4 uses `@theme inline` in globals.css
- `middleware.ts` -- file is called `proxy.ts` in Next.js 16
- `useFormState` -- replaced by `useActionState` in React 19
- Untyped Supabase queries -- always use generated types
- `console.log` in production code
- API routes for mutations (use Server Actions)
- `any` types
- Relative imports crossing directories (`../../`)
