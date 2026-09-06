import { expect, test } from '@playwright/test';

/**
 * T-009·B · Lo que jsdom no puede comprobar.
 *
 * Cada prueba de este fichero existe porque el banco de Vitest **no puede** hacerla, no
 * porque sea más cómodo hacerla aquí. Si algo se puede comprobar en jsdom, se comprueba
 * allí: es treinta veces más rápido.
 */

const MOVIL = { width: 360, height: 740 };

test.describe('/login', () => {
  test('a 360 px no hay desbordamiento horizontal', async ({ page }) => {
    // La deuda que arrastran los tres cortes de T-007: 360 px NUNCA se había comprobado.
    // jsdom no tiene disposición, así que no sabe cuánto mide nada.
    await page.setViewportSize(MOVIL);
    await page.goto('/login');

    const desbordamiento = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(desbordamiento, 'la página se sale a lo ancho en un móvil de 360 px').toBeLessThanOrEqual(0);
  });

  test('a 360 px los dos campos y el botón caben enteros dentro de la ventana', async ({ page }) => {
    // Que no haya barra horizontal no basta: un control puede quedar cortado por
    // `overflow: hidden` y la página seguiría midiendo 360.
    await page.setViewportSize(MOVIL);
    await page.goto('/login');

    for (const nombre of ['Correo', 'Contraseña']) {
      const caja = await page.getByLabel(nombre).boundingBox();
      expect(caja, `no se encuentra el campo ${nombre}`).not.toBeNull();
      expect(caja!.x).toBeGreaterThanOrEqual(0);
      expect(caja!.x + caja!.width, `el campo ${nombre} se sale por la derecha`).toBeLessThanOrEqual(MOVIL.width);
    }

    const boton = await page.getByRole('button', { name: 'Entrar' }).boundingBox();
    expect(boton!.x + boton!.width).toBeLessThanOrEqual(MOVIL.width);
  });

  test('los dos campos tienen nombre accesible atado a su control', async ({ page }) => {
    await page.goto('/login');
    // getByLabel falla si la etiqueta no está asociada: es la comprobación, no el atajo.
    await expect(page.getByLabel('Correo')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
  });

  test('se recorre entero con el teclado y el foco SE VE', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');

    // El primer tabulador puede caer en algo del navegador; se busca el campo dando
    // tabuladores, con tope, en vez de suponer el orden.
    let intentos = 0;
    while (intentos < 10 && (await page.evaluate(() => document.activeElement?.id)) !== 'correo') {
      await page.keyboard.press('Tab');
      intentos++;
    }
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('correo');

    // Foco visible: el anillo tiene que pintarse. Sin esto, «se llega con el teclado»
    // no sirve de nada porque no se sabe dónde se está.
    const anillo = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const estilo = getComputedStyle(el);
      return {
        anchoContorno: parseFloat(estilo.outlineWidth) || 0,
        estiloContorno: estilo.outlineStyle,
        sombra: estilo.boxShadow,
      };
    });
    const seVe =
      (anillo.anchoContorno > 0 && anillo.estiloContorno !== 'none') ||
      (anillo.sombra !== 'none' && anillo.sombra !== '');
    expect(seVe, `el campo enfocado no pinta ningún indicador de foco: ${JSON.stringify(anillo)}`).toBe(true);

    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('contrasena');
  });

  test('con prefers-reduced-motion no queda ninguna animación en marcha', async ({ browser }) => {
    // La otra mitad de la deuda de T-007. jsdom no evalúa consultas de medios, así que
    // `motion-reduce:animate-none` nunca se había comprobado de verdad.
    const contexto = await browser.newContext({ reducedMotion: 'reduce' });
    const pagina = await contexto.newPage();
    await pagina.goto('/login');

    const enMarcha = await pagina.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === 'running').length,
    );
    expect(enMarcha, 'con prefers-reduced-motion no debería quedar ninguna animación corriendo').toBe(0);

    await contexto.close();
  });
});

test.describe('/pacientes con sesión', () => {
  test('a 360 px la lista y el alta caben, y el cajón se abre con el teclado', async ({ page }) => {
    // Exige la siembra: `npx supabase db reset && npm run seed`. Las credenciales están en
    // docs/state.md §Siembra de desarrollo, y no son secretas a propósito.
    await page.setViewportSize(MOVIL);
    await page.goto('/login');

    await page.getByLabel('Correo').fill('ana@psicogestion.test');
    await page.getByLabel('Contraseña').fill('psico1234');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await page.waitForURL('**/pacientes');

    const desbordamiento = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(desbordamiento, '/pacientes se sale a lo ancho a 360 px').toBeLessThanOrEqual(0);

    // El botón del cajón solo existe por debajo de `lg`, que es justo el caso que jsdom
    // no puede distinguir.
    const abrir = page.getByRole('button', { name: 'Abrir menú' });
    await expect(abrir).toBeVisible();
    await abrir.focus();
    await page.keyboard.press('Enter');

    // Que el cajón se ABRE se comprueba con el cajón, no con lo que hay dentro. La
    // primera versión de esta prueba afirmaba que la navegación era visible, y eso ata
    // dos cosas distintas: una vez falló con «navigation not found» cuando lo que había
    // pasado era que el perfil no se había podido leer y `modulosDe(null)` devolvía lista
    // vacía —el fallo cerrado funcionando—. El mensaje señalaba al cajón y la causa
    // estaba a tres capas de distancia.
    const cajon = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(cajon).toBeAttached();
    const caja = await cajon.boundingBox();
    expect(caja, 'la navegación no tiene caja: el cajón no llegó a abrirse').not.toBeNull();
    expect(caja!.x, 'el cajón sigue fuera de la pantalla: no se abrió').toBeGreaterThanOrEqual(0);
  });

  test('la barra lateral enseña el perfil de verdad, no el correo de repuesto', async ({ page }) => {
    // Prueba aparte, y con nombre propio, por lo de arriba: si el perfil no se puede leer,
    // el armazón cae a `usuario.email` y a «Perfil sin asignar» —degradación deliberada,
    // no un fallo— y la navegación sale vacía por fallo cerrado. Cuando eso pase, que lo
    // diga ESTA prueba y con estas palabras, en vez de disfrazarse de otro problema.
    await page.goto('/login');
    await page.getByLabel('Correo').fill('ana@psicogestion.test');
    await page.getByLabel('Contraseña').fill('psico1234');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL('**/pacientes');

    await expect(
      page.getByText('Perfil sin asignar'),
      'el armazón cayó al perfil de repuesto: la consulta de perfiles no devolvió nada',
    ).toHaveCount(0);

    await expect(page.getByText('Ana Márquez')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pacientes' })).toBeVisible();
  });
});
