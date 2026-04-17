export type LoginFetchKind = "ok" | "timeout" | "unauthorized" | "server" | "network" | "parse";

export type LoginFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: LoginFetchKind; status?: number; message?: string };

const DEFAULT_TIMEOUT_MS = 12_000;

export async function fetchJsonWithTimeout<T>(
  input: RequestInfo,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<LoginFetchResult<T>> {
  const { timeoutMs: timeoutOverride, ...rest } = init;
  const timeoutMs = timeoutOverride ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...rest, signal: controller.signal });
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      return { ok: false, kind: "unauthorized", status: res.status, message: text };
    }
    if (res.status >= 500) {
      return { ok: false, kind: "server", status: res.status, message: text };
    }
    if (!res.ok) {
      return { ok: false, kind: "server", status: res.status, message: text };
    }
    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, kind: "parse", message: text };
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, kind: "timeout" };
    }
    return { ok: false, kind: "network" };
  } finally {
    clearTimeout(t);
  }
}
