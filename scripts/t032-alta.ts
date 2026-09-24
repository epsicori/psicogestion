// T-032 · Guion de punta a punta (diseño §1.10). `npx tsx scripts/t032-alta.ts`.
//
// Esto NO es un banco de RLS construyendo el estado a mano (regla de supabase.md,
// aprendida en T-013a): entra con una sesión real de profesional y llama a lo mismo que
// llamaría la Server Action — `cifrarIdentificacion()`, el RPC `alta_paciente()`,
// `leer_identificacion()` y `descifrarIdentificacion()` — contra la base local de verdad.
// Es la única prueba de que la transacción de `alta_paciente()` (§6 de la migración) es
// real y de que el rastro de auditoría de `leer_identificacion()` (ADR-060) se escribe
// donde dice que se escribe.
//
// Antes de importar nada de lib/cifrado o lib/supabase/administracion —los tres llevan
// `import 'server-only'`, que Next sustituye por un módulo inerte al empaquetar para el
// servidor pero que, fuera de Next (aquí, bajo tsx puro), lanza incondicionalmente al
// cargarse (comprobado con un guion mínimo: `Error: This module cannot be imported from
// a Client Component module`)— este guion neutraliza esa única línea con un parche de
// `Module._load`. No se toca el paquete ni los ficheros de lib/: el parche vive aquí,
// dura lo que dura el proceso, y solo intercepta el nombre exacto `server-only`.

import { readFileSync } from 'node:fs';
import Module from 'node:module';

for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cargarOriginal = (Module as any)._load;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module as any)._load = function (request: string, ...resto: any[]) {
  if (request === 'server-only') return {};
  return cargarOriginal.apply(this, [request, ...resto]);
};

