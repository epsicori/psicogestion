import { expect, test } from '@playwright/test';

/**
 * T-015 · Lo que jsdom no puede comprobar de los avisos del armazón: la disposición a 360 px.
 *
 * Exige la siembra (`npx supabase db reset && npm run seed`). No hay `axe` en las dependencias
 * y el ticket no autoriza añadirlo: se comprueba lo estructural que sí se puede medir (nombre
 * accesible, región `status` sin `alert`, panel dentro de la ventana, franja en el flujo).
 */

const MOVIL = { width: 360, height: 740 };

// Las tres entran con la misma cuenta: el segundo factor local usa un TOTP con instante único
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

test('la cabecera a 360 px no desborda y la campana tiene nombre accesible', async ({ page }) => {
  await entrar(page);
  const campana = page.getByRole('button', { name: /^Notificaciones/ });
  await expect(campana).toBeVisible();

  const desbordamiento = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(desbordamiento, 'la página se sale a lo ancho a 360 px').toBeLessThanOrEqual(0);
});

test('con la campana abierta, el panel cabe en la ventana y Escape devuelve el foco', async ({ page }) => {
  await entrar(page);
  const campana = page.getByRole('button', { name: /^Notificaciones/ });
  await campana.click();

  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  const caja = await panel.boundingBox();
  expect(caja!.x, 'el panel se sale por la izquierda').toBeGreaterThanOrEqual(0);
  expect(caja!.x + caja!.width, 'el panel se sale por la derecha').toBeLessThanOrEqual(MOVIL.width);

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(campana).toBeFocused();
});

test('la región de estado existe, no hay alert y la franja no es fixed ni sticky', async ({ page }) => {
  await entrar(page);
  await page.goto('/agenda');

  // Siempre montada, aunque no haya sesión en curso: así los lectores de pantalla la registran.
  await expect(page.locator('[data-franja-sesion][role="status"]')).toBeAttached();
  // El anunciador de rutas de Next lleva su propio `role="alert"` y no es nuestro.
  expect(await page.locator('[role="alert"]:not(next-route-announcer *)').count()).toBe(0);

  // Ni la región ni ninguno de sus ascendentes (hasta el body) se pega a la ventana.
  const posiciones = await page.evaluate(() => {
    const salida: string[] = [];
    for (const el of document.querySelectorAll('[data-franja-sesion]')) {
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
        salida.push(getComputedStyle(n).position);
      }
    }
    return salida;
  });
  for (const pos of posiciones) expect(['fixed', 'sticky']).not.toContain(pos);

  const desbordamiento = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(desbordamiento).toBeLessThanOrEqual(0);
});
