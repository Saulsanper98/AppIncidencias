"use client";

import {
  AlertCircle,
  ArrowDownUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FilterX,
  Search,
  Shield,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import {
  adminUsersCopy,
  detectAdminLocale,
  flattenZodIssues,
  type AdminLocale,
} from "@/app/(private)/admin/users/admin-users-messages";
import { AdminRoleMenu } from "@/components/admin-role-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select } from "@/components/ui/input";
import type { UserRole } from "@/lib/domain";
import { userRoleLabel } from "@/lib/user-role-labels";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [8, 16, 32] as const;
const PAGE_SIZE_STORAGE = "ccmgc_admin_users_page_size";
const SEARCH_DEBOUNCE_MS = 280;
const URL_DEBOUNCE_MS = 350;

function readInitialPageSize(): number {
  if (typeof window === "undefined") return 8;
  const v = Number.parseInt(localStorage.getItem(PAGE_SIZE_STORAGE) ?? "", 10);
  return PAGE_SIZE_OPTIONS.includes(v as (typeof PAGE_SIZE_OPTIONS)[number]) ? v : 8;
}

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Stats = { total: number; active: number; inactive: number; gestorsActive: number };

type SortKey = "name" | "role" | "isActive" | "createdAt" | "updatedAt";
type SortDir = "asc" | "desc";
type ActiveFilter = "all" | "active" | "inactive";

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % 360;
  return h;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "numeric", year: "numeric" });
}

function relativeDayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const z = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((z(today) - z(d)) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  if (diff > 1 && diff < 7) return `Hace ${diff} días`;
  return "";
}

