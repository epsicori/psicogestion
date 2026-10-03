import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { expect, test, type Browser } from '@playwright/test';

import { codigoTotp } from '../lib/cuentas/codigo-totp';
import { contenedorDelProyecto } from '../lib/cuentas/contenedor-proyecto';
import { ejecutarSql } from '../scripts/psql.mjs';

/**
 * T-038 · CA8 y CA13 contra GoTrue y la base reales: regenerar los códigos de recuperación
 * desde «Mi cuenta». Recorrido completo con un técnico administrativo (sin PIN, sin
 * pacientes: el único rol al que la pantalla no le pide nada más), el que demuestra que la
 * pantalla vale para los tres roles.
 *
 * Lo que mide y jsdom no puede:
 * - el hash de la contraseña lo genera GoTrue (Admin API), no pgcrypto: la comparación de la
 *   base tiene que valer contra el hash real;
 * - la sesión no se toca: mismas filas en `auth.sessions` y `aal2`;
 * - la contraseña no aparece en los registros de la base, de PostgREST ni de Kong, ni en
 *   `pg_stat_statements`;
 * - ninguna navegación pasa por `/primera-vez`;
 * - una contraseña errónea no cambia el lote y devuelve el foco al campo.
 *
 * USUARIO PROPIO, nuevo en cada ejecución, como en `codigos-recuperacion.spec.ts`.
 * Requisitos: `npx supabase db reset`, `npm run seed` (el técnico exige un centro) y Docker.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTRASENA = `Cl-T038-${randomUUID()}`;
const CONTRASENA_ERRONEA = `Mal-T038-${randomUUID()}`;

const TITULO_TOTP = 'Verificación en dos pasos';
const TITULO_CODIGOS = 'Tus códigos de recuperación';
const TITULO_NUEVOS = 'Tus códigos de recuperación nuevos';
const ETIQUETA_CLAVE = 'Clave, por si no puedes escanear';

function consultar(contenedor: string, sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', contenedor, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

function entornoDeSupabase(): { api: string; clave: string } {
  const salida = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    shell: true,
  });
  const api = /^API_URL="([^"]+)"/m.exec(salida)?.[1];
  const clave = /^SERVICE_ROLE_KEY="([^"]+)"/m.exec(salida)?.[1];
  if (!api || !clave) throw new Error('`supabase status -o env` no devuelve API_URL y SERVICE_ROLE_KEY.');
  return { api, clave };
}

function crearUsuario(contenedor: string, id: string, correo: string): void {
  if (!UUID.test(id)) throw new Error('crearUsuario: el id no es un UUID.');
  // La contraseña de este insert es un relleno: se sustituye por la Admin API a continuación.
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
  jsonb_build_object('rol', 'tecnico_administrativo', 'nombre_completo', 'Prueba T-038 (Playwright)', 'centro_id', (select id::text from public.centros order by nombre limit 1)),
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

async function fijarContrasenaPorGoTrue(id: string): Promise<void> {
  const { api, clave } = entornoDeSupabase();
  const respuesta = await fetch(`${api}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: { apikey: clave, Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: CONTRASENA }),
  });
  expect(respuesta.status, 'la Admin API de GoTrue no aceptó la contraseña').toBe(200);
}

type Lote = { vigentes: number; total: number; ids: string };

function leerLote(contenedor: string, perfilId: string): Lote {
  if (!UUID.test(perfilId)) throw new Error('leerLote: el id no es un UUID.');
  const salida = consultar(
    contenedor,
    `select
       (select count(*) from public.codigos_recuperacion_totp where perfil_id = '${perfilId}' and usado_en is null),
       (select count(*) from public.codigos_recuperacion_totp where perfil_id = '${perfilId}'),
       (select coalesce(string_agg(id::text, ',' order by id), '') from public.codigos_recuperacion_totp where perfil_id = '${perfilId}' and usado_en is null)`,
  );
  const campos = salida.split('|');
  if (campos.length !== 3) throw new Error(`leerLote: salida inesperada «${salida}».`);
  return { vigentes: Number(campos[0]), total: Number(campos[1]), ids: campos[2] };
}

function leerSesiones(contenedor: string, perfilId: string): { cuenta: number; aal: string } {
  if (!UUID.test(perfilId)) throw new Error('leerSesiones: el id no es un UUID.');
  const salida = consultar(
    contenedor,
    `select count(*), coalesce(max(aal::text), '') from auth.sessions where user_id = '${perfilId}'`,
  );
  const [cuenta, aal] = salida.split('|');
  return { cuenta: Number(cuenta), aal };
}

/** Un código de un paso de 30 s posterior a `pasoUsado` y con al menos 5 s de ventana. */
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
  await expect(pagina.getByRole('heading', { name: TITULO_TOTP })).toBeVisible();
  return { contexto, pagina };
}

