#!/usr/bin/env node
// T-023b · CA4 · Corredor de scripts/t023b-concurrencia.sql.
//
//   npx tsx scripts/t023b-concurrencia.mjs
//
// (tsx y no node a secas: importa lib/cuentas/contenedor-proyecto.ts.)
//
// Dos carreras con DOS CONEXIONES psql que se solapan a la fuerza: cada una hace su insert, duerme dos
// segundos y solo entonces confirma. Confirma filas y NO es idempotente: exige `npx supabase db reset` +
// `npm run seed` recientes (repetirlo sin resetear choca con los UUID fijos, y es la señal correcta).
//
//   (el orden es 2 y luego 1: con el +25 ya asignado, dos devoluciones de −40 cabrían en 85)
//   1 · Dos asignaciones del MISMO cobro (+25) a la factura: exactamente una confirma; la otra lanza 23505
//       `cobros_facturas_cobro_unico`. La restricción vive en la base, no en la pantalla.
//   2 · Dos asignaciones de DOS devoluciones de −40 a una factura con 60 cobrados: exactamente una
//       confirma; la otra lanza 23514 `la devolución supera lo cobrado`. Lo serializa el candado de consejo.
//
// La salida se guarda en tickets/T-023b/ca4-concurrencia.json.

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { contenedorDelProyecto } from "../lib/cuentas/contenedor-proyecto.ts";

const raiz = path.dirname(fileURLToPath(import.meta.url));
const guion = readFileSync(path.join(raiz, "t023b-concurrencia.sql"), "utf8");
const contenedor = contenedorDelProyecto();
console.log(`Contenedor: ${contenedor}`);

const ADM = "b0080001-0000-4000-8000-000000000001";
const FACTURA = "c023b001-0000-4000-8000-000000000002";
const COB_SUELTO = "c023b001-0000-4000-8000-000000000004";
const DEV_1 = "c023b001-0000-4000-8000-000000000005";
const DEV_2 = "c023b001-0000-4000-8000-000000000006";

const argumentosBase = ["-U", "postgres", "-d", "postgres", "-X", "-q", "-v", "VERBOSITY=verbose"];

/** Una ejecución síncrona de psql dentro del contenedor, con la salida capturada. */
function psql(entrada, variables = {}) {
  const vars = Object.entries(variables).flatMap(([k, v]) => ["-v", `${k}=${v}`]);
  const r = spawnSync(
    "docker",
    ["exec", "-i", contenedor, "psql", ...argumentosBase, ...vars, "-v", "ON_ERROR_STOP=1", "-f", "-"],
    { input: entrada, encoding: "utf8" },
  );
  if (r.error) throw r.error;
  return { estado: r.status ?? 1, salida: r.stdout ?? "", error: r.stderr ?? "" };
}

function fase(nombre) {
  const r = psql(guion, { [`fase_${nombre}`]: 1 });
  process.stdout.write(r.salida);
  if (r.estado !== 0) {
    process.stderr.write(r.error);
    throw new Error(`La fase «${nombre}» de t023b-concurrencia.sql falló (psql salió con ${r.estado}).`);
  }
  return r.salida;
}

