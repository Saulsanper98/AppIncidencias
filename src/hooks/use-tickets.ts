"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type {
  AuditEventView,
  CatalogBus,
  CatalogPayload,
  CreateTicketPayload,
  LocalUser,
  MaintenanceAlertView,
  PreventiveTaskView,
  TicketView,
} from "@/components/tickets/tickets-module-types";
import {
  TICKET_FORM_DRAFT_KEY,
  TICKETS_BANDEJA_COMPACT_KEY,
  TICKETS_UI_HINT_KEY,
  statusMap,
} from "@/components/tickets/tickets-module-types";
import { useSseEvent } from "@/hooks/use-sse-event";
import type { SessionUser, TicketPriority, TicketStatus, UserRole } from "@/lib/domain";
import {
  collectOperatorPrefixes,
  validateOptionalLineaLabel,
} from "@/lib/catalog-id-format";
import { resolveBusIdForForm } from "@/lib/ticket-bus-asset";
import { ticketNeedsCompletion } from "@/lib/tickets/pending-completion";
import {
  buildTicketsCsv,
  downloadTicketsCsv,
  ticketsCsvFilename,
  type TicketCsvExportRow,
} from "@/lib/tickets/ticket-export-csv";
import { currentShiftFromHour, type ShiftKey, VALID_SHIFTS } from "@/lib/shift-utils";
import { toast } from "@/components/toast-host";

/** Clave estable de la query de listado (para no refetch si ya está al día). */
function ticketsListQueryKey(parts: {
  status: string;
  operator: string;
  busId: string;
  partCode: string;
  priority: string;
  mine: boolean;
  tipo: string;
  conductor: string;
  dateFrom: string;
  dateTo: string;
}): string {
  return [
    parts.status,
    parts.operator,
    parts.busId,
    parts.partCode.trim(),
    parts.priority,
    parts.mine ? "1" : "0",
    parts.tipo,
    parts.conductor.trim(),
    parts.dateFrom.trim(),
    parts.dateTo.trim(),
  ].join("\0");
}

