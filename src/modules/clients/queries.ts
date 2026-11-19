import "server-only";
import { cache } from "react";
import { getClientDetail } from "./service";

/**
 * Detalle del cliente una vez por petición: el layout del perfil (cabecera) y la pestaña
 * lo comparten sin consultar dos veces.
 */
export const getClientDetailForRequest = cache(getClientDetail);
