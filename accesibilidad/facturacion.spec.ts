import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * T-023 · Lo que jsdom no puede medir de `/facturacion`: la disposición a 360 px, el diálogo de
 * «Registrar cobro» dentro de la ventana, el foco al validar y el foco de vuelta al cerrar.
 *
 * Exige la siembra: `npx supabase db reset && npm run seed`.
 *
 * Esta batería SÍ escribe un cobro (el paso 4): 0,01 € en efectivo a «Márquez, Lucía», con una
 * referencia que lleva la marca de tiempo. Lo económico no se borra, así que la fila se queda; por
 * eso es de un céntimo y se reconoce por su referencia. Se entra como administrador, que ve todos
 * los cobros y no depende de a quién esté asignado el paciente.
 *
 * El paso 4 pasa con «Últimos cobros» vacío (recién sembrado) y con hasta 18 filas: la lista enseña
 * 20 y el paso puede añadir dos. Con más, falla y pide resetear con `db reset && npm run seed`.
 */

const MOVIL = { width: 360, height: 740 };
const REFERENCIA = `T-023 spec ${Date.now()}`;

test.describe.configure({ mode: 'serial' });

async function entrar(page: Page) {
  await page.setViewportSize(MOVIL);
  await page.goto('/login');
  await page.getByLabel('Correo').fill('admin@psicogestion.test');
  await page.getByLabel('Contraseña').fill('psico1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/pacientes');
  await page.goto('/facturacion');
}

async function abrirDialogo(page: Page) {
  const boton = page.getByRole('button', { name: 'Registrar cobro' });
  await boton.click();
  const dialogo = page.getByRole('dialog', { name: 'Registrar cobro' });
  await expect(dialogo).toBeVisible();
  return { boton, dialogo };
}

test('1 · a 360 px la página no desborda y «Registrar cobro» mide 44 px', async ({ page }) => {
  await entrar(page);
  const boton = page.getByRole('button', { name: 'Registrar cobro' });
  await expect(boton).toBeVisible();
  const caja = (await boton.boundingBox())!;
  expect(caja.height, 'el botón es más bajo que 44 px').toBeGreaterThanOrEqual(44);
  expect(caja.x + caja.width, 'el botón se sale por la derecha').toBeLessThanOrEqual(MOVIL.width);

  // El selector de profesional (solo administrador) también cabe.
  const profesional = page.getByRole('combobox', { name: 'Profesional' });
  await expect(profesional).toBeVisible();
  const cajaProfesional = (await profesional.boundingBox())!;
  expect(cajaProfesional.x, 'el selector de profesional se sale por la izquierda').toBeGreaterThanOrEqual(0);
  expect(cajaProfesional.x + cajaProfesional.width, 'el selector de profesional se sale por la derecha').toBeLessThanOrEqual(
    MOVIL.width,
  );

  const desbordamiento = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(desbordamiento, 'la página se sale a lo ancho a 360 px').toBeLessThanOrEqual(0);
});

/** El diálogo y su botón de envío dentro de la ventana de 360 × 740, y la página sin desbordar. */
async function comprobarQueCabe(page: Page, dialogo: Locator, cuando: string) {
  const caja = (await dialogo.boundingBox())!;
  expect(caja.x, `${cuando}: el diálogo se sale por la izquierda`).toBeGreaterThanOrEqual(0);
  expect(caja.x + caja.width, `${cuando}: el diálogo se sale por la derecha`).toBeLessThanOrEqual(MOVIL.width);
  expect(caja.y + caja.height, `${cuando}: el diálogo se sale por abajo`).toBeLessThanOrEqual(MOVIL.height);

  const envio = dialogo.getByRole('button', { name: 'Registrar cobro' });
  await envio.scrollIntoViewIfNeeded();
  const cajaEnvio = (await envio.boundingBox())!;
  expect(cajaEnvio.x, `${cuando}: el envío se sale por la izquierda`).toBeGreaterThanOrEqual(0);
  expect(cajaEnvio.x + cajaEnvio.width, `${cuando}: el envío se sale por la derecha`).toBeLessThanOrEqual(MOVIL.width);
  expect(cajaEnvio.y, `${cuando}: el envío queda por encima de la ventana`).toBeGreaterThanOrEqual(0);
  expect(cajaEnvio.y + cajaEnvio.height, `${cuando}: el envío queda por debajo de la ventana`).toBeLessThanOrEqual(
    MOVIL.height,
  );

  const desbordamiento = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(desbordamiento, `${cuando}: la página se sale a lo ancho`).toBeLessThanOrEqual(0);
}

