export type FalloOrigen = "maquina" | "conductor" | "externo";

export const FALLO_ORIGEN_OPTIONS: { value: FalloOrigen; label: string; hint: string }[] = [
  { value: "maquina", label: "Máquina / implementación", hint: "Fallo del equipo o de la instalación" },
  { value: "conductor", label: "Conductor", hint: "Uso, operativa o error del conductor" },
  { value: "externo", label: "Externo / otro", hint: "Terceros, infraestructura o desconocido" },
];

export function falloOrigenLabel(value: FalloOrigen | string | null | undefined): string {
  const found = FALLO_ORIGEN_OPTIONS.find((o) => o.value === value);
  return found?.label ?? "—";
}

export function isFalloOrigen(value: unknown): value is FalloOrigen {
  return value === "maquina" || value === "conductor" || value === "externo";
}
