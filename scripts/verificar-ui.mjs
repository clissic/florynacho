import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:5173';
const out = join(process.cwd(), 'verificacion');
mkdirSync(out, { recursive: true });

const tokens = {
  ana: '7c1a9e4b2d8f46a0b5c3e1d79a28f604',
  martin: '3e8b0c5d7a1f49e2c6b4d8a0f15e3c97',
  lucia: '9a4f2e7c1b8d40e6a5c3f0d28b71e4a6',
  diego: '1f6c8a3e5b0d47c9e2a4f7b1c8d05e36',
  camila: '8b0e4d1a6c3f49e7b2a5d8c1f0e64a73',
  elena: '5d2a9c7e4b1f48a0c6e3d5b8a7f14c20',
};

const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK' : 'FALLO'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64',
);
const pngPath = join(tmpdir(), 'fi-foto.png');
writeFileSync(pngPath, png);

const samples = 1600;
const dataSize = samples * 2;
const wav = Buffer.alloc(44 + dataSize);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + dataSize, 4);
wav.write('WAVE', 8);
wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(dataSize, 40);
const wavPath = join(tmpdir(), 'fi-musica.wav');
writeFileSync(wavPath, wav);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

async function overflow() {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('h1').waitFor();
  check('portada con nombres en texto', (await page.locator('h1').innerText()).includes('Florencia'));
  check('sin scroll horizontal en 390', !(await overflow()));
  const button = await page.getByRole('button', { name: 'Abrir invitación' }).boundingBox();
  check('botón de portada cómodo', Boolean(button && button.height >= 48 && button.width >= 160), JSON.stringify(button));
  await page.screenshot({ path: join(out, 'portada-390.png'), fullPage: false });

  await page.setViewportSize({ width: 320, height: 700 });
  await page.waitForTimeout(200);
  check('sin scroll horizontal en 320', !(await overflow()));
  await page.screenshot({ path: join(out, 'portada-320.png'), fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByRole('button', { name: 'Abrir invitación' }).click();
  await page.locator('#contenido').waitFor();
  check('la historia es texto', (await page.locator('#contenido').innerText()).includes('border collie'));

  await page.goto(`${base}/i/${tokens.ana}`, { waitUntil: 'networkidle' });
  const anaText = await page.locator('main').innerText();
  check('invitación individual sin hablar de acompañantes', !/acompañante|cupo|autorizado a llevar|invitación es individual/i.test(anaText));
  check('pregunta individual', anaText.includes('¿Nos acompañás en nuestro gran día?'));
  await page.getByText('¡Sí, allí estaré!').click();
  await page.getByLabel('Tu alimentación').selectOption('none');
  await page.getByLabel('Alergias o intolerancias, si hay').fill('ninguna relevante');
  await page.getByLabel('Canción').fill('Yellow');
  await page.getByLabel('Artista').fill('Coldplay');
  await page.getByLabel('Comentario, si querés').fill('Para bailar');
  await page.getByLabel('Mensaje').fill('Los queremos mucho');
  const before = await page.locator('.status').innerText();
  check('no confirma antes de guardar', !before.includes('Recibimos'));
  await page.getByRole('button', { name: 'Enviar respuesta' }).click();
  await page.getByText('Recibimos tu respuesta. Gracias.').waitFor();
  check('1. Ana confirma', await page.getByRole('radio', { name: '¡Sí, allí estaré!' }).isChecked());
  await page.screenshot({ path: join(out, 'confirmacion-ana.png'), fullPage: true });

  await page.getByText('Lamentablemente no podré asistir.').click();
  check('al rechazar no pide alimentación', (await page.locator('main').innerText()).includes('Tu alimentación') === false);
  await page.getByRole('button', { name: 'Actualizar respuesta' }).click();
  await page.getByText('Actualizamos tu respuesta. Gracias.').waitFor();
  check('6. Ana modifica la respuesta', true);

  await page.goto(`${base}/i/${tokens.lucia}`, { waitUntil: 'networkidle' });
  await page.getByText('Lamentablemente no podré asistir.').click();
  await page.getByRole('button', { name: 'Enviar respuesta' }).click();
  await page.getByText('Recibimos tu respuesta. Gracias.').waitFor();
  check('2. Lucía rechaza', true);

  await page.goto(`${base}/i/${tokens.martin}`, { waitUntil: 'networkidle' });
  check('pregunta de dos cupos', (await page.locator('main').innerText()).includes('¿Cómo nos vas a acompañar?'));
  await page.getByText('¡Vamos los dos!').click();
  await page.getByLabel('Tu alimentación').selectOption('celiac');
  await page.getByLabel('Alergias o intolerancias, si hay').first().fill('nueces');
  await page.getByLabel('Nombre y apellido del acompañante').fill('Laura Sosa');
  await page.getByLabel('Alimentación del acompañante').selectOption('vegan');
  await page.getByLabel('Alergias o intolerancias, si hay').nth(1).fill('lactosa');
  await page.getByLabel('Canción').fill('Perfect');
  await page.getByLabel('Artista').fill('Ed Sheeran');
  await page.getByLabel('Mensaje').fill('Felices de acompañarlos');
  await page.getByRole('button', { name: 'Enviar respuesta' }).click();
  await page.getByText('Recibimos tu respuesta. Gracias.').waitFor();
  check('3, 7, 8 y 9. Martín confirma dos, dieta, canción y mensaje', true);

  await page.goto(`${base}/i/${tokens.diego}`, { waitUntil: 'networkidle' });
  await page.getByText('¡Voy solo/a!').click();
  check('ir solo no pide acompañante', !(await page.locator('main').innerText()).includes('Nombre y apellido del acompañante'));
  await page.getByLabel('Tu alimentación').selectOption('vegetarian');
  await page.getByRole('button', { name: 'Enviar respuesta' }).click();
  await page.getByText('Recibimos tu respuesta. Gracias.').waitFor();
  check('4. Diego va solo', true);

  await page.goto(`${base}/i/${tokens.camila}`, { waitUntil: 'networkidle' });
  await page.getByText('Lamentablemente no podremos asistir.').click();
  check('rechazo doble sin alimentación', !(await page.locator('main').innerText()).includes('Tu alimentación'));
  await page.getByRole('button', { name: 'Enviar respuesta' }).click();
  await page.getByText('Recibimos tu respuesta. Gracias.').waitFor();
  check('5. Camila rechaza', true);

  await page.goto(`${base}/i/${tokens.elena}`, { waitUntil: 'networkidle' });
  const revoked = await page.locator('main').innerText();
  await page.goto(`${base}/i/0123456789abcdef0123456789abcdef`, { waitUntil: 'networkidle' });
  const unknown = await page.locator('main').innerText();
  check('enlace revocado e inválido se ven igual', revoked.includes('Este enlace no está disponible') && unknown.includes('Este enlace no está disponible') && !revoked.includes('Elena') && !unknown.includes('Elena'));

  await page.goto(`${base}/i/${tokens.ana}`, { waitUntil: 'networkidle' });
  await page.route('**/api/invitations/**/rsvp', (route) => route.abort());
  await page.getByRole('button', { name: 'Actualizar respuesta' }).click();
  await page.getByText('No pudimos conectar. Revisá tu conexión e intentá de nuevo.').waitFor();
  check('15. error de conexión', true);
  await page.unroute('**/api/invitations/**/rsvp');

  await page.goto(`${base}/admin`, { waitUntil: 'networkidle' });
  check('14. el panel pide ingreso', page.url().includes('/admin/login') && !(await page.locator('body').innerText()).includes('Ana Pereira'));
  await page.getByLabel('Correo').fill('novios@florenciaeignacio.local');
  await page.getByLabel('Contraseña').fill('cambiar-esta-clave');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('tab', { name: 'Resumen' }).waitFor();
  const summary = await page.locator('body').innerText();
  check('resumen de asistentes', summary.includes('Asistentes') && summary.includes('3') && summary.includes('Acompañantes'));
  await page.screenshot({ path: join(out, 'admin-390.png'), fullPage: true });

  await page.getByRole('tab', { name: 'Invitados' }).click();
  const guests = await page.locator('body').innerText();
  check('dietas separadas en el panel', guests.includes('Celíaco/a — sin gluten') && guests.includes('Vegano/a') && guests.includes('Laura Sosa') && guests.includes('nueces') && guests.includes('lactosa'));
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  const download = await downloadPromise;
  const csvPath = join(out, await download.suggestedFilename());
  await download.saveAs(csvPath);
  const csv = readFileSync(csvPath, 'utf8');
  check('10. exporta confirmaciones', csv.includes('Laura Sosa') && csv.includes('Celíaco/a') && csv.includes('Martín Silva') && csv.charCodeAt(0) === 0xfeff);

  await page.getByRole('tab', { name: 'Canciones' }).click();
  const songsDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  const songsFile = await songsDownload;
  const songsPath = join(out, 'canciones.csv');
  await songsFile.saveAs(songsPath);
  check('exporta canciones', readFileSync(songsPath, 'utf8').includes('Perfect'));

  await page.getByRole('tab', { name: 'Mensajes' }).click();
  check('mensajes privados en el panel', (await page.locator('body').innerText()).includes('Felices de acompañarlos'));

  await page.getByRole('tab', { name: 'Personalizar' }).click();
  await page.getByLabel('Subir imagen').setInputFiles(pngPath);
  await page.getByText('Actualizamos la portada en el borrador.').waitFor({ timeout: 15000 });
  await page.getByLabel('Agregar fotografía').setInputFiles(pngPath);
  await page.getByText('Agregamos la fotografía al borrador.').waitFor({ timeout: 15000 });
  await page.getByLabel('Subir audio').setInputFiles(wavPath);
  await page.getByText('Actualizamos la música en el borrador.').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Publicar' }).click();
  await page.getByText('Publicamos los cambios.').waitFor();
  check('11. cambia portada, foto y música', true);

  await page.goto(base, { waitUntil: 'networkidle' });
  check('la portada publicada es una imagen', await page.locator('.cover-art img').count());
  check('hay controles de música', await page.getByRole('button', { name: 'Música' }).count());
  await page.screenshot({ path: join(out, 'portada-con-foto.png'), fullPage: false });

  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`${base}/i/${tokens.martin}`, { waitUntil: 'networkidle' });
  check('formulario de dos cupos sin scroll horizontal', !(await overflow()));
  await page.screenshot({ path: join(out, 'rsvp-320.png'), fullPage: true });
} catch (error) {
  check('recorrido', false, error instanceof Error ? error.stack ?? error.message : String(error));
  await page.screenshot({ path: join(out, 'error.png'), fullPage: true }).catch(() => undefined);
} finally {
  writeFileSync(join(out, 'resultado.json'), JSON.stringify(results, null, 2));
  await browser.close();
}

if (results.some((item) => !item.ok)) process.exit(1);
