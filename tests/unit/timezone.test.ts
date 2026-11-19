import { describe, expect, it } from "vitest";
import { utcToZonedLocal, zonedLocalToUtc } from "@/lib/timezone";

describe("hora de Florida ↔ UTC", () => {
  it("invierno (EST, UTC-5) y verano (EDT, UTC-4)", () => {
    expect(zonedLocalToUtc("2026-12-01T10:00")?.toISOString()).toBe("2026-12-01T15:00:00.000Z");
    expect(zonedLocalToUtc("2026-07-01T10:00")?.toISOString()).toBe("2026-07-01T14:00:00.000Z");
  });

  it("días de cambio de horario", () => {
    // 8 de marzo de 2026: a las 2:00 se adelanta a las 3:00.
    expect(zonedLocalToUtc("2026-03-08T01:30")?.toISOString()).toBe("2026-03-08T06:30:00.000Z");
    expect(zonedLocalToUtc("2026-03-08T09:00")?.toISOString()).toBe("2026-03-08T13:00:00.000Z");
    // 1 de noviembre de 2026: a las 2:00 se atrasa a la 1:00.
    expect(zonedLocalToUtc("2026-11-01T09:00")?.toISOString()).toBe("2026-11-01T14:00:00.000Z");
  });

  it("ida y vuelta", () => {
    for (const local of ["2026-01-15T08:05", "2026-06-30T23:59", "2026-11-19T00:00"]) {
      expect(utcToZonedLocal(zonedLocalToUtc(local)!)).toBe(local);
    }
  });

  it("rechaza textos inválidos", () => {
    for (const bad of [
      "",
      "2026-02-30T10:00",
      "2026-13-01T10:00",
      "2026-01-01 10:00",
      "2026-01-01T24:00",
      "x",
    ]) {
      expect(zonedLocalToUtc(bad)).toBeNull();
    }
  });
});
