import { expect, test } from "@playwright/test";

type SessionResponse = { authenticated: boolean; user?: { id: string; name: string; email: string; role: string } };

const usersPayload = {
  users: [
    { id: "u1", name: "Juan Morales", email: "juan@example.com", role: "conductor" },
    { id: "u2", name: "Sara Herrera", email: "sara@example.com", role: "gestor_centro_control" },
  ],
};

async function mockBootstrap(page: import("@playwright/test").Page, session: SessionResponse) {
  await page.route("**/api/users", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(usersPayload) });
  });
  await page.route("**/api/auth/session", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) });
      return;
    }
    await route.continue();
  });
}

test("snapshot - login sin sesion", async ({ page }) => {
  await mockBootstrap(page, { authenticated: false });
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("login-sin-sesion.png", {
    fullPage: true,
    animations: "disabled",
    maxDiffPixels: 5000,
    maxDiffPixelRatio: 0.03,
  });
});

test("snapshot - login con sesion activa", async ({ page }) => {
  await mockBootstrap(page, {
    authenticated: true,
    user: { id: "u2", name: "Sara Herrera", email: "sara@example.com", role: "gestor_centro_control" },
  });
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("login-con-sesion.png", {
    fullPage: true,
    animations: "disabled",
    maxDiffPixels: 5000,
    maxDiffPixelRatio: 0.03,
  });
});

test("snapshot - login error de red", async ({ page }) => {
  await page.route("**/api/users", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(usersPayload) });
  });
  await page.route("**/api/auth/session", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: false }),
      });
      return;
    }
    if (method === "POST") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Error de red simulado" }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Iniciar sesión|Sign in/i }).click();
  await expect(page.locator("section#login-main [role='alert']").first()).toBeVisible();
  await expect(page).toHaveScreenshot("login-error-red.png", {
    fullPage: true,
    animations: "disabled",
    maxDiffPixels: 5000,
    maxDiffPixelRatio: 0.03,
  });
});
