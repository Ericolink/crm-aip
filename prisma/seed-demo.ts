/**
 * Datos de DEMOSTRACIÓN 100 % ficticios para desarrollo y pruebas.
 *
 * Protecciones:
 * - Solo se ejecuta contra una base local (localhost / 127.0.0.1) y nunca con NODE_ENV=production.
 * - No hace nada si ya existen clientes (para empezar de cero: npm run db:reset).
 * - Identificadores INVÁLIDOS a propósito para que jamás coincidan con datos reales:
 *     MBI empieza con "0" (un MBI real nunca empieza con 0), Medicaid "00…",
 *     números de miembro y confirmación con prefijo "DEMO", teléfonos 555-01xx
 *     (rango reservado para ficción), correos @example.com (dominio reservado).
 * - Resultado reproducible: generador pseudoaleatorio con semilla fija.
 *
 * Uso: npm run db:seed:demo
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  type ClientStatus,
  type ContactRelationship,
  type MedicationForm,
  type PreferredLanguage,
  PrismaClient,
  type ReminderPriority,
} from "../src/generated/prisma/client";
import { diffChanges } from "../src/lib/activity/diff";
import {
  createFieldProtector,
  decodeKey,
  SENSITIVE_FIELDS,
} from "../src/lib/crypto/sensitive-field";

if (existsSync(".env")) process.loadEnvFile(".env");

// ── Protecciones ────────────────────────────────────────────────────────────
const databaseUrl = process.env.DATABASE_URL ?? "";
const host = (() => {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return "";
  }
})();
if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1"].includes(host)) {
  console.error("Seed de demostración bloqueado: solo se permite contra una base local.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const protector = createFieldProtector({
  encryptionKey: decodeKey(process.env.FIELD_ENCRYPTION_KEY ?? ""),
  blindIndexKey: decodeKey(process.env.BLIND_INDEX_KEY ?? ""),
});

// ── Aleatoriedad reproducible ───────────────────────────────────────────────
let state = 20261118;
function rand() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const chance = (p: number) => rand() < p;
const sample = <T>(items: readonly T[], n: number): T[] =>
  [...items].sort(() => rand() - 0.5).slice(0, Math.min(n, items.length));
const digits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join("");
const utcDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const NOW = new Date();
const daysFromNow = (days: number, hour = 10) => {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour + 5, 0, 0, 0); // ~hora del Este
  return d;
};
const firstOfMonthsAhead = (months: number) =>
  utcDate(NOW.getUTCFullYear(), NOW.getUTCMonth() + 1 + months, 1);

// ── Datos ficticios ─────────────────────────────────────────────────────────
const FIRST_ES = [
  "María",
  "José",
  "Rosa",
  "Luis",
  "Carmen",
  "Jorge",
  "Ana",
  "Héctor",
  "Gloria",
  "Manuel",
  "Teresa",
  "Raúl",
  "Elena",
  "Ramón",
  "Lucía",
  "Andrés",
  "Marta",
  "Ernesto",
  "Silvia",
  "Alberto",
];
const FIRST_EN = [
  "James",
  "Patricia",
  "Robert",
  "Linda",
  "Thomas",
  "Barbara",
  "Daniel",
  "Susan",
  "Richard",
  "Karen",
  "Charles",
  "Nancy",
];
const LAST = [
  "Herrera",
  "Gómez",
  "Delgado",
  "Fernández",
  "Vega",
  "Ortiz",
  "Salinas",
  "Castro",
  "Ramírez",
  "Morales",
  "Navarro",
  "Reyes",
  "Molina",
  "Suárez",
  "Reed",
  "Walker",
  "Long",
  "Turner",
  "Parker",
  "Brooks",
];
const STREETS = [
  "Calle Ejemplo",
  "Demo Ave",
  "Sample Blvd",
  "Prueba St",
  "Ficticia Way",
  "Placeholder Rd",
];
const CITIES = ["Miami", "Hialeah", "Doral", "Kendall", "Homestead", "Miami Gardens"];
const AREA = ["305", "786", "954"];
const RELATIONSHIPS: ContactRelationship[] = [
  "SON",
  "DAUGHTER",
  "HUSBAND",
  "WIFE",
  "RELATIVE",
  "CAREGIVER",
];
const MBI_CHARS = "ACDEFGHJKMNPQRTUVWXY0123456789";

const DOCTORS = [
  { name: "Dra. Laura Méndez (demo)", specialty: "Medicina familiar" },
  { name: "Dr. Kevin Brooks (demo)", specialty: "Cardiología" },
  { name: "Dra. Sofía Ramírez (demo)", specialty: "Endocrinología" },
  { name: "Dr. Pablo Ibarra (demo)", specialty: "Medicina interna" },
  { name: "Dr. Steven Hall (demo)", specialty: "Neumología" },
  { name: "Dra. Irene Paredes (demo)", specialty: "Nefrología" },
  { name: "Dr. Mark Ellis (demo)", specialty: "Medicina familiar" },
  { name: "Dra. Clara Ruiz (demo)", specialty: "Reumatología" },
  { name: "Dr. Omar Torres (demo)", specialty: "Medicina interna" },
  { name: "Dra. Nora Quinn (demo)", specialty: "Oftalmología" },
];

const MEDS: { name: string; dose: string; form: MedicationForm }[] = [
  { name: "Metformin", dose: "500 mg", form: "TABLET" },
  { name: "Lisinopril", dose: "10 mg", form: "TABLET" },
  { name: "Atorvastatin", dose: "20 mg", form: "TABLET" },
  { name: "Amlodipine", dose: "5 mg", form: "TABLET" },
  { name: "Levothyroxine", dose: "50 mcg", form: "TABLET" },
  { name: "Omeprazole", dose: "20 mg", form: "CAPSULE" },
  { name: "Gabapentin", dose: "300 mg", form: "CAPSULE" },
  { name: "Insulin glargine", dose: "20 unidades", form: "INJECTION" },
  { name: "Albuterol", dose: "90 mcg", form: "INHALER" },
  { name: "Furosemide", dose: "40 mg", form: "TABLET" },
  { name: "Losartan", dose: "50 mg", form: "TABLET" },
  { name: "Sertraline", dose: "50 mg", form: "TABLET" },
];
const FREQUENCIES = [
  "1 vez al día",
  "2 veces al día",
  "Por la noche",
  "Cada 8 horas",
  "Según necesidad",
];

const NOTE_TEMPLATES = [
  { body: "Se comunicó con el cliente. Revisamos sus opciones de cobertura.", important: false },
  {
    body: "Está interesado en cambiar de aseguradora; quiere que su PCP esté en la red.",
    important: true,
  },
  {
    body: "Esperando documentación (copia de tarjeta y comprobante de domicilio).",
    important: false,
  },
  { body: "Pendiente de confirmar su PCP con la aseguradora.", important: true },
  { body: "Se debe realizar una llamada de seguimiento la próxima semana.", important: false },
  {
    body: "Prefiere que lo llamen por la mañana. El familiar ayuda con los trámites.",
    important: false,
  },
];
const REMINDER_TEMPLATES = [
  "Llamada de seguimiento",
  "Confirmar PCP con la aseguradora",
  "Pedir copia de la tarjeta de Medicaid",
  "Revisar lista de medicamentos con el cliente",
  "Enviar resumen de cobertura",
];
const CHANGE_REASONS = [
  "La red de la nueva aseguradora incluye a su PCP.",
  "Mejor cobertura de medicamentos.",
  "El plan anterior dejó de ofrecerse en su condado.",
];

const STATUS_WEIGHTS: [ClientStatus, number][] = [
  ["NEW", 10],
  ["PENDING", 15],
  ["ACTIVE", 27],
  ["URGENT", 8],
];
function weightedStatus(): ClientStatus {
  let r = rand() * 60;
  for (const [s, w] of STATUS_WEIGHTS) if ((r -= w) < 0) return s;
  return "ACTIVE";
}
const ascii = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const phone = () => `${pick(AREA)}55501${digits(2)}`;
const fakeMbi = () => "0" + Array.from({ length: 10 }, () => pick([...MBI_CHARS])).join("");

const CLIENT_FIELDS = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "status",
  "preferredLanguage",
  "primaryPhone",
  "email",
  "homeCity",
] as const;

/**
 * Usuarios de demostración (agente y asistente) para ver vínculos y permisos en la interfaz.
 * NO tienen contraseña: no pueden iniciar sesión. Se crean una sola vez (idempotente).
 */
