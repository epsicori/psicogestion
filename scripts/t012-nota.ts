// T-012 · Guion de punta a punta del corte A (diseño §8). `npx tsx scripts/t012-nota.ts`.
//
// No construye el estado a mano (regla de supabase.md, T-013a): entra con una sesión real de
// profesional (Ana, la sembrada) y llama a lo mismo que llamarán las Server Actions del corte B:
// `abrirEditorDeNota`, `guardarBorrador`, `empezarModificacion` y `firmarNota` de
// lib/notas/servidor.ts, contra la base local de verdad. Después comprueba por SQL, como
// `postgres`, lo que la base dejó escrito.
//
// Idempotente: cada ejecución da de alta un paciente nuevo y dos citas nuevas de Ana (las citas
// que dejó la ejecución anterior se cancelan antes, porque una cita ocupa el rango de Ana).
// Solo exige la base local levantada y sembrada (`npx supabase db reset` + `npm run seed`).
//
// Criterios del contrato que cierra (numeración del contrato): 1, 2, 3, 4, 5, 7 y A. El 6 (NFC)
// vive en lib/notas/servidor.test.ts; el 12 (la aplicación no puede firmar con el cuerpo de otro)
// en el banco 20 y en las pruebas unitarias.
//
// El parche de `server-only` es el de scripts/t032-alta.ts y por la misma razón.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import Module from 'node:module';

for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
// Solo local: `segundoFactorAutomaticoActivo()` lo comprueba contra la URL de Supabase y lanza
// si no es 127.0.0.1/localhost.
process.env.SEGUNDO_FACTOR_AUTOMATICO_LOCAL = 'activo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cargarOriginal = (Module as any)._load;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module as any)._load = function (request: string, ...resto: any[]) {
  if (request === 'server-only') return {};
  return cargarOriginal.apply(this, [request, ...resto]);
};

const MARCA = 'guion T-012';
const PIN = '123456';
const CERO = '0'.repeat(64); // huella_anterior de la primera versión: 32 bytes a cero