/** Una conexión que ejecuta `consulta` como el administrador (authenticated), duerme y confirma. */
function conexion(app, consulta) {
  const sql = [
    "begin;",
    "set local role authenticated;",
    `set local request.jwt.claims = '{"sub":"${ADM}","role":"authenticated","aal":"aal2"}';`,
    consulta,
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

const esperarMs = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera (sondeando pg_stat_activity) a que `app` esté bloqueada en un Lock. */
async function esperarEspera(app) {
  for (let i = 0; i < 40; i += 1) {
    const r = psql(
      `select count(*) from pg_stat_activity where application_name = '${app}' and wait_event_type = 'Lock';`,
    );
    const n = Number(r.salida.match(/^\s*(\d+)\s*$/m)?.[1] ?? 0);
    if (n > 0) return true;
    await esperarMs(250);
  }
  return false;
}

/** Dos conexiones solapadas (cada una con su consulta); devuelve sus resultados y si la segunda esperó. */
async function carrera(etiqueta, consultaA, consultaB) {
  const a = conexion(`t023b-${etiqueta}-1`, consultaA);
  await esperarMs(700);
  const b = conexion(`t023b-${etiqueta}-2`, consultaB);
  const espero = await esperarEspera(`t023b-${etiqueta}-2`);
  const [ra, rb] = await Promise.all([a, b]);
  return { espero, conexiones: [ra, rb] };
}

function cuenta() {
  const r = psql(guion, { fase_cuenta: 1 });
  const m = /CUENTA\|(\d+)\|(\d+)\|(-?[\d.]+)/.exec(r.salida);
  if (!m) throw new Error(`No se pudo contar el estado: ${r.salida}${r.error}`);
  return { asignaciones_del_suelto: Number(m[1]), asignaciones_de_devoluciones: Number(m[2]), suma_factura: Number(m[3]) };
}

const asignar = (cobro) =>
  `insert into public.cobros_facturas (cobro_id, factura_espejo_id) values ('${cobro}', '${FACTURA}');`;
const confirmo = (c) => /INSERT 0 1/.test(c.salida) || (c.estado === 0 && !/ERROR/.test(c.error));

const fallos = [];
function exigir(condicion, mensaje) {
  console.log(`${condicion ? "OK   " : "FALLO"} ${mensaje}`);
  if (!condicion) fallos.push(mensaje);
}

const evidencia = { ticket: "T-023b", criterio: "CA4", contenedor, carreras: {} };

try {
  fase("fijar");

  // -- 2 · (primero, con 60 cobrados) dos devoluciones que juntas superan lo cobrado --------------------------------------
  const c2 = await carrera("c2", asignar(DEV_1), asignar(DEV_2));
  const cuenta2 = cuenta();
  evidencia.carreras.dos_devoluciones = { ...c2, cuenta: cuenta2 };
  const buenas2 = c2.conexiones.filter((c) => confirmo(c));
  const malas2 = c2.conexiones.filter((c) => /23514/.test(c.error) && /la devolución supera lo cobrado/.test(c.error));
  exigir(c2.espero, "2 · la segunda conexión llegó a esperar un Lock (el candado de consejo)");
  exigir(
    buenas2.length === 1 && malas2.length === 1,
    `2 · una devolución confirma y la otra lanza 23514 (confirman ${buenas2.length}, 23514 ${malas2.length})`,
  );
  exigir(cuenta2.asignaciones_de_devoluciones === 1, `2 · exactamente una devolución asignada (hay ${cuenta2.asignaciones_de_devoluciones})`);
  exigir(
    cuenta2.suma_factura === 20,
    `2 · lo cobrado neto de la factura es 20 = 60 − 40, nunca negativo (es ${cuenta2.suma_factura})`,
  );

  // -- 1 · (después) el mismo cobro, dos veces; la suma final es 20 + 25 = 45 ----------------------------------------------------------
  const c1 = await carrera("c1", asignar(COB_SUELTO), asignar(COB_SUELTO));
  const cuenta1 = cuenta();
  evidencia.carreras.mismo_cobro = { ...c1, cuenta: cuenta1 };
  const buenas1 = c1.conexiones.filter((c) => confirmo(c));
  const malas1 = c1.conexiones.filter((c) => /23505/.test(c.error) && /cobros_facturas_cobro_unico/.test(c.error));
  exigir(c1.espero, "1 · la segunda conexión llegó a esperar un Lock (las dos se solapan de verdad)");
  exigir(
    buenas1.length === 1 && malas1.length === 1,
    `1 · una asignación confirma y la otra lanza 23505 cobros_facturas_cobro_unico (confirman ${buenas1.length}, 23505 ${malas1.length})`,
  );
  exigir(cuenta1.suma_factura === 45, `1 · la suma final de la factura es 45 (es ${cuenta1.suma_factura})`);
  exigir(cuenta1.asignaciones_del_suelto === 1, `1 · exactamente una fila para el cobro (hay ${cuenta1.asignaciones_del_suelto})`);
} finally {
  mkdirSync(path.join(raiz, "..", "tickets", "T-023b"), { recursive: true });
  evidencia.fallos = fallos;
  writeFileSync(
    path.join(raiz, "..", "tickets", "T-023b", "ca4-concurrencia.json"),
    JSON.stringify(evidencia, null, 2) + "\n",
  );
}

if (fallos.length > 0) {
  console.error(`\n${fallos.length} comprobación(es) fallida(s).`);
  process.exit(1);
}
console.log("\nt023b-concurrencia: completa.");
