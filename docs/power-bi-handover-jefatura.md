# Guía rápida — Informe Power BI Incidencias (Jefatura)

## ¿Qué es este informe?

Resume las **incidencias técnicas** registradas en la app del Centro de Control (averías, SAE, validadoras, etc.).

**No sustituye** los informes de explotación de servicio comercial (expediciones planificadas). Esos van en la sección «Explotación» cuando esté disponible.

---

## Página «Resumen»

| Lo que ves | Qué significa |
|------------|----------------|
| **Total incidencias** | Partes abiertos en el periodo (filtro de fechas arriba). |
| **Por tipología** | Tipo de avería más frecuente. |
| **Por operadora** | Qué operador concentra más incidencias. |
| **Vehículos afectados** | Cuántos buses distintos han tenido al menos un parte. |
| **Líneas declaradas** | Líneas que los técnicos **han escrito** en el parte. Si no pusieron línea, no aparece aquí (pero sí cuenta en el total). |
| **Expediciones declaradas** | Igual con el número de servicio/expedición, cuando lo informaron. |
| **% flota afectada** | De todos los buses del catálogo, qué % tuvo incidencia en el periodo. |
| **Por impacto** | Gravedad operativa (Alto/Medio/Bajo), no confundir con prioridad de gestión. |

---

## Página «Tendencias»

| Lo que ves | Qué significa |
|------------|----------------|
| **Evolución mensual** | Incidencias por mes. |
| **Comparativa mes anterior** | Si sube o baja respecto al mes previo. |
| **Top incidencias** | Averías que más se repiten. |
| **Top vehículos** | Buses con más partes. |
| **Por operadora en el tiempo** | Qué operador empeora o mejora mes a mes. |

---

## Página «Horas»

| Lo que ves | Qué significa |
|------------|----------------|
| **Horas de gestión técnica** | Tiempo desde que se abre el parte hasta que el técnico lo cierra. |
| **Horas servicio detenido (declarado)** | Solo partes donde marcaron que el **servicio se detuvo**. Es lo que declaró el operador, no el cálculo automático de explotación. |

---

## Filtros

Use el **selector de fechas** y, si está disponible, **operadora** / **impacto** para acotar.

---

## Actualización

El informe se actualiza **automáticamente cada noche** (salvo aviso). La fecha de «última actualización» aparece en Power BI Service.

---

## Contacto técnico

Incidencias con números que no cuadran o informe que no refresca: contactar al equipo de sistemas / centro de control (API incidencias + Power BI).
