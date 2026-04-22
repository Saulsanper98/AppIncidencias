import type { AssetType } from "@/lib/domain";
import { prisma } from "@/lib/prisma";

type StockSummary = {
  assetType: AssetType;
  partCode: string;
  partName: string;
  totalAvailable: number;
  totalReserved: number;
  minimumLevel: number;
  status: "ok" | "bajo" | "agotado";
  /** Tickets distintos con reserva activa o consumida de esta pieza */
  ticketCount: number;
};

export async function getInventorySummary(): Promise<StockSummary[]> {
  const parts = await prisma.sparePart.findMany({
    include: {
      stocks: true,
    },
    orderBy: {
      code: "asc",
    },
  });

  const reservations = await prisma.ticketPartReservation.findMany({
    where: { status: { in: ["reservado", "consumido"] } },
    select: { sparePartId: true, ticketId: true },
  });
  const ticketSetByPartId = new Map<string, Set<string>>();
  for (const row of reservations) {
    let set = ticketSetByPartId.get(row.sparePartId);
    if (!set) {
      set = new Set<string>();
      ticketSetByPartId.set(row.sparePartId, set);
    }
    set.add(row.ticketId);
  }

  return parts.map((part) => {
    const totalAvailable = part.stocks.reduce((acc, item) => acc + (item.quantity - item.reserved), 0);
    const totalReserved = part.stocks.reduce((acc, item) => acc + item.reserved, 0);
    const status = totalAvailable <= 0 ? "agotado" : totalAvailable <= part.minimumLevel ? "bajo" : "ok";
    const ticketCount = ticketSetByPartId.get(part.id)?.size ?? 0;

    return {
      assetType: part.compatibleAssetType,
      partCode: part.code,
      partName: part.name,
      totalAvailable,
      totalReserved,
      minimumLevel: part.minimumLevel,
      status,
      ticketCount,
    };
  });
}

export async function reservePartForAssetType(assetType: AssetType, ticketId: string) {
  const part = await prisma.sparePart.findFirst({
    where: { compatibleAssetType: assetType },
    include: {
      stocks: {
        include: {
          warehouse: true,
        },
        orderBy: [{ warehouse: { type: "asc" } }, { quantity: "desc" }],
      },
    },
  });

  if (!part) {
    return { reserved: false as const, reason: "sin_repuesto" };
  }

  const candidateStock = part.stocks.find((stock) => stock.quantity - stock.reserved > 0);
  if (!candidateStock) {
    return { reserved: false as const, reason: "sin_stock", partCode: part.code, partName: part.name };
  }

  // Cogemos el primer almacén con stock libre. El orden (cochera antes que central)
  // favorece que el técnico coja el repuesto del sitio más cercano.
  await prisma.$transaction([
    prisma.inventoryStock.update({
      where: { id: candidateStock.id },
      data: {
        reserved: { increment: 1 },
      },
    }),
    prisma.ticketPartReservation.create({
      data: {
        ticketId,
        sparePartId: part.id,
        warehouseId: candidateStock.warehouseId,
        quantity: 1,
        status: "reservado",
      },
    }),
  ]);

  return {
    reserved: true as const,
    partCode: part.code,
    partName: part.name,
    warehouseName: candidateStock.warehouse.name,
  };
}

export async function consumeReservedPartsForTicket(ticketId: string) {
  const activeReservations = await prisma.ticketPartReservation.findMany({
    where: {
      ticketId,
      status: "reservado",
    },
    select: {
      id: true,
      warehouseId: true,
      sparePartId: true,
      quantity: true,
    },
  });

  if (activeReservations.length === 0) return { consumedCount: 0 };

  await prisma.$transaction(async (tx) => {
    for (const reservation of activeReservations) {
      await tx.inventoryStock.updateMany({
        where: {
          warehouseId: reservation.warehouseId,
          sparePartId: reservation.sparePartId,
        },
        data: {
          quantity: { decrement: reservation.quantity },
          reserved: { decrement: reservation.quantity },
        },
      });

      await tx.ticketPartReservation.update({
        where: { id: reservation.id },
        data: { status: "consumido" },
      });
    }
  });

  return { consumedCount: activeReservations.length };
}
