# app/ -- Routing Layer

Next.js 16 App Router. Cada archivo es thin (solo composicion, sin logica de negocio).

## Rutas

```
/                   Partidos agrupados por grupo (A-L)
/login              Login con Google OAuth
/match/[id]         Detalle de partido: prediccion + mercados + apostar + parlay
/predictions        Mis predicciones
/bets               Mis apuestas (simples + parlays)
/parlay             Constructor de parlay
/trivia             Trivia diaria
/leaderboard        Ranking con podio
/dashboard          Perfil: creditos, puntos, rank, feed IA
/admin              Panel admin (resolver partidos, sync, trivia, scoring)
/admin/test         Panel de testing (solo admins designados)

/api/auth/callback          OAuth callback
/api/cron/sync-odds         Cron: sync odds desde The Odds API
/api/cron/sync-scores       Cron: sync scores desde API-Football
/api/test/odds-events       Test: verificar conexion Odds API
/api/test/football-status   Test: verificar conexion API-Football
/api/test/import-league     Test: importar partidos de liga activa
```

## Next.js 16 Gotchas

- `proxy.ts` en vez de `middleware.ts`
- `params` y `cookies()` deben ser awaited
- `next lint` no existe, usar `npx eslint .`
