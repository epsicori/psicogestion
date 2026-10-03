#!/usr/bin/env node
// T-038 · CA4 · Corredor de scripts/t038-concurrencia.sql.
//
//   npx tsx scripts/t038-concurrencia.mjs
//
// (tsx y no node a secas: importa lib/cuentas/contenedor-proyecto.ts.)
//
// Dos regeneraciones (y dos activaciones) del MISMO titular, con DOS CONEXIONES psql que
// se solapan a la fuerza: cada una llama a la función, duerme dos segundos y solo
// entonces confirma. Confirma filas y NO es idempotente: exige `npx supabase db reset`
// reciente (repetirlo sin resetear choca con los UUID fijos, y es la señal correcta).
//
// Tres pasadas:
//   A · regenerar_codigos_recuperacion() de producción (con candado de consejo):
//       exactamente DIEZ vigentes y DOS avisos.
//   B · CONTRAENSAYO: una copia de la misma función sin el candado. Tiene que dejar ≠ 10
//       vigentes (la hipótesis del ticket: veinte). Si deja diez, el candado no es lo que
//       evita los veinte y esta pasada falla para que alguien lo mida.
//   C · activación (generar_codigos_recuperacion) sobre un perfil sin lote: diez vigentes,
//       un aviso y un 42501 en uno de los dos.
//
// La salida de las tres pasadas se guarda en tickets/T-038/ca4-concurrencia.json.

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { contenedorDelProyecto } from "../lib/cuentas/contenedor-proyecto.ts";

const raiz = path.dirname(fileURLToPath(import.meta.url));
const guion = readFileSync(path.join(raiz, "t038-concurrencia.sql"), "utf8");
const contenedor = contenedorDelProyecto();
console.log(`Contenedor: ${contenedor}`);

const PERFIL = {
  A: "c0380001-0000-4000-8000-00000000000a",
  B: "c0380001-0000-4000-8000-00000000000b",
  C: "c0380001-0000-4000-8000-00000000000c",
};

const argumentosBase = ["-U", "postgres", "-d", "postgres", "-X", "-q", "-v", "VERBOSITY=verbose"];

/** Una ejecución síncrona de psql dentro del contenedor, con la salida capturada. */
function psql(entrada, variables = {}, { alto = true } = {}) {
  const vars = Object.entries(variables).flatMap(([k, v]) => ["-v", `${k}=${v}`]);
  const r = spawnSync(
    "docker",
    ["exec", "-i", contenedor, "psql", ...argumentosBase, ...vars, "-v", `ON_ERROR_STOP=${alto ? 1 : 0}`, "-f", "-"],
    { input: entrada, encoding: "utf8" },
  );
  if (r.error) throw r.error;
  return { estado: r.status ?? 1, salida: r.stdout ?? "", error: r.stderr ?? "" };
}

function fase(nombre, variables = {}) {
  const r = psql(guion, { [`fase_${nombre}`]: 1, ...variables });
  process.stdout.write(r.salida);
  if (r.estado !== 0) {
    process.stderr.write(r.error);
    throw new Error(`La fase «${nombre}» de t038-concurrencia.sql falló (psql salió con ${r.estado}).`);
  }
  return r.salida;
}

