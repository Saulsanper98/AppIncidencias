"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookmarkPlus, Layers, Loader2, Trash2, Users } from "lucide-react";

import { CreateTicketTemplateDialog } from "@/components/tickets/CreateTicketTemplateDialog";
import { ManageSectionCard } from "@/components/tickets/ManageSectionCard";
import type { TicketTemplate } from "@/components/tickets/TicketTemplatePicker";
import type { SessionUser } from "@/lib/domain";
import { isGroupTicketTemplateScope, ticketTemplateScopeLabel } from "@/lib/ticket-templates";
import type { TipologiaItem } from "@/lib/tipologia";
import { cn } from "@/lib/utils";

import "./ticket-templates.css";

type Props = {
  sessionUser: SessionUser | null;
  tipologias: TipologiaItem[];
  /** Versión compacta para modales (sin marco exterior). */
  compact?: boolean;
  /** Al crear o eliminar, notifica al padre para refrescar listas externas. */
  onTemplatesChange?: () => void;
};

function templateSubtitle(tpl: TicketTemplate): string {
  const tipologia = [tpl.tipo, tpl.subtipo, tpl.subsubtipo].filter(Boolean).join(" · ");
  if (tipologia) return tipologia;
  if (tpl.description?.trim()) return tpl.description.trim().slice(0, 72);
  return "Sin detalles";
}

