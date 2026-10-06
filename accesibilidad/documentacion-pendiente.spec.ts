import { expect, test, type Page } from '@playwright/test';

import { contenedorDelProyecto } from '../lib/cuentas/contenedor-proyecto';
import { ejecutarSql } from '../scripts/psql.mjs';

/**
 * T-048 · Lo que jsdom no puede comprobar de la documentación pendiente: la disposición a 360 px,
 * el objetivo táctil de 44 px, el recorrido con teclado (Tab hasta «Marcar como resuelta», Intro,
 * dónde queda el foco), la navegación sin diálogo y que el término de la búsqueda no llegue a la
 * dirección.
 *
 * Exige la siembra (`npx supabase db reset && npm run seed`), pero **prepara sus propios datos**
 * (nada depende de lo que el seed deje abierto): 21 pacientes «Zzmarca» de Ana, uno con 13
 * pendientes (una nota muy atrasada y 12 informes: así hay «Ver todos») y veinte con uno (así hay
 * dos páginas). La preparación es idempotente (identificadores fijos). Al acabar, las alertas
 * abiertas de la marca se MARCAN como resueltas, nunca se borran (lo clínico no se borra); los
 * pacientes de la marca se quedan hasta el siguiente `db reset`.
 */

const MOVIL = { width: 360, height: 740 };
const MARCA = 'Zzmarca';
const PRIMERO = 'a0480000-0000-4000-8000-000000000000';

// Las pruebas entran con la misma cuenta: el segundo factor local usa un TOTP con instante único
// y dos entradas a la vez chocan. En serie.
test.describe.configure({ mode: 'serial' });

function sql(guion: string): void {
  expect(ejecutarSql(contenedorDelProyecto(), guion)).toBe(0);
}

const PREPARAR = `
do $$
declare
  v_pro uuid;
  v_centro uuid;
  v_pac uuid;
  n integer;
  k integer;
begin
  select p.id into v_pro from public.perfiles p join auth.users u on u.id = p.id
   where u.email = 'ana@psicogestion.test';
  if v_pro is null then raise exception 'No existe Ana: falta la siembra'; end if;
  select centro_id into v_centro from public.pacientes where profesional_id = v_pro and centro_id is not null limit 1;
  for n in 0..20 loop
    v_pac := ('a0480000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
    insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id)
    values (v_pac, '${MARCA}', 'T048 ' || lpad(n::text, 2, '0'), v_pro, v_centro)
    on conflict (id) do nothing;
    if n = 0 then
      for k in 0..12 loop
        insert into public.alertas_documentacion (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id, fecha_referencia)
        select v_pac, v_pro, v_centro,
               (case when k = 0 then 'nota_sin_firmar' else 'informe_pendiente' end)::public.tipo_alerta_documentacion,
               case when k = 0 then 'notas_clinicas' else 'informes' end,
               ('b0480000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid,
               current_date - 1000
        where not exists (select 1 from public.alertas_documentacion a
                           where a.origen_id = ('b0480000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid
                             and a.estado = 'abierta');
      end loop;
    else
      insert into public.alertas_documentacion (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id, fecha_referencia)
      select v_pac, v_pro, v_centro, 'informe_pendiente', 'informes',
             ('b0480000-0000-4000-8000-' || lpad((100 + n)::text, 12, '0'))::uuid, current_date - 5
      where not exists (select 1 from public.alertas_documentacion a
                         where a.origen_id = ('b0480000-0000-4000-8000-' || lpad((100 + n)::text, 12, '0'))::uuid
                           and a.estado = 'abierta');
    end if;
  end loop;
  -- El nivel sale de referencia_en: con la de la nota, muy antigua, el paciente es «muy atrasado»
  -- y primero en el orden de urgencia (la fija el disparador al insertar; aquí se corrige como postgres).
  update public.alertas_documentacion set referencia_en = now() - interval '1000 days'
   where origen_id = 'b0480000-0000-4000-8000-000000000000' and estado = 'abierta';
end $$;
`;

