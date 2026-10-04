#!/usr/bin/env node
// T-038 · R2-2 · Oráculo por HTTP contra PostgREST.
//
//   npx tsx scripts/t038-oraculo.mjs
//
// El paso uno de la regeneración (`comprobar_contrasena_para_regenerar`) no debe dejar
// ver, a través de PostgREST, si la contraseña era buena: la respuesta de la buena y la de
// la mala han de ser IDÉNTICAS (estado y cuerpo), en cada forma de llamarla (POST normal,
// objeto singular, `Prefer: tx=rollback`, `Prefer: handling=strict, max-affected=0`, GET).
// El resultado solo se ve en una transacción posterior (el paso dos).
//
// CONFIRMA filas: crea un usuario con UUID y correo aleatorios por pasada, así que se puede
// repetir sin `db reset`. Escribe tickets/T-038/oraculo-postgrest.json.

import { spawnSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { contenedorDelProyecto } from "../lib/cuentas/contenedor-proyecto.ts";

const raiz = path.dirname(fileURLToPath(import.meta.url));
const contenedor = contenedorDelProyecto();
const BUENA = "clave-oraculo";
const MALA = "clave-equivocada";

function psql(sql) {
  const r = spawnSync(
    "docker",
    ["exec", "-i", contenedor, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-f", "-"],
    { input: sql, encoding: "utf8" },
  );
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
  // Plan B: la clave `oct` de PGRST_JWT_SECRET del contenedor rest (el campo `k` va en base64url).
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
    exp: iat + 600,
  })}`;
  return `${cuerpo}.${createHmac("sha256", JWT_SECRET).update(cuerpo).digest("base64url")}`;
}

// -- fijación -------------------------------------------------------------------------------
const UID = randomUUID();
const CORREO = `oraculo-${randomBytes(4).toString("hex")}@t038.test`;
psql(`
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, encrypted_password,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  select '00000000-0000-0000-0000-000000000000', '${UID}', 'authenticated', 'authenticated', '${CORREO}', now(), now(),
         '{"provider":"email","providers":["email"]}'::jsonb,
         ('{"rol":"profesional_sanitario","nombre_completo":"Oraculo","centro_id":"' || p.centro_id || '"}')::jsonb,
         extensions.crypt('${BUENA}', extensions.gen_salt('bf', 4)), '', '', '', ''
    from public.perfiles p where p.id = '11111111-1111-4111-8111-111111111111';
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret, last_challenged_at)
  values (gen_random_uuid(), '${UID}', 't038-oraculo', 'totp', 'verified', now(), now(), 'SECRETODEPRUEBA', clock_timestamp());
