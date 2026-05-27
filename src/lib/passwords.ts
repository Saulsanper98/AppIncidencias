import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

/** Reglas mínimas de contraseña: 10+ chars, al menos 1 letra y 1 dígito. */
export const PASSWORD_MIN_LENGTH = 10;

export type PasswordValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export function validatePasswordStrength(password: string): PasswordValidationResult {
  if (typeof password !== "string") {
    return { ok: false, message: "La contraseña es obligatoria." };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.` };
  }
  if (password.length > 200) {
    return { ok: false, message: "La contraseña es demasiado larga (máx 200 caracteres)." };
  }
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    return { ok: false, message: "Incluye al menos una letra y un dígito." };
  }
  return { ok: true };
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

export async function verifyPassword(plainPassword: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plainPassword, hash);
  } catch {
    return false;
  }
}

/**
 * Genera una contraseña temporal legible y "razonablemente segura" para
 * altas administrativas o resets: 14 caracteres alfanuméricos + guiones.
 * Se mostrará UNA VEZ al administrador y el usuario deberá cambiarla al
 * primer login (mustChangePassword=true).
 */
export function generateTemporaryPassword(): string {
  const lower = "abcdefghijkmnpqrstuvwxyz"; // sin l/o
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin I/O
  const digits = "23456789"; // sin 0/1
  const all = lower + upper + digits;

  const rand = (chars: string) => chars[Math.floor(Math.random() * chars.length)];

  // Garantizamos al menos un caracter de cada grupo para cumplir validateStrength.
  const required = [rand(upper), rand(lower), rand(digits), rand(digits)];
  while (required.length < 14) required.push(rand(all));

  for (let i = required.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [required[i], required[j]] = [required[j], required[i]];
  }

  return required.join("");
}
