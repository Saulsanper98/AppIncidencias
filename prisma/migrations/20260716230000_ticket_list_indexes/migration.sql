-- CreateIndex
CREATE INDEX IF NOT EXISTS "Ticket_busId_idx" ON "Ticket"("busId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Ticket_assignedToUserId_idx" ON "Ticket"("assignedToUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Ticket_createdAt_idx" ON "Ticket"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Ticket_slaDeadline_idx" ON "Ticket"("slaDeadline");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Ticket_assetId_idx" ON "Ticket"("assetId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Asset_busId_idx" ON "Asset"("busId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TicketComment_ticketId_idx" ON "TicketComment"("ticketId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TicketAttachment_ticketId_idx" ON "TicketAttachment"("ticketId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PreventiveTask_busId_idx" ON "PreventiveTask"("busId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PreventiveTask_status_idx" ON "PreventiveTask"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PreventiveTask_scheduledAt_idx" ON "PreventiveTask"("scheduledAt");
