/**
 * Content-Security-Policy estricta (ADR 0018).
 *
 * - Scripts: solo los del propio sistema que llevan el nonce de ESTA petición
 *   ('strict-dynamic' permite los que esos scripts cargan). Un script inyectado no se ejecuta.
 * - Estilos: 'self' + 'unsafe-inline'. Necesario para la librería de avisos (inserta <style>
 *   sin nonce) y atributos style de React. Un estilo inyectado no puede ejecutar código.
 * - Conexiones, imágenes, fuentes y formularios: solo el propio origen. Sin iframes,
 *   sin <object>, sin <base> ajeno, y nadie puede incrustar el CRM (frame-ancestors).
 *
 * Sin dependencias de servidor: lo usa el proxy y las pruebas.
 */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp(nonce: string, options: { dev?: boolean } = {}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // En desarrollo React usa eval para reconstruir errores del servidor; nunca en producción.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(options.dev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    // En desarrollo, la recarga en caliente usa WebSocket con el mismo host.
    "connect-src": ["'self'", ...(options.dev ? ["ws:"] : [])],
    "object-src": ["'none'"],
    "frame-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };
  const policy = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!options.dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}
