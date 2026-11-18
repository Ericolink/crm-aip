import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Carga .env con la función nativa de Node (sin dependencia extra). En CI las variables
// llegan por el entorno y el archivo puede no existir.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
