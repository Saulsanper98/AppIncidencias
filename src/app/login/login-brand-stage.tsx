"use client";

import { useMemo, type CSSProperties } from "react";

import {
  GRAN_CANARIA_ROUTE_NODES,
  GRAN_CANARIA_SILHOUETTE_PATH,
  GRAN_CANARIA_VIEWBOX,
} from "@/app/login/login-gc-silhouette";
import { loginCopy } from "@/app/login/login-i18n";
import { useLoginLocale } from "@/app/login/use-login-locale";
import { CcmgcLogo } from "@/components/ccmgc-logo";
import { SHIFT_LABEL, currentShiftNow, shiftWindowLabel } from "@/lib/shift-utils";

const NODE_ORDER = [
  "neIsleta",
  "neLasPalmas",
  "nwGaldar",
  "centro",
  "centroSur",
  "surMaspalomas",
] as const;

/** Plano de marca: logo hero + silueta de Gran Canaria. */
export function LoginBrandStage() {
  const locale = useLoginLocale();
  const t = useMemo(() => loginCopy(locale), [locale]);
  const shift = currentShiftNow();
  // Misma fuente que data-login-chrono: N → noche; M/T → día.
  const atmosphere = shift === "N" ? "night" : "day";

  return (
    <aside className="login-brand-plane" aria-label={t.heroTitle}>
      <div className="login-brand-plane__mesh" aria-hidden />
      <div className="login-brand-plane__routes" aria-hidden>
        <LoginRoutesArt />
      </div>
      <div className="login-brand-plane__fade" aria-hidden />

      <div className="login-brand-plane__content">
        <p className="login-brand-kicker">
          <span className="login-brand-kicker__mark" aria-hidden />
          CCMGC · {t.heroEyebrow}
        </p>

        <div className="login-brand-logo-wrap">
          <CcmgcLogo
            className="login-brand-logo h-[4.25rem] w-[min(100%,18rem)] text-[var(--color-text-1)] sm:h-[5.25rem] sm:w-[min(100%,22rem)] lg:h-[6.5rem] lg:w-[min(100%,26rem)]"
            align="start"
          />
        </div>

        <p className="login-brand-lead">{t.heroLead}</p>

        <dl className="login-brand-meta">
          <div>
            <dt>{t.metaShift}</dt>
            <dd>
              {SHIFT_LABEL[shift]}
              <span className="login-brand-meta__muted"> · {shiftWindowLabel(shift)}</span>
            </dd>
          </div>
          <div>
            <dt>{t.metaAtmosphere}</dt>
            <dd>{atmosphere === "night" ? t.metaNight : t.metaDay}</dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}

/** Silueta real de Gran Canaria + rutas / nodos de la red. */
function LoginRoutesArt() {
  const n = GRAN_CANARIA_ROUTE_NODES;
  return (
    <svg
      className="login-routes-svg"
      viewBox={GRAN_CANARIA_VIEWBOX}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="loginRouteA" x1="180" y1="140" x2="420" y2="560" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--color-accent)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id="loginRouteB" x1="500" y1="80" x2="200" y2="400" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--color-accent)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0.04" />
        </linearGradient>
      </defs>

      {/* Costa: draw-on; fill entra al final del trazo */}
      <path
        className="login-silhouette-path"
        d={GRAN_CANARIA_SILHOUETTE_PATH}
        fill="color-mix(in oklab, var(--color-accent) 7%, transparent)"
        stroke="color-mix(in oklab, var(--color-text-1) 32%, transparent)"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />

      <path
        className="login-routes-line login-routes-line--a"
        d={`M ${n.neIsleta.x} ${n.neIsleta.y}
            C 470 160, 450 220, ${n.neLasPalmas.x} ${n.neLasPalmas.y}
            C 380 200, 320 260, ${n.centro.x} ${n.centro.y}
            C 290 400, 300 500, ${n.surMaspalomas.x} ${n.surMaspalomas.y}`}
        stroke="url(#loginRouteA)"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        className="login-routes-line login-routes-line--b"
        d={`M ${n.nwGaldar.x} ${n.nwGaldar.y}
            C 210 240, 250 300, ${n.centro.x} ${n.centro.y}
            C 320 340, 380 360, ${n.centroSur.x} ${n.centroSur.y}
            C 420 380, 460 300, 490 270`}
        stroke="url(#loginRouteB)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        className="login-routes-line login-routes-line--c"
        d={`M ${n.neLasPalmas.x} ${n.neLasPalmas.y}
            C 360 180, 280 200, ${n.nwGaldar.x + 20} ${n.nwGaldar.y + 40}`}
        stroke="color-mix(in oklab, var(--color-text-1) 22%, transparent)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeDasharray="3 7"
        fill="none"
      />

      {NODE_ORDER.map((key, idx) => {
        const node = n[key];
        const accent = node.pulse;
        return (
          <circle
            key={key}
            className={
              accent
                ? "login-route-node login-route-node--in login-route-node--pulse"
                : "login-route-node login-route-node--in"
            }
            style={
              {
                ["--login-node-i" as string]: idx,
                ["--login-node-opacity" as string]: accent ? 0.92 : 0.4,
              } as CSSProperties
            }
            cx={node.x}
            cy={node.y}
            r={accent ? 3.6 : 2.8}
            fill={
              accent
                ? "var(--color-accent)"
                : "color-mix(in oklab, var(--color-text-1) 50%, transparent)"
            }
          />
        );
      })}
    </svg>
  );
}
