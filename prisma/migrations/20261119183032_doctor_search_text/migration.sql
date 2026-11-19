-- DropIndex
DROP INDEX "doctors_name_trgm_idx";

-- AlterTable
ALTER TABLE "doctors" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "doctors_search_text_trgm_idx" ON "doctors" USING GIN ("searchText" gin_trgm_ops);

-- Trigger (añadido manualmente): texto de búsqueda sin acentos, para cualquier escritura.
CREATE OR REPLACE FUNCTION doctors_set_search_text() RETURNS trigger AS $$
BEGIN
  NEW."searchText" := lower(unaccent(
    coalesce(NEW."name", '') || ' ' || coalesce(NEW."specialty", '') || ' ' || coalesce(NEW."clinic", '')
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER doctors_search_text
  BEFORE INSERT OR UPDATE OF "name", "specialty", "clinic" ON "doctors"
  FOR EACH ROW EXECUTE FUNCTION doctors_set_search_text();

UPDATE "doctors"
   SET "searchText" = lower(unaccent(coalesce("name", '') || ' ' || coalesce("specialty", '') || ' ' || coalesce("clinic", '')));
