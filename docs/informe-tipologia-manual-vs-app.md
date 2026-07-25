# Informe de alineación: tipología CCMGC

**Documento de referencia:** CCMGC-PRO-OPS-INC-2026-V1 — Sección 3.6 Clasificación técnica  
**Sistema analizado:** AppIncidencias (CCMGC Ticketing)  
**Fuente en código:** `src/lib/tipologia.ts` (`TIPOLOGIA_CSV`) + tabla `TipologiaEntry` en base de datos  
**Fecha del informe:** 23 de junio de 2026  
**Alcance:** Comparativa descriptiva; no se han aplicado cambios en el sistema.

---

## 1. Resumen ejecutivo

La tipología definida en el manual operativo y la implementada en la aplicación **comparten la misma estructura de alto nivel** (nueve dominios técnicos: Estado General, Comunicaciones, Localización, Billetaje, Planificación, Operativa, Desvíos, Impresión y Genérica).

No obstante, **no coinciden al 100%**. Existen entradas faltantes respecto al manual, clasificaciones ubicadas en dominios incorrectos, nomenclaturas distintas y entradas propias de la aplicación que no aparecen en el documento oficial.

| Indicador | Manual (aprox.) | Aplicación (`TIPOLOGIA_CSV`) |
|-----------|-----------------|------------------------------|
| Hojas terminales (subsubtipo) | ~52 | 59 |
| Coincidencias claras | — | ~35–38 |
| Entradas faltantes | ~17 | — |
| Mal ubicadas en la app | — | ~5 |
| Solo en la app (no en manual) | — | ~6 |

**Conclusión:** La base es la misma taxonomía del manual, pero **no está sincronizada con la versión 2026** del procedimiento.

---

## 2. Metodología

Se ha contrastado el extracto del manual (apartados 3.6.1 a 3.6.9) con el array `TIPOLOGIA_CSV`, que es la fuente semilla del catálogo. En producción, las tipologías activas se sirven desde la base de datos (`TipologiaEntry`), inicializada desde ese CSV y ampliable vía administración.

La comparación se ha realizado a tres niveles:

- **Tipo** (dominio / apartado 3.6.x)
- **Subtipo** (categoría intermedia del manual)
- **Subsubtipo** (hoja seleccionable en el formulario de ticket)

---

## 3. Correspondencia por dominio

| Dominio (manual) | En la aplicación | Grado de alineación |
|------------------|------------------|--------------------|
| 3.6.1 Estado General | `Estado general` | Parcial |
| 3.6.2 Comunicaciones | `Comunicaciones` | Muy alineado |
| 3.6.3 Localización | `Localizacion` | Parcial |
| 3.6.4 Billetaje | `Billetaje` | Casi completo |
| 3.6.5 Planificación | `Planificacion` | Incompleto |
| 3.6.6 Operativa | `Operativa` | Muy incompleto / mal ubicado |
| 3.6.7 Desvíos | `Desvios` | Parcial |
| 3.6.8 Impresión | `Impresion` | Incompleto |
| 3.6.9 Genérica | `Generica` | Correcto |

El bloque **Comunicaciones** es el que mejor coincide con el manual (7 de 7 hojas previstas).

---

## 4. Entradas faltantes en la aplicación

Según el manual CCMGC-PRO-OPS-INC-2026-V1, las siguientes hojas **no existen** en `TIPOLOGIA_CSV`:

### 4.1 Estado General

- **Bloqueo** (subtipo Reset / bloqueo)

### 4.2 Localización

- **Avería cuentakilómetros** (subtipo Informativo)

### 4.3 Planificación

- **Viaje no registrado** (subtipo Incorrecta)
- **Servicio desconocido** (subtipo Incorrecta; en la app aparece bajo Operativa)
- **Fleco/Refuerzo** (subtipo No asignado)
- **Servicio no cargado** (subtipo Vigencia; la app solo tiene *Servicio festivo no cargado*)

### 4.4 Operativa

- **Duda**
- **Uso indebido**, **Secuencia operativa incorrecta**, **Encierro** (subtipo Uso incorrecto)
- **Inicio en intensificación** (subtipo Inicio de sesión)
- **Identificación incorrecta del conductor** (subtipo Inicio de sesión)
- **Cambio manual** (subtipo Cambio manual de viaje)

### 4.5 Desvíos

- **Desvío sobrevenido** (subtipo Configuración incorrecta)
- **Activación no posible** (subtipo Activación incorrecta)

### 4.6 Impresión

- **Atasco de papel** (subtipo Error de impresión)
- **Cambio de rollo de papel** (subtipo Estado del papel)

---

## 5. Entradas mal ubicadas o con nomenclatura distinta

| Entrada en la aplicación | Ubicación actual | Ubicación según manual |
|--------------------------|------------------|------------------------|
| Hora adelantada / Hora atrasada | Estado general → Software | Operativa → Uso incorrecto |
| Inicio Sesion | Estado general → Software | Operativa → Inicio de sesión |
| Servicio desconocido | Operativa → Formación | Planificación → Incorrecta |
| Apagado abrupto | Operativa → Formación | Estado general → Apagado |
| Inicio prematuro | Operativa → Error operativo | Operativa → Inicio de sesión |