async function principal() {
  const { createClient } = await import('@supabase/supabase-js');
  const { urlSupabase, claveAnonSupabase } = await import('../lib/supabase/config');
  const { superarSegundoFactorSembrado } = await import('../lib/cuentas/modo-desarrollo');
  const { desbloquearHistoria, fijarPinHistoria } = await import('../lib/cuentas/candado');
  const { abrirEditorDeNota, guardarBorrador, empezarModificacion, firmarNota } = await import(
    '../lib/notas/servidor'
  );
  const { localizarContenedor } = await import('./psql.mjs');
  const contenedor: string = localizarContenedor();
  const contexto = { ip: null, agente: 'scripts/t012-nota.ts' };

  let paso = '(sin empezar)';
  function fallar(mensaje: string): never {
    console.error(`\n✗ FALLO en «${paso}»: ${mensaje}`);
    process.exit(1);
  }
  function assert(condicion: unknown, mensaje: string): asserts condicion {
    if (!condicion) fallar(mensaje);
  }

  /** Una consulta como `postgres`; `-At`: sin formato, una columna por `|`. */
  function sql(consulta: string): string {
    return execFileSync(
      'docker',
      ['exec', '-i', contenedor, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', consulta],
      { encoding: 'utf8' },
    ).trim();
  }
  /**
   * Una sentencia que DEBE fallar POR EL MOTIVO ESPERADO (R2-H10): `motivo` es un fragmento del
   * mensaje de error. Sin él, cualquier error (una errata en el SQL, un permiso ajeno) pasaría por
   * la guarda. Devuelve el mensaje, o falla el guion.
   */
  function sqlFalla(consulta: string, motivo: RegExp): string {
    const r = spawnSync(
      'docker',
      ['exec', '-i', contenedor, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', consulta],
      { encoding: 'utf8' },
    );
    assert(r.status !== 0, `debía fallar y no falló: ${consulta}`);
    assert(motivo.test(`${r.stderr}`), `falló por otro motivo (esperaba ${motivo}): ${r.stderr}`);
    return `${r.stderr}`;
  }

  // -----------------------------------------------------------------------
  // 0 · Preparación como postgres: paciente nuevo de Ana y dos citas suyas
  // -----------------------------------------------------------------------
  paso = '0 · preparación';
  const ana = sql(`select id from auth.users where email = 'ana@psicogestion.test'`);
  const centro = sql(`select centro_id from public.perfiles_centros where perfil_id = '${ana}' and principal`);
  assert(ana && centro, 'no se encuentra a Ana o su centro: ¿está sembrada la base (npm run seed)?');

  // Las citas de una ejecución anterior se cancelan (una cancelada no ocupa el rango de Ana).
  sql(
    `do $$ begin
       update public.citas set estado = 'cancelada' where nota_operativa = '${MARCA}' and estado <> 'cancelada';
     exception when others then
       raise notice 'no se pudieron cancelar las citas de otra ejecución: %', sqlerrm;
     end $$`,
  );

  const paciente = sql(
    `insert into public.pacientes (nombre, apellidos, profesional_id, centro_id)
     values ('Paciente', 'De Prueba T-012 ' || to_char(clock_timestamp(), 'HH24MISSMS'), '${ana}', '${centro}')
     returning id`,
  ).split('\n')[0]!;
  // Cita en curso: empezó hace diez minutos y acaba dentro de cuarenta.
  const citaHoy = sql(
    `insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria, nota_operativa)
     values ('${paciente}', '${ana}', '${centro}', now() - interval '10 minutes', now() + interval '40 minutes',
             'Europe/Madrid', '${MARCA}') returning id`,
  ).split('\n')[0]!;
  // Cita de ayer, hace tiempo: realizada, así que abre su alerta nota_sin_firmar.
  const citaAyer = sql(
    `insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria, nota_operativa)
     values ('${paciente}', '${ana}', '${centro}',
             date_trunc('day', now()) - interval '21 hours 20 minutes',
             date_trunc('day', now()) - interval '20 hours 30 minutes',
             'Europe/Madrid', '${MARCA}') returning id`,
  ).split('\n')[0]!;
  sql(`update public.citas set estado = 'realizada' where id = '${citaAyer}'`);
  assert(
    sql(
      `select count(*) from public.alertas_documentacion
        where origen_tabla = 'citas' and origen_id = '${citaAyer}' and tipo = 'nota_sin_firmar' and estado = 'abierta'`,
    ) === '1',
    'la cita de ayer marcada realizada debía abrir su alerta nota_sin_firmar',
  );
  console.log(`✓ 0 · paciente ${paciente}, cita en curso ${citaHoy}, cita de ayer ${citaAyer} con su alerta abierta`);

  // -----------------------------------------------------------------------
  // 1 · Sesión real de Ana, segundo factor y desbloqueo de la historia
  // -----------------------------------------------------------------------
  paso = '1 · sesión';
  const supabase = createClient(urlSupabase, claveAnonSupabase);
  const { data: entrada, error: errorSesion } = await supabase.auth.signInWithPassword({
    email: 'ana@psicogestion.test',
    password: 'psico1234',
  });
  assert(!errorSesion && entrada.session, `signInWithPassword: ${errorSesion?.message}`);
  assert((await superarSegundoFactorSembrado(supabase)) === 'superado', 'no se superó el segundo factor sembrado');
  const sesion = { supabase, usuario: entrada.user };
  assert((await fijarPinHistoria(sesion, PIN)).ok, 'no se pudo fijar el PIN de Ana');
  assert((await desbloquearHistoria(sesion, PIN)).desbloqueado, 'el PIN de Ana no desbloquea la historia');
  console.log('✓ 1 · sesión de Ana, segundo factor y historia desbloqueada');

  // -----------------------------------------------------------------------
  // 2 · Abrir, guardar, firmar la nota de la cita en curso → v1 (criterios 1, 2, 3)
  // -----------------------------------------------------------------------
  paso = '2 · abrir, guardar y firmar (cita en curso)';
  const apertura = await abrirEditorDeNota(sesion, { pacienteId: paciente, citaId: citaHoy, notaId: null, episodioId: null }, contexto);
  assert(apertura.estado === 'abierta', `abrirEditorDeNota devolvió «${apertura.estado}»`);
  const notaId = apertura.nota.notaId;
  assert(apertura.nota.estado === 'borrador' && apertura.nota.borrador !== null, 'la nota recién abierta debía ser un borrador');
  const g1 = await guardarBorrador(sesion, {
    pacienteId: paciente,
    notaId,
    testigo: apertura.nota.borrador.testigo,
    texto: 'Primera sesión: se explora el motivo de consulta.',
    reservadas: '',
  });
  assert(g1.ok, `guardarBorrador: ${JSON.stringify(g1)}`);
  const f1 = await firmarNota(sesion, { pacienteId: paciente, notaId, testigo: g1.testigo, alcance: 'individual', motivo: null });
  assert(f1.ok, `firmarNota v1: ${JSON.stringify(f1)}`);

  const fila = (n: number, columnas: string) =>
    sql(`select ${columnas} from public.notas_clinicas_versiones where nota_id = '${notaId}' and numero_version = ${n}`);

  // Criterio 1: la v1 está sellada y encadenada a cero.
  const [num, tieneHuella, anterior, posicion] = fila(1, `numero_version, huella is not null, encode(huella_anterior, 'hex'), posicion_cadena`).split('|');
  assert(num === '1' && tieneHuella === 't' && anterior === CERO && posicion === '1',
    `v1 mal sellada: numero=${num}, huella=${tieneHuella}, anterior=${anterior}, posición=${posicion}`);
  console.log('✓ criterio 1 · v1: numero_version 1, huella no nula, huella_anterior de 32 ceros, posicion_cadena 1');

  // Criterio 2: recalcular sha256(contenido_canonico || huella_anterior) da la huella guardada.
  assert(
    fila(1, `encode(extensions.digest(convert_to(contenido_canonico, 'UTF8') || huella_anterior, 'sha256'), 'hex') = encode(huella, 'hex')`) === 't',
    'la huella recalculada no coincide con la guardada',
  );
  const verificacion = spawnSync(process.execPath, ['scripts/verificar-huellas.mjs', '--paciente', paciente], { encoding: 'utf8' });
  assert(verificacion.status === 0, `verificar-huellas --paciente: ${verificacion.stdout}${verificacion.stderr}`);
  console.log('✓ criterio 2 · sha256(contenido_canonico || huella_anterior) = huella, y verificar:huellas --paciente sale 0');

  // Criterio 3: dentro del margen → true; y invertir el booleano rompe la huella.
  assert(fila(1, `(contenido_canonico::jsonb ->> 'redactada_en_sesion')`) === 'true', 'v1 contra la cita en curso debía ser redactada_en_sesion = true');
  assert(
    fila(1, `encode(extensions.digest(convert_to(replace(contenido_canonico, '"redactada_en_sesion":true', '"redactada_en_sesion":false'), 'UTF8') || huella_anterior, 'sha256'), 'hex') <> encode(huella, 'hex')`) === 't',
    'invertir redactada_en_sesion no cambió la huella',
  );
  console.log('✓ criterio 3a · cita en curso: redactada_en_sesion = true, y invertirlo cambia la huella');

  // Tres capas: el REVOKE (permission denied) y los disparadores de fila y de sentencia (solo adición).
  const SOLO_ADICION = /permission denied for table notas_clinicas_versiones|notas_clinicas_versiones es de solo adición/;
  // Criterio 4: sobre la fila firmada no se puede UPDATE, DELETE ni TRUNCATE ni como postgres.
  const huellaV1 = fila(1, `encode(huella, 'hex')`);
  sqlFalla(`update public.notas_clinicas_versiones set cuerpo = '{"texto":"otro"}' where nota_id = '${notaId}' and numero_version = 1`, SOLO_ADICION);
  sqlFalla(`delete from public.notas_clinicas_versiones where nota_id = '${notaId}' and numero_version = 1`, SOLO_ADICION);
  sqlFalla(`truncate public.notas_clinicas_versiones`, SOLO_ADICION);
  assert(fila(1, `encode(huella, 'hex')`) === huellaV1, 'la v1 cambió tras los intentos de modificarla');
  console.log('✓ criterio 4 · update, delete y truncate de la v1 fallan, también como postgres, y la fila no cambió');

  // -----------------------------------------------------------------------
  // 3 · Modificar: sin motivo falta_motivo; con motivo, v2 encadenada a v1 (criterio 5)
  // -----------------------------------------------------------------------
  paso = '3 · modificar';
  const m1 = await empezarModificacion(sesion, { pacienteId: paciente, notaId });
  assert(m1.ok && m1.nota?.borrador, `empezarModificacion: ${JSON.stringify(m1)}`);
  const g2 = await guardarBorrador(sesion, {
    pacienteId: paciente,
    notaId,
    testigo: m1.nota.borrador.testigo,
    texto: 'Primera sesión: se explora el motivo de consulta y la demanda.',
    reservadas: '',
  });
  assert(g2.ok, `guardarBorrador v2: ${JSON.stringify(g2)}`);
  const versiones = () => sql(`select count(*) from public.notas_clinicas_versiones where nota_id = '${notaId}'`);
  const antes = versiones();
  const sinMotivo = await firmarNota(sesion, { pacienteId: paciente, notaId, testigo: g2.testigo, alcance: 'individual', motivo: null });
  assert(!sinMotivo.ok && sinMotivo.motivo === 'falta_motivo', `sin motivo debía ser falta_motivo: ${JSON.stringify(sinMotivo)}`);
  assert(versiones() === antes, 'firmar sin motivo cambió el número de versiones');
  const conMotivo = await firmarNota(sesion, { pacienteId: paciente, notaId, testigo: g2.testigo, alcance: 'individual', motivo: 'Se amplía la demanda' });
  assert(conMotivo.ok, `firmarNota v2: ${JSON.stringify(conMotivo)}`);
  const [num2, anterior2] = fila(2, `numero_version, encode(huella_anterior, 'hex')`).split('|');
  assert(num2 === '2' && anterior2 === huellaV1, `v2 no encadena con la huella de v1 (anterior=${anterior2})`);
  console.log('✓ criterio 5 · sin motivo: falta_motivo y el recuento no cambia; con motivo: v2 con huella_anterior = huella de v1');

  // Criterio 7: un cambio SOLO en las reservadas cambia el sobre y la huella.
  paso = '3b · solo reservadas';
  const m2 = await empezarModificacion(sesion, { pacienteId: paciente, notaId });
  assert(m2.ok && m2.nota?.borrador, `empezarModificacion v3: ${JSON.stringify(m2)}`);
  const g3 = await guardarBorrador(sesion, {
    pacienteId: paciente,
    notaId,
    testigo: m2.nota.borrador.testigo,
    texto: 'Primera sesión: se explora el motivo de consulta y la demanda.',
    reservadas: 'Anotación reservada nueva',
  });
  assert(g3.ok, `guardarBorrador v3: ${JSON.stringify(g3)}`);
  const f3 = await firmarNota(sesion, { pacienteId: paciente, notaId, testigo: g3.testigo, alcance: 'individual', motivo: 'Solo reservadas' });
  assert(f3.ok, `firmarNota v3: ${JSON.stringify(f3)}`);
  assert(fila(3, `cuerpo`) === fila(2, `cuerpo`), 'v3 cambió el cuerpo y debía cambiar solo las reservadas');
  assert(fila(3, `anotaciones_reservadas is distinct from (select anotaciones_reservadas from public.notas_clinicas_versiones where nota_id = '${notaId}' and numero_version = 2)`) === 't', 'las reservadas no cambiaron');
  assert(fila(3, `encode(huella, 'hex')`) !== fila(2, `encode(huella, 'hex')`), 'la huella de v3 es igual a la de v2');
  assert(
    fila(3, `(contenido_canonico::jsonb -> 'anotaciones_reservadas') is distinct from (select contenido_canonico::jsonb -> 'anotaciones_reservadas' from public.notas_clinicas_versiones where nota_id = '${notaId}' and numero_version = 2)`) === 't',
    'el sobre de v3 no refleja el cambio de reservadas',
  );
  console.log('✓ criterio 7 · cambiar solo las reservadas: mismo cuerpo, sobre y huella distintos');

  // -----------------------------------------------------------------------
  // 4 · La cita de ayer: fuera de margen (criterio 3b) y alerta resuelta (criterio A)
  // -----------------------------------------------------------------------
  paso = '4 · cita de ayer';
  const aperturaAyer = await abrirEditorDeNota(sesion, { pacienteId: paciente, citaId: citaAyer, notaId: null, episodioId: null }, contexto);
  assert(aperturaAyer.estado === 'abierta', `abrir la cita de ayer devolvió «${aperturaAyer.estado}»`);
  const notaAyer = aperturaAyer.nota.notaId;
  assert(aperturaAyer.nota.borrador, 'la nota de ayer debía abrirse con borrador');
  const gAyer = await guardarBorrador(sesion, {
    pacienteId: paciente,
    notaId: notaAyer,
    testigo: aperturaAyer.nota.borrador.testigo,
    texto: 'Nota redactada al día siguiente.',
    reservadas: '',
  });
  assert(gAyer.ok, `guardarBorrador ayer: ${JSON.stringify(gAyer)}`);
  assert(
    sql(`select estado from public.alertas_documentacion where origen_tabla = 'citas' and origen_id = '${citaAyer}' and tipo = 'nota_sin_firmar'`) === 'abierta',
    'antes de firmar la alerta de ayer debía seguir abierta',
  );
  const fAyer = await firmarNota(sesion, { pacienteId: paciente, notaId: notaAyer, testigo: gAyer.testigo, alcance: 'individual', motivo: null });
  assert(fAyer.ok, `firmarNota ayer: ${JSON.stringify(fAyer)}`);
  assert(
    sql(`select (contenido_canonico::jsonb ->> 'redactada_en_sesion') from public.notas_clinicas_versiones where nota_id = '${notaAyer}' and numero_version = 1`) === 'false',
    'la nota firmada contra la cita de ayer debía ser redactada_en_sesion = false',
  );
  console.log('✓ criterio 3b · cita de ayer: redactada_en_sesion = false');
  const [estadoAlerta, resueltaEn] = sql(
    `select estado, resuelta_en is not null from public.alertas_documentacion where origen_tabla = 'citas' and origen_id = '${citaAyer}' and tipo = 'nota_sin_firmar'`,
  ).split('|');
  assert(estadoAlerta === 'resuelta' && resueltaEn === 't', `la alerta de ayer debía quedar resuelta con resuelta_en (estado=${estadoAlerta})`);
  console.log('✓ criterio A · al firmar, la alerta nota_sin_firmar de su cita queda resuelta con resuelta_en');

  // R2-H11: firmar una v2 no vuelve a resolver la alerta ya resuelta (resuelta_en no se mueve).
  const consultaResuelta = `select resuelta_en::text from public.alertas_documentacion where origen_tabla = 'citas' and origen_id = '${citaAyer}' and tipo = 'nota_sin_firmar'`;
  const resueltaAntes = sql(consultaResuelta);
  assert(resueltaAntes !== '', 'la alerta de ayer debía tener resuelta_en antes de la v2');
  const mAyer = await empezarModificacion(sesion, { pacienteId: paciente, notaId: notaAyer });
  assert(mAyer.ok && mAyer.nota?.borrador, `empezarModificacion ayer: ${JSON.stringify(mAyer)}`);
  const gAyer2 = await guardarBorrador(sesion, {
    pacienteId: paciente,
    notaId: notaAyer,
    testigo: mAyer.nota.borrador.testigo,
    texto: 'Nota de ayer, ampliada.',
    reservadas: '',
  });
  assert(gAyer2.ok, `guardarBorrador ayer v2: ${JSON.stringify(gAyer2)}`);
  const fAyer2 = await firmarNota(sesion, { pacienteId: paciente, notaId: notaAyer, testigo: gAyer2.testigo, alcance: 'individual', motivo: 'Ampliación' });
  assert(fAyer2.ok, `firmarNota ayer v2: ${JSON.stringify(fAyer2)}`);
  assert(sql(consultaResuelta) === resueltaAntes, 'firmar la v2 movió resuelta_en de una alerta ya resuelta');
  console.log('✓ R2-H11 · firmar una v2 deja intacto el resuelta_en de la alerta ya resuelta');

  console.log('\n✓ T-012 corte A: todos los pasos del guion pasaron');
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
