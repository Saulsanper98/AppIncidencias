-- AlterTable
ALTER TABLE "TicketAttachment" ADD COLUMN "diskFileName" TEXT;
ALTER TABLE "TicketAttachment" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "TicketAttachment" ADD COLUMN "sizeBytes" INTEGER;
