import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { expect, test, type Browser } from '@playwright/test';

import { codigoTotp } from '../lib/cuentas/codigo-totp';
import { contenedorDelProyecto } from '../lib/cuentas/contenedor-proyecto';
import { ejecutarSql } from '../scripts/psql.mjs';

/**
 * T-037 · CA2 contra GoTrue y la base reales, lo que jsdom no puede: una entrada posterior
 * con TOTP no regenera los códigos de recuperación (ADR-039). Se activa el factor de un
 * usuario, se toma una instantánea del lote por consulta a la base, se vuelve a entrar con
 * TOTP en una sesión nueva y se exige que la instantánea sea idéntica.
 *
 * USUARIO PROPIO, nuevo en cada ejecución (D11): con `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo`
 * un usuario sembrado nunca monta `SegundoFactor` y la prueba saldría verde sin el arreglo;
 * y tocar a uno sembrado crea dependencia de orden con los demás specs. El usuario es inerte
 * (sin centro, sin pacientes, sin PIN) y el siguiente `npx supabase db reset` lo quita.
 *
 * El lote se lee por `docker exec … psql -U postgres` desde el proceso del corredor, nunca
 * desde la página y sin ninguna clave (D12): la tabla tiene `revoke all` también a
 * `service_role`, así que ni la clave de servicio serviría.
 *
 * Requisitos: `npx supabase db reset` (migraciones) y Docker. No necesita `npm run seed` ni
 * `SEGUNDO_FACTOR_AUTOMATICO_LOCAL`, y funciona con o sin ella.
 */

const CONTRASENA = 'psico1234';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const TITULO_TOTP = 'Verificación en dos pasos';
const TITULO_CODIGOS = 'Tus códigos de recuperación';
const TITULO_PIN = 'Tu PIN de historia';
const TEXTO_ENTRAR = 'Escribe el número de seis dígitos que te dé tu aplicación de autenticación.';
const ETIQUETA_CLAVE = 'Clave, por si no puedes escanear';

