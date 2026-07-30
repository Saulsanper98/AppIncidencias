"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CcmgcLogo } from "@/components/ccmgc-logo";
import { EASE_OUT } from "@/lib/motion";

export type LoginWelcomeOverlayProps = {
  open: boolean;
  name: string;
  greeting: string;
  destinationLabel: string;
  openingLabel: string;
  skipHint: string;
  /** Ej. "Noche · 22:00 – 06:00" */
  shiftLabel?: string | null;
  onComplete: () => void;
  /** Tiempo visible antes de cerrar solo (ms). */
  holdMs?: number;
};

const stagger = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.14, delayChildren: 0.12 },
  },
};

const rise = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.58, ease: EASE_OUT },
  },
};

const logoRise = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.7, ease: EASE_OUT },
  },
};

/** Retraso visual antes de que la barra empiece a llenarse (tras el stagger). */
const PROGRESS_DELAY_S = 0.55;

/**
 * Escena full-bleed tras login: marca hero + saludo + destino.
 * Sin card. Saltabile. Respeta prefers-reduced-motion.
 *
 * Importante: al terminar navega con el overlay AÚN visible para no
 * revelar el login debajo mientras Next hace el cambio de ruta.
 */
export function LoginWelcomeOverlay({
  open,
  name,
  greeting,
  destinationLabel,
  openingLabel,
  skipHint,
  shiftLabel,
  onComplete,
  holdMs = 2400,
}: LoginWelcomeOverlayProps) {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const finishingRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const beginFinish = () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    // Navegar ya, con la capa aún tapando el login.
    onCompleteRef.current();
  };

  useEffect(() => {
    if (!open) {
      finishingRef.current = false;
      setVisible(false);
      return;
    }
    finishingRef.current = false;
    if (reduced) {
      onCompleteRef.current();
      return;
    }
    setVisible(true);
  }, [open, reduced]);

  useEffect(() => {
    if (!visible || reduced) return;
    const t = window.setTimeout(beginFinish, holdMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduced, holdMs]);

  useEffect(() => {
    if (!visible || reduced) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        beginFinish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduced]);

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  if (typeof document === "undefined") return null;

  const progressDuration = Math.max(0.4, holdMs / 1000 - PROGRESS_DELAY_S);

  return createPortal(
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="login-welcome"
          role="status"
          aria-live="polite"
          aria-label={`${greeting} ${name}. ${openingLabel} ${destinationLabel}`}
          className="login-welcome-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: EASE_OUT }}
          onClick={beginFinish}
        >
          <div className="login-welcome-overlay__ambient" aria-hidden>
            <span className="login-welcome-overlay__glow login-welcome-overlay__glow--a" />
            <span className="login-welcome-overlay__glow login-welcome-overlay__glow--b" />
            <span className="login-welcome-overlay__grid" />
            <span className="login-welcome-overlay__vignette" />
            <span className="login-welcome-overlay__grain" />
          </div>

          <motion.div
            className="login-welcome-overlay__stage"
            variants={stagger}
            initial="hidden"
            animate="show"
          >
            <motion.p className="login-welcome-overlay__kicker" variants={rise}>
              <span className="login-welcome-overlay__kicker-mark" aria-hidden />
              CCMGC · Operativo
            </motion.p>

            <motion.div className="login-welcome-overlay__logo-wrap" variants={logoRise}>
              <CcmgcLogo
                className="login-welcome-overlay__logo h-[3.75rem] w-[min(92vw,22rem)] text-[var(--color-text-1)] sm:h-[4.75rem] sm:w-[min(92vw,26rem)]"
                align="center"
              />
            </motion.div>

            <motion.p className="login-welcome-overlay__greeting" variants={rise}>
              {greeting}{" "}
              <span className="login-welcome-overlay__name">{name}</span>
            </motion.p>

            {shiftLabel ? (
              <motion.p className="login-welcome-overlay__shift" variants={rise}>
                {shiftLabel}
              </motion.p>
            ) : null}

            <motion.div className="login-welcome-overlay__dest" variants={rise}>
              <span className="login-welcome-overlay__dest-label">{openingLabel}</span>
              <span className="login-welcome-overlay__dest-sep" aria-hidden />
              <span className="login-welcome-overlay__dest-value">{destinationLabel}</span>
            </motion.div>

            <motion.div className="login-welcome-overlay__progress" variants={rise} aria-hidden>
              <motion.span
                className="login-welcome-overlay__progress-bar"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  duration: progressDuration,
                  delay: PROGRESS_DELAY_S,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            </motion.div>

            <motion.p
              className="login-welcome-overlay__skip"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1, duration: 0.45, ease: EASE_OUT }}
            >
              {skipHint}
            </motion.p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
