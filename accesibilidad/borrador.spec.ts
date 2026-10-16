import { randomInt } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { validarCif } from '../lib/identidad/cif';

/**
 * T-046 · El editor del borrador en navegador, a 360 px: crear con una línea libre al 21 %, corregir
 * el importe, pasar a un tercero con CIF y descartar con el diálogo (foco dentro, Escape lo devuelve,
 * confirmar: el foco va al aviso «Descartado»). Lo mismo al descartar desde la ruta de corrección.
 * De paso, ninguna respuesta al navegador desde que se abre el editor lleva el DNI del paciente
 * (descifrado en servidor para las versiones con el paciente de destinatario) ni el CIF en claro (CA5).
 *
 * Exige la siembra: `npx supabase db reset && npm run seed`. Escribe dos borradores de prueba (solo
 * adición): quedan descartados, con un concepto que lleva la marca de tiempo.
 */

const MOVIL = { width: 360, height: 740 };
const PACIENTE = 'd0080001-0000-4000-8000-000000000003';
const CONCEPTO = `Informe T-046 ${Date.now()}`;
/** El DNI de Carmen en la siembra (`supabase/seed-completo.sql`, su identificación cifrada). */
const DNI_PACIENTE = '87654321X';

function cifAlAzar() {
  const cuerpo = 'B' + String(randomInt(0, 10_000_000)).padStart(7, '0');
  for (const c of '0123456789ABCDEFGHIJ') if (validarCif(cuerpo + c)) return cuerpo + c;
  throw new Error('sin CIF');
}
const CIF = cifAlAzar();

test.describe.configure({ mode: 'serial' });

async function entrar(page: Page) {
  await page.setViewportSize(MOVIL);
  await page.goto('/login');
  await page.getByLabel('Correo').fill('admin@psicogestion.test');
  await page.getByLabel('Contraseña').fill('psico1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/pacientes');
}

async function sinDesbordar(page: Page, cuando: string) {
  const desbordamiento = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(desbordamiento, `${cuando}: la página se sale a lo ancho a 360 px`).toBeLessThanOrEqual(0);
}

