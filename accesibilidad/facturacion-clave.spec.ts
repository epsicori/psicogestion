import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * T-026a · CA18 · La clave del programa de facturación no sale del servidor.
 *
 * Guarda un centinela (`SENTINELA_T026_` + 20 caracteres) POR LA RPC con la sesión del administrador
 * (en este ticket no hay formulario con programa disponible), abre `/ajustes/facturacion` y la
 * ficha de un paciente, recoge TODAS las respuestas (HTML y RSC) y exige que ninguna lo contenga.
 * Después recorre `.next/static` y `.next/server`: el centinela no puede haber acabado en el build.
 *
 * Corre DESPUÉS de `npm run build`. Exige la siembra (`npx supabase db reset && npm run seed`).
 * Al terminar desconecta el programa (`quitar_proveedor_facturacion`).
 */

const PACIENTE = 'd0080001-0000-4000-8000-000000000003';
const CENTINELA = `SENTINELA_T026_${randomBytes(10).toString('hex')}`;

function variable(nombre: string): string | undefined {
  if (process.env[nombre]) return process.env[nombre];
  const fichero = path.join(process.cwd(), '.env.local');
  if (!existsSync(fichero)) return undefined;
  const linea = readFileSync(fichero, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${nombre}=`));
  return linea?.slice(nombre.length + 1).trim();
}

function* ficheros(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const nombre of readdirSync(dir)) {
    const ruta = path.join(dir, nombre);
    const info = statSync(ruta);
    if (info.isDirectory()) yield* ficheros(ruta);
    else if (info.size < 50_000_000) yield ruta;
  }
}

const cliente = () =>
  createClient(
    variable('NEXT_PUBLIC_SUPABASE_URL') ?? 'http://127.0.0.1:54321',
    variable('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? '',
    { auth: { persistSession: false } },
  );

async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill('admin@psicogestion.test');
  await page.getByLabel('Contraseña').fill('psico1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/pacientes');
}

test.describe.configure({ mode: 'serial' });

test('la clave guardada no aparece en ninguna respuesta ni en el build', async ({ page }) => {
  const supabase = cliente();
  const { error: errorDeEntrada } = await supabase.auth.signInWithPassword({
    email: 'admin@psicogestion.test',
    password: 'psico1234',
  });
  expect(errorDeEntrada, 'no se pudo entrar como administrador por la API').toBeNull();

  const { error: errorDeGuardado } = await supabase.rpc('guardar_clave_proveedor_facturacion', {
    p_proveedor: 'holded',
    p_clave: CENTINELA,
  });
  expect(errorDeGuardado, 'no se pudo guardar el centinela').toBeNull();

  try {
    const cuerpos: string[] = [];
    page.on('response', async (respuesta) => {
      try {
        cuerpos.push(await respuesta.text());
      } catch {
        // Redirecciones y recursos sin cuerpo.
      }
    });

    await entrar(page);
    await page.goto('/ajustes/facturacion');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto(`/pacientes/${PACIENTE}`);
    await expect(page.getByRole('tab', { name: 'Facturación' })).toBeVisible();
    await page.getByRole('tab', { name: 'Facturación' }).click();
    await page.waitForLoadState('networkidle');

    expect(cuerpos.length, 'no se recogió ninguna respuesta').toBeGreaterThan(3);
    expect(cuerpos.filter((c) => c.includes(CENTINELA)), 'una respuesta lleva la clave').toEqual([]);

    const dentroDelBuild: string[] = [];
    for (const raiz of ['.next/static', '.next/server']) {
      for (const fichero of ficheros(path.join(process.cwd(), raiz))) {
        if (readFileSync(fichero).includes(CENTINELA)) dentroDelBuild.push(fichero);
      }
    }
    expect(dentroDelBuild, 'el centinela está en el build').toEqual([]);
  } finally {
    await supabase.rpc('quitar_proveedor_facturacion');
  }
});
