# supabase/ -- Database Scripts

SQL scripts para ejecutar en el SQL Editor de Supabase.

## Archivos

```
schema.sql          Schema completo: tablas, triggers, RLS, realtime, seed inicial
seed-matches.sql    72 partidos de fase de grupos del Mundial 2026
fix-logic.sql       Fix: constraint credits >= 0 + tabla credit_transactions
```

## Orden de ejecucion

1. `schema.sql` -- crear todas las tablas + seed equipos + trivia
2. `seed-matches.sql` -- cargar 72 partidos de fase de grupos
3. `fix-logic.sql` -- agregar constraint de creditos + audit trail

## Tablas principales

- `teams` (48 equipos, grupos A-L)
- `matches` (partidos con odds + scores)
- `profiles` (usuarios con creditos + puntos)
- `predictions` (prode: predicciones de resultado)
- `bets` (apuestas con creditos)
- `parlays` + `parlay_legs` (apuestas multiples)
- `trivia_questions` + `trivia_sessions` (trivia diaria)
- `activity_feed` (feed IA en tiempo real)
- `scoring_config` (puntos configurables por admin)
- `credit_transactions` (audit trail de creditos)
