"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CatalogAsset = {
  id: string;
  type: string;
  serialNumber: string;
  slaMinutes?: number | null;
};

type CatalogBus = {
  id: string;
  operator: string;
  municipio: string;
  lineas: string[];
  assets: CatalogAsset[];
};

type CatalogResponse = {
  buses: CatalogBus[];
};

export function CatalogAdminPanel() {
  const [buses, setBuses] = useState<CatalogBus[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ id: "", operator: "", municipio: "", lineas: "" });
  const [slaDrafts, setSlaDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const response = await fetch("/api/catalog", { cache: "no-store" });
    const data = (await response.json()) as CatalogResponse;
    const next = data.buses ?? [];
    setBuses(next);
    const drafts: Record<string, string> = {};
    for (const bus of next) {
      for (const a of bus.assets) {
        drafts[a.id] = a.slaMinutes != null ? String(a.slaMinutes) : "";
      }
    }
    setSlaDrafts(drafts);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const flatAssets = useMemo(
    () => buses.flatMap((bus) => bus.assets.map((a) => ({ ...a, busId: bus.id }))),
    [buses],
  );

  const createBus = async () => {
    const payload = {
      id: form.id.trim(),
      operator: form.operator.trim(),
      municipio: form.municipio.trim(),
      lineas: form.lineas
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const response = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setNotice("No se pudo crear el bus.");
      return;
    }
    setForm({ id: "", operator: "", municipio: "", lineas: "" });
    await load();
    setNotice("Bus creado.");
  };

  const deleteBus = async (id: string) => {
    const response = await fetch(`/api/catalog?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      setNotice("No se pudo eliminar el bus.");
      return;
    }
    await load();
    setNotice("Bus eliminado.");
  };

  const saveAssetSla = async (assetId: string) => {
    const raw = slaDrafts[assetId]?.trim() ?? "";
    const payload = raw === "" ? { slaMinutes: null } : { slaMinutes: Number.parseInt(raw, 10) };
    if (raw !== "" && (!Number.isFinite(payload.slaMinutes as number) || (payload.slaMinutes as number) < 5)) {
      setNotice("SLA inválido: use un entero ≥ 5 minutos o deje vacío.");
      return;
    }
    const response = await fetch(`/api/catalog/assets/${encodeURIComponent(assetId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setNotice("No se pudo guardar el SLA del activo.");
      return;
    }
    await load();
    setNotice("SLA del activo actualizado.");
  };

  if (loading) {
    return <div className="h-32 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h1 className="text-subheading">Gestión de catálogo</h1>
        <p className="mt-1 text-sm text-[var(--color-text-3)]">Alta y baja de buses del catálogo operativo.</p>
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            placeholder="ID bus (p.ej. GC-120)"
            value={form.id}
            onChange={(e) => setForm((p) => ({ ...p, id: e.target.value }))}
          />
          <input
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            placeholder="Operadora"
            value={form.operator}
            onChange={(e) => setForm((p) => ({ ...p, operator: e.target.value }))}
          />
          <input
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            placeholder="Municipio"
            value={form.municipio}
            onChange={(e) => setForm((p) => ({ ...p, municipio: e.target.value }))}
          />
          <input
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            placeholder="Líneas (1,12,26)"
            value={form.lineas}
            onChange={(e) => setForm((p) => ({ ...p, lineas: e.target.value }))}
          />
        </div>
        <button
          type="button"
          onClick={() => void createBus()}
          className="mt-3 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white"
        >
          Crear bus
        </button>
        {notice ? <p className="mt-2 text-xs text-[var(--color-text-2)]">{notice}</p> : null}
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-subheading">SLA por activo</h2>
        <p className="mt-1 text-sm text-[var(--color-text-3)]">
          Minutos hasta el vencimiento al crear un ticket. Vacío = usar SLA según prioridad del ticket.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-[11px] uppercase text-[var(--color-text-3)]">
              <tr>
                <th className="border-b border-[var(--color-border)] pb-2">Bus</th>
                <th className="border-b border-[var(--color-border)] pb-2">Activo</th>
                <th className="border-b border-[var(--color-border)] pb-2">Tipo</th>
                <th className="border-b border-[var(--color-border)] pb-2">SLA (min)</th>
                <th className="border-b border-[var(--color-border)] pb-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {flatAssets.map((row) => (
                <tr key={row.id}>
                  <td className="py-2 font-mono text-xs">{row.busId}</td>
                  <td className="py-2 font-mono text-xs">{row.id}</td>
                  <td className="py-2">{row.type}</td>
                  <td className="py-2">
                    <input
                      type="number"
                      min={5}
                      className="w-24 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs"
                      value={slaDrafts[row.id] ?? ""}
                      onChange={(e) => setSlaDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                      placeholder="auto"
                    />
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => void saveAssetSla(row.id)}
                      className="rounded border border-[var(--color-border)] px-2 py-1 text-xs"
                    >
                      Guardar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-subheading">Buses actuales</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-[11px] uppercase text-[var(--color-text-3)]">
              <tr>
                <th className="border-b border-[var(--color-border)] pb-2">ID</th>
                <th className="border-b border-[var(--color-border)] pb-2">Operadora</th>
                <th className="border-b border-[var(--color-border)] pb-2">Municipio</th>
                <th className="border-b border-[var(--color-border)] pb-2">Líneas</th>
                <th className="border-b border-[var(--color-border)] pb-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {buses.map((bus) => (
                <tr key={bus.id}>
                  <td className="py-2">{bus.id}</td>
                  <td className="py-2">{bus.operator}</td>
                  <td className="py-2">{bus.municipio}</td>
                  <td className="py-2">{bus.lineas.join(", ")}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => void deleteBus(bus.id)}
                      className="rounded border border-[var(--color-border)] px-2 py-1 text-xs"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
