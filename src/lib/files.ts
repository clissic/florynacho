const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|ogg|wav|webm)$/i;
const AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
]);

export function assertAudioFile(file: File) {
  if (file.size === 0) throw new Error('El archivo de audio está vacío.');
  if (file.size > 12 * 1024 * 1024) throw new Error('El audio supera los 12 MB.');
  if (!AUDIO_EXTENSIONS.test(file.name) || (file.type !== '' && !AUDIO_TYPES.has(file.type))) {
    throw new Error('Formato de audio no permitido. Usá MP3, M4A, AAC, OGG o WAV.');
  }
}

export async function compressImage(file: File): Promise<Blob> {
  if (!IMAGE_TYPES.has(file.type)) {
    throw new Error('Formato no permitido. Usá JPG, PNG o WebP.');
  }
  if (file.size > 8 * 1024 * 1024) throw new Error('La imagen supera los 8 MB.');
  if (file.size === 0) throw new Error('La imagen está vacía.');

  const bitmap = await createImageBitmap(file);
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('No pudimos procesar la imagen.');
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) throw new Error('No pudimos procesar la imagen.');
  if (blob.size > 2 * 1024 * 1024) {
    throw new Error('La imagen sigue siendo muy pesada. Probá con una más chica.');
  }
  return blob;
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No pudimos leer el archivo.'));
    reader.readAsDataURL(blob);
  });
}
