# Plan Power BI — fases y verificación

Guía de ejecución. Al terminar **cada fase**, ejecuta su **checklist ✅** antes de pasar a la siguiente.

Documentos relacionados:

| Fase | Documento |
|------|-----------|
| 0 | [`power-bi-kpi-definiciones.md`](power-bi-kpi-definiciones.md) |
| 2–4 | [`power-bi-dax.md`](power-bi-dax.md) |
| 2 | [`power-bi/power-query-incidencias.pq`](power-bi/power-query-incidencias.pq) |
| 5 | [`power-bi-fase5-refresh.md`](power-bi-fase5-refresh.md) |
| 6 | [`power-bi-fase6-servicios.md`](power-bi-fase6-servicios.md) |
| 7 | [`power-bi-handover-jefatura.md`](power-bi-handover-jefatura.md) |

---

## Fase 0 — Acuerdos (1–2 días)

**Objetivo:** Definiciones compartidas con Jefatura.

**Tareas:**
1. Revisar y completar [`power-bi-kpi-definiciones.md`](power-bi-kpi-definiciones.md).
2. Firmar / validar con Jefatura (tabla al final del doc).
3. Confirmar URL producción: `http://192.168.12.67:3000`.

### ✅ Verificación Fase 0

- [ ] Documento de definiciones revisado por negocio
- [ ] Queda claro: línea/servicio opcionales no restan del total de incidencias
- [ ] Queda claro: «horas explotación» = Fase 6 (BI Servicios)
- [ ] Responsable Power BI asignado

---

## Fase 1 — API BI activa (1–2 días)

**Objetivo:** La app expone `/api/bi/*` con token.

**Tareas:**
1. Confirmar en `.env`: `POWER_BI_API_KEY="..."` (32+ caracteres).
2. **Reiniciar el servicio** para cargar la variable:
   ```powershell
   .\scripts\restart-service.ps1
   ```
3. Ejecutar verificación automática:
   ```powershell
   cd C:\Users\Incidencias\AppIncidencias
   powershell -ExecutionPolicy Bypass -File .\scripts\power-bi-verify-api.ps1 -BaseUrl http://192.168.12.67:3000
   ```

### ✅ Verificación Fase 1

Ejecutar el script anterior. Debe mostrar **5/5 comprobaciones OK**:

- [ ] Sin clave → 401
- [ ] `/api/bi/health` → `{ ok: true }`
- [ ] `/api/bi/flota` → `items` + `total`
- [ ] `/api/bi/tickets?range=last30` → `items` con campos `vehiculo`, `impacto`, `linea`, `servicio`, `horas_gestion`
- [ ] `/api/bi/kpis?range=last30` → `totales`, `evolucion_mensual`

**Si falla:** revisar servicio activo, firewall, clave en `.env`, reinicio.

---

## Fase 2 — Modelo Power BI Desktop (2–4 días)

**Objetivo:** Tablas `Incidencias`, `Flota`, `Calendario` con relaciones.

**Tareas:**
1. Power BI Desktop → **Obtener datos → Consulta en blanco**.
2. Copiar script de [`power-bi/power-query-incidencias.pq`](power-bi/power-query-incidencias.pq) (ajustar `ApiKey` y `BaseUrl`).
3. Crear consulta **Flota** (URL `/api/bi/flota`, mismo header).
4. **Modelado → Nueva tabla** → DAX `Calendario` (ver [`power-bi-dax.md`](power-bi-dax.md)).
5. Relaciones:
   - `Incidencias[vehiculo]` → `Flota[vehiculo]` (muchos a uno)
   - `Incidencias[Fecha]` → `Calendario[Date]` (muchos a uno)
6. Guardar como `Incidencias-CCMGC.pbix`.

**Credenciales del origen de datos (importante):** el token viaja como header `Authorization` embebido en el propio código M, no por el mecanismo nativo de Power BI. En el diálogo de credenciales para este origen, elige **método "Anónimo"**. Si seleccionas "Clave de API web" y solo rellenas el valor de la clave sin el "Nombre de la clave" (o viceversa), Power BI muestra el error *"Una clave de la API web solo puede especificarse cuando se proporciona un nombre de clave de la API web"*. No es un fallo de la API ni de la clave, es el método de autenticación equivocado para este origen.

### ✅ Verificación Fase 2

- [ ] Tabla `Incidencias` con filas > 0
- [ ] Tabla `Flota` con buses del catálogo
- [ ] Columna `Fecha` tipo Date en Incidencias
- [ ] Relaciones activas sin ambigüedad
- [ ] Vista de datos: campos `tipologia`, `impacto`, `linea`, `servicio` visibles

---

## Fase 3 — KPIs de incidencias (1 semana)

**Objetivo:** Informe equivalente al pedido de Jefatura (bloque incidencias).

