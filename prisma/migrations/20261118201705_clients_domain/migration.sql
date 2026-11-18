-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('NEW', 'PENDING', 'ACTIVE', 'URGENT');

-- CreateEnum
CREATE TYPE "PreferredLanguage" AS ENUM ('ES', 'EN', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactRelationship" AS ENUM ('SON', 'DAUGHTER', 'HUSBAND', 'WIFE', 'RELATIVE', 'CAREGIVER', 'FRIEND', 'OTHER');

-- CreateEnum
CREATE TYPE "DoctorRole" AS ENUM ('PCP', 'SPECIALIST');

-- CreateEnum
CREATE TYPE "MedicationForm" AS ENUM ('TABLET', 'CAPSULE', 'LIQUID', 'INJECTION', 'INHALER', 'TOPICAL', 'PATCH', 'DROPS', 'OTHER');

-- CreateEnum
CREATE TYPE "InsuranceStatus" AS ENUM ('APPLICATION_PENDING', 'ACTIVE', 'ENDED', 'CANCELLED', 'DENIED');

-- CreateEnum
CREATE TYPE "ReminderPriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ConsentMethod" AS ENUM ('IN_PERSON', 'PHONE', 'ELECTRONIC', 'PAPER');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'XLSX');

-- CreateTable
CREATE TABLE "coverage_programs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEs" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coverage_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_carriers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carrier_programs" (
    "carrierId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carrier_programs_pkey" PRIMARY KEY ("carrierId","programId")
);

