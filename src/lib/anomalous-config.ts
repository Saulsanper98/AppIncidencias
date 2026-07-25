/** Valores por defecto de la detección de buses anómalos (AppSetting). */
export const ANOMALOUS_DEFAULTS = {
  windowDays: 12,
  zscore: 1.5,
  typeWeights: {} as Record<string, number>,
};
