const amountFormat = new Intl.NumberFormat('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatAmountTyping(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, '');
  if (!cleaned) return '';
  const commaAt = cleaned.indexOf(',');
  const whole = (commaAt === -1 ? cleaned : cleaned.slice(0, commaAt)).replace(/^0+(?=\d)/, '').slice(0, 13);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (commaAt === -1) return grouped;
  const fraction = cleaned.slice(commaAt + 1).replace(/\D/g, '').slice(0, 2);
  return `${grouped || '0'},${fraction}`;
}

export function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Math.round(Number(normalized) * 100) / 100;
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000_000) return null;
  return value;
}

export function formatAmountFixed(value: number): string {
  return amountFormat.format(value);
}
