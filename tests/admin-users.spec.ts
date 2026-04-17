import { expect, test, type APIRequestContext } from "@playwright/test";

async function hasGestorUser(request: APIRequestContext): Promise<boolean> {
  const res = await request.get("/api/users");
  if (!res.ok()) return false;
  const data = (await res.json()) as { users?: Array<{ role: string }> };
  return Boolean(data.users?.some((u) => u.role === "gestor_centro_control"));
}

async function loginAsGestorAndOpenAdminUsers(page: import("@playwright/test").Page) {
  await page.goto("/login?next=/admin/users");
  await page.locator("#login-user-select").waitFor({ state: "visible", timeout: 25_000 });
  await page.locator("#login-user-select").click();
  await page
    .getByRole("option", { name: /Gestor del centro de control|Control center manager/i })
    .first()
    .click();
  await page.getByRole("button", { name: /Iniciar sesión|Sign in/i }).click();
  await page.waitForURL(/\/admin\/users/, { timeout: 25_000 });
}

test.describe("Administración — usuarios", () => {
  /** Evita varias sesiones dev simultáneas que a veces rompen el servidor Next en `/login`. */
  test.describe.configure({ mode: "serial", timeout: 60_000 });

  test.beforeEach(async ({ page, request }, testInfo) => {
    const ok = await hasGestorUser(request);
    if (!ok) {
      testInfo.skip(true, "Hace falta un usuario activo con rol gestor_centro_control en la base de datos.");
    }
    await loginAsGestorAndOpenAdminUsers(page);
  });

  test("carga la pantalla y la tabla con checkboxes", async ({ page }) => {
    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.locator("h1").filter({ hasText: /Gestión de usuarios|User management/ })).toBeVisible({
      timeout: 20_000,
    });
    const table = page.locator("table").filter({
      has: page.getByRole("columnheader", { name: /Usuario|User/i }),
    });
    await expect(table).toBeVisible();
    const checks = table.getByRole("checkbox");
    await expect(checks.first()).toBeVisible();
    expect(await checks.count()).toBeGreaterThanOrEqual(2);
  });

  test("selección por fila y limpiar selección", async ({ page }) => {
    const tbody = page.locator("tbody");
    await tbody.getByRole("checkbox").first().click();
    await expect(page.getByText(/\d+\s+seleccionados|\d+\s+selected/i)).toBeVisible();
    await page.getByRole("button", { name: /Limpiar selección|Clear selection/i }).click();
    await expect(page.getByText(/\d+\s+seleccionados|\d+\s+selected/i)).not.toBeVisible();
  });

  test("seleccionar página desde la cabecera", async ({ page }) => {
    const table = page.locator("table").filter({
      has: page.getByRole("columnheader", { name: /Usuario|User/i }),
    });
    const selectAll = table.locator("thead").getByRole("checkbox").first();
    await selectAll.scrollIntoViewIfNeeded();
    /** El input real va con opacity 0; en thead sticky a veces Playwright no cumple actionability sin `force`. */
    await selectAll.click({ force: true });
    await expect(page.getByText(/\d+\s+seleccionados|\d+\s+selected/i)).toBeVisible();
  });
});
