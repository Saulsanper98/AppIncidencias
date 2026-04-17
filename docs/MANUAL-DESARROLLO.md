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

> **No hace falta** instalar Tailwind, TypeScript o ESLint “a mano”: vienen como dependencias del proyecto.

---

## 5. Base de datos (Prisma + SQLite)

La primera vez (o en un PC nuevo sin `prisma/dev.db`):

```bash
npx prisma migrate deploy
```

- Aplica todas las migraciones de `prisma/migrations/` y crea/actualiza `dev.db`.

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

---

## 6. Arrancar la aplicación en desarrollo

```bash
npm run dev
```

Por defecto Next suele servir en **http://localhost:3000**. Abre esa URL en el navegador.

- El script usa **Turbopack** (`next dev --turbopack`).
- En **modo desarrollo**, el selector de usuario simulado en login suele estar activo (ver `src/lib/dev-auth.ts`): puedes entrar como distintos roles si hay usuarios en la BD.

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
| Prisma no encuentra la BD | Comprueba que existe `.env` con `DATABASE_URL` y ejecuta `npx prisma migrate deploy`. |
| Puerto 3000 ocupado | Cierra el otro proceso o ejecuta `npx next dev -p 3001` (o el puerto que quieras). |
| Políticas del trabajo (proxy, antivirus) | Permite Node/npm en red; a veces hace falta configurar proxy corporativo para `npm install`. |

---

## 10. Resumen mínimo (checklist)

1. Instalar **Node.js 20+** y **Git**.  
2. Clonar / copiar el repo y entrar en **`ccmgc-ticketing`**.  
3. **`copy .env.example .env`** (o crear `.env` con la misma `DATABASE_URL`).  
4. **`npm install`**.  
5. **`npx prisma migrate deploy`**.  
6. **`npm run dev`** → navegador en `http://localhost:3000`.  
7. (Opcional) **`npx playwright install`** si vas a correr E2E.

Con eso deberías tener el mismo stack que en tu PC actual para seguir desarrollando en el del trabajo.
