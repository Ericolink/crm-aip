-- Notas: texto obligatorio y acotado (añadido manualmente).
ALTER TABLE "notes"
  ADD CONSTRAINT "notes_body_length" CHECK (length(trim("body")) > 0 AND length("body") <= 5000);
