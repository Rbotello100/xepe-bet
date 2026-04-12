# features/ -- Domain Layer

Cada feature es un modulo autocontenido con su propio data layer, mutation layer y presentacion.

## Modulos

```
features/
  predictions/    CORE: Sistema de prode (predicciones + puntos)
  matches/        Partidos, odds, filtros por grupo
  bets/           Apuestas con creditos, cash out, parlay
  leaderboard/    Ranking de usuarios, podio top 3
  trivia/         Trivia diaria para ganar creditos
  feed/           Activity feed IA en tiempo real
  auth/           Login Google OAuth, perfiles
  admin/          Panel admin (resolver partidos, sync, config)
```

## Estructura interna de cada modulo

```
features/{nombre}/
  components/     Componentes React del modulo
  actions.ts      Server Actions (mutaciones con 'use server')
  queries.ts      Data fetching (reads)
  types.ts        Tipos especificos del modulo
```

## Reglas

- Un modulo puede importar de `lib/` y `components/` pero NO de otro feature
- Server Actions validan auth y usan admin client para writes
- Queries usan server client (respetan RLS para reads)
