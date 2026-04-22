export type AssetType = "validadora" | "sae" | "router" | "pantalla";

export type TicketStatus = "abierto" | "en_proceso" | "esperando_repuesto" | "resuelto";

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
  createdAt: string;
  updatedAt: string;
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