function consultar(contenedor: string, sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', contenedor, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

function crearUsuario(contenedor: string, id: string, correo: string): void {
  if (!UUID.test(id)) throw new Error('crearUsuario: el id no es un UUID.');
  const guion = `
begin;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated',
  '${correo}', extensions.crypt('${CONTRASENA}', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('rol', 'profesional_sanitario', 'nombre_completo', 'Prueba T-037 (Playwright)'),
  '', '', '', ''
);
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
values (
  gen_random_uuid(), '${id}', 'email', '${id}',
  jsonb_build_object('sub', '${id}', 'email', '${correo}'), now(), now()
);
commit;
`;
  expect(ejecutarSql(contenedor, guion)).toBe(0);
}

type Lote = { vigentes: number; total: number; ids: string; ultimo: string; factores: number };

function leerLote(contenedor: string, perfilId: string): Lote {
  if (!UUID.test(perfilId)) throw new Error('leerLote: el id no es un UUID.');
  const salida = consultar(
    contenedor,
    `select
       (select count(*) from public.codigos_recuperacion_totp where perfil_id = '${perfilId}' and usado_en is null),
       (select count(*) from public.codigos_recuperacion_totp where perfil_id = '${perfilId}'),
       (select coalesce(string_agg(id::text, ',' order by id), '') from public.codigos_recuperacion_totp where perfil_id = '${perfilId}' and usado_en is null),
       (select coalesce(max(creado_en)::text, '') from public.codigos_recuperacion_totp where perfil_id = '${perfilId}'),
       (select count(*) from auth.mfa_factors where user_id = '${perfilId}')`,
  );
  const campos = salida.split('|');
  if (campos.length !== 5) throw new Error(`leerLote: salida inesperada «${salida}».`);
  return {
    vigentes: Number(campos[0]),
    total: Number(campos[1]),
    ids: campos[2],
    ultimo: campos[3],
    factores: Number(campos[4]),
  };
}

/** Un código de un paso de 30 s posterior a `pasoUsado` y con al menos 5 s de ventana (D16). */
async function codigoFresco(
  secreto: string,
  pasoUsado: number | null,
): Promise<{ codigo: string; paso: number }> {
  for (;;) {
    const ahora = Date.now();
    const paso = Math.floor(ahora / 30_000);
    const restante = 30_000 - (ahora % 30_000);
    if (restante < 5_000 || (pasoUsado !== null && paso <= pasoUsado)) {
      await new Promise((resolver) => setTimeout(resolver, restante + 250));
      continue;
    }
    return { codigo: codigoTotp(secreto, ahora), paso };
  }
}

async function entrar(browser: Browser, correo: string) {
  const contexto = await browser.newContext();
  const pagina = await contexto.newPage();
  await pagina.goto('/login');
  await pagina.getByLabel('Correo').fill(correo);
  await pagina.getByLabel('Contraseña').fill(CONTRASENA);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  // No `waitForURL`: la redirección del proxy a /primera-vez llega en una navegación suave
  // y la URL puede quedarse en /pacientes; lo que cuenta es la pantalla que se pinta.
  await expect(pagina.getByRole('heading', { name: TITULO_TOTP })).toBeVisible();
  return { contexto, pagina };
}

test('una segunda entrada con TOTP no cambia el lote de códigos de recuperación (T-037)', async ({
  browser,
}) => {
  test.setTimeout(120_000);

  let contenedor = '';
  let id = '';
  let correo = '';
  let secreto = '';
  let paso1 = 0;
  let L1!: Lote;

  await test.step('S0 · Usuario propio', async () => {
    contenedor = contenedorDelProyecto();
    id = randomUUID();
    correo = `t037-${id}@psicogestion.test`;
    crearUsuario(contenedor, id, correo);
  });

  await test.step('S1 · Activar', async () => {
    const { contexto, pagina } = await entrar(browser, correo);
    const campoClave = pagina.getByLabel(ETIQUETA_CLAVE);
    await expect(campoClave).toBeVisible();
    secreto = await campoClave.inputValue();
    expect(secreto).toMatch(/^[A-Z2-7]+=*$/);

    const fresco = await codigoFresco(secreto, null);
    paso1 = fresco.paso;
    await pagina.getByLabel('Código de seis dígitos').fill(fresco.codigo);
    await pagina.getByRole('button', { name: 'Verificar' }).click();

    await test.step('S2 · Se enseñan', async () => {
      await expect(pagina.getByRole('heading', { name: TITULO_CODIGOS })).toBeVisible();
      const codigos = await pagina.getByRole('list').getByRole('listitem').allTextContents();
      expect(codigos).toHaveLength(10);
      for (const codigo of codigos) expect(codigo).toMatch(/^[0-9A-F]{10}$/);
      expect(new Set(codigos).size).toBe(10);
    });

    await test.step('S3 · L1', async () => {
      L1 = leerLote(contenedor, id);
      expect(L1).toMatchObject({ vigentes: 10, total: 10, factores: 1 });
    });

    await test.step('S4 · Una sola vez', async () => {
      await pagina.getByRole('button', { name: 'Ya los he guardado' }).click();
      await expect(pagina.getByRole('heading', { name: TITULO_PIN })).toBeVisible();
      await pagina.goto('/primera-vez');
      await expect(pagina.getByRole('heading', { name: TITULO_PIN })).toBeVisible();
      await expect(pagina.getByRole('heading', { name: TITULO_CODIGOS })).toHaveCount(0);
    });

    await contexto.close();
  });

  await test.step('S5-S8 · Entrar otra vez', async () => {
    const { contexto, pagina } = await entrar(browser, correo);
    await expect(pagina.getByText(TEXTO_ENTRAR)).toBeVisible();
    await expect(pagina.getByLabel(ETIQUETA_CLAVE)).toHaveCount(0);

    const { codigo } = await codigoFresco(secreto, paso1);
    await pagina.getByLabel('Código de seis dígitos').fill(codigo);
    await pagina.getByRole('button', { name: 'Verificar' }).click();

    // S6 · Antes del arreglo aparece la pantalla de códigos; después, el PIN. Se espera a
    // cualquiera de las dos para que el rojo llegue a S7 y no agote el tiempo.
    await expect(
      pagina
        .getByRole('heading', { name: TITULO_CODIGOS })
        .or(pagina.getByRole('heading', { name: TITULO_PIN })),
    ).toBeVisible();

    // S7 · L2 = L1
    const L2 = leerLote(contenedor, id);
    expect(
      L2,
      'una entrada con un factor ya activo ha cambiado el lote de códigos de recuperación de la base (ADR-039, T-037)',
    ).toEqual(L1);

    // S8 · Lo que se ve
    await expect(pagina.getByRole('heading', { name: TITULO_CODIGOS })).toHaveCount(0);
    await expect(pagina.getByRole('heading', { name: TITULO_PIN })).toBeVisible();
    await contexto.close();
  });
});
