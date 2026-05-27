-- CreateTable
CREATE TABLE "Desvio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referencia" TEXT NOT NULL,
    "entorno" TEXT NOT NULL DEFAULT 'PRODUCCION',
    "titulo" TEXT NOT NULL,
    "via" TEXT NOT NULL,
    "tramo" TEXT NOT NULL,
    "fecha_inicio" DATETIME NOT NULL,
    "fecha_fin" DATETIME NOT NULL,
    "hora_fin_estimada" BOOLEAN NOT NULL DEFAULT false,
    "motivo" TEXT NOT NULL,
    "sentido" TEXT NOT NULL,
    "lineas_afectadas" TEXT NOT NULL,
    "url_itinerario" TEXT,
    "paradas_fuera" TEXT NOT NULL DEFAULT '[]',
    "paradas_alternativas" TEXT NOT NULL DEFAULT '[]',
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "origen" TEXT NOT NULL DEFAULT 'EMAIL',
    "email_origen_id" TEXT,
    "pdf_path" TEXT,
    "notas" TEXT,
    "creado_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" DATETIME NOT NULL,
    "confirmado_por" TEXT,
    "confirmado_en" DATETIME
);

-- CreateIndex
CREATE INDEX "Desvio_estado_fecha_inicio_idx" ON "Desvio"("estado", "fecha_inicio");

-- CreateIndex
CREATE INDEX "Desvio_referencia_idx" ON "Desvio"("referencia");

-- CreateIndex
CREATE INDEX "Desvio_email_origen_id_idx" ON "Desvio"("email_origen_id");
