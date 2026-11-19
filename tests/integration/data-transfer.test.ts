import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import { parseClientListParams } from "@/modules/clients/list-params";
import { clientFormSchema } from "@/modules/clients/schema";
import { createClient } from "@/modules/clients/service";
import { exportClients } from "@/modules/data-transfer/export-service";
import { analyzeImport, runImport } from "@/modules/data-transfer/import-service";
import { readTable, writeTable } from "@/modules/data-transfer/spreadsheet";
import { clientInput, createTestUser } from "./helpers";

const csv = (lines: string[]) => Buffer.from(lines.join("\n"), "utf-8");
const params = (q = "") => parseClientListParams(Object.fromEntries(new URLSearchParams(q)));

let admin: CurrentUser;
let agent: CurrentUser;
const tag = `Imp${Date.now().toString(36)}`;

beforeAll(async () => {
  admin = await createTestUser("ADMIN", "Admin Importación");
  agent = await createTestUser("AGENT", "Agente Importación");
  await createClient(
    agent,
    clientFormSchema.parse(
      clientInput({ firstName: "Existente", lastName: tag, dateOfBirth: "1950-01-02" }),
    ),
  );
});

describe("importar", () => {
  const file = () =>
    csv([
      "Nombre,Apellido,Fecha de nacimiento,Estatus,Teléfono principal,Agente asignado (correo),Columna X",
      `Nueva,${tag},3/7/1951,Activo,+1 (305) 555-0101,${agent.email},algo`,
      `existente,${tag},1950-01-02,,,,`, // duplicado de un cliente existente (sin importar mayúsculas)
      `Nueva,${tag},03/07/1951,,,,`, // duplicado dentro del archivo
      `,${tag},,,,,`, // falta el nombre
      `Mala,${tag},31/31/1999,Quizás,123,nadie@ejemplo.local,`, // fecha, estatus, teléfono y agente inválidos
    ]);

  it("la vista previa valida sin guardar nada", async () => {
    const before = await prisma.client.count();
    const preview = await analyzeImport(admin, "clientes.csv", file());
    expect(await prisma.client.count()).toBe(before);
    expect(preview).toMatchObject({ totalRows: 5, validRows: 1, invalidRows: 2, duplicateRows: 2 });
    expect(preview.ignoredHeaders).toEqual(["Columna X"]);
    expect(preview.issues).toEqual(
      expect.arrayContaining([
        { row: 3, column: null, code: "duplicate" },
        { row: 4, column: null, code: "duplicateInFile" },
        { row: 5, column: "firstName", code: "required" },
        { row: 6, column: "status", code: "invalidOption" },
        { row: 6, column: "assignedAgentEmail", code: "unknownAgent" },
        { row: 6, column: "dateOfBirth", code: "invalidDate" },
        { row: 6, column: "primaryPhone", code: "invalidPhone" },
      ]),
    );
    // Los errores nunca incluyen el valor de la celda.
    expect(JSON.stringify(preview.issues)).not.toContain("Mala");
  });

  it("importa solo las filas válidas, con historial, trabajo y auditoría", async () => {
    const result = await runImport(admin, "clientes.csv", file());
    expect(result).toMatchObject({ imported: 1, failed: 0 });
    const created = await prisma.client.findFirstOrThrow({
      where: { firstName: "Nueva", lastName: tag },
    });
    expect(created).toMatchObject({
      status: "ACTIVE",
      primaryPhone: "3055550101",
      assignedAgentId: agent.id,
      createdById: admin.id,
    });
    expect(created.dateOfBirth?.toISOString().slice(0, 10)).toBe("1951-03-07");
    expect(
      await prisma.activityLog.count({ where: { entityId: created.id, action: "CREATE" } }),
    ).toBe(1);
    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: result.jobId } });
    expect(job).toMatchObject({ status: "COMPLETED", totalRows: 5, importedRows: 1 });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "DATA_IMPORTED", targetId: job.id },
    });
    expect(audit.metadata).toMatchObject({ rows: 5, imported: 1 });
    // Repetir la importación no crea duplicados.
    expect((await runImport(admin, "clientes.csv", file())).imported).toBe(0);
  });

  it("errores de archivo: columnas obligatorias, columna repetida, formato", async () => {
    await expect(
      analyzeImport(admin, "x.csv", csv(["Nombre,Ciudad", "Ana,Miami"])),
    ).rejects.toMatchObject({
      field: "file.missingColumns",
    });
    await expect(
      analyzeImport(admin, "x.csv", csv(["Nombre,First name,Apellido", "a,b,c"])),
    ).rejects.toMatchObject({
      field: "file.duplicateColumn",
    });
    await expect(analyzeImport(admin, "x.txt", csv(["Nombre,Apellido"]))).rejects.toMatchObject({
      field: "file.unsupported",
    });
  });

  it("XLSX con encabezados en inglés", async () => {
    const bytes = await writeTable(
      "XLSX",
      ["First name", "Last name", "Status"],
      [["Xlsx", tag, "Urgent"]],
    );
    const result = await runImport(admin, "clients.xlsx", bytes);
    expect(result.imported).toBe(1);
    expect(
      (await prisma.client.findFirstOrThrow({ where: { firstName: "Xlsx", lastName: tag } }))
        .status,
    ).toBe("URGENT");
  });

  it("un agente (sin permiso de importar) no puede", async () => {
    await expect(analyzeImport(agent, "x.csv", file())).rejects.toBeInstanceOf(ServiceError);
    await expect(analyzeImport(agent, "x.csv", file())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("exportar", () => {
  let medicareClientId: string;
  beforeAll(async () => {
    medicareClientId = await createClient(
      admin,
      clientFormSchema.parse(
        clientInput({
          firstName: "Medicare",
          lastName: tag,
          programs: {
            MEDICARE: {
              enabled: true,
              beneficiaryNumber: "1EG4TE5MK73",
              partAEffectiveDate: "",
              partBEffectiveDate: "",
            },
            MEDICAID: { enabled: false, beneficiaryNumber: "" },
            ACA: { enabled: false },
          },
        }),
      ),
    );
  });

  const rowsOf = async (bytes: Buffer, name = "x.csv") => {
    const t = await readTable(name, bytes);
    return t.rows.map((r) => Object.fromEntries(t.headers.map((h, i) => [h, r.cells[i]])));
  };

  it("respeta los filtros y enmascara identificadores por defecto", async () => {
    const file = await exportClients(admin, {
      format: "CSV",
      params: params(`q=${tag}`),
      includeSensitive: false,
      locale: "es",
    });
    const rows = await rowsOf(file.bytes);
    expect(rows.every((r) => r.Apellido === tag)).toBe(true);
    expect(rows.map((r) => r.Nombre).sort()).toEqual(["Existente", "Medicare", "Nueva", "Xlsx"]);
    const m = rows.find((r) => r.Nombre === "Medicare")!;
    expect(m["Nº de Medicare"]).toBe("•••• MK73");
    expect(file.bytes.toString("utf-8")).not.toContain("1EG4TE5MK73");
    const job = await prisma.exportJob.findFirstOrThrow({
      where: { createdById: admin.id },
      orderBy: { createdAt: "desc" },
    });
    expect(job).toMatchObject({ format: "CSV", rowCount: 4, includesSensitive: false });
    // El texto buscado no se guarda.
    expect(JSON.stringify(job.filters)).not.toContain(tag);
  });

  it("el administrador puede incluir identificadores completos (auditado)", async () => {
    const file = await exportClients(admin, {
      format: "XLSX",
      params: params(`q=${tag}`),
      includeSensitive: true,
      locale: "en",
    });
    const rows = await rowsOf(file.bytes, "x.xlsx");
    expect(rows.find((r) => r["First name"] === "Medicare")!["Medicare number"]).toBe(
      "1EG4TE5MK73",
    );
    expect(file.fileName).toMatch(/^clients-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "DATA_EXPORTED", actorId: admin.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.metadata).toMatchObject({ format: "XLSX", includesSensitive: true });
    expect(medicareClientId).toBeTruthy();
  });

  it("lo exportado se puede volver a importar (y se detecta como duplicado)", async () => {
    const file = await exportClients(admin, {
      format: "CSV",
      params: params(`q=${tag}`),
      includeSensitive: false,
      locale: "es",
    });
    const preview = await analyzeImport(admin, "export.csv", file.bytes);
    expect(preview.invalidRows).toBe(0);
    expect(preview.duplicateRows).toBe(preview.totalRows - preview.validRows);
  });

  it("sin permiso de exportar, o de datos sensibles, se rechaza", async () => {
    await expect(
      exportClients(agent, {
        format: "CSV",
        params: params(),
        includeSensitive: false,
        locale: "es",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const limited = {
      ...admin,
      permissions: new Set([...admin.permissions].filter((p) => p !== "data.export_sensitive")),
    } as CurrentUser;
    await expect(
      exportClients(limited, {
        format: "CSV",
        params: params(),
        includeSensitive: true,
        locale: "es",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
