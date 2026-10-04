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
// Cuatro pasadas (ronda 2: la regeneración son DOS pasos; el paso uno confirma una
// autorización de 60 s y el paso dos la consume):
//   A · producción: dos comprobaciones buenas en serie (autorizadas = 2) y carrera de dos
//       regenerar_codigos_recuperacion(): las dos `ok|10`, DIEZ vigentes y DOS avisos.
//   B · MEDICIÓN: la misma carrera con una copia SIN el candado de consejo. Se exige lo
//       mismo que en A (diez vigentes, dos avisos, dos `ok|10`): el candado de fila del
//       consumo de la autorización serializa por sí solo. Se registra como medición.
//   D · CONTRAENSAYO EN ROJO: dos activaciones de una copia de generar_codigos_recuperacion()
//       SIN candado sobre un perfil sin lote. Tiene que dejar ≠ 10 vigentes (predicción: 20)
//       y dos avisos; ahí el candado de consejo SÍ es lo que evita el desastre.
//   C · activación de producción sobre un perfil sin lote: diez vigentes, un aviso y un
//       42501 en uno de los dos.
//
// La salida se guarda en tickets/T-038/ca4-concurrencia.json.

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
  D: "c0380001-0000-4000-8000-00000000000d",
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
function conexion(app, perfil, consulta, { dormir = true } = {}) {
  const sql = [
    "begin;",
    "set local role authenticated;",
    `set local request.jwt.claims = '{"sub":"${perfil}","role":"authenticated","aal":"aal2"}';`,
    `${consulta}`,
    dormir ? "select pg_sleep(2);" : "",
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

/** Una comprobación de contraseña BUENA, confirmada y sin solape (el paso uno). */
async function comprobarBuena(perfil, etiqueta) {
  const r = await conexion(
    `t038-${etiqueta}`,
    perfil,
    "select public.comprobar_contrasena_para_regenerar('clave-t038');",
    { dormir: false },
  );
  if (r.estado !== 0 || /ERROR/.test(r.error)) {
    throw new Error(`La comprobación buena de ${etiqueta} falló: ${r.error}`);
  }
}

function autorizadas(perfil) {
  const r = psql(guion, { fase_autorizadas: 1, perfil });
  return r.salida.match(/AUTORIZADAS\|[^|]*\|(\S+)/)?.[1];
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

const evidencia = { ticket: "T-038", ronda: 2, criterio: "CA4", contenedor, pasadas: {} };

try {
  fase("fijar");

  const consultaRegenerar = (f) =>
    `select 'RESULTADO|' || motivo || '|' || coalesce(cardinality(codigos)::text, '0') from public.${f}();`;
  const dosVigentes = async (perfil, etiqueta) => {
    await comprobarBuena(perfil, `${etiqueta}-paso1-1`);
    await comprobarBuena(perfil, `${etiqueta}-paso1-2`);
    return autorizadas(perfil);
  };

  // -- A · producción -------------------------------------------------------------------
  const autA = await dosVigentes(PERFIL.A, "a");
  exigir(autA === "2", `A · dos comprobaciones buenas dejan regeneraciones_autorizadas = 2 (hay ${autA})`);
  const a = await carrera(PERFIL.A, consultaRegenerar("regenerar_codigos_recuperacion"), "a");
  const cuentaA = cuenta(PERFIL.A);
  evidencia.pasadas.con_candado = { ...a, autorizadas_previas: autA, cuenta: cuentaA };
  exigir(a.espero, "A · la segunda conexión llegó a esperar un Lock (las dos se solapan de verdad)");
  exigir(
    a.conexiones.every((c) => c.salida.includes("RESULTADO|ok|10")),
    "A · las dos regeneraciones devuelven ok con diez códigos",
  );
  exigir(cuentaA.vigentes === 10, `A · exactamente diez vigentes (hay ${cuentaA.vigentes})`);
  exigir(cuentaA.avisos === 2, `A · dos avisos codigos_regenerados (hay ${cuentaA.avisos})`);

  // -- B · medición sin candado de consejo -------------------------------------------------
  fase("copia");
  const autB = await dosVigentes(PERFIL.B, "b");
  exigir(autB === "2", `B · dos comprobaciones buenas dejan regeneraciones_autorizadas = 2 (hay ${autB})`);
  const b = await carrera(PERFIL.B, consultaRegenerar("t038_regenerar_sin_candado"), "b");
  const cuentaB = cuenta(PERFIL.B);
  evidencia.pasadas.sin_candado_consejo = {
    ...b,
    autorizadas_previas: autB,
    cuenta: cuentaB,
    medicion:
      "sin candado de consejo, el candado de fila del consumo de la autorización serializa la regeneración",
  };
  exigir(b.espero, "B · la segunda conexión llegó a esperar un Lock (las dos se solapan de verdad)");
  exigir(
    b.conexiones.every((c) => c.salida.includes("RESULTADO|ok|10")),
    "B · las dos regeneraciones sin candado de consejo devuelven ok con diez códigos",
  );
  exigir(cuentaB.vigentes === 10, `B · MEDICIÓN: diez vigentes sin candado de consejo (hay ${cuentaB.vigentes})`);
  exigir(cuentaB.avisos === 2, `B · dos avisos (hay ${cuentaB.avisos})`);

  // -- D · contraensayo en rojo: activación sin candado ----------------------------------------
  const d = await carrera(PERFIL.D, "select 'RESULTADO|' || count(*) from public.t038_activar_sin_candado();", "d");
  const cuentaD = cuenta(PERFIL.D);
  evidencia.pasadas.activacion_sin_candado = { ...d, cuenta: cuentaD };
  exigir(
    cuentaD.vigentes !== 10,
    `D · CONTRAENSAYO: sin candado la activación deja ${cuentaD.vigentes} vigentes (≠ 10; predicción 20)`,
  );
  exigir(cuentaD.avisos === 2, `D · dos avisos (hay ${cuentaD.avisos})`);

  // -- C · activación de producción ------------------------------------------------------
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