async function guardar(page: Page, version: number) {
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Guardado: versión ${version}` })).toBeVisible();
}

test('crear, corregir, pasar a un tercero y descartar el borrador', async ({ page }) => {
  // Se recoge desde que se entra al editor: la ficha sí enseña el DNI al administrador. Las respuestas
  // de las Server Actions no se pueden leer con `page.on('response')` (Chromium ya no guarda su cuerpo
  // al pedirlo: «No data found for resource»), así que se interceptan las páginas, las cargas RSC y
  // los POST, se lee el cuerpo y se entrega tal cual. Cada lectura es una promesa y se esperan todas.
  let recoger = false;
  const pendientes: Promise<string | null>[] = [];
  const deLaFicha: Promise<string | null>[] = [];
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
    (recoger ? pendientes : deLaFicha).push(lectura.catch(() => null));
    await lectura.catch(() => ruta.abort());
  });

  await entrar(page);
  await page.goto(`/pacientes/${PACIENTE}`);
  // Control: la búsqueda encuentra el DNI donde sí debe estar (la pestaña «Ficha del paciente»), así
  // que su ausencia luego dice algo.
  await page.getByRole('tab', { name: 'Ficha del paciente' }).click();
  await expect(page.getByText(DNI_PACIENTE)).toBeVisible();
  expect((await Promise.all(deLaFicha)).some((c) => c?.includes(DNI_PACIENTE)), 'la ficha no trae el DNI').toBe(true);
  await page.getByRole('tab', { name: 'Facturación' }).click();
  recoger = true;
  await page.getByRole('link', { name: 'Nuevo borrador' }).click();
  await page.waitForURL(`**/pacientes/${PACIENTE}/borrador`);
  await expect(page.getByRole('heading', { name: 'Nuevo borrador de factura' })).toBeVisible();
  await sinDesbordar(page, 'al abrir');

  // Una línea libre al 21 % → versión 1.
  await page.getByRole('button', { name: 'Añadir línea libre' }).click();
  await page.getByLabel('Concepto').last().fill(CONCEPTO);
  await page.getByLabel('Precio con IVA (€)').last().fill('121,00');
  await page.getByLabel('IVA', { exact: true }).last().selectOption('general');
  await sinDesbordar(page, 'con una línea');
  const boton = page.getByRole('button', { name: 'Guardar borrador' });
  const caja = (await boton.boundingBox())!;
  expect(caja.height, 'el botón es más bajo que 44 px').toBeGreaterThanOrEqual(44);
  await guardar(page, 1);

  // Corregir el importe → versión 2.
  await page.getByLabel('Precio con IVA (€)').last().fill('130,00');
  await guardar(page, 2);

  // Un tercero con CIF → versión 3.
  await page.getByRole('radio', { name: 'Otra persona o entidad' }).check();
  await page.getByLabel('Nombre o razón social').fill('Mutua de prueba');
  await page.getByLabel('Tipo').selectOption('juridica');
  await page.getByLabel('NIF (opcional)').fill(CIF);
  await sinDesbordar(page, 'con el tercero');
  await guardar(page, 3);

  // Descartar: el foco entra en el diálogo, Escape lo cierra y devuelve el foco, y se confirma.
  const descartar = page.getByRole('button', { name: 'Descartar', exact: true });
  await descartar.click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  const cajaDialogo = (await dialogo.boundingBox())!;
  expect(cajaDialogo.x + cajaDialogo.width, 'el diálogo se sale por la derecha').toBeLessThanOrEqual(MOVIL.width);
  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(descartar).toBeFocused();

  // Confirmar: el formulario desaparece y el foco va al aviso, que ya existía (H3).
  await descartar.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Descartar el borrador' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Descartado' })).toBeFocused();
  await expect(page.getByRole('button', { name: /borrar/i })).toHaveCount(0);

  // Desde la ruta de corrección: un borrador nuevo con el paciente de destinatario, abierto por su
  // uuid (el de la respuesta de la acción), y descartado con el teclado.
  await page.goto(`/pacientes/${PACIENTE}/borrador`);
  await page.getByRole('button', { name: 'Añadir línea libre' }).click();
  await page.getByLabel('Concepto').last().fill(`${CONCEPTO} b`);
  await page.getByLabel('Precio con IVA (€)').last().fill('60,00');
  await page.getByLabel('IVA', { exact: true }).last().selectOption('exento_sanitario');
  await guardar(page, 1);
  const cuerposAhora = (await Promise.all(pendientes)).filter((c): c is string => c !== null);
  const ids = cuerposAhora.flatMap((c) => [...c.matchAll(/"borradorId":"([0-9a-f-]{36})"/g)].map((m) => m[1]));
  const segundo = ids.at(-1);
  expect(segundo, 'la acción no devolvió el uuid del borrador').toBeTruthy();
  await page.goto(`/pacientes/${PACIENTE}/borrador/${segundo}`);
  await expect(page.getByRole('heading', { name: 'Corregir el borrador' })).toBeVisible();
  await page.getByRole('button', { name: 'Descartar', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Descartar el borrador' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Descartado' })).toBeFocused();

  // CA5 · ni el DNI del paciente ni el CIF del tercero viajan al navegador.
  const cuerpos = (await Promise.all(pendientes)).filter((c): c is string => c !== null);
  expect(cuerpos.length, 'no se recogió ninguna respuesta').toBeGreaterThan(3);
  expect(cuerpos.filter((c) => c.includes(DNI_PACIENTE)), 'una respuesta lleva el DNI en claro').toEqual([]);
  expect(cuerpos.filter((c) => c.includes(CIF)), 'una respuesta lleva el CIF en claro').toEqual([]);
});
