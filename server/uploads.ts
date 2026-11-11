import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Request } from 'express';
import multer from 'multer';
import sharp from 'sharp';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-m4a']);
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|wav|webm)$/i;

export function mediaRoot() {
  return path.resolve(process.env.MEDIA_DIR || path.join(process.cwd(), 'data', 'media'));
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

export function safeMediaPath(value: string) {
  const normalized = value.replace(/\\/g, '/');
  if (!normalized || normalized.includes('..') || normalized.startsWith('/')) return null;
  if (!/^(cover|gallery|music)\/[a-zA-Z0-9._-]+$/.test(normalized)) return null;
  return normalized;
}

export async function saveImage(file: Express.Multer.File, folder: 'cover' | 'gallery') {
  if (!IMAGE_TYPES.has(file.mimetype)) {
    throw new Error('Formato no permitido. Usá JPG, PNG o WebP.');
  }
  if (file.size > 8 * 1024 * 1024) throw new Error('La imagen supera los 8 MB.');
  const name = `${folder}/${randomUUID()}.jpg`;
  const destination = path.join(mediaRoot(), name);
  await mkdir(path.dirname(destination), { recursive: true });
  await sharp(file.buffer).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(destination);
  return name;
}

export async function saveAudio(file: Express.Multer.File) {
  const extensionOk = AUDIO_EXT.test(file.originalname);
  if ((file.mimetype && !AUDIO_TYPES.has(file.mimetype)) || !extensionOk) {
    throw new Error('Formato de audio no permitido. Usá MP3, M4A, AAC, OGG o WAV.');
  }
  if (file.size > 12 * 1024 * 1024) throw new Error('El audio supera los 12 MB.');
  const extension = path.extname(file.originalname).toLowerCase().replace('.', '') || 'mp3';
  const name = `music/${randomUUID()}.${extension}`;
  const destination = path.join(mediaRoot(), name);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, file.buffer);
  return name;
}

export async function removeMedia(relativePath: string) {
  const safe = safeMediaPath(relativePath);
  if (!safe) return;
  await unlink(path.join(mediaRoot(), safe)).catch(() => undefined);
}

export function folderFromRequest(req: Request): 'cover' | 'gallery' {
  return req.query.folder === 'cover' ? 'cover' : 'gallery';
}
