"use client";

import { useEffect, useState } from "react";

import { currentShiftFromHour } from "@/lib/shift-utils";

export type LoginChrono = "day" | "night";

/**
 * Atmósfera visual alineada con turnos operativos:
 * Noche = turno N (22:00–06:00); resto = día.
 */
export function useLoginChrono(): LoginChrono {
  const [v, setV] = useState<LoginChrono>("day");
  useEffect(() => {
    const apply = () => {
      const shift = currentShiftFromHour(new Date().getHours());
      setV(shift === "N" ? "night" : "day");
    };
    apply();
    const id = window.setInterval(apply, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return v;
}
