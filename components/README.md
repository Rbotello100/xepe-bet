# components/ -- Shared UI Layer

Componentes reutilizables compartidos por todos los features.

## Estructura

```
components/
  ui/               Primitivos de UI
    Button.tsx       Variantes: primary, secondary, danger, ghost, outline
    Card.tsx         Container con dark theme
    Badge.tsx        Status badges (pendiente, ganada, perdida)
    Skeleton.tsx     Loading placeholders (animate-pulse)
    Input.tsx        Input con label y error

  layout/            Estructura de la app
    Header.tsx       Logo + nav desktop + usuario
    MobileNav.tsx    Bottom tabs mobile (5 items)
    BetslipSidebar.tsx  Talonera desktop (sidebar derecho)
    ParlayIndicator.tsx Indicador flotante mobile de parlay activo
```

## Dark Theme

Palette (FIFA World Cup 2026): slate-900 background, slate-800 cards, casino-red (#E8003D) primary accent, casino-yellow (#F5C400) highlights, casino-teal (#00A499) success, slate-400 text secundario.
