import { describe, expect, it } from "vitest";
import {
  columnForHeader,
  neutralizeFormula,
  normalizeDate,
  normalizePhone,
  rowToClientInput,
} from "@/modules/data-transfer/columns";
import { readTable, writeTable } from "@/modules/data-transfer/spreadsheet";

describe("encabezados", () => {
  it("acepta español, inglés y el nombre interno sin importar acentos ni mayúsculas", () => {
    expect(columnForHeader("Teléfono principal")).toBe("primaryPhone");
    expect(columnForHeader("TELEFONO PRINCIPAL")).toBe("primaryPhone");
    expect(columnForHeader("Primary phone")).toBe("primaryPhone");
    expect(columnForHeader("primaryPhone")).toBe("primaryPhone");
    expect(columnForHeader("Código postal (postal)")).toBe("mailingZip");
    expect(columnForHeader("Columna inventada")).toBeUndefined();
  });
});

describe("valores", () => {
  it("fechas de EE. UU. e ISO; teléfono con +1", () => {
    expect(normalizeDate("3/7/1950")).toBe("1950-03-07");
    expect(normalizeDate("1950-3-7")).toBe("1950-03-07");
    expect(normalizeDate("07.03.1950")).toBe("07.03.1950");
    expect(normalizePhone("+1 (305) 555-0101")).toBe("3055550101");
    expect(normalizePhone("(305) 555-0101")).toBe("(305) 555-0101");
  });

  it("estatus, idioma y relación por código o etiqueta en cualquier idioma", () => {
    const { input, issues } = rowToClientInput({
      firstName: "Ana",
      lastName: "Prueba",
      status: "activo",
      preferredLanguage: "English",
      altContactRelationship: "Daughter",
      dateOfBirth: new Date(Date.UTC(1950, 2, 7)),
      homeZip: 2134,
    });
    expect(issues).toEqual([]);
    expect(input).toMatchObject({
      status: "ACTIVE",
      preferredLanguage: "EN",
      altContactRelationship: "DAUGHTER",
      dateOfBirth: "1950-03-07",
      homeZip: "02134",
      mailingSameAsHome: true,
    });
  });

  it("valores desconocidos se reportan; vacíos usan el valor por defecto", () => {
    const { input, issues } = rowToClientInput({ firstName: "A", lastName: "B", status: "Quizás" });
    expect(issues).toEqual([{ column: "status", code: "invalidOption" }]);
    expect(input.status).toBe("NEW");
    expect(input.preferredLanguage).toBe("ES");
  });

  it("si hay datos postales, la dirección postal es distinta", () => {
    expect(
      rowToClientInput({ firstName: "A", lastName: "B", mailingCity: "Miami" }).input
        .mailingSameAsHome,
    ).toBe(false);
  });

  it("neutraliza fórmulas", () => {
    expect(neutralizeFormula('=HYPERLINK("x")')).toBe('\'=HYPERLINK("x")');
    expect(neutralizeFormula("+1")).toBe("'+1");
    expect(neutralizeFormula("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(neutralizeFormula("Ana")).toBe("Ana");
  });
});

describe("archivos", () => {
  const headers = ["Nombre", "Apellido", "Ciudad"];
  const rows = [
    ["José", "Núñez", "Miami"],
    ["=1+1", "Prueba, con coma", ""],
  ];

  it("CSV: ida y vuelta con acentos, comas y fórmulas neutralizadas", async () => {
    const bytes = await writeTable("CSV", headers, rows);
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    const table = await readTable("x.csv", bytes);
    expect(table.headers).toEqual(headers);
    expect(table.rows.map((r) => r.cells)).toEqual([
      ["José", "Núñez", "Miami"],
      ["'=1+1", "Prueba, con coma", ""],
    ]);
    expect(table.rows.map((r) => r.n)).toEqual([2, 3]);
  });

  it("XLSX: ida y vuelta", async () => {
    const bytes = await writeTable("XLSX", headers, rows);
    const table = await readTable("x.xlsx", bytes);
    expect(table.headers).toEqual(headers);
    expect(table.rows[0].cells.slice(0, 3)).toEqual(["José", "Núñez", "Miami"]);
    expect(table.rows[1].cells[0]).toBe("=1+1"); // en XLSX es texto, no fórmula
  });

  it("rechaza extensiones o contenido que no coinciden, vacíos y archivos grandes", async () => {
    const xlsx = await writeTable("XLSX", headers, rows);
    await expect(readTable("x.csv", xlsx)).rejects.toMatchObject({ code: "unsupported" });
    await expect(readTable("x.xlsx", Buffer.from("a,b\n1,2"))).rejects.toMatchObject({
      code: "unsupported",
    });
    await expect(readTable("x.pdf", Buffer.from("a"))).rejects.toMatchObject({
      code: "unsupported",
    });
    await expect(readTable("x.csv", Buffer.from("\n\n"))).rejects.toMatchObject({ code: "empty" });
    await expect(readTable("x.csv", Buffer.alloc(3 * 1024 * 1024, 97))).rejects.toMatchObject({
      code: "tooLarge",
    });
  });

  it("límite de filas", async () => {
    const many = Buffer.from(
      ["Nombre,Apellido", ...Array.from({ length: 2001 }, (_, i) => `A${i},B`)].join("\n"),
    );
    await expect(readTable("x.csv", many)).rejects.toMatchObject({ code: "tooManyRows" });
  });
});
