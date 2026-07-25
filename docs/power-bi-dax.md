# Power BI — conexión y medidas DAX

Parte del **plan por fases**: ver [`power-bi-fases.md`](power-bi-fases.md) (Fases 2–4).

Conector **Web** directo a la API BI (sin Power Automate). Autenticación: `Authorization: Bearer <POWER_BI_API_KEY>`.

## 1. Configuración en el servidor

En `.env`:

```env
POWER_BI_API_KEY="tu-secreto-largo-minimo-32-caracteres"
```

Reinicia el servicio tras cambiar la variable.

## 2. Power BI Desktop — importar datos

### Tabla `Incidencias`

**Obtener datos → Web → Avanzadas**

| Campo | Valor |
|-------|-------|
| URL | `http://192.168.12.67:3000/api/bi/tickets?range=last365&pageSize=5000` |
| Encabezado | `Authorization` = `Bearer TU_API_KEY` |

En Power Query, preferir el script completo con paginación en [`power-bi/power-query-incidencias.pq`](power-bi/power-query-incidencias.pq).

Pasos manuales (primera página solo):

### Tabla `Flota`

| URL | `http://192.168.12.67:3000/api/bi/flota` |
| Expandir | `items` |

Renombrar a **`Flota`**.

### Tabla `Calendario` (obligatoria para evolución mensual)

**Modelado → Nueva tabla:**

```dax
Calendario =
ADDCOLUMNS(
    CALENDAR(DATE(2024, 1, 1), TODAY()),
    "Año", YEAR([Date]),
    "Mes", MONTH([Date]),
    "MesNombre", FORMAT([Date], "MMMM yyyy", "es-ES"),
    "AñoMes", FORMAT([Date], "YYYY-MM")
)
```

Relación: `Incidencias[creado]` → `Calendario[Date]` (muchos a uno, filtro simple desde Calendario).

---

## 3. Columnas de la API (`Incidencias`)

| Columna API | Tipo | Uso en dashboard |
|-------------|------|------------------|
| `creado` | DateTime | Fecha, evolución mensual |
| `vehiculo` | Texto | Vehículos afectados |
| `servicio` | Texto | Expediciones afectadas |
| `operadora` | Texto | Por operadora |
| `tipo`, `subtipo`, `incidencia` | Texto | Tipología |
| `tipologia` | Texto | Tipología completa |
| `criticidad` | Texto | Alta / Media / Baja (prioridad) |
| `impacto` | Texto | Alto / Medio / Bajo (impacto operativo) |
| `linea` | Texto | Líneas afectadas |
| `servicio_detenido` | Boolean | % servicio detenido |
| `lineas_impactadas` | Número | Líneas declaradas al crear |
| `horas_gestion` | Número | MTTR en horas |
| `horas_afeccion_servicio` | Número | Horas con servicio detenido (aprox.) |

Columnas calculadas recomendadas en Power Query:

```powerquery
// Fecha sin hora (para slicers)
Fecha = Date.From([creado])
```

---

## 4. Medidas DAX

Copia en **Modelado → Nueva medida** sobre la tabla `Incidencias` (o en una tabla `_Medidas`).

### KPIs básicos (ya los tienes)

```dax
Total incidencias = COUNTROWS(Incidencias)

Incidencias alta criticidad =
CALCULATE(
    COUNTROWS(Incidencias),
    Incidencias[criticidad] = "Alta"
)

Incidencias media criticidad =
CALCULATE(COUNTROWS(Incidencias), Incidencias[criticidad] = "Media")

Incidencias baja criticidad =
CALCULATE(COUNTROWS(Incidencias), Incidencias[criticidad] = "Baja")
```

### Líneas y expediciones afectadas

```dax
Líneas afectadas =
CALCULATE(
    DISTINCTCOUNT(Incidencias[linea]),
    Incidencias[linea] <> ""
)

Expediciones afectadas =
CALCULATE(
    DISTINCTCOUNT(Incidencias[servicio]),
    Incidencias[servicio] <> ""
)
```

### % flota afectada

Requiere relación `Incidencias[vehiculo]` → `Flota[vehiculo]` (muchos a uno, opcional).

```dax
Vehículos afectados =
CALCULATE(
    DISTINCTCOUNT(Incidencias[vehiculo]),
    Incidencias[vehiculo] <> ""
)

Total flota = COUNTROWS(Flota)

% Flota afectada =
DIVIDE([Vehículos afectados], [Total flota], 0)
```

Formato: porcentaje, 1 decimal.

### % incidencias con servicio detenido

