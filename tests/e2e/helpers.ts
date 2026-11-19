import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

/** Utilidades de las pruebas E2E. Solo datos ficticios. */

export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? "",
};
export const SECRET_FILE = "test-results/e2e/.auth/totp-secret.txt";

/** Código TOTP (RFC 6238, SHA-1, 30 s) para el secreto base32 de la app autenticadora. */
export function totp(secret: string, offsetSteps = 0): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export const adminSecret = () => readFileSync(SECRET_FILE, "utf8").trim();

/**
 * Vigila la página: cualquier violación de la CSP o error de JavaScript hace fallar la prueba.
 * Llamar al inicio de cada prueba y `assertClean()` al final.
 */
export function guard(page: Page) {
  const problems: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/Content Security Policy|Refused to (execute|load|apply|connect)/i.test(text)) {
      problems.push(`CSP: ${text.slice(0, 200)}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`JS: ${error.message.slice(0, 200)}`));
  return {
    problems,
    assertClean: () => expect(problems, problems.join("\n")).toEqual([]),
  };
}

/** Inicia sesión con correo, contraseña y (si se pide) código TOTP. */
export async function signIn(page: Page, email: string, password: string, secret?: string) {
  await page.goto("/es/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Continuar" }).click();
  if (secret) {
    await page.getByLabel("Código de verificación").fill(totp(secret));
    await page.getByRole("button", { name: "Verificar e ingresar" }).click();
  }
}