async function principal() {
  const { createClient } = await import('@supabase/supabase-js');
  const { urlSupabase, claveAnonSupabase } = await import('../lib/supabase/config');
  const { cifrarIdentificacion, descifrarIdentificacion } = await import(
    '../lib/cifrado/identificacion'
  );

  let pasoActual = '(sin empezar)';
  function fallar(mensaje: string): never {
    console.error(`\n✗ FALLO en «${pasoActual}»: ${mensaje}`);
    process.exit(1);
  }
  function assert(condicion: unknown, mensaje: string): asserts condicion {
    if (!condicion) fallar(mensaje);
  }

  // -----------------------------------------------------------------------
  // 1 · Sesión real de profesional
  // -----------------------------------------------------------------------
  pasoActual = '1 · sesión de profesional';
  const supabase = createClient(urlSupabase, claveAnonSupabase);
  const { data: sesion, error: errorSesion } = await supabase.auth.signInWithPassword({
    email: 'ana@psicogestion.test',
    password: 'psico1234',
  });
  assert(!errorSesion && sesion.session, `signInWithPassword: ${errorSesion?.message}`);
  console.log('✓ 1 · sesión de ana@psicogestion.test abierta');

  // -----------------------------------------------------------------------
  // 2 · cifrarIdentificacion() + alta_paciente()
  // -----------------------------------------------------------------------
  pasoActual = '2 · alta';
  // DNI al azar con su letra de control (B7/H12 de la revisión): con uno fijo, la segunda
  // ejecución sin `db reset` caía en el paso 2 con 23505, el mismo código que el paso 4
  // espera como éxito, y el fallo se confundía con la negativa. Colisionar con un DNI ya
  // dado de alta exige acertar uno entre cien millones.
  const numeroDni = Math.floor(Math.random() * 100_000_000);
  const dniPrueba =
    String(numeroDni).padStart(8, '0') + 'TRWAGMYFPDXBNJZSQVHLCKE'[numeroDni % 23];
  const domicilioPrueba = 'Calle de Prueba T-032, 1, 28001 Madrid';
  const enviado = await cifrarIdentificacion({
    documento: dniPrueba,
    domicilio: domicilioPrueba,
  });

  const { data: idPaciente, error: errorAlta } = await supabase.rpc('alta_paciente', {
    p_nombre: 'Paciente',
    p_apellidos: 'De Prueba T-032',
    p_fecha_nacimiento: '1990-01-01',
    p_sexo: null,
    p_telefono: null,
    p_tipo_documento: enviado.p_tipo_documento,
    p_dni_cifrado: enviado.p_dni_cifrado,
    p_dni_nonce: enviado.p_dni_nonce,
    p_dni_etiqueta: enviado.p_dni_etiqueta,
    p_dni_indice: enviado.p_dni_indice,
    p_domicilio_cifrado: enviado.p_domicilio_cifrado,
    p_domicilio_nonce: enviado.p_domicilio_nonce,
    p_domicilio_etiqueta: enviado.p_domicilio_etiqueta,
    p_clave_version: enviado.p_clave_version,
    p_indice_clave_version: enviado.p_indice_clave_version,
    // Con salud básica: es la gemela positiva del recuento del paso 5.
    p_alergias: 'Penicilina',
    p_medicacion_actual: null,
  });
  assert(!errorAlta && typeof idPaciente === 'string', `alta_paciente: ${errorAlta?.message}`);
  console.log(`✓ 2 · alta_paciente() devolvió ${idPaciente}`);

  // -----------------------------------------------------------------------
  // 3 · leer_identificacion() + descifrarIdentificacion(), comparación byte a byte,
  //     y el rastro de auditoría (sube en 1, una segunda lectura no lo mueve)
  // -----------------------------------------------------------------------
  pasoActual = '3 · lectura y rastro de auditoría';

  async function contarLecturas(): Promise<number> {
    const { count, error } = await supabase
      .from('auditoria')
      .select('id', { count: 'exact', head: true })
      .eq('operacion', 'LECTURA_IDENTIFICACION')
      .eq('registro_id', idPaciente as string);
    assert(!error, `contar auditoria: ${error?.message}`);
    return count ?? 0;
  }

  const antes = await contarLecturas();

  const { data: filasLeidas, error: errorLectura } = await supabase.rpc('leer_identificacion', {
    p_paciente_id: idPaciente,
  });
  assert(!errorLectura, `leer_identificacion: ${errorLectura?.message}`);
  assert(Array.isArray(filasLeidas) && filasLeidas.length === 1, 'leer_identificacion no devolvió una fila');

  const leido = await descifrarIdentificacion(filasLeidas[0]);
  assert(
    leido.documento === dniPrueba,
    `el documento descifrado (${leido.documento}) no coincide con el enviado (${dniPrueba})`,
  );
  assert(
    leido.domicilio === domicilioPrueba,
    `el domicilio descifrado (${leido.domicilio}) no coincide con el enviado (${domicilioPrueba})`,
  );
  console.log('✓ 3a · leer_identificacion() + descifrarIdentificacion() coincide byte a byte con lo enviado');

  const despuesDeUna = await contarLecturas();
  assert(
    despuesDeUna === antes + 1,
    `la auditoría subió en ${despuesDeUna - antes}, no en 1 (antes=${antes}, después=${despuesDeUna})`,
  );
  console.log('✓ 3b · la auditoría subió exactamente en 1 tras la primera lectura');

  const { error: errorSegundaLectura } = await supabase.rpc('leer_identificacion', {
    p_paciente_id: idPaciente,
  });
  assert(!errorSegundaLectura, `segunda leer_identificacion: ${errorSegundaLectura?.message}`);
  const despuesDeDos = await contarLecturas();
  assert(
    despuesDeDos === despuesDeUna,
    `una segunda lectura inmediata volvió a subir la auditoría (${despuesDeUna} → ${despuesDeDos}); la ventana de 15 minutos no dedupica`,
  );
  console.log('✓ 3c · una segunda lectura inmediata NO añade un segundo rastro (ventana de 15 minutos)');

  // -----------------------------------------------------------------------
  // 4 · el mismo DNI dos veces: 23505, y el recuento de pacientes no cambia
  // -----------------------------------------------------------------------
  pasoActual = '4 · alta doble del mismo DNI';

  async function contarPacientes(): Promise<number> {
    const { count, error } = await supabase
      .from('pacientes')
      .select('id', { count: 'exact', head: true });
    assert(!error, `contar pacientes: ${error?.message}`);
    return count ?? 0;
  }

  const pacientesAntes = await contarPacientes();
  const { data: idRepetido, error: errorRepetido } = await supabase.rpc('alta_paciente', {
    p_nombre: 'Paciente',
    p_apellidos: 'Repetido T-032',
    p_fecha_nacimiento: '1990-01-01',
    p_sexo: null,
    p_telefono: null,
    p_tipo_documento: enviado.p_tipo_documento,
    p_dni_cifrado: enviado.p_dni_cifrado,
    p_dni_nonce: enviado.p_dni_nonce,
    p_dni_etiqueta: enviado.p_dni_etiqueta,
    p_dni_indice: enviado.p_dni_indice,
    p_domicilio_cifrado: enviado.p_domicilio_cifrado,
    p_domicilio_nonce: enviado.p_domicilio_nonce,
    p_domicilio_etiqueta: enviado.p_domicilio_etiqueta,
    p_clave_version: enviado.p_clave_version,
    p_indice_clave_version: enviado.p_indice_clave_version,
    p_alergias: null,
    p_medicacion_actual: null,
  });
  assert(
    !idRepetido && errorRepetido && errorRepetido.code === '23505',
    `la segunda alta con el mismo DNI debía fallar con 23505 y falló con ${errorRepetido?.code ?? '(ningún error)'}`,
  );
  const pacientesDespues = await contarPacientes();
  assert(
    pacientesDespues === pacientesAntes,
    `el recuento de pacientes cambió (${pacientesAntes} → ${pacientesDespues}) pese al 23505: la transacción no fue atómica`,
  );
  console.log('✓ 4 · el segundo alta con el mismo DNI falló con 23505 y el recuento de pacientes no cambió');

  // -----------------------------------------------------------------------
  // 5 · alta mínima (criterio 12, M5 de la revisión): solo nombre, apellidos y fecha.
  //     Ninguna fila en pacientes_identificacion ni en pacientes_salud_basica.
  // -----------------------------------------------------------------------
  pasoActual = '5 · alta mínima';
  // Lo mismo que manda la Server Action con los opcionales vacíos: cifrarIdentificacion()
  // sin documento ni domicilio (no pide ninguna clave, M3) y solo las claves no nulas de su
  // resultado; el resto de opcionales, ausentes (Postgres aplica su default null).
  const minimo = await cifrarIdentificacion({});
  const soloPresentes = Object.fromEntries(
    Object.entries(minimo).filter(([, valor]) => valor !== null),
  );
  const { data: idMinimo, error: errorMinimo } = await supabase.rpc('alta_paciente', {
    p_nombre: 'Paciente',
    p_apellidos: 'Mínimo T-032',
    p_fecha_nacimiento: '1985-06-15',
    ...soloPresentes,
  });
  assert(!errorMinimo && typeof idMinimo === 'string', `alta_paciente mínima: ${errorMinimo?.message}`);

  // El recuento va con la sesión de Ana, que es la profesional asignada de los dos
  // pacientes (alta_paciente() la pone desde auth.uid()), así que la RLS le deja ver sus
  // filas. service_role no sirve: no tiene grant sobre estas tablas (comprobado en
  // information_schema.role_table_grants). La identificación se cuenta por
  // leer_identificacion(), el único camino de lectura (ADR-060), no con un select directo.
  // Un 0 bajo RLS solo prueba algo junto a su gemela: el paciente del paso 2, misma sesión,
  // mismo camino, da 1 y 1.
  async function contarIdentificacion(pacienteId: string): Promise<number> {
    const { data, error } = await supabase.rpc('leer_identificacion', { p_paciente_id: pacienteId });
    assert(!error && Array.isArray(data), `leer_identificacion: ${error?.message}`);
    return data.length;
  }
  async function contarSaludBasica(pacienteId: string): Promise<number> {
    const { count, error } = await supabase
      .from('pacientes_salud_basica')
      .select('paciente_id', { count: 'exact', head: true })
      .eq('paciente_id', pacienteId);
    assert(!error, `contar pacientes_salud_basica: ${error?.message}`);
    return count ?? 0;
  }
  const identificacionCompleto = await contarIdentificacion(idPaciente);
  const saludCompleto = await contarSaludBasica(idPaciente);
  assert(
    identificacionCompleto === 1 && saludCompleto === 1,
    `GEMELA: el paciente del paso 2 debía dar 1 y 1 y da ${identificacionCompleto} de identificación y ${saludCompleto} de salud básica`,
  );
  const identificacionMinimo = await contarIdentificacion(idMinimo);
  const saludMinimo = await contarSaludBasica(idMinimo);
  assert(
    identificacionMinimo === 0,
    `el alta mínima dejó ${identificacionMinimo} fila(s) en pacientes_identificacion`,
  );
  assert(saludMinimo === 0, `el alta mínima dejó ${saludMinimo} fila(s) en pacientes_salud_basica`);
  console.log(
    `✓ 5 · alta mínima ${idMinimo}: 0 filas en pacientes_identificacion y 0 en pacientes_salud_basica (gemela: el paciente del paso 2, 1 y 1)`,
  );

  console.log('\n✓ t032-alta: completo. La transacción de alta_paciente() es de verdad.');
}

principal().catch((error: unknown) => {
  console.error('\n✗ Error inesperado:', error);
  process.exit(1);
});
