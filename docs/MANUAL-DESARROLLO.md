# Manual de entorno de desarrollo (CCMGC Ticketing)

Guía para clonar o copiar el proyecto en **otro PC** (por ejemplo el del trabajo) y poder seguir desarrollando con las mismas herramientas.

---

## 1. Requisitos previos en el PC

| Herramienta | Notas |
|-------------|--------|
| **Node.js** | **20 LTS** o superior (recomendado). Incluye `npm`. [Descarga](https://nodejs.org/) |
| **Git** | Para clonar el repositorio. [Descarga](https://git-scm.com/) |
| **Editor** | VS Code o Cursor (opcional pero habitual) |

Comprobación rápida en terminal (PowerShell o CMD):

```bash
node -v
npm -v
git --version
```

---

## 2. Obtener el código

**Con Git** (recomendado):

```bash
git clone <URL-de-tu-repositorio>
cd <carpeta-del-repo>/ccmgc-ticketing
```

Si en tu máquina el proyecto vive dentro de una carpeta con espacios (por ejemplo `Ticketing CCMGC`), no hay problema: abre la terminal **dentro** de `ccmgc-ticketing` (la carpeta que contiene `package.json`).

**Sin Git** (USB / zip): copia toda la carpeta del proyecto y en el PC nuevo entra en `ccmgc-ticketing`.

---

## 3. Variables de entorno

1. En la raíz de `ccmgc-ticketing`, copia el ejemplo:

   ```bash
   copy .env.example .env
   ```

   En macOS / Linux: `cp .env.example .env`

2. Abre `.env` y revisa al menos:

   ```env
   DATABASE_URL="file:./prisma/dev.db"
   ```

   Eso usa **SQLite** en un fichero local (`prisma/dev.db`). No necesitas instalar PostgreSQL para desarrollo típico.

### Variables opcionales (solo si las usas)

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_DEV_LOGIN_SELECTOR` | `1`: selector de usuario en login (útil con Playwright o demos). El `playwright.config.ts` ya lo define para tests. |
| `NEXT_PUBLIC_GUEST_TICKETS_URL` | Enlace “tickets como visitante” en login. |
| `NEXT_PUBLIC_LOGIN_DEBUG_GRID`, `NEXT_PUBLIC_LOGIN_SUCCESS_SOUND`, etc. | Funciones extra de login; ver código y `next.config.ts` si las necesitas. |

---

## 4. Instalar dependencias de Node

En la carpeta `ccmgc-ticketing`:

```bash
npm install
```

Qué hace esto:

- Descarga **todas** las librerías del `package.json` (Next.js 15, React 19, Prisma, Tailwind 4, Framer Motion, Playwright como devDependency, etc.).
- Ejecuta **`postinstall`** → `prisma generate` (genera el cliente de Prisma).

En **Windows**, si `prisma generate` falla con **`EPERM`** / “operation not permitted” al renombrar `query_engine-*.dll.node`, suele ser porque **Node tiene el fichero bloqueado** (p. ej. con `npm run dev` abierto). Cierra el servidor de desarrollo y cualquier otro proceso Node, y ejecuta `npx prisma generate` de nuevo.

> **No hace falta** instalar Tailwind, TypeScript o ESLint “a mano”: vienen como dependencias del proyecto.

---

## 5. Base de datos (Prisma + SQLite)

La primera vez (o en un PC nuevo sin `prisma/dev.db`):

```bash
npx prisma migrate deploy
```

- Aplica todas las migraciones de `prisma/migrations/` y crea/actualiza `dev.db`.

**Tras un `git pull`** (o al cambiar de rama) conviene volver a ejecutar:

```bash
npx prisma migrate deploy
```

Así se aplican columnas o tablas nuevas que hayan entrado en el repo (por ejemplo cambios en el modelo `Ticket` o del mapa). Si no migras, la app puede fallar en rutas API o en Prisma con errores de esquema.

Para inspeccionar datos en local:

```bash
npm run db:studio
```

Otros scripts útiles (según necesidad):

| Comando | Descripción |
|---------|-------------|
| `npm run db:migrate` | `prisma migrate dev` (crear nueva migración en desarrollo; pide nombre). |
| `npm run db:generate` | Regenera solo el cliente Prisma. |
| `npm run db:backfill-tipologia` | Script de datos; úsalo solo si el proyecto lo requiere. |

### PC del trabajo: ¿dónde está la base de datos?

En este proyecto la base de datos de desarrollo es **SQLite**: un **archivo en tu disco** (`prisma/dev.db` si usas la `DATABASE_URL` del `.env.example`), **no un servidor en “la nube” ni en el otro ordenador**.

- **Ese archivo no se sube a GitHub** (está en `.gitignore`). Cada PC tiene **su propia** `dev.db`.
- En el **PC del trabajo**, después de clonar y hacer `npx prisma migrate deploy`, tendrás una BD **vacía de datos** pero **con la misma estructura** (tablas) que en casa, gracias a las migraciones del repo.
- La aplicación puede **rellenar catálogos o datos mínimos** al arrancar (según la lógica del proyecto, p. ej. `ensureCatalogSeeded`); los **usuarios y tickets de prueba** que creaste solo en casa **no aparecen** en el trabajo a menos que los copies tú.

**Si quieres los mismos datos que en tu PC de casa**

1. Copia el fichero `prisma/dev.db` (o el que indique tu `DATABASE_URL`) a un USB / OneDrive / correo interno y pégalo en el trabajo en la **misma ruta relativa** al proyecto, **o**
2. Deja la BD nueva en el trabajo y vuelve a crear usuarios desde **Administración → Usuarios** (si tienes rol gestor) o el flujo de login dev que use tu entorno.

**Si en el futuro usáis PostgreSQL compartido** (equipo / staging), bastaría con cambiar `DATABASE_URL` en `.env` a la cadena de conexión que os den y ajustar el `provider` en `schema.prisma`; eso ya sería decisión de despliegue, no del manual mínimo.

---

## 6. Arrancar la aplicación en desarrollo

```bash
npm run dev
```

Por defecto Next suele servir en **http://localhost:3000**. Abre esa URL en el navegador.

- El script usa **Turbopack** (`next dev --turbopack`).
- En **modo desarrollo**, el selector de usuario simulado en login suele estar activo (ver `src/lib/dev-auth.ts`): puedes entrar como distintos roles si hay usuarios en la BD.
- Si la consola avisa de que **no se pudieron descargar las fuentes Geist** (Google Fonts) y se usan fuentes sustitutas, es habitual en entornos **sin salida a internet** o con proxy restrictivo: la aplicación sigue funcionando; solo cambia la tipografía local.

---

## 7. Comprobaciones habituales

```bash
npm run lint
npx tsc --noEmit
npm run build
```

- `lint`: ESLint (config Next).
- `tsc`: TypeScript sin emitir ficheros.
- `build`: comprobar que el build de producción compila.

---

## 8. Tests E2E (Playwright)

La primera vez en ese PC hay que instalar los navegadores de Playwright:

```bash
npx playwright install
```

Luego, por ejemplo:

```bash
npm run test:admin-users
npm run test:login:visual
```

El `playwright.config.ts` puede levantar solo el servidor en el puerto **4173**; no choca con `npm run dev` en 3000 si no los ejecutas a la vez.

---

## 9. Problemas frecuentes

| Síntoma | Qué probar |
|---------|------------|
| Error al instalar / `prisma generate` | Node ≥ 20, borrar `node_modules` y `package-lock.json`, volver a `npm install`. |
| `prisma generate` → **EPERM** (Windows) al renombrar el motor | Cierra **`npm run dev`** y otros procesos Node; vuelve a ejecutar `npx prisma generate`. |
| Errores de Prisma / API tras **`git pull`** (“columna desconocida”, etc.) | Ejecuta **`npx prisma migrate deploy`** para alinear `dev.db` con las migraciones del repo. |
| Prisma no encuentra la BD | Comprueba que existe `.env` con `DATABASE_URL` y ejecuta `npx prisma migrate deploy`. |
| Puerto 3000 ocupado | Cierra el otro proceso o ejecuta `npx next dev -p 3001` (o el puerto que quieras). |
| Políticas del trabajo (proxy, antivirus) | Permite Node/npm en red; a veces hace falta configurar proxy corporativo para `npm install`. |
| Aviso **Failed to download Geist** en consola al arrancar | Sin impacto funcional; indica fuentes sustitutas. Hace falta red o proxy si quieres la fuente oficial. |

---

## 10. Resumen mínimo (checklist)

1. Instalar **Node.js 20+** y **Git**.  
2. Clonar / copiar el repo y entrar en **`ccmgc-ticketing`**.  
3. **`copy .env.example .env`** (o crear `.env` con la misma `DATABASE_URL`).  
4. **`npm install`**.  
5. **`npx prisma migrate deploy`**.  
6. **`npm run dev`** → navegador en `http://localhost:3000`.  
7. (Opcional) **`npx playwright install`** si vas a correr E2E.

**Cuando ya tengas el repo y solo actualices código:** repite el paso **5** (`npx prisma migrate deploy`) después de un `git pull` si hubo cambios bajo `prisma/migrations/`.

Con eso deberías tener el mismo stack que en tu PC actual para seguir desarrollando en el del trabajo.
