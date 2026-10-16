import { expect, test, type Locator, type Page } from '@playwright/test';

import { contenedorDelProyecto } from '../lib/cuentas/contenedor-proyecto';
import { ejecutarSql } from '../scripts/psql.mjs';

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
 *
 * T-023b: pasos 6-10, sobre una factura del espejo de Sofía Nieto (de Ana, centro Madrid, el del técnico)
 * que `beforeAll` inserta como `postgres` junto con un cobro suelto de 0,01 €. Las dos filas se quedan
 * (solo adición) y se reconocen por la marca de tiempo de su número y su referencia.
 *
 * T-052: paso 11, el desborde a 360 px con contenido ancho en la rejilla (`min-w-0`); no escribe en la base.
 */

const MOVIL = { width: 360, height: 740 };
const REFERENCIA = `T-023 spec ${Date.now()}`;

const MARCA = Date.now();
const NUMERO = `E2E-${MARCA}`;
const REFERENCIA_SUELTO = `E2E-T023b-${MARCA}`;
// Paso 10: una factura y un cobro suelto de Lucía (de Ana, centro Madrid) para que el técnico tenga «Asignar».
const NUMERO_LUCIA = `E2E-L-${MARCA}`;
const REFERENCIA_LUCIA = `E2E-T023b-L-${MARCA}`;
const AVISO_FORMA ='La forma de pago no es válida: se muestran todas.';
const ADMIN ='b0080001-0000-4000-8000-000000000001';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  const guion = `
    with p as (select id, profesional_id from public.pacientes where nombre = 'Sofía' and apellidos = 'Nieto' limit 1),
    b as (
      insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por)
      select gen_random_uuid(), p.id, p.profesional_id, '${ADMIN}' from p returning id, paciente_id
    )
    insert into public.facturas_espejo
      (id, borrador_id, paciente_id, proveedor, proveedor_documento_id, numero, fecha_expedicion, base, cuota_iva, total, url_proveedor)
    select gen_random_uuid(), b.id, b.paciente_id, 'holded', 'E2E-T023b-${MARCA}', '${NUMERO}', current_date,
           10.00, 0.00, 10.00, 'https://programa.example/doc/${MARCA}' from b;
    insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por, referencia)
    select p.id, 0.01, current_date, 'efectivo', '${ADMIN}', '${REFERENCIA_SUELTO}'
      from public.pacientes p where p.nombre = 'Sofía' and p.apellidos = 'Nieto' limit 1;

    with p as (select id, profesional_id from public.pacientes where nombre = 'Lucía' and apellidos = 'Márquez' limit 1),
    b as (
      insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por)
      select gen_random_uuid(), p.id, p.profesional_id, '${ADMIN}' from p returning id, paciente_id
    )
    insert into public.facturas_espejo
      (id, borrador_id, paciente_id, proveedor, proveedor_documento_id, numero, fecha_expedicion, base, cuota_iva, total, url_proveedor)
    select gen_random_uuid(), b.id, b.paciente_id, 'holded', 'E2E-T023b-L-${MARCA}', '${NUMERO_LUCIA}', current_date,
           10.00, 0.00, 10.00, 'https://programa.example/doc/l-${MARCA}' from b;
    insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por, referencia)
    select p.id, 0.01, current_date, 'efectivo', '${ADMIN}', '${REFERENCIA_LUCIA}'
      from public.pacientes p where p.nombre = 'Lucía' and p.apellidos = 'Márquez' limit 1;
  `;
  expect(ejecutarSql(contenedorDelProyecto(), guion)).toBe(0);
});

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
  const boton = page.getByRole('button', { name: 'Registrar cobro', exact: true });
  await boton.click();
  const dialogo = page.getByRole('dialog', { name: 'Registrar cobro', exact: true });
  await expect(dialogo).toBeVisible();
  return { boton, dialogo };
}