// Se cierran las abiertas de la marca (nunca se borra): resuelta + resuelta_en, como exige el CHECK.
const LIMPIAR = `
update public.alertas_documentacion
   set estado = 'resuelta', resuelta_en = now()
 where estado = 'abierta' and origen_id::text like 'b0480000-0000-4000-8000-%';
`;

test.beforeAll(() => sql(PREPARAR));
test.afterAll(() => sql(LIMPIAR));

async function entrar(page: Page) {
  await page.setViewportSize(MOVIL);
  await page.goto('/login');
  await page.getByLabel('Correo').fill('ana@psicogestion.test');
  await page.getByLabel('Contraseña').fill('psico1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/pacientes');
}

async function desbordamiento(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function mide44(locator: ReturnType<Page['locator']>, que: string) {
  const c = (await locator.boundingBox())!;
  expect(c, `${que} no tiene caja`).not.toBeNull();
  expect(c.height, `${que} es más bajo que 44 px`).toBeGreaterThanOrEqual(44);
  expect(c.width, `${que} es más estrecho que 44 px`).toBeGreaterThanOrEqual(44);
  expect(c.x + c.width, `${que} se sale por la derecha`).toBeLessThanOrEqual(MOVIL.width);
}

test('el panel de /agenda: desplegable con teclado, Tab hasta «Marcar como resuelta», Intro y el foco', async ({
  page,
}) => {
  await entrar(page);
  await page.goto('/agenda');

  const panel = page.locator('section[aria-labelledby="agenda-documentacion"]');
  await expect(panel.getByRole('heading', { name: 'Documentación pendiente' })).toBeVisible();

  // El paciente de la marca con 13 pendientes es el primero (nivel 3, el más antiguo).
  const enlacePaciente = panel.locator(`#panel-paciente-${PRIMERO}`);
  const boton = panel.locator(`button[aria-controls="panel-pendientes-${PRIMERO}"]`);
  await expect(enlacePaciente).toBeVisible();
  await expect(boton).toBeVisible();
  await expect(boton).toHaveAttribute('aria-expanded', 'false');
  const caja = (await boton.boundingBox())!;
  expect(caja.height, 'el desplegable es más bajo que 44 px').toBeGreaterThanOrEqual(44);
  expect(caja.x + caja.width, 'el desplegable se sale por la derecha').toBeLessThanOrEqual(MOVIL.width);

  const lista = page.locator(`#${await boton.getAttribute('aria-controls')}`);
  await expect(lista).toBeHidden();

  await boton.focus();
  await page.keyboard.press('Enter');
  await expect(boton).toHaveAttribute('aria-expanded', 'true');
  await expect(lista).toBeVisible();
  await expect(boton).toBeFocused();

  for (const enlace of await lista.getByRole('link').all()) {
    const c = (await enlace.boundingBox())!;
    expect(c.height, 'un enlace de pendiente es más bajo que 44 px').toBeGreaterThanOrEqual(44);
    expect(c.x + c.width, 'un enlace se sale por la derecha').toBeLessThanOrEqual(MOVIL.width);
  }
  // «Ver todos (13)»: solo sale con más de diez pendientes.
  await mide44(lista.getByRole('link', { name: /^Ver todos \(13\)$/ }), '«Ver todos» del paciente');

  const resolver = lista.getByRole('button', { name: /Marcar como resuelta/ }).first();
  await mide44(resolver, '«Marcar como resuelta»');

  // Recorrido con teclado: Tab desde el desplegable hasta el primer «Marcar como resuelta».
  let llegado = false;
  for (let i = 0; i < 20 && !llegado; i++) {
    await page.keyboard.press('Tab');
    llegado = await page.evaluate(
      () => (document.activeElement?.getAttribute('aria-label') ?? '').startsWith('Marcar como resuelta'),
    );
  }
  expect(llegado, 'Tab no llegó a «Marcar como resuelta»').toBe(true);

  await page.keyboard.press('Enter');

  // El paciente sigue (le quedan 11 informes y la nota): el foco va a su enlace y se anuncia.
  await expect(panel.locator('[data-estado-bloque]')).toContainText('Marcada como resuelta.');
  await expect(enlacePaciente).toBeFocused();
  await expect(boton).toContainText('12 pendientes');

  expect(await desbordamiento(page), 'la agenda se sale a lo ancho a 360 px').toBeLessThanOrEqual(0);
});

test('/agenda → «Ver todos» → la página, sin diálogo de por medio y con objetivos de 44 px', async ({ page }) => {
  await entrar(page);
  await page.goto('/agenda');

  const pie = page.locator('section[aria-labelledby="agenda-documentacion"]').getByRole('link', { name: /^Ver todos: / });
  await expect(pie).toBeVisible();
  await mide44(pie, '«Ver todos» del panel');

  await pie.click();
  await page.waitForURL('**/agenda/documentacion');
  await expect(page.getByRole('heading', { name: 'Documentación pendiente', level: 2 })).toBeVisible();
  await expect(page.getByLabel('Buscar por nombre o apellidos')).toBeVisible();
  await expect(page.getByRole('dialog'), 'la navegación abrió un diálogo').toHaveCount(0);
  expect(await desbordamiento(page), 'la página se sale a lo ancho a 360 px').toBeLessThanOrEqual(0);

  // Filtros, «Buscar» y paginación: tocables.
  const filtros = page.getByRole('group').getByRole('link');
  expect(await filtros.count()).toBeGreaterThan(1);
  for (const enlace of await filtros.all()) await mide44(enlace, 'un filtro');
  await mide44(page.getByRole('button', { name: 'Buscar' }), '«Buscar»');
  await expect(page.getByLabel('Buscar por nombre o apellidos')).toBeVisible();
  expect(
    ((await page.getByLabel('Buscar por nombre o apellidos').boundingBox())!).height,
    'el campo de búsqueda es más bajo que 44 px',
  ).toBeGreaterThanOrEqual(44);

  const paginacion = page.getByRole('navigation', { name: 'Páginas de pendientes' });
  await expect(paginacion).toBeVisible();
  for (const enlace of await paginacion.getByRole('link').all()) await mide44(enlace, 'un enlace de la paginación');
});

test('el término de la búsqueda no llega a la dirección ni al historial, y cambiar de página lo descarta', async ({
  page,
}) => {
  await entrar(page);
  await page.goto('/agenda/documentacion');

  const antes = page.url();
  const historial = await page.evaluate(() => window.history.length);

  const campo = page.getByLabel('Buscar por nombre o apellidos');
  await campo.fill('zzmarca');
  await page.getByRole('button', { name: 'Buscar' }).click();

  const estado = page.locator('[data-estado-busqueda]');
  await expect(estado).toHaveText('21 pacientes coinciden');
  expect(page.url(), 'la búsqueda cambió la dirección').toBe(antes);
  expect(page.url().toLowerCase()).not.toContain('zzmarca');
  expect(await page.evaluate(() => window.history.length), 'la búsqueda añadió una entrada al historial').toBe(historial);
  await expect(page.getByText(/Hay 21 pacientes que coinciden; se muestran los 20 más urgentes/)).toBeVisible();

  await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  await expect(campo).toHaveValue('');
  await expect(campo).toBeFocused();

  // Con una búsqueda abierta, cambiar de filtro (navegación del cliente, sin recargar) la descarta:
  // lo promete la ayuda del campo.
  await campo.fill('zzmarca');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(estado).toHaveText('21 pacientes coinciden');
  await page.getByRole('group').getByRole('link', { name: /Muy atrasada/ }).click();
  await page.waitForURL('**/agenda/documentacion?*nivel=3*');
  await expect(page.getByLabel('Buscar por nombre o apellidos')).toHaveValue('');
  await expect(page.locator('[data-estado-busqueda]')).toHaveText('');
  expect(await desbordamiento(page)).toBeLessThanOrEqual(0);
});

test('con ?paciente: sin buscador, todos los pendientes y el enlace para quitar el filtro', async ({ page }) => {
  await entrar(page);
  await page.goto(`/agenda/documentacion?paciente=${PRIMERO}`);
  await expect(page.getByRole('link', { name: 'Quitar el filtro de paciente' })).toBeVisible();
  await expect(page.getByLabel('Buscar por nombre o apellidos')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /pendientes/ })).toHaveCount(0);
  expect(await desbordamiento(page)).toBeLessThanOrEqual(0);
});
