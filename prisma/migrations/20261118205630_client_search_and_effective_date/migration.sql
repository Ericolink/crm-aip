-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- DropIndex
DROP INDEX "clients_first_name_trgm_idx";

-- DropIndex
DROP INDEX "clients_last_name_trgm_idx";

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "currentEffectiveDate" DATE,
ADD COLUMN     "searchName" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "clients_search_name_trgm_idx" ON "clients" USING GIN ("searchName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "clients_currentEffectiveDate_idx" ON "clients"("currentEffectiveDate");

-- ═════════════════════════════════════════════════════════════════════════════
-- Triggers (añadidos manualmente): mantienen las columnas derivadas sin importar
-- quién escriba en la base (servicios, seed, importaciones futuras).
-- ═════════════════════════════════════════════════════════════════════════════

-- Nombre de búsqueda: minúsculas y sin acentos.
CREATE OR REPLACE FUNCTION clients_set_search_name() RETURNS trigger AS $$
BEGIN
  NEW."searchName" := lower(unaccent(coalesce(NEW."firstName", '') || ' ' || coalesce(NEW."lastName", '')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_search_name
  BEFORE INSERT OR UPDATE OF "firstName", "lastName" ON "clients"
  FOR EACH ROW EXECUTE FUNCTION clients_set_search_name();

UPDATE "clients"
  SET "searchName" = lower(unaccent(coalesce("firstName", '') || ' ' || coalesce("lastName", '')));

-- Fecha efectiva actual: la más próxima entre las coberturas actuales no eliminadas.
CREATE OR REPLACE FUNCTION refresh_client_effective_date(p_client_id TEXT) RETURNS void AS $$
  UPDATE "clients"
     SET "currentEffectiveDate" = (
       SELECT min("effectiveDate") FROM "client_insurances"
        WHERE "clientId" = p_client_id AND "isCurrent" AND "deletedAt" IS NULL
     )
   WHERE id = p_client_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION client_insurances_refresh_effective() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM refresh_client_effective_date(NEW."clientId");
  END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD."clientId" <> NEW."clientId") THEN
    PERFORM refresh_client_effective_date(OLD."clientId");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER client_insurances_effective_date
  AFTER INSERT OR UPDATE OR DELETE ON "client_insurances"
  FOR EACH ROW EXECUTE FUNCTION client_insurances_refresh_effective();

UPDATE "clients" c
   SET "currentEffectiveDate" = sub.min_date
  FROM (
    SELECT "clientId", min("effectiveDate") AS min_date
      FROM "client_insurances"
     WHERE "isCurrent" AND "deletedAt" IS NULL
     GROUP BY "clientId"
  ) sub
 WHERE c.id = sub."clientId";
