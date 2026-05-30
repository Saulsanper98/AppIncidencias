"use client";

import {
  AlertCircle,
  ArrowDownUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FilterX,
  KeyRound,
  Pencil,
  Search,
  Shield,
  Trash2,
  Upload,
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
  hasPassword?: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
};

type EditState = {
  user: ManagedUser;
  name: string;
  email: string;
};

type ImportRowResult = {
  index: number;
  email: string;
  status: "created" | "updated" | "skipped" | "error";
  message?: string;
  generatedPassword?: string | null;
};
type ImportResponse = {
  results: ImportRowResult[];
  stats: { total: number; created: number; skipped: number; errors: number };
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

/**
 * Tonos visuales por rol — usados en los chips de filtro, los pills
 * coloreados en cada fila y el anillo del avatar.
 *
 *  - gestor_centro_control → violeta (autoridad, gestión)
 *  - tecnico_campo         → esmeralda (operativo, "en campo")
 *  - conductor             → ámbar (driver, ruta)
 */
function roleTone(role: UserRole): {
  ring: string;
  pillActive: string;
  pillIdle: string;
  dot: string;
  text: string;
  bg: string;
} {
  switch (role) {
    case "gestor_centro_control":
      return {
        ring: "ring-violet-400/60",
        pillActive: "border-violet-400/50 bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/30",
        pillIdle: "border-violet-400/20 bg-violet-500/[0.05] text-violet-300 hover:bg-violet-500/10",
        dot: "bg-violet-400",
        text: "text-violet-300",
        bg: "bg-violet-500/12",
      };
    case "tecnico_campo":
      return {
        ring: "ring-emerald-400/60",
        pillActive: "border-emerald-400/50 bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30",
        pillIdle: "border-emerald-400/20 bg-emerald-500/[0.05] text-emerald-300 hover:bg-emerald-500/10",
        dot: "bg-emerald-400",
        text: "text-emerald-300",
        bg: "bg-emerald-500/12",
      };
    case "conductor":
    default:
      return {
        ring: "ring-amber-400/60",
        pillActive: "border-amber-400/50 bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30",
        pillIdle: "border-amber-400/20 bg-amber-500/[0.05] text-amber-300 hover:bg-amber-500/10",
        dot: "bg-amber-400",
        text: "text-amber-300",
        bg: "bg-amber-500/12",
      };
  }
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
  const [initialPasswordInput, setInitialPasswordInput] = useState("");
  const [forceChangeOnCreate, setForceChangeOnCreate] = useState(true);
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({});

  // Modales avanzados
  const [editState, setEditState] = useState<EditState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ManagedUser | null>(null);
  const [confirmReset, setConfirmReset] = useState<ManagedUser | null>(null);
  const [generatedPasswordDialog, setGeneratedPasswordDialog] = useState<
    | { userName: string; userEmail: string; password: string; intro: string }
    | null
  >(null);
  const [pendingRoleChange, setPendingRoleChange] = useState<
    | { user: ManagedUser; nextRole: UserRole; previousRole: UserRole }
    | null
  >(null);

  // Importación CSV
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<Array<Record<string, string>>>([]);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

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
    // Aviso al asignar rol gestor desde el form de alta.
    if (role === "gestor_centro_control") {
      const ok = window.confirm(t.confirmRoleGestorBody(name.trim()));
      if (!ok) return;
    }
    setError(null);
    setCreateFieldErrors({});
    setPendingId("__create__", true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim(),
        role,
        mustChangePassword: forceChangeOnCreate,
      };
      if (initialPasswordInput.trim()) body.password = initialPasswordInput;
      const response = await fetch("/api/users/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let data: {
        user?: { id: string; name: string; email: string };
        initialPassword?: string | null;
        passwordWasGenerated?: boolean;
        message?: string;
        issues?: unknown;
      } = {};
      try { data = JSON.parse(text); } catch { /* ignore */ }
      if (!response.ok) {
        setCreateFieldErrors(flattenZodIssues(data.issues));
        setError(data.message || t.errorGeneric);
        pushToast(data.message || t.errorGeneric, "err");
        return;
      }
      pushToast(t.toastCreated, "ok");
      if (data.passwordWasGenerated && data.initialPassword && data.user) {
        setGeneratedPasswordDialog({
          userName: data.user.name,
          userEmail: data.user.email,
          password: data.initialPassword,
          intro: t.initialPasswordBody(data.user.name),
        });
      }
      setName("");
      setEmail("");
      setRole("conductor");
      setInitialPasswordInput("");
      setForceChangeOnCreate(true);
      await loadUsers();
    } finally {
      setPendingId("__create__", false);
    }
  };

  const runEditSubmit = async () => {
    if (!editState) return;
    const { user, name: nameNext, email: emailNext } = editState;
    const trimmedName = nameNext.trim();
    const trimmedEmail = emailNext.trim();
    if (trimmedName.length < 3) {
      pushToast(t.nameMin, "err");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      pushToast(t.errorGeneric, "err");
      return;
    }
    const body: Record<string, unknown> = { userId: user.id };
    if (trimmedName !== user.name) body.name = trimmedName;
    if (trimmedEmail.toLowerCase() !== user.email) body.email = trimmedEmail;
    if (Object.keys(body).length === 1) { // solo userId
      setEditState(null);
      return;
    }
    setPendingId(user.id, true);
    try {
      const response = await fetch("/api/users/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const { message } = await readJsonBody(response);
      if (!response.ok) {
        pushToast(message || t.errorGeneric, "err");
        return;
      }
      pushToast(t.toastSaved, "ok");
      setEditState(null);
      await loadUsers();
    } finally {
      setPendingId(user.id, false);
    }
  };

  const runDelete = async () => {
    if (!confirmDelete) return;
    const u = confirmDelete;
    setConfirmDelete(null);
    setPendingId(u.id, true);
    try {
      const response = await fetch("/api/users/manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id }),
      });
      const { message } = await readJsonBody(response);
      if (!response.ok) {
        pushToast(message || t.errorGeneric, "err");
        return;
      }
      pushToast(t.toastSaved, "ok");
      await loadUsers();
    } finally {
      setPendingId(u.id, false);
    }
  };

  const runReset = async () => {
    if (!confirmReset) return;
    const u = confirmReset;
    setConfirmReset(null);
    setPendingId(u.id, true);
    try {
      const response = await fetch("/api/users/manage/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id }),
      });
      const text = await response.text();
      let data: { newPassword?: string | null; message?: string; user?: { name: string; email: string } } = {};
      try { data = JSON.parse(text); } catch { /* ignore */ }
      if (!response.ok) {
        pushToast(data.message || t.errorGeneric, "err");
        return;
      }
      if (data.newPassword && data.user) {
        setGeneratedPasswordDialog({
          userName: data.user.name,
          userEmail: data.user.email,
          password: data.newPassword,
          intro: t.initialPasswordBody(data.user.name),
        });
      }
      pushToast(t.toastSaved, "ok");
      await loadUsers();
    } finally {
      setPendingId(u.id, false);
    }
  };

  const onRoleChangeRequested = async (user: ManagedUser, nextRole: UserRole) => {
    if (nextRole === user.role) return;
    // Avisar al promover a gestor.
    if (nextRole === "gestor_centro_control" && user.role !== "gestor_centro_control") {
      setPendingRoleChange({ user, nextRole, previousRole: user.role });
      return;
    }
    await commitRoleChange(user, nextRole, user.role);
  };

  const commitRoleChange = async (user: ManagedUser, nextRole: UserRole, previousRole: UserRole) => {
    const ok = await runPatch(user.id, { role: nextRole });
    if (!ok) return;
    pushToast(t.toastSaved, "ok", {
      label: t.toastRoleUndo,
      onClick: async () => {
        const rev = await runPatch(user.id, { role: previousRole });
        if (rev) pushToast(t.toastRoleUndone, "ok", undefined, 3200);
      },
    }, 8800);
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      pushToast(t.passwordCopied, "ok");
    } catch {
      pushToast(t.errorGeneric, "err");
    }
  };

  // ----- CSV import helpers (parser muy simple, comma o ;) -----
  const parseCsvText = (text: string): Array<Record<string, string>> => {
    const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];
    const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
    const splitLine = (line: string): string[] => {
      const out: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') { inQ = false; }
          else { cur += ch; }
        } else {
          if (ch === '"') inQ = true;
          else if (ch === sep) { out.push(cur); cur = ""; }
          else { cur += ch; }
        }
      }
      out.push(cur);
      return out;
    };
    const headerCells = splitLine(lines[0]).map((c) => c.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const cells = splitLine(line);
      const row: Record<string, string> = {};
      headerCells.forEach((h, i) => { row[h] = (cells[i] ?? "").trim(); });
      return row;
    });
  };

  const onPickImportFile = async (file: File | null) => {
    setImportError(null);
    setImportResult(null);
    if (!file) { setImportRows([]); setImportFileName(null); return; }
    setImportFileName(file.name);
    try {
      const text = await file.text();
      const rows = parseCsvText(text);
      setImportRows(rows);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "No se pudo leer el fichero.");
      setImportRows([]);
    }
  };

  const runImport = async () => {
    if (importRows.length === 0) return;
    setImporting(true);
    setImportError(null);
    try {
      const response = await fetch("/api/users/manage/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importRows }),
      });
      const text = await response.text();
      let data: ImportResponse | { message?: string } = { message: "" };
      try { data = JSON.parse(text); } catch { /* ignore */ }
      if (!response.ok) {
        setImportError((data as { message?: string }).message ?? "Error en la importación.");
        return;
      }
      setImportResult(data as ImportResponse);
      await loadUsers();
    } finally {
      setImporting(false);
    }
  };

  const downloadImportPasswordsCsv = () => {
    if (!importResult) return;
    const created = importResult.results.filter((r) => r.status === "created" && r.generatedPassword);
    if (created.length === 0) return;
    const lines = ["email,password", ...created.map((r) => `${csvEscape(r.email)},${csvEscape(r.generatedPassword ?? "")}`)];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-passwords-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

      {/* HERO unificado con KPIs */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-violet-500/[0.06] p-5 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/12 ring-1 ring-violet-400/25 text-violet-300">
              <Users size={20} strokeWidth={1.7} aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--color-text-3)]">
                <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 font-semibold">CCMGC</span>
                Administración de equipos
              </div>
              <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight text-[var(--color-text-1)]">
                {t.title}
              </h1>
              <p className="mt-0.5 max-w-2xl text-[12.5px] leading-snug text-[var(--color-text-3)]">
                {t.subtitle}
              </p>
            </div>
          </div>

          {/* KPIs en vivo */}
          {stats ? (
            <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <UsersKpi
                icon={<Users size={11} aria-hidden />}
                label={t.statsTotal}
                value={stats.total}
                tone="neutral"
                title={t.statsTipTotal}
              />
              <UsersKpi
                icon={<UserCheck size={11} aria-hidden />}
                label={t.statsActive}
                value={stats.active}
                tone="success"
                title={t.statsTipActive}
              />
              <UsersKpi
                icon={<UserMinus size={11} aria-hidden />}
                label={t.statsInactive}
                value={stats.inactive}
                tone={stats.inactive > 0 ? "warning" : "neutral"}
                title={t.statsTipInactive}
              />
              <UsersKpi
                icon={<Shield size={11} aria-hidden />}
                label={t.statsGestors}
                value={stats.gestorsActive}
                tone="violet"
                title={t.statsTipGestors}
              />
            </dl>
          ) : null}
        </div>

        {/* Distribución por rol */}
        {stats ? (
          <div className="relative mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
              Distribución
            </span>
            {(["gestor_centro_control", "tecnico_campo", "conductor"] as const).map((r) => {
              const count = users.filter((u) => u.role === r).length;
              const total = users.length || 1;
              const pct = Math.round((count / total) * 100);
              const tone = roleTone(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setFilterRole(filterRole === r ? "all" : r)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                    filterRole === r ? tone.pillActive : tone.pillIdle,
                  )}
                  title={`Filtrar por ${userRoleLabel(r, locale)}`}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} aria-hidden />
                  {userRoleLabel(r, locale)}
                  <span className="opacity-75">
                    {count} · {pct}%
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="!min-h-10"
              startIcon={<Upload size={14} />}
              onClick={() => { setImportOpen(true); setImportResult(null); setImportError(null); setImportRows([]); setImportFileName(null); }}
            >
              {t.importCsvCta}
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
          {(["all", "conductor", "tecnico_campo", "gestor_centro_control"] as const).map((v) => {
            const active = filterRole === v;
            const tone = v === "all" ? null : roleTone(v);
            return (
              <button
                key={v}
                type="button"
                onClick={() => setFilterRole(v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150",
                  tone === null
                    ? active
                      ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-light)] text-[var(--color-text-1)] ring-1 ring-[var(--color-accent)]/35"
                      : "border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
                    : active
                      ? tone.pillActive
                      : tone.pillIdle,
                )}
              >
                {tone ? <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} aria-hidden /> : null}
                {v === "all" ? t.chipAll : userRoleLabel(v, locale)}
              </button>
            );
          })}
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
              {role === "gestor_centro_control" ? (
                <p className="mt-1 text-caption text-[var(--color-warning)]">
                  {t.confirmRoleGestorBody(name.trim() || (locale === "en" ? "this user" : "este usuario"))}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="admin-new-password" className="mb-1.5 block text-label">
                {t.optionalPasswordLabel}
              </label>
              <Input
                id="admin-new-password"
                type="text"
                value={initialPasswordInput}
                onChange={(e) => setInitialPasswordInput(e.target.value)}
                placeholder="••••••••••"
                autoComplete="off"
              />
              <p className="mt-1 text-caption text-[var(--color-text-3)]">{t.optionalPasswordHint}</p>
              <p className="text-caption text-[var(--color-text-3)]">{t.minPasswordHint}</p>
            </div>
            <label className="flex items-start gap-2 text-caption text-[var(--color-text-2)]">
              <Checkbox
                checked={forceChangeOnCreate}
                onChange={(e) => setForceChangeOnCreate(e.target.checked)}
              />
              <span>{t.forceChangeLabel}</span>
            </label>
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
                              className={cn(
                                "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-offset-2 ring-offset-[var(--color-surface)]",
                                roleTone(user.role).ring,
                              )}
                              style={{
                                backgroundColor: `hsl(${hueFromId(user.id)} 42% 36%)`,
                              }}
                              title={`${user.name} · ${userRoleLabel(user.role, locale)}`}
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
                            onCommit={(r) => onRoleChangeRequested(user, r)}
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
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="!min-h-9 !px-2.5 !py-1.5 !text-xs text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
                              disabled={pending.has(user.id)}
                              onClick={() => setEditState({ user, name: user.name, email: user.email })}
                              title={t.editAction}
                            >
                              <Pencil size={13} className="mr-1" /> {t.editAction}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="!min-h-9 !px-2.5 !py-1.5 !text-xs text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
                              disabled={pending.has(user.id)}
                              onClick={() => setConfirmReset(user)}
                              title={t.resetPasswordAction}
                            >
                              <KeyRound size={13} className="mr-1" /> {t.resetPasswordAction}
                            </Button>
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="!min-h-9 !px-2.5 !py-1.5 !text-xs text-[var(--color-error)] hover:bg-[var(--color-error-light)]"
                              disabled={pending.has(user.id) || user.id === actorId}
                              title={t.deleteAction}
                              onClick={() => setConfirmDelete(user)}
                            >
                              <Trash2 size={13} className="mr-1" /> {t.deleteAction}
                            </Button>
                          </div>
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
                            className={cn(
                              "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-offset-2 ring-offset-[var(--color-surface-2)]",
                              roleTone(user.role).ring,
                            )}
                            style={{ backgroundColor: `hsl(${hueFromId(user.id)} 42% 36%)` }}
                            title={`${user.name} · ${userRoleLabel(user.role, locale)}`}
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
                        onCommit={(r) => onRoleChangeRequested(user, r)}
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
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="!min-h-9 !text-xs text-[var(--color-text-2)]"
                        disabled={pending.has(user.id)}
                        onClick={() => setEditState({ user, name: user.name, email: user.email })}
                      >
                        <Pencil size={13} className="mr-1" /> {t.editAction}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="!min-h-9 !text-xs text-[var(--color-text-2)]"
                        disabled={pending.has(user.id)}
                        onClick={() => setConfirmReset(user)}
                      >
                        <KeyRound size={13} className="mr-1" /> {t.resetPasswordAction}
                      </Button>
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="!min-h-9 !text-xs text-[var(--color-error)]"
                        disabled={pending.has(user.id) || user.id === actorId}
                        onClick={() => setConfirmDelete(user)}
                      >
                        <Trash2 size={13} className="mr-1" /> {t.deleteAction}
                      </Button>
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

      {/* --- Modal: editar nombre / email --- */}
      {editState ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEditState(null); }}
        >
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
            <h3 className="text-subheading text-[var(--color-text-1)]">{t.editDialogTitle}</h3>
            <p className="mt-1 text-caption text-[var(--color-text-3)]">{editState.user.email}</p>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="edit-name" className="mb-1.5 block text-label">{t.fieldName}</label>
                <Input id="edit-name" value={editState.name} onChange={(e) => setEditState((s) => s ? { ...s, name: e.target.value } : s)} />
              </div>
              <div>
                <label htmlFor="edit-email" className="mb-1.5 block text-label">{t.fieldEmail}</label>
                <Input id="edit-email" type="email" value={editState.email} onChange={(e) => setEditState((s) => s ? { ...s, email: e.target.value } : s)} />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditState(null)}>{t.cancel}</Button>
              <Button type="button" onClick={() => void runEditSubmit()}>{t.editDialogSave}</Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* --- Modal: confirmar eliminar --- */}
      {confirmDelete ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
        >
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
            <h3 className="text-subheading text-[var(--color-text-1)]">{t.deleteDialogTitle}</h3>
            <p className="mt-2 text-body text-[var(--color-text-2)]">{t.deleteDialogBody(confirmDelete.name)}</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfirmDelete(null)}>{t.cancel}</Button>
              <Button type="button" variant="danger" onClick={() => void runDelete()}>{t.confirmDelete}</Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* --- Modal: confirmar reset password --- */}
      {confirmReset ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmReset(null); }}
        >
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
            <h3 className="text-subheading text-[var(--color-text-1)]">{t.resetDialogTitle}</h3>
            <p className="mt-2 text-body text-[var(--color-text-2)]">{t.resetDialogBody(confirmReset.name)}</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfirmReset(null)}>{t.cancel}</Button>
              <Button type="button" onClick={() => void runReset()}>{t.confirmReset}</Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* --- Modal: confirmar promoción a gestor --- */}
      {pendingRoleChange ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setPendingRoleChange(null); }}
        >
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
            <h3 className="text-subheading text-[var(--color-text-1)]">{t.confirmRoleGestorTitle}</h3>
            <p className="mt-2 text-body text-[var(--color-text-2)]">{t.confirmRoleGestorBody(pendingRoleChange.user.name)}</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPendingRoleChange(null)}>{t.cancel}</Button>
              <Button type="button" onClick={async () => {
                const change = pendingRoleChange;
                setPendingRoleChange(null);
                if (change) await commitRoleChange(change.user, change.nextRole, change.previousRole);
              }}>{t.confirmRoleGestorAccept}</Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* --- Modal: contraseña generada (alta + reset) --- */}
      {generatedPasswordDialog ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 p-4"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setGeneratedPasswordDialog(null); }}
        >
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
            <div className="flex items-start gap-2">
              <KeyRound size={20} className="mt-0.5 text-[var(--color-accent)]" aria-hidden />
              <div>
                <h3 className="text-subheading text-[var(--color-text-1)]">{t.initialPasswordTitle}</h3>
                <p className="mt-1 text-body text-[var(--color-text-2)]">{generatedPasswordDialog.intro}</p>
                <p className="text-caption text-[var(--color-text-3)]">{generatedPasswordDialog.userEmail}</p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-lg tracking-wider text-[var(--color-text-1)] break-all">
              {generatedPasswordDialog.password}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" startIcon={<Copy size={14} />} onClick={() => copyToClipboard(generatedPasswordDialog.password)}>{t.copyPassword}</Button>
              <Button type="button" onClick={() => setGeneratedPasswordDialog(null)}>{t.close}</Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* --- Modal: importar CSV --- */}
      {importOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setImportOpen(false); }}
        >
          <div role="dialog" aria-modal="true" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
            <h3 className="text-subheading text-[var(--color-text-1)]">{t.importDialogTitle}</h3>
            <p className="mt-2 text-body text-[var(--color-text-2)]">{t.importDialogHint}</p>
            <div className="mt-4 space-y-3">
              <input
                ref={importFileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="block w-full cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-2)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-accent)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
                onChange={(e) => void onPickImportFile(e.target.files?.[0] ?? null)}
              />
              {importFileName ? (
                <p className="text-caption text-[var(--color-text-3)]">
                  {importFileName} — {t.importRowsDetected(importRows.length)}
                </p>
              ) : null}
              {importError ? (
                <p className="text-caption text-[var(--color-error)]">{importError}</p>
              ) : null}

              {importResult ? (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                  <p className="mb-2 text-label">{t.importResultsTitle}</p>
                  <ul className="grid grid-cols-2 gap-1 text-caption text-[var(--color-text-2)] sm:grid-cols-4">
                    <li>{t.importStat("Total", importResult.stats.total)}</li>
                    <li className="text-[var(--color-success)]">{t.importStat("OK", importResult.stats.created)}</li>
                    <li className="text-[var(--color-warning)]">{t.importStat("Skipped", importResult.stats.skipped)}</li>
                    <li className="text-[var(--color-error)]">{t.importStat("Errors", importResult.stats.errors)}</li>
                  </ul>
                  {importResult.results.length > 0 ? (
                    <div className="mt-3 max-h-56 overflow-y-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-caption">
                      {importResult.results.map((r) => (
                        <p key={r.index} className={cn(
                          "py-0.5",
                          r.status === "created" ? "text-[var(--color-success)]" :
                          r.status === "skipped" ? "text-[var(--color-warning)]" :
                          r.status === "error" ? "text-[var(--color-error)]" : "",
                        )}>
                          #{r.index} {r.email} — {r.status}{r.message ? ` (${r.message})` : ""}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {importResult.results.some((r) => r.generatedPassword) ? (
                    <Button type="button" variant="secondary" size="sm" className="mt-3" startIcon={<Download size={14} />} onClick={downloadImportPasswordsCsv}>
                      {t.importDownloadCsv}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setImportOpen(false)}>{t.close}</Button>
              <Button type="button" disabled={importRows.length === 0 || importing} onClick={() => void runImport()}>
                {importing ? "..." : t.importRunCta}
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

// ─── Subcomponentes del hero ───────────────────────────────────────────────

type UsersKpiTone = "neutral" | "success" | "warning" | "violet";

function UsersKpi({
  icon,
  label,
  value,
  tone,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: UsersKpiTone;
  title?: string;
}) {
  const toneCls =
    tone === "success"
      ? "ring-[var(--color-success)]/30 bg-[var(--color-success-light)] text-[var(--color-success)]"
      : tone === "warning"
        ? "ring-[var(--color-warning)]/30 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
        : tone === "violet"
          ? "ring-violet-400/30 bg-violet-500/12 text-violet-300"
          : "ring-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)]";
  return (
    <div
      className={cn(
        "flex min-w-[100px] items-center gap-2 rounded-lg px-2.5 py-1.5 ring-1 transition-shadow hover:shadow-sm",
        toneCls,
      )}
      title={title}
    >
      <span className="opacity-80">{icon}</span>
      <div className="flex min-w-0 flex-col">
        <span className="text-[10px] uppercase tracking-wider opacity-80">{label}</span>
        <span className="num-tabular text-[15px] font-semibold leading-tight">{value}</span>
      </div>
    </div>
  );
}
