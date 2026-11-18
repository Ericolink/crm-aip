import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { serverEnv } from "@/lib/env";

/**
 * Cliente único de Prisma. En desarrollo se reutiliza entre recargas (hot reload)
 * para no abrir una conexión nueva en cada cambio de archivo.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString: serverEnv().DATABASE_URL });
  // Sin log de consultas ni de errores: ambos pueden contener datos de clientes
  // (parámetros, o la fila completa en errores de PostgreSQL). Los errores se lanzan a quien
  // llama y se registran solo con describeDbErrorForLog() (src/lib/db-errors.ts).
  return new PrismaClient({ adapter, log: ["warn"] });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
