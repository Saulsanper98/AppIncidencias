import type { AssetType } from "@/lib/domain";
import { prisma } from "@/lib/prisma";

const initialFleet = [
  {
    id: "GC-117",
    operator: "Global",
    municipio: "Las Palmas de Gran Canaria",
    lineas: ["1", "12", "26"],
    assets: [
      { id: "VAL-117-A", type: "validadora" as AssetType, serialNumber: "VLD-99112" },
      { id: "SAE-117-A", type: "sae" as AssetType, serialNumber: "SAE-45001" },
    ],
  },
  {
    id: "GUA-032",
    operator: "Guaguas Municipales",
    municipio: "Telde",
    lineas: ["11", "20"],
    assets: [{ id: "RTR-032-B", type: "router" as AssetType, serialNumber: "RTK-21089" }],
  },
  {
    id: "SBT-088",
    operator: "Salcai-Utinsa",
    municipio: "Maspalomas",
    lineas: ["30", "36", "90"],
    assets: [{ id: "PAN-088-A", type: "pantalla" as AssetType, serialNumber: "DSP-19002" }],
  },
  {
    id: "SBT-091",
    operator: "Salcai-Utinsa",
    municipio: "Arucas",
    lineas: ["103"],
    assets: [{ id: "VAL-091-A", type: "validadora" as AssetType, serialNumber: "VLD-88710" }],
  },
];

const initialWarehouses = [
  { name: "Almacen Central CCMGC", municipio: "Las Palmas de Gran Canaria", type: "almacen_central" },
  { name: "Cochera El Sebadal", municipio: "Las Palmas de Gran Canaria", type: "cochera" },
  { name: "Cochera Salinetas", municipio: "Telde", type: "cochera" },
] as const;

const initialSpareParts = [
  { code: "REP-VAL-01", name: "Validadora Conduent V3", compatibleAssetType: "validadora", minimumLevel: 3 },
  { code: "REP-SAE-01", name: "Modulo SAE embarcado", compatibleAssetType: "sae", minimumLevel: 2 },
  { code: "REP-RTR-01", name: "Router Teltonika RUTX11", compatibleAssetType: "router", minimumLevel: 4 },
  { code: "REP-PAN-01", name: "Pantalla TFT 10 pulgadas", compatibleAssetType: "pantalla", minimumLevel: 2 },
] as const;

const initialUsers = [
  { name: "Juan Morales", email: "conductor@ccmgc.local", role: "conductor" as const },
  { name: "Lucia Herrera", email: "tecnico@ccmgc.local", role: "tecnico_campo" as const },
  { name: "Alejandro Vega", email: "gestor@ccmgc.local", role: "gestor_centro_control" as const },
] as const;

export async function ensureCatalogSeeded() {
  const busCount = await prisma.bus.count();
  if (busCount === 0) {
    for (const bus of initialFleet) {
      await prisma.bus.create({
        data: {
          id: bus.id,
          operator: bus.operator,
          municipio: bus.municipio,
          lineas: bus.lineas.join(","),
          assets: {
            create: bus.assets.map((asset) => ({
              id: asset.id,
              type: asset.type,
              serialNumber: asset.serialNumber,
            })),
          },
        },
      });
    }
  }

  const warehouseCount = await prisma.warehouse.count();
  if (warehouseCount === 0) {
    for (const warehouse of initialWarehouses) {
      await prisma.warehouse.create({ data: warehouse });
    }
  }

  const sparePartCount = await prisma.sparePart.count();
  if (sparePartCount === 0) {
    await prisma.sparePart.createMany({
      data: initialSpareParts.map((part) => ({
        code: part.code,
        name: part.name,
        compatibleAssetType: part.compatibleAssetType,
        minimumLevel: part.minimumLevel,
      })),
    });
  }

  const stockCount = await prisma.inventoryStock.count();
  if (stockCount === 0) {
    const warehouses = await prisma.warehouse.findMany();
    const parts = await prisma.sparePart.findMany();
    const centralWarehouse = warehouses.find((item) => item.type === "almacen_central");

    if (centralWarehouse) {
      for (const part of parts) {
        await prisma.inventoryStock.create({
          data: {
            warehouseId: centralWarehouse.id,
            sparePartId: part.id,
            quantity: part.compatibleAssetType === "router" ? 2 : 6,
            reserved: 0,
          },
        });
      }
    }
  }

  const userCount = await prisma.user.count();
  if (userCount === 0) {
    await prisma.user.createMany({
      data: initialUsers.map((user) => ({
        name: user.name,
        email: user.email,
        role: user.role,
      })),
    });
  }
}
