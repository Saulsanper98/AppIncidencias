import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function hasGestorUser(request: APIRequestContext): Promise<boolean> {
  const res = await request.get("/api/users");
  if (!res.ok()) return false;
  const data = (await res.json()) as { users?: Array<{ role: string }> };
  return Boolean(data.users?.some((u) => u.role === "gestor_centro_control"));
}

async function loginAsGestor(page: Page, next = "/bandeja") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator("#login-user-select").waitFor({ state: "visible", timeout: 25_000 });
  await page.locator("#login-user-select").click();
  await page
    .getByRole("option", { name: /Gestor del centro de control|Control center manager/i })
    .first()
    .click();
  await page.getByRole("button", { name: /Iniciar sesión|Sign in/i }).click();
  await page.waitForURL(new RegExp(next.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), { timeout: 25_000 });
}

test.describe("Auth HTTP + bandeja", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });

  test("API tickets exige sesión", async ({ request }) => {
    const res = await request.get("/api/tickets");
    expect(res.status()).toBe(401);
  });

  test("uploads sin cookie → 401", async ({ request }) => {
    const res = await request.get("/uploads/tickets/does-not-exist/x.jpg");
    expect(res.status()).toBe(401);
  });

  test("cookie basura no abre bandeja", async ({ page, context }) => {
    await context.addCookies([
      {
        name: "ccmgc_user",
        value: "not-a-valid-token",
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    await page.goto("/bandeja");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });

  test("login gestor abre bandeja", async ({ page, request }, testInfo) => {
    if (!(await hasGestorUser(request))) {
      testInfo.skip(true, "Sin usuario gestor en BD");
    }
    await loginAsGestor(page, "/bandeja");
    await expect(page).toHaveURL(/\/bandeja/);
    // Hero o título de bandeja / tickets
    await expect(page.getByRole("main")).toBeVisible({ timeout: 20_000 });
  });

  test("deep link handover tab=unacked", async ({ page, request }, testInfo) => {
    if (!(await hasGestorUser(request))) {
      testInfo.skip(true, "Sin usuario gestor en BD");
    }
    await loginAsGestor(page, "/handover?tab=unacked");
    await expect(page).toHaveURL(/\/handover/);
    await expect(page.getByRole("main")).toBeVisible({ timeout: 20_000 });
  });
});
