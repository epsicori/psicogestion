// T-046 · El núcleo del borrador contra la base local, con sesiones reales (`npm run test:facturacion`).
// Confirma filas y no es idempotente: cada pasada da de alta un paciente con un DNI al azar, un tipo
// de terapia y citas en un día al azar del pasado, y deja sus borradores (la base es de solo adición).
// Los datos de la fijación se preparan como postgres; lo que se prueba va con la sesión de cada uno.

import { execFileSync } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { localizarContenedor } from '../../scripts/psql.mjs';

vi.mock('@/lib/cifrado/aes-gcm', async (original) => {
  const real = await original<typeof import('@/lib/cifrado/aes-gcm')>();
  return { ...real, descifrar: vi.fn(real.descifrar) };
});

const { descifrar } = await import('@/lib/cifrado/aes-gcm');
const { claveDeCifrado } = await import('@/lib/cifrado/claves');
const { cifrarIdentificacion } = await import('@/lib/cifrado/identificacion');
const { validarCif } = await import('@/lib/identidad/cif');
const { claveAnonSupabase, urlSupabase } = await import('@/lib/supabase/config');
const { cargarElegibles, guardarBorrador } = await import('./borrador');
const { calcularImportes } = await import('./importes');

type Deps = Parameters<typeof guardarBorrador>[0];

// Con varios proyectos de Supabase levantados, `localizarContenedor()` toma el primero que encuentra.
function contenedor() {
  const nombres = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' }).split(/\r?\n/);
  return nombres.find((n) => n.trim() === 'supabase_db_Psicogestion')?.trim() ?? localizarContenedor();
}
const CONTENEDOR = contenedor();

/** Como postgres: filas separadas por `|`. */
function consultar(sql: string): string[][] {
  const salida = execFileSync(
    'docker',
    ['exec', '-i', CONTENEDOR, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-At', '-F', '|', '-c', sql],
    { encoding: 'utf8' },
  );
  return salida
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .map((l) => l.split('|'));
}
const uno = (sql: string) => consultar(sql)[0]?.[0] ?? '';

type Sesion = { supabase: SupabaseClient; id: string };
async function sesion(usuario: string): Promise<Sesion> {
  const supabase = createClient(urlSupabase, claveAnonSupabase, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: `${usuario}@psicogestion.test`,
    password: 'psico1234',
  });
  if (error || !data.user) throw new Error(`No se pudo entrar como ${usuario}: ${error?.message}`);
  return { supabase, id: data.user.id };
}

const deps = (s: Sesion): Deps =>
  ({ supabase: s.supabase, usuario: { id: s.id }, ahora: () => new Date(), claveDeCifrado, proveedor: () => null }) as Deps;

function dniAlAzar() {
  const n = randomInt(0, 100_000_000);
  return String(n).padStart(8, '0') + 'TRWAGMYFPDXBNJZSQVHLCKE'[n % 23];
}
function cifAlAzar() {
  const cuerpo = 'B' + String(randomInt(0, 10_000_000)).padStart(7, '0');
  for (const c of '0123456789ABCDEFGHIJ') if (validarCif(cuerpo + c)) return cuerpo + c;
  throw new Error('sin CIF');
}

function columnasNif(borrador: string, version: number) {
  return consultar(
    `select encode(destinatario_nif_cifrado, 'hex'), encode(destinatario_nif_nonce, 'hex'),
            encode(destinatario_nif_etiqueta, 'hex'), destinatario_nif_clave_version
       from public.borradores_factura_versiones where borrador_id = '${borrador}' and numero_version = ${version}`,
  )[0];
}
const versiones = (paciente: string) =>
  Number(uno(`select count(*) from public.borradores_factura_versiones where paciente_id = '${paciente}'`));
const cabeceras = (paciente: string) =>
  Number(uno(`select count(*) from public.borradores_factura where paciente_id = '${paciente}'`));

const libre = (p: Partial<{ concepto: string; precio_centimos: number; regimen_iva: 'general' | 'exento_sanitario' }> = {}) => ({
  cita_id: null,
  concepto: 'Informe de prueba',
  cantidad: 1,
  precio_centimos: 12100,
  regimen_iva: 'general' as const,
  ...p,
});
const deSesion = (cita: string, p: Partial<{ precio_centimos: number; regimen_iva: 'general' | 'exento_sanitario' }> = {}) => ({
  cita_id: cita,
  concepto: 'Sesión',
  cantidad: 1,
  precio_centimos: 7000,
  regimen_iva: 'exento_sanitario' as const,
  ...p,
});

let ana: Sesion;
let PAC = '';
let DNI = '';
const CITAS: string[] = [];
let CITA_BONO = '';

