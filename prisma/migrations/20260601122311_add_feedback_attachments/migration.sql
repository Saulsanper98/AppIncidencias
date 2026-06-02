-- CreateTable: Adjuntos asociados a un reporte de feedback (capturas).
-- Los ficheros se guardan en disco bajo public/uploads/feedback/{feedbackId}/.
-- onDelete: Cascade -> al borrar el feedback se eliminan sus adjuntos en BD.
CREATE TABLE "FeedbackAttachment" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "feedbackId"   TEXT NOT NULL,
    "fileName"     TEXT NOT NULL,
    "mimeType"     TEXT,
    "sizeBytes"    INTEGER,
    "diskFileName" TEXT NOT NULL,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackAttachment_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "UserFeedback" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FeedbackAttachment_feedbackId_idx" ON "FeedbackAttachment"("feedbackId");
