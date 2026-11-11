export function mediaUrl(path: string | null, _kind?: 'images' | 'audio'): string | null {
  if (!path) return null;
  if (path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('http') || path.startsWith('/')) return path;
  return `/media/${path.split('/').map(encodeURIComponent).join('/')}`;
}
