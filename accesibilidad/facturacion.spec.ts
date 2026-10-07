import { expect, test, type Page } from '@playwright/test';

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

  const desbordamiento = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(desbordamiento, 'la página se sale a lo ancho a 360 px').toBeLessThanOrEqual(0);
});

test('2 · el diálogo cabe, sus campos tienen nombre, un envío vacío lleva el foco a «Paciente» y Escape lo devuelve', async ({
  page,
}) => {
  await entrar(page);
  const { boton, dialogo } = await abrirDialogo(page);

  const caja = (await dialogo.boundingBox())!;
  expect(caja.x, 'el diálogo se sale por la izquierda').toBeGreaterThanOrEqual(0);
  expect(caja.x + caja.width, 'el diálogo se sale por la derecha').toBeLessThanOrEqual(MOVIL.width);

  for (const etiqueta of ['Paciente', 'Importe', 'Fecha', 'Forma de pago']) {
    await expect(dialogo.getByLabel(etiqueta, { exact: false }).first()).toBeVisible();
  }

  // Un envío vacío: el foco va al primer campo con error, «Paciente».
  await dialogo.getByRole('button', { name: 'Registrar cobro' }).click();
  await expect(dialogo.getByLabel('Paciente')).toBeFocused();

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
});

test('4 · un cobro válido cierra el diálogo, devuelve el foco, se anuncia y aparece en «Últimos cobros»', async ({
  page,
}) => {
  await entrar(page);
  const { boton, dialogo } = await abrirDialogo(page);

  await dialogo.getByLabel('Paciente').selectOption({ label: 'Márquez, Lucía' });
  await dialogo.getByLabel('Importe').fill('0,01');
  await dialogo.getByLabel('Forma de pago').selectOption({ label: 'Efectivo' });
  await dialogo.getByLabel('Referencia', { exact: false }).fill(REFERENCIA);
  await dialogo.getByRole('button', { name: 'Registrar cobro' }).click();

  await expect(dialogo).toBeHidden();
  await expect(boton).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: 'Cobro registrado' })).toBeVisible();

  const recientes = page.getByRole('region', { name: 'Últimos cobros' });
  await expect(recientes.getByText('Lucía Márquez').first()).toBeVisible();
});

test('5 · Escape cierra el diálogo y devuelve el foco al botón', async ({ page }) => {
  await entrar(page);
  const { boton, dialogo } = await abrirDialogo(page);

  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(boton).toBeFocused();
});
