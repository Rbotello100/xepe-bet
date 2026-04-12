# hooks/ -- Shared React Hooks

Custom hooks compartidos entre features.

```
useRealtime.ts        Supabase Realtime generico (INSERT/UPDATE/DELETE)
useParlay.ts          Estado del parlay (persistido en localStorage)
useCredits.ts         Creditos del usuario en tiempo real
useMatchLock.ts       Verifica si un partido esta bloqueado (< 1h)
```

Todos los hooks tienen `'use client'` y son para client components.
