"use client";

import { Link2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  initialUrl?: string;
  onClose: () => void;
  onApply: (url: string) => void;
  onRemove?: () => void;
};

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isValidUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    new URL(normalizeUrl(trimmed));
    return true;
  } catch {
    return false;
  }
}

const GAP = 12;
const VIEWPORT_PAD = 12;

export function BitacoraLinkPopover({
  open,
  anchorRef,
  initialUrl = "",
  onClose,
  onApply,
  onRemove,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [touched, setTouched] = useState(false);
  const [positioned, setPositioned] = useState(false);
  const [style, setStyle] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 280,
  });

  const invalid = touched && url.trim().length > 0 && !isValidUrl(url);
  const canApply = url.trim().length > 0 && isValidUrl(url);

  useEffect(() => {
    if (open) {
      setUrl(initialUrl);
      setTouched(false);
      setPositioned(false);
    }
  }, [open, initialUrl]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const update = () => {
      const el = anchorRef.current;
      const panel = panelRef.current;
      if (!el) return;

      const r = el.getBoundingClientRect();
      const width = Math.max(280, Math.min(r.width + 120, window.innerWidth - VIEWPORT_PAD * 2));
      let left = r.left;
      if (left + width > window.innerWidth - VIEWPORT_PAD) {
        left = window.innerWidth - width - VIEWPORT_PAD;
      }
      left = Math.max(VIEWPORT_PAD, left);

      const panelHeight = panel?.offsetHeight ?? 168;
      const spaceBelow = window.innerHeight - r.bottom - VIEWPORT_PAD;
      const spaceAbove = r.top - VIEWPORT_PAD;

      let top: number;
      if (spaceBelow >= panelHeight + GAP) {
        top = r.bottom + GAP;
      } else if (spaceAbove >= panelHeight + GAP) {
        top = r.top - panelHeight - GAP;
      } else if (spaceBelow >= spaceAbove) {
        top = r.bottom + GAP;
      } else {
        top = r.top - panelHeight - GAP;
      }

      top = Math.max(VIEWPORT_PAD, Math.min(top, window.innerHeight - panelHeight - VIEWPORT_PAD));
      setStyle({ top, left, width });
      setPositioned(true);
    };

    update();
    const raf = window.requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef, url, invalid]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Insertar enlace"
      className="b-log-link-popover"
      style={{
        position: "fixed",
        top: style.top,
        left: style.left,
        width: style.width,
        zIndex: 900,
        visibility: positioned ? "visible" : "hidden",
      }}
    >
      <div className="b-log-link-popover__head">
        <Link2 size={14} aria-hidden />
        <span>Enlace web</span>
        <button type="button" className="b-log-link-popover__close" onClick={onClose} aria-label="Cerrar">
          <X size={14} />
        </button>
      </div>
      <input
        ref={inputRef}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => setTouched(true)}
        placeholder="https://…"
        className={cn("b-log-link-popover__input", invalid && "is-invalid")}
        aria-invalid={invalid}
        aria-describedby={invalid ? "b-log-link-error" : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (canApply) onApply(normalizeUrl(url.trim()));
            else setTouched(true);
          }
        }}
      />
      {invalid ? (
        <p id="b-log-link-error" className="b-log-link-popover__error" role="alert">
          Introduce una URL válida (ej. https://…)
        </p>
      ) : null}
      <div className="b-log-link-popover__actions">
        {onRemove ? (
          <button type="button" className="b-log-link-popover__btn is-muted" onClick={onRemove}>
            Quitar
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" className="b-log-link-popover__btn is-muted" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className={cn("b-log-link-popover__btn is-primary")}
            disabled={!canApply}
            onClick={() => onApply(normalizeUrl(url.trim()))}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
