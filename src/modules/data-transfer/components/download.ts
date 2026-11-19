/** Guarda en el equipo un archivo recibido en base64 desde una Server Action. */
export function saveDownload(file: { fileName: string; mimeType: string; base64: string }) {
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file.fileName;
  document.body.append(a);
  a.click();
  a.remove();
  // Se libera enseguida: el archivo no queda en memoria del navegador.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
