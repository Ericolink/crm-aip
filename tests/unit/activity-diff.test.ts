import { describe, expect, it } from "vitest";
import { diffChanges } from "@/lib/activity/diff";

const fields = ["status", "carrierId", "effectiveDate", "memberNumber", "notes"] as const;
const options = {
  fields,
  sensitive: ["memberNumber"] as const,
  dateOnly: ["effectiveDate"] as const,
};

describe("historial de cambios (diff)", () => {
  it("registra solo los campos que cambiaron, con antes y después", () => {
    const changes = diffChanges(
      { status: "PENDING", carrierId: "c1", notes: "a" },
      { status: "ACTIVE", carrierId: "c1", notes: "a" },
      options,
    );
    expect(changes).toEqual({ status: { from: "PENDING", to: "ACTIVE" } });
  });

  it("nunca guarda el valor de un campo sensible", () => {
    const changes = diffChanges(
      { memberNumber: "DEMO1111" },
      { memberNumber: "DEMO2222" },
      options,
    );
    expect(changes).toEqual({ memberNumber: { changed: true } });
    expect(JSON.stringify(changes)).not.toContain("DEMO");
  });

  it("las fechas sin hora se guardan como YYYY-MM-DD", () => {
    const changes = diffChanges(
      { effectiveDate: new Date("2026-01-01T00:00:00Z") },
      { effectiveDate: new Date("2027-01-01T00:00:00Z") },
      options,
    );
    expect(changes).toEqual({ effectiveDate: { from: "2026-01-01", to: "2027-01-01" } });
  });

  it("la misma fecha como objeto distinto no cuenta como cambio", () => {
    const changes = diffChanges(
      { effectiveDate: new Date("2026-01-01T00:00:00Z") },
      { effectiveDate: new Date("2026-01-01T00:00:00Z") },
      options,
    );
    expect(changes).toBeNull();
  });

  it("vacío, null y undefined se tratan igual", () => {
    expect(diffChanges({ notes: "" }, { notes: null }, options)).toBeNull();
  });

  it("en una actualización ignora los campos no enviados", () => {
    expect(diffChanges({ status: "NEW", notes: "x" }, { status: "NEW" }, options)).toBeNull();
  });

  it("en una creación lista todos los campos con valor", () => {
    expect(diffChanges(null, { status: "NEW", memberNumber: "DEMO1" }, options)).toEqual({
      status: { from: null, to: "NEW" },
      memberNumber: { changed: true },
    });
  });

  it("ignora campos fuera de la lista cerrada", () => {
    const after = { status: "NEW", password: "x" } as Record<string, unknown>;
    expect(diffChanges(null, after, options)).toEqual({ status: { from: null, to: "NEW" } });
  });
});
