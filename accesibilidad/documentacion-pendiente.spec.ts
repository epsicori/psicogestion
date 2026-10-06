import { expect, test } from '@playwright/test';

/**
 * T-048 · Lo que jsdom no puede comprobar de la documentación pendiente: la disposición a 360 px,
 * el objetivo táctil de 44 px, el desplegable con teclado y que el término de la búsqueda no
 * llegue a la dirección.
 *
 * Exige la siembra (`npx supabase db reset && npm run seed`): Ana tiene pendientes de varios
 * pacientes, uno de ellos con seis. Solo lee; no resuelve nada.
 */

const MOVIL = { width: 360, height: 740 };

// Las pruebas entran con la misma cuenta: el segundo factor local usa un TOTP con instante único
// y dos entradas a la vez chocan. En serie.
test.describe.configure({ mode: 'serial' });

async function entrar(page: import('@playwright/test').Page) {
  await page.setViewportSize(MOVIL);
  await page.goto('/login');
  await page.getByLabel('Correo').fill('ana@psicogestion.test');
  await page.getByLabel('Contraseña').fill('psico1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/pacientes');
}

async function desbordamiento(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test('el panel de /agenda: un desplegable por paciente, con teclado y objetivo de 44 px', async ({ page }) => {
  await entrar(page);
  await page.goto('/agenda');

  const panel = page.locator('section[aria-labelledby="agenda-documentacion"]');
  await expect(panel.getByRole('heading', { name: 'Documentación pendiente' })).toBeVisible();

  const boton = panel.getByRole('button', { name: /\d+ pendientes/ }).first();
  await expect(boton).toBeVisible();
  await expect(boton).toHaveAttribute('aria-expanded', 'false');
  const caja = (await boton.boundingBox())!;
  expect(caja.height, 'el desplegable es más bajo que 44 px').toBeGreaterThanOrEqual(44);
  expect(caja.x + caja.width, 'el desplegable se sale por la derecha').toBeLessThanOrEqual(MOVIL.width);

  const lista = page.locator(`#${await boton.getAttribute('aria-controls')}`);
  await expect(lista).toBeHidden();

  await boton.focus();
  await page.keyboard.press('Enter');
  await expect(boton).toHaveAttribute('aria-expanded', 'true');
  await expect(lista).toBeVisible();
  await expect(boton).toBeFocused();

  for (const enlace of await lista.getByRole('link').all()) {
    const c = (await enlace.boundingBox())!;
    expect(c.height, 'un enlace de pendiente es más bajo que 44 px').toBeGreaterThanOrEqual(44);
    expect(c.x + c.width, 'un enlace se sale por la derecha').toBeLessThanOrEqual(MOVIL.width);
  }

  await page.keyboard.press('Space');
  await expect(boton).toHaveAttribute('aria-expanded', 'false');
  await expect(lista).toBeHidden();

  expect(await desbordamiento(page), 'la agenda se sale a lo ancho a 360 px').toBeLessThanOrEqual(0);
});

test('la página completa a 360 px: sin desbordar, filtros y paginación tocables', async ({ page }) => {
  await entrar(page);
  await page.goto('/agenda/documentacion');

  await expect(page.getByRole('heading', { name: 'Documentación pendiente', level: 2 })).toBeVisible();
  expect(await desbordamiento(page), 'la página se sale a lo ancho a 360 px').toBeLessThanOrEqual(0);

  // Se espera al contenido real (detrás del esqueleto): el campo de búsqueda solo existe con él.
  const campo = page.getByLabel('Buscar por nombre o apellidos');
  await expect(campo).toBeVisible();
  expect(await desbordamiento(page), 'la página con contenido se sale a lo ancho a 360 px').toBeLessThanOrEqual(0);

  // Los grupos de filtro que haya para esta cuenta (el de tipo solo sale con más de un tipo visible).
  const filtros = page.getByRole('group').getByRole('link');
  expect(await filtros.count()).toBeGreaterThan(1);
  for (const enlace of await filtros.all()) {
    const c = (await enlace.boundingBox())!;
    expect(c.height, 'un filtro es más bajo que 44 px').toBeGreaterThanOrEqual(44);
  }

  const caja = (await campo.boundingBox())!;
  expect(caja.height, 'el campo de búsqueda es más bajo que 44 px').toBeGreaterThanOrEqual(44);
});

test('el término de la búsqueda no llega a la dirección ni al historial', async ({ page }) => {
  await entrar(page);
  await page.goto('/agenda/documentacion');

  const primero = page.locator('[id^="pagina-paciente-"]').first();
  await expect(primero).toBeVisible();
  const nombre = ((await primero.textContent()) ?? '').trim();
  const termino = nombre.split(/\s+/)[0].slice(0, 4);
  expect(termino.length).toBeGreaterThanOrEqual(2);

  const antes = page.url();
  const historial = await page.evaluate(() => window.history.length);

  await page.getByLabel('Buscar por nombre o apellidos').fill(termino);
  await page.getByRole('button', { name: 'Buscar' }).click();

  const estado = page.locator('[data-estado-busqueda]');
  await expect(estado).toHaveText(/coincid/);
  expect(page.url(), 'la búsqueda cambió la dirección').toBe(antes);
  expect(page.url().toLowerCase()).not.toContain(termino.toLowerCase());
  expect(await page.evaluate(() => window.history.length), 'la búsqueda añadió una entrada al historial').toBe(historial);
  await expect(page.getByRole('link', { name: nombre }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  await expect(page.getByLabel('Buscar por nombre o apellidos')).toHaveValue('');
  await expect(page.getByLabel('Buscar por nombre o apellidos')).toBeFocused();
  expect(await desbordamiento(page)).toBeLessThanOrEqual(0);
});

test('con ?paciente: sin buscador, todos los pendientes y el enlace para quitar el filtro', async ({ page }) => {
  await entrar(page);
  await page.goto('/agenda/documentacion');

  const idPaciente = (await page.locator('[id^="pagina-paciente-"]').first().getAttribute('id'))!.replace(
    'pagina-paciente-',
    '',
  );
  await page.goto(`/agenda/documentacion?paciente=${idPaciente}`);
  await expect(page.getByRole('link', { name: 'Quitar el filtro de paciente' })).toBeVisible();
  await expect(page.getByLabel('Buscar por nombre o apellidos')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /pendientes/ })).toHaveCount(0);
  expect(await desbordamiento(page)).toBeLessThanOrEqual(0);
});
