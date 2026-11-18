/** Error de negocio que los servicios lanzan y las acciones traducen a mensajes seguros. */
export type ServiceErrorCode = "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID";

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    public readonly field?: string,
  ) {
    super(code);
  }
}