```dax
Incidencias servicio detenido =
CALCULATE(COUNTROWS(Incidencias), Incidencias[servicio_detenido] = TRUE())

% Incidencias servicio detenido =
DIVIDE([Incidencias servicio detenido], [Total incidencias], 0)
```

> **Nota:** El % de **servicio comercial afectado** (expediciones planificadas vs afectadas) requiere cruzar con el Power BI de Servicios. Esta medida cubre el subconjunto registrado en incidencias.

### Horas acumuladas de afección

```dax
Horas afección servicio (acum.) =
SUM(Incidencias[horas_afeccion_servicio])

Horas gestión (MTTR acum.) =
SUM(Incidencias[horas_gestion])
```

`horas_afeccion_servicio` solo suma tiempo cuando `servicio_detenido = TRUE`.

### Incidencias por impacto mayor

```dax
Incidencias impacto alto =
CALCULATE(COUNTROWS(Incidencias), Incidencias[impacto] = "Alto")

Incidencias impacto medio =
CALCULATE(COUNTROWS(Incidencias), Incidencias[impacto] = "Medio")

Incidencias impacto bajo =
CALCULATE(COUNTROWS(Incidencias), Incidencias[impacto] = "Bajo")
```

Usa **`impacto`**, no `criticidad` (son campos distintos).

### Evolución mensual

```dax
Incidencias mes =
CALCULATE(
    [Total incidencias],
    REMOVEFILTERS(Calendario),
    VALUES(Calendario[AñoMes])
)
```

Gráfico de líneas: eje X = `Calendario[MesNombre]`, valor = `[Total incidencias]`.

### Comparativa con mes anterior

```dax
Incidencias mes anterior =
CALCULATE(
    [Total incidencias],
    DATEADD(Calendario[Date], -1, MONTH)
)

Variación incidencias % =
VAR Actual = [Total incidencias]
VAR Anterior = [Incidencias mes anterior]
RETURN
DIVIDE(Actual - Anterior, Anterior, BLANK())
```

Tarjeta KPI con formato condicional (verde/rojo).

### Top incidencias recurrentes

```dax
Top incidencias ranking =
RANKX(
    ALL(Incidencias[incidencia]),
    CALCULATE(COUNTROWS(Incidencias)),
    ,
    DESC,
    Dense
)
```

Tabla visual: filtro `Top incidencias ranking <= 10`, columnas `incidencia` + `[Total incidencias]`.

Alternativa por tipología completa:

```dax
Top tipología ranking =
RANKX(
    ALL(Incidencias[tipologia]),
    CALCULATE(COUNTROWS(Incidencias)),
    ,
    DESC,
    Dense
)
```

### Top vehículos recurrentes

```dax
Top vehículos ranking =
RANKX(
    ALL(Incidencias[vehiculo]),
    CALCULATE(COUNTROWS(Incidencias)),
    ,
    DESC,
    Dense
)
```

Tabla: `vehiculo`, `operadora`, `[Total incidencias]`, filtro ranking ≤ 10.

### Tendencias por operadora

Matriz o gráfico de líneas múltiples:

- **Filas / Leyenda:** `Incidencias[operadora]`
- **Columnas / Eje X:** `Calendario[AñoMes]`
- **Valores:** `[Total incidencias]`

Medida auxiliar para filtrar operadoras con poco volumen:

```dax
Operadora activa =
CALCULATE(
    [Total incidencias],
    ALLEXCEPT(Incidencias, Incidencias[operadora])
) >= 3
```

---

## 5. Endpoint KPIs precalculados (opcional)

`GET /api/bi/kpis?range=last30` devuelve agregados listos (`totales`, `evolucion_mensual`, `top_incidencias_recurrentes`, etc.). Útil para validar medidas DAX o tarjetas sin calcular en el modelo.

---

## 6. Comprobar conexión

```powershell
$key = "TU_API_KEY"
Invoke-RestMethod -Uri "http://192.168.12.67:3000/api/bi/health" `
  -Headers @{ Authorization = "Bearer $key" }
```

Respuesta esperada: `{ "ok": true, "configured": true, ... }`

---

## 7. Actualización programada

1. Publica el informe en **Power BI Service**.
2. **Configuración del conjunto de datos → Credenciales de origen de datos** → edita la consulta Web y confirma el header Bearer (o usa un **Parámetro de gateway** si aplica).
3. El servidor debe ser accesible desde la red donde refresca el servicio (LAN o VPN). Si Power BI Service está en la nube, necesitarás **On-premises Data Gateway** apuntando a `192.168.12.67`.
