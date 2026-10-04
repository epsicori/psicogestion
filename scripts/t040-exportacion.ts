// T-040 · Guion de punta a punta de la copia cifrada (diseño §3, C4 y C5). `npx tsx scripts/t040-exportacion.ts`.
//
// No construye el estado a mano (regla de supabase.md, T-013a): entra con una sesión real de
// profesional y llama a lo mismo que llaman las Server Actions: `abrirEditorDeNota`,
// `guardarBorrador`, `empezarModificacion` y `firmarNota` de lib/notas/servidor.ts para firmar dos
// versiones; `pedirCopiaDeNota` y `registrarFichero` de lib/exportaciones/servidor.ts para la copia; y
// `cifrarCopia` derivando con el núcleo Argon2id que lleva el visor (`new Function(NUCLEO_JS)()`).
// Descifra por el camino del visor y después comprueba por SQL, como `postgres`, lo que quedó escrito.
//
// C4 · la copia trae todas las versiones en orden, y número, huella y huella anterior coinciden con
//      la tabla versión a versión; `exportaciones_ficheros.huella_fichero` = sha256(fichero).
// C5 · ni la contraseña ni el contenido reservado aparecen en un `pg_dump --data-only` de
//      exportaciones, exportaciones_ficheros, accesos_historia, notificaciones y auditoria, ni en
//      `docker logs` enteros de los contenedores db y rest del proyecto, ni en la
//      salida del propio proceso.
//
// La profesional es Bruno, el sembrado: el segundo factor sembrado de Ana se puede haber repuesto
// en la base compartida (lo hacen las pruebas de «Reponer TOTP»). Repetible sin `db reset`: cada
// pasada da de alta un paciente nuevo y una cita pasada propia; las marcas llevan un sufijo aleatorio.
// El parche de `server-only` es el de scripts/t012-nota.ts y por la misma razón.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { isDeepStrictEqual } from 'node:util';

for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}
process.env.SEGUNDO_FACTOR_AUTOMATICO_LOCAL = 'activo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cargarOriginal = (Module as any)._load;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module as any)._load = function (request: string, ...resto: any[]) {
  if (request === 'server-only') return {};
  return cargarOriginal.apply(this, [request, ...resto]);
};

// La salida del propio proceso también se vigila (C5): se copia todo lo que se escribe.
let salidaPropia = '';
for (const flujo of [process.stdout, process.stderr]) {
  const original = flujo.write.bind(flujo);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (flujo as any).write = (trozo: any, ...resto: any[]) => {
    salidaPropia += typeof trozo === 'string' ? trozo : Buffer.from(trozo).toString('utf8');
    return original(trozo, ...resto);
  };
}

const SUFIJO = randomBytes(4).toString('hex');
const MARCA = `guion T-040 ${SUFIJO}`;
const MARCA_CUERPO = `MARCA-CUERPO-${SUFIJO}`;
const MARCA_RESERVADA = `MARCA-RESERVADA-${SUFIJO}`;
const CONTRASENA = `contrasena-de-prueba-${SUFIJO}`;
const PIN = '123456';

