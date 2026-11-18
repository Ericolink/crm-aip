import { describe, expect, it } from "vitest";
import { ageFrom, formatDateOnly, formatPhone, parseDateOnly } from "@/lib/format";
import { clientFormSchema, emptyClientForm } from "@/modules/clients/schema";

const base = () => ({ ...emptyClientForm(), firstName: "María", lastName: "Gómez" });
const issues = (input: unknown) => {
  const r = clientFormSchema.safeParse(input);
  return r.success
    ? {}
    : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
};

describe("formulario de cliente: validación", () => {
  it("acepta un cliente mínimo (nombre y apellido)", () => {
    const r = clientFormSchema.safeParse(base());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBeUndefined();
      expect(r.data.primaryPhone).toBeUndefined();
    }
  });

  it("exige nombre y apellido", () => {
    expect(issues({ ...base(), firstName: "  ", lastName: "" })).toMatchObject({
      firstName: "required",
      lastName: "required",
    });
  });

  it("normaliza teléfonos a 10 dígitos y rechaza los incompletos", () => {
    const ok = clientFormSchema.parse({ ...base(), primaryPhone: "(305) 555-0142" });
    expect(ok.primaryPhone).toBe("3055550142");
    expect(issues({ ...base(), primaryPhone: "305-555" })).toMatchObject({
      primaryPhone: "invalidPhone",
    });
  });

  it("valida correo, estado y código postal", () => {
    expect(issues({ ...base(), email: "maria@" })).toMatchObject({ email: "invalidEmail" });
    expect(clientFormSchema.parse({ ...base(), email: " Maria@Example.COM " }).email).toBe(
      "maria@example.com",
    );
    expect(issues({ ...base(), homeState: "Florida" })).toMatchObject({
      homeState: "invalidState",
    });
    expect(issues({ ...base(), homeZip: "331" })).toMatchObject({ homeZip: "invalidZip" });
    expect(clientFormSchema.parse({ ...base(), homeState: "fl" }).homeState).toBe("FL");
  });

  it("rechaza fechas de nacimiento inválidas o futuras", () => {
    expect(issues({ ...base(), dateOfBirth: "1950-02-30" })).toMatchObject({
      dateOfBirth: "invalidDate",
    });
    expect(issues({ ...base(), dateOfBirth: "2999-01-01" })).toMatchObject({
      dateOfBirth: "invalidDate",
    });
  });

  it("exige la dirección postal completa si es distinta del domicilio", () => {
    expect(issues({ ...base(), mailingSameAsHome: false })).toMatchObject({
      mailingStreet: "required",
      mailingCity: "required",
      mailingState: "required",
      mailingZip: "required",
    });
  });

  it("exige describir la relación cuando es 'Otro'", () => {
    expect(issues({ ...base(), altContactRelationship: "OTHER" })).toMatchObject({
      altContactRelationshipOther: "required",
    });
  });

  it("normaliza y valida números de Medicare y Medicaid", () => {
    const programs = {
      ...base().programs,
      MEDICARE: { enabled: true, beneficiaryNumber: "0eg4-te5-mk73" },
      MEDICAID: { enabled: true, beneficiaryNumber: "00 1234 5678" },
    };
    const r = clientFormSchema.parse({ ...base(), programs });
    expect(r.programs.MEDICARE.beneficiaryNumber).toBe("0EG4TE5MK73");
    expect(r.programs.MEDICAID.beneficiaryNumber).toBe("0012345678");
    expect(
      issues({
        ...base(),
        programs: { ...programs, MEDICARE: { enabled: true, beneficiaryNumber: "123" } },
      }),
    ).toMatchObject({ "programs.MEDICARE.beneficiaryNumber": "invalidIdentifier" });
  });

  it("número sensible vacío = no cambiar (undefined)", () => {
    const r = clientFormSchema.parse(base());
    expect(r.programs.MEDICARE.beneficiaryNumber).toBeUndefined();
  });

  it("rechaza valores fuera de las listas permitidas", () => {
    expect(clientFormSchema.safeParse({ ...base(), status: "VIP" }).success).toBe(false);
    expect(clientFormSchema.safeParse({ ...base(), preferredLanguage: "FR" }).success).toBe(false);
  });
});

describe("formato", () => {
  it("teléfono", () => {
    expect(formatPhone("3055550142")).toBe("(305) 555-0142");
    expect(formatPhone(null)).toBe("");
  });

  it("fechas sin hora no se corren de día por la zona horaria", () => {
    const jan1 = parseDateOnly("2026-01-01")!;
    expect(formatDateOnly(jan1, "en")).toBe("01/01/2026");
    expect(formatDateOnly(jan1, "es")).toMatch(/01\/01\/2026/);
  });

  it("calcula la edad cumplida", () => {
    const dob = parseDateOnly("1954-03-14")!;
    expect(ageFrom(dob, new Date("2026-03-13T12:00:00Z"))).toBe(71);
    expect(ageFrom(dob, new Date("2026-03-14T12:00:00Z"))).toBe(72);
  });
});