beforeAll(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ana = await sesion('ana');

  // El paciente, dado de alta como lo haría la ficha: ana queda como profesional asignada.
  DNI = dniAlAzar();
  const cifrado = await cifrarIdentificacion({ documento: DNI });
  const { data, error } = await ana.supabase.rpc('alta_paciente', {
    p_nombre: 'Prueba',
    p_apellidos: `T046 bd ${randomUUID().slice(0, 8)}`,
    p_fecha_nacimiento: '1990-01-01',
    p_sexo: null,
    p_telefono: null,
    ...cifrado,
    p_alergias: null,
    p_medicacion_actual: null,
  } as never);
  if (error || typeof data !== 'string') throw new Error(`alta_paciente: ${error?.message}`);
  PAC = data;

  // Cuatro citas realizadas de ana en un día al azar del pasado (sin chocar con la siembra) y una
  // quinta con bono; un tipo de terapia propio y una tarifa del paciente, exenta, a 70 €.
  const tipo = randomUUID();
  const bono = randomUUID();
  const dia = `20${String(randomInt(1, 19)).padStart(2, '0')}-${String(randomInt(1, 13)).padStart(2, '0')}-${String(randomInt(1, 28)).padStart(2, '0')}`;
  for (let i = 0; i < 5; i++) CITAS.push(randomUUID());
  CITA_BONO = CITAS[4];
  const filas = CITAS.map(
    (id, i) => `('${id}', '${PAC}', '${ana.id}', '${tipo}',
      (date '${dia}' + ${i} + time '10:00') at time zone 'Europe/Madrid',
      (date '${dia}' + ${i} + time '10:50') at time zone 'Europe/Madrid', 'Europe/Madrid',
      ${id === CITA_BONO ? `'${bono}'` : 'null'})`,
  ).join(',\n');
  consultar(`
insert into public.tipos_terapia (id, nombre, tarifa_base) values ('${tipo}', 'Terapia bd ${tipo.slice(0, 8)}', 60.00);
insert into public.tarifas_paciente (id, paciente_id, tipo_terapia_id, importe, regimen_iva, vigente_desde, creada_por)
  values ('${randomUUID()}', '${PAC}', '${tipo}', 70.00, 'exento_sanitario', date '${dia}', '${ana.id}');
insert into public.bonos (id, paciente_id, sesiones_totales, importe, caducidad, creado_por)
  values ('${bono}', '${PAC}', 5, 250.00, null, '${ana.id}');
insert into public.citas (id, paciente_id, profesional_id, tipo_terapia_id, inicio, fin, zona_horaria, bono_id) values
${filas};
update public.citas set estado = 'realizada' where id in (${CITAS.map((c) => `'${c}'`).join(', ')});
`);
}, 60000);

