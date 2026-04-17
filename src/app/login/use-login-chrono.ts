"use client";

import { useEffect, useState } from "react";

export type LoginChrono = "day" | "night";

export function useLoginChrono(): LoginChrono {
  const [v, setV] = useState<LoginChrono>("day");
  useEffect(() => {
    const h = new Date().getHours();
    setV(h >= 7 && h < 20 ? "day" : "night");
  }, []);
  return v;
}
