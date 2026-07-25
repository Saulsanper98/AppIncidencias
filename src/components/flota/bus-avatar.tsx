"use client";

import { Bus as BusIcon } from "lucide-react";

import { busNumericSuffix, busPrefix } from "@/lib/flota-ui";
import { cn } from "@/lib/utils";

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export function BusAvatar({
  busId,
  operator,
  size = 48,
  className,
  variant = "suffix",
}: {
  busId: string;
  operator: string;
  size?: number;
  className?: string;
  /** suffix = número grande; full = id completo; icon = solo icono */
  variant?: "suffix" | "full" | "icon";
}) {
  const hue = hashHue(operator || busId);
  const prefix = busPrefix(busId);
  const suffix = busNumericSuffix(busId);
  const showLabel = variant !== "icon";

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-2xl ring-2 ring-inset",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsla(${hue}, 65%, 55%, 0.28), hsla(${hue}, 65%, 40%, 0.12))`,
        boxShadow: `inset 0 0 0 1px hsla(${hue}, 60%, 55%, 0.35)`,
        // @ts-expect-error CSS custom var ok aquí
        "--tw-ring-color": `hsla(${hue}, 65%, 55%, 0.25)`,
      }}
      title={`Bus ${busId} · ${operator}`}
    >
      <div className="flex flex-col items-center gap-0 px-0.5">
        <BusIcon
          size={size > 52 ? 14 : size > 36 ? 11 : 9}
          className="opacity-85"
          style={{ color: `hsl(${hue}, 70%, 78%)` }}
        />
        {showLabel ? (
          variant === "full" ? (
            <span
              className="max-w-full truncate font-mono font-bold leading-tight"
              style={{
                color: `hsl(${hue}, 80%, 90%)`,
                fontSize: size > 52 ? 10 : 8,
              }}
            >
              {busId}
            </span>
          ) : (
            <>
              {prefix && size > 40 ? (
                <span
                  className="font-mono font-semibold uppercase leading-none opacity-75"
                  style={{
                    color: `hsl(${hue}, 65%, 72%)`,
                    fontSize: size > 52 ? 9 : 7,
                  }}
                >
                  {prefix}
                </span>
              ) : null}
              <span
                className="font-mono font-bold leading-tight tabular-nums tracking-tight"
                style={{
                  color: `hsl(${hue}, 85%, 92%)`,
                  fontSize: size > 52 ? 15 : size > 36 ? 11 : 9,
                }}
              >
                {suffix}
              </span>
            </>
          )
        ) : null}
      </div>
    </div>
  );
}
