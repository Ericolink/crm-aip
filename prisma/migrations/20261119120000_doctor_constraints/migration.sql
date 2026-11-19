-- Reglas del directorio de médicos (añadidas manualmente; Prisma no expresa CHECK).
ALTER TABLE "doctors"
  ADD CONSTRAINT "doctors_name_not_blank" CHECK (length(trim("name")) > 0),
  ADD CONSTRAINT "doctors_phone_digits" CHECK ("phone" IS NULL OR "phone" ~ '^[0-9]{10}$'),
  ADD CONSTRAINT "doctors_npi_digits" CHECK ("npi" IS NULL OR "npi" ~ '^[0-9]{10}$');