async function ensureDemoUsers() {
  const roles = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.key, r.id]));
  if (!roles.AGENT || !roles.ASSISTANT) throw new Error("Primero ejecuta npm run db:seed.");
  const demo = [
    { email: "agente.demo@example.com", name: "Agente Demo", roleId: roles.AGENT },
    { email: "asistente.demo@example.com", name: "Asistente Demo", roleId: roles.ASSISTANT },
  ];
  for (const u of demo) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { id: randomUUID(), ...u, emailVerified: true },
    });
  }
  console.log("Usuarios de demostración listos: Agente Demo y Asistente Demo (sin acceso).");
}

async function main() {
  await ensureDemoUsers();

  if ((await prisma.client.count()) > 0) {
    console.log(
      "Ya existen clientes: no se crean clientes de demostración. (Para reiniciar: npm run db:reset)",
    );
    return;
  }

  const admin = await prisma.user.findFirst({
    where: { role: { key: "ADMIN" } },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) throw new Error("Primero ejecuta npm run db:seed (no hay administrador).");

  const programs = Object.fromEntries(
    (await prisma.coverageProgram.findMany()).map((p) => [p.code, p.id]),
  );
  const carriers = await prisma.insuranceCarrier.findMany();
  const conditions = await prisma.chronicCondition.findMany();
  if (!programs.MEDICARE || carriers.length === 0)
    throw new Error("Primero ejecuta npm run db:seed (faltan catálogos).");

  const doctors = await Promise.all(
    DOCTORS.map((d) =>
      prisma.doctor.create({
        data: {
          ...d,
          clinic: "Clínica Demo",
          phone: phone(),
          address: `${int(100, 9999)} ${pick(STREETS)}, Miami, FL`,
        },
      }),
    ),
  );
  const meds = await Promise.all(
    MEDS.map((m) =>
      prisma.medication.upsert({ where: { name: m.name }, update: {}, create: { name: m.name } }),
    ),
  );

  const TOTAL = 60;
  for (let i = 0; i < TOTAL; i++) {
    const englishSpeaker = chance(0.3);
    const firstName = englishSpeaker ? pick(FIRST_EN) : pick(FIRST_ES);
    const lastName = pick(LAST) + (chance(0.3) ? ` ${pick(LAST)}` : "");
    const medicareAge = chance(0.75);
    const dob = medicareAge
      ? utcDate(int(1938, 1961), int(1, 12), int(1, 28))
      : utcDate(int(1966, 2000), int(1, 12), int(1, 28));
    const status = weightedStatus();
    const preferredLanguage: PreferredLanguage = englishSpeaker
      ? "EN"
      : chance(0.05)
        ? "OTHER"
        : "ES";
    const createdAt = daysFromNow(-int(0, 120), int(8, 17));
    const mailingDifferent = chance(0.15);
    const hasAlt = chance(0.5);

    const data = {
      firstName,
      lastName,
      dateOfBirth: dob,
      email: chance(0.7)
        ? `${ascii(firstName)}.${ascii(lastName.split(" ")[0])}${i}@example.com`
        : null,
      primaryPhone: phone(),
      altPhone: hasAlt ? phone() : null,
      altContactName: hasAlt ? `${pick(FIRST_ES)} ${lastName.split(" ")[0]}` : null,
      altContactRelationship: hasAlt ? pick(RELATIONSHIPS) : null,
      preferredLanguage,
      homeStreet: `${int(100, 9999)} ${pick(STREETS)}`,
      homeUnit: chance(0.4) ? `Apt ${int(1, 30)}${pick(["A", "B", "C"])}` : null,
      homeCity: pick(CITIES),
      homeState: "FL",
      homeZip: `33${digits(3)}`,
      mailingSameAsHome: !mailingDifferent,
      mailingStreet: mailingDifferent ? `PO Box ${digits(4)}` : null,
      mailingCity: mailingDifferent ? "Miami" : null,
      mailingState: mailingDifferent ? "FL" : null,
      mailingZip: mailingDifferent ? `33${digits(3)}` : null,
      status,
      assignedAgentId: admin.id,
      createdById: admin.id,
      createdAt,
    };

    await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({ data });
      const log = (
        entityType: string,
        entityId: string,
        changes: unknown,
        action: "CREATE" | "UPDATE" = "CREATE",
        when = createdAt,
      ) =>
        tx.activityLog.create({
          data: {
            clientId: client.id,
            actorId: admin.id,
            entityType,
            entityId,
            action,
            changes: changes ?? undefined,
            createdAt: when,
          },
        });
      await log(
        "client",
        client.id,
        diffChanges(null, data, { fields: CLIENT_FIELDS, dateOnly: ["dateOfBirth"] }),
      );

      // Programas del beneficiario
      const clientPrograms: string[] = [];
      if (medicareAge) {
        const turned65 = utcDate(dob.getUTCFullYear() + 65, dob.getUTCMonth() + 1, 1);
        const mbi = protector.protect(SENSITIVE_FIELDS.BENEFICIARY_NUMBER, fakeMbi())!;
        const e = await tx.clientProgramEnrollment.create({
          data: {
            clientId: client.id,
            programId: programs.MEDICARE,
            beneficiaryNumberEnc: mbi.enc,
            beneficiaryNumberIdx: mbi.idx,
            beneficiaryNumberLast4: mbi.last4,
            partAEffectiveDate: turned65,
            partBEffectiveDate: turned65,
            createdAt,
          },
        });
        await log("enrollment", e.id, {
          program: { from: null, to: "MEDICARE" },
          beneficiaryNumber: { changed: true },
        });
        clientPrograms.push("MEDICARE");
      }
      if ((medicareAge && chance(0.2)) || (!medicareAge && chance(0.3))) {
        const mcd = protector.protect(SENSITIVE_FIELDS.BENEFICIARY_NUMBER, "00" + digits(8))!;
        const e = await tx.clientProgramEnrollment.create({
          data: {
            clientId: client.id,
            programId: programs.MEDICAID,
            beneficiaryNumberEnc: mcd.enc,
            beneficiaryNumberIdx: mcd.idx,
            beneficiaryNumberLast4: mcd.last4,
            createdAt,
          },
        });
        await log("enrollment", e.id, {
          program: { from: null, to: "MEDICAID" },
          beneficiaryNumber: { changed: true },
        });
        clientPrograms.push("MEDICAID");
      }
      if (!medicareAge && !clientPrograms.includes("MEDICAID")) {
        const e = await tx.clientProgramEnrollment.create({
          data: { clientId: client.id, programId: programs.ACA, createdAt },
        });
        await log("enrollment", e.id, { program: { from: null, to: "ACA" } });
        clientPrograms.push("ACA");
      }

      // Cobertura (con historial en algunos clientes activos)
      if (status !== "NEW") {
        const programCode = clientPrograms[0];
        const carrier = pick(carriers);
        const member = protector.protect(SENSITIVE_FIELDS.MEMBER_NUMBER, `DEMO${digits(7)}`)!;
        const confirmation = protector.protect(
          SENSITIVE_FIELDS.CONFIRMATION_NUMBER,
          `DEMOC${digits(6)}`,
        )!;
        const active = status === "ACTIVE";
        const effectiveDate = active
          ? utcDate(pick([2025, 2026]), 1, 1)
          : firstOfMonthsAhead(int(0, 2));
        let replacesInsuranceId: string | undefined;

        if (active && chance(0.3)) {
          const previousCarrier = pick(carriers.filter((c) => c.id !== carrier.id));
          const prevMember = protector.protect(SENSITIVE_FIELDS.MEMBER_NUMBER, `DEMO${digits(7)}`)!;
          const prevEnd = new Date(effectiveDate.getTime() - 86_400_000);
          const prev = await tx.clientInsurance.create({
            data: {
              clientId: client.id,
              programId: programs[programCode],
              carrierId: previousCarrier.id,
              memberNumberEnc: prevMember.enc,
              memberNumberIdx: prevMember.idx,
              memberNumberLast4: prevMember.last4,
              effectiveDate: utcDate(effectiveDate.getUTCFullYear() - 2, 1, 1),
              endDate: prevEnd,
              status: "ENDED",
              isCurrent: false,
              writingAgentId: admin.id,
              createdById: admin.id,
              createdAt,
            },
          });
          await log("insurance", prev.id, {
            carrier: { from: null, to: previousCarrier.name },
            status: { from: null, to: "ACTIVE" },
          });
          await log(
            "insurance",
            prev.id,
            {
              status: { from: "ACTIVE", to: "ENDED" },
              endDate: { from: null, to: prevEnd.toISOString().slice(0, 10) },
            },
            "UPDATE",
          );
          replacesInsuranceId = prev.id;
        }

        const ins = await tx.clientInsurance.create({
          data: {
            clientId: client.id,
            programId: programs[programCode],
            carrierId: carrier.id,
            memberNumberEnc: active ? member.enc : null,
            memberNumberIdx: active ? member.idx : null,
            memberNumberLast4: active ? member.last4 : null,
            confirmationNumberEnc: confirmation.enc,
            confirmationNumberIdx: confirmation.idx,
            confirmationNumberLast4: confirmation.last4,
            applicationSubmittedAt: active
              ? new Date(effectiveDate.getTime() - 40 * 86_400_000)
              : daysFromNow(-int(2, 20)),
            effectiveDate,
            status: active ? "ACTIVE" : "APPLICATION_PENDING",
            isCurrent: true,
            changeReason: replacesInsuranceId ? pick(CHANGE_REASONS) : null,
            replacesInsuranceId,
            writingAgentId: admin.id,
            createdById: admin.id,
            createdAt,
          },
        });
        await log("insurance", ins.id, {
          carrier: { from: null, to: carrier.name },
          status: { from: null, to: ins.status },
          effectiveDate: { from: null, to: effectiveDate.toISOString().slice(0, 10) },
          ...(active ? { memberNumber: { changed: true } } : {}),
          confirmationNumber: { changed: true },
        });
      }

      // Condiciones, médicos y medicamentos
      const clientConditions = medicareAge
        ? sample(conditions, int(0, 3))
        : sample(conditions, int(0, 1));
      for (const c of clientConditions) {
        const cc = await tx.clientCondition.create({
          data: { clientId: client.id, conditionId: c.id, createdAt },
        });
        await log("condition", cc.id, { condition: { from: null, to: c.nameEn } });
      }
      const clientDoctors: { id: string; doctorId: string; role: string }[] = [];
      if (chance(0.7)) {
        const pcp = pick(
          doctors.filter(
            (d) => d.specialty === "Medicina familiar" || d.specialty === "Medicina interna",
          ),
        );
        clientDoctors.push(
          await tx.clientDoctor.create({
            data: { clientId: client.id, doctorId: pcp.id, role: "PCP", createdAt },
          }),
        );
      }
      for (const d of sample(
        doctors.filter(
          (d) =>
            !clientDoctors.some((cd) => cd.doctorId === d.id) &&
            d.specialty !== "Medicina familiar",
        ),
        int(0, 2),
      )) {
        clientDoctors.push(
          await tx.clientDoctor.create({
            data: { clientId: client.id, doctorId: d.id, role: "SPECIALIST", createdAt },
          }),
        );
      }
      for (const cd of clientDoctors)
        await log("doctor", cd.id, { role: { from: null, to: cd.role } });
      if (clientConditions.length > 0) {
        for (const m of sample(MEDS, int(1, 4))) {
          const med = meds.find((x) => x.name === m.name)!;
          const cm = await tx.clientMedication.create({
            data: {
              clientId: client.id,
              medicationId: med.id,
              dose: m.dose,
              frequency: pick(FREQUENCIES),
              form: m.form,
              prescriberClientDoctorId: clientDoctors.length ? pick(clientDoctors).id : null,
              createdAt,
            },
          });
          await log("medication", cm.id, { medication: { from: null, to: m.name } });
        }
      }

      // Notas y recordatorios
      for (const n of sample(NOTE_TEMPLATES, int(0, 4))) {
        const when = new Date(createdAt.getTime() + int(1, 20) * 86_400_000);
        await tx.note.create({
          data: {
            clientId: client.id,
            authorId: admin.id,
            body: n.body,
            isImportant: n.important,
            createdAt: when > NOW ? NOW : when,
          },
        });
      }
      if (status !== "ACTIVE" || chance(0.3)) {
        const overdue = status === "URGENT" || chance(0.2);
        const priority: ReminderPriority =
          status === "URGENT" ? "URGENT" : chance(0.3) ? "HIGH" : "NORMAL";
        await tx.reminder.create({
          data: {
            clientId: client.id,
            assignedToId: admin.id,
            createdById: admin.id,
            description: pick(REMINDER_TEMPLATES),
            dueAt: overdue
              ? daysFromNow(-int(1, 4), int(9, 16))
              : daysFromNow(int(0, 10), int(9, 16)),
            priority,
            createdAt,
          },
        });
      }
    });
  }

  const counts = {
    clientes: await prisma.client.count(),
    coberturas: await prisma.clientInsurance.count(),
    medicamentos: await prisma.clientMedication.count(),
    notas: await prisma.note.count(),
    recordatorios: await prisma.reminder.count(),
    historial: await prisma.activityLog.count(),
  };
  console.log("Datos de demostración (ficticios) creados:", counts);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Error en el seed de demostración");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