`);
console.log(`Usuario ${UID} (${CORREO}); API ${API_URL}`);

const JWT = token(UID);
const cabeceras = (extra = {}) => ({
  apikey: ANON_KEY,
  Authorization: `Bearer ${JWT}`,
  "Content-Type": "application/json",
  ...extra,
});

async function llamar(metodo, ruta, { cuerpo, extra, consulta } = {}) {
  const url = `${API_URL}/rest/v1/rpc/${ruta}${consulta ?? ""}`;
  const r = await fetch(url, {
    method: metodo,
    headers: cabeceras(extra),
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: r.status, cuerpo: await r.text() };
}

function estadoBD() {
  const f = psql(
    `select coalesce((select intentos_fallidos || ',' || regeneraciones_autorizadas from public.intentos_regenerar_codigos where perfil_id = '${UID}'), '0,0');`,
  ).split(",");
  return { intentos: Number(f[0]), autorizadas: Number(f[1]) };
}

const fallos = [];
function exigir(condicion, mensaje) {
  console.log(`${condicion ? "OK   " : "FALLO"} ${mensaje}`);
  if (!condicion) fallos.push(mensaje);
}

const evidencia = { ticket: "T-038", ronda: 2, criterio: "R2-2", usuario: UID, formas: {}, extra: {} };
const mismo = (a, b) => a.estado === b.estado && a.cuerpo === b.cuerpo;

class Parada extends Error {}
function cuidarse() {
  // Cinco malas confirmadas seguidas bloquearían la cuenta y el guion dejaría de medir.
  const e = estadoBD();
  if (e.intentos >= 4) throw new Parada(`intentos_fallidos = ${e.intentos}: el guion para antes de bloquear la cuenta.`);
}

const comprobar = (contrasena, opciones = {}) =>
  llamar("POST", "comprobar_contrasena_para_regenerar", { cuerpo: { p_contrasena: contrasena }, ...opciones });

try {
  const formas = {
    S1: { descripcion: "POST normal", opciones: {} },
    S2: { descripcion: "POST con Accept: objeto singular", opciones: { extra: { Accept: "application/vnd.pgrst.object+json" } } },
    S3: { descripcion: "POST con Prefer: tx=rollback", opciones: { extra: { Prefer: "tx=rollback" } } },
    S4: {
      descripcion: "POST con Prefer: handling=strict, max-affected=0",
      opciones: { extra: { Prefer: "handling=strict, max-affected=0" } },
    },
  };

  for (const [nombre, forma] of Object.entries(formas)) {
    cuidarse();
    const antes = estadoBD();
    const mala = await comprobar(MALA, forma.opciones);
    const trasMala = estadoBD();
    const buena = await comprobar(BUENA, forma.opciones);
    const trasBuena = estadoBD();
    evidencia.formas[nombre] = { ...forma, mala, buena, antes, trasMala, trasBuena };
    // O1
    exigir(mismo(mala, buena), `O1 · ${nombre} (${forma.descripcion}): la mala (${mala.estado} ${JSON.stringify(mala.cuerpo)}) y la buena (${buena.estado} ${JSON.stringify(buena.cuerpo)}) responden igual`);
    if (nombre === "S1") {
      // O2
      exigir(trasMala.intentos === antes.intentos + 1, `O2 · S1: la mala confirma un intento fallido (${antes.intentos} → ${trasMala.intentos})`);
      exigir(trasBuena.autorizadas >= 1, `O2 · S1: la buena confirma una autorización (regeneraciones_autorizadas = ${trasBuena.autorizadas})`);
    }
    if (nombre === "S3") {
      const ignorado = trasMala.intentos === antes.intentos + 1;
      evidencia.extra.tx_rollback_ignorado = ignorado;
      exigir(ignorado, `O2 · S3: Prefer tx=rollback se IGNORA y la mala confirma (${antes.intentos} → ${trasMala.intentos})`);
      if (!ignorado) console.log("AVISO: PostgREST ha honrado tx=rollback; el informe debe decirlo.");
    }
  }

  // S5 · GET
  {
    cuidarse();
    const antes = estadoBD();
    const q = (c) => `?p_contrasena=${encodeURIComponent(c)}`;
    const mala = await llamar("GET", "comprobar_contrasena_para_regenerar", { consulta: q(MALA) });
    const buena = await llamar("GET", "comprobar_contrasena_para_regenerar", { consulta: q(BUENA) });
    const despues = estadoBD();
    evidencia.formas.S5 = { descripcion: "GET ?p_contrasena=…", mala, buena, antes, despues };
    exigir(mismo(mala, buena), `O1 · S5 (GET): la mala (${mala.estado}) y la buena (${buena.estado}) responden igual`);
    exigir(mala.estado >= 400 && mala.estado < 500 && buena.estado >= 400 && buena.estado < 500, `O3 · S5: las dos dan un 4xx (${mala.estado}/${buena.estado})`);
    exigir(antes.intentos === despues.intentos && antes.autorizadas === despues.autorizadas, `O3 · S5: ningún contador cambia (${JSON.stringify(antes)} → ${JSON.stringify(despues)})`);
  }

  // O4 · la puerta de un paso ya no existe
  {
    const r = await llamar("POST", "regenerar_codigos_recuperacion", { cuerpo: { p_contrasena: "x" } });
    evidencia.extra.o4 = r;
    exigir(r.estado === 404 || r.cuerpo.includes("PGRST202"), `O4 · regenerar_codigos_recuperacion con p_contrasena no existe (${r.estado} ${r.cuerpo.slice(0, 80)})`);
  }

  // O5 · el envoltorio del registro de Postgres, con el statement_timeout real de PostgREST
  {
    const r = await llamar("POST", "registro_postgres_seguro", { cuerpo: {} });
    evidencia.extra.o5 = r;
    exigir(r.estado === 200 && r.cuerpo.trim() === "true", `O5 · registro_postgres_seguro da true por PostgREST (${r.estado} ${r.cuerpo})`);
  }

  // O6 · buena → paso dos ok; mala → paso dos contrasena_incorrecta
  {
    cuidarse();
    const b1 = await comprobar(BUENA);
    const p2a = await llamar("POST", "regenerar_codigos_recuperacion", { cuerpo: {} });
    const m = await comprobar(MALA);
    const p2b = await llamar("POST", "regenerar_codigos_recuperacion", { cuerpo: {} });
    const fila = (r) => {
      try {
        const x = JSON.parse(r.cuerpo);
        return Array.isArray(x) ? x[0] : x;
      } catch {
        return undefined;
      }
    };
    evidencia.extra.o6 = { b1: b1.estado, m: m.estado, p2a: { estado: p2a.estado, motivo: fila(p2a)?.motivo, codigos: fila(p2a)?.codigos?.length }, p2b: { estado: p2b.estado, motivo: fila(p2b)?.motivo, codigos: fila(p2b)?.codigos } };
    exigir(p2a.estado === 200 && fila(p2a)?.motivo === "ok" && fila(p2a)?.codigos?.length === 10, `O6 · tras una buena, el paso dos da ok con diez (${p2a.estado} ${fila(p2a)?.motivo})`);
    exigir(p2b.estado === 200 && fila(p2b)?.motivo === "contrasena_incorrecta", `O6 · tras una mala, el paso dos da contrasena_incorrecta (${p2b.estado} ${fila(p2b)?.motivo})`);
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
  mkdirSync(path.join(raiz, "..", "tickets", "T-038"), { recursive: true });
  writeFileSync(path.join(raiz, "..", "tickets", "T-038", "oraculo-postgrest.json"), JSON.stringify(evidencia, null, 2) + "\n");
}

if (fallos.length > 0) {
  console.error(`\n${fallos.length} comprobación(es) fallida(s).`);
  process.exit(1);
}
console.log("\nt038-oraculo: completa.");
