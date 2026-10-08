// T-026a · La cola contra la base local (`npm run test:facturacion`). Confirma filas: cada ejecución
// deja borradores, eventos y envíos de prueba (la base es de solo adición), y por eso no es idempotente.
// Los datos se preparan con psql como lo haría el banco; lo demás va con el cliente de servicio.

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { ejecutarSql, localizarContenedor } from '../../scripts/psql.mjs';

import { drenarEnvios } from './cola';
import { crearProveedorSimulado } from './simulado';

const AYUDANTES = readFileSync(path.resolve(__dirname, '../../scripts/rls/00-ayudantes.sql'), 'utf8');
const CLAVE = 'SENTINELA_BD_xxxxxxxxxxxxxxxxabcd';

const ENCABEZADO = `
\\set ON_ERROR_STOP on
${AYUDANTES}
select format('%L', p.id) as "PAC", format('%L', p.profesional_id) as "PRO", format('%L', p.centro_id) as "CEN"
  from public.pacientes p where p.centro_id is not null and p.fusionado_en is null order by p.id limit 1 \\gset
select format('%L', f.id) as "ADMIN" from public.perfiles f where f.rol = 'administrador' and f.estado = 'activo'
  order by f.id limit 1 \\gset
`;

function guion(cuerpo: string) {
  const codigo = ejecutarSql(localizarContenedor(), ENCABEZADO + cuerpo);
  expect(codigo).toBe(0);
}

/** Crea un borrador con su versión 1 sellada, configura el programa y lo encola dos veces. */
function prepararBorrador(id: string, nombre: string) {
  guion(`
insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por) values ('${id}', :PAC, :PRO, :PRO);
select pg_temp.assert_no_lanza(
  pg_temp.sql_version_simple('${id}', :PRO, 60.00, clock_timestamp(), '${nombre}', :CEN),
  'bd · la versión 1 se sella');
begin;
call pg_temp.como(:ADMIN);
select public.guardar_clave_proveedor_facturacion('holded', '${CLAVE}');
select public.encolar_envio_borrador('${id}') as "E1" \\gset
select public.encolar_envio_borrador('${id}') as "E2" \\gset
call pg_temp.reset_sesion();
commit;
select pg_temp.assert(:'E1' = :'E2', 'bd · encolar dos veces da el mismo evento (CA14)');
`);
}

async function contexto() {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { crearClienteAdministracion } = await import('@/lib/supabase/administracion');
  const bd = crearClienteAdministracion();
  const simulado = crearProveedorSimulado(`BD-${randomUUID().slice(0, 8)}`);
  return {
    bd,
    ...simulado,
    dep: {
      bd,
      proveedor: simulado.proveedor,
      idProveedor: 'holded' as const,
      descifrarNif: async () => null,
    },
  };
}

// El cliente de servicio solo ejecuta las funciones de la cola; las tablas se leen como postgres.
function consultar(sql: string): string[][] {
  const salida = execFileSync(
    'docker',
    ['exec', '-i', localizarContenedor(), 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-F', '|', '-c', sql],
    { encoding: 'utf8' },
  );
  return salida
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .map((l) => l.split('|'));
}

function envios(borrador: string) {
  return consultar(`select id from public.borradores_factura_envios where borrador_id = '${borrador}'`);
}

function evento(borrador: string) {
  const [fila] = consultar(
    `select estado, intentos, proximo_intento > now(), coalesce(ultimo_error, '')
       from public.eventos_salientes where clave_idempotencia = 'facturacion.enviar_borrador:${borrador}'`,
  );
  return { estado: fila[0], intentos: Number(fila[1]), futuro: fila[2] === 't', ultimoError: fila[3] };
}

afterAll(() => {
  // Deja la base sin programa conectado, como estaba.
  guion(`
begin;
call pg_temp.como(:ADMIN);
select public.quitar_proveedor_facturacion();
call pg_temp.reset_sesion();
commit;
`);
});

describe('drenarEnvios contra la base', () => {
  it('CA14 · dos drenados en paralelo crean un solo documento y un solo envío', async () => {
    const id = randomUUID();
    const nombre = `Prueba bd ${id.slice(0, 8)}`;
    prepararBorrador(id, nombre);
    const { control, dep } = await contexto();

    await Promise.all([drenarEnvios(dep), drenarEnvios(dep)]);

    expect(control.documentos().filter((d) => d.recibido.destinatario.nombre === nombre)).toHaveLength(1);
    expect(envios(id)).toHaveLength(1);
    expect(evento(id).estado).toBe('entregado');
  });

  it('CA14 · con la respuesta perdida: 1 documento, 0 envíos, fallido con ambiguo', async () => {
    const id = randomUUID();
    const nombre = `Prueba bd ${id.slice(0, 8)}`;
    prepararBorrador(id, nombre);
    const { control, dep } = await contexto();
    control.perderRespuesta();

    await drenarEnvios(dep);

    expect(control.documentos().filter((d) => d.recibido.destinatario.nombre === nombre)).toHaveLength(1);
    expect(envios(id)).toHaveLength(0);
    const e = evento(id);
    expect(e.estado).toBe('fallido');
    expect(e.ultimoError).toBe('ambiguo');
  });

  it('CA16 · con el proveedor caído sigue pendiente, con un intento y reintento futuro', async () => {
    const id = randomUUID();
    prepararBorrador(id, `Prueba bd ${id.slice(0, 8)}`);
    const { control, dep } = await contexto();
    control.caido(true);

    await drenarEnvios(dep);

    expect(envios(id)).toHaveLength(0);
    const e = evento(id);
    expect(e.estado).toBe('pendiente');
    expect(e.intentos).toBe(1);
    expect(e.futuro).toBe(true);
  });
});
