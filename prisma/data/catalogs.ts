/**
 * Valores iniciales de los catálogos. El seed solo CREA los que falten: si alguien los
 * edita desde Configuración, el seed no sobrescribe esos cambios.
 */

export const COVERAGE_PROGRAMS = [
  { code: "MEDICARE", nameEs: "Medicare", nameEn: "Medicare", sortOrder: 1 },
  { code: "MEDICAID", nameEs: "Medicaid", nameEn: "Medicaid", sortOrder: 2 },
  { code: "ACA", nameEs: "ACA / Obamacare", nameEn: "ACA / Obamacare", sortOrder: 3 },
] as const;

/** Aseguradoras iniciales indicadas por el cliente. Sin relaciones con programas:
 *  se configuran desde la interfaz. */
export const INSURANCE_CARRIERS = [
  "Humana",
  "UnitedHealthcare",
  "HealthSpring",
  "Devoted Health",
  "Alignment Health",
] as const;

/** Lista inicial de condiciones crónicas comunes (editable desde Configuración). */
export const CHRONIC_CONDITIONS = [
  { nameEs: "Diabetes tipo 2", nameEn: "Type 2 diabetes" },
  { nameEs: "Diabetes tipo 1", nameEn: "Type 1 diabetes" },
  { nameEs: "Hipertensión", nameEn: "Hypertension" },
  { nameEs: "Colesterol alto", nameEn: "High cholesterol" },
  { nameEs: "Enfermedad coronaria", nameEn: "Coronary artery disease" },
  { nameEs: "Insuficiencia cardíaca", nameEn: "Heart failure" },
  { nameEs: "Fibrilación auricular", nameEn: "Atrial fibrillation" },
  { nameEs: "EPOC", nameEn: "COPD" },
  { nameEs: "Asma", nameEn: "Asthma" },
  { nameEs: "Enfermedad renal crónica", nameEn: "Chronic kidney disease" },
  { nameEs: "Artritis", nameEn: "Arthritis" },
  { nameEs: "Osteoporosis", nameEn: "Osteoporosis" },
  { nameEs: "Hipotiroidismo", nameEn: "Hypothyroidism" },
  { nameEs: "Depresión", nameEn: "Depression" },
  { nameEs: "Demencia", nameEn: "Dementia" },
  { nameEs: "Cáncer", nameEn: "Cancer" },
  { nameEs: "Secuelas de derrame cerebral", nameEn: "Stroke (history)" },
].map((c, i) => ({ ...c, sortOrder: i + 1 }));

/** Tipos de consentimiento. Vigencia y documento requerido: los define el usuario
 *  (no se asumen reglas de CMS), por eso empiezan sin valores. */
export const CONSENT_TYPES = [
  { code: "SOA", nameEs: "Scope of Appointment (SOA)", nameEn: "Scope of Appointment (SOA)" },
  { code: "CONTACT_PHONE", nameEs: "Contacto por teléfono", nameEn: "Phone contact" },
  { code: "CONTACT_SMS", nameEs: "Contacto por SMS", nameEn: "SMS contact" },
  { code: "CONTACT_EMAIL", nameEs: "Contacto por correo", nameEn: "Email contact" },
  { code: "CONTACT_WHATSAPP", nameEs: "Contacto por WhatsApp", nameEn: "WhatsApp contact" },
] as const;
