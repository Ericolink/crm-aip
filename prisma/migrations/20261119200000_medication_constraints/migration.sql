-- Catálogo de medicamentos (añadido manualmente; Prisma no expresa índices por expresión ni CHECK).
-- Un mismo nombre sin importar mayúsculas: "metformin" = "Metformin".
CREATE UNIQUE INDEX "medications_name_lower_key" ON "medications" (lower("name"));
ALTER TABLE "medications"
  ADD CONSTRAINT "medications_name_not_blank" CHECK (length(trim("name")) > 0);

-- Dosis, frecuencia y notas acotadas; "Otro" en presentación requiere descripción.
ALTER TABLE "client_medications"
  ADD CONSTRAINT "client_medications_form_other" CHECK ("form" IS DISTINCT FROM 'OTHER' OR length(trim(coalesce("formOther", ''))) > 0);