describe('guardarBorrador contra la base', () => {
  it('CA16 · las realizadas sin bono son elegibles con la tarifa propuesta; la del bono no', async () => {
    const elegibles = await cargarElegibles(deps(ana), PAC);
    const ids = (elegibles ?? []).map((e) => e.citaId);
    expect(ids).toEqual(expect.arrayContaining(CITAS.slice(0, 4)));
    expect(ids).not.toContain(CITA_BONO);
    expect(elegibles?.find((e) => e.citaId === CITAS[0])).toMatchObject({
      precioCentimos: 7000,
      regimen: 'exento_sanitario',
    });
  });

  it('CA1c · CA2 · CA5 · crear, corregir dos veces y descartar: cadena íntegra, N intacta, NIF solo cifrado', async () => {
    // Crear, con el paciente como destinatario y las dos primeras sesiones.
    const v1 = await guardarBorrador(deps(ana), {
      pacienteId: PAC,
      borradorId: null,
      partida: null,
      descartar: false,
      destinatario: { modo: 'paciente' },
      lineas: [deSesion(CITAS[0]), deSesion(CITAS[1])],
    });
    expect(v1).toMatchObject({ ok: true, numeroVersion: 1 });
    if (!v1.ok) return;
    const B = v1.borradorId;

    // CA16 · dos líneas con su cita.
    expect(uno(`select string_agg(l->>'cita_id', ',' order by l->>'cita_id')
                  from public.borradores_factura_versiones v, jsonb_array_elements(v.lineas) l
                 where v.borrador_id = '${B}' and v.numero_version = 1`)).toBe(
      [CITAS[0], CITAS[1]].sort().join(','),
    );

    // CA5 · paciente: las cuatro columnas, y descifradas dan el DNI.
    const n1 = columnasNif(B, 1);
    expect(n1.every((c) => c !== '')).toBe(true);
    const claro = (await import('@/lib/cifrado/aes-gcm')).descifrar(await claveDeCifrado(), {
      cifrado: Buffer.from(n1[0], 'hex'),
      nonce: Buffer.from(n1[1], 'hex'),
      etiqueta: Buffer.from(n1[2], 'hex'),
    });
    expect(claro).toBe(DNI);

    // CA5 · el rastro de la lectura de la identificación.
    expect(
      Number(
        uno(`select count(*) from public.auditoria where operacion = 'LECTURA_IDENTIFICACION'
               and actor_id = '${ana.id}' and registro_id = '${PAC}' and ocurrido_en > now() - interval '15 minutes'`),
      ),
    ).toBeGreaterThanOrEqual(1);

    const antes = consultar(
      `select huella, contenido_canonico from public.borradores_factura_versiones where borrador_id = '${B}' and numero_version = 1`,
    )[0];

    // Corregir con «conservar»: el NIF se arrastra en bytes, sin descifrarlo.
    vi.mocked(descifrar).mockClear();
    const v2 = await guardarBorrador(deps(ana), {
      pacienteId: PAC,
      borradorId: B,
      partida: 1,
      descartar: false,
      destinatario: { modo: 'conservar' },
      lineas: [deSesion(CITAS[0]), deSesion(CITAS[1]), libre()],
    });
    expect(v2).toEqual({ ok: true, borradorId: B, numeroVersion: 2 });
    expect(columnasNif(B, 2)).toEqual(n1);
    const cifradoN = Buffer.from(n1[0], 'hex');
    expect(vi.mocked(descifrar).mock.calls.filter(([, s]) => Buffer.compare(s.cifrado, cifradoN) === 0)).toEqual([]);

    // CA2 · la N no cambia al crear la N+1.
    expect(
      consultar(
        `select huella, contenido_canonico from public.borradores_factura_versiones where borrador_id = '${B}' and numero_version = 1`,
      )[0],
    ).toEqual(antes);

    const v3 = await guardarBorrador(deps(ana), {
      pacienteId: PAC,
      borradorId: B,
      partida: 2,
      descartar: false,
      destinatario: { modo: 'conservar' },
      lineas: [deSesion(CITAS[0])],
    });
    expect(v3).toMatchObject({ ok: true, numeroVersion: 3 });
    const v4 = await guardarBorrador(deps(ana), {
      pacienteId: PAC,
      borradorId: B,
      partida: 3,
      descartar: true,
      destinatario: { modo: 'conservar' },
      lineas: [],
    });
    expect(v4).toMatchObject({ ok: true, numeroVersion: 4 });

    // CA1c · la cadena verifica entera (la función se ejecuta como postgres: está revocada a authenticated).
    expect(uno(`select count(*) from public.verificar_cadena_borrador('${B}')`)).toBe('0');
    expect(uno(`select count(*) from public.borradores_factura_versiones where borrador_id = '${B}'`)).toBe('4');

    // CA5 · ningún rastro del DNI en claro.
    expect(uno(`select count(*) from public.borradores_factura_versiones v where v::text like '%${DNI}%'`)).toBe('0');
    expect(uno(`select count(*) from public.auditoria a where a::text like '%${DNI}%'`)).toBe('0');
  });

  it('CA5 · tercero con CIF: cifrado y sin rastro en claro; con el control mal, validacion y nada se crea', async () => {
    const CIF = cifAlAzar();
    const r = await guardarBorrador(deps(ana), {
      pacienteId: PAC,
      borradorId: null,
      partida: null,
      descartar: false,
      destinatario: { modo: 'tercero', nombre: 'Mutua de prueba', tipo: 'juridica', nif: CIF },
      lineas: [libre()],
    });
    expect(r).toMatchObject({ ok: true, numeroVersion: 1 });
    if (!r.ok) return;
    const n = columnasNif(r.borradorId, 1);
    expect(
      descifrar(await claveDeCifrado(), {
        cifrado: Buffer.from(n[0], 'hex'),
        nonce: Buffer.from(n[1], 'hex'),
        etiqueta: Buffer.from(n[2], 'hex'),
      }),
    ).toBe(CIF);
    expect(uno(`select count(*) from public.borradores_factura_versiones v where v::text like '%${CIF}%'`)).toBe('0');
    expect(uno(`select count(*) from public.auditoria a where a::text like '%${CIF}%'`)).toBe('0');

    const cuenta = versiones(PAC);
    const malo = CIF.slice(0, -1) + (CIF.endsWith('0') ? '1' : '0');
    for (const [tipo, nif] of [
      ['juridica', malo],
      ['fisica', DNI.slice(0, -1) + (DNI.endsWith('A') ? 'B' : 'A')],
    ] as const) {
      expect(
        await guardarBorrador(deps(ana), {
          pacienteId: PAC,
          borradorId: null,
          partida: null,
          descartar: false,
          destinatario: { modo: 'tercero', nombre: 'Mutua', tipo, nif },
          lineas: [libre()],
        }),
      ).toEqual({ ok: false, error: 'validacion' });
    }
    expect(versiones(PAC)).toBe(cuenta);
  });

  it('CA3 · dos correcciones en paralelo desde la misma partida: una entra, la otra es conflicto', async () => {
    const r = await guardarBorrador(deps(ana), {
      pacienteId: PAC,
      borradorId: null,
      partida: null,
      descartar: false,
      destinatario: { modo: 'paciente' },
      lineas: [libre()],
    });
    if (!r.ok) throw new Error(`crear: ${r.error}`);
    const otra = await sesion('ana');
    const corregir = (s: Sesion, concepto: string) =>
      guardarBorrador(deps(s), {
        pacienteId: PAC,
        borradorId: r.borradorId,
        partida: 1,
        descartar: false,
        destinatario: { modo: 'conservar' },
        lineas: [libre({ concepto })],
      });
    const resultados = await Promise.all([corregir(ana, 'Uno'), corregir(otra, 'Dos')]);
    expect(resultados.filter((x) => x.ok)).toHaveLength(1);
    expect(resultados.filter((x) => !x.ok)).toEqual([{ ok: false, error: 'conflicto' }]);
    expect(uno(`select count(*) from public.borradores_factura_versiones where borrador_id = '${r.borradorId}'`)).toBe('2');
  });

  it('CA6 · técnico, profesional no asignado y paciente inexistente: la misma respuesta y nada se crea', async () => {
    const entrada = (paciente: string) => ({
      pacienteId: paciente,
      borradorId: null,
      partida: null,
      descartar: false,
      destinatario: { modo: 'paciente' as const },
      lineas: [libre()],
    });
    const [cab, ver] = [cabeceras(PAC), versiones(PAC)];
    const respuestas = [
      await guardarBorrador(deps(await sesion('tecnico')), entrada(PAC)),
      await guardarBorrador(deps(await sesion('bruno')), entrada(PAC)),
      await guardarBorrador(deps(ana), entrada(randomUUID())),
    ];
    for (const r of respuestas) expect(r).toEqual({ ok: false, error: 'no_disponible' });
    expect([cabeceras(PAC), versiones(PAC)]).toEqual([cab, ver]);

    // Gemelas: el administrador y la profesional asignada sí crean.
    expect(await guardarBorrador(deps(await sesion('admin')), entrada(PAC))).toMatchObject({ ok: true });
    expect(await guardarBorrador(deps(ana), entrada(PAC))).toMatchObject({ ok: true });
    expect(cabeceras(PAC)).toBe(cab + 2);
  });

  it('CA7 · crear_borrador con un total que no cuadra: error y ninguna cabecera huérfana', async () => {
    const id = randomUUID();
    const { error } = await ana.supabase.rpc('crear_borrador', {
      p_borrador_id: id,
      p_paciente_id: PAC,
      p_profesional_id: ana.id,
      p_centro_id: null,
      p_destinatario_nombre: 'Prueba',
      p_nif_cifrado: null,
      p_nif_nonce: null,
      p_nif_etiqueta: null,
      p_lineas: [
        { cantidad: 1, cita_id: null, concepto: 'x', precio_unitario_centimos: 100, regimen_iva: 'exento_sanitario', tipo_iva_centesimas: 0 },
      ],
      p_base_centimos: 100,
      p_cuota_centimos: 0,
      p_total_centimos: 999,
      p_creada_en: new Date().toISOString(),
      p_contenido_canonico: '{}',
    } as never);
    expect(error?.code).toBe('23514');
    expect(uno(`select count(*) from public.borradores_factura where id = '${id}'`)).toBe('0');
  });

  it('CA10 · CA17 · una sesión con tarifa exenta pasada a general y una línea libre al 21 %', async () => {
    const lineas = [deSesion(CITAS[2], { precio_centimos: 12100, regimen_iva: 'general' as const }), libre()];
    const r = await guardarBorrador(deps(ana), {
      pacienteId: PAC,
      borradorId: null,
      partida: null,
      descartar: false,
      destinatario: { modo: 'paciente' },
      lineas,
    });
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    const [fila] = consultar(
      `select v.lineas->0->>'regimen_iva', v.lineas->0->>'tipo_iva_centesimas', (v.cuota_iva * 100)::bigint, (v.total * 100)::bigint
         from public.borradores_factura_versiones v where v.borrador_id = '${r.borradorId}'`,
    );
    const esperado = calcularImportes(
      lineas.map((l) => ({
        concepto: l.concepto,
        cantidad: l.cantidad,
        precio_unitario_centimos: l.precio_centimos,
        regimen_iva: l.regimen_iva,
        tipo_iva_centesimas: 2100,
        cita_id: l.cita_id,
      })),
    );
    expect(fila).toEqual(['general', '2100', String(esperado.cuota), String(esperado.total)]);
  });
});