**Tareas:** Crear medidas DAX de [`power-bi-dax.md`](power-bi-dax.md) secciones 4.1–4.9.

**Visualizaciones sugeridas:**

| Visual | Campos |
|--------|--------|
| Tarjetas | Total incidencias, Vehículos afectados, Líneas declaradas, Expediciones declaradas |
| Barras | Tipología, Operadora, Impacto |
| Donut | Impacto (Alto/Medio/Bajo) — **no** confundir con criticidad |
| Líneas | Evolución mensual (`Calendario[MesNombre]`) |
| Tabla Top 10 | `incidencia` + ranking; `vehiculo` + ranking |
| Matriz | Operadora × Mes |

**Filtros importantes en medidas:**
- Líneas: `[linea] <> ""`
- Expediciones: `[servicio] <> ""`

### ✅ Verificación Fase 3

- [ ] Total incidencias ≈ app `/reportes` (mismo periodo, ± borradores)
- [ ] Gráfico impacto usa columna **`impacto`**, no `criticidad`
- [ ] Líneas/expediciones **no** muestran fila en blanco como categoría (salvo que lo pidáis)
- [ ] % flota: valor entre 0 y 100 %
- [ ] Evolución mensual muestra al menos 2 meses si hay histórico
- [ ] Jefatura revisa borrador visual del informe

---

## Fase 4 — KPIs de horas (2–3 días)

**Objetivo:** Horas bien etiquetadas (sin confundir con explotación).

**Medidas** (sección 4.4 de [`power-bi-dax.md`](power-bi-dax.md)):

- Horas gestión (acum.)
- Horas servicio detenido declarado (acum.)
- % incidencias con servicio detenido

**Títulos visibles en el informe** (copiar literal):

- «Horas de gestión técnica (acumuladas)»
- «Horas con servicio detenido — declarado en incidencia»
- «% incidencias con servicio detenido declarado»

### ✅ Verificación Fase 4

- [ ] Ningún gráfico se llama solo «Horas de afección» sin calificativo
- [ ] `horas_gestion` ≥ 0 en tickets resueltos
- [ ] `horas_afeccion_servicio` solo > 0 cuando `servicio_detenido = true`
- [ ] Nota al pie: histórico anterior a migración puede tener `servicio_detenido` por defecto

---

## Fase 5 — Publicación y refresh (3–5 días)

**Objetivo:** Informe en Power BI Service con actualización programada.

Ver guía: [`power-bi-fase5-refresh.md`](power-bi-fase5-refresh.md).

### ✅ Verificación Fase 5

- [ ] Informe publicado en workspace acordado
- [ ] Gateway on-premises conectado y online
- [ ] Refresh manual OK
- [ ] Refresh programado configurado
- [ ] Tras refresh, fecha de datos = ayer/hoy según criterio

---

## Fase 6 — BI Servicios (2–3 semanas, cuando aplique)

**Objetivo:** % servicio afectado y horas explotación.

Ver guía: [`power-bi-fase6-servicios.md`](power-bi-fase6-servicios.md).

### ✅ Verificación Fase 6

- [ ] Página «Explotación» separada de «Incidencias técnicas»
- [ ] Claves de cruce documentadas (servicio, vehículo, fecha)
- [ ] Jefatura valida cifras con explotación

---

## Fase 7 — Cierre (1–2 días)

**Objetivo:** Handover a Jefatura y equipo.

Ver [`power-bi-handover-jefatura.md`](power-bi-handover-jefatura.md).

### ✅ Verificación Fase 7

- [ ] Guía Jefatura entregada
- [ ] Sesión revisión realizada (30 min)
- [ ] Contacto técnico para incidencias API/refresh definido

---

## Orden mínimo viable

```
0 → 1 → 2 → 3 → 5 → (4 cuando pidan horas) → (6 cuando haya BI Servicios) → 7
```

**Estado actual del código (Fase 1):** API implementada y verificada.

### Registro de ejecución

| Fase | Estado | Notas |
|------|--------|-------|
| **0** | Documento listo | [`power-bi-kpi-definiciones.md`](power-bi-kpi-definiciones.md) — pendiente firma Jefatura |
| **1** | **Completada** | `power-bi:verify` → **5/5 OK** (19/07/2026, 604 incidencias, 158 buses) |
| **2** | En curso (Power BI Desktop) | Scripts `.pq` en `docs/power-bi/` — retomar desde aquí |
| **3** | Pendiente (Power BI Desktop) | Medidas en `power-bi-dax.md` |
| **4** | Pendiente (Power BI Desktop) | Sección horas en `power-bi-dax.md` |
| **5** | Pendiente | Gateway + publicar informe |
| **6** | Pendiente | Cuando exista acceso BI Servicios |
| **7** | Documento listo | [`power-bi-handover-jefatura.md`](power-bi-handover-jefatura.md) |
