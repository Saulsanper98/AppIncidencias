"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionCardProps = {
  title: ReactNode;
  /** Icono Lucide a la izquierda del título. */
  icon?: LucideIcon;
  /** Acciones a la derecha del header (links, botones). */
  action?: ReactNode;
  /** Texto auxiliar bajo el título (p. ej. hint del panel). */
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  /** Sin padding en el cuerpo (listas densas). */
  flush?: boolean;
};

/**
 * Cáscara de bloque de contenido ops (fotos, historial, tickets relacionados…).
 * Distinto de `ManageSectionCard` (gestión de tickets / plantillas colapsables).
 */
export function SectionCard({
  title,
  icon: Icon,
  action,
  subtitle,
  children,
  className,
  headerClassName,
  bodyClassName,
  flush = false,
}: SectionCardProps) {
  return (
    <section className={cn("ccmgc-section-card", className)}>
      <header className={cn("ccmgc-section-card__header", headerClassName)}>
        <div className="ccmgc-section-card__heading">
          <h2 className="ccmgc-section-card__title">
            {Icon ? <Icon size={15} className="ccmgc-section-card__icon" aria-hidden /> : null}
            {title}
          </h2>
          {subtitle ? <p className="ccmgc-section-card__subtitle">{subtitle}</p> : null}
        </div>
        {action ? <div className="ccmgc-section-card__action">{action}</div> : null}
      </header>
      <div className={cn("ccmgc-section-card__body", flush && "ccmgc-section-card__body--flush", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
