import { expect, test } from "@playwright/test";
import { guard } from "./helpers";

/** Recorre todas las pantallas como administrador: cargan, sin errores de JS ni de CSP. */
const PAGES: [string, string | RegExp][] = [
  ["/es/dashboard", /Admin E2E/],
  ["/es/clients", "Clientes y prospectos"],
  ["/es/clients/new", "Nuevo cliente"],
  ["/es/reminders", "Recordatorios"],
  ["/es/import-export", "Importar / Exportar"],
  ["/es/settings/users", "Usuarios"],
  ["/es/settings/carriers", "Aseguradoras y programas"],
  ["/es/settings/conditions", "Condiciones crónicas"],
  ["/es/settings/consents", "Tipos de consentimiento"],
  ["/es/settings/audit", "Bitácora de auditoría"],
  ["/es/account", "Mi cuenta"],
  ["/en/dashboard", /Admin E2E/],
  ["/en/clients", "Clients"],
];

for (const [path, heading] of PAGES) {
  test(`carga ${path}`, async ({ page }) => {
    const watch = guard(page);
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    watch.assertClean();
  });
}

test("perfil de un cliente ficticio y sus pestañas", async ({ page }) => {
  const watch = guard(page);
  await page.goto("/es/clients");
  const first = page.locator('a[href^="/es/clients/c"]').first();
  const href = await first.getAttribute("href");
  expect(href).toMatch(/^\/es\/clients\/[a-z0-9]+$/);
  for (const tab of ["", "/insurance", "/doctors", "/medications", "/notes", "/activity"]) {
    await page.goto(`${href}${tab}`);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText("Página no encontrada")).toHaveCount(0);
  }
  watch.assertClean();
});