async function principal() {
  const { createClient } = await import('@supabase/supabase-js');
  const { urlSupabase, claveAnonSupabase } = await import('../lib/supabase/config');
  const { superarSegundoFactorSembrado } = await import('../lib/cuentas/modo-desarrollo');
  const { desbloquearHistoria, fijarPinHistoria } = await import('../lib/cuentas/candado');
  const { abrirEditorDeNota, guardarBorrador, empezarModificacion, firmarNota } = await import('../lib/notas/servidor');
  const { pedirCopiaDeNota, registrarFichero } = await import('../lib/exportaciones/servidor');
  const { cifrarCopia } = await import('../lib/exportaciones/cifrar');
  const { NUCLEO_JS } = await import('../lib/exportaciones/nucleo-js');
  const { contenedorDelProyecto } = await import('../lib/cuentas/contenedor-proyecto');
  const contenedor: string = contenedorDelProyecto();
  const contexto = { ip: null, agente: 'scripts/t040-exportacion.ts' };

  let paso = '(sin empezar)';
  function fallar(mensaje: string): never {
    console.error(`\n✗ FALLO en «${paso}»: ${mensaje}`);
    process.exit(1);
  }
  function assert(condicion: unknown, mensaje: string): asserts condicion {
    if (!condicion) fallar(mensaje);
  }
  function sql(consulta: string): string {
    return execFileSync(
      'docker',
      ['exec', '-i', contenedor, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', consulta],
      { encoding: 'utf8' },
    ).trim();
  }

  // El núcleo del visor, tal cual lo lleva el fichero: `return { argon2id, blake2b }`.
  const nucleo = new Function(NUCLEO_JS)() as {
    argon2id: (c: Uint8Array, s: Uint8Array, k: { m: number; t: number; p: number; longitud: number }) => Uint8Array;
  };
  const derivarConElNucleo = async (
    c: Uint8Array,
    s: Uint8Array,
    k: { m: number; t: number; p: number; longitud: number },
  ) => nucleo.argon2id(c, s, k);

  // ------------------------------------------------------------------
  // 0 · Preparación como postgres: paciente nuevo de Bruno y una cita pasada suya
  // ------------------------------------------------------------------
  paso = '0 · preparación';
  const bruno = sql(`select id from auth.users where email = 'bruno@psicogestion.test'`);
  const centro = sql(`select centro_id from public.perfiles_centros where perfil_id = '${bruno}' and principal`);
  assert(bruno && centro, 'no se encuentra a Bruno o su centro: ¿está sembrada la base (npm run seed)?');
  const paciente = sql(
    `insert into public.pacientes (nombre, apellidos, profesional_id, centro_id)
     values ('Paciente', 'De Prueba T-040 ${SUFIJO}', '${bruno}', '${centro}') returning id`,
  ).split('\n')[0]!;
  // Una cita de hace unos dos años, en un minuto al azar: no se solapa con la agenda de Bruno ni con
  // la de otra pasada.
  const cita = sql(
    `insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria, nota_operativa)
     select '${paciente}', '${bruno}', '${centro}', i, i + interval '50 minutes', 'Europe/Madrid', '${MARCA}'
       from (select date_trunc('minute', now()) - interval '730 days'
                    - (floor(random() * 200000))::int * interval '1 minute' as i) x
     returning id`,
  ).split('\n')[0]!;
  sql(`update public.citas set estado = 'realizada' where id = '${cita}'`);
  console.log(`✓ 0 · paciente ${paciente} y cita realizada ${cita} de Bruno`);

  // ------------------------------------------------------------------
  // 1 · Sesión real, segundo factor y candado
  // ------------------------------------------------------------------
  paso = '1 · sesión';
  const supabase = createClient(urlSupabase, claveAnonSupabase);
  const { data: entrada, error: errorSesion } = await supabase.auth.signInWithPassword({
    email: 'bruno@psicogestion.test',
    password: 'psico1234',
  });
  assert(!errorSesion && entrada.session, `signInWithPassword: ${errorSesion?.message}`);
  assert((await superarSegundoFactorSembrado(supabase)) === 'superado', 'no se superó el segundo factor sembrado de Bruno');
  const sesion = { supabase, usuario: entrada.user };
  assert((await fijarPinHistoria(sesion, PIN)).ok, 'no se pudo fijar el PIN de Bruno');
  assert((await desbloquearHistoria(sesion, PIN)).desbloqueado, 'el PIN de Bruno no desbloquea la historia');
  console.log('✓ 1 · sesión de Bruno, segundo factor y historia desbloqueada');

  // ------------------------------------------------------------------
  // 2 · Dos versiones firmadas, la segunda con anotaciones reservadas
  // ------------------------------------------------------------------
  paso = '2 · firmar dos versiones';
  const apertura = await abrirEditorDeNota(sesion, { pacienteId: paciente, citaId: cita, notaId: null, episodioId: null }, contexto);
  assert(apertura.estado === 'abierta' && apertura.nota.borrador, `abrirEditorDeNota devolvió «${apertura.estado}»`);
  const notaId = apertura.nota.notaId;
  const g1 = await guardarBorrador(sesion, {
    pacienteId: paciente,
    notaId,
    testigo: apertura.nota.borrador.testigo,
    texto: `Primera versión. ${MARCA_CUERPO}`,
    reservadas: '',
  });
  assert(g1.ok, `guardarBorrador v1: ${g1.ok ? '' : g1.motivo}`);
  const f1 = await firmarNota(sesion, { pacienteId: paciente, notaId, testigo: g1.testigo, alcance: 'individual', motivo: null });
  assert(f1.ok, `firmarNota v1: ${f1.ok ? '' : f1.motivo}`);
  const m = await empezarModificacion(sesion, { pacienteId: paciente, notaId });
  assert(m.ok && m.nota?.borrador, 'empezarModificacion no abrió un borrador');
  const g2 = await guardarBorrador(sesion, {
    pacienteId: paciente,
    notaId,
    testigo: m.nota.borrador.testigo,
    texto: `Segunda versión. ${MARCA_CUERPO}`,
    reservadas: `Anotación reservada. ${MARCA_RESERVADA}`,
  });
  assert(g2.ok, `guardarBorrador v2: ${g2.ok ? '' : g2.motivo}`);
  const f2 = await firmarNota(sesion, { pacienteId: paciente, notaId, testigo: g2.testigo, alcance: 'individual', motivo: 'Se amplía' });
  assert(f2.ok, `firmarNota v2: ${f2.ok ? '' : f2.motivo}`);
  console.log(`✓ 2 · nota ${notaId} con dos versiones firmadas`);

  // ------------------------------------------------------------------
  // 3 · Pedir la copia, cifrarla con el núcleo del visor y registrar el fichero
  // ------------------------------------------------------------------
  paso = '3 · copia';
  const copia = await pedirCopiaDeNota(sesion, { pacienteId: paciente, notaId, motivo: null, referencia: null }, contexto);
  assert(copia.ok, `pedirCopiaDeNota: ${copia.ok ? '' : copia.motivo}`);
  const { html, huellaHex } = await cifrarCopia(copia.copia, CONTRASENA, derivarConElNucleo);
  assert(!html.includes(MARCA_CUERPO) && !html.includes(MARCA_RESERVADA), 'el fichero lleva el contenido en claro');
  assert(!html.includes(CONTRASENA), 'el fichero lleva la contraseña');
  const registro = await registrarFichero(sesion, { exportacionId: copia.exportacionId, huellaHex });
  assert(registro.ok, `registrarFichero: ${registro.ok ? '' : registro.motivo}`);
  console.log(`✓ 3 · exportación ${copia.exportacionId} cifrada (${html.length} caracteres) y registrada`);

  // ------------------------------------------------------------------
  // 4 · Descifrar por el camino del visor: cabecera literal como AAD, Argon2id del núcleo
  // ------------------------------------------------------------------
  paso = '4 · descifrar';
  const cabecera = /<script type="application\/json" id="cabecera">([^<]*)<\/script>/.exec(html)?.[1];
  const carga = /<script type="application\/json" id="carga">([^<]*)<\/script>/.exec(html)?.[1];
  assert(cabecera !== undefined && carga !== undefined, 'el fichero no tiene cabecera o carga');
  const c = JSON.parse(cabecera) as { kdf: { m: number; t: number; p: number; longitud: number; sal: string }; nonce: string };
  const utf8 = new TextEncoder();
  const bytesDeClave = nucleo.argon2id(utf8.encode(CONTRASENA.normalize('NFC')), new Uint8Array(Buffer.from(c.kdf.sal, 'base64')), c.kdf);
  const clave = await crypto.subtle.importKey('raw', new Uint8Array(bytesDeClave), 'AES-GCM', false, ['decrypt']);
  const claro = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(Buffer.from(c.nonce, 'base64')), additionalData: utf8.encode(cabecera), tagLength: 128 },
    clave,
    new Uint8Array(Buffer.from(JSON.parse(carga) as string, 'base64')),
  );
  const descifrada = JSON.parse(new TextDecoder().decode(claro)) as typeof copia.copia;
  assert(isDeepStrictEqual(descifrada, copia.copia), 'la carga descifrada no es la copia');
  assert(JSON.stringify(descifrada).includes(MARCA_CUERPO), 'la copia descifrada no trae el cuerpo');
  console.log('✓ 4 · descifrada con el núcleo del visor: la carga es la copia, entera');

  // ------------------------------------------------------------------
  // 5 · C4: versión a versión contra la tabla, y la huella del fichero
  // ------------------------------------------------------------------
  paso = '5 · C4';
  const tabla = sql(
    `select numero_version || '|' || encode(huella, 'hex') || '|' || encode(huella_anterior, 'hex')
       from public.notas_clinicas_versiones where nota_id = '${notaId}' order by numero_version`,
  ).split('\n');
  const enCopia = descifrada.versiones.map((v) => `${v.numero}|${v.huella}|${v.huellaAnterior}`);
  assert(tabla.length === 2, `la nota debía tener dos versiones y tiene ${tabla.length}`);
  assert(isDeepStrictEqual(enCopia, tabla), `las versiones no coinciden:\n copia ${enCopia.join(' ; ')}\n tabla ${tabla.join(' ; ')}`);
  const sha = createHash('sha256').update(html, 'utf8').digest('hex');
  assert(sha === huellaHex, 'la huella que devuelve cifrarCopia no es sha256 del fichero');
  assert(
    sql(`select encode(huella_fichero, 'hex') from public.exportaciones_ficheros where exportacion_id = '${copia.exportacionId}'`) === sha,
    'exportaciones_ficheros.huella_fichero no es sha256 del fichero',
  );
  assert(
    sql(`select versiones::text from public.exportaciones where id = '${copia.exportacionId}'`) === '{1,2}',
    'exportaciones.versiones no es {1,2}',
  );
  console.log(`✓ C4 · dos versiones en orden, número, huella y huella anterior iguales a la tabla; huella del fichero ${sha.slice(0, 12)}…`);

  // ------------------------------------------------------------------
  // 6 · C5: ni la contraseña ni el contenido en la base, en los registros ni en la salida
  // ------------------------------------------------------------------
  paso = '6 · C5';
  const volcado = execFileSync(
    'docker',
    [
      'exec', '-i', contenedor, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--data-only',
      '-t', 'public.exportaciones', '-t', 'public.exportaciones_ficheros', '-t', 'public.accesos_historia',
      '-t', 'public.notificaciones', '-t', 'public.auditoria',
    ],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
  );
  assert(volcado.includes(copia.exportacionId), 'el volcado no trae la exportación: no vuelca lo que se cree');
  for (const [nombre, marca] of [['la contraseña', CONTRASENA], ['el contenido reservado', MARCA_RESERVADA], ['el cuerpo', MARCA_CUERPO]] as const) {
    assert(!volcado.includes(marca), `el pg_dump de las cinco tablas contiene ${nombre}`);
  }
  // Su sitio: el contenido sí está en notas_clinicas_versiones (si no, la búsqueda no prueba nada).
  assert(
    sql(`select count(*) from public.notas_clinicas_versiones where nota_id = '${notaId}' and cuerpo::text like '%${MARCA_CUERPO}%'`) === '2',
    'el cuerpo no está en notas_clinicas_versiones: la búsqueda en el volcado no prueba nada',
  );
  console.log(`✓ C5 · pg_dump --data-only de las cinco tablas (${volcado.length} caracteres): sin contraseña, sin reservadas, sin cuerpo`);

  const rest = contenedor.replace('supabase_db_', 'supabase_rest_');
  // El registro ENTERO, no solo desde el inicio del guion: las marcas llevan un sufijo aleatorio de
  // esta pasada, así que no pueden venir de otra, y una ventana corta puede salir vacía y no probar nada.
  for (const nombre of [contenedor, rest]) {
    // `docker logs` reparte entre stdout y stderr: se recogen los dos.
    const r = spawnSync('docker', ['logs', nombre], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
    assert(r.status === 0, `docker logs ${nombre}: ${r.stderr}`);
    const registros = `${r.stdout}${r.stderr}`;
    assert(registros.length > 0, `docker logs ${nombre} está vacío: la búsqueda no prueba nada`);
    for (const [que, marca] of [['la contraseña', CONTRASENA], ['el contenido reservado', MARCA_RESERVADA], ['el cuerpo', MARCA_CUERPO]] as const) {
      assert(!registros.includes(marca), `docker logs ${nombre} contiene ${que}`);
    }
    console.log(`✓ C5 · docker logs ${nombre} (${registros.length} caracteres): sin contraseña, sin reservadas, sin cuerpo`);
  }

  for (const [que, marca] of [['la contraseña', CONTRASENA], ['el contenido reservado', MARCA_RESERVADA], ['el cuerpo', MARCA_CUERPO]] as const) {
    assert(!salidaPropia.includes(marca), `la salida del guion contiene ${que}`);
  }
  console.log('✓ C5 · la salida del propio guion no contiene la contraseña, las reservadas ni el cuerpo');

  console.log('\n✓ T-040: todos los pasos del guion pasaron');
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
