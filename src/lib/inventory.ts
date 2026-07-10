/**
 * Inventario desactivado en la app (módulo retirado).
 * Stubs para no romper imports legacy en tickets.
 */

export type PartReservationResult = {
  reserved: boolean;
  partCode: string;
  partName: string;
  warehouseName?: string;
  reason?: string;
};

export async function reservePartForAssetType(
  _assetType: string,
  _ticketId: string,
): Promise<PartReservationResult | null> {
  return null;
}

export async function consumeReservedPartsForTicket(_ticketId: string): Promise<{ consumedCount: number }> {
  return { consumedCount: 0 };
}

export async function getInventorySummary() {
  return { items: [], warehouses: [] };
}
