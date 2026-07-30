"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/toast-host";
import { cn } from "@/lib/utils";

type AssignmentRule = {
  id: string;
  active: boolean;
  sortOrder: number;
  operator: string | null;
  lineaMatch: string | null;
  shift: string | null;
  userId: string;
  userName: string;
};

type EscalationRules = {
  unassignedAltaMinutes: number;
  unassignedMediaMinutes: number;
  unassignedBajaMinutes: number;
  slaWarnMinutes: number;
  staleTicketHours: number;
  autoAssignEnabled: boolean;
  slaReassignEnabled: boolean;
};

type Technician = { id: string; name: string };

export function OperacionAutomaticaPanel() {
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [escalation, setEscalation] = useState<EscalationRules | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingEsc, setSavingEsc] = useState(false);
  const [newRule, setNewRule] = useState({ userId: "", operator: "", lineaMatch: "", shift: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, escRes, usersRes] = await Promise.all([
        fetch("/api/assignment-rules", { cache: "no-store" }),
        fetch("/api/escalation-config", { cache: "no-store" }),
        fetch("/api/users/manage", { cache: "no-store" }),
      ]);
      if (rulesRes.ok) {
        const data = (await rulesRes.json()) as { rules: AssignmentRule[] };
        setRules(data.rules ?? []);
      }
      if (escRes.ok) {
        const data = (await escRes.json()) as { rules: EscalationRules };
        setEscalation(data.rules);
      }
      if (usersRes.ok) {
        const data = (await usersRes.json()) as { users?: Array<Technician & { role?: string; isActive?: boolean }> };
        setTechnicians(
          (data.users ?? []).filter((u) => u.role === "tecnico_campo" && u.isActive !== false).map((u) => ({
            id: u.id,
            name: u.name,
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addRule = async () => {
    if (!newRule.userId) {
      toast.error("Selecciona un técnico");
      return;
    }
    const res = await fetch("/api/assignment-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: newRule.userId,
        operator: newRule.operator || null,
        lineaMatch: newRule.lineaMatch || null,
        shift: newRule.shift || null,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      toast.error(data.message ?? "No se pudo crear la regla");
      return;
    }
    toast.success("Regla creada");
    setNewRule({ userId: "", operator: "", lineaMatch: "", shift: "" });
    await load();
  };

  const toggleRule = async (rule: AssignmentRule) => {
    const res = await fetch(`/api/assignment-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !rule.active }),
    });
    if (!res.ok) {
      toast.error("No se pudo actualizar");
      return;
    }
    await load();
  };

  const deleteRule = async (id: string) => {
    const res = await fetch(`/api/assignment-rules/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("No se pudo eliminar");
      return;
    }
    toast.success("Regla eliminada");
    await load();
  };

  const saveEscalation = async () => {
    if (!escalation) return;
    setSavingEsc(true);
    try {
      const res = await fetch("/api/escalation-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(escalation),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error(data.message ?? "No se pudo guardar");
        return;
      }
      toast.success("Escalado actualizado");
    } finally {
      setSavingEsc(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-1)]">Reglas de asignación automática</h2>
        <p className="mt-1 text-xs text-[var(--color-text-3)]">
          Se evalúan en orden. La primera coincidencia asigna el ticket al técnico indicado.
        </p>
        <div className="mt-4 space-y-2">
          {rules.length === 0 ? (
            <p className="text-xs text-[var(--color-text-3)]">Sin reglas configuradas.</p>
          ) : (
            rules.map((rule) => (
              <div
                key={rule.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs"
              >
                <button
                  type="button"
                  onClick={() => void toggleRule(rule)}
                  className={cn(
                    "rounded-full px-2 py-0.5 font-semibold",
                    rule.active ? "bg-emerald-500/15 text-emerald-300" : "bg-[var(--color-surface-2)] text-[var(--color-text-3)]",
                  )}
                >
                  {rule.active ? "Activa" : "Inactiva"}
                </button>
                <span className="font-medium text-[var(--color-text-1)]">{rule.userName}</span>
                {rule.operator ? <span className="text-[var(--color-text-3)]">· {rule.operator}</span> : null}
                {rule.lineaMatch ? <span className="text-[var(--color-text-3)]">· línea {rule.lineaMatch}</span> : null}
                {rule.shift ? <span className="text-[var(--color-text-3)]">· turno {rule.shift}</span> : null}
                <button
                  type="button"
                  onClick={() => void deleteRule(rule.id)}
                  className="ml-auto text-[var(--color-error)] hover:underline"
                  title="Eliminar regla"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <select
            value={newRule.userId}
            onChange={(e) => setNewRule((p) => ({ ...p, userId: e.target.value }))}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-xs"
          >
            <option value="">Técnico…</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Input
            placeholder="Operadora (opc.)"
            value={newRule.operator}
            onChange={(e) => setNewRule((p) => ({ ...p, operator: e.target.value }))}
            className="h-8 text-xs"
          />
          <Input
            placeholder="Línea (opc.)"
            value={newRule.lineaMatch}
            onChange={(e) => setNewRule((p) => ({ ...p, lineaMatch: e.target.value }))}
            className="h-8 text-xs"
          />
          <Input
            placeholder="Turno M/T/N"
            value={newRule.shift}
            onChange={(e) => setNewRule((p) => ({ ...p, shift: e.target.value.toUpperCase() }))}
            className="h-8 text-xs"
            maxLength={1}
          />
          <Button type="button" size="sm" onClick={() => void addRule()} className="h-8 gap-1 text-xs">
            <Plus size={14} aria-hidden />
            Añadir
          </Button>
        </div>
      </section>

      {escalation ? (
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-1)]">Escalado y SLA</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["unassignedAltaMinutes", "Sin asignar · alta (min)"],
                ["unassignedMediaMinutes", "Sin asignar · media (min)"],
                ["unassignedBajaMinutes", "Sin asignar · baja (min)"],
                ["slaWarnMinutes", "Aviso SLA (min)"],
                ["staleTicketHours", "Ticket estancado (h)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-xs">
                <span className="text-[var(--color-text-3)]">{label}</span>
                <Input
                  type="number"
                  min={1}
                  value={escalation[key]}
                  onChange={(e) =>
                    setEscalation((p) => (p ? { ...p, [key]: Number(e.target.value) } : p))
                  }
                  className="mt-1 h-8"
                />
              </label>
            ))}
            <label className="flex items-center gap-2 text-xs text-[var(--color-text-2)]">
              <input
                type="checkbox"
                checked={escalation.autoAssignEnabled}
                onChange={(e) =>
                  setEscalation((p) => (p ? { ...p, autoAssignEnabled: e.target.checked } : p))
                }
              />
              Auto-asignación activa
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--color-text-2)]">
              <input
                type="checkbox"
                checked={escalation.slaReassignEnabled}
                onChange={(e) =>
                  setEscalation((p) => (p ? { ...p, slaReassignEnabled: e.target.checked } : p))
                }
              />
              Reasignar por SLA
            </label>
          </div>
          <Button type="button" size="sm" className="mt-4" disabled={savingEsc} onClick={() => void saveEscalation()}>
            {savingEsc ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
            Guardar escalado
          </Button>
        </section>
      ) : null}
    </div>
  );
}
