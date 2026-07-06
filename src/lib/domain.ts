export type AssetType = "validadora" | "sae" | "router" | "pantalla";

export type TicketStatus = "borrador" | "abierto" | "en_proceso" | "esperando_repuesto" | "resuelto";

export type TicketPriority = "alta" | "media" | "baja";

export type UserRole = "conductor" | "tecnico_campo" | "gestor_centro_control";

export type WarehouseType = "almacen_central" | "cochera";

export type MaintenanceAlertSeverity = "info" | "warning" | "critical";

export type BusAsset = {
  id: string;
  busId: string;
  type: AssetType;
  serialNumber: string;
  installedAt: string;
  /** Minutos de SLA fijos para este activo (opcional). */
  slaMinutes?: number | null;
};

export type Ticket = {
  id: string;
  busId: string;
  assetId: string;
  tipo?: string | null;
  subtipo?: string | null;
  subsubtipo?: string | null;
  dominio?: string | null;
  nivelImpacto?: string | null;
  origenTecnico?: string | null;
  observaciones?: string | null;
  /** Línea/ruta operativa (opcional). Autocompletable desde catálogo, acepta texto libre. */
  lineaLabel?: string | null;
  /** Etiqueta libre de servicio/turno/recorrido (opcional, texto libre puro). */
  servicioLabel?: string | null;
  /** Nombre del conductor en el momento de la incidencia (opcional). */
  conductorLabel?: string | null;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  slaDeadline: string;
  /** WGS84 opcional para mapa */
  latitude?: number | null;
  longitude?: number | null;
  /** Municipio o lugar asociado al pin del mapa (si existe). */
  mapPlaceMunicipio?: string | null;
  assignedToUserId?: string | null;
  assignedToUserName?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Hora real de la incidencia (apunte express); puede diferir de createdAt. */
  incidentOccurredAt?: string | null;
  /** Apunte express u otro alta mínima sin completar (tipología, adjuntos…). */
  needsCompletion?: boolean;
};

export type TicketComment = {
  id: string;
  ticketId: string;
  author: string;
  body: string;
  createdAt: string;
};

export type Warehouse = {
  id: string;
  name: string;
  municipio: string;
  type: WarehouseType;
};

export type SparePart = {
  id: string;
  code: string;
  name: string;
  compatibleAssetType: AssetType;
  minimumLevel: number;
};

export type InventoryStock = {
  warehouseId: string;
  sparePartId: string;
  quantity: number;
  reserved: number;
  updatedAt: string;
};

export type TicketPartReservation = {
  id: string;
  ticketId: string;
  sparePartId: string;
  warehouseId: string;
  quantity: number;
  status: "reservado" | "consumido" | "cancelado";
  createdAt: string;
};

export type AssetFailureTrend = {
  busId: string;
  assetType: AssetType;
  failuresLast30Days: number;
  severity: MaintenanceAlertSeverity;
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  preferredDashboardId?: string | null;
  /** URL pública o externa del avatar del usuario (admite GIF animado). */
  avatarUrl?: string | null;
  /** URL pública o externa del banner de cabecera del perfil (admite GIF). */
  bannerUrl?: string | null;
  /** Puesto/departamento mostrado bajo el nombre (ej. "Centro de control"). */
  position?: string | null;
  /** Cuenta de solo lectura: cliente oculta acciones y servidor rechaza mutaciones. */
  isReadOnly?: boolean;
};

export type AuditEvent = {
  id: string;
  userId: string | null;
  ticketId: string | null;
  action: string;
  detail: string | null;
  createdAt: string;
};

export type PreventiveTaskStatus = "pendiente" | "programada" | "completada" | "cancelada";

export type FeedbackType = "idea" | "error" | "mejora";
export type FeedbackCategory = "interfaz" | "funcionalidad" | "rendimiento" | "documentacion" | "otro";
export type FeedbackUrgency = "baja" | "media" | "alta";
export type FeedbackStatus = "pendiente" | "en_revision" | "planificado" | "implementado" | "descartado";

export type FeedbackAttachment = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  url: string;
};

export type UserFeedback = {
  id: string;
  type: FeedbackType;
  category: FeedbackCategory;
  title: string;
  description: string;
  rating: number | null;
  urgency: FeedbackUrgency;
  currentPage: string | null;
  appVersion: string | null;
  userId: string | null;
  userName: string | null;
  userRole: string | null;
  status: FeedbackStatus;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  attachments?: FeedbackAttachment[];
};

export type PreventiveTask = {
  id: string;
  busId: string;
  assetType: AssetType;
  reason: string;
  status: PreventiveTaskStatus;
  scheduledAt: string | null;
  createdByUserId: string | null;
  assignedToUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KbArticleStatus = "borrador" | "publicado" | "archivado";

// ─── Novedades / Avisos en vivo ─────────────────────────────────────────────
export type AnnouncementKind = "novedad" | "aviso";
export type AnnouncementSeverity = "info" | "warning" | "critical";
export type AnnouncementStatus = "borrador" | "publicado" | "archivado";

export type Announcement = {
  id: string;
  kind: AnnouncementKind;
  severity: AnnouncementSeverity;
  title: string;
  bodyMd: string;
  status: AnnouncementStatus;
  pinned: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
  /** True si el usuario actual ya lo marcó leído (presente solo en lecturas). */
  isRead?: boolean;
};

export type KbCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  order: number;
  articleCount?: number;
};

export type KbArticleSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  status: KbArticleStatus;
  tags: string[];
  views: number;
  categoryId: string | null;
  categoryName?: string | null;
  categorySlug?: string | null;
  authorName?: string | null;
  publishedAt: string | null;
  updatedAt: string;
  /** Primera imagen del contenido (miniatura en listados). */
  coverUrl?: string | null;
};

export type KbArticleDetail = KbArticleSummary & {
  contentMd: string;
  linkedTicketIds: string[];
  createdAt: string;
};