export function useTickets() {
  const router = useRouter();
  const pathname = usePathname();
  const slaToastShownRef = useRef(false);
  const ticketsFetchGenRef = useRef(0);
  const bootstrappedRef = useRef(false);
  const lastFetchedQueryKeyRef = useRef("");
  const loadingRef = useRef(true);
  const sessionHeadersRef = useRef<{ userId: string; role: UserRole }>({
    userId: "",
    role: "conductor",
  });
  // Ruta base sobre la que sincronizamos los filtros como query string.
  // El modulo de tickets vive en dos paginas distintas: /bandeja (vista
  // primaria del centro) y /tickets (gestion + preventivo). Cuando el
  // usuario cambia un filtro queremos reflejarlo en la URL ACTUAL, no
  // redirigirlo de /bandeja a /tickets. Antes el `router.replace` era
  // siempre "/tickets?..." y rompia la URL al filtrar desde /bandeja.
  const inboxPath = pathname.startsWith("/bandeja") ? "/bandeja" : "/tickets";
  const searchParams = useSearchParams();
  const busIdFromQuery = searchParams.get("busId");
  const statusFromQuery = searchParams.get("status");
  const priorityFromQuery = searchParams.get("priority");
  const conductorFromQuery = searchParams.get("conductor")?.trim() ?? "";
  const dateFromFromQuery = searchParams.get("from")?.trim() ?? "";
  const dateToFromQuery = searchParams.get("to")?.trim() ?? "";
  const tipoFromQuery = searchParams.get("tipo");
  const partCodeFromQuery = searchParams.get("partCode")?.trim() ?? "";
  const mineFromQuery = searchParams.get("mine");
  const completarFromQuery = searchParams.get("completar");
  const slaOverdueOnly = searchParams.get("sla") === "overdue";
  const operatorFromQuery = searchParams.get("operator");
  const hourFromQuery = searchParams.get("hour");
  const shiftFromQuery = searchParams.get("shift");
  const qFromQuery = searchParams.get("q");

  const [users, setUsers] = useState<LocalUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [role, setRole] = useState<UserRole>("conductor");
  const [catalog, setCatalog] = useState<CatalogBus[]>([]);
  const [lineas, setLineas] = useState<string[]>([]);
  const [tipologias, setTipologias] = useState<
    import("@/lib/tipologia").TipologiaItem[]
  >([]);
  const [statusFilter, setStatusFilter] = useState<"todos" | TicketStatus>(() => {
    const allowed: Array<TicketStatus | "todos"> = [
      "todos",
      "borrador",
      "abierto",
      "en_proceso",
      "esperando_repuesto",
      "resuelto",
    ];
    if (statusFromQuery && allowed.includes(statusFromQuery as TicketStatus | "todos")) {
      return statusFromQuery as "todos" | TicketStatus;
    }
    return "todos";
  });
  const [priorityFilter, setPriorityFilter] = useState<"todos" | TicketPriority>(() => {
    const allowed: Array<TicketPriority | "todos"> = ["todos", "alta", "media", "baja"];
    if (priorityFromQuery && allowed.includes(priorityFromQuery as TicketPriority | "todos")) {
      return priorityFromQuery as "todos" | TicketPriority;
    }
    return "todos";
  });
  const [conductorFilter, setConductorFilter] = useState(conductorFromQuery);
  const [dateFromFilter, setDateFromFilter] = useState(dateFromFromQuery);
  const [dateToFilter, setDateToFilter] = useState(dateToFromQuery);
  const [operatorFilter, setOperatorFilter] = useState<"todas" | string>(
    operatorFromQuery && operatorFromQuery !== "todas" ? operatorFromQuery : "todas",
  );
  const [busFilter, setBusFilter] = useState<"todas" | string>(busIdFromQuery ?? "todas");
  const [tipoFilter, setTipoFilter] = useState<"todos" | string>(
    tipoFromQuery && tipoFromQuery !== "todos" ? tipoFromQuery : "todos",
  );
  // Chip "Mis tickets": inicializado desde la URL (`?mine=1`). Para técnicos
  // se activa por defecto al cargar (efecto más abajo).
  const [onlyMine, setOnlyMine] = useState<boolean>(mineFromQuery === "1");
  const [tickets, setTickets] = useState<TicketView[]>([]);
  const [loading, setLoading] = useState(true);
  /** Se pone a true al terminar el bootstrap; dispara una reconciliación de filtros. */
  const [ticketsReady, setTicketsReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"success" | "warning" | "info">("success");
  const [noticePlacement, setNoticePlacement] = useState<"card" | "toast" | "center">("card");
  const [auditEvents, setAuditEvents] = useState<AuditEventView[]>([]);
  const [maintenanceAlerts, setMaintenanceAlerts] = useState<MaintenanceAlertView[]>([]);
  // Ventana en días con la que el backend está agrupando los fallos para las
  // "Alertas preventivas". Se obtiene de `Admin → Buses anómalos` (default 12,
  // antes era 30 hardcoded). El módulo lo pinta en los textos del panel.
  const [maintenanceWindowDays, setMaintenanceWindowDays] = useState<number>(12);
  const [preventiveTasks, setPreventiveTasks] = useState<PreventiveTaskView[]>([]);
  const [taskPlans, setTaskPlans] = useState<Record<string, { assignedToUserId: string; scheduledAt: string }>>({});
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [assignTechnicianId, setAssignTechnicianId] = useState("");
  /**
   * Ticket que el usuario quiere eliminar. Se gestiona en el módulo a través
   * de un diálogo (con motivo obligatorio). Guardamos también el título para
   * mostrarlo en el diálogo de confirmación.
   */
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [draftCompleteId, setDraftCompleteId] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  /**
   * Modal "Ticket rápido" (sugerencia OP03). Se abre con la tecla `Q`,
   * con el botón "Rápido" del header o programáticamente. Reutiliza el
   * mismo `handleCreateTicket` que el formulario completo.
   */
  const [quickTicketOpen, setQuickTicketOpen] = useState(false);
  const [actionMenuTicketId, setActionMenuTicketId] = useState<string | null>(null);
  const [actionMenuViewport, setActionMenuViewport] = useState<{ top: number; left: number } | null>(null);
  const [statusChangeTarget, setStatusChangeTarget] = useState<{ ticketId: string; nextStatus: TicketStatus } | null>(
    null,
  );
  const [statusChangeComment, setStatusChangeComment] = useState("");
  const [statusChangeError, setStatusChangeError] = useState<string | null>(null);
  const [statusChangeSubmitting, setStatusChangeSubmitting] = useState(false);
  const filterSearchRef = useRef<HTMLInputElement>(null);
  const [bandejaCompacta, setBandejaCompacta] = useState(true);
  const [showTicketsUiHint, setShowTicketsUiHint] = useState(false);

  loadingRef.current = loading;
  sessionHeadersRef.current = { userId: currentUserId, role };

  const ticketsQueryRef = useRef({
    statusFilter: statusFilter as "todos" | TicketStatus,
    priorityFilter: priorityFilter as "todos" | TicketPriority,
    operatorFilter: operatorFilter as "todas" | string,
    busFilter: busFilter as "todas" | string,
    tipoFilter: tipoFilter as "todos" | string,
    partCodeFromQuery,
    onlyMine,
    conductorFilter,
    dateFromFilter,
    dateToFilter,
  });
  ticketsQueryRef.current = {
    statusFilter,
    priorityFilter,
    operatorFilter,
    busFilter,
    tipoFilter,
    partCodeFromQuery,
    onlyMine,
    conductorFilter,
    dateFromFilter,
    dateToFilter,
  };

  const actionMenuTicket = useMemo(
    () => (actionMenuTicketId ? tickets.find((t) => t.id === actionMenuTicketId) ?? null : null),
    [actionMenuTicketId, tickets],
  );

  const editTargetTicket = useMemo(
    () => (editTargetId ? tickets.find((t) => t.id === editTargetId) ?? null : null),
    [editTargetId, tickets],
  );

  const draftCompleteTicket = useMemo(
    () => (draftCompleteId ? tickets.find((t) => t.id === draftCompleteId) ?? null : null),
    [draftCompleteId, tickets],
  );

  const operators = useMemo(() => Array.from(new Set(catalog.map((bus) => bus.operator))), [catalog]);
  const tipoFilterOptions = useMemo(
    () => Array.from(new Set(tipologias.map((item) => item.tipo))).sort((a, b) => a.localeCompare(b, "es")),
    [tipologias],
  );
  const technicians = useMemo(
    () => users.filter((user) => user.role === "tecnico_campo" && user.id !== ""),
    [users],
  );

  useEffect(() => {
    if (busIdFromQuery) {
      setBusFilter(busIdFromQuery);
    }
  }, [busIdFromQuery]);

  /** Bus en catálogo → rellena operadora; al pasar de un bus concreto a «Todos», limpia operadora. */
  const prevBusFilterRef = useRef(busFilter);
  useEffect(() => {
    const prev = prevBusFilterRef.current;
    prevBusFilterRef.current = busFilter;

    if (busFilter === "todas") {
      if (prev !== "todas") {
        setOperatorFilter("todas");
      }
      return;
    }
    const needle = busFilter.trim().toLowerCase();
    const bus = catalog.find((b) => b.id.trim().toLowerCase() === needle);
    if (bus?.operator) {
      setOperatorFilter(bus.operator);
    }
  }, [busFilter, catalog]);

  useEffect(() => {
    if (!statusFromQuery) return;
    const allowed: Array<TicketStatus | "todos"> = [
      "todos",
      "borrador",
      "abierto",
      "en_proceso",
      "esperando_repuesto",
      "resuelto",
    ];
    if (allowed.includes(statusFromQuery as TicketStatus | "todos")) {
      setStatusFilter(statusFromQuery as "todos" | TicketStatus);
    }
  }, [statusFromQuery]);

  useEffect(() => {
    if (!priorityFromQuery) return;
    const allowed: Array<TicketPriority | "todos"> = ["todos", "alta", "media", "baja"];
    if (allowed.includes(priorityFromQuery as TicketPriority | "todos")) {
      setPriorityFilter(priorityFromQuery as "todos" | TicketPriority);
    }
  }, [priorityFromQuery]);

  useEffect(() => {
    setConductorFilter(conductorFromQuery);
  }, [conductorFromQuery]);

  useEffect(() => {
    setDateFromFilter(dateFromFromQuery);
    setDateToFilter(dateToFromQuery);
  }, [dateFromFromQuery, dateToFromQuery]);

  useEffect(() => {
    if (!tipoFromQuery) return;
    setTipoFilter(tipoFromQuery === "todos" ? "todos" : tipoFromQuery);
  }, [tipoFromQuery]);

  useEffect(() => {
    if (!operatorFromQuery) return;
    setOperatorFilter(operatorFromQuery === "todas" ? "todas" : operatorFromQuery);
  }, [operatorFromQuery]);

  useEffect(() => {
    if (!qFromQuery) return;
    setSearchQuery(qFromQuery);
  }, [qFromQuery]);

  useEffect(() => {
    if (!completarFromQuery || loading) return;
    const ticket = tickets.find((t) => t.id === completarFromQuery || t.id.endsWith(completarFromQuery));
    if (ticket && ticketNeedsCompletion(ticket)) {
      setDraftCompleteId(ticket.id);
    }
  }, [completarFromQuery, loading, tickets]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = Boolean(target?.closest("input, textarea, select, [contenteditable=true]"));

      if (e.key === "Escape" && actionMenuTicketId) {
        e.preventDefault();
        setActionMenuTicketId(null);
        return;
      }

      if (e.key === "Escape" && shortcutsOpen) {
        e.preventDefault();
        setShortcutsOpen(false);
        return;
      }

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        if (inField) return;
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }

      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (inField) return;
        e.preventDefault();
        filterSearchRef.current?.focus();
      }

      if (e.key === "n" || e.key === "N") {
        if (inField) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        // En /bandeja no hay formulario embebido: N lleva a Tickets.
        if (pathname === "/bandeja") {
          router.push("/tickets");
          return;
        }
        const root = document.getElementById("tickets-new-form-anchor");
        root?.scrollIntoView({ behavior: "smooth", block: "start" });
        window.setTimeout(() => {
          const focusable = root?.querySelector<HTMLElement>("select, input, textarea, button");
          focusable?.focus();
        }, 280);
      }

      // Atajo "Q" — abre el modal de Ticket rápido. Lo dejamos solo si
      // no estamos escribiendo en un input/textarea para no entorpecer.
      if (e.key === "q" || e.key === "Q") {
        if (inField) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        setQuickTicketOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcutsOpen, actionMenuTicketId, pathname, router]);

  useEffect(() => {
    if (!actionMenuTicketId) setActionMenuViewport(null);
  }, [actionMenuTicketId]);

  useLayoutEffect(() => {
    if (!actionMenuTicketId) return;
    const update = () => {
      const anchor = document.querySelector<HTMLElement>(`[data-ticket-menu-anchor="${actionMenuTicketId}"]`);
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const menuWidth = 176;
      setActionMenuViewport({ top: r.bottom + 4, left: Math.max(8, r.right - menuWidth) });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [actionMenuTicketId]);

  useEffect(() => {
    if (!actionMenuTicketId || !actionMenuViewport) return;
    const id = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-ticket-actions-portal-menu] [role=\"menuitem\"]")?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [actionMenuTicketId, actionMenuViewport]);

  useEffect(() => {
    if (!actionMenuTicketId) return;
    const close = (ev: MouseEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el?.closest("[data-ticket-actions]") || el?.closest("[data-ticket-actions-portal-menu]")) return;
      setActionMenuTicketId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [actionMenuTicketId]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(TICKETS_BANDEJA_COMPACT_KEY);
      if (raw === "0") setBandejaCompacta(false);
      else if (raw === "1") setBandejaCompacta(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(TICKETS_BANDEJA_COMPACT_KEY, bandejaCompacta ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [bandejaCompacta]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(TICKETS_UI_HINT_KEY) !== "1") {
        setShowTicketsUiHint(true);
      }
    } catch {
      setShowTicketsUiHint(false);
    }
  }, []);

  useEffect(() => {
    if (!notice) {
      setNoticeTone("success");
      setNoticePlacement("card");
      return;
    }
    const ephemeral =
      noticeTone === "warning" ||
      noticeTone === "info" ||
      noticePlacement === "toast" ||
      notice.startsWith("Exportados") ||
      notice.includes("supera") ||
      notice.includes("archivos") ||
      notice.includes("MB.");
    if (!ephemeral) return;
    const t = window.setTimeout(() => setNotice(null), noticePlacement === "toast" ? 4500 : 6000);
    return () => window.clearTimeout(t);
  }, [notice, noticeTone, noticePlacement]);

  useEffect(() => {
    // Solo sincronizamos URL en las paginas donde tiene sentido el listado:
    // /bandeja (vista primaria) y /tickets (gestion + preventivo). Cuando
    // el usuario abre un detalle (/tickets/[id]) NO queremos manipular la
    // URL — la pagina del detalle gestiona su propia navegacion.
    if (loading || (pathname !== "/tickets" && pathname !== "/bandeja")) return;
    const id = window.setTimeout(() => {
      const desiredStatus = statusFilter === "todos" ? "" : statusFilter;
      const desiredPri = priorityFilter === "todos" ? "" : priorityFilter;
      const desiredOp = operatorFilter === "todas" ? "" : operatorFilter;
      const desiredBus = busFilter === "todas" ? "" : busFilter;
      const desiredTipo = tipoFilter === "todos" ? "" : tipoFilter;
      const desiredConductor = conductorFilter.trim();
      const desiredFrom = dateFromFilter.trim();
      const desiredTo = dateToFilter.trim();
      const curStatus = searchParams.get("status") ?? "";
      const curPri = searchParams.get("priority") ?? "";
      const curOp = searchParams.get("operator") ?? "";
      const curBus = searchParams.get("busId") ?? "";
      const curTipo = searchParams.get("tipo") ?? "";
      const curConductor = searchParams.get("conductor")?.trim() ?? "";
      const curFrom = searchParams.get("from")?.trim() ?? "";
      const curTo = searchParams.get("to")?.trim() ?? "";
      const curPart = searchParams.get("partCode")?.trim() ?? "";
      const curSla = searchParams.get("sla") ?? "";
      const curHour = searchParams.get("hour");
      const curShift = searchParams.get("shift");
      const curQ = searchParams.get("q");
      const curCompletar = searchParams.get("completar");
      const curMine = searchParams.get("mine") === "1";
      if (
        curStatus === desiredStatus &&
        curPri === desiredPri &&
        curOp === desiredOp &&
        curBus === desiredBus &&
        curTipo === desiredTipo &&
        curConductor === desiredConductor &&
        curFrom === desiredFrom &&
        curTo === desiredTo &&
        curMine === onlyMine
      )
        return;
      const q = new URLSearchParams();
      if (desiredStatus) q.set("status", desiredStatus);
      if (desiredPri) q.set("priority", desiredPri);
      if (desiredOp) q.set("operator", desiredOp);
      if (desiredBus) q.set("busId", desiredBus);
      if (desiredTipo) q.set("tipo", desiredTipo);
      if (desiredConductor) q.set("conductor", desiredConductor);
      if (desiredFrom) q.set("from", desiredFrom);
      if (desiredTo) q.set("to", desiredTo);
      if (curPart) q.set("partCode", curPart);
      if (onlyMine) q.set("mine", "1");
      if (curSla === "overdue" || slaOverdueOnly) q.set("sla", "overdue");
      if (curHour) q.set("hour", curHour);
      if (curShift) q.set("shift", curShift);
      if (curQ) q.set("q", curQ);
      if (curCompletar) q.set("completar", curCompletar);
      const qs = q.toString();
      const nextUrl = qs ? `${inboxPath}?${qs}` : inboxPath;
      // replaceState evita remount/Suspense de router.replace al solo
      // sincronizar query (era una fuente de parpadeo al entrar en Bandeja).
      if (`${window.location.pathname}${window.location.search}` === nextUrl) return;
      window.history.replaceState(window.history.state, "", nextUrl);
    }, 0);
    return () => window.clearTimeout(id);
  }, [
    loading,
    pathname,
    inboxPath,
    statusFilter,
    priorityFilter,
    operatorFilter,
    busFilter,
    tipoFilter,
    conductorFilter,
    dateFromFilter,
    dateToFilter,
    onlyMine,
    slaOverdueOnly,
    searchParams,
  ]);

  const fetchCatalog = useCallback(async () => {
    const loadOnce = async () => {
      const response = await fetch("/api/catalog", { cache: "no-store" });
      const text = await response.text();
      return { response, text };
    };
    let { response, text } = await loadOnce();
    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 1500));
      ({ response, text } = await loadOnce());
    }
    if (!response.ok) {
      throw new Error(text || "Error al cargar catalogo");
    }
    const data = JSON.parse(text) as CatalogPayload;
    setCatalog(data.buses);
    setTipologias(data.tipologias ?? []);
  }, []);

  const fetchLineas = useCallback(async () => {
    try {
      const response = await fetch("/api/lineas", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { lineas?: string[] };
      setLineas(data.lineas ?? []);
    } catch {
      // Si la API de lineas falla, dejamos el array vacio: el campo "Servicio"
      // sigue funcionando como input libre sin sugerencias.
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    const response = await fetch("/api/users", { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || "Error al cargar usuarios");
    }
    const data = JSON.parse(text) as { users: LocalUser[] };
    setUsers(data.users);
    if (data.users.length > 0) {
      setCurrentUserId((prev) => {
        if (prev) return prev;
        setRole(data.users[0].role);
        return data.users[0].id;
      });
    }
  }, []);

  const fetchSession = useCallback(async (): Promise<{ mineDefault: boolean }> => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const text = await response.text();
    if (response.status === 429) {
      // Rate limit transitorio (p. ej. tras reload rápido): no tumbar la bandeja.
      console.warn("Sesión: rate limit, reintentando…");
      await new Promise((r) => setTimeout(r, 1500));
      const retry = await fetch("/api/auth/session", { cache: "no-store" });
      const retryText = await retry.text();
      if (!retry.ok) {
        return { mineDefault: false };
      }
      const retryData = JSON.parse(retryText) as { authenticated: boolean; user?: SessionUser };
      if (retryData.authenticated && retryData.user) {
        setSessionUser(retryData.user);
        setCurrentUserId(retryData.user.id);
        setRole(retryData.user.role);
        sessionHeadersRef.current = { userId: retryData.user.id, role: retryData.user.role };
        const mineDefault = retryData.user.role === "tecnico_campo" && mineFromQuery === null;
        if (mineDefault) setOnlyMine(true);
        return { mineDefault };
      }
      return { mineDefault: false };
    }
    if (!response.ok) {
      throw new Error(text || "Error al cargar sesión");
    }
    const data = JSON.parse(text) as { authenticated: boolean; user?: SessionUser };
    if (data.authenticated && data.user) {
      setSessionUser(data.user);
      setCurrentUserId(data.user.id);
      setRole(data.user.role);
      // Actualizar headers ya: el siguiente fetchTickets no puede esperar al re-render.
      sessionHeadersRef.current = { userId: data.user.id, role: data.user.role };
      // Default por rol: si es técnico de campo y la URL no especifica el
      // filtro explícitamente, abrir la bandeja con "Solo míos" activado.
      const mineDefault = data.user.role === "tecnico_campo" && mineFromQuery === null;
      if (mineDefault) setOnlyMine(true);
      return { mineDefault };
    }
    setSessionUser(null);
    return { mineDefault: false };
  }, [mineFromQuery]);

  const fetchTickets = useCallback(
    async (
      status: "todos" | TicketStatus,
      operator: "todas" | string,
      busId: "todas" | string,
      partCode = "",
      priority: "todos" | TicketPriority = "todos",
      mine = false,
      tipo: "todos" | string = "todos",
      conductor = "",
      dateFrom = "",
      dateTo = "",
    ) => {
      const gen = ++ticketsFetchGenRef.current;
      const query = new URLSearchParams({ status, operator, busId });
      if (priority !== "todos") {
        query.set("priority", priority);
      }
      if (tipo !== "todos") {
        query.set("tipo", tipo);
      }
      if (partCode.trim()) {
        query.set("partCode", partCode.trim());
      }
      if (mine) {
        query.set("mine", "1");
      }
      if (conductor.trim()) {
        query.set("conductor", conductor.trim());
      }
      if (dateFrom.trim()) {
        query.set("from", dateFrom.trim());
      }
      if (dateTo.trim()) {
        query.set("to", dateTo.trim());
      }
      const { userId, role: hdrRole } = sessionHeadersRef.current;
      const response = await fetch(`/api/tickets?${query.toString()}`, {
        cache: "no-store",
        headers: {
          "x-user-id": userId,
          "x-user-role": hdrRole,
        },
      });
      const text = await response.text();
      if (gen !== ticketsFetchGenRef.current) return;
      if (!response.ok) {
        throw new Error(text || "Error al cargar tickets");
      }
      const data = JSON.parse(text) as { tickets: TicketView[] };
      if (gen !== ticketsFetchGenRef.current) return;
      lastFetchedQueryKeyRef.current = ticketsListQueryKey({
        status,
        operator,
        busId,
        partCode,
        priority,
        mine,
        tipo,
        conductor,
        dateFrom,
        dateTo,
      });
      setTickets(data.tickets);
      if (!slaToastShownRef.current) {
        const now = Date.now();
        const overdue = data.tickets.filter(
          (t) =>
            t.status !== "resuelto" &&
            Boolean(t.slaDeadline) &&
            new Date(t.slaDeadline).getTime() < now,
        ).length;
        if (overdue > 0) {
          slaToastShownRef.current = true;
          toast.warning(`${overdue} ticket(s) con SLA vencido`, {
            description: "Revisa la bandeja con filtro SLA o el panel de salud del turno.",
            duration: 6000,
          });
        }
      }
    },
    [],
  );

  const fetchAuditEvents = useCallback(async () => {
    const response = await fetch("/api/audit/recent", { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || "Error al cargar auditoría");
    }
    const data = JSON.parse(text) as { events: AuditEventView[] };
    setAuditEvents(data.events);
  }, []);

  const fetchMaintenanceAlerts = useCallback(async () => {
    const response = await fetch("/api/maintenance/alerts", { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || "Error al cargar alertas preventivas");
    }
    const data = JSON.parse(text) as { alerts: MaintenanceAlertView[]; windowDays?: number };
    setMaintenanceAlerts(data.alerts);
    // Antes el endpoint no devolvía `windowDays` y el texto del panel
    // estaba hardcoded a "30 días". Ahora respetamos el valor configurado.
    if (typeof data.windowDays === "number" && Number.isFinite(data.windowDays)) {
      setMaintenanceWindowDays(data.windowDays);
    }
  }, []);

  const fetchPreventiveTasks = useCallback(async () => {
    const response = await fetch("/api/maintenance/tasks", { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || "Error al cargar tareas preventivas");
    }
    const data = JSON.parse(text) as { tasks: PreventiveTaskView[] };
    setPreventiveTasks(data.tasks);
    setTaskPlans((prev) => {
      const next = { ...prev };
      for (const task of data.tasks) {
        if (!next[task.id]) {
          next[task.id] = {
            assignedToUserId: task.assignedToUserId ?? "",
            scheduledAt: task.scheduledAt ? task.scheduledAt.slice(0, 16) : "",
          };
        }
      }
      return next;
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchCatalog();
      await fetchLineas();
      await fetchUsers();
      const session = await fetchSession();
      // Un solo listado: con los filtros actuales (URL/estado), nunca un
      // bootstrap sin conductor/fechas que luego pelea con el efecto.
      const q = ticketsQueryRef.current;
      const initialMine = mineFromQuery === "1" || session.mineDefault || q.onlyMine;
      await fetchTickets(
        q.statusFilter,
        q.operatorFilter,
        q.busFilter !== "todas" ? q.busFilter : (busIdFromQuery ?? "todas"),
        q.partCodeFromQuery || partCodeFromQuery,
        q.priorityFilter,
        initialMine,
        q.tipoFilter,
        q.conductorFilter,
        q.dateFromFilter,
        q.dateToFilter,
      );
      await fetchAuditEvents();
      await fetchMaintenanceAlerts();
      await fetchPreventiveTasks();
    } catch (bootstrapError) {
      console.error(bootstrapError);
      setError("No se pudo inicializar el modulo de tickets.");
    }
    setTicketsReady(true);
    setLoading(false);
  }, [
    fetchCatalog,
    fetchLineas,
    fetchUsers,
    fetchSession,
    fetchTickets,
    fetchAuditEvents,
    fetchMaintenanceAlerts,
    fetchPreventiveTasks,
    busIdFromQuery,
    partCodeFromQuery,
    mineFromQuery,
  ]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void loadData();
  }, [loadData]);

  // Refetch al cambiar filtros (o al marcar ready, por si el bootstrap
  // quedó con una query distinta a la del estado actual). Sin `loading`
  // en deps: evitar un segundo fetch + skeleton al terminar el bootstrap.
  useEffect(() => {
    if (!ticketsReady) return;
    const key = ticketsListQueryKey({
      status: statusFilter,
      operator: operatorFilter,
      busId: busFilter,
      partCode: partCodeFromQuery,
      priority: priorityFilter,
      mine: onlyMine,
      tipo: tipoFilter,
      conductor: conductorFilter,
      dateFrom: dateFromFilter,
      dateTo: dateToFilter,
    });
    if (key === lastFetchedQueryKeyRef.current) return;
    fetchTickets(
      statusFilter,
      operatorFilter,
      busFilter,
      partCodeFromQuery,
      priorityFilter,
      onlyMine,
      tipoFilter,
      conductorFilter,
      dateFromFilter,
      dateToFilter,
    ).catch((filterError) => {
      console.error(filterError);
      setError("No se pudo refrescar la bandeja de tickets.");
    });
  }, [
    ticketsReady,
    statusFilter,
    priorityFilter,
    operatorFilter,
    busFilter,
    tipoFilter,
    partCodeFromQuery,
    onlyMine,
    conductorFilter,
    dateFromFilter,
    dateToFilter,
    fetchTickets,
  ]);

  const refreshTicketsAndSideData = useCallback(async () => {
    const q = ticketsQueryRef.current;
    await fetchTickets(
      q.statusFilter,
      q.operatorFilter,
      q.busFilter,
      q.partCodeFromQuery,
      q.priorityFilter,
      q.onlyMine,
      q.tipoFilter,
      q.conductorFilter,
      q.dateFromFilter,
      q.dateToFilter,
    );
    await fetchAuditEvents();
    await fetchMaintenanceAlerts();
    await fetchPreventiveTasks();
  }, [fetchTickets, fetchAuditEvents, fetchMaintenanceAlerts, fetchPreventiveTasks]);

  // ── Refresco en vivo desde SSE ─────────────────────────────────────────
  // Cuando otro usuario crea / cambia estado / asigna / comenta / elimina un
  // ticket, refrescamos la bandeja para que no haga falta pulsar F5. Usamos
  // un debounce ligero (300 ms) para colapsar ráfagas de eventos cuando hay
  // mucho movimiento (p. ej. una migración masiva).
  const liveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleLiveRefresh = useCallback(() => {
    if (loadingRef.current) return; // todavía no cargó la primera vez
    if (liveRefreshTimerRef.current) clearTimeout(liveRefreshTimerRef.current);
    liveRefreshTimerRef.current = setTimeout(() => {
      const q = ticketsQueryRef.current;
      fetchTickets(
        q.statusFilter,
        q.operatorFilter,
        q.busFilter,
        q.partCodeFromQuery,
        q.priorityFilter,
        q.onlyMine,
        q.tipoFilter,
        q.conductorFilter,
        q.dateFromFilter,
        q.dateToFilter,
      ).catch((refreshError) => console.warn("live refresh:", refreshError));
      fetchAuditEvents().catch(() => {});
    }, 300);
  }, [fetchTickets, fetchAuditEvents]);

  useSseEvent("ticket_created", scheduleLiveRefresh);
  useSseEvent("ticket_updated", scheduleLiveRefresh);
  useSseEvent("ticket_status_changed", scheduleLiveRefresh);
  useSseEvent("ticket_assigned", scheduleLiveRefresh);
  useSseEvent("ticket_commented", scheduleLiveRefresh);
  useSseEvent("ticket_deleted", scheduleLiveRefresh);

  const handleCreateTicket = useCallback(
    async (payload: CreateTicketPayload) => {
      const {
        form,
        stagedUploadFiles,
        selectedBus,
        selectedAsset,
        selectedTipologia,
        onTicketCreated,
        assignToMe,
        createAsResolved,
        resolutionNote,
      } = payload;
      if (!sessionUser) {
        setError("Debes iniciar sesión para crear tickets.");
        return;
      }
      // Si Pedro tecleó un bus que no está en el catálogo, `selectedBus` viene
      // null pero `form.busId` debe contener el id tecleado. El backend creará
      // el bus + activo SAE-DEFAULT al vuelo.
      const trimmedBusId = form.busId.trim();
      if (!trimmedBusId || !form.title || !form.description || !selectedTipologia) {
        setError("Debes completar bus, tipología, título y descripción.");
        return;
      }
      if (form.title.trim().length < 3) {
        setError("El título debe tener al menos 3 caracteres.");
        return;
      }
      if (form.description.trim().length < 8) {
        setError("La descripción debe tener al menos 8 caracteres.");
        return;
      }

      const knownPrefixes = collectOperatorPrefixes([
        ...catalog.map((bus) => bus.id),
        ...lineas,
      ]);
      const busResolved = resolveBusIdForForm(trimmedBusId, catalog.map((bus) => bus.id), knownPrefixes);
      if (!busResolved.ok) {
        setError(busResolved.message);
        return;
      }
      const lineaCheck = validateOptionalLineaLabel(form.lineaLabel, lineas, knownPrefixes);
      if (!lineaCheck.ok) {
        setError(lineaCheck.message);
        return;
      }

      const latStr = form.mapLatitude.trim();
      const lngStr = form.mapLongitude.trim();
      if (latStr !== lngStr && (!latStr || !lngStr)) {
        setError("Coordenadas: indica latitud y longitud juntas, o déjalas vacías.");
        return;
      }
      if (latStr && lngStr) {
        const la = Number(latStr.replace(",", "."));
        const lo = Number(lngStr.replace(",", "."));
        if (!Number.isFinite(la) || !Number.isFinite(lo)) {
          setError("Latitud y longitud deben ser números válidos (WGS84).");
          return;
        }
      }

      setSaving(true);
      setError(null);
      setNotice(null);
      setNoticeTone("success");
      setNoticePlacement("card");

      const ticketJson = {
        busId: busResolved.normalized,
        assetId: selectedAsset ? selectedAsset.id : "",
        tipo: selectedTipologia.tipo,
        subtipo: selectedTipologia.subtipo,
        subsubtipo: selectedTipologia.subsubtipo,
        dominio: selectedTipologia.dominio,
        nivelImpacto: selectedTipologia.nivelImpacto,
        origenTecnico: selectedTipologia.origenTecnico,
        observaciones: selectedTipologia.observaciones,
        title: form.title,
        description: form.description,
        impactedLines: form.impactedLines,
        serviceStopped: form.serviceStopped,
        photoNames: [] as string[],
        comment: form.comment,
        ...(lineaCheck.normalized ? { lineaLabel: lineaCheck.normalized } : {}),
        ...(form.servicioLabel.trim() ? { servicioLabel: form.servicioLabel.trim() } : {}),
        ...(form.conductorLabel.trim() ? { conductorLabel: form.conductorLabel.trim() } : {}),
        ...(form.incidentOccurredAt.trim()
          ? { incidentOccurredAt: new Date(form.incidentOccurredAt).toISOString() }
          : {}),
        priority: form.priority,
        falloOrigen: form.falloOrigen,
        ...(assignToMe ? { assignToMe: true } : {}),
        ...(createAsResolved ? { initialStatus: "resuelto" as const } : {}),
        ...(createAsResolved && resolutionNote?.trim()
          ? { resolutionNote: resolutionNote.trim() }
          : {}),
        ...(latStr && lngStr
          ? {
              latitude: Number(latStr.replace(",", ".")),
              longitude: Number(lngStr.replace(",", ".")),
              ...(form.mapPlaceMunicipio.trim()
                ? { mapPlaceMunicipio: form.mapPlaceMunicipio.trim() }
                : {}),
            }
          : {}),
      };

      // Si estamos offline, encolamos el borrador (con adjuntos en IndexedDB si los hay).
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        const { enqueueWithAttachments } = await import("@/lib/offline-ticket-queue");
        await enqueueWithAttachments(ticketJson, stagedUploadFiles);
        try {
          sessionStorage.removeItem(TICKET_FORM_DRAFT_KEY);
        } catch {
          /* ignore */
        }
        setSaving(false);
        setNoticeTone("warning");
        setNoticePlacement("center");
        setNotice("Sin conexión: el ticket se enviará automáticamente cuando recuperes red.");
        onTicketCreated?.();
        return;
      }

      let response: Response;
      if (stagedUploadFiles.length > 0) {
        const fd = new FormData();
        fd.append("ticket", JSON.stringify(ticketJson));
        for (const file of stagedUploadFiles) {
          fd.append("files", file);
        }
        response = await fetch("/api/tickets", {
          method: "POST",
          headers: { "x-user-role": role, "x-user-id": currentUserId },
          body: fd,
        });
      } else {
        response = await fetch("/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-role": role, "x-user-id": currentUserId },
          body: JSON.stringify(ticketJson),
        });
      }
      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | {
              message?: string;
              issues?: {
                fieldErrors?: Record<string, string[] | undefined>;
              };
            }
          | null;

        const issueText =
          errorPayload?.issues?.fieldErrors &&
          Object.entries(errorPayload.issues.fieldErrors)
            .flatMap(([field, messages]) => (messages ?? []).map((message) => `${field}: ${message}`))
            .join(" | ");
        setSaving(false);
        setError(issueText || errorPayload?.message || "No se pudo crear el ticket.");
        return;
      }

      const resPayload = (await response.json()) as {
        createdClosed?: boolean;
        assignedToActor?: boolean;
      };
      if (resPayload.createdClosed) {
        setNoticeTone("success");
        setNoticePlacement("center");
        setNotice(
          resPayload.assignedToActor
            ? "Ticket creado y cerrado en tu nombre."
            : "Ticket creado directamente como resuelto.",
        );
      }

      try {
        sessionStorage.removeItem(TICKET_FORM_DRAFT_KEY);
      } catch {
        /* ignore */
      }

      onTicketCreated?.();
      // Refrescar tickets y, si pudimos haber creado un bus al vuelo, también
      // el catálogo para que aparezca en próximos formularios.
      await Promise.all([refreshTicketsAndSideData(), fetchCatalog()]);
      setSaving(false);
    },
    [sessionUser, role, currentUserId, refreshTicketsAndSideData, fetchCatalog, catalog, lineas],
  );

  const openStatusChangeModal = useCallback(
    (ticketId: string, nextStatus: TicketStatus) => {
      if (!sessionUser) {
        setError("Debes iniciar sesión para cambiar estados.");
        return;
      }
      setActionMenuTicketId(null);
      setStatusChangeError(null);
      setStatusChangeComment("");
      setStatusChangeTarget({ ticketId, nextStatus });
    },
    [sessionUser],
  );

  const openTicketEdit = useCallback(
    (ticketId: string) => {
      if (!sessionUser) {
        setError("Debes iniciar sesión para corregir tickets.");
        return;
      }
      const ticket = tickets.find((t) => t.id === ticketId);
      if (ticket && ticketNeedsCompletion(ticket)) {
        setActionMenuTicketId(null);
        setDraftCompleteId(ticketId);
        return;
      }
      setActionMenuTicketId(null);
      setEditTargetId(ticketId);
    },
    [sessionUser, tickets],
  );

  const openDraftComplete = useCallback(
    (ticketId: string) => {
      if (!sessionUser) {
        setError("Debes iniciar sesión para completar borradores.");
        return;
      }
      setActionMenuTicketId(null);
      setDraftCompleteId(ticketId);
    },
    [sessionUser],
  );

  const handleStatusChange = useCallback(async () => {
    if (!statusChangeTarget || !sessionUser) return;
    const comment = statusChangeComment.trim();
    if (comment.length < 3) {
      setStatusChangeError("El comentario debe tener al menos 3 caracteres.");
      return;
    }
    setStatusChangeError(null);
    setStatusChangeSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/tickets/${statusChangeTarget.ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role, "x-user-id": currentUserId },
        body: JSON.stringify({ nextStatus: statusChangeTarget.nextStatus, comment }),
      });

      if (!response.ok) {
        setStatusChangeError("No tienes permiso para esa transición o hubo un error.");
        return;
      }

      setStatusChangeTarget(null);
      setStatusChangeComment("");
      setNoticeTone("success");
      setNoticePlacement("toast");
      setNotice("Estado del ticket actualizado correctamente.");
      await fetchTickets(statusFilter, operatorFilter, busFilter, partCodeFromQuery, priorityFilter, onlyMine, tipoFilter, conductorFilter, dateFromFilter, dateToFilter);
      await fetchAuditEvents();
      await fetchMaintenanceAlerts();
      await fetchPreventiveTasks();
    } finally {
      setStatusChangeSubmitting(false);
    }
  }, [
    statusChangeTarget,
    sessionUser,
    statusChangeComment,
    role,
    currentUserId,
    statusFilter,
    operatorFilter,
    busFilter,
    partCodeFromQuery,
    priorityFilter,
    onlyMine,
    tipoFilter,
    fetchTickets,
    fetchAuditEvents,
    fetchMaintenanceAlerts,
    fetchPreventiveTasks,
  ]);

  const handleCreatePreventiveTask = useCallback(
    async (alert: MaintenanceAlertView) => {
      if (!sessionUser) {
        setError("Debes iniciar sesión para crear tareas preventivas.");
        return;
      }
      setError(null);
      setNotice(null);
      const response = await fetch("/api/maintenance/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role, "x-user-id": currentUserId },
        body: JSON.stringify({
          busId: alert.busId,
          assetType: alert.assetType,
          reason: `${alert.failuresInWindow} fallos de ${alert.assetType} en ${maintenanceWindowDays} días`,
        }),
      });

      if (!response.ok) {
        const message = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(message?.message ?? "No se pudo crear tarea preventiva.");
        return;
      }

      setNoticeTone("success");
      setNoticePlacement("toast");
      setNotice("Tarea preventiva creada correctamente.");
      await fetchMaintenanceAlerts();
      await fetchAuditEvents();
      await fetchPreventiveTasks();
    },
    [sessionUser, role, currentUserId, maintenanceWindowDays, fetchMaintenanceAlerts, fetchAuditEvents, fetchPreventiveTasks],
  );

  const handleUpdatePreventiveTaskStatus = useCallback(
    async (taskId: string, status: "pendiente" | "programada" | "completada" | "cancelada") => {
      if (!sessionUser) {
        setError("Debes iniciar sesión para actualizar tareas preventivas.");
        return;
      }
      const response = await fetch("/api/maintenance/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role, "x-user-id": currentUserId },
        body: JSON.stringify({ taskId, status }),
      });
      const text = await response.text();
      if (!response.ok) {
        const payload = JSON.parse(text || "{}") as { message?: string };
        setError(payload.message ?? "No se pudo actualizar la tarea preventiva.");
        return;
      }
      setNoticeTone("success");
      setNoticePlacement("toast");
      setNotice("Tarea preventiva actualizada.");
      await fetchPreventiveTasks();
      await fetchAuditEvents();
    },
    [sessionUser, role, currentUserId, fetchPreventiveTasks, fetchAuditEvents],
  );

  const handleCompleteTask = useCallback(
    async (taskId: string) => {
      if (!sessionUser) {
        setError("Debes iniciar sesión para completar tareas preventivas.");
        return;
      }
      const response = await fetch("/api/maintenance/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role, "x-user-id": currentUserId },
        body: JSON.stringify({
          taskId,
          status: "completada",
          completionNotes: completionNote.trim() || undefined,
        }),
      });
      const text = await response.text();
      if (!response.ok) {
        const payload = JSON.parse(text || "{}") as { message?: string };
        setError(payload.message ?? "No se pudo completar la tarea preventiva.");
        return;
      }
      setCompletingTaskId(null);
      setCompletionNote("");
      setNoticeTone("success");
      setNoticePlacement("toast");
      setNotice("Tarea preventiva completada.");
      await fetchPreventiveTasks();
      await fetchAuditEvents();
    },
    [sessionUser, role, currentUserId, completionNote, fetchPreventiveTasks, fetchAuditEvents],
  );

  const handlePlanPreventiveTask = useCallback(
    async (taskId: string) => {
      if (!sessionUser) {
        setError("Debes iniciar sesión para planificar tareas preventivas.");
        return;
      }
      const plan = taskPlans[taskId];
      if (!plan?.assignedToUserId || !plan?.scheduledAt) {
        setError("Selecciona técnico y fecha para planificar.");
        return;
      }

      const response = await fetch("/api/maintenance/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role, "x-user-id": currentUserId },
        body: JSON.stringify({
          taskId,
          assignedToUserId: plan.assignedToUserId,
          scheduledAt: new Date(plan.scheduledAt).toISOString(),
          status: "programada",
        }),
      });
      const text = await response.text();
      if (!response.ok) {
        const payload = JSON.parse(text || "{}") as { message?: string };
        setError(payload.message ?? "No se pudo planificar la tarea preventiva.");
        return;
      }
      setNoticeTone("success");
      setNoticePlacement("toast");
      setNotice("Tarea preventiva planificada.");
      await fetchPreventiveTasks();
      await fetchAuditEvents();
    },
    [sessionUser, role, currentUserId, taskPlans, fetchPreventiveTasks, fetchAuditEvents],
  );

  const handleAssignTicket = useCallback(async () => {
    if (!assignTarget || !sessionUser) return;
    const response = await fetch(`/api/tickets/${assignTarget}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedToUserId: assignTechnicianId || null }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      setError(data.message ?? "No se pudo asignar el ticket.");
      return;
    }
    setAssignTarget(null);
    setAssignTechnicianId("");
    setActionMenuTicketId(null);
    setNoticeTone("success");
    setNoticePlacement("toast");
    setNotice("Ticket asignado correctamente.");
    await fetchTickets(statusFilter, operatorFilter, busFilter, partCodeFromQuery, priorityFilter, onlyMine, tipoFilter, conductorFilter, dateFromFilter, dateToFilter);
  }, [
    assignTarget,
    sessionUser,
    assignTechnicianId,
    statusFilter,
    operatorFilter,
    busFilter,
    partCodeFromQuery,
    priorityFilter,
    fetchTickets,
  ]);

  const handleConsumeReservation = useCallback(async () => {
    await Promise.resolve();
  }, []);

  const handleCancelReservation = useCallback(async () => {
    await Promise.resolve();
  }, []);

  /**
   * Tras un borrado exitoso (DELETE /api/tickets/[id]) cerramos el diálogo,
   * limpiamos cualquier menú abierto y forzamos un refetch con los filtros
   * actuales para que el ticket desaparezca de la bandeja al instante.
   */
  const handleTicketDeleted = useCallback(async () => {
    setDeleteTarget(null);
    setActionMenuTicketId(null);
    await fetchTickets(statusFilter, operatorFilter, busFilter, partCodeFromQuery, priorityFilter, onlyMine, tipoFilter, conductorFilter, dateFromFilter, dateToFilter);
  }, [fetchTickets, statusFilter, operatorFilter, busFilter, partCodeFromQuery, priorityFilter, tipoFilter]);

  const clearPartCodeFilter = useCallback(() => {
    const q = new URLSearchParams();
    if (statusFilter !== "todos") q.set("status", statusFilter);
    if (priorityFilter !== "todos") q.set("priority", priorityFilter);
    if (operatorFilter !== "todas") q.set("operator", operatorFilter);
    if (busFilter !== "todas") q.set("busId", busFilter);
    if (tipoFilter !== "todos") q.set("tipo", tipoFilter);
    if (onlyMine) q.set("mine", "1");
    if (slaOverdueOnly) q.set("sla", "overdue");
    const qs = q.toString();
    router.replace(qs ? `${inboxPath}?${qs}` : inboxPath, { scroll: false });
  }, [
    statusFilter,
    priorityFilter,
    operatorFilter,
    busFilter,
    tipoFilter,
    onlyMine,
    slaOverdueOnly,
    router,
    inboxPath,
  ]);

  const setSlaOverdueOnly = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const value = typeof next === "function" ? next(slaOverdueOnly) : next;
      const q = new URLSearchParams();
      if (statusFilter !== "todos") q.set("status", statusFilter);
      if (priorityFilter !== "todos") q.set("priority", priorityFilter);
      if (operatorFilter !== "todas") q.set("operator", operatorFilter);
      if (busFilter !== "todas") q.set("busId", busFilter);
      if (tipoFilter !== "todos") q.set("tipo", tipoFilter);
      if (partCodeFromQuery) q.set("partCode", partCodeFromQuery);
      if (onlyMine) q.set("mine", "1");
      if (value) q.set("sla", "overdue");
      const qs = q.toString();
      router.replace(qs ? `${inboxPath}?${qs}` : inboxPath, { scroll: false });
    },
    [
      slaOverdueOnly,
      statusFilter,
      priorityFilter,
      operatorFilter,
      busFilter,
      tipoFilter,
      partCodeFromQuery,
      onlyMine,
      router,
      inboxPath,
    ],
  );

  const handleClearFilters = useCallback(() => {
    setStatusFilter("todos");
    setPriorityFilter("todos");
    setOperatorFilter("todas");
    setBusFilter("todas");
    setTipoFilter("todos");
    setConductorFilter("");
    setDateFromFilter("");
    setDateToFilter("");
    setOnlyMine(false);
    router.replace(inboxPath);
  }, [router, inboxPath]);

  /**
   * Aplica una vista guardada: parsea el querystring (sin '?'), resetea TODOS
   * los filtros y aplica los presentes. También sincroniza la URL para que
   * la vista pueda compartirse por enlace y para que `useTickets` mantenga
   * coherencia con su lectura inicial de `searchParams`.
   */
  const applyView = useCallback(
    (rawQuery: string) => {
      const params = new URLSearchParams(rawQuery.replace(/^\?/, ""));
      const nextStatus = params.get("status");
      const nextPriority = params.get("priority");
      const nextOperator = params.get("operator");
      const nextBus = params.get("busId");
      const nextTipo = params.get("tipo");
      const nextMine = params.get("mine");

      const statusAllowed: Array<TicketStatus | "todos"> = [
        "todos",
        "abierto",
        "en_proceso",
        "esperando_repuesto",
        "resuelto",
      ];
      const priAllowed: Array<TicketPriority | "todos"> = ["todos", "alta", "media", "baja"];

      setStatusFilter(
        nextStatus && statusAllowed.includes(nextStatus as TicketStatus | "todos")
          ? (nextStatus as "todos" | TicketStatus)
          : "todos",
      );
      setPriorityFilter(
        nextPriority && priAllowed.includes(nextPriority as TicketPriority | "todos")
          ? (nextPriority as "todos" | TicketPriority)
          : "todos",
      );
      setOperatorFilter(nextOperator && nextOperator.length > 0 ? nextOperator : "todas");
      setBusFilter(nextBus && nextBus.length > 0 ? nextBus : "todas");
      setTipoFilter(nextTipo && nextTipo.length > 0 && nextTipo !== "todos" ? nextTipo : "todos");
      setOnlyMine(nextMine === "1");

      // Sincroniza la URL (sin scroll) para que reflejar/compartir la vista
      // funcione igual que aplicar los filtros manualmente.
      const qs = params.toString();
      router.replace(qs ? `${inboxPath}?${qs}` : inboxPath, { scroll: false });
    },
    [router, inboxPath],
  );

  const filteredTickets = useMemo(() => {
    const now = Date.now();
    let list = tickets;
    if (slaOverdueOnly) {
      list = list.filter(
        (t) =>
          t.status !== "resuelto" &&
          Boolean(t.slaDeadline) &&
          new Date(t.slaDeadline).getTime() < now,
      );
    }

    const hourParam = hourFromQuery != null ? Number(hourFromQuery) : NaN;
    if (Number.isInteger(hourParam) && hourParam >= 0 && hourParam <= 23) {
      list = list.filter((t) => new Date(t.createdAt).getHours() === hourParam);
    }

    const shiftParam = (shiftFromQuery ?? "").toUpperCase();
    if (VALID_SHIFTS.has(shiftParam as ShiftKey)) {
      list = list.filter(
        (t) => currentShiftFromHour(new Date(t.createdAt).getHours()) === shiftParam,
      );
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.busId.toLowerCase().includes(q) ||
        t.operator.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.subsubtipo?.toLowerCase().includes(q) ?? false) ||
        (t.tipo?.toLowerCase().includes(q) ?? false) ||
        (t.subtipo?.toLowerCase().includes(q) ?? false) ||
        (t.assignedToUserName?.toLowerCase().includes(q) ?? false) ||
        t.id.toLowerCase().includes(q),
    );
  }, [tickets, searchQuery, slaOverdueOnly, hourFromQuery, shiftFromQuery]);

  const inboxScreenReaderSummary = useMemo(() => {
    const estado = statusFilter === "todos" ? "Todos los estados" : statusMap[statusFilter];
    const priTxt =
      priorityFilter === "todos"
        ? "todas las prioridades"
        : priorityFilter === "alta"
          ? "prioridad alta"
          : priorityFilter === "media"
            ? "prioridad media"
            : "prioridad baja";
    const operadora = operatorFilter === "todas" ? "Todas las operadoras" : operatorFilter;
    const busTxt = busFilter === "todas" ? "Todos los buses" : busFilter;
    const tipoTxt = tipoFilter === "todos" ? "Todos los tipos" : tipoFilter;
    const slaTxt = slaOverdueOnly ? ", SLA vencido" : "";
    const pieza = partCodeFromQuery ? `, repuesto ${partCodeFromQuery}` : "";
    return `Bandeja: ${tickets.length} ticket(s) visibles. Filtros activos: estado ${estado}, ${priTxt}, operadora ${operadora}, bus ${busTxt}, tipo ${tipoTxt}${slaTxt}${pieza}.`;
  }, [tickets.length, statusFilter, priorityFilter, operatorFilter, busFilter, tipoFilter, partCodeFromQuery, slaOverdueOnly]);

  const handleExportTicketsCsv = useCallback(() => {
    const rows: TicketCsvExportRow[] = filteredTickets.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      busId: t.busId,
      operator: t.operator,
      municipio: t.municipio,
      assetType: t.assetType,
      status: t.status,
      priority: t.priority,
      tipo: t.tipo,
      subtipo: t.subtipo,
      subsubtipo: t.subsubtipo,
      dominio: t.dominio,
      nivelImpacto: t.nivelImpacto,
      origenTecnico: t.origenTecnico,
      lineaLabel: t.lineaLabel,
      servicioLabel: t.servicioLabel,
      conductorLabel: t.conductorLabel,
      assignedToUserName: t.assignedToUserName,
      slaDeadline: t.slaDeadline,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      incidentOccurredAt: t.incidentOccurredAt,
      needsCompletion: t.needsCompletion,
      mapPlaceMunicipio: t.mapPlaceMunicipio,
      latitude: t.latitude,
      longitude: t.longitude,
    }));

    const exportedAt = new Date();
    const filtersSummary = searchQuery.trim()
      ? `Búsqueda «${searchQuery.trim()}» · ${inboxScreenReaderSummary.replace(/^Bandeja: \d+ ticket\(s\) visibles\. Filtros activos: /, "")}`
      : inboxScreenReaderSummary.replace(/^Bandeja: \d+ ticket\(s\) visibles\. Filtros activos: /, "");

    const csv = buildTicketsCsv(rows, { exportedAt, filtersSummary });
    const downloadName = ticketsCsvFilename(exportedAt);
    downloadTicketsCsv(csv, downloadName);
    setNoticeTone("success");
    setNoticePlacement("toast");
    setNotice(`Exportados ${filteredTickets.length} ticket(s). Archivo: ${downloadName}`);
  }, [filteredTickets, inboxScreenReaderSummary, searchQuery, setNotice, setNoticePlacement, setNoticeTone]);

  const ticketCountByPriority = useMemo(() => {
    return tickets.reduce(
      (acc, ticket) => {
        acc[ticket.priority] += 1;
        return acc;
      },
      { alta: 0, media: 0, baja: 0 } as Record<TicketPriority, number>,
    );
  }, [tickets]);

  const filtersInUrl = useMemo(() => {
    const s = searchParams.toString();
    return s.length > 0;
  }, [searchParams]);

  return {
    partCodeFromQuery,
    sessionUser,
    role,
    catalog,
    lineas,
    fetchLineas,
    tipologias,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    conductorFilter,
    setConductorFilter,
    dateFromFilter,
    setDateFromFilter,
    dateToFilter,
    setDateToFilter,
    operatorFilter,
    setOperatorFilter,
    busFilter,
    setBusFilter,
    tipoFilter,
    setTipoFilter,
    tipoFilterOptions,
    onlyMine,
    setOnlyMine,
    slaOverdueOnly,
    setSlaOverdueOnly,
    tickets,
    loading,
    saving,
    error,
    setError,
    notice,
    setNotice,
    noticeTone,
    setNoticeTone,
    noticePlacement,
    setNoticePlacement,
    auditEvents,
    maintenanceAlerts,
    maintenanceWindowDays,
    preventiveTasks,
    taskPlans,
    setTaskPlans,
    completingTaskId,
    setCompletingTaskId,
    completionNote,
    setCompletionNote,
    searchQuery,
    setSearchQuery,
    assignTarget,
    setAssignTarget,
    assignTechnicianId,
    setAssignTechnicianId,
    deleteTarget,
    setDeleteTarget,
    handleTicketDeleted,
    editTargetId,
    setEditTargetId,
    editTargetTicket,
    openTicketEdit,
    draftCompleteId,
    setDraftCompleteId,
    draftCompleteTicket,
    openDraftComplete,
    shortcutsOpen,
    setShortcutsOpen,
    quickTicketOpen,
    setQuickTicketOpen,
    actionMenuTicketId,
    setActionMenuTicketId,
    actionMenuViewport,
    actionMenuTicket,
    statusChangeTarget,
    setStatusChangeTarget,
    statusChangeComment,
    setStatusChangeComment,
    statusChangeError,
    setStatusChangeError,
    statusChangeSubmitting,
    setStatusChangeSubmitting,
    filterSearchRef,
    bandejaCompacta,
    setBandejaCompacta,
    showTicketsUiHint,
    setShowTicketsUiHint,
    technicians,
    operators,
    filteredTickets,
    ticketCountByPriority,
    inboxScreenReaderSummary,
    filtersInUrl,
    loadData,
    refreshTicketsAndSideData,
    handleCreateTicket,
    openStatusChangeModal,
    handleStatusChange,
    handleAssignTicket,
    handleConsumeReservation,
    handleCancelReservation,
    handleClearFilters,
    applyView,
    clearPartCodeFilter,
    handleExportTicketsCsv,
    handleCreatePreventiveTask,
    handleUpdatePreventiveTaskStatus,
    handleCompleteTask,
    handlePlanPreventiveTask,
  };
}
