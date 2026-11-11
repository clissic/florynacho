export type CsvGuest = {
  name: string;
  givenName: string;
  familyName: string;
  slots: 1 | 2;
  notes: string;
};

function escapeCell(value: string | number | null | undefined): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}

export function downloadCsv(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function parseGuestCsv(source: string): { guests: CsvGuest[]; errors: string[] } {
  const rows = parseCsv(source.replace(/^\uFEFF/, ''));
  const guests: CsvGuest[] = [];
  const errors: string[] = [];
  if (rows.length === 0) return { guests, errors: ['El archivo está vacío.'] };

  let start = 0;
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  if (header[0] === 'nombre') start = 1;

  for (let index = start; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.every((cell) => cell.trim() === '')) continue;
    const line = index + 1;
    const givenName = row[0]?.replace(/\s+/g, ' ').trim() ?? '';
    const familyName = row[1]?.replace(/\s+/g, ' ').trim() ?? '';
    const slotsRaw = row[2]?.trim() ?? '';
    const notes = row[3]?.trim() ?? '';
    if (givenName.length < 2 || givenName.length > 40) {
      errors.push(`Fila ${line}: el nombre no es válido.`);
      continue;
    }
    if (familyName && (familyName.length < 2 || familyName.length > 40)) {
      errors.push(`Fila ${line}: el apellido no es válido.`);
      continue;
    }
    if (slotsRaw !== '1' && slotsRaw !== '2') {
      errors.push(`Fila ${line}: los cupos tienen que ser 1 o 2.`);
      continue;
    }
    if (notes.length > 500) {
      errors.push(`Fila ${line}: las observaciones son demasiado largas.`);
      continue;
    }
    guests.push({ name: `${givenName} ${familyName}`.replace(/\s+/g, ' ').trim(), givenName, familyName, slots: Number(slotsRaw) as 1 | 2, notes });
  }

  if (guests.length === 0 && errors.length === 0) {
    errors.push('No encontramos invitados para importar.');
  }
  return { guests, errors };
}

export function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}
