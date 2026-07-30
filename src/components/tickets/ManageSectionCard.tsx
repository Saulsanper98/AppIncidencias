"use client";

import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  /** Acciones a la derecha del encabezado (p. ej. «Nueva plantilla»). */
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Si true, el cuerpo se colapsa con `<details>`. */
  collapsible?: boolean;
  /** Solo con collapsible. */
  defaultOpen?: boolean;
};

/**
 * Cáscara unificada de los bloques de Gestión (Plantillas / Express / Ticket completo).
 * Misma tipografía, icono neutro, borde y sombra — sin estilos que peleen entre sí.
 */
export function ManageSectionCard({
  id,
  icon,
  title,
  subtitle,
  actions,
  children,
  className,
  collapsible = false,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  const headerInner = (
    <>
      <span className="manage-section-card__lead">
        <span className="manage-section-card__icon" aria-hidden>
          {icon}
        </span>
        <span className="manage-section-card__copy">
          <span className="manage-section-card__title">{title}</span>
          {subtitle ? <span className="manage-section-card__subtitle">{subtitle}</span> : null}
        </span>
      </span>
      <span className="manage-section-card__trail">
        {actions ? <span className="manage-section-card__actions">{actions}</span> : null}
        {collapsible ? (
          <ChevronDown size={16} className="manage-section-card__chevron" aria-hidden />
        ) : null}
      </span>
    </>
  );

  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    setOpen(event.currentTarget.open);
  };

  if (collapsible) {
    return (
      <details
        id={id}
        className={cn("manage-section-card group", className)}
        open={open}
        onToggle={onToggle}
      >
        <summary className="manage-section-card__summary">{headerInner}</summary>
        {children != null ? <div className="manage-section-card__body">{children}</div> : null}
      </details>
    );
  }

  return (
    <section id={id} className={cn("manage-section-card", className)}>
      <div className="manage-section-card__header">{headerInner}</div>
      {children != null ? <div className="manage-section-card__body">{children}</div> : null}
    </section>
  );
}
