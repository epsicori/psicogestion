import { expect, test } from '@playwright/test';

/**
 * T-012 corte B · Criterio 10: a 360 px, con el teclado virtual abierto, el cursor sigue
 * visible por encima de la barra Guardar/Firmar.
 *
 * El teclado virtual con `interactive-widget=resizes-content` se emula como lo que es para la
 * página: una ventana más baja. jsdom no tiene disposición, así que esto solo se puede medir
 * aquí. Exige la siembra (`npx supabase db reset && npm run seed`): la nota es el borrador de
 * Carmen, de Ana, y el PIN del candado el de desarrollo.
 */

const PACIENTE = 'd0080001-0000-4000-8000-000000000003';
const NOTA = 'f0080001-0000-4000-8000-000000000001';

test('a 360×330 el cursor al final de un texto largo queda por encima de la barra de acciones', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/login');
  await page.getByLabel('Correo').fill('ana@psicogestion.test');
  await page.getByLabel('Contraseña').fill('psico1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/pacientes');

  await page.goto(`/pacientes/${PACIENTE}/historia/notas?nota=${NOTA}`);
  await page.getByRole('button', { name: 'Abrir el editor' }).click();

  const campoPin = page.getByLabel('PIN');
  const area = page.getByRole('textbox', { name: 'Nota', exact: true });
  await expect(campoPin.or(area)).toBeVisible();
  if (await campoPin.isVisible()) {
    await campoPin.fill('123456');
    await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  }
  await expect(area).toBeVisible();

  const lineas = Array.from({ length: 40 }, (_, i) => `Línea ${i + 1}`).join('\n');
  await area.fill(lineas);

  // El teclado se abre: la ventana útil pasa de 740 a 330 px.
  await page.setViewportSize({ width: 360, height: 330 });
  await area.focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('XFINALX');

  const medida = await page.evaluate(() => {
    const ta = document.activeElement as HTMLTextAreaElement;
    const barra = document.querySelector('[role="toolbar"]') as HTMLElement;
    // La posición del cursor, calculada con un espejo del textarea: un textarea no da el
    // rectángulo de su cursor.
    const estilo = getComputedStyle(ta);
    const caja = ta.getBoundingClientRect();
    const espejo = document.createElement('div');
    for (const p of [
      'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'whiteSpace',
      'wordBreak', 'overflowWrap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'boxSizing',
    ] as const) {
      espejo.style[p] = estilo[p];
    }
    espejo.style.position = 'absolute';
    espejo.style.visibility = 'hidden';
    espejo.style.width = `${ta.clientWidth + parseFloat(estilo.borderLeftWidth) * 2}px`;
    espejo.style.boxSizing = 'border-box';
    espejo.textContent = ta.value.slice(0, ta.selectionStart);
    const marca = document.createElement('span');
    marca.textContent = '|';
    espejo.appendChild(marca);
    document.body.appendChild(espejo);
    const marcaTop = marca.offsetTop;
    const marcaAlto = marca.offsetHeight;
    espejo.remove();
    const cursorTop = caja.top + marcaTop - ta.scrollTop + parseFloat(estilo.borderTopWidth);
    return {
      cursorTop,
      cursorBottom: cursorTop + marcaAlto,
      barraTop: barra.getBoundingClientRect().top,
      ventana: window.innerHeight,
    };
  });

  expect(medida.cursorTop, 'el cursor sale por arriba de la ventana').toBeGreaterThanOrEqual(0);
  expect(
    medida.cursorBottom,
    `el cursor queda tapado por la barra: ${JSON.stringify(medida)}`,
  ).toBeLessThanOrEqual(medida.barraTop);
});

test('a 1280 la barra de acciones se separa del contenido que pasa por debajo: sombra superior y aire propio', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/login');
  await page.getByLabel('Correo').fill('ana@psicogestion.test');
  await page.getByLabel('Contraseña').fill('psico1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/pacientes');

  await page.goto(`/pacientes/${PACIENTE}/historia/notas?nota=${NOTA}`);
  await page.getByRole('button', { name: 'Abrir el editor' }).click();
  const campoPin = page.getByLabel('PIN');
  const area = page.getByRole('textbox', { name: 'Nota', exact: true });
  await expect(campoPin.or(area)).toBeVisible();
  if (await campoPin.isVisible()) {
    await campoPin.fill('123456');
    await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  }
  await expect(area).toBeVisible();

  const barra = await page.getByRole('toolbar').evaluate((el) => {
    const e = getComputedStyle(el);
    return { sombra: e.boxShadow, aireInferior: parseFloat(e.paddingBottom), aireSuperior: parseFloat(e.paddingTop) };
  });
  expect(barra.sombra, 'sin sombra, la barra se pega al cuadro que queda debajo').not.toBe('none');
  expect(barra.aireSuperior).toBeGreaterThanOrEqual(12);
  expect(barra.aireInferior).toBeGreaterThanOrEqual(12);
});

/**
 * T-040 · El diálogo de la copia cifrada, con el teclado y en un navegador de verdad: «Descargar
 * copia» lo abre con el foco dentro, Tab y Mayús+Tab no salen de él, Escape lo cierra y el foco
 * vuelve a «Descargar copia». La nota es la firmada de Carmen, de Ana (una versión).
 */
const NOTA_FIRMADA = 'f0080001-0000-4000-8000-000000000002';

test('T-040 · el diálogo de la copia se maneja con el teclado y devuelve el foco a «Descargar copia»', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/login');
  await page.getByLabel('Correo').fill('ana@psicogestion.test');
  await page.getByLabel('Contraseña').fill('psico1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/pacientes');

  await page.goto(`/pacientes/${PACIENTE}/historia/notas?nota=${NOTA_FIRMADA}`);
  await page.getByRole('button', { name: 'Abrir el editor' }).click();
  const campoPin = page.getByLabel('PIN');
  const boton = page.getByRole('button', { name: 'Descargar copia' });
  await expect(campoPin.or(boton)).toBeVisible();
  if (await campoPin.isVisible()) {
    await campoPin.fill('123456');
    await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  }
  await expect(boton).toBeVisible();

  await boton.focus();
  await page.keyboard.press('Enter');
  const dialogo = page.getByRole('dialog', { name: 'Descargar una copia cifrada' });
  await expect(dialogo).toBeVisible();
  const dentro = () => dialogo.evaluate((d) => d.contains(document.activeElement));
  expect(await dentro(), 'al abrir, el foco no entra en el diálogo').toBe(true);

  // Una vuelta entera hacia delante y otra hacia atrás: el foco no sale nunca.
  const enfocables = await dialogo.evaluate(
    (d) => d.querySelectorAll('button:not([disabled]), input:not([disabled]), select, textarea, [href]').length,
  );
  for (let i = 0; i <= enfocables; i++) {
    await page.keyboard.press('Tab');
    expect(await dentro(), `Tab ${i + 1}: el foco salió del diálogo`).toBe(true);
  }
  for (let i = 0; i <= enfocables; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await dentro(), `Mayús+Tab ${i + 1}: el foco salió del diálogo`).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(boton).toBeFocused();
});