async function readJsonBody(res: Response): Promise<{ message: string | null; issues: unknown }> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { message?: unknown; issues?: unknown };
    return { message: typeof j.message === "string" ? j.message : null, issues: j.issues ?? null };
  } catch {
    return { message: null, issues: null };
  }
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadUsersCsv(rows: ManagedUser[], locale: AdminLocale) {
  const headers = ["id", "name", "email", "role", "roleLabel", "isActive", "createdAt", "updatedAt"] as const;
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          if (h === "roleLabel") return csvEscape(userRoleLabel(r.role, locale));
          return csvEscape(String((r as Record<string, unknown>)[h] ?? ""));
        })
        .join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `usuarios-ccmgc-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function AdminUsersSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="h-10 w-64 animate-pulse rounded-lg bg-[var(--color-surface-2)]" />
      <div className="grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-[var(--color-surface-2)]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr] lg:items-start">
        <div className="h-72 rounded-xl bg-[var(--color-surface-2)]" />
        <div className="h-96 rounded-xl bg-[var(--color-surface-2)]" />
      </div>
    </div>
  );
}

export function AdminUsersManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [locale] = useState<AdminLocale>(() => detectAdminLocale());
  const t = useMemo(() => adminUsersCopy(locale), [locale]);

  const [booted, setBooted] = useState(false);
  const [urlReady, setUrlReady] = useState(false);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("conductor");
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({});

  const [qInput, setQInput] = useState("");
  const [qFilter, setQFilter] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | UserRole>("all");
  const [filterActive, setFilterActive] = useState<ActiveFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readInitialPageSize);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const headerSelectAllRef = useRef<HTMLInputElement>(null);
  const dialogDeactivateRef = useRef<HTMLButtonElement>(null);
  const dialogBulkRef = useRef<HTMLButtonElement>(null);

  const [toast, setToast] = useState<{
    id: string;
    msg: string;
    type: "ok" | "err";
    action?: { label: string; onClick: () => void };
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [confirmDeactivate, setConfirmDeactivate] = useState<ManagedUser | null>(null);

  const urlWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushToast = useCallback(
    (msg: string, type: "ok" | "err", action?: { label: string; onClick: () => void }, durationMs = 5200) => {
      const id = crypto.randomUUID();
      setToast({ id, msg, type, action });
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), durationMs);
    },
    [],
  );

  const setPendingId = useCallback((id: string, on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const loadUsers = useCallback(async () => {
    const response = await fetch("/api/users/manage", { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
      const { message } = await readJsonBody(new Response(text, { status: response.status }));
      throw new Error(message || "No se pudo cargar usuarios");
    }
    const data = JSON.parse(text) as {
      users: ManagedUser[];
      stats: Stats;
      actorId: string;
    };
    setUsers(data.users);
    setStats(data.stats);
    setActorId(data.actorId);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQFilter(qInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    if (!booted || !urlReady) return;
    if (urlWriteTimer.current) clearTimeout(urlWriteTimer.current);
    urlWriteTimer.current = setTimeout(() => {
      const p = new URLSearchParams();
      if (qFilter) p.set("q", qFilter);
      if (filterRole !== "all") p.set("role", filterRole);
      if (filterActive !== "all") p.set("active", filterActive);
      p.set("sort", sortKey);
      p.set("dir", sortDir);
      if (page > 1) p.set("page", String(page));
      if (pageSize !== 8) p.set("pageSize", String(pageSize));
      const qs = p.toString();
      router.replace(qs ? `/admin/users?${qs}` : "/admin/users", { scroll: false });
    }, URL_DEBOUNCE_MS);
    return () => {
      if (urlWriteTimer.current) clearTimeout(urlWriteTimer.current);
    };
  }, [booted, urlReady, qFilter, filterRole, filterActive, sortKey, sortDir, page, pageSize, router]);

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    const role = searchParams.get("role") as "all" | UserRole | null;
    const active = searchParams.get("active") as ActiveFilter | null;
    const sort = searchParams.get("sort") as SortKey | null;
    const dir = searchParams.get("dir") as SortDir | null;
    const pg = searchParams.get("page");
    const psz = searchParams.get("pageSize");
    setQInput(q);
    setQFilter(q.trim());
    if (role === "conductor" || role === "tecnico_campo" || role === "gestor_centro_control") setFilterRole(role);
    if (active === "active" || active === "inactive") setFilterActive(active);
    if (sort === "name" || sort === "role" || sort === "isActive" || sort === "createdAt" || sort === "updatedAt")
      setSortKey(sort);
    if (dir === "asc" || dir === "desc") setSortDir(dir);
    if (pg && !Number.isNaN(Number(pg))) setPage(Math.max(1, parseInt(pg, 10)));
    if (psz === "16" || psz === "32") setPageSize(parseInt(psz, 10));
    setBooted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo hidratar desde URL al montar
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      setError(null);
      try {
        await loadUsers();
      } catch (bootstrapError) {
        console.error(bootstrapError);
        setError(t.errorLoad);
      }
      setLoading(false);
      setUrlReady(true);
    };
    void bootstrap();
  }, [loadUsers, t.errorLoad]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || el.closest("input,textarea,select,[contenteditable='true']")) return;
      if (el.closest('[role="dialog"]')) return;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if ((e.key === "n" || e.key === "N") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        nameInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!confirmDeactivate) return;
    const id = requestAnimationFrame(() => dialogDeactivateRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [confirmDeactivate]);

  useEffect(() => {
    if (!confirmBulk) return;
    const id = requestAnimationFrame(() => dialogBulkRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [confirmBulk]);

  useEffect(() => {
    setPage(1);
  }, [qFilter, filterRole, filterActive, sortKey, sortDir]);

  useEffect(() => {
    try {
      localStorage.setItem(PAGE_SIZE_STORAGE, String(pageSize));
    } catch {
      /* ignore */
    }
  }, [pageSize]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = new Set(users.map((u) => u.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
      });
      return next;
    });
  }, [users]);

  const deferredFilters = useDeferredValue({ q: qFilter, filterRole, filterActive });

  const processed = useMemo(() => {
    let list = [...users];
    const qf = deferredFilters.q;
    if (qf) {
      const q = qf.toLowerCase();
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          userRoleLabel(u.role, locale).toLowerCase().includes(q) ||
          u.id.toLowerCase().includes(q),
      );
    }
    if (deferredFilters.filterRole !== "all") list = list.filter((u) => u.role === deferredFilters.filterRole);
    if (deferredFilters.filterActive === "active") list = list.filter((u) => u.isActive);
    if (deferredFilters.filterActive === "inactive") list = list.filter((u) => !u.isActive);

    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name, "es");
      else if (sortKey === "role") cmp = a.role.localeCompare(b.role);
      else if (sortKey === "isActive") cmp = Number(a.isActive) - Number(b.isActive);
      else if (sortKey === "createdAt") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      return cmp * dir;
    });
    return list;
  }, [users, deferredFilters, sortKey, sortDir, locale]);

  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const p = Math.min(page, totalPages);
    const start = (p - 1) * pageSize;
    return processed.slice(start, start + pageSize);
  }, [processed, page, totalPages, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const el = headerSelectAllRef.current;
    if (!el) return;
    const pageIds = pageSlice.map((u) => u.id);
    const all = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    const some = pageIds.some((id) => selectedIds.has(id));
    el.indeterminate = some && !all;
    el.checked = all;
  }, [pageSlice, selectedIds]);

  const emailValid = useMemo(() => {
    const t = email.trim();
    if (!t) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  }, [email]);
  const canCreate = name.trim().length >= 3 && emailValid;

  const filtersDirty = Boolean(qFilter) || filterRole !== "all" || filterActive !== "all";

  const runPatch = useCallback(
    async (userId: string, payload: Partial<Pick<ManagedUser, "role" | "isActive">>) => {
      setError(null);
      setCreateFieldErrors({});
      setPendingId(userId, true);
      try {
        const response = await fetch("/api/users/manage", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, ...payload }),
        });
        const { message } = await readJsonBody(response);
        if (!response.ok) {
          setError(message || t.errorGeneric);
          pushToast(message || t.errorGeneric, "err");
          return false;
        }
        await loadUsers();
        return true;
      } finally {
        setPendingId(userId, false);
      }
    },
    [loadUsers, pushToast, setPendingId, t.errorGeneric],
  );

  const handleCreateUser = async () => {
    if (!canCreate) return;
    setError(null);
    setCreateFieldErrors({});
    setPendingId("__create__", true);
    try {
      const response = await fetch("/api/users/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role }),
      });
      const { message, issues } = await readJsonBody(response);
      if (!response.ok) {
        setCreateFieldErrors(flattenZodIssues(issues));
        setError(message || t.errorGeneric);
        pushToast(message || t.errorGeneric, "err");
        return;
      }
      pushToast(t.toastCreated, "ok");
      setName("");
      setEmail("");
      setRole("conductor");
      await loadUsers();
    } finally {
      setPendingId("__create__", false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const confirmAndDeactivate = async () => {
    if (!confirmDeactivate) return;
    const u = confirmDeactivate;
    setConfirmDeactivate(null);
    const ok = await runPatch(u.id, { isActive: false });
    if (ok) pushToast(t.toastSaved, "ok");
  };

  const toggleUserSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllPage = () => {
    const pageIds = pageSlice.map((u) => u.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const runBulkDeactivate = async () => {
    const ids = [...selectedIds].filter((id) => id !== actorId);
    setConfirmBulk(false);
    let n = 0;
    for (const id of ids) {
      const u = users.find((x) => x.id === id);
      if (u?.isActive) {
        const ok = await runPatch(id, { isActive: false });
        if (ok) n += 1;
      }
    }
    setSelectedIds(new Set());
    if (n > 0) pushToast(locale === "en" ? `${n} accounts deactivated.` : `${n} cuentas desactivadas.`, "ok");
  };

  if (loading) {
    return <AdminUsersSkeleton />;
  }

  return (
    <div className="space-y-4">
      <p className="sr-only" aria-live="polite">
        {t.liveFilter(processed.length, users.length)}
      </p>

      <header className="mb-2">
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-light)]">
            <Users size={16} className="text-[var(--color-accent)]" />
          </div>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-heading">{t.title}</h1>
            <span className="text-caption text-[var(--color-text-3)]">{t.visibleCount(processed.length, users.length)}</span>
          </div>
        </div>
        <p className="max-w-2xl text-pretty text-body text-[var(--color-text-2)] sm:ml-11">{t.subtitle}</p>
      </header>

      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 transition-colors hover:border-[color-mix(in_oklab,var(--color-border-hover)_65%,var(--color-border))]"
            title={t.statsTipTotal}
          >
            <div className="mb-1 flex items-center gap-2 text-[var(--color-text-3)]">
              <Users size={14} aria-hidden />
              <p className="text-caption">{t.statsTotal}</p>
            </div>
            <p className="text-xl font-semibold text-[var(--color-text-1)]">{stats.total}</p>
          </div>
          <div
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 transition-colors hover:border-[color-mix(in_oklab,var(--color-border-hover)_65%,var(--color-border))]"
            title={t.statsTipActive}
          >
            <div className="mb-1 flex items-center gap-2 text-[var(--color-success)]">
              <UserCheck size={14} aria-hidden />
              <p className="text-caption">{t.statsActive}</p>
            </div>
            <p className="text-xl font-semibold text-[var(--color-success)]">{stats.active}</p>
          </div>
          <div
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 transition-colors hover:border-[color-mix(in_oklab,var(--color-border-hover)_65%,var(--color-border))]"
            title={t.statsTipInactive}
          >
            <div className="mb-1 flex items-center gap-2 text-[var(--color-text-3)]">
              <UserMinus size={14} aria-hidden />
              <p className="text-caption">{t.statsInactive}</p>
            </div>
            <p className="text-xl font-semibold text-[var(--color-text-2)]">{stats.inactive}</p>
          </div>
          <div
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 transition-colors hover:border-[color-mix(in_oklab,var(--color-border-hover)_65%,var(--color-border))]"
            title={t.statsTipGestors}
          >
            <div className="mb-1 flex items-center gap-2 text-[var(--color-text-3)]">
              <Shield size={14} aria-hidden />
              <p className="text-caption">{t.statsGestors}</p>
            </div>
            <p className="text-xl font-semibold text-[var(--color-text-1)]">{stats.gestorsActive}</p>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-surface-2)_55%,transparent)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]"
              aria-hidden
            />
            <Input
              ref={searchInputRef}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="pl-9"
              aria-label={t.searchAria}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-caption text-[var(--color-text-3)]">
              <span>{t.pageSize}</span>
              <Select
                aria-label={t.pageSize}
                className="!min-h-10 w-auto min-w-[4.5rem]"
                value={String(pageSize)}
                onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="!min-h-10"
              startIcon={<Download size={14} />}
              onClick={() => downloadUsersCsv(processed, locale)}
            >
              {t.csvExport(processed.length)}
            </Button>
            {filtersDirty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="!min-h-10"
                startIcon={<FilterX size={14} />}
                onClick={() => {
                  setQInput("");
                  setQFilter("");
                  setFilterRole("all");
                  setFilterActive("all");
                }}
              >
                {t.clearFilters}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-4">
          <span className="self-center text-caption text-[var(--color-text-3)]">{t.filterState}:</span>
          {(["all", "active", "inactive"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setFilterActive(v)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150",
                filterActive === v
                  ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-light)] text-[var(--color-text-1)] ring-1 ring-[var(--color-accent)]/35"
                  : "border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
              )}
            >
              {v === "all" ? t.chipAll : v === "active" ? t.chipActive : t.chipInactive}
            </button>
          ))}
          <span className="ml-2 self-center text-caption text-[var(--color-text-3)]">{t.filterRole}:</span>
          {(["all", "conductor", "tecnico_campo", "gestor_centro_control"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setFilterRole(v)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150",
                filterRole === v
                  ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-light)] text-[var(--color-text-1)] ring-1 ring-[var(--color-accent)]/35"
                  : "border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
              )}
            >
              {v === "all" ? t.chipAll : userRoleLabel(v, locale)}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-4 py-3 text-sm text-[var(--color-error)]"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="flex-shrink-0" aria-hidden />
            {error}
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="flex-shrink-0 transition-opacity hover:opacity-70"
            aria-label={t.errorClose}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr] lg:items-start">
        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="mb-4 flex min-h-[48px] items-center gap-2">
            <UserPlus size={15} className="text-[var(--color-text-3)]" aria-hidden />
            <h2 className="text-subheading">{t.newUserTitle}</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label htmlFor="admin-new-name" className="mb-1.5 block text-label">
                {t.fieldName}
              </label>
              <Input
                ref={nameInputRef}
                id="admin-new-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Juan García"
                autoComplete="name"
              />
              {createFieldErrors.name ? (
                <p className="mt-1 text-caption text-[var(--color-error)]">{createFieldErrors.name}</p>
              ) : null}
              {name.length > 0 && name.trim().length < 3 ? (
                <p className="mt-1 text-caption text-[var(--color-warning)]">{t.nameMin}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="admin-new-email" className="mb-1.5 block text-label">
                {t.fieldEmail}
              </label>
              <Input
                id="admin-new-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@ccmgc.local"
                autoComplete="email"
              />
              {createFieldErrors.email ? (
                <p className="mt-1 text-caption text-[var(--color-error)]">{createFieldErrors.email}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="admin-new-role" className="mb-1.5 block text-label">
                {t.fieldRole}
              </label>
              <Select
                id="admin-new-role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                <option value="conductor">{userRoleLabel("conductor", locale)}</option>
                <option value="tecnico_campo">{userRoleLabel("tecnico_campo", locale)}</option>
                <option value="gestor_centro_control">{userRoleLabel("gestor_centro_control", locale)}</option>
              </Select>
            </div>
            {createFieldErrors._form ? (
              <p className="text-caption text-[var(--color-error)]">{createFieldErrors._form}</p>
            ) : null}
            <Button
              type="button"
              size="md"
              className="mt-2 w-full"
              startIcon={<CheckCircle2 size={15} />}
              disabled={!canCreate || pending.has("__create__")}
              onClick={() => void handleCreateUser()}
            >
              {t.createCta}
            </Button>
          </div>
        </article>

        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="mb-4 flex min-h-[48px] flex-wrap items-center gap-2">
            <Users size={15} className="text-[var(--color-text-3)]" aria-hidden />
            <h2 className="text-subheading">{t.listTitle}</h2>
            <span className="text-caption text-[var(--color-text-3)]">
              ({processed.length}
              {processed.length !== users.length ? ` de ${users.length}` : ""})
            </span>
          </div>

          {users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users size={40} className="mb-3 text-[var(--color-text-3)]" aria-hidden />
              <p className="text-sm font-medium text-[var(--color-text-2)]">{t.listEmpty}</p>
              <p className="mt-1 text-caption">{t.listEmptyHint}</p>
            </div>
          ) : processed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search size={40} className="mb-3 text-[var(--color-text-3)]" aria-hidden />
              <p className="text-sm font-medium text-[var(--color-text-2)]">{t.listFilteredEmptyTitle}</p>
              <p className="mt-1 max-w-sm text-pretty text-caption text-[var(--color-text-3)]">{t.listFilteredEmptyHint}</p>
              <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => {
                setQInput("");
                setQFilter("");
                setFilterRole("all");
                setFilterActive("all");
              }}>
                {t.clearFilters}
              </Button>
            </div>
          ) : (
            <>
              {selectedIds.size > 0 ? (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
                  <span className="text-sm text-[var(--color-text-1)]">{t.selectedBar(selectedIds.size)}</span>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="ghost" size="sm" className="!min-h-9 !text-xs" onClick={() => setSelectedIds(new Set())}>
                      {t.clearSelection}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      className="!min-h-9 !text-xs"
                      disabled={[...selectedIds].every((id) => id === actorId || !users.find((u) => u.id === id)?.isActive)}
                      onClick={() => setConfirmBulk(true)}
                    >
                      {t.deactivate}
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="hidden overflow-x-auto overflow-y-visible md:block">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t.tableCaption}</caption>
                  <thead className="sticky top-0 z-10 bg-[var(--color-surface)] shadow-[0_1px_0_var(--color-border)]">
                    <tr className="border-b border-[var(--color-border)]">
                      <th scope="col" className="w-10 pb-3 pr-1 text-left align-bottom">
                        <Checkbox
                          ref={headerSelectAllRef}
                          aria-label={t.selectAllPage}
                          onChange={toggleSelectAllPage}
                        />
                      </th>
                      <th scope="col" className="pb-3 pr-2 text-left text-label font-medium">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-label font-medium hover:bg-[var(--color-surface-2)]"
                          onClick={() => toggleSort("name")}
                        >
                          {t.colUser}
                          <ArrowDownUp size={12} className={sortKey === "name" ? "text-[var(--color-accent)]" : ""} />
                        </button>
                      </th>
                      <th scope="col" className="pb-3 text-left text-label font-medium">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-label font-medium hover:bg-[var(--color-surface-2)]"
                          onClick={() => toggleSort("role")}
                        >
                          {t.colRole}
                          <ArrowDownUp size={12} className={sortKey === "role" ? "text-[var(--color-accent)]" : ""} />
                        </button>
                      </th>
                      <th scope="col" className="pb-3 text-left text-label font-medium">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-label font-medium hover:bg-[var(--color-surface-2)]"
                          onClick={() => toggleSort("isActive")}
                        >
                          {t.colState}
                          <ArrowDownUp
                            size={12}
                            className={sortKey === "isActive" ? "text-[var(--color-accent)]" : ""}
                          />
                        </button>
                      </th>
                      <th scope="col" className="pb-3 text-left text-label font-medium">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-label font-medium hover:bg-[var(--color-surface-2)]"
                          onClick={() => toggleSort("createdAt")}
                        >
                          {t.colCreated}
                          <ArrowDownUp
                            size={12}
                            className={sortKey === "createdAt" ? "text-[var(--color-accent)]" : ""}
                          />
                        </button>
                      </th>
                      <th scope="col" className="pb-3 text-left text-label font-medium">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-label font-medium hover:bg-[var(--color-surface-2)]"
                          onClick={() => toggleSort("updatedAt")}
                        >
                          {t.colUpdated}
                          <ArrowDownUp
                            size={12}
                            className={sortKey === "updatedAt" ? "text-[var(--color-accent)]" : ""}
                          />
                        </button>
                      </th>
                      <th scope="col" className="pb-3 text-left text-label font-medium">
                        {t.colActions}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageSlice.map((user, rowIdx) => (
                      <motion.tr
                        key={user.id}
                        initial={false}
                        animate={{ opacity: 1 }}
                        className={cn(
                          "border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface-2)] focus-within:bg-[var(--color-surface-2)] last:border-0",
                          rowIdx % 2 === 1 && "bg-[color-mix(in_oklab,var(--color-surface-2)_42%,transparent)]",
                        )}
                      >
                        <td className="py-3 pr-1 align-middle">
                          <Checkbox
                            checked={selectedIds.has(user.id)}
                            onChange={() => toggleUserSelected(user.id)}
                            aria-label={user.name}
                          />
                        </td>
                        <th scope="row" className="py-3 pr-2 text-left font-normal">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                              style={{
                                backgroundColor: `hsl(${hueFromId(user.id)} 42% 36%)`,
                              }}
                              title={user.id}
                            >
                              {initialsFromName(user.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-[var(--color-text-1)]">{user.name}</p>
                              <p className="truncate text-caption">{user.email}</p>
                            </div>
                          </div>
                        </th>
                        <td className="py-3 align-middle">
                          <AdminRoleMenu
                            compact
                            locale={locale}
                            value={user.role}
                            disabled={pending.has(user.id)}
                            onCommit={async (r) => {
                              if (r === user.role) return;
                              const prev = user.role;
                              const ok = await runPatch(user.id, { role: r });
                              if (!ok) return;
                              pushToast(t.toastSaved, "ok", {
                                label: t.toastRoleUndo,
                                onClick: async () => {
                                  const rev = await runPatch(user.id, { role: prev });
                                  if (rev) pushToast(t.toastRoleUndone, "ok", undefined, 3200);
                                },
                              }, 8800);
                            }}
                          />
                        </td>
                        <td className="py-3 align-middle">
                          <Badge variant={user.isActive ? "success" : "warning"}>
                            {user.isActive ? t.active : t.inactive}
                          </Badge>
                        </td>
                        <td className="py-3 align-middle">
                          <span className="text-caption" title={user.createdAt}>
                            {formatDate(user.createdAt)}
                          </span>
                          {relativeDayLabel(user.createdAt) ? (
                            <span className="mt-0.5 block text-[11px] text-[var(--color-text-3)]">
                              {relativeDayLabel(user.createdAt)}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-3 align-middle">
                          <span className="text-caption" title={user.updatedAt}>
                            {formatDate(user.updatedAt)}
                          </span>
                          {relativeDayLabel(user.updatedAt) ? (
                            <span className="mt-0.5 block text-[11px] text-[var(--color-text-3)]">
                              {relativeDayLabel(user.updatedAt)}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-3 align-middle">
                          {user.isActive ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="!min-h-9 border border-[var(--color-error)]/35 !px-3 !py-1.5 !text-xs text-[var(--color-error)] hover:bg-[var(--color-error-light)]"
                              disabled={pending.has(user.id) || user.id === actorId}
                              title={user.id === actorId ? t.deactivateSelfTitle : undefined}
                              onClick={() => setConfirmDeactivate(user)}
                            >
                              {t.deactivate}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="!min-h-9 border border-[var(--color-success)]/35 !px-3 !py-1.5 !text-xs text-[var(--color-success)] hover:bg-[var(--color-success-light)]"
                              disabled={pending.has(user.id)}
                              onClick={async () => {
                                const ok = await runPatch(user.id, { isActive: true });
                                if (ok) pushToast(t.toastReactivated, "ok");
                              }}
                            >
                              {t.activate}
                            </Button>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {pageSlice.map((user) => (
                  <motion.div
                    key={user.id}
                    initial={false}
                    animate={{ opacity: 1 }}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                        <Checkbox
                          wrapperClassName="mt-1"
                          checked={selectedIds.has(user.id)}
                          onChange={() => toggleUserSelected(user.id)}
                          aria-label={user.name}
                        />
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div
                            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                            style={{ backgroundColor: `hsl(${hueFromId(user.id)} 42% 36%)` }}
                            title={user.id}
                          >
                            {initialsFromName(user.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[var(--color-text-1)]">{user.name}</p>
                            <p className="truncate text-caption">{user.email}</p>
                          </div>
                        </div>
                      </label>
                      <Badge variant={user.isActive ? "success" : "warning"}>
                        {user.isActive ? t.active : t.inactive}
                      </Badge>
                    </div>
                    <div className="mb-3">
                      <p className="mb-1 text-caption text-[var(--color-text-3)]">{t.colRole}</p>
                      <AdminRoleMenu
                        fullWidth
                        locale={locale}
                        value={user.role}
                        disabled={pending.has(user.id)}
                        onCommit={async (r) => {
                          if (r === user.role) return;
                          const prev = user.role;
                          const ok = await runPatch(user.id, { role: r });
                          if (!ok) return;
                          pushToast(t.toastSaved, "ok", {
                            label: t.toastRoleUndo,
                            onClick: async () => {
                              const rev = await runPatch(user.id, { role: prev });
                              if (rev) pushToast(t.toastRoleUndone, "ok", undefined, 3200);
                            },
                          }, 8800);
                        }}
                      />
                    </div>
                    <p className="mb-2 text-caption text-[var(--color-text-3)]">
                      {t.colCreated} {formatDate(user.createdAt)}
                      {relativeDayLabel(user.createdAt) ? ` · ${relativeDayLabel(user.createdAt)}` : ""}
                    </p>
                    <p className="mb-3 text-caption text-[var(--color-text-3)]">
                      {t.colUpdated} {formatDate(user.updatedAt)}
                      {relativeDayLabel(user.updatedAt) ? ` · ${relativeDayLabel(user.updatedAt)}` : ""}
                    </p>
                    <div className="flex justify-end">
                      {user.isActive ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="!min-h-9 border border-[var(--color-error)]/35 !text-xs text-[var(--color-error)]"
                          disabled={pending.has(user.id) || user.id === actorId}
                          onClick={() => setConfirmDeactivate(user)}
                        >
                          {t.deactivate}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="!min-h-9 border border-[var(--color-success)]/35 !text-xs text-[var(--color-success)]"
                          disabled={pending.has(user.id)}
                          onClick={async () => {
                            const ok = await runPatch(user.id, { isActive: true });
                            if (ok) pushToast(t.toastReactivated, "ok");
                          }}
                        >
                          {t.activate}
                        </Button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {processed.length > pageSize ? (
                <div className="mt-4 flex flex-col gap-3 border-t border-[var(--color-border)] pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <p className="text-caption text-[var(--color-text-3)]">{t.pageOf(safePage, totalPages)}</p>
                  <div className="flex flex-wrap items-center gap-1">
                    {totalPages <= 12
                      ? Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setPage(n)}
                            className={cn(
                              "min-h-9 min-w-9 rounded-lg border text-xs font-medium transition-colors",
                              n === safePage
                                ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-light)] text-[var(--color-text-1)]"
                                : "border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
                            )}
                          >
                            {n}
                          </button>
                        ))
                      : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="!min-h-9"
                      disabled={safePage <= 1}
                      startIcon={<ChevronLeft size={14} />}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      {t.pagePrev}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="!min-h-9"
                      disabled={safePage >= totalPages}
                      startIcon={<ChevronRight size={14} />}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      {t.pageNext}
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </article>
      </section>

      {confirmDeactivate ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmDeactivate(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-deactivate-title"
            className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl"
          >
            <h3 id="admin-deactivate-title" className="text-subheading text-[var(--color-text-1)]">
              {t.dialogDeactivateTitle}
            </h3>
            <p className="mt-2 text-body text-[var(--color-text-2)]">{t.dialogDeactivateBody(confirmDeactivate.name)}</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button ref={dialogDeactivateRef} type="button" variant="secondary" onClick={() => setConfirmDeactivate(null)}>
                {t.cancel}
              </Button>
              <Button type="button" variant="danger" onClick={() => void confirmAndDeactivate()}>
                {t.deactivate}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmBulk ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmBulk(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-bulk-title"
            className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl"
          >
            <h3 id="admin-bulk-title" className="text-subheading text-[var(--color-text-1)]">
              {t.dialogBulkTitle(selectedIds.size)}
            </h3>
            <p className="mt-2 text-body text-[var(--color-text-2)]">{t.dialogBulkBody}</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button ref={dialogBulkRef} type="button" variant="secondary" onClick={() => setConfirmBulk(false)}>
                {t.cancel}
              </Button>
              <Button type="button" variant="danger" onClick={() => void runBulkDeactivate()}>
                {t.confirmBulk}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed bottom-6 left-1/2 z-[110] flex w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg sm:flex-row sm:items-center sm:justify-between",
            toast.type === "ok"
              ? "border-[var(--color-success)]/35 bg-[var(--color-success-light)] text-[var(--color-success)]"
              : "border-[var(--color-error)]/35 bg-[var(--color-error-light)] text-[var(--color-error)]",
          )}
        >
          <span>{toast.msg}</span>
          {toast.action ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="!min-h-9 shrink-0 self-end sm:self-auto"
              onClick={() => {
                void toast.action?.onClick();
              }}
            >
              {toast.action.label}
            </Button>
          ) : null}
        </div>
      ) : null}

    </div>
  );
}
