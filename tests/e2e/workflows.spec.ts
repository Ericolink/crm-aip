import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { guard, signIn } from "./helpers";

const tag = Date.now().toString(36);

test("crear un cliente y encontrarlo en la lista", async ({ page }) => {
  const watch = guard(page);
  await page.goto("/es/clients/new");
  await page.getByRole("textbox", { name: /^Nombre\s*\*$/ }).fill("Marta");
  await page.getByRole("textbox", { name: /^Apellido\s*\*$/ }).fill(`Ficticia${tag}`);
  await page.getByLabel("Teléfono principal").fill("3055550142");
  await page.getByRole("button", { name: "Guardar cliente" }).click();
  await expect(page).toHaveURL(/\/es\/clients\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: new RegExp(`Ficticia${tag}`) })).toBeVisible();

  await page.goto(`/es/clients?q=Ficticia${tag}`);
  await expect(
    page.getByRole("link", { name: new RegExp(`Ficticia${tag}`) }).first(),
  ).toBeVisible();
  watch.assertClean();
});

test("importar: plantilla, revisar sin guardar, importar", async ({ page }) => {
  const watch = guard(page);
  await page.goto("/es/import-export");

  const templateDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar plantilla (.csv)" }).click();
  expect((await templateDownload).suggestedFilename()).toMatch(/\.csv$/);

  const csv = `Nombre,Apellido,Teléfono principal\nImportada,E2E${tag},3055550199\n,SinNombre${tag},\n`;
  await page.getByLabel("Archivo (.csv o .xlsx)").setInputFiles({
    name: "clientes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Revisar archivo" }).click();
  await expect(page.getByText("Todavía no se ha guardado nada.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Nombre", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Importar 1 cliente" }).click();
  await expect(page.getByText(/Se importaron 1 cliente/)).toBeVisible();
  watch.assertClean();
});

test("exportar la lista filtrada a CSV (identificadores ocultos)", async ({ page }) => {
  const watch = guard(page);
  await page.goto(`/es/clients?q=E2E${tag}`);
  await page.getByRole("button", { name: "Exportar" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("CSV (.csv)").click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Descargar" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^clientes-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = readFileSync((await file.path())!, "utf8");
  expect(text).toContain(`E2E${tag}`);
  watch.assertClean();
});

test("administración: alta, cambio obligatorio de contraseña, desactivar y auditoría", async ({
  page,
  browser,
}) => {
  const watch = guard(page);
  const email = `nuevo-${tag}@ejemplo.local`;
  const temp = "temporal-e2e-12345";

  await page.goto("/es/settings/users");
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre completo").fill("Agente Nuevo Prueba");
  await dialog.getByLabel("Correo (usuario de acceso)").fill(email);
  await dialog.getByLabel("Contraseña inicial").fill(temp);
  await dialog.getByLabel("Confirma la contraseña").fill(temp);
  await dialog.getByRole("button", { name: "Crear usuario" }).click();
  await expect(page.getByRole("cell", { name: /Agente Nuevo Prueba/ })).toBeVisible();

  // El nuevo usuario entra en otro navegador y debe crear su propia contraseña.
  const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const userPage = await other.newPage();
  const userWatch = guard(userPage);
  await signIn(userPage, email, temp);
  await expect(userPage).toHaveURL(/\/es\/change-password/);
  await userPage.goto("/es/dashboard");
  await expect(userPage).toHaveURL(/\/es\/change-password/);
  await userPage.getByLabel("Contraseña temporal").fill(temp);
  await userPage.getByLabel("Nueva contraseña", { exact: true }).fill("mi-frase-propia-e2e-9");
  await userPage.getByLabel("Confirma la nueva contraseña").fill("mi-frase-propia-e2e-9");
  await userPage.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(userPage).toHaveURL(/\/es\/setup-2fa/);
  userWatch.assertClean();

  // El administrador desactiva la cuenta: el usuario pierde el acceso al instante.
  await page.reload();
  await page
    .getByRole("row", { name: /Agente Nuevo Prueba/ })
    .getByRole("button", { name: "Gestionar" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Desactivar cuenta" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Desactivar", exact: true }).click();
  await expect(page.getByText("Cuenta desactivada.")).toBeVisible();
  await userPage.goto("/es/setup-2fa");
  await expect(userPage).toHaveURL(/\/es\/login/);
  await other.close();

  await page.goto("/es/settings/audit?action=USER_DEACTIVATED");
  await expect(page.getByRole("cell", { name: "Usuario desactivado" }).first()).toBeVisible();
  watch.assertClean();
});

test("catálogos: agregar y desactivar una condición crónica", async ({ page }) => {
  const watch = guard(page);
  await page.goto("/es/settings/conditions");
  await page.getByRole("button", { name: "Agregar condición" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre en español").fill(`Condición ${tag}`);
  await dialog.getByLabel("Nombre en inglés").fill(`Condition ${tag}`);
  await dialog.getByRole("button", { name: "Guardar" }).click();
  const row = page.getByRole("row", { name: new RegExp(`Condición ${tag}`) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Desactivar" }).click();
  await expect(row.getByText("Inactiva")).toBeVisible();
  watch.assertClean();
});