function registrosDelServidor(contenedor: string, desde: string): string {
  const proyecto = contenedor.replace(/^supabase_db_/, '');
  let todo = '';
  for (const servicio of ['db', 'rest', 'kong']) {
    const salida = execFileSync(
      'docker',
      ['logs', '--since', desde, `supabase_${servicio}_${proyecto}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    todo += salida;
  }
  return todo;
}

test('regenerar los códigos desde Mi cuenta (T-038, CA8 y CA13)', async ({ browser }) => {
  test.setTimeout(240_000);

  let contenedor = '';
  let id = '';
  let correo = '';
  let secreto = '';
  let pasoUsado = 0;
  let L1!: Lote;

  await test.step('S0 · Usuario propio con la contraseña fijada por GoTrue', async () => {
    contenedor = contenedorDelProyecto();
    id = randomUUID();
    correo = `t038-${id}@psicogestion.test`;
    crearUsuario(contenedor, id, correo);
    await fijarContrasenaPorGoTrue(id);
  });

  const { contexto, pagina } = await entrar(browser, correo);
  const navegaciones: string[] = [];
  pagina.on('framenavigated', (marco) => {
    if (marco === pagina.mainFrame()) navegaciones.push(marco.url());
  });

  await test.step('S1 · Activar el factor y guardar el primer lote', async () => {
    const campoClave = pagina.getByLabel(ETIQUETA_CLAVE);
    await expect(campoClave).toBeVisible();
    secreto = await campoClave.inputValue();
    const fresco = await codigoFresco(secreto, null);
    pasoUsado = fresco.paso;
    await pagina.getByLabel('Código de seis dígitos').fill(fresco.codigo);
    await pagina.getByRole('button', { name: 'Verificar' }).click();
    await expect(pagina.getByRole('heading', { name: TITULO_CODIGOS, exact: true })).toBeVisible();

    L1 = leerLote(contenedor, id);
    expect(L1).toMatchObject({ vigentes: 10, total: 10 });

    await pagina.getByRole('button', { name: 'Ya los he guardado' }).click();
    // El técnico no tiene PIN: tras guardar los códigos entra en la aplicación.
    await expect(pagina.getByRole('link', { name: /^Mi cuenta/ })).toBeVisible();
  });

  await test.step('S2 · Abrir Mi cuenta desde el enlace del bloque de usuario', async () => {
    navegaciones.length = 0;
    await pagina.getByRole('link', { name: /^Mi cuenta/ }).click();
    await expect(pagina.getByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeVisible();
    await expect(pagina.getByLabel('Contraseña')).toBeVisible();
    await expect(pagina.getByLabel('Código de la aplicación')).toBeVisible();
    // El técnico no tiene PIN y no se le pide: solo hay dos campos.
    await expect(pagina.locator('form', { has: pagina.getByRole('button', { name: 'Regenerar códigos' }) }).locator('input')).toHaveCount(2);
  });

  const t0 = new Date().toISOString();
  const sesionesAntes = leerSesiones(contenedor, id);
  const contarAvisos = () =>
    consultar(
      contenedor,
      `select count(*) from public.notificaciones where perfil_id = '${id}' and tipo = 'codigos_regenerados'`,
    );
  // La activación del factor ya dejó un aviso: la regeneración añade exactamente uno más.
  const avisosAntes = Number(contarAvisos());
  expect(avisosAntes).toBe(1);

  await test.step('S3 · Contraseña errónea: error en el campo, foco en él, lote intacto', async () => {
    const fresco = await codigoFresco(secreto, pasoUsado);
    pasoUsado = fresco.paso;
    await pagina.getByLabel('Contraseña').fill(CONTRASENA_ERRONEA);
    await pagina.getByLabel('Código de la aplicación').fill(fresco.codigo);
    await pagina.getByRole('button', { name: 'Regenerar códigos' }).click();

    const campo = pagina.getByLabel('Contraseña');
    await expect(campo).toHaveAttribute('aria-invalid', 'true');
    await expect(campo).toBeFocused();
    await expect(campo).toHaveValue('');
    await expect(pagina.getByText('La contraseña no es correcta.')).toBeVisible();
    expect(leerLote(contenedor, id)).toEqual(L1);
  });

  await test.step('S4 · Contraseña correcta con el código de la ventana siguiente', async () => {
    const fresco = await codigoFresco(secreto, pasoUsado);
    pasoUsado = fresco.paso;
    await pagina.getByLabel('Contraseña').fill(CONTRASENA);
    await pagina.getByLabel('Código de la aplicación').fill(fresco.codigo);
    await pagina.getByRole('button', { name: 'Regenerar códigos' }).click();

    const region = pagina.getByRole('region', { name: TITULO_NUEVOS });
    await expect(region).toBeVisible();
    await expect(region).toBeFocused();
    const codigos = await region.getByRole('listitem').allTextContents();
    expect(codigos).toHaveLength(10);
    for (const codigo of codigos) expect(codigo).toMatch(/^[0-9A-F]{10}$/);
    expect(new Set(codigos).size).toBe(10);
  });

  await test.step('S5 · La base: lote nuevo y aviso', async () => {
    const L2 = leerLote(contenedor, id);
    expect(L2.vigentes).toBe(10);
    const idsViejos = new Set(L1.ids.split(','));
    for (const nuevo of L2.ids.split(',')) expect(idsViejos.has(nuevo)).toBe(false);
    expect(Number(contarAvisos())).toBe(avisosAntes + 1);
  });

  await test.step('S6 · «Ya los he guardado»: el aviso se ve y el foco va a los avisos', async () => {
    await pagina.getByRole('button', { name: 'Ya los he guardado' }).click();
    const titulo = pagina.getByRole('heading', { name: 'Avisos de seguridad' });
    await expect(titulo).toBeFocused();
    // B-H6: la contraseña no se queda en el campo (se mira el valor, no el HTML: `content()` no ve el valor de un input).
    await expect(pagina.getByLabel('Contraseña')).toHaveValue('');
    await expect(pagina.getByLabel('Código de la aplicación')).toHaveValue('');
    await expect(pagina.getByRole('listitem').filter({ hasText: 'Códigos de recuperación nuevos' })).toHaveCount(avisosAntes + 1);
  });

  await test.step('S7 · Ninguna navegación pasó por /primera-vez', async () => {
    expect(navegaciones.filter((url) => url.includes('/primera-vez'))).toEqual([]);
  });

  await test.step('S8 · La sesión no cambió: mismas filas y aal2', async () => {
    const despues = leerSesiones(contenedor, id);
    expect(despues.cuenta).toBe(sesionesAntes.cuenta);
    expect(despues.aal).toBe('aal2');
    expect(sesionesAntes.aal).toBe('aal2');
  });

  await test.step('S9 · La contraseña no está en los registros ni en pg_stat_statements', async () => {
    const registros = registrosDelServidor(contenedor, t0);
    expect(registros.length).toBeGreaterThan(0);
    expect(registros).not.toContain(CONTRASENA);
    expect(registros).not.toContain(CONTRASENA_ERRONEA);
    expect(
      consultar(
        contenedor,
        `select count(*) from extensions.pg_stat_statements where query like '%${CONTRASENA}%' or query like '%${CONTRASENA_ERRONEA}%'`,
      ),
    ).toBe('0');
  });

  await contexto.close();
});
