/** Formato de lectura de identificadores ya revelados. */
export function formatBeneficiaryNumber(programCode: string, value: string): string {
  // MBI: 11 caracteres, se lee en grupos 4-3-4 (como en la tarjeta de Medicare).
  if (programCode === "MEDICARE" && value.length === 11) {
    return `${value.slice(0, 4)}-${value.slice(4, 7)}-${value.slice(7)}`;
  }
  return value;
}
