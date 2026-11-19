import { describe, expect, it } from "vitest";
import { authErrorKey } from "@/modules/auth/auth-errors";
import { consentCodeFromName, consentTypeSchema } from "@/modules/catalogs/schema";
import { createUserSchema, updateUserSchema } from "@/modules/users/schema";

const valid = {
  name: "Ana Prueba",
  email: "  ANA@Ejemplo.Local ",
  roleKey: "AGENT",
  preferredLocale: "es",
  password: "frase-larga-de-prueba",
};

describe("alta de usuarios", () => {
  it("normaliza el correo y acepta datos válidos", () => {
    const parsed = createUserSchema.parse(valid);
    expect(parsed.email).toBe("ana@ejemplo.local");
  });

  it("rechaza contraseña corta, correo inválido, rol desconocido y nombre con símbolos", () => {
    const r = createUserSchema.safeParse({
      ...valid,
      password: "corta",
      email: "no-es-correo",
      roleKey: "SUPERADMIN",
      name: "<script>",
    });
    expect(r.success).toBe(false);
    const fields = Object.fromEntries(r.error!.issues.map((i) => [i.path[0], i.message]));
    expect(fields).toMatchObject({
      password: "tooShort",
      email: "invalidEmail",
      name: "invalidName",
    });
    expect(fields.roleKey).toBeDefined();
  });

  it("la edición no lleva contraseña", () => {
    const parsed = updateUserSchema.parse({ ...valid, password: undefined });
    expect(parsed).not.toHaveProperty("password");
  });

  it("reutilizar la contraseña se traduce a un mensaje claro", () => {
    expect(authErrorKey({ code: "PASSWORD_REUSED" })).toBe("passwordReused");
  });
});

describe("tipos de consentimiento", () => {
  it("código estable a partir del nombre en inglés", () => {
    expect(consentCodeFromName("Phone contact")).toBe("PHONE_CONTACT");
    expect(consentCodeFromName("  Médico / Pharmacy ")).toBe("MEDICO_PHARMACY");
    expect(consentCodeFromName("!!!")).toBe("CONSENT");
  });

  it("vigencia: vacía (no vence) o entero entre 1 y 3650", () => {
    const base = { nameEs: "Prueba", nameEn: "Test", requiresDocument: false };
    expect(consentTypeSchema.safeParse({ ...base, defaultValidityDays: null }).success).toBe(true);
    expect(consentTypeSchema.safeParse({ ...base, defaultValidityDays: 365 }).success).toBe(true);
    expect(consentTypeSchema.safeParse({ ...base, defaultValidityDays: 0 }).success).toBe(false);
    expect(consentTypeSchema.safeParse({ ...base, defaultValidityDays: 1.5 }).success).toBe(false);
    expect(consentTypeSchema.safeParse({ ...base, defaultValidityDays: 4000 }).success).toBe(false);
  });
});
