# Fase 5 — Publicación y refresh automático

## 1. Publicar el informe

1. Abrir `Incidencias-CCMGC.pbix` en Power BI Desktop.
2. **Archivo → Publicar → Publicar en Power BI**.
3. Elegir workspace (ej. «Operaciones» / «CCMGC»).

## 2. On-premises Data Gateway

La app está en LAN (`192.168.12.67`). Power BI Service en la nube **no** llega sin gateway.

1. Instalar [On-premises data gateway](https://powerbi.microsoft.com/gateway/) en un PC/servidor **de la misma red** que `192.168.12.67`.
2. Registrar gateway con cuenta organizativa.
3. En Power BI Service → **Configuración** → **Administrar gateways** → comprobar estado **Online**.

## 3. Credenciales del origen Web

1. Workspace → **Configuración del conjunto de datos**.
2. **Orígenes de datos** → origen Web.
3. Método de autenticación: según versión, usar **Anónimo** + URL con token en header vía Power Query, o **Clave** si configuraste parámetro.
4. Recomendación: en Desktop, crear **parámetros** `BaseUrl` y `ApiKey` (marcar ApiKey como confidencial) en lugar de texto fijo.

## 4. Programar actualización

1. Configuración del conjunto de datos → **Programación de actualización**.
2. Ejemplo: diaria **06:00** (Canarias).
3. **Actualizar ahora** y comprobar que termina sin error.

## 5. Errores frecuentes

| Error | Solución |
|-------|----------|
| Gateway offline | Arrancar servicio gateway en el PC puente |
| 401 Unauthorized | ApiKey incorrecta o no cargada en parámetro |
| No se puede conectar | Firewall bloquea PC gateway → `.67:3000` |
| Datos vacíos | Rango `last365` OK pero API caída; revisar servicio app |

## ✅ Checklist Fase 5

- [ ] Gateway online
- [ ] Refresh manual exitoso
- [ ] Refresh programado activo
- [ ] Usuarios con acceso al informe en workspace