### 5.1 Diferencias de nomenclatura (menores)

- Acentos: `Localizacion`, `Planificacion`, `Impresion`, `Generica` (sin tilde en la app).
- Subtipos: `Reset/Bloqueo` vs *Reset / bloqueo*; `Incorrecto` vs *Incorrecta*; `Reset` vs *Resets*.
- Hojas: `Error Tarea Pupitre` vs *Error en tarea (X)*; `Componente actualizado` vs *Componente actualizado falla*.
- Impresión: `Falta papel` figura como subtipo *Informativo*; el manual la agrupa bajo *Estado del papel*.

---

## 6. Entradas presentes en la aplicación pero no contempladas en el manual

- **Reset GPS** (Localización)
- **EMV operativa incorrecta (06)** (Billetaje)
- **No abrir/cerrar puertas** (Operativa)
- **Cambio automatico de linea** / subtipo **Impacto en localizacion** (Desvíos)
- Subtipo **Formacion** en Operativa (no existe en el manual)

Estas entradas pueden reflejar criterios operativos internos posteriores al documento o práctica de campo; conviene decidir si se mantienen, se reclasifican o se documentan como extensión CCMGC.

---

## 7. Detalle por apartado del manual

### 7.1 Estado General (3.6.1)

**Coinciden:** Sistema no comunica, Fallo en el encendido, Panel táctil no responde, Apagado, Apagado abrupto, Visor apagado, Reset, Reset forzado, Reset no controlado, Error Tarea Pupitre (≈ Error en tarea), Actualización de componentes, Sin claves.

**Falta:** Bloqueo.

**Sobran o están mal:** Inicio Sesion, Hora adelantada, Hora atrasada (deberían estar en Operativa).

### 7.2 Comunicaciones (3.6.2)

**Coinciden:** Vehículo no comunica, Fonía sin comunicación, Alarma comunicaciones, Alarma paquetes, Paneles, Reset router, Reset WiFi.

**Estado:** Alineación completa en hojas terminales.

### 7.3 Localización (3.6.3)

**Coinciden:** Error GPS, Error antena GPS, No posiciona correctamente, Avería odómetro.

**Falta:** Avería cuentakilómetros.

**Sobra:** Reset GPS.

### 7.4 Billetaje (3.6.4)

**Coinciden:** Validadora inactiva, Zona destino no válida, Sin operatividad EMV, Estado EMV, Validadora sin comunicaciones, Reinicio no solicitado, Tarjeta no detectada.

**Sobra:** EMV operativa incorrecta (06).

### 7.5 Planificación (3.6.5)

**Coinciden:** Servicio no asignado, Servicio equivocado, Viaje adelantado, Viaje atrasado, Cambio entre conductores, Servicio festivo no cargado (≈ Servicio especial no cargado).

**Faltan:** Viaje no registrado, Servicio desconocido, Fleco/Refuerzo, Servicio no cargado.

### 7.6 Operativa (3.6.6)

**Coinciden parcialmente:** Cambio manual indebido (≈ Cambio manual incorrecto), Inicio prematuro.

**Faltan:** Duda, Uso indebido, Secuencia operativa incorrecta, Encierro, Hora adelantada, Hora atrasada, Inicio en intensificación, Identificación incorrecta del conductor, Cambio manual (viaje).

**Sobran o están mal:** Formación/Servicio desconocido, Formación/Apagado abrupto, No abrir/cerrar puertas.

### 7.7 Desvíos (3.6.7)

**Coinciden:** Desvío no cargado, Desvío fuera de horario.

**Faltan:** Desvío sobrevenido, Activación no posible.

**Sobra:** Cambio automático de línea (Impacto en localización).

### 7.8 Impresión (3.6.8)

**Coinciden:** Error impresora, Falta papel (con subtipo distinto al manual).

**Faltan:** Atasco de papel, Cambio de rollo de papel.

### 7.9 Genérica (3.6.9)

**Coincide:** Incidencia genérica (catch-all para casos no contemplados).

---

## 8. Recomendaciones (sin implementar)

1. **Alinear el catálogo** `TIPOLOGIA_CSV` y la base de datos con el manual 2026: alta de faltantes, traslado de mal ubicadas, revisión de extras.
2. **Definir política de transición:** tickets históricos con tipología antigua vs. nuevas opciones en formularios.
3. **Validar con operación** si las entradas propias de la app (`EMV 06`, `Reset GPS`, etc.) deben conservarse como extensión documentada.
4. **Unificar nomenclatura** (tildes, género de subtipos, nombres de hoja) con el lenguaje del procedimiento oficial.

---

## 9. Anexo técnico

- **Archivo fuente:** `src/lib/tipologia.ts`
- **Persistencia:** `prisma/schema` → modelo `TipologiaEntry`
- **API administración:** `/api/admin/tipologia`
- **Seed:** `ensureTipologiaSeeded()` en `src/lib/tipologia-store.ts`

---

*Documento generado a partir del análisis comparativo entre el manual operativo CCMGC-PRO-OPS-INC-2026-V1 y la tipología implementada en la aplicación de incidencias.*
