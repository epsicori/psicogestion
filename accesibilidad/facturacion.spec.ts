import { expect, test } from '@playwright/test';

/**
 * T-023 · Lo que jsdom no puede medir de `/facturacion`: la disposición a 360 px y el diálogo de
 * «Registrar cobro» dentro de la ventana, con el foco de vuelta al botón al cerrar.
 *
 * Exige la siembra (`npx supabase db reset && npm run seed`). No registra ningún cobro: lo
 * económico no se borra, y una prueba que lo escribiera dejaría filas para siempre.
 */

const MOVIL = { width: 360, height: 740 };

test.describe.configure({ mode: 'serial' });

async function entrar(page: import('@playwright/test').Page) {
  await page.setViewportSize(MOVIL);
  await page.goto('/login');
  await page.getByLabel('Correo').fill('ana@psicogestion.test');
  await page.getByLabel('Contraseña').fill('psico1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/pacientes');
  await page.goto('/facturacion');
}

test('a 360 px la página no desborda y «Registrar cobro» mide 44 px', async ({ page }) => {
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

test('el diálogo cabe en la ventana, sus campos tienen nombre y Escape devuelve el foco', async ({ page }) => {
  await entrar(page);
  const boton = page.getByRole('button', { name: 'Registrar cobro' });
  await boton.click();

  const dialogo = page.getByRole('dialog', { name: 'Registrar cobro' });
  await expect(dialogo).toBeVisible();
  const caja = (await dialogo.boundingBox())!;
  expect(caja.x, 'el diálogo se sale por la izquierda').toBeGreaterThanOrEqual(0);
  expect(caja.x + caja.width, 'el diálogo se sale por la derecha').toBeLessThanOrEqual(MOVIL.width);

  for (const etiqueta of ['Paciente', 'Importe', 'Fecha', 'Forma de pago']) {
    await expect(dialogo.getByLabel(etiqueta, { exact: false }).first()).toBeVisible();
  }

  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(boton).toBeFocused();
});