-- CreateTable
CREATE TABLE "chronic_conditions" (
    "id" TEXT NOT NULL,
    "nameEs" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chronic_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEs" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "requiresDocument" BOOLEAN NOT NULL DEFAULT false,
    "defaultValidityDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consent_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT,
    "clinic" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "npi" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medications" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "email" TEXT,
    "primaryPhone" TEXT,
    "altPhone" TEXT,
    "altContactName" TEXT,
    "altContactRelationship" "ContactRelationship",
    "altContactRelationshipOther" TEXT,
    "preferredLanguage" "PreferredLanguage" NOT NULL DEFAULT 'ES',
    "homeStreet" TEXT,
    "homeUnit" TEXT,
    "homeCity" TEXT,
    "homeState" TEXT,
    "homeZip" TEXT,
    "mailingSameAsHome" BOOLEAN NOT NULL DEFAULT true,
    "mailingStreet" TEXT,
    "mailingUnit" TEXT,
    "mailingCity" TEXT,
    "mailingState" TEXT,
    "mailingZip" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'NEW',
    "assignedAgentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_program_enrollments" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "beneficiaryNumberEnc" TEXT,
    "beneficiaryNumberIdx" TEXT,
    "beneficiaryNumberLast4" TEXT,
    "partAEffectiveDate" DATE,
    "partBEffectiveDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "client_program_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_insurances" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "planName" TEXT,
    "memberNumberEnc" TEXT,
    "memberNumberIdx" TEXT,
    "memberNumberLast4" TEXT,
    "confirmationNumberEnc" TEXT,
    "confirmationNumberIdx" TEXT,
    "confirmationNumberLast4" TEXT,
    "applicationSubmittedAt" DATE,
    "effectiveDate" DATE,
    "endDate" DATE,
    "status" "InsuranceStatus" NOT NULL DEFAULT 'APPLICATION_PENDING',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "changeReason" TEXT,
    "replacesInsuranceId" TEXT,
    "writingAgentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "client_insurances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_conditions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "conditionId" TEXT,
    "customName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "client_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_doctors" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "role" "DoctorRole" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "client_doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_medications" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "dose" TEXT,
    "frequency" TEXT,
    "form" "MedicationForm",
    "formOther" TEXT,
    "prescriberClientDoctorId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "client_medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isImportant" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "priority" "ReminderPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_consents" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "consentTypeId" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'ACTIVE',
    "method" "ConsentMethod" NOT NULL,
    "obtainedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "renewalDueAt" TIMESTAMP(3),
    "appointmentAt" TIMESTAMP(3),
    "scope" JSONB,
    "documentId" TEXT,
    "recordedById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT,
    "actorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "changes" JSONB,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "filters" JSONB,
    "columns" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "includesSensitive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coverage_programs_code_key" ON "coverage_programs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_carriers_name_key" ON "insurance_carriers"("name");

-- CreateIndex
CREATE INDEX "carrier_programs_programId_idx" ON "carrier_programs"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "chronic_conditions_nameEs_key" ON "chronic_conditions"("nameEs");

-- CreateIndex
CREATE UNIQUE INDEX "chronic_conditions_nameEn_key" ON "chronic_conditions"("nameEn");

-- CreateIndex
CREATE UNIQUE INDEX "consent_types_code_key" ON "consent_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_npi_key" ON "doctors"("npi");

-- CreateIndex
CREATE INDEX "doctors_name_trgm_idx" ON "doctors" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "medications_name_key" ON "medications"("name");

-- CreateIndex
CREATE INDEX "medications_name_trgm_idx" ON "medications" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE INDEX "clients_assignedAgentId_idx" ON "clients"("assignedAgentId");

-- CreateIndex
CREATE INDEX "clients_createdAt_idx" ON "clients"("createdAt");

-- CreateIndex
CREATE INDEX "clients_deletedAt_idx" ON "clients"("deletedAt");

-- CreateIndex
CREATE INDEX "clients_lastName_firstName_idx" ON "clients"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "clients_primaryPhone_idx" ON "clients"("primaryPhone");

-- CreateIndex
CREATE INDEX "clients_altPhone_idx" ON "clients"("altPhone");

-- CreateIndex
CREATE INDEX "clients_first_name_trgm_idx" ON "clients" USING GIN ("firstName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "clients_last_name_trgm_idx" ON "clients" USING GIN ("lastName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "clients_email_trgm_idx" ON "clients" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "client_program_enrollments_programId_idx" ON "client_program_enrollments"("programId");

-- CreateIndex
CREATE INDEX "client_program_enrollments_beneficiaryNumberIdx_idx" ON "client_program_enrollments"("beneficiaryNumberIdx");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_one_active_per_program" ON "client_program_enrollments"("clientId", "programId") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "client_insurances_replacesInsuranceId_key" ON "client_insurances"("replacesInsuranceId");

-- CreateIndex
CREATE INDEX "client_insurances_clientId_idx" ON "client_insurances"("clientId");

-- CreateIndex
CREATE INDEX "client_insurances_programId_idx" ON "client_insurances"("programId");

-- CreateIndex
CREATE INDEX "client_insurances_carrierId_idx" ON "client_insurances"("carrierId");

-- CreateIndex
CREATE INDEX "client_insurances_status_idx" ON "client_insurances"("status");

-- CreateIndex
CREATE INDEX "client_insurances_effectiveDate_idx" ON "client_insurances"("effectiveDate");

-- CreateIndex
CREATE INDEX "client_insurances_memberNumberIdx_idx" ON "client_insurances"("memberNumberIdx");

-- CreateIndex
CREATE INDEX "client_insurances_confirmationNumberIdx_idx" ON "client_insurances"("confirmationNumberIdx");

-- CreateIndex
CREATE UNIQUE INDEX "insurances_one_current_per_program" ON "client_insurances"("clientId", "programId") WHERE ("isCurrent" AND "deletedAt" IS NULL);

-- CreateIndex
CREATE INDEX "client_conditions_conditionId_idx" ON "client_conditions"("conditionId");

-- CreateIndex
CREATE INDEX "client_conditions_clientId_idx" ON "client_conditions"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "client_conditions_unique_active" ON "client_conditions"("clientId", "conditionId") WHERE ("deletedAt" IS NULL AND "conditionId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "client_doctors_doctorId_idx" ON "client_doctors"("doctorId");

-- CreateIndex
CREATE UNIQUE INDEX "client_doctors_one_active_pcp" ON "client_doctors"("clientId") WHERE (role = 'PCP' AND "deletedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "client_doctors_unique_active" ON "client_doctors"("clientId", "doctorId") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE INDEX "client_medications_clientId_idx" ON "client_medications"("clientId");

-- CreateIndex
CREATE INDEX "client_medications_medicationId_idx" ON "client_medications"("medicationId");

-- CreateIndex
CREATE INDEX "notes_clientId_createdAt_idx" ON "notes"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "notes_authorId_idx" ON "notes"("authorId");

-- CreateIndex
CREATE INDEX "reminders_assignedToId_status_dueAt_idx" ON "reminders"("assignedToId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "reminders_clientId_idx" ON "reminders"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storageKey_key" ON "documents"("storageKey");

-- CreateIndex
CREATE INDEX "documents_clientId_idx" ON "documents"("clientId");

-- CreateIndex
CREATE INDEX "client_consents_clientId_consentTypeId_idx" ON "client_consents"("clientId", "consentTypeId");

-- CreateIndex
CREATE INDEX "client_consents_expiresAt_idx" ON "client_consents"("expiresAt");

-- CreateIndex
CREATE INDEX "activity_logs_clientId_createdAt_idx" ON "activity_logs"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_entityType_entityId_idx" ON "activity_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");

-- CreateIndex
CREATE INDEX "import_jobs_createdById_createdAt_idx" ON "import_jobs"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "export_jobs_createdById_createdAt_idx" ON "export_jobs"("createdById", "createdAt");

-- AddForeignKey
ALTER TABLE "carrier_programs" ADD CONSTRAINT "carrier_programs_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "insurance_carriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrier_programs" ADD CONSTRAINT "carrier_programs_programId_fkey" FOREIGN KEY ("programId") REFERENCES "coverage_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_program_enrollments" ADD CONSTRAINT "client_program_enrollments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_program_enrollments" ADD CONSTRAINT "client_program_enrollments_programId_fkey" FOREIGN KEY ("programId") REFERENCES "coverage_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_insurances" ADD CONSTRAINT "client_insurances_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_insurances" ADD CONSTRAINT "client_insurances_programId_fkey" FOREIGN KEY ("programId") REFERENCES "coverage_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_insurances" ADD CONSTRAINT "client_insurances_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "insurance_carriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_insurances" ADD CONSTRAINT "client_insurances_replacesInsuranceId_fkey" FOREIGN KEY ("replacesInsuranceId") REFERENCES "client_insurances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_insurances" ADD CONSTRAINT "client_insurances_writingAgentId_fkey" FOREIGN KEY ("writingAgentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_insurances" ADD CONSTRAINT "client_insurances_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_conditions" ADD CONSTRAINT "client_conditions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_conditions" ADD CONSTRAINT "client_conditions_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "chronic_conditions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_doctors" ADD CONSTRAINT "client_doctors_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_doctors" ADD CONSTRAINT "client_doctors_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_medications" ADD CONSTRAINT "client_medications_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_medications" ADD CONSTRAINT "client_medications_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_medications" ADD CONSTRAINT "client_medications_prescriberClientDoctorId_fkey" FOREIGN KEY ("prescriberClientDoctorId") REFERENCES "client_doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_consents" ADD CONSTRAINT "client_consents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_consents" ADD CONSTRAINT "client_consents_consentTypeId_fkey" FOREIGN KEY ("consentTypeId") REFERENCES "consent_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_consents" ADD CONSTRAINT "client_consents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_consents" ADD CONSTRAINT "client_consents_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═════════════════════════════════════════════════════════════════════════════
-- Reglas añadidas manualmente (Prisma no las expresa en el esquema).
-- La base de datos las hace cumplir aunque el código de la aplicación tenga un error.
-- ═════════════════════════════════════════════════════════════════════════════

-- Historial de actividad de SOLO INSERCIÓN (igual que audit_logs).
CREATE OR REPLACE FUNCTION block_append_only_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% es de solo inserción: % no está permitido', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activity_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON "activity_logs"
  FOR EACH ROW EXECUTE FUNCTION block_append_only_mutation();

CREATE TRIGGER activity_logs_no_truncate
  BEFORE TRUNCATE ON "activity_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION block_append_only_mutation();

-- Teléfonos: exactamente 10 dígitos.
ALTER TABLE "clients"
  ADD CONSTRAINT "clients_primary_phone_digits" CHECK ("primaryPhone" IS NULL OR "primaryPhone" ~ '^[0-9]{10}$'),
  ADD CONSTRAINT "clients_alt_phone_digits" CHECK ("altPhone" IS NULL OR "altPhone" ~ '^[0-9]{10}$'),
  ADD CONSTRAINT "clients_names_not_blank" CHECK (length(trim("firstName")) > 0 AND length(trim("lastName")) > 0);

-- Identificadores sensibles: las tres columnas (cifrado, índice ciego, últimos 4) van juntas
-- o ninguna. Impide guardar un valor cifrado sin índice o "últimos 4" sin valor.
ALTER TABLE "client_program_enrollments"
  ADD CONSTRAINT "enrollments_beneficiary_number_complete" CHECK (
    ("beneficiaryNumberEnc" IS NULL AND "beneficiaryNumberIdx" IS NULL AND "beneficiaryNumberLast4" IS NULL)
    OR ("beneficiaryNumberEnc" IS NOT NULL AND "beneficiaryNumberIdx" IS NOT NULL AND length("beneficiaryNumberLast4") BETWEEN 1 AND 4)
  );

ALTER TABLE "client_insurances"
  ADD CONSTRAINT "insurances_member_number_complete" CHECK (
    ("memberNumberEnc" IS NULL AND "memberNumberIdx" IS NULL AND "memberNumberLast4" IS NULL)
    OR ("memberNumberEnc" IS NOT NULL AND "memberNumberIdx" IS NOT NULL AND length("memberNumberLast4") BETWEEN 1 AND 4)
  ),
  ADD CONSTRAINT "insurances_confirmation_number_complete" CHECK (
    ("confirmationNumberEnc" IS NULL AND "confirmationNumberIdx" IS NULL AND "confirmationNumberLast4" IS NULL)
    OR ("confirmationNumberEnc" IS NOT NULL AND "confirmationNumberIdx" IS NOT NULL AND length("confirmationNumberLast4") BETWEEN 1 AND 4)
  ),
  ADD CONSTRAINT "insurances_dates_order" CHECK ("endDate" IS NULL OR "effectiveDate" IS NULL OR "endDate" >= "effectiveDate"),
  ADD CONSTRAINT "insurances_not_self_replacing" CHECK ("replacesInsuranceId" IS NULL OR "replacesInsuranceId" <> id);

-- Condición crónica: del catálogo o con nombre propio, nunca vacía.
ALTER TABLE "client_conditions"
  ADD CONSTRAINT "client_conditions_has_name" CHECK ("conditionId" IS NOT NULL OR length(trim(coalesce("customName", ''))) > 0);

-- Recordatorios y documentos.
ALTER TABLE "reminders"
  ADD CONSTRAINT "reminders_description_not_blank" CHECK (length(trim("description")) > 0);
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_size_positive" CHECK ("sizeBytes" > 0);
