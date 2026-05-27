/**
 * Generador automático de "Novedades" leyendo `git log` del repositorio.
 *
 * Diseñado para que Saúl (único autorizado) genere borradores de changelog
 * desde el último announcement de tipo `novedad` publicado, sin tener que
 * escribir manualmente la lista de cambios.
 *
 * Estrategia:
 *  1. Calcula `since` = `createdAt` del último Announcement `kind=novedad`
 *     publicado. Si no hay ninguno, se usan los últimos 14 días.
 *  2. `git log --no-merges --pretty=...` desde `since` hasta HEAD.
 *  3. Clasifica cada commit por keywords en castellano + inglés en tres
 *     grupos: **Nuevas funcionalidades**, **Correcciones**, **Mejoras y
 *     mantenimiento**.
 *  4. Genera un borrador Markdown listo para publicar.
 *
 * Importante: NO ejecuta nada en la base de datos. Solo devuelve el borrador
 * para que el usuario lo revise/edite y lo publique con el flujo normal de
 * `POST /api/announcements`.
 */

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitCommit = {
  hash: string;
  shortHash: string;
  date: string;
  author: string;
  subject: string;
};

export type ChangelogDraft = {
  title: string;
  bodyMd: string;
  commits: GitCommit[];
  since: string | null;
  /** Ruta de git utilizada (para debug en caso de fallo en producción). */
  repoCwd: string;
};

const KEYWORDS_FEAT =
  /\b(feat|feature|añad|anad|nuev[oa]|implement|agreg|crea|incluy|incorpor|introdu)/i;
const KEYWORDS_FIX =
  /\b(fix|bug|err|arregl|corrig|correc|resuelv|repar|soluc|hotfix)/i;
const KEYWORDS_NOISE =
  /\b(merge\s|wip|tmp|temporal|test commit|\.\.\.)/i;

function classify(subject: string): "feat" | "fix" | "other" {
  if (KEYWORDS_FEAT.test(subject)) return "feat";
  if (KEYWORDS_FIX.test(subject)) return "fix";
  return "other";
}

function cleanSubject(subject: string): string {
  // Quita prefijos conventional commit (feat:, fix(scope):, etc.) si existen.
  return subject
    .replace(/^(feat|fix|chore|docs|build|ci|refactor|perf|style|test)(\([^)]*\))?:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCanaryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    timeZone: "Atlantic/Canary",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export async function buildChangelogDraftFromGit(options: {
  since: Date | null;
  /** cwd del repo. Por defecto process.cwd() (raíz del proyecto). */
  cwd?: string;
  /** Máximo de commits a leer (defensa contra logs gigantes). */
  maxCommits?: number;
  /** Timeout en ms para matar git si se cuelga. Por defecto 10s. */
  timeoutMs?: number;
}): Promise<ChangelogDraft> {
  const cwd = options.cwd ?? process.cwd();
  const maxCommits = options.maxCommits ?? 200;
  const since = options.since ?? new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const timeoutMs = options.timeoutMs ?? 10_000;

  // %H = hash full, %h = short, %aI = author date ISO, %an = author name, %s = subject
  const FORMAT = "%H|%h|%aI|%an|%s";
  // `safe.directory=*`: el servicio corre como NT AUTHORITY\SYSTEM y el repo
  // pertenece al usuario `Incidencias`. Sin este flag git rechazaría operar
  // por la protección CVE-2022-24765 ("detected dubious ownership"). Lo
  // pasamos en línea con `-c` para no modificar la config global del sistema.
  const args = [
    "-c",
    "safe.directory=*",
    "-c",
    "core.quotepath=false",
    "log",
    "--no-merges",
    `--since=${since.toISOString()}`,
    `--max-count=${maxCommits}`,
    `--pretty=format:${FORMAT}`,
    "HEAD",
  ];

  // Variables de entorno defensivas:
  //  - HOME/USERPROFILE: que apunten al cwd para que git no intente leer
  //    config de un home inaccesible (LocalSystem no tiene perfil de usuario).
  //  - GIT_TERMINAL_PROMPT=0: nunca pidas credenciales (evita colgarse).
  //  - GIT_OPTIONAL_LOCKS=0: no intentes adquirir locks lentos.
  const env = {
    ...process.env,
    HOME: process.env.HOME ?? cwd,
    USERPROFILE: process.env.USERPROFILE ?? cwd,
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
  };

  let stdout = "";
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      env,
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
    stdout = result.stdout;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[changelog-from-git] git falló:", detail, { cwd, args });
    return {
      title: `Novedades (sin commits detectados)`,
      bodyMd:
        `> No se pudo leer el historial de git desde el servidor.\n\n` +
        `_Detalle técnico:_ \`${detail}\`\n\n` +
        `_Repo:_ \`${cwd}\``,
      commits: [],
      since: since.toISOString(),
      repoCwd: cwd,
    };
  }

  const commits: GitCommit[] = stdout
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [hash, shortHash, date, author, ...rest] = line.split("|");
      return {
        hash: hash ?? "",
        shortHash: shortHash ?? "",
        date: date ?? "",
        author: author ?? "",
        subject: (rest.join("|") ?? "").trim(),
      };
    })
    .filter((c) => c.hash && c.subject && !KEYWORDS_NOISE.test(c.subject));

  const feats: GitCommit[] = [];
  const fixes: GitCommit[] = [];
  const others: GitCommit[] = [];
  for (const c of commits) {
    const cls = classify(c.subject);
    if (cls === "feat") feats.push(c);
    else if (cls === "fix") fixes.push(c);
    else others.push(c);
  }

  // Construcción del bodyMd
  const totalCount = commits.length;
  const fromLabel = formatCanaryDate(since.toISOString());
  const toLabel = formatCanaryDate(new Date().toISOString());
  const title = `Novedades · ${toLabel}`;

  const lines: string[] = [];
  lines.push(
    `_${totalCount} cambio${totalCount === 1 ? "" : "s"} desde ${fromLabel} hasta ${toLabel}._`,
  );
  lines.push("");

  if (feats.length > 0) {
    lines.push("### Nuevas funcionalidades");
    for (const c of feats) {
      lines.push(`- ${cleanSubject(c.subject)} _(${c.shortHash})_`);
    }
    lines.push("");
  }
  if (fixes.length > 0) {
    lines.push("### Correcciones");
    for (const c of fixes) {
      lines.push(`- ${cleanSubject(c.subject)} _(${c.shortHash})_`);
    }
    lines.push("");
  }
  if (others.length > 0) {
    lines.push("### Mejoras y mantenimiento");
    for (const c of others) {
      lines.push(`- ${cleanSubject(c.subject)} _(${c.shortHash})_`);
    }
    lines.push("");
  }

  if (totalCount === 0) {
    lines.length = 0;
    lines.push(
      `_No se han detectado commits nuevos desde ${fromLabel}. Si los cambios están en el árbol de trabajo sin commitear, escribe la novedad manualmente._`,
    );
  }

  lines.push("---");
  lines.push("");
  lines.push(`_Borrador generado automáticamente desde el repositorio en \`${path.basename(cwd)}\`. Revísalo y edítalo antes de publicar._`);

  return {
    title,
    bodyMd: lines.join("\n"),
    commits,
    since: since.toISOString(),
    repoCwd: cwd,
  };
}
