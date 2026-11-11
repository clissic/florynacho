export function readEntryToken(value: string): string | null {
  const text = value.trim();
  try {
    const match = new URL(text).pathname.match(/\/validar\/([a-f0-9]{32})$/i);
    if (match) return match[1];
  } catch {
    // El lector también puede entregar el token pelado.
  }
  const marked = text.match(/^(?:entrada:|entrada\/)([a-f0-9]{32})$/i);
  if (marked) return marked[1];
  return /^[a-f0-9]{32}$/i.test(text) ? text : null;
}
