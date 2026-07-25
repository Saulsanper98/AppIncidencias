# Revertir vista previa UI unificada

## Desactivar sin borrar código

1. En `.env` (o variables del servicio): `NEXT_PUBLIC_UI_UNIFICATION=0` o elimina la línea.
2. Rebuild: `.\scripts\rebuild-service.ps1`

## Borrar por completo

1. Desactiva la variable (paso anterior).
2. Elimina la carpeta `src/ui-unification/`.
3. Quita estas referencias en el código:
   - `src/app/(private)/layout.tsx` → `UiUnificationProvider`
   - `src/components/tickets-module.tsx` → import y rama `isUiUnificationEnabled`
   - `src/components/bitacora/BitacoraIndex.tsx` → rama unified hero
   - `src/app/(private)/handover/handover-page-client.tsx` → rama unified hero
   - `src/components/dashboard/OperationalNowCard.tsx` → import `UIU_TONE`
   - `.env.example` → línea `NEXT_PUBLIC_UI_UNIFICATION`
4. Rebuild.

## Activar para probar

```env
NEXT_PUBLIC_UI_UNIFICATION=1
```

Luego rebuild.
