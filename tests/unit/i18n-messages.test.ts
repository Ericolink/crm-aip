import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { routing } from "@/i18n/routing";

type Messages = { [key: string]: string | Messages };

/** Devuelve todas las claves de un catálogo como rutas "Seccion.sub.clave". */
function flattenKeys(obj: Messages, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : flattenKeys(value, path);
  });
}

/** Extrae los nombres de variables ICU ({name}, {date, date, long}) de un texto. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\s*(\w+)/g)].map((m) => m[1]).sort();
}

function valueAt(obj: Messages, path: string): string {
  return path.split(".").reduce<Messages | string>((acc, k) => (acc as Messages)[k], obj) as string;
}

describe("catálogos de idioma", () => {
  const esKeys = flattenKeys(es).sort();
  const enKeys = flattenKeys(en).sort();

  it("existe un catálogo por cada idioma configurado", () => {
    expect([...routing.locales].sort()).toEqual(["en", "es"]);
  });

  it("español e inglés tienen exactamente las mismas claves", () => {
    expect(esKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(enKeys.filter((k) => !esKeys.includes(k))).toEqual([]);
  });

  it("ningún texto está vacío", () => {
    for (const key of esKeys) {
      expect(valueAt(es, key).trim(), `es: ${key}`).not.toBe("");
      expect(valueAt(en, key).trim(), `en: ${key}`).not.toBe("");
    }
  });

  it("las variables de cada texto coinciden entre idiomas", () => {
    for (const key of esKeys) {
      expect(placeholders(valueAt(en, key)), key).toEqual(placeholders(valueAt(es, key)));
    }
  });
});