test('2 · el diálogo cabe, sus campos tienen nombre, un envío vacío lleva el foco a «Paciente» y Escape lo devuelve', async ({
  page,
}) => {
  await entrar(page);
  const { boton, dialogo } = await abrirDialogo(page);

  for (const etiqueta of ['Paciente', 'Importe', 'Fecha', 'Forma de pago']) {
    await expect(dialogo.getByLabel(etiqueta, { exact: false }).first()).toBeVisible();
  }

  // Un envío vacío: el foco va al primer campo con error, «Paciente».
  await dialogo.getByRole('button', { name: 'Registrar cobro' }).click();
  await expect(dialogo.getByLabel('Paciente')).toBeFocused();
  // Con los errores ya pintados, que es cuando el diálogo es más alto.
  await comprobarQueCabe(page, dialogo, 'tras el envío vacío');

  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(boton).toBeFocused();
});

test('3 · un importe negativo muestra «Motivo de la devolución»', async ({ page }) => {
  await entrar(page);
  const { dialogo } = await abrirDialogo(page);

  await expect(dialogo.getByLabel('Motivo de la devolución')).toHaveCount(0);
  await dialogo.getByLabel('Importe').fill('-5,00');
  await expect(dialogo.getByLabel('Motivo de la devolución')).toBeVisible();

  // Cuatro errores a la vez: Paciente, Fecha, Forma de pago y Referencia. El Motivo no sale
  // (el superRefine no corre si falla otro campo), y el foco va al primero en orden de pintura.
  await dialogo.getByLabel('Fecha').fill('');
  await dialogo.getByLabel('Referencia', { exact: false }).fill('x'.repeat(121));
  await dialogo.getByRole('button', { name: 'Registrar cobro' }).click();
  await expect(dialogo.locator('[aria-invalid="true"]')).toHaveCount(4);
  await expect(dialogo.getByLabel('Paciente')).toBeFocused();
  await comprobarQueCabe(page, dialogo, 'con cuatro errores y Motivo');
});

