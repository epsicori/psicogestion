#!/usr/bin/env node
// T-040 · Oráculo por HTTP contra PostgREST (diseño B0.3.5, CB1 y CB7), con el patrón de
// `scripts/t042-oraculo.mjs`.
//
//   npx tsx scripts/t040-oraculo.mjs
//
// CB1 · Contenido ⇒ rastro. `rpc/exportar_nota` se llama como AUT (autora, sin motivo) y como ADM
// (con `peticion_paciente`) en seis formas: S1 POST, S2 `Accept` de objeto, S3 `Prefer: tx=rollback`,
// S4 `Prefer: handling=strict, max-affected=0`, S5 GET y S6 POST con `Accept` de objeto y un filtro
// `?exportacion_id=eq.<uuid>`. Invariante por llamada: si el cuerpo trae `MARCA-CUERPO-1` o un
// `exportacion_id`, entonces Δexportaciones = +1, Δaccesos_historia (exportacion) = +1 y
// Δnotificaciones de ese origen = +2 (ADM) o 0 (AUT); si no trae nada de eso, las tres Δ son 0.
//
// CB7 · Registro concurrente. Una sesión `psql` como `postgres` inserta el fichero de una exportación
// de AUT y no confirma; AUT llama por HTTP a `registrar_fichero_exportado`, que espera; el bloqueador
// confirma y la llamada responde 23505 con el mensaje propio, no con el de la clave primaria.
//
// CONFIRMA filas: la fijación usa uuids aleatorios por pasada (centro, tres perfiles, paciente,
// episodio, nota y su versión), así que se repite sin `db reset`. Escribe
// tickets/T-040/oraculo-postgrest.json.

import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { contenedorDelProyecto } from "../lib/cuentas/contenedor-proyecto.ts";

const raiz = path.dirname(fileURLToPath(import.meta.url));
const contenedor = contenedorDelProyecto();
const MARCA = "MARCA-CUERPO-1";
const PIN_AUT = "404071";
const PIN_ADM = "404072";
const REFERENCIA = "REF-ORACULO-40";

const PSQL_ARGS = ["exec", "-i", contenedor, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"];

function psql(sql) {
  const r = spawnSync("docker", [...PSQL_ARGS, "-f", "-"], { input: sql, encoding: "utf8" });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`psql salió con ${r.status}: ${r.stderr}`);
  return (r.stdout ?? "").trim();
}

