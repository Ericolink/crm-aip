import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";
import { ADMIN, guard, SECRET_FILE, signIn, totp } from "./helpers";

/**
 * Primer acceso del administrador por la interfaz real: contraseña → configuración
 * obligatoria de 2FA (lee la clave manual, genera el código) → códigos de respaldo → panel.
 * Guarda la sesión para el resto de las pruebas.
 */
setup("primer acceso del administrador con configuración de 2FA", async ({ page }) => {
  expect(ADMIN.email, "Ejecuta las pruebas con npm run test:e2e").not.toBe("");
  const watch = guard(page);

  await signIn(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/es\/setup-2fa/);

  await page.getByLabel("Confirma tu contraseña").fill(ADMIN.password);
  await page.getByRole("button", { name: "Comenzar" }).click();

  const secret = (await page.locator("code").first().textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]+=*$/);
  await page.getByLabel("Código de 6 dígitos").fill(totp(secret));
  await page.getByRole("button", { name: "Activar verificación" }).click();

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Ir al panel" }).click();
  await expect(page).toHaveURL(/\/es\/dashboard/);

  mkdirSync("test-results/e2e/.auth", { recursive: true });
  writeFileSync(SECRET_FILE, secret);
  await page.context().storageState({ path: "test-results/e2e/.auth/admin.json" });
  watch.assertClean();
});