test('4 · un corte de red tras insertar no recarga ni pierde lo escrito, y reenviar tras cerrar y reabrir no duplica el cobro', async ({
  page,
  context,
  browser,
}) => {
  await entrar(page);
  const sesion = await context.storageState();

  const recientes = page.getByRole('region', { name: 'Últimos cobros' });
  const lista = recientes.getByRole('listitem');
  const vacia = recientes.getByText('Todavía no hay cobros');
  const filasDeLucia = lista.filter({ hasText: 'Lucía Márquez' }).filter({ hasText: '0,01' });

  // La lista llega por Suspense: sin esperarla, `count()` leería 0 y el `+ 1` final sería otro.
  await expect(lista.or(vacia).first()).toBeVisible();
  const totalAntes = await lista.count();
  expect(
    totalAntes,
    'hay más de 18 cobros en «Últimos cobros»: resetea con `db reset && npm run seed`',
  ).toBeLessThanOrEqual(18);
  const antes = await filasDeLucia.count();

  const { boton, dialogo } = await abrirDialogo(page);
  await dialogo.getByLabel('Paciente').selectOption({ label: 'Márquez, Lucía' });
  await dialogo.getByLabel('Importe').fill('0,01');
  await dialogo.getByLabel('Forma de pago').selectOption({ label: 'Efectivo' });
  await dialogo.getByLabel('Referencia', { exact: false }).fill(REFERENCIA);

  // El primer POST de la acción llega al servidor (el cobro se inserta) y la respuesta se pierde:
  // el navegador se queda sin red y el envío falla como un corte real. Se guarda lo que contestó
  // el servidor para comprobar que el primer envío llegó de verdad (B-H3).
  let cortado = false;
  let primera: { estado: number; cuerpo: string } | null = null;
  await page.route('**/*', async (route) => {
    const peticion = route.request();
    if (!cortado && peticion.method() === 'POST' && peticion.headers()['next-action'] !== undefined) {
      cortado = true;
      const respuesta = await route.fetch();
      primera = { estado: respuesta.status(), cuerpo: await respuesta.text() };
      await context.setOffline(true);
      await route.abort('internetdisconnected');
      return;
    }
    await route.continue();
  });
  let navegaciones = 0;
  page.on('framenavigated', (marco) => {
    if (marco === page.mainFrame()) navegaciones += 1;
  });

  await dialogo.getByRole('button', { name: 'Registrar cobro' }).click();
  const aviso = dialogo.getByText('No sabemos si el cobro se ha registrado');
  await expect(aviso).toBeVisible();
  await page.waitForTimeout(1500);
  expect(navegaciones, 'el fallo recargó o navegó la página').toBe(0);
  await expect(aviso).toBeVisible();
  await expect(dialogo.getByLabel('Importe')).toHaveValue('0,01');

  // B-H3: el servidor sí recibió y contestó el primer envío.
  const recibida = primera as { estado: number; cuerpo: string } | null;
  expect(recibida?.estado, 'el primer envío no llegó a la acción (¿500 de Turbopack recompilando?)').toBe(200);
  expect(recibida?.cuerpo).toContain('Cobro registrado');

  // El recuento antes del reintento, en otro contexto con red (B-H2): sin esto, un primer envío que
  // no insertó haría pasar el paso sin probar la deduplicación.
  const otro = await browser.newContext({ storageState: sesion });
  try {
    const testigo = await otro.newPage();
    await testigo.goto(new URL('/facturacion', page.url()).href);
    const recientesTestigo = testigo.getByRole('region', { name: 'Últimos cobros' });
    await expect(
      recientesTestigo.getByRole('listitem').filter({ hasText: 'Lucía Márquez' }).filter({ hasText: '0,01' }),
      'el primer envío no insertó: el paso no prueba la deduplicación',
    ).toHaveCount(antes + 1);
    await expect(recientesTestigo.getByRole('listitem')).toHaveCount(totalAntes + 1);
  } finally {
    await otro.close();
  }

  // B-H1: se cierra el diálogo de verdad (el formulario se desmonta) y se reabre.
  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(boton).toBeFocused();
  await context.setOffline(false);
  await page.unroute('**/*');

  const reabierto = await abrirDialogo(page);
  await reabierto.dialogo.getByLabel('Paciente').selectOption({ label: 'Márquez, Lucía' });
  // «0.01» y no «0,01»: la clave de envío se calcula sobre el importe normalizado.
  await reabierto.dialogo.getByLabel('Importe').fill('0.01');
  await reabierto.dialogo.getByLabel('Forma de pago').selectOption({ label: 'Efectivo' });
  await reabierto.dialogo.getByLabel('Referencia', { exact: false }).fill(REFERENCIA);
  await reabierto.dialogo.getByRole('button', { name: 'Registrar cobro' }).click();

  await expect(reabierto.dialogo).toBeHidden();
  await expect(boton).toBeFocused();
  await expect(page.getByRole('status')).toHaveText(
    'Este cobro ya estaba registrado; no se ha añadido otro. Si es un cobro nuevo con los mismos datos, regístralo otra vez.',
  );
  await expect(filasDeLucia, 'el reintento duplicó el cobro (o no se vio el nuevo)').toHaveCount(antes + 1);
  await expect(lista, 'el reintento duplicó el cobro').toHaveCount(totalAntes + 1);

  // La línea del importe de «Por paciente» no se sale ni se corta a 360 px.
  const pendientes = page.getByRole('region', { name: 'Por paciente' });
  const linea = pendientes.getByRole('listitem').filter({ hasText: 'Lucía Márquez' }).locator('p.break-words').first();
  await expect(linea).toBeVisible();
  const medidas = await linea.evaluate((el) => ({ scroll: el.scrollWidth, cliente: el.clientWidth }));
  expect(medidas.scroll, 'el importe de «Por paciente» se corta').toBeLessThanOrEqual(medidas.cliente);
  const cajaLinea = (await linea.boundingBox())!;
  expect(cajaLinea.x + cajaLinea.width, 'el importe de «Por paciente» se sale por la derecha').toBeLessThanOrEqual(
    MOVIL.width,
  );
});

test('5 · Escape cierra el diálogo y devuelve el foco al botón', async ({ page }) => {
  await entrar(page);
  const { boton, dialogo } = await abrirDialogo(page);

  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(boton).toBeFocused();
});