function entorno() {
  const r = spawnSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8", shell: true });
  const out = {};
  for (const linea of (r.stdout ?? "").split(/\r?\n/)) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(linea.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = entorno();
const API_URL = env.API_URL;
const ANON_KEY = env.ANON_KEY;
let JWT_SECRET = env.JWT_SECRET;
if (!API_URL || !ANON_KEY) throw new Error("`supabase status -o env` no dio API_URL y ANON_KEY (¿está arrancado?).");
if (!JWT_SECRET) {
  const rest = contenedor.replace("supabase_db_", "supabase_rest_");
  const r = spawnSync("docker", ["exec", rest, "printenv", "PGRST_JWT_SECRET"], { encoding: "utf8" });
  const jwk = JSON.parse(r.stdout.trim());
  const k = (jwk.keys ?? [jwk]).find((x) => x.kty === "oct")?.k;
  if (!k) throw new Error("No hay clave oct en PGRST_JWT_SECRET.");
  JWT_SECRET = Buffer.from(k, "base64url");
}

const b64 = (x) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");
function token(sub) {
  const iat = Math.floor(Date.now() / 1000);
  const cuerpo = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    sub,
    role: "authenticated",
    aud: "authenticated",
    aal: "aal2",
    session_id: randomUUID(),
    iat,
    exp: iat + 900,
  })}`;
  return `${cuerpo}.${createHmac("sha256", JWT_SECRET).update(cuerpo).digest("base64url")}`;
}

// -- fijación -------------------------------------------------------------------------------
const id = () => randomUUID();
const F = { C: id(), ADM: id(), TIT: id(), AUT: id(), PA: id(), E: id(), N: id() };
const sufijo = randomBytes(4).toString("hex");
const usuario = (uid, correo, meta) => `
  ('00000000-0000-0000-0000-000000000000', '${uid}', 'authenticated', 'authenticated', '${correo}', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '${JSON.stringify(meta)}'::jsonb,
   extensions.crypt('clave-oraculo', extensions.gen_salt('bf', 4)), '', '', '', '')`;
const creada = new Date().toISOString();
const ayudantes = readFileSync(path.join(raiz, "rls", "00-ayudantes.sql"), "utf8");
psql(`${ayudantes}
  insert into public.centros (id, nombre) values ('${F.C}', 'Centro Oraculo 40 ${sufijo}');
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, encrypted_password,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values
    ${usuario(F.ADM, `adm-${sufijo}@t040.test`, { rol: "administrador", nombre_completo: "Admin Oraculo" })},
    ${usuario(F.TIT, `tit-${sufijo}@t040.test`, { rol: "profesional_sanitario", nombre_completo: "Titular Oraculo", centro_id: F.C })},
    ${usuario(F.AUT, `aut-${sufijo}@t040.test`, { rol: "profesional_sanitario", nombre_completo: "Autora Oraculo", centro_id: F.C })};
  insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id)
  values ('${F.PA}', 'Oraculo40', 'Paciente', '${F.TIT}', '${F.C}');
  insert into public.episodios_asistenciales (id, paciente_id, profesional_id, centro_id, modalidad_relacional, motivo_consulta)
  values ('${F.E}', '${F.PA}', '${F.AUT}', '${F.C}', 'individual', 'Oráculo T-040');
  insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id) values ('${F.N}', '${F.PA}', '${F.E}', '${F.AUT}');
  insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en)
  values ('${F.N}', '{"texto":"${MARCA}"}', pg_temp.sobre_prueba('${F.N}', '${F.AUT}', timestamptz '${creada}',
          '{"texto":"${MARCA}"}'::jsonb), 'individual', '${F.AUT}', timestamptz '${creada}');
  insert into public.pines_historia (perfil_id, hash) values
    ('${F.AUT}', extensions.crypt('${PIN_AUT}', extensions.gen_salt('bf', 4))),
    ('${F.ADM}', extensions.crypt('${PIN_ADM}', extensions.gen_salt('bf', 4)));