export function TicketTemplatesPanel({
  sessionUser,
  tipologias,
  compact = false,
  onTemplatesChange,
}: Props) {
  const [templates, setTemplates] = useState<TicketTemplate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets/templates", { cache: "no-store" });
      if (!res.ok) {
        setError("No se pudieron cargar las plantillas");
        return;
      }
      const data = (await res.json()) as { templates: TicketTemplate[] };
      setTemplates(data.templates ?? []);
    } catch {
      setError("No se pudieron cargar las plantillas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (templates === null && !loading) {
      void loadTemplates();
    }
  }, [templates, loading, loadTemplates]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncFromHash = () => {
      if (window.location.hash === "#ticket-templates-panel") {
        setForceOpen(true);
      }
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const deleteTemplate = useCallback(
    async (tpl: TicketTemplate) => {
      if (!tpl.canEdit) return;
      const ok = window.confirm(`¿Eliminar la plantilla "${tpl.name}"?`);
      if (!ok) return;
      const res = await fetch(`/api/tickets/templates/${tpl.id}`, { method: "DELETE" });
      if (res.ok) {
        setTemplates((prev) => (prev ?? []).filter((t) => t.id !== tpl.id));
        onTemplatesChange?.();
      }
    },
    [onTemplatesChange],
  );

  const grouped = useMemo(() => {
    if (!templates) return [] as { key: string; label: string; items: TicketTemplate[] }[];
    const byKey = new Map<string, { key: string; label: string; items: TicketTemplate[] }>();
    for (const t of templates) {
      const scopeLabel = ticketTemplateScopeLabel(t.scope);
      const key = `${t.scope}::${t.category ?? "—"}`;
      const label = `${scopeLabel}${t.category ? ` · ${t.category}` : ""}`;
      if (!byKey.has(key)) byKey.set(key, { key, label, items: [] });
      byKey.get(key)!.items.push(t);
    }
    const order = (scope: string) => (scope === "personal" ? 1 : 0);
    return Array.from(byKey.values()).sort((a, b) => {
      const scopeA = a.key.split("::")[0] ?? "";
      const scopeB = b.key.split("::")[0] ?? "";
      return order(scopeA) - order(scopeB) || a.label.localeCompare(b.label, "es");
    });
  }, [templates]);

  const newTemplateButton = (
    <button
      type="button"
      className="manage-section-card__header-btn"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setShowCreateDialog(true);
      }}
    >
      <BookmarkPlus size={13} strokeWidth={2} aria-hidden />
      Nueva
    </button>
  );

  const body = (
    <div className={cn("ccmgc-template-panel", compact && "!border-0 !bg-transparent !p-0")}>
      {compact ? (
        <div className="ccmgc-template-panel__toolbar">
          <p className="ccmgc-template-panel__intro">
            Crea plantillas personales o de equipo para reutilizar tipologías y textos en tickets nuevos o rápidos.
          </p>
          {newTemplateButton}
        </div>
      ) : null}

      {loading ? (
        <div className="ccmgc-template-panel__state">
          <Loader2 size={14} className="animate-spin text-[var(--color-accent)]" aria-hidden />
          <span>Cargando plantillas…</span>
        </div>
      ) : error ? (
        <div className="ccmgc-template-panel__state ccmgc-template-panel__state--error">
          <span>{error}</span>
          <button type="button" className="ccmgc-template-retry" onClick={() => void loadTemplates()}>
            Reintentar
          </button>
        </div>
      ) : templates && templates.length === 0 ? (
        <div className="ccmgc-template-panel__empty ccmgc-template-panel__empty--premium">
          <span className="ccmgc-template-panel__empty-icon" aria-hidden>
            <Layers size={20} strokeWidth={1.6} />
          </span>
          <p className="text-sm font-medium text-[var(--color-text-1)]">Aún no hay plantillas guardadas</p>
          <p className="max-w-sm text-[11.5px] leading-relaxed text-[var(--color-text-3)]">
            Guarda tipologías, títulos y descripciones frecuentes para crear tickets en segundos.
          </p>
          <div className="mt-1">{newTemplateButton}</div>
        </div>
      ) : (
        <div className="ccmgc-template-panel__groups">
          {grouped.map((group) => (
            <section key={group.key} className="ccmgc-template-group">
              <div className="ccmgc-template-group__head">
                <Users size={11} className="text-[var(--color-text-3)]" aria-hidden />
                <h4 className="ccmgc-template-group__title">{group.label}</h4>
                <span className="ccmgc-template-group__count">{group.items.length}</span>
              </div>
              <ul className="ccmgc-template-grid">
                {group.items.map((tpl) => {
                  const isTeam = isGroupTicketTemplateScope(tpl.scope);
                  return (
                    <li key={tpl.id}>
                      <div className="ccmgc-template-card ccmgc-template-card--premium group">
                        <div className="ccmgc-template-card__main">
                          <div className="ccmgc-template-card__top">
                            <span
                              className={cn(
                                "ccmgc-template-card__scope",
                                isTeam ? "ccmgc-template-card__scope--team" : "ccmgc-template-card__scope--personal",
                              )}
                            >
                              {isTeam ? "Equipo" : "Personal"}
                            </span>
                            <span className="ccmgc-template-card__name" title={tpl.name}>
                              {tpl.name}
                            </span>
                          </div>
                          <span className="ccmgc-template-card__meta" title={templateSubtitle(tpl)}>
                            {templateSubtitle(tpl)}
                          </span>
                        </div>
                        <div className="ccmgc-template-card__actions">
                          {tpl.canEdit ? (
                            <button
                              type="button"
                              onClick={() => deleteTemplate(tpl)}
                              className="ccmgc-template-card__delete"
                              title="Eliminar plantilla"
                              aria-label={`Eliminar plantilla ${tpl.name}`}
                            >
                              <Trash2 size={12} aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );

  const titleWithCount =
    templates != null ? `Plantillas de ticket · ${templates.length}` : "Plantillas de ticket";

  return (
    <>
      {compact ? (
        body
      ) : (
        <ManageSectionCard
          key={forceOpen ? "templates-forced-open" : "templates"}
          id="ticket-templates-panel"
          icon={<Layers size={15} strokeWidth={1.7} />}
          title={titleWithCount}
          subtitle="Reutiliza tipologías y textos en tickets nuevos, express o rápidos."
          actions={newTemplateButton}
          collapsible
          defaultOpen={forceOpen}
        >
          {body}
        </ManageSectionCard>
      )}

      {showCreateDialog ? (
        <CreateTicketTemplateDialog
          sessionUser={sessionUser}
          tipologias={tipologias}
          onClose={() => setShowCreateDialog(false)}
          onSaved={(tpl) => {
            setTemplates((prev) => [...(prev ?? []), tpl]);
            setShowCreateDialog(false);
            onTemplatesChange?.();
          }}
        />
      ) : null}
    </>
  );
}
