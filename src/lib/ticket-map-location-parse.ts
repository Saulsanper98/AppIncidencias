/** Extrae lat/lng de texto pegado (Maps, OSM, o pareja numérica). */
export function parseLatLngFromPastedText(text: string): { lat: number; lng: number } | null {
  const t = text.trim();
  if (!t) return null;

  let m = t.match(/@(-?\d+[.,]?\d*),\s*(-?\d+[.,]?\d*)/);
  if (m) {
    const lat = Number(m[1].replace(",", "."));
    const lng = Number(m[2].replace(",", "."));
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  m = t.match(/[?&]q=(-?\d+[.,]?\d*),\s*(-?\d+[.,]?\d*)/i);
  if (m) {
    const lat = Number(m[1].replace(",", "."));
    const lng = Number(m[2].replace(",", "."));
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  m = t.match(/(-?\d+[.,]?\d*)\s*[,;\s]+\s*(-?\d+[.,]?\d*)/);
  if (m) {
    const lat = Number(m[1].replace(",", "."));
    const lng = Number(m[2].replace(",", "."));
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  return null;
}
