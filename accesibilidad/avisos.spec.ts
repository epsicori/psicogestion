import { expect, test } from '@playwright/test';

import { contenedorDelProyecto } from '../lib/cuentas/contenedor-proyecto';
import { ejecutarSql } from '../scripts/psql.mjs';

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

// B-H6 · Con contenido de verdad: una sesión de Ana en curso, para medir la franja pintada.
// Se hace como postgres (el corredor, sin pasar por la página): si Ana ya tiene una sesión que
// abarca ahora, se usa; si no, se inserta una de 10 min y al acabar se CANCELA (nunca se borra).
const MARCA_CITA = 'T-015 spec avisos';

function sql(guion: string): void {
  expect(ejecutarSql(contenedorDelProyecto(), guion)).toBe(0);
}

test.describe('con una sesión en curso', () => {
  test.beforeAll(() => {
    sql(`
do $$
declare
  v_pro uuid;
  v_ref public.citas%rowtype;
begin
  select p.id into v_pro from public.perfiles p join auth.users u on u.id = p.id
   where u.email = 'ana@psicogestion.test';
  if v_pro is null then raise exception 'No existe Ana: falta la siembra'; end if;
  if exists (select 1 from public.citas c
              where c.profesional_id = v_pro and c.estado in ('programada', 'confirmada')
                and c.inicio <= now() and c.fin > now() + interval '5 minutes') then
    return;
  end if;
  select * into v_ref from public.citas c where c.profesional_id = v_pro order by c.inicio desc limit 1;
  if v_ref.id is null then raise exception 'Ana no tiene ninguna cita de la que copiar paciente y centro'; end if;
  begin
    insert into public.citas (paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria, nota_operativa)
    values (v_ref.paciente_id, v_pro, v_ref.centro_id, v_ref.tipo_terapia_id,
            now() - interval '1 minute', now() + interval '10 minutes', v_ref.zona_horaria, '${MARCA_CITA}');
  exception when exclusion_violation then
    -- 23P01 (citas_sin_solape_profesional): Ana ya tiene otra cita que se pisa con la ventana.
    -- Si esa cita está en curso, programada o confirmada, sirve para la franja y se reutiliza;
    -- si es de otro estado (realizada, no asistida...) no hay franja que medir: se dice claro.
    if exists (select 1 from public.citas c
                where c.profesional_id = v_pro and c.estado in ('programada', 'confirmada')
                  and c.inicio <= now() and c.fin > now() + interval '1 minute') then
      return;
    end if;
    raise exception 'Ana tiene una cita que se solapa con ahora y no esta en curso (programada o confirmada): la prueba no puede fabricar una sesion en curso sin tocar datos ajenos';
  end;
end $$;
`);
  });

  test.afterAll(() => {
    // Solo la que insertó esta prueba, y cancelada: lo clínico y lo económico no se borra.
    sql(`update public.citas set estado = 'cancelada' where nota_operativa = '${MARCA_CITA}' and estado <> 'cancelada';`);
  });

  test('la franja a 360 px se ve entera: texto, «Notas» y «Descartar» dentro de la ventana y tocables', async ({
    page,
  }) => {
    await entrar(page);
    await page.goto('/agenda');

    const franja = page.locator('[data-franja-sesion]');
    await expect(franja).toContainText('Sesión en curso');

    for (const nombre of [/^Notas$/, /Descartar/]) {
      const control = franja.getByRole(nombre.source === '^Notas$' ? 'link' : 'button', { name: nombre });
      await expect(control).toBeVisible();
      const caja = (await control.boundingBox())!;
      expect(caja.x, `${nombre} se sale por la izquierda`).toBeGreaterThanOrEqual(0);
      expect(caja.x + caja.width, `${nombre} se sale por la derecha`).toBeLessThanOrEqual(MOVIL.width);
      expect(caja.height, `${nombre} es más bajo que 44 px`).toBeGreaterThanOrEqual(44);
    }

    // El texto de la franja tampoco se sale: el párrafo cabe en la ventana.
    const parrafo = (await franja.locator('p').first().boundingBox())!;
    expect(parrafo.x + parrafo.width, 'el texto de la franja se sale por la derecha').toBeLessThanOrEqual(MOVIL.width);
    // Y el texto cabe dentro del propio párrafo: con `whitespace-nowrap` la caja cabe pero el texto la desborda.
    const sobra = await franja
      .locator('p')
      .first()
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(sobra, 'el texto desborda su párrafo (no parte líneas)').toBeLessThanOrEqual(0);

    const posiciones = await page.evaluate(() => {
      const salida: string[] = [];
      for (const el of document.querySelectorAll('[data-franja-sesion] > div')) {
        for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
          salida.push(getComputedStyle(n).position);
        }
      }
      return salida;
    });
    expect(posiciones.length, 'no hay franja pintada que medir').toBeGreaterThan(0);
    for (const pos of posiciones) expect(['fixed', 'sticky']).not.toContain(pos);

    const desbordamiento = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(desbordamiento, 'la página se sale a lo ancho a 360 px').toBeLessThanOrEqual(0);
  });
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
