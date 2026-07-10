# Fase 6 — Cruce con Power BI de Servicios

**Prerrequisito:** Fases 0–5 completadas. Acceso al informe/dataset de **Servicios**.

## Objetivo

KPIs que la app de incidencias **no puede calcular sola**:

- **% servicio afectado (explotación)**
- **Horas acumuladas de afección (explotación)**

## Paso 1 — Inventario BI Servicios

Documentar:

| Pregunta | Respuesta |
|----------|-----------|
| ¿Nombre del dataset/informe? | |
| ¿Tabla de expediciones/servicios? | |
| ¿Campos: fecha, línea, vehículo, operador, minutos? | |
| ¿Granularidad (día / expedición)? | |

## Paso 2 — Claves de cruce

Prioridad de emparejamiento incidencia ↔ servicio:

1. **`servicio`** (expedición) + **fecha**
2. **`vehiculo`** + **fecha**
3. **`linea`** + **fecha** (menos preciso)

Validar formato: ¿coincide `servicioLabel` de incidencias con ID en Servicios?

## Paso 3 — Modelo combinado

En Power BI (informe v2):

- Mantener página **«Incidencias técnicas»** (solo API app).
- Nueva página **«Explotación»** con origen Servicios + relaciones.

No mezclar en un mismo gráfico horas de gestión técnica con horas de explotación.

## Paso 4 — Medidas orientativas

```dax
// Ejemplo conceptual — ajustar nombres de tabla Servicios
% Servicio afectado explotación =
VAR Afectados = DISTINCTCOUNT(CruceIncidenciaServicio[id_expedicion])
VAR Planificados = DISTINCTCOUNT(Servicios[id_expedicion])
RETURN DIVIDE(Afectados, Planificados, BLANK())
```

La tabla puente `CruceIncidenciaServicio` se construye según reglas del paso 2.

## Paso 5 — Desarrollo app (opcional)

Si el cruce falla por formato de `servicio`:

- Validar `servicioLabel` al crear ticket.
- Endpoint futuro `/api/bi/desvios` para circulares.

## ✅ Checklist Fase 6

- [ ] Inventario BI Servicios completado
- [ ] Clave de cruce acordada con explotación
- [ ] Página «Explotación» publicada
- [ ] Jefatura valida una muestra manual (1 día, 1 línea)
