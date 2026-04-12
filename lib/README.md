# lib/ -- Infrastructure Layer

Modulos de infraestructura compartidos por toda la app.

## Estructura

```
lib/
  supabase/         Clientes tipados para Supabase
    server.ts       Server components (usa cookies, await required)
    client.ts       Client components (singleton browser)
    admin.ts        Service role (bypasses RLS, server only)

  odds-api/         Integracion The Odds API
    client.ts       fetchOdds(), fetchEvents(), fetchScores()
    types.ts        Tipos de respuesta de la API

  football-api/     Integracion API-Football
    client.ts       fetchFixtures(), fetchLiveScores(), fetchStandings()
    types.ts        Tipos de respuesta

  sync/             Logica de sincronizacion de datos
    odds.ts         Sync odds desde The Odds API -> Supabase
    scores.ts       Sync scores desde API-Football -> Supabase
    scheduler.ts    Logica de ventana temporal (3h antes de partidos)

  types/            Tipos del dominio (Match, Team, Bet, Profile, etc)
  utils/            Utilidades puras (format, cash-out calc)
  constants.ts      Constantes de negocio (creditos, limites, locks)
  auth.ts           Helpers de autenticacion (requireAuth, getOptionalAuth)
```

## Patron

- `createServerClient()` para leer datos en server components
- `createAdminClient()` para escribir datos en server actions (bypasses RLS)
- `createBrowserClient()` para client components (realtime, interacciones)
