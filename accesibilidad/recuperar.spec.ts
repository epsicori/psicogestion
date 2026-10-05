import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { expect, test, type Browser } from '@playwright/test';

import { contenedorDelProyecto } from '../lib/cuentas/contenedor-proyecto';
import { ejecutarSql } from '../scripts/psql.mjs';

/**
 * T-042 · El canje de un código de recuperación a través de la Server Action real, contra
 * GoTrue y la base reales: el paso uno (`comprobar_codigo_recuperacion`) y el paso dos
 * (`canjear_codigo_recuperacion()`) como los llama `lib/cuentas/totp.ts`, no a mano.
 *
 * - Caso A, código bueno: `/primera-vez`, ningún factor TOTP, el código con `usado_en` y una
 *   fila `TOTP_REPUESTO`.
 * - Caso B, código malo: «Ese código no es válido.» y la centinela del lote con
 *   `intentos_fallidos = 1` (el paso uno confirma el intento por la vía real).
 *
 * USUARIO PROPIO, nuevo en cada caso. Requisitos: `npx supabase db reset`, `npm run seed`
 * (el técnico exige un centro) y Docker. Se ejecuta con `--workers=1`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTRASENA = `Cl-T042-${randomUUID()}`;
const CODIGO_BUENO = 'T042-RECUPERA-UNO';
const CODIGO_OTRO = 'T042-RECUPERA-DOS';
const CODIGO_MALO = 'T042-NO-EXISTE';

function consultar(contenedor: string, sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', contenedor, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

function entornoDeSupabase(): { api: string; clave: string } {
  const salida = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', shell: true });
  const api = /^API_URL="([^"]+)"/m.exec(salida)?.[1];
  const clave = /^SERVICE_ROLE_KEY="([^"]+)"/m.exec(salida)?.[1];
  if (!api || !clave) throw new Error('`supabase status -o env` no devuelve API_URL y SERVICE_ROLE_KEY.');
  return { api, clave };
}

/** Usuario con un factor TOTP verificado (el que se «perdió») y dos códigos de recuperación. */
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
  '${correo}', extensions.crypt('relleno-que-se-sustituye', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('rol', 'tecnico_administrativo', 'nombre_completo', 'Prueba T-042 (Playwright)', 'centro_id', (select id::text from public.centros order by nombre limit 1)),
  '', '', '', ''
);
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
values (gen_random_uuid(), '${id}', 'email', '${id}', jsonb_build_object('sub', '${id}', 'email', '${correo}'), now(), now());
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret, last_challenged_at)
values (gen_random_uuid(), '${id}', 't042-recuperar', 'totp', 'verified', now(), now(), 'SECRETODEPRUEBA', clock_timestamp());
insert into public.codigos_recuperacion_totp (perfil_id, codigo_hash)
values ('${id}', extensions.crypt('${CODIGO_BUENO}', extensions.gen_salt('bf', 4))),
       ('${id}', extensions.crypt('${CODIGO_OTRO}', extensions.gen_salt('bf', 4)));
commit;
`;
  expect(ejecutarSql(contenedor, guion)).toBe(0);
}

async function fijarContrasenaPorGoTrue(id: string): Promise<void> {
  const { api, clave } = entornoDeSupabase();
  const respuesta = await fetch(`${api}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: { apikey: clave, Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: CONTRASENA }),
  });
  expect(respuesta.status, 'la Admin API de GoTrue no aceptó la contraseña').toBe(200);
}

/** Entra con la contraseña (sesión `aal1`: el factor existe y no se supera) y abre `/recuperar`. */
async function abrirRecuperar(browser: Browser, correo: string) {
  const contexto = await browser.newContext();
  const pagina = await contexto.newPage();
  await pagina.goto('/login');
  await pagina.getByLabel('Correo').fill(correo);
  await pagina.getByLabel('Contraseña').fill(CONTRASENA);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await pagina.waitForURL((url) => !url.pathname.startsWith('/login'));
  await pagina.goto('/recuperar');
  await expect(pagina.getByLabel('Código de recuperación')).toBeVisible();
  return { contexto, pagina };
}

async function prepararUsuario(): Promise<{ contenedor: string; id: string; correo: string }> {
  const contenedor = contenedorDelProyecto();
  const id = randomUUID();
  const correo = `t042-${id}@psicogestion.test`;
  crearUsuario(contenedor, id, correo);
  await fijarContrasenaPorGoTrue(id);
  return { contenedor, id, correo };
}

test('canje con un código bueno (T-042, caso A)', async ({ browser }) => {
  test.setTimeout(120_000);
  const { contenedor, id, correo } = await prepararUsuario();
  const { contexto, pagina } = await abrirRecuperar(browser, correo);

  await pagina.getByLabel('Código de recuperación').fill(CODIGO_BUENO);
  await pagina.getByRole('button', { name: 'Usar el código' }).click();

  await expect(pagina).toHaveURL(/\/primera-vez/);
  expect(consultar(contenedor, `select count(*) from auth.mfa_factors where user_id = '${id}'`)).toBe('0');
  expect(
    consultar(
      contenedor,
      `select count(*) from public.codigos_recuperacion_totp where perfil_id = '${id}' and usado_en is not null`,
    ),
  ).toBe('1');
  expect(
    consultar(
      contenedor,
      `select count(*) from public.auditoria where actor_id = '${id}' and operacion = 'TOTP_REPUESTO'`,
    ),
  ).toBe('1');

  await contexto.close();
});

test('canje con un código malo (T-042, caso B)', async ({ browser }) => {
  test.setTimeout(120_000);
  const { contenedor, id, correo } = await prepararUsuario();
  const { contexto, pagina } = await abrirRecuperar(browser, correo);

  await pagina.getByLabel('Código de recuperación').fill(CODIGO_MALO);
  await pagina.getByRole('button', { name: 'Usar el código' }).click();

  await expect(pagina.getByRole('status').filter({ hasText: 'Ese código no es válido.' })).toBeVisible();
  // La centinela es el código vigente más reciente del lote: ahí cuenta el paso uno.
  expect(
    consultar(
      contenedor,
      `select intentos_fallidos from public.codigos_recuperacion_totp
        where perfil_id = '${id}' and usado_en is null order by creado_en desc, id desc limit 1`,
    ),
  ).toBe('1');
  expect(consultar(contenedor, `select count(*) from auth.mfa_factors where user_id = '${id}'`)).toBe('1');

  await contexto.close();
});

test('se llega a /recuperar por el enlace (T-044)', async ({ browser }) => {
  test.setTimeout(120_000);
  const { correo } = await prepararUsuario();
  const contexto = await browser.newContext();
  const pagina = await contexto.newPage();
  await pagina.goto('/login');
  await pagina.getByLabel('Correo').fill(correo);
  await pagina.getByLabel('Contraseña').fill(CONTRASENA);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await expect(pagina).toHaveURL(/\/primera-vez/);

  await pagina
    .getByRole('link', { name: '¿Has perdido el acceso a tu aplicación? Usa un código de recuperación' })
    .click();
  await expect(pagina).toHaveURL(/\/recuperar/);
  await expect(pagina.getByLabel('Código de recuperación')).toBeVisible();

  await pagina.getByRole('link', { name: 'Volver a la verificación en dos pasos' }).click();
  await expect(pagina).toHaveURL(/\/primera-vez/);

  await contexto.close();
});