`);
console.log(`Fijación ${JSON.stringify(F)}; API ${API_URL}`);

const JWT = { AUT: token(F.AUT), ADM: token(F.ADM) };

async function llamar(jwt, metodo, ruta, { cuerpo, extra, consulta } = {}) {
  const url = `${API_URL}/rest/v1/rpc/${ruta}${consulta ?? ""}`;
  const r = await fetch(url, {
    method: metodo,
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", ...(extra ?? {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: r.status, cuerpo: await r.text() };
}

// El candado se abre por el camino real, en dos pasos y por HTTP (T-042).
async function abrirCandado(jwt, pin) {
  await llamar(jwt, "POST", "comprobar_pin_historia", { cuerpo: { p_pin: pin } });
  const r = await llamar(jwt, "POST", "desbloquear_historia", { cuerpo: {} });
  const fila = JSON.parse(r.cuerpo);
  return (Array.isArray(fila) ? fila[0] : fila)?.motivo;
}

function recuentos() {
  const [exportaciones, accesos, avisos] = psql(`
    select (select count(*) from public.exportaciones where paciente_id = '${F.PA}') || ',' ||
           (select count(*) from public.accesos_historia where paciente_id = '${F.PA}' and tipo = 'exportacion') || ',' ||
           (select count(*) from public.notificaciones n where n.origen_tabla = 'exportaciones'
              and n.origen_id in (select e.id from public.exportaciones e where e.paciente_id = '${F.PA}'));
  `).split(",").map(Number);
  return { exportaciones, accesos, avisos };
}

const fallos = [];
function exigir(condicion, mensaje) {
  console.log(`${condicion ? "OK   " : "FALLO"} ${mensaje}`);
  if (!condicion) fallos.push(mensaje);
}
class Parada extends Error {}

const evidencia = { ticket: "T-040", fijacion: F, cb1: {}, cb7: {} };
const conContenido = (r) => r.cuerpo.includes(MARCA) || r.cuerpo.includes('"exportacion_id"');
const exportacionDe = (r) => {
  try {
    const x = JSON.parse(r.cuerpo);
    return (Array.isArray(x) ? x[0] : x)?.exportacion_id ?? null;
  } catch {
    return null;
  }
};

// -- bloqueador (T-042 C4, generalizado al número de peticiones) ------------------------------
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const p = spawn("docker", [...PSQL_ARGS, "-f", "-"]);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve(out.trim()) : reject(new Error(`psql salió con ${c}: ${err}`))));
    p.stdin.end(sql);
  });
}
async function esperarHasta(sql, esperado, maxMs) {
  const limite = Date.now() + maxMs;
  for (;;) {
    const valor = Number(await psqlAsync(sql));
    if (valor === esperado) return { ok: true, valor };
    if (Date.now() >= limite) return { ok: false, valor };
    await dormir(50);
  }
}
async function conBloqueador(nombre, sqlRetener, patronFuncion, enEspera, lanzar) {
  const bloq = spawn(
    "docker",
    ["exec", "-i", "-e", "PGAPPNAME=t040-bloqueador", contenedor, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1"],
    { stdio: ["pipe", "ignore", "ignore"] },
  );
  const salida = new Promise((resolve) => bloq.on("close", resolve));
  bloq.on("error", () => {});
  let soltado = false;
  const soltar = async (final) => {
    if (soltado) return;
    soltado = true;
    bloq.stdin.write(`${final};\n`);
    bloq.stdin.end();
    await salida;
  };
  try {
    bloq.stdin.write(`begin;\n${sqlRetener}\n`);
    const ret = await esperarHasta(
      "select count(*) from pg_stat_activity where application_name = 't040-bloqueador' and state = 'idle in transaction';",
      1,
      3000,
    );
    if (!ret.ok) throw new Parada(`${nombre} no concluyente: el bloqueador no retiene (${ret.valor}/1)`);
    const promesas = lanzar();
    const espera = await esperarHasta(
      `select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%${patronFuncion}%' and pid <> pg_backend_pid();`,
      enEspera,
      4000,
    );
    if (!espera.ok) {
      await soltar("rollback");
      await Promise.allSettled(promesas);
      throw new Parada(`${nombre} no concluyente: ${espera.valor}/${enEspera} en espera`);
    }
    await soltar("commit");
    return { en_espera: espera.valor, respuestas: await Promise.all(promesas) };
  } finally {
    await soltar("rollback").catch(() => {});
    if (bloq.exitCode === null) bloq.kill();
  }
}

