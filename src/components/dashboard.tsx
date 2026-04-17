"use client";

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPinned,
  Search,
  Wrench,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DashboardPreventiveAgenda } from "@/components/dashboard-preventive-agenda";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/section-header";
import { activeIncidents, fleetKpis, knowledgeShortcuts } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const toneVariant = {
  neutral: "neutral",
  success: "success",
  critical: "error",
} as const;

const statusVariant = {
  Abierto: "error",
  "En Proceso": "warning",
  "Esperando Repuesto": "info",
  Resuelto: "success",
} as const;

const chartData = [
  { day: "Lun", abierto: 4, en_proceso: 6, resuelto: 3 },
  { day: "Mar", abierto: 6, en_proceso: 5, resuelto: 5 },
  { day: "Mie", abierto: 5, en_proceso: 8, resuelto: 4 },
  { day: "Jue", abierto: 8, en_proceso: 6, resuelto: 7 },
  { day: "Vie", abierto: 7, en_proceso: 9, resuelto: 6 },
  { day: "Sab", abierto: 3, en_proceso: 4, resuelto: 8 },
  { day: "Dom", abierto: 2, en_proceso: 3, resuelto: 9 },
];

const municipalityIncidents = [
  { name: "Las Palmas GC", count: 8 },
  { name: "Telde", count: 4 },
  { name: "Maspalomas", count: 3 },
  { name: "Arucas", count: 2 },
];

const flowSteps = ["Abierto", "En Proceso", "Esperando Repuesto", "Resuelto"];
const kpiIcons = [AlertCircle, Activity, Clock, CheckCircle2] as const;

const getMunicipalityDotClass = (count: number) => {
  if (count >= 6) return "bg-[var(--color-error)]";
  if (count >= 3) return "bg-[var(--color-warning)]";
  return "bg-[var(--color-success)]";
};

export function Dashboard() {
  return (
    <div className="space-y-4">
      <SectionHeader title="Panel operativo" description="Control en tiempo real · Flota de Gran Canaria" />

      <section>
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {fleetKpis.map((kpi) => (
          <article
            key={kpi.label}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-all duration-200 hover:border-[var(--color-border-hover)]"
          >
            <p className="flex items-center gap-1.5 text-label">
              {(() => {
                const Icon = kpiIcons[fleetKpis.indexOf(kpi)] ?? AlertCircle;
                return <Icon size={13} className="text-[var(--color-text-3)]" />;
              })()}
              {kpi.label}
            </p>
            <p className="mt-2 tabular-nums text-3xl font-semibold text-[var(--color-text-1)]">{kpi.value}</p>
            <Badge variant={toneVariant[kpi.tone]} className="mt-3">
              {kpi.trend}
            </Badge>
          </article>
        ))}
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_340px]">
          <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="mb-4 flex items-center justify-between">
              <h3 className="text-subheading">Incidencias activas</h3>
              <Badge variant="error" className="inline-flex items-center gap-1.5">
                <AlertTriangle size={12} />
              Priorización SLA automática
              </Badge>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full min-w-[660px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
                <tr>
                    <th className="w-24 border-b border-[var(--color-border)] pb-3 font-medium">Ticket</th>
                    <th className="w-40 border-b border-[var(--color-border)] pb-3 font-medium">Bus / Operadora</th>
                    <th className="w-28 border-b border-[var(--color-border)] pb-3 font-medium">Equipo</th>
                    <th className="w-36 border-b border-[var(--color-border)] pb-3 font-medium">Estado</th>
                    <th className="w-28 border-b border-[var(--color-border)] pb-3 font-medium">SLA</th>
                </tr>
              </thead>
              <tbody>
                {activeIncidents.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="cursor-pointer border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface-2)] last:border-0"
                    >
                      <td className="w-24 py-3 text-sm text-[var(--color-text-1)]">{ticket.id}</td>
                    <td className="w-40 py-3">
                        <p className="text-sm font-medium text-[var(--color-text-1)]">{ticket.bus}</p>
                        <p className="text-xs text-[var(--color-text-3)]">{ticket.operator}</p>
                    </td>
                      <td className="w-28 py-3 text-sm text-[var(--color-text-1)]">{ticket.equipo}</td>
                    <td className="w-36 py-3">
                        <Badge variant={statusVariant[ticket.estado]}>{ticket.estado}</Badge>
                      </td>
                      <td className="w-28 py-3 text-sm">
                        {ticket.slaMinutes === 0 ? (
                          <Badge variant="success">Completado</Badge>
                        ) : (
                          <span
                            className={cn(
                              ticket.slaMinutes < 30
                                ? "font-medium text-[var(--color-error)]"
                                : ticket.slaMinutes < 120
                                  ? "text-[var(--color-warning)]"
                                  : "text-[var(--color-text-2)]",
                            )}
                          >
                            {ticket.slaMinutes} min
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="min-h-[200px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h3 className="text-subheading">Tendencia de tickets</h3>
            <p className="mt-1 text-caption">Ultimos 7 dias (datos demo)</p>
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "var(--color-text-3)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fill: "var(--color-text-3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-surface-3)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    labelStyle={{ color: "var(--color-text-1)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="abierto"
                    stroke="#DC2626"
                    fill="#DC2626"
                    fillOpacity={0.12}
                    strokeWidth={1.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="en_proceso"
                    stroke="#D97706"
                    fill="#D97706"
                    fillOpacity={0.1}
                    strokeWidth={1.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="resuelto"
                    stroke="#059669"
                    fill="#059669"
                    fillOpacity={0.1}
                    strokeWidth={1.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-3 flex gap-4 text-[11px] text-[var(--color-text-3)]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#DC2626]" />
                  Abierto
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#D97706]" />
                  En proceso
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#059669]" />
                  Resuelto
                </span>
              </div>
            </div>
          </article>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <article className="min-h-[200px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="flex items-center gap-2">
              <MapPinned size={16} className="text-[var(--color-text-3)]" />
              <h3 className="text-subheading">Mapa de incidencias</h3>
            </div>
            <ul className="mt-4 space-y-2">
              {municipalityIncidents.map((item) => (
                <li key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", getMunicipalityDotClass(item.count))} />
                    <span className="text-[var(--color-text-1)]">{item.name}</span>
                  </div>
                  <span className="text-caption">
                    {item.count} inc.
                  </span>
                </li>
              ))}
            </ul>
          </article>

          <DashboardPreventiveAgenda />

          <article className="min-h-[200px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-[var(--color-text-3)]" />
              <h3 className="text-subheading">Base de conocimiento</h3>
            </div>
            <div className="mt-4 space-y-2">
              {knowledgeShortcuts.map((entry) => (
                <button
                  key={entry}
                  className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-left text-sm text-[var(--color-text-2)] transition-all duration-150 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]"
                >
                  <span>{entry}</span>
                  <ChevronRight size={14} className="shrink-0 text-[var(--color-text-3)]" />
                </button>
              ))}
            </div>
          </article>

          <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="flex items-center gap-2">
              <Wrench size={16} className="text-[var(--color-text-3)]" />
              <h3 className="text-subheading">Flujo de ticketing</h3>
            </div>
            <div className="mt-4">
              {flowSteps.map((step, index) => (
                <div key={step}>
                  <div className="flex items-center gap-3 py-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[11px] font-medium text-[var(--color-accent)]">
                      {index + 1}
                    </span>
                    <span className="text-sm text-[var(--color-text-2)]">{step}</span>
                  </div>
                  {index < flowSteps.length - 1 ? <div className="ml-3 h-3 w-px bg-[var(--color-border)]" /> : null}
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
