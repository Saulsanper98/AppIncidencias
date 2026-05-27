import { prisma } from "@/lib/prisma";

// Flota inicial vacia: el catalogo real se siembra desde `scripts/seed-catalog.mjs`
// con los datos oficiales de Global (118 buses GL-XXXX).
const initialFleet: Array<never> = [];

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

// Usuarios iniciales vacios: los usuarios reales (Saul, Pedro, etc.) se crean
// con `scripts/create-admin.mjs` o desde Admin > Usuarios.
const initialUsers: Array<never> = [];

export async function ensureCatalogSeeded() {
  // Buses: ya no se auto-siembran. Cargar via `scripts/seed-catalog.mjs`.
  void initialFleet;

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

  // Usuarios: ya no se auto-siembran. Usar `scripts/create-admin.mjs` o Admin > Usuarios.
  void initialUsers;
}
