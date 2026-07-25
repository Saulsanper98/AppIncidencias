/**
 * Smoke tests de RBAC — permisos críticos sin arrancar Next.
 *
 * Ejecutar: `npm run test:rbac`
 */

import { strict as assert } from "node:assert";

import {
  canCreateGlobalTicketTemplate,
  canCreateHandover,
  canCreateTicket,
  canDeleteAttachment,
  canDeleteDesvio,
  canEditBusDetail,
  canEditTicketRecord,
  canEditResolvedTicketRecord,
  canShowTicketEdit,
  canManageCatalog,
  canManageDashboards,
  canManageDesvios,
  canModerateBitacora,
  canReadCatalog,
  canRequestTicketDeletion,
  canReviewTicketDeletion,
  canSoftDeleteTicket,
  canUpdateTicketStatus,
  canUseScheduler,
  canViewOperationalReports,
} from "../src/lib/rbac";
import { isTicketOwnedByActor } from "../src/lib/ticket-ownership";

function roleMatrix() {
  const roles = ["conductor", "tecnico_campo", "gestor_centro_control"] as const;

  assert.equal(canReadCatalog("conductor"), true);
  assert.equal(canEditBusDetail("conductor"), true);
  assert.equal(canManageCatalog("conductor"), false);
  assert.equal(canManageCatalog("gestor_centro_control"), true);

  assert.equal(canCreateTicket("conductor"), true);
  assert.equal(canUpdateTicketStatus("conductor"), false);
  assert.equal(canUpdateTicketStatus("tecnico_campo"), true);

  assert.equal(canManageDesvios("conductor"), false);
  assert.equal(canManageDesvios("tecnico_campo"), true);
  assert.equal(canDeleteDesvio("tecnico_campo"), false);
  assert.equal(canDeleteDesvio("gestor_centro_control"), true);

  assert.equal(canManageDashboards("gestor_centro_control"), true);
  assert.equal(canManageDashboards("tecnico_campo"), false);

  assert.equal(canCreateHandover("conductor"), false);
  assert.equal(canCreateHandover("tecnico_campo"), true);

  assert.equal(canUseScheduler("gestor_centro_control"), true);
  assert.equal(canUseScheduler("tecnico_campo"), false);

  assert.equal(canCreateGlobalTicketTemplate("gestor_centro_control"), true);
  assert.equal(canCreateGlobalTicketTemplate("tecnico_campo"), true);
  assert.equal(canCreateGlobalTicketTemplate("conductor"), false);

  assert.equal(canSoftDeleteTicket("tecnico_campo"), false);
  assert.equal(canSoftDeleteTicket("gestor_centro_control"), true);
  assert.equal(canSoftDeleteTicket("conductor"), false);

  assert.equal(canDeleteAttachment("tecnico_campo"), true);
  assert.equal(canDeleteAttachment("conductor"), false);

  assert.equal(canViewOperationalReports("gestor_centro_control"), true);
  assert.equal(canViewOperationalReports("tecnico_campo"), true);
  assert.equal(canViewOperationalReports("conductor"), false);

  assert.equal(canModerateBitacora("gestor_centro_control"), true);
  assert.equal(canModerateBitacora("tecnico_campo"), false);

  assert.equal(canRequestTicketDeletion("tecnico_campo"), true);
  assert.equal(canRequestTicketDeletion("gestor_centro_control"), false);
  assert.equal(canReviewTicketDeletion("gestor_centro_control"), true);

  assert.equal(
    isTicketOwnedByActor({ assignedToUserId: "u1", createdByUserId: null }, "u1"),
    true,
  );
  assert.equal(
    isTicketOwnedByActor({ assignedToUserId: "u2", createdByUserId: "u1" }, "u1"),
    true,
  );
  assert.equal(
    isTicketOwnedByActor({ assignedToUserId: "u2", createdByUserId: null }, "u1"),
    false,
  );
  assert.equal(
    canEditTicketRecord("tecnico_campo", "u1", { assignedToUserId: "u1" }, false),
    true,
  );
  assert.equal(
    canEditTicketRecord("tecnico_campo", "u1", { assignedToUserId: "u2" }, false),
    false,
  );
  assert.equal(
    canEditTicketRecord("gestor_centro_control", "u1", { assignedToUserId: "u2" }, false),
    true,
  );
  assert.equal(
    canEditResolvedTicketRecord("tecnico_campo", "u1", { assignedToUserId: "u1" }, false),
    true,
  );
  assert.equal(
    canEditResolvedTicketRecord("tecnico_campo", "u1", { assignedToUserId: "u2" }, false),
    false,
  );
  assert.equal(
    canShowTicketEdit("tecnico_campo", "resuelto", false, false, "u1", { assignedToUserId: "u1" }),
    true,
  );
  assert.equal(
    canShowTicketEdit("tecnico_campo", "resuelto", false, false, "u1", { assignedToUserId: "u2" }),
    false,
  );

  for (const role of roles) {
    assert.equal(typeof canReadCatalog(role), "boolean");
  }
}

roleMatrix();
console.log("test-rbac: OK");