test('1 · a 360 px la página no desborda y «Registrar cobro» mide 44 px', async ({ page }) => {
  await entrar(page);
  const boton = page.getByRole('button', { name: 'Registrar cobro', exact: true });
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

  const envio = dialogo.getByRole('button', { name: 'Registrar cobro', exact: true });
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
  await dialogo.getByRole('button', { name: 'Registrar cobro', exact: true }).click();
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
  await dialogo.getByRole('button', { name: 'Registrar cobro', exact: true }).click();
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

  await dialogo.getByRole('button', { name: 'Registrar cobro', exact: true }).click();
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
  await reabierto.dialogo.getByRole('button', { name: 'Registrar cobro', exact: true }).click();

  await expect(reabierto.dialogo).toBeHidden();
  await expect(boton).toBeFocused();
  // Hay más de una región `status` en la página: se elige la del cobro y se exige su texto entero.
  await expect(page.getByRole('status').filter({ hasText: 'ya estaba registrado' })).toHaveText(
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

const fila = (page: Page) => page.getByRole('listitem').filter({ hasText: NUMERO });

test('6 · a 360 px «Facturas del programa» no desborda, la fila dice dónde se emitió y sus botones miden 44 px', async ({
  page,
}) => {
  await entrar(page);
  const region = page.getByRole('region', { name: 'Facturas del programa' });
  await expect(fila(page)).toBeVisible();
  await expect(fila(page)).toContainText(`Emitida en Holded · nº ${NUMERO}`);

  const enlace = fila(page).getByRole('link', { name: 'Ver en Holded' });
  await expect(enlace).toHaveAttribute('rel', /noopener/);

  for (const nombre of [`Registrar cobro de la factura ${NUMERO}`, `Asignar un cobro a la factura ${NUMERO}`]) {
    const boton = fila(page).getByRole('button', { name: nombre, exact: true });
    await expect(boton).toBeVisible();
    expect((await boton.boundingBox())!.height, `«${nombre}» mide menos de 44 px`).toBeGreaterThanOrEqual(44);
  }
  const caja = (await region.boundingBox())!;
  expect(caja.x + caja.width, 'el bloque de facturas se sale por la derecha').toBeLessThanOrEqual(MOVIL.width);
  const desbordamiento = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(desbordamiento, 'la página se sale a lo ancho a 360 px').toBeLessThanOrEqual(0);
});

test('7 · registrar un cobro desde la fila: el paciente es texto fijo y el cobro aparece bajo la factura', async ({
  page,
}) => {
  await entrar(page);
  const boton = fila(page).getByRole('button', { name: `Registrar cobro de la factura ${NUMERO}`, exact: true });
  await boton.click();
  const dialogo = page.getByRole('dialog', { name: `Registrar cobro · factura ${NUMERO}` });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByRole('combobox', { name: 'Paciente' })).toHaveCount(0);
  await comprobarQueCabe(page, dialogo, 'modo factura');

  await dialogo.getByLabel('Importe').fill('0,01');
  await dialogo.getByLabel('Forma de pago').selectOption({ label: 'Efectivo' });
  await dialogo.getByRole('button', { name: 'Registrar cobro', exact: true }).click();
  await expect(dialogo).toBeHidden();
  await expect(fila(page).getByTestId('cobro-de-factura')).toHaveCount(1);
});

test('8 · asignar el cobro suelto: Escape devuelve el foco, se asigna, aparece bajo la fila y ya no se ofrece', async ({
  page,
}) => {
  await entrar(page);
  const boton = fila(page).getByRole('button', { name: `Asignar un cobro a la factura ${NUMERO}`, exact: true });
  await boton.click();
  let dialogo = page.getByRole('dialog', { name: `Asignar un cobro · factura ${NUMERO}` });
  await expect(dialogo).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(boton).toBeFocused();

  await boton.click();
  dialogo = page.getByRole('dialog', { name: `Asignar un cobro · factura ${NUMERO}` });
  const selector = dialogo.getByLabel('Cobro', { exact: true });
  const opcion = selector.locator('option', { hasText: REFERENCIA_SUELTO });
  await expect(opcion).toHaveCount(1);
  // Precondición: es el único cobro suelto de Sofía (el marcador de posición y él). Si la base trae más,
  // «ya no se ofrece» no probaría el último: se pide `db reset` + `seed`.
  await expect(selector.locator('option'), 'Sofía tiene más cobros sueltos: db reset + seed').toHaveCount(2);
  await selector.selectOption((await opcion.getAttribute('value'))!);
  await dialogo.getByRole('button', { name: 'Asignar un cobro', exact: true }).click();
  await expect(dialogo).toBeHidden();
  await expect(fila(page).getByTestId('cobro-de-factura')).toHaveCount(2);

  // Era el ÚLTIMO cobro suelto de Sofía (precondición comprobada arriba): ya no se ofrece, sin condicional.
  await expect(boton).toHaveCount(0);
  // El aviso se anuncia y el foco no cae en `body`: la región de estado sigue ahí y lo recibe (H1).
  const aviso = fila(page).getByRole('status').filter({ hasText: 'Cobro asignado a la factura' });
  await expect(aviso).toBeVisible();
  await expect(aviso).toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
});

test('9 · el filtro de forma de pago vive en la URL y uno inválido se avisa', async ({ page }) => {
  await entrar(page);
  await page.goto('/facturacion?forma=bizum');
  await expect(page.getByRole('region', { name: 'Facturas del programa' })).toBeVisible();
  await expect(fila(page)).toHaveCount(0);
  await page.goto('/facturacion?forma=efectivo');
  await expect(fila(page)).toBeVisible();
  await page.goto('/facturacion?forma=xyz');
  await expect(fila(page)).toBeVisible();
  await expect(page.getByText(AVISO_FORMA)).toBeVisible();
});

test('10 · el técnico ve la fila, abre «Asignar» y ninguna respuesta (documento, RSC ni POST de la acción) lleva datos clínicos', async ({
  page,
}) => {
  await page.setViewportSize(MOVIL);
  // `page.on('response')` no puede leer el cuerpo de los POST de las Server Actions: se interceptan las
  // páginas, las cargas RSC y los POST, se lee el cuerpo y se entrega tal cual (como accesibilidad/borrador.spec.ts).
  const lecturas: Promise<string | null>[] = [];
  await page.route('**/*', async (ruta) => {
    const peticion = ruta.request();
    if (peticion.method() !== 'POST' && !['document', 'fetch'].includes(peticion.resourceType())) {
      await ruta.continue();
      return;
    }
    const lectura = ruta.fetch({ maxRedirects: 0 }).then(async (respuesta) => {
      const cuerpo = await respuesta.text();
      await ruta.fulfill({ response: respuesta, body: cuerpo });
      return cuerpo;
    });
    lecturas.push(lectura.catch(() => null));
    await lectura.catch(() => ruta.abort());
  });
  await page.goto('/login');
  await page.getByLabel('Correo').fill('tecnico@psicogestion.test');
  await page.getByLabel('Contraseña').fill('psico1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'));
  await page.goto('/facturacion');
  const filaLucia = page.getByRole('listitem').filter({ hasText: NUMERO_LUCIA });
  await expect(filaLucia).toBeVisible();
  // Abrir «Asignar» dispara la acción `cargarCobrosAsignables`: su respuesta es un POST.
  await filaLucia.getByRole('button', { name: `Asignar un cobro a la factura ${NUMERO_LUCIA}`, exact: true }).click();
  const dialogo = page.getByRole('dialog', { name: `Asignar un cobro · factura ${NUMERO_LUCIA}` });
  await expect(dialogo.locator('option', { hasText: REFERENCIA_LUCIA })).toHaveCount(1);
  const cuerpos = (await Promise.all(lecturas)).filter((c): c is string => c !== null);
  expect(cuerpos.length).toBeGreaterThan(0);
  // Control: el POST de la acción se leyó de verdad (trae el cobro suelto que el diálogo enseña); sin esto,
  // su ausencia de columnas prohibidas no diría nada.
  expect(
    cuerpos.some((c) => c.includes(REFERENCIA_LUCIA) && !c.includes('<html')),
    'no se leyó la respuesta POST de cargarCobrosAsignables',
  ).toBe(true);
  for (const prohibido of ['tipo_terapia_id', 'cita_id', 'borrador_id', 'destinatario', '"lineas"']) {
    expect(
      cuerpos.some((c) => c.includes(prohibido)),
      `una respuesta de /facturacion contiene «${prohibido}»`,
    ).toBe(false);
  }
});

test('11 · a 360 px, contenido ancho en «Por paciente» y «Últimos cobros» no desborda la página (min-w-0)', async ({ page }) => {
  await entrar(page);
  const marcos = ['facturacion-pendientes', 'facturacion-cobros'];
  for (const id of marcos) {
    const marco = page.locator(`section[aria-labelledby="${id}"]`);
    await expect(marco).toBeVisible();
    // Sin esqueleto: se inyecta en el contenido real, no en el `Cargando` que el Suspense va a sustituir.
    await expect(marco.getByRole('status', { name: 'Cargando' })).toHaveCount(0);
  }
  const medida = await page.evaluate((ids) => {
    let insertados = 0;
    let anchoRelleno = 0;
    for (const id of ids) {
      const seccion = document.querySelector(`section[aria-labelledby="${id}"]`);
      if (!seccion) continue;
      const destino = seccion.querySelector('li') ?? seccion;
      // Imita `truncate`: bloque que recorta y no parte. Su contenido mínimo es de 600 px.
      const envoltura = document.createElement('span');
      envoltura.dataset.t052 = 'ancho';
      envoltura.style.cssText = 'display:block;overflow:hidden;white-space:nowrap';
      const relleno = document.createElement('span');
      relleno.style.cssText = 'display:inline-block;width:600px';
      relleno.textContent = ' ';
      envoltura.append(relleno);
      destino.append(envoltura);
      anchoRelleno = Math.max(anchoRelleno, relleno.getBoundingClientRect().width);
      insertados += 1;
    }
    return {
      insertados,
      anchoRelleno,
      desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }, marcos);
  expect(medida.insertados, 'no se encontró uno de los dos marcos de la rejilla').toBe(2);
  expect(medida.anchoRelleno, 'el contenido inyectado no mide 600 px: la prueba no prueba nada').toBe(600);
  expect(medida.desborde, 'la página se sale a lo ancho a 360 px con contenido ancho en la rejilla').toBeLessThanOrEqual(0);
});