try {
  exigir((await abrirCandado(JWT.AUT, PIN_AUT)) === "ok", "preparación · AUT abre el candado por HTTP");
  exigir((await abrirCandado(JWT.ADM, PIN_ADM)) === "ok", "preparación · ADM abre el candado por HTTP");

  const actores = {
    AUT: { jwt: JWT.AUT, cuerpo: { p_paciente_id: F.PA, p_nota_id: F.N }, avisos: 0 },
    ADM: {
      jwt: JWT.ADM,
      cuerpo: { p_paciente_id: F.PA, p_nota_id: F.N, p_motivo: "peticion_paciente", p_referencia: REFERENCIA },
      avisos: 2,
    },
  };
  const consultaGet = (c) =>
    "?" + Object.entries(c).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const formas = {
    S1: { descripcion: "POST normal", metodo: "POST", opciones: {} },
    S2: { descripcion: "POST con Accept: objeto singular", metodo: "POST", opciones: { extra: { Accept: "application/vnd.pgrst.object+json" } } },
    S3: { descripcion: "POST con Prefer: tx=rollback", metodo: "POST", opciones: { extra: { Prefer: "tx=rollback" } } },
    S4: { descripcion: "POST con Prefer: handling=strict, max-affected=0", metodo: "POST", opciones: { extra: { Prefer: "handling=strict, max-affected=0" } } },
    S5: { descripcion: "GET con los parámetros en la consulta", metodo: "GET", opciones: {} },
    S6: {
      descripcion: "POST con Accept: objeto singular y ?exportacion_id=eq.<uuid aleatorio>",
      metodo: "POST",
      opciones: { extra: { Accept: "application/vnd.pgrst.object+json" }, consulta: `?exportacion_id=eq.${randomUUID()}` },
    },
  };

  for (const [actor, a] of Object.entries(actores)) {
    evidencia.cb1[actor] = {};
    for (const [nombre, forma] of Object.entries(formas)) {
      const antes = recuentos();
      const r =
        forma.metodo === "GET"
          ? await llamar(a.jwt, "GET", "exportar_nota", { consulta: consultaGet(a.cuerpo) })
          : await llamar(a.jwt, "POST", "exportar_nota", { cuerpo: a.cuerpo, ...forma.opciones });
      const despues = recuentos();
      const delta = {
        exportaciones: despues.exportaciones - antes.exportaciones,
        accesos: despues.accesos - antes.accesos,
        avisos: despues.avisos - antes.avisos,
      };
      const contenido = conContenido(r);
      evidencia.cb1[actor][nombre] = {
        descripcion: forma.descripcion,
        estado: r.estado,
        contenido,
        delta,
        cuerpo: contenido ? `(${r.cuerpo.length} caracteres con contenido; no se copia)` : r.cuerpo.slice(0, 300),
      };
      const esperado = contenido ? { exportaciones: 1, accesos: 1, avisos: a.avisos } : { exportaciones: 0, accesos: 0, avisos: 0 };
      exigir(
        JSON.stringify(delta) === JSON.stringify(esperado),
        `CB1 · ${actor} ${nombre} (${forma.descripcion}): ${r.estado}, contenido ${contenido}, Δ ${JSON.stringify(delta)} = ${JSON.stringify(esperado)}`,
      );
      if (["S1", "S2", "S3"].includes(nombre)) {
        exigir(r.estado === 200 && contenido, `CB1 · ${actor} ${nombre}: 200 con contenido (${r.estado})`);
      }
      if (nombre === "S3") evidencia.cb1[actor].tx_rollback_ignorado = contenido && delta.exportaciones === 1;
      if (nombre === "S5") {
        exigir(
          r.estado >= 400 && r.estado < 500 && r.cuerpo.includes("exige una transacción de escritura"),
          `CB1 · ${actor} S5: 4xx con «exige una transacción de escritura» (${r.estado} ${r.cuerpo.slice(0, 120)})`,
        );
      }
      if (nombre === "S1") evidencia.cb1[actor].exportacion_s1 = exportacionDe(r);
    }
  }

  // CB7 · registro concurrente sobre la exportación de AUT de S1.
  {
    const exp = evidencia.cb1.AUT.exportacion_s1;
    exigir(typeof exp === "string", `CB7 · preparación: AUT tiene una exportación de S1 (${exp})`);
    const hex = randomBytes(32).toString("hex");
    const r = await conBloqueador(
      "CB7",
      `insert into public.exportaciones_ficheros (exportacion_id, huella_fichero) values ('${exp}', decode('${hex}', 'hex'));`,
      "registrar_fichero_exportado",
      1,
      () => [llamar(JWT.AUT, "POST", "registrar_fichero_exportado", { cuerpo: { p_exportacion_id: exp, p_huella_hex: hex } })],
    );
    const [resp] = r.respuestas;
    evidencia.cb7 = { exportacion: exp, en_espera: r.en_espera, respuesta: resp };
    exigir(r.en_espera === 1, `CB7 · la llamada se vio en espera de un Lock (${r.en_espera})`);
    exigir(
      resp.cuerpo.includes('"23505"') && resp.cuerpo.includes("Esa copia ya tiene fichero registrado"),
      `CB7 · 23505 con el mensaje propio (${resp.estado} ${resp.cuerpo.slice(0, 160)})`,
    );
    exigir(!resp.cuerpo.includes("duplicate key value"), "CB7 · no sale el texto de la clave primaria");
    evidencia.cb7.veredicto = fallos.some((m) => m.startsWith("CB7")) ? "FALLA" : "PASA";
  }
} catch (e) {
  if (e instanceof Parada) {
    console.error(`PARADA: ${e.message}`);
    fallos.push(e.message);
  } else {
    throw e;
  }
} finally {
  evidencia.fallos = fallos;
  mkdirSync(path.join(raiz, "..", "tickets", "T-040"), { recursive: true });
  writeFileSync(path.join(raiz, "..", "tickets", "T-040", "oraculo-postgrest.json"), JSON.stringify(evidencia, null, 2) + "\n");
}

if (fallos.length > 0) {
  console.error(`\n${fallos.length} comprobación(es) fallida(s).`);
  process.exit(1);
}
console.log("\nt040-oraculo: completa.");
