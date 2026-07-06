/**
 * Copia texto al portapapeles. Funciona en HTTP (LAN) y HTTPS.
 * `navigator.clipboard` solo está disponible en contexto seguro; en
 * http://192.168.x.x usamos el fallback con textarea + execCommand.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text || typeof document === "undefined") return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fallback */
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
