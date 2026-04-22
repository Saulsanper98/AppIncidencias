"use client";

import { LayoutDashboard, Plus, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/section-header";
import type { SessionUser, UserRole } from "@/lib/domain";
import { cn } from "@/lib/utils";

type DashboardListItem = {
  id: string;
  name: string;
  createdAt: string;
  createdByUserId: string | null;
  widgets: Array<{ id: string }>;
};

export default function DashboardsPage() {
  const [dashboards, setDashboards] = useState<DashboardListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>("conductor");
  const [newName, setNewName] = useState("");
  const [preferredDashboardId, setPreferredDashboardId] = useState<string | null>(null);
  const [prefMessage, setPrefMessage] = useState<string | null>(null);

  const fetchDashboards = async () => {
    const response = await fetch("/api/dashboards", { cache: "no-store" });
    const payload = (await response.json()) as { dashboards?: DashboardListItem[]; message?: string };
    if (!response.ok) {
      throw new Error(payload.message ?? "No se pudieron cargar los dashboards");
    }
    setDashboards(payload.dashboards ?? []);
  };

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
        const sessionData = (await sessionResponse.json()) as { authenticated: boolean; user?: SessionUser };
        if (sessionData.authenticated && sessionData.user) {
          setRole(sessionData.user.role);
          setPreferredDashboardId(sessionData.user.preferredDashboardId ?? null);
        }

        await fetchDashboards();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los dashboards");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleCreate = async () => {
    try {
      setError(null);
      const response = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "No se pudo crear el dashboard");
      }
      setNewName("");
      await fetchDashboards();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "No se pudo crear el dashboard");
    }
  };

  const patchPreferredDashboard = async (id: string | null) => {
    try {
      setPrefMessage(null);
      const response = await fetch("/api/auth/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ preferredDashboardId: id }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "No se pudo guardar la preferencia");
      }
      setPreferredDashboardId(id);
      setPrefMessage(id ? "Este panel se abrirá al ir a Dashboard." : "Se mostrará de nuevo el panel operativo estándar.");
    } catch (prefError) {
      setPrefMessage(prefError instanceof Error ? prefError.message : "No se pudo guardar la preferencia");
    }
  };

  const handleDelete = async (dashboardId: string) => {
    try {
      setError(null);
      const response = await fetch(`/api/dashboards/${dashboardId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "No se pudo borrar el dashboard");
      }
      await fetchDashboards();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo borrar el dashboard");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-[var(--color-surface-2)]" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-36 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Custom Dashboards" description="Crea paneles personalizados para operación y análisis." />

      {preferredDashboardId ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-2)]">
          <span>Tienes un panel personalizado como inicio.</span>
          <button
            type="button"
            onClick={() => void patchPreferredDashboard(null)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs font-medium text-[var(--color-text-1)] hover:bg-[var(--color-surface-3)]"
          >
            Restaurar panel estándar
          </button>
        </div>
      ) : null}

      {prefMessage ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-text-2)]">
          {prefMessage}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-4 py-3 text-sm text-[var(--color-error)]">
          {error}
        </div>
      ) : null}

      {role === "gestor_centro_control" ? (
        <div className="mb-6 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre del dashboard"
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-all"
          />
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[var(--color-accent-hover)]"
          >
            <Plus size={15} />
            Crear
          </button>
        </div>
      ) : null}

      {dashboards.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] py-20 text-center">
          <LayoutDashboard size={40} className="mb-3 text-[var(--color-text-3)]" />
          <p className="text-subheading text-[var(--color-text-2)]">Sin dashboards</p>
          <p className="mt-1 text-caption">
            {role === "gestor_centro_control"
              ? "Crea el primero con el formulario"
              : "El gestor aún no ha creado dashboards"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dashboards.map((dashboard) => (
            <div
              key={dashboard.id}
              className="relative group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-hover)] transition-all"
            >
              <Link href={`/dashboards/${dashboard.id}`} prefetch={false} className="block p-5 pr-14">
                <h3 className="text-subheading pr-1">{dashboard.name}</h3>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-caption">
                    <span>Creado {new Date(dashboard.createdAt).toLocaleDateString("es-ES")}</span>
                    <span className="text-[var(--color-text-3)]">·</span>
                    <span>
                      {dashboard.widgets.length === 0
                        ? "Vacío"
                        : `${dashboard.widgets.length} elemento${dashboard.widgets.length !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                  <Badge variant="neutral" className="flex-shrink-0">
                    {dashboard.widgets.length} {dashboard.widgets.length === 1 ? "widget" : "widgets"}
                  </Badge>
                </div>
              </Link>
              <div className="absolute right-2 top-2 z-10 flex flex-col gap-1 sm:flex-row sm:items-center">
                <button
                  type="button"
                  title={
                    preferredDashboardId === dashboard.id
                      ? "Es tu panel principal"
                      : "Marcar como panel principal al abrir Dashboard"
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void patchPreferredDashboard(preferredDashboardId === dashboard.id ? null : dashboard.id);
                  }}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-[var(--color-text-3)] transition-all hover:bg-[var(--color-surface-3)] hover:text-[var(--color-accent)]",
                    preferredDashboardId === dashboard.id && "text-[var(--color-accent)]",
                  )}
                >
                  <Star size={14} className={preferredDashboardId === dashboard.id ? "fill-current" : undefined} />
                </button>
                {role === "gestor_centro_control" ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleDelete(dashboard.id);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-3)] opacity-0 transition-all hover:text-[var(--color-error)] hover:bg-[var(--color-error-light)] group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
