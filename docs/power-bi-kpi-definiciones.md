# Definiciones oficiales de KPI — Power BI Incidencias

Documento **Fase 0**. Texto para pies de gráfico y acuerdo con Jefatura.

**Origen de datos:** API `/api/bi/*` de la app CCMGC Ticketing (`192.168.12.67:3000`).

---

## Reglas generales

1. **Línea** y **servicio/expedición** son **opcionales** al crear incidencias. Eso no cambia.
2. El **total de incidencias** cuenta **todas** (excepto borradores), tengan o no línea/servicio.
3. Los KPI de línea y expedición miden lo **declarado en el parte**, no toda la red.
4. **Impacto** (`Alto` / `Medio` / `Bajo`) ≠ **Criticidad/prioridad** (`Alta` / `Media` / `Baja`).

---

## KPI — definiciones

| KPI en el informe | Definición oficial (pie de gráfico) |
|-------------------|-------------------------------------|
| **Total incidencias** | Número de incidencias registradas en el periodo seleccionado (excluye borradores). |
| **Incidencias por tipología** | Distribución por tipo/subtipo/incidencia declarada en el parte. |
| **Incidencias por operadora** | Distribución según operadora del vehículo afectado. |
| **Vehículos afectados** | Número de vehículos distintos con al menos una incidencia en el periodo. |
| **Líneas declaradas** | Líneas distintas informadas en incidencias que incluyen el campo línea. Sin línea informada → no entra en este indicador. |
| **Expediciones declaradas** | Servicios/expediciones distintos informados en incidencias que incluyen el campo servicio. Sin servicio informado → no entra en este indicador. |
| **% flota afectada** | Vehículos con incidencia en el periodo ÷ total de vehículos en catálogo de flota. |
| **Incidencias por impacto mayor** | Distribución por nivel de impacto operativo (Alto / Medio / Bajo) de la tipología. |
| **Evolución mensual** | Incidencias creadas agrupadas por mes natural. |
| **Comparativa mes anterior** | Variación porcentual del total de incidencias respecto al mes anterior equivalente. |
| **Top incidencias recurrentes** | Tipologías o tipos de incidencia con mayor número de registros en el periodo. |
| **Top vehículos recurrentes** | Vehículos con mayor número de incidencias en el periodo. |
| **Tendencias por operadora** | Evolución temporal del número de incidencias desglosada por operadora. |
| **Horas de gestión técnica** | Suma de horas desde apertura hasta cierre/resolución del parte (tiempo de gestión interna). |
| **Horas con servicio detenido (declarado)** | Suma de horas en incidencias donde se marcó «servicio detenido» (desde apertura hasta cierre). |
| **% incidencias con servicio detenido** | Proporción de incidencias con «servicio detenido» marcado. |

---

## KPI pendientes de BI Servicios (Fase 6)

| KPI | Definición | Fuente |
|-----|------------|--------|
| **% servicio afectado (explotación)** | Expediciones/servicios comerciales afectados ÷ expediciones planificadas en el periodo. | Power BI Servicios + cruce con incidencias |
| **Horas acumuladas de afección (explotación)** | Tiempo real de impacto al servicio público según datos de explotación. | Power BI Servicios |

Estos **no** se presentan como «desde incidencias solas» para evitar malentendidos.

---

## URL y acceso API

| Concepto | Valor |
|----------|-------|
| App | `http://192.168.12.67:3000` |
| Tabla detalle | `GET /api/bi/tickets` |
| Catálogo flota | `GET /api/bi/flota` |
| Agregados | `GET /api/bi/kpis` |
| Autenticación | Header `Authorization: Bearer <POWER_BI_API_KEY>` |

---

## Aprobación

| Rol | Nombre | Fecha | OK |
|-----|--------|-------|-----|
| Jefatura | | | |
| Centro control | | | |
| Técnico / BI | | | |
