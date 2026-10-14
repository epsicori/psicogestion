import { expect, test, type Page } from '@playwright/test';

/**
 * T-047 · Lo que jsdom no puede comprobar de la vista anual de la agenda: el recorrido solo con
 * teclado (un único día tabulable, flechas, RePág/AvPág, Intro lleva a la semana de ese día), que
 * a 360 px el documento no se desplaza en horizontal y que, con puntero táctil, todo día mide al
 * menos 44 × 44 px.
 *
 * Exige la siembra (`npx supabase db reset && npm run seed`). No prepara datos propios: la
 * disposición y el teclado no dependen de cuántas citas haya, y el año se abre en una fecha fija
 * para que el día enfocado sea siempre el mismo.
 */

const ESCRITORIO = { width: 1440, height: 900 };
const MOVIL = { width: 360, height: 740 };
const URL_ANIO = '/agenda?vista=anio&fecha=2026-03-10';

// Las pruebas entran con la misma cuenta: el segundo factor local usa un TOTP con instante único
// y dos entradas a la vez chocan. En serie.
test.describe.configure({ mode: 'serial' });

async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill('ana@psicogestion.test');
  await page.getByLabel('Contraseña').fill('psico1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/pacientes');
}

async function desbordamiento(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function diaConFoco(page: Page) {
  return page.evaluate(() => document.activeElement?.getAttribute('data-dia') ?? null);
}

test.describe('escritorio', () => {
  test.use({ viewport: ESCRITORIO });

  test('un solo día tabulable, flechas, RePág/AvPág e Intro lleva a la semana de ese día', async ({ page }) => {
    await entrar(page);
    await page.goto(URL_ANIO);

    await expect(page.getByRole('grid')).toHaveCount(12);
    // Tab entra en un único día: el resto tiene tabindex=-1.
    await expect(page.locator('a[data-dia][tabindex="0"]')).toHaveCount(1);
    await expect(page.locator('a[data-dia="2026-03-10"]')).toHaveAttribute('tabindex', '0');

    await page.locator('a[data-dia="2026-03-10"]').focus();
    await page.keyboard.press('ArrowRight');
    expect(await diaConFoco(page)).toBe('2026-03-11');
    await page.keyboard.press('ArrowDown');
    expect(await diaConFoco(page)).toBe('2026-03-18');
    await page.keyboard.press('ArrowLeft');
    expect(await diaConFoco(page)).toBe('2026-03-17');
    await page.keyboard.press('ArrowUp');
    expect(await diaConFoco(page)).toBe('2026-03-10');

    await page.keyboard.press('PageDown');
    expect(await diaConFoco(page)).toBe('2026-04-10');
    await page.keyboard.press('PageUp');
    expect(await diaConFoco(page)).toBe('2026-03-10');
    // Y el tabulador sigue al foco: el único día con tabindex=0 es el que lo tiene.
    await expect(page.locator('a[data-dia][tabindex="0"]')).toHaveAttribute('data-dia', '2026-03-10');

    await page.keyboard.press('PageDown');
    await page.keyboard.press('Enter');
    await page.waitForURL(/vista=semana&fecha=2026-04-10/);
    expect(new URL(page.url()).searchParams.get('vista')).toBe('semana');
  });

  test('con ratón caben cuatro meses por fila y el documento no se desplaza', async ({ page }) => {
    await entrar(page);
    await page.goto(URL_ANIO);
    const ys = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.meses-anio > section')).map((s) => Math.round(s.getBoundingClientRect().top)),
    );
    expect(ys).toHaveLength(12);
    const primeraFila = ys.filter((y) => y === ys[0]).length;
    expect(primeraFila, 'meses en la primera fila a 1440 px con ratón').toBe(4);
    expect(await desbordamiento(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('360 px táctil', () => {
  test.use({ viewport: MOVIL, hasTouch: true, isMobile: true });

  test('sin desplazamiento horizontal y todo día mide al menos 44 × 44 px', async ({ page }) => {
    await entrar(page);
    await page.goto(URL_ANIO);
    await expect(page.getByRole('grid')).toHaveCount(12);

    expect(await desbordamiento(page)).toBeLessThanOrEqual(0);

    const minimos = await page.evaluate(() => {
      const cajas = Array.from(document.querySelectorAll('a[data-dia]')).map((a) => a.getBoundingClientRect());
      return {
        n: cajas.length,
        ancho: Math.min(...cajas.map((c) => c.width)),
        alto: Math.min(...cajas.map((c) => c.height)),
        derecha: Math.max(...cajas.map((c) => c.right)),
      };
    });
    expect(minimos.n).toBe(365);
    expect(minimos.ancho, 'ancho mínimo de un día').toBeGreaterThanOrEqual(44);
    expect(minimos.alto, 'alto mínimo de un día').toBeGreaterThanOrEqual(44);
    expect(minimos.derecha, 'un día se sale por la derecha').toBeLessThanOrEqual(MOVIL.width);

    // Un mes por fila: los doce meses están en una sola columna.
    const lefts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.meses-anio > section')).map((s) => Math.round(s.getBoundingClientRect().left)),
    );
    expect(new Set(lefts).size).toBe(1);
  });
});