/** Una conexión que llama a `consulta`, duerme y confirma, como `authenticated` con aal2. */
function conexion(app, perfil, consulta) {
  const sql = [
    "begin;",
    "set local role authenticated;",
    `set local request.jwt.claims = '{"sub":"${perfil}","role":"authenticated","aal":"aal2"}';`,
    `${consulta}`,
    "select pg_sleep(2);",
    "commit;",
    "",
  ].join("\n");
  return new Promise((resolve) => {
    const hijo = spawn(
      "docker",
      ["exec", "-i", "-e", `PGAPPNAME=${app}`, contenedor, "psql", ...argumentosBase, "-v", "ON_ERROR_STOP=0", "-t", "-A", "-f", "-"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let salida = "";
    let error = "";
    hijo.stdout.on("data", (d) => (salida += d));
    hijo.stderr.on("data", (d) => (error += d));
    hijo.on("close", (estado) => resolve({ app, estado, salida, error }));
    hijo.stdin.end(sql);
  });
}

function esperarMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Espera (sondeando pg_stat_activity) a que `app` esté bloqueada en un Lock. */
async function esperarEspera(app) {
  for (let i = 0; i < 40; i += 1) {
    const r = psql(
      `select count(*) from pg_stat_activity where application_name = '${app}' and wait_event_type = 'Lock';`,
      {},
    );
    const n = Number(r.salida.match(/^\s*(\d+)\s*$/m)?.[1] ?? 0);
    if (n > 0) return true;
    await esperarMs(250);
  }
  return false;
}

/** Lanza dos conexiones solapadas y devuelve sus resultados y si la segunda llegó a esperar. */
async function carrera(perfil, consulta, etiqueta) {
  const a = conexion(`t038-${etiqueta}-1`, perfil, consulta);
  await esperarMs(700);
  const b = conexion(`t038-${etiqueta}-2`, perfil, consulta);
  const espero = await esperarEspera(`t038-${etiqueta}-2`);
  const [ra, rb] = await Promise.all([a, b]);
  return { espero, conexiones: [ra, rb] };
}

function cuenta(perfil) {
  const r = psql(guion, { fase_cuenta: 1, perfil });
  const m = /CUENTA\|[^|]*\|(\d+)\|(\d+)\|(\d+)/.exec(r.salida);
  if (!m) throw new Error(`No se pudo contar el perfil ${perfil}: ${r.salida}${r.error}`);
  return { vigentes: Number(m[1]), avisos: Number(m[2]), total: Number(m[3]) };
}

const fallos = [];
function exigir(condicion, mensaje) {
  console.log(`${condicion ? "OK   " : "FALLO"} ${mensaje}`);
  if (!condicion) fallos.push(mensaje);
}

const evidencia = { ticket: "T-038", criterio: "CA4", contenedor, pasadas: {} };

try {
  fase("fijar");

  // -- A · producción, con candado --------------------------------------------------------
  const consultaRegenerar =
    "select 'RESULTADO|' || motivo || '|' || coalesce(cardinality(codigos)::text, '0') from public.regenerar_codigos_recuperacion('clave-t038');";
  const a = await carrera(PERFIL.A, consultaRegenerar, "a");
  const cuentaA = cuenta(PERFIL.A);
  evidencia.pasadas.con_candado = { ...a, cuenta: cuentaA };
  exigir(a.espero, "A · la segunda conexión llegó a esperar un Lock (las dos se solapan de verdad)");
  exigir(
    a.conexiones.every((c) => c.salida.includes("RESULTADO|ok|10")),
    "A · las dos regeneraciones devuelven ok con diez códigos",
  );
  exigir(cuentaA.vigentes === 10, `A · exactamente diez vigentes (hay ${cuentaA.vigentes})`);
  exigir(cuentaA.avisos === 2, `A · dos avisos codigos_regenerados (hay ${cuentaA.avisos})`);

  // -- B · contraensayo, sin candado -----------------------------------------------------
  fase("copia");
  const b = await carrera(
    PERFIL.B,
    "select 'RESULTADO|' || motivo || '|' || coalesce(cardinality(codigos)::text, '0') from public.t038_sin_candado('clave-t038');",
    "b",
  );
  const cuentaB = cuenta(PERFIL.B);
  evidencia.pasadas.sin_candado = { ...b, cuenta: cuentaB };
  exigir(
    b.conexiones.every((c) => c.salida.includes("RESULTADO|ok|10")),
    "B · las dos regeneraciones SIN candado también devuelven ok con diez códigos (cada una cree ser la única)",
  );
  exigir(
    cuentaB.vigentes !== 10,
    `B · CONTRAENSAYO: sin el candado quedan ${cuentaB.vigentes} vigentes (≠ 10; la hipótesis predice 20). Con diez, el candado no sería lo que evita el desastre`,
  );

  // -- C · activación --------------------------------------------------------------------
  const c = await carrera(
    PERFIL.C,
    "select 'RESULTADO|' || count(*) from public.generar_codigos_recuperacion();",
    "c",
  );
  const cuentaC = cuenta(PERFIL.C);
  evidencia.pasadas.activacion = { ...c, cuenta: cuentaC };
  const buenas = c.conexiones.filter((x) => x.salida.includes("RESULTADO|10"));
  const rechazadas = c.conexiones.filter((x) => /42501/.test(x.error));
  exigir(buenas.length === 1 && rechazadas.length === 1, `C · una activación sale y la otra lanza 42501 (salen ${buenas.length}, rechazadas ${rechazadas.length})`);
  exigir(cuentaC.vigentes === 10, `C · exactamente diez vigentes (hay ${cuentaC.vigentes})`);
  exigir(cuentaC.avisos === 1, `C · un solo aviso (hay ${cuentaC.avisos})`);
} finally {
  const limpieza = psql(guion, { fase_limpieza: 1 });
  process.stdout.write(limpieza.salida);
  mkdirSync(path.join(raiz, "..", "tickets", "T-038"), { recursive: true });
  evidencia.fallos = fallos;
  writeFileSync(
    path.join(raiz, "..", "tickets", "T-038", "ca4-concurrencia.json"),
    JSON.stringify(evidencia, null, 2) + "\n",
  );
}

if (fallos.length > 0) {
  console.error(`\n${fallos.length} comprobación(es) fallida(s).`);
  process.exit(1);
}
console.log("\nt038-concurrencia: completa.");
