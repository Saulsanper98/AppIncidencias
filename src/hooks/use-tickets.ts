"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type {
  AuditEventView,
  CatalogBus,
  CatalogPayload,
  CreateTicketPayload,
  InventorySummaryItem,
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
import { toUiPriority } from "@/lib/ticketing";

export function useTickets() {
  const router = useRouter();
  const pathname = usePathname();
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
  const partCodeFromQuery = searchParams.get("partCode")?.trim() ?? "";
  const mineFromQuery = searchParams.get("mine");

  const [users, setUsers] = useState<LocalUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [role, setRole] = useState<UserRole>("conductor");
  const [catalog, setCatalog] = useState<CatalogBus[]>([]);
  const [lineas, setLineas] = useState<string[]>([]);
  const [tipologias, setTipologias] = useState<
    import("@/lib/tipologia").TipologiaItem[]
  >([]);
  const [statusFilter, setStatusFilter] = useState<"todos" | TicketStatus>("todos");
  const [priorityFilter, setPriorityFilter] = useState<"todos" | TicketPriority>("todos");
  const [operatorFilter, setOperatorFilter] = useState<"todas" | string>("todas");
  const [busFilter, setBusFilter] = useState<"todas" | string>("todas");
  // Chip "Mis tickets": inicializado desde la URL (`?mine=1`). Para técnicos
  // se activa por defecto al cargar (efecto más abajo).
  const [onlyMine, setOnlyMine] = useState<boolean>(mineFromQuery === "1");
  const [tickets, setTickets] = useState<TicketView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"success" | "warning" | "info">("success");
  const [noticePlacement, setNoticePlacement] = useState<"card" | "toast" | "center">("card");
  const [inventorySummary, setInventorySummary] = useState<InventorySummaryItem[]>([]);
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
  const statusFilterSelectRef = useRef<HTMLButtonElement>(null);
  const [bandejaCompacta, setBandejaCompacta] = useState(false);
  const [showTicketsUiHint, setShowTicketsUiHint] = useState(false);

  const actionMenuTicket = useMemo(
    () => (actionMenuTicketId ? tickets.find((t) => t.id === actionMenuTicketId) ?? null : null),
    [actionMenuTicketId, tickets],
  );

  const operators = useMemo(() => Array.from(new Set(catalog.map((bus) => bus.operator))), [catalog]);
  const technicians = useMemo(
    () => users.filter((user) => user.role === "tecnico_campo" && user.id !== ""),
    [users],
  );

  useEffect(() => {
    if (busIdFromQuery) {
      setBusFilter(busIdFromQuery);
    }
  }, [busIdFromQuery]);

  useEffect(() => {
    if (!statusFromQuery) return;
    const allowed: Array<TicketStatus | "todos"> = [
      "todos",
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
        statusFilterSelectRef.current?.focus();
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
      if (raw === "1") setBandejaCompacta(true);
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
      const curStatus = searchParams.get("status") ?? "";
      const curPri = searchParams.get("priority") ?? "";
      const curOp = searchParams.get("operator") ?? "";
      const curBus = searchParams.get("busId") ?? "";
      const curPart = searchParams.get("partCode")?.trim() ?? "";
      if (curStatus === desiredStatus && curPri === desiredPri && curOp === desiredOp && curBus === desiredBus)
        return;
      const q = new URLSearchParams();
      if (desiredStatus) q.set("status", desiredStatus);
      if (desiredPri) q.set("priority", desiredPri);
      if (desiredOp) q.set("operator", desiredOp);
      if (desiredBus) q.set("busId", desiredBus);
      if (curPart) q.set("partCode", curPart);
      const qs = q.toString();
      router.replace(qs ? `${inboxPath}?${qs}` : inboxPath, { scroll: false });
    }, 0);
    return () => window.clearTimeout(id);
  }, [loading, pathname, inboxPath, statusFilter, priorityFilter, operatorFilter, busFilter, router, searchParams]);

  const fetchCatalog = useCallback(async () => {
    const response = await fetch("/api/catalog", { cache: "no-store" });
    const text = await response.text();
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
      setCurrentUserId((prev) => prev || data.users[0].id);
      if (!currentUserId) {
        setRole(data.users[0].role);
      }
    }
  }, [currentUserId]);

  const fetchSession = useCallback(async (): Promise<{ mineDefault: boolean }> => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || "Error al cargar sesión");
    }
    const data = JSON.parse(text) as { authenticated: boolean; user?: SessionUser };
    if (data.authenticated && data.user) {
      setSessionUser(data.user);
      setCurrentUserId(data.user.id);
      setRole(data.user.role);
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
    ) => {
      const query = new URLSearchParams({ status, operator, busId });
      if (priority !== "todos") {
        query.set("priority", priority);
      }
      if (partCode.trim()) {
        query.set("partCode", partCode.trim());
      }
      if (mine) {
        query.set("mine", "1");
      }
      const response = await fetch(`/api/tickets?${query.toString()}`, {
        cache: "no-store",
        headers: {
          "x-user-id": currentUserId,
          "x-user-role": role,
        },
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || "Error al cargar tickets");
      }
      const data = JSON.parse(text) as { tickets: TicketView[] };
      setTickets(data.tickets);
    },
    [currentUserId, role],
  );

  const fetchInventorySummary = useCallback(async () => {
    const response = await fetch("/api/inventory/summary", { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || "Error al cargar inventario");
    }
    const data = JSON.parse(text) as { summary: InventorySummaryItem[] };
    setInventorySummary(data.summary);
  }, []);

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
      const initialMine = mineFromQuery === "1" || session.mineDefault;
      await fetchTickets(
        "todos",
        "todas",
        busIdFromQuery ?? "todas",
        partCodeFromQuery,
        "todos",
        initialMine,
      );
      await fetchInventorySummary();
      await fetchAuditEvents();
      await fetchMaintenanceAlerts();
      await fetchPreventiveTasks();
    } catch (bootstrapError) {
      console.error(bootstrapError);
      setError("No se pudo inicializar el modulo de tickets.");
    }
    setLoading(false);
  }, [
    fetchCatalog,
    fetchLineas,
    fetchUsers,
    fetchSession,
    fetchTickets,
    fetchInventorySummary,
    fetchAuditEvents,
    fetchMaintenanceAlerts,
    fetchPreventiveTasks,
    busIdFromQuery,
    partCodeFromQuery,
    mineFromQuery,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!loading) {
      fetchTickets(statusFilter, operatorFilter, busFilter, partCodeFromQuery, priorityFilter, onlyMine).catch((filterError) => {
        console.error(filterError);
        setError("No se pudo refrescar la bandeja de tickets.");
      });
    }
  }, [statusFilter, priorityFilter, operatorFilter, busFilter, partCodeFromQuery, onlyMine, loading, fetchTickets, role]);

  const refreshTicketsAndSideData = useCallback(async () => {
    await fetchTickets(statusFilter, operatorFilter, busFilter, partCodeFromQuery, priorityFilter, onlyMine);
    await fetchInventorySummary();
    await fetchAuditEvents();
    await fetchMaintenanceAlerts();
    await fetchPreventiveTasks();
  }, [
    statusFilter,
    operatorFilter,
    busFilter,
    partCodeFromQuery,
    priorityFilter,
    onlyMine,
    fetchTickets,
    fetchInventorySummary,
    fetchAuditEvents,
    fetchMaintenanceAlerts,
    fetchPreventiveTasks,
  ]);

  // ── Refresco en vivo desde SSE ─────────────────────────────────────────
  // Cuando otro usuario crea / cambia estado / asigna / comenta / elimina un
  // ticket, refrescamos la bandeja para que no haga falta pulsar F5. Usamos
  // un debounce ligero (300 ms) para colapsar ráfagas de eventos cuando hay
  // mucho movimiento (p. ej. una migración masiva).
  const liveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleLiveRefresh = useCallback(() => {
    if (loading) return; // todavía no cargó la primera vez
    if (liveRefreshTimerRef.current) clearTimeout(liveRefreshTimerRef.current);
    liveRefreshTimerRef.current = setTimeout(() => {
      fetchTickets(statusFilter, operatorFilter, busFilter, partCodeFromQuery, priorityFilter, onlyMine).catch(
        (refreshError) => console.warn("live refresh:", refreshError),
      );
      fetchAuditEvents().catch(() => {});
    }, 300);
  }, [
    loading,
    fetchTickets,
    statusFilter,
    operatorFilter,
    busFilter,
    partCodeFromQuery,
    priorityFilter,
    onlyMine,
    fetchAuditEvents,
  ]);

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
        busId: selectedBus ? selectedBus.id : trimmedBusId,
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
        ...(form.lineaLabel.trim() ? { lineaLabel: form.lineaLabel.trim() } : {}),
        ...(form.servicioLabel.trim() ? { servicioLabel: form.servicioLabel.trim() } : {}),
        ...(form.conductorLabel.trim() ? { conductorLabel: form.conductorLabel.trim() } : {}),
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

      // Si estamos offline y NO hay adjuntos (no se pueden serializar Files
      // a localStorage), encolamos el borrador para envío diferido. El
      // OfflineQueueIndicator del layout privado avisará al usuario y hará
      // los reintentos al recuperar conexión.
      if (
        typeof navigator !== "undefined" &&
        navigator.onLine === false &&
        stagedUploadFiles.length === 0
      ) {
        const { enqueue } = await import("@/lib/offline-ticket-queue");
        enqueue(ticketJson);
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
        inventory?: {
          status: "reservado" | "sin_stock" | "skipped";
          partCode: string;
          warehouseName?: string;
        };
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
      } else if (resPayload.inventory?.status === "reservado") {
        setNoticeTone("info");
        setNoticePlacement("center");
        setNotice(
          `Repuesto ${resPayload.inventory.partCode} reservado en ${resPayload.inventory.warehouseName ?? "almacén"}.`,
        );
      } else if (resPayload.inventory?.status === "sin_stock") {
        setNoticeTone("warning");
        setNoticePlacement("center");
        setNotice("Sin stock disponible: ticket movido a 'Esperando repuesto'.");
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
    [sessionUser, role, currentUserId, refreshTicketsAndSideData, fetchCatalog],
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
      await fetchTickets(statusFilter, operatorFilter, busFilter, partCodeFromQuery, priorityFilter, onlyMine);
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
    await fetchTickets(statusFilter, operatorFilter, busFilter, partCodeFromQuery, priorityFilter, onlyMine);
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
    await fetchTickets(statusFilter, operatorFilter, busFilter, partCodeFromQuery, priorityFilter, onlyMine);
  }, [fetchTickets, statusFilter, operatorFilter, busFilter, partCodeFromQuery, priorityFilter]);

  const handleClearFilters = useCallback(() => {
    setStatusFilter("todos");
    setPriorityFilter("todos");
    setOperatorFilter("todas");
    setBusFilter("todas");
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
      setOnlyMine(nextMine === "1");

      // Sincroniza la URL (sin scroll) para que reflejar/compartir la vista
      // funcione igual que aplicar los filtros manualmente.
      const qs = params.toString();
      router.replace(qs ? `${inboxPath}?${qs}` : inboxPath, { scroll: false });
    },
    [router, inboxPath],
  );

  const clearPartCodeFilter = useCallback(() => {
    const q = new URLSearchParams();
    if (statusFilter !== "todos") q.set("status", statusFilter);
    if (priorityFilter !== "todos") q.set("priority", priorityFilter);
    if (operatorFilter !== "todas") q.set("operator", operatorFilter);
    if (busFilter !== "todas") q.set("busId", busFilter);
    const qs = q.toString();
    router.replace(qs ? `${inboxPath}?${qs}` : inboxPath, { scroll: false });
  }, [statusFilter, priorityFilter, operatorFilter, busFilter, router, inboxPath]);

  const filteredTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.busId.toLowerCase().includes(q) ||
        t.operator.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.subsubtipo?.toLowerCase().includes(q) ?? false) ||
        (t.assignedToUserName?.toLowerCase().includes(q) ?? false) ||
        t.id.toLowerCase().includes(q),
    );
  }, [tickets, searchQuery]);

  const handleExportTicketsCsv = useCallback(() => {
    const delimiter = ";";
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = [
      "id",
      "título",
      "bus",
      "operadora",
      "estado",
      "prioridad",
      "sla_deadline_iso",
      "activo",
      "asignado_a",
    ];
    const lines = filteredTickets.map((t) =>
      [
        t.id,
        t.title,
        t.busId,
        t.operator,
        statusMap[t.status],
        toUiPriority(t.priority),
        t.slaDeadline,
        t.subsubtipo ?? t.assetType,
        t.assignedToUserName ?? "",
      ]
        .map((cell) => escape(String(cell)))
        .join(delimiter),
    );
    const csv = [header.join(delimiter), ...lines].join("\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const fileStamp = new Date().toISOString().replace(/[:]/g, "-").slice(0, 19);
    const downloadName = `tickets_ccmgc_${fileStamp}.csv`;
    anchor.download = downloadName;
    anchor.click();
    URL.revokeObjectURL(url);
    setNoticeTone("success");
    setNoticePlacement("toast");
    setNotice(
      `Exportados ${filteredTickets.length} ticket(s). Archivo: ${downloadName} (zona horaria del navegador en el nombre).`,
    );
  }, [filteredTickets]);

  const ticketCountByPriority = useMemo(() => {
    return tickets.reduce(
      (acc, ticket) => {
        acc[ticket.priority] += 1;
        return acc;
      },
      { alta: 0, media: 0, baja: 0 } as Record<TicketPriority, number>,
    );
  }, [tickets]);

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
    const pieza = partCodeFromQuery ? `, repuesto ${partCodeFromQuery}` : "";
    return `Bandeja: ${tickets.length} ticket(s) visibles. Filtros activos: estado ${estado}, ${priTxt}, operadora ${operadora}, bus ${busTxt}${pieza}.`;
  }, [tickets.length, statusFilter, priorityFilter, operatorFilter, busFilter, partCodeFromQuery]);

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
    operatorFilter,
    setOperatorFilter,
    busFilter,
    setBusFilter,
    onlyMine,
    setOnlyMine,
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
    inventorySummary,
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
    statusFilterSelectRef,
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
