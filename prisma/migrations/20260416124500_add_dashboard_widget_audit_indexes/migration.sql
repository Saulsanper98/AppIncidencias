CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");
CREATE INDEX "DashboardWidget_dashboardId_order_idx" ON "DashboardWidget"("dashboardId", "order");
CREATE INDEX "DashboardWidget_dashboardId_updatedAt_idx" ON "DashboardWidget"("dashboardId", "updatedAt");
