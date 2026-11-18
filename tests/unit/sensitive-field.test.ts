import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createFieldProtector,
  decodeKey,
  maskLast4,
  normalizeIdentifier,
  SENSITIVE_FIELDS,
  SensitiveFieldError,
} from "@/lib/crypto/sensitive-field";

const keys = () => ({ encryptionKey: randomBytes(32), blindIndexKey: randomBytes(32) });
const F = SENSITIVE_FIELDS;
// Número ficticio: un MBI real nunca empieza con 0.
const FAKE_MBI = "0EG4-TE5-MK73";

describe("normalización y máscara", () => {
  it("quita espacios, guiones y puntos, y pasa a mayúsculas", () => {
    expect(normalizeIdentifier(" 0eg4-te5 mk.73 ")).toBe("0EG4TE5MK73");
  });
  it("muestra solo los últimos 4", () => {
    expect(maskLast4("MK73")).toBe("•••• MK73");
    expect(maskLast4(null)).toBe("—");
  });
});

describe("cifrado de campos sensibles", () => {
  it("cifra y descifra (valor normalizado)", () => {
    const p = createFieldProtector(keys());
    const enc = p.encrypt(F.BENEFICIARY_NUMBER, FAKE_MBI);
    expect(p.decrypt(F.BENEFICIARY_NUMBER, enc)).toBe("0EG4TE5MK73");
  });

  it("el texto cifrado no contiene el valor y cambia en cada cifrado", () => {
    const p = createFieldProtector(keys());
    const a = p.encrypt(F.MEMBER_NUMBER, "DEMO1234567");
    const b = p.encrypt(F.MEMBER_NUMBER, "DEMO1234567");
    expect(a).not.toBe(b);
    expect(a).not.toContain("DEMO1234567");
    expect(a.startsWith("v1.")).toBe(true);
  });

  it("no se puede descifrar en otro campo (valor ligado a su columna)", () => {
    const p = createFieldProtector(keys());
    const enc = p.encrypt(F.MEMBER_NUMBER, "DEMO1234567");
    expect(() => p.decrypt(F.CONFIRMATION_NUMBER, enc)).toThrow(SensitiveFieldError);
  });

  it("detecta manipulación del texto cifrado", () => {
    const p = createFieldProtector(keys());
    const enc = p.encrypt(F.MEMBER_NUMBER, "DEMO1234567");
    const parts = enc.split(".");
    const ct = Buffer.from(parts[3], "base64url");
    ct[0] ^= 0xff;
    parts[3] = ct.toString("base64url");
    expect(() => p.decrypt(F.MEMBER_NUMBER, parts.join("."))).toThrow(SensitiveFieldError);
  });

  it("con otra llave no se puede descifrar", () => {
    const enc = createFieldProtector(keys()).encrypt(F.MEMBER_NUMBER, "DEMO1234567");
    expect(() => createFieldProtector(keys()).decrypt(F.MEMBER_NUMBER, enc)).toThrow(
      SensitiveFieldError,
    );
  });

  it("los errores nunca incluyen el valor", () => {
    const p = createFieldProtector(keys());
    try {
      p.encrypt(F.MEMBER_NUMBER, "SECRETO-<script>");
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain("SECRETO");
    }
  });

  it("rechaza valores con caracteres no permitidos o demasiado largos", () => {
    const p = createFieldProtector(keys());
    expect(() => p.encrypt(F.MEMBER_NUMBER, "ABC#123")).toThrow(SensitiveFieldError);
    expect(() => p.encrypt(F.MEMBER_NUMBER, "A".repeat(41))).toThrow(SensitiveFieldError);
  });
});

describe("índice ciego", () => {
  it("es igual para el mismo número con distinto formato (permite buscar)", () => {
    const p = createFieldProtector(keys());
    expect(p.blindIndex(F.BENEFICIARY_NUMBER, FAKE_MBI)).toBe(
      p.blindIndex(F.BENEFICIARY_NUMBER, "0eg4te5mk73"),
    );
  });

  it("es distinto para el mismo número en otro campo", () => {
    const p = createFieldProtector(keys());
    expect(p.blindIndex(F.MEMBER_NUMBER, "DEMO1")).not.toBe(
      p.blindIndex(F.CONFIRMATION_NUMBER, "DEMO1"),
    );
  });

  it("depende de la llave y no revela el valor", () => {
    const a = createFieldProtector(keys()).blindIndex(F.MEMBER_NUMBER, "DEMO1234567");
    const b = createFieldProtector(keys()).blindIndex(F.MEMBER_NUMBER, "DEMO1234567");
    expect(a).not.toBe(b);
    expect(a).not.toContain("DEMO");
  });
});

describe("protect()", () => {
  it("devuelve las tres columnas", () => {
    const p = createFieldProtector(keys());
    const result = p.protect(F.BENEFICIARY_NUMBER, FAKE_MBI)!;
    expect(result.last4).toBe("MK73");
    expect(result.idx).toBe(p.blindIndex(F.BENEFICIARY_NUMBER, FAKE_MBI));
    expect(p.decrypt(F.BENEFICIARY_NUMBER, result.enc)).toBe("0EG4TE5MK73");
  });

  it("valor vacío → null (limpia el campo)", () => {
    const p = createFieldProtector(keys());
    expect(p.protect(F.MEMBER_NUMBER, "")).toBeNull();
    expect(p.protect(F.MEMBER_NUMBER, "  - ")).toBeNull();
    expect(p.protect(F.MEMBER_NUMBER, null)).toBeNull();
  });
});

describe("llaves", () => {
  it("exige llaves de 32 bytes y distintas entre sí", () => {
    const k = randomBytes(32);
    expect(() => createFieldProtector({ encryptionKey: k, blindIndexKey: k })).toThrow();
    expect(() =>
      createFieldProtector({ encryptionKey: randomBytes(16), blindIndexKey: randomBytes(32) }),
    ).toThrow();
    expect(() => decodeKey(randomBytes(16).toString("base64"))).toThrow(SensitiveFieldError);
    expect(decodeKey(randomBytes(32).toString("base64")).length).toBe(32);
  });
});
