import { expect, test } from "@playwright/test";
import { guard } from "./helpers";

test.describe("sin sesión", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("las pantallas privadas llevan al login", async ({ page }) => {
    for (const path of ["/es/dashboard", "/es/clients", "/es/settings/audit"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/es\/login/);
    }
  });

  test("encabezados de seguridad y CSP con nonce", async ({ page }) => {
    const response = await page.goto("/es/login");
    const headers = response!.headers();
    expect(headers["content-security-policy"]).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
    );
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-robots-tag"]).toContain("noindex");
    expect(headers["cache-control"]).toMatch(/no-store/);
  });
});

test("la CSP bloquea código inyectado como HTML (XSS)", async ({ page }) => {
  const watch = guard(page);
  await page.goto("/es/dashboard");
  const result = await page.evaluate(async () => {
    const violations: string[] = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      violations.push(e.effectiveDirective),
    );
    // Simula una inyección de HTML (el vector real de un XSS): manejador de evento en línea.
    document.body.insertAdjacentHTML(
      "beforeend",
      `<img src="data:," onerror="window.__inyectado = true" alt="">`,
    );
    await new Promise((r) => setTimeout(r, 300));
    return {
      ran: (window as unknown as { __inyectado?: boolean }).__inyectado === true,
      violations,
    };
  });
  expect(result.ran).toBe(false);
  expect(result.violations.some((d) => d.startsWith("script-src"))).toBe(true);
  // Este caso produce a propósito una violación: no se exige página limpia.
  expect(watch.problems.some((p) => p.startsWith("CSP"))).toBe(true);
});

test("el texto de un cliente se muestra como texto, nunca como HTML", async ({ page }) => {
  const watch = guard(page);
  const payload = `<img src=x onerror="window.__xss=1">`;
  await page.goto("/es/clients/new");
  await page.getByRole("textbox", { name: /^Nombre\s*\*$/ }).fill("Prueba");
  await page.getByRole("textbox", { name: /^Apellido\s*\*$/ }).fill(`XSS ${Date.now()}`);
  await page.getByLabel("Nombre del contacto alternativo").fill(payload);
  await page.getByRole("button", { name: "Guardar cliente" }).click();
  await expect(page).toHaveURL(/\/es\/clients\/[a-z0-9]+$/);
  // Se ve el texto literal y no se creó ninguna imagen con el manejador.
  await expect(page.getByText(payload)).toBeVisible();
  expect(await page.locator("img[src=x]").count()).toBe(0);
  expect(
    await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
  ).toBeUndefined();
  watch.assertClean();
});
