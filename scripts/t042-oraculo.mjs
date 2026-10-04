#!/usr/bin/env node
// T-042 · Oráculo por HTTP contra PostgREST, más la concurrencia.
//
//   npx tsx scripts/t042-oraculo.mjs
//
// Los pasos uno (`comprobar_pin_historia`, `comprobar_codigo_recuperacion`) no deben dejar ver,
// a través de PostgREST, si el secreto era bueno: la respuesta del bueno y la del malo han de
// ser IDÉNTICAS (estado y cuerpo), en cada forma de llamarlas (POST normal, objeto singular,
// `Prefer: tx=rollback`, `Prefer: handling=strict, max-affected=0`, GET). El resultado solo se ve
// en una transacción posterior (el paso dos, sin argumentos).
//
// CONFIRMA filas: crea un usuario con UUID y correo aleatorios por pasada, así que se puede
// repetir sin `db reset`. Escribe tickets/T-042/oraculo-postgrest.json.

import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { contenedorDelProyecto } from "../lib/cuentas/contenedor-proyecto.ts";

const raiz = path.dirname(fileURLToPath(import.meta.url));
const contenedor = contenedorDelProyecto();
const PIN_BUENO = "135790";
const PIN_MALO = "999111";
const COD_UNO = "ORACULO-UNO";
const COD_DOS = "ORACULO-DOS";
const COD_MALO = "ORACULO-NO";

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
function token(sub, aal) {
  const iat = Math.floor(Date.now() / 1000);
  const cuerpo = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    sub,
    role: "authenticated",
    aud: "authenticated",
    aal,
    session_id: randomUUID(),
    iat,
    exp: iat + 600,
  })}`;
  return `${cuerpo}.${createHmac("sha256", JWT_SECRET).update(cuerpo).digest("base64url")}`;
}

// -- fijación -------------------------------------------------------------------------------
const UID = randomUUID();
const CORREO = `oraculo-${randomBytes(4).toString("hex")}@t042.test`;
psql(`
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, encrypted_password,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  select '00000000-0000-0000-0000-000000000000', '${UID}', 'authenticated', 'authenticated', '${CORREO}', now(), now(),
         '{"provider":"email","providers":["email"]}'::jsonb,
         ('{"rol":"profesional_sanitario","nombre_completo":"Oraculo","centro_id":"' || p.centro_id || '"}')::jsonb,
         extensions.crypt('clave-oraculo', extensions.gen_salt('bf', 4)), '', '', '', ''
    from public.perfiles p where p.id = '11111111-1111-4111-8111-111111111111';
  insert into public.pines_historia (perfil_id, hash)
  values ('${UID}', extensions.crypt('${PIN_BUENO}', extensions.gen_salt('bf', 4)));
  insert into public.codigos_recuperacion_totp (perfil_id, codigo_hash)
  values ('${UID}', extensions.crypt('${COD_UNO}', extensions.gen_salt('bf', 4))),
         ('${UID}', extensions.crypt('${COD_DOS}', extensions.gen_salt('bf', 4)));
`);
console.log(`Usuario ${UID} (${CORREO}); API ${API_URL}`);

const JWT_AAL2 = token(UID, "aal2"); // el PIN exige segundo factor reciente en la app; aquí basta con una sesión
const JWT_AAL1 = token(UID, "aal1"); // el atacante realista del canje: contraseña sin segundo factor

async function llamar(jwt, metodo, ruta, { cuerpo, extra, consulta } = {}) {
  const url = `${API_URL}/rest/v1/rpc/${ruta}${consulta ?? ""}`;
  const r = await fetch(url, {
    method: metodo,
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", ...(extra ?? {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: r.status, cuerpo: await r.text() };
}

// Estado de la base. PIN: "intentos,autorizados". Canje: "intentos,autorizado(0/1)" de la centinela.
function estadoPin() {
  const f = psql(
    `select ph.intentos_fallidos || ',' || ph.desbloqueos_autorizados from public.pines_historia ph where ph.perfil_id = '${UID}';`,
  ).split(",");
  return { intentos: Number(f[0]), autorizadas: Number(f[1]) };
}
const CENT = `(select c.id from public.codigos_recuperacion_totp c where c.perfil_id = '${UID}' and c.usado_en is null order by c.creado_en desc, c.id desc limit 1)`;
function estadoCanje() {
  const f = psql(
    `select coalesce(c.intentos_fallidos::text, '0') || ',' || (case when c.canje_autorizado_id is null then 0 else 1 end) from public.codigos_recuperacion_totp c where c.id = ${CENT};`,
  ).split(",");
  return { intentos: Number(f[0]), autorizado: Number(f[1]) };
}
const usados = () => Number(psql(`select count(*) from public.codigos_recuperacion_totp where perfil_id = '${UID}' and usado_en is not null;`));
const nAud = (op) => Number(psql(`select count(*) from public.auditoria where actor_id = '${UID}' and operacion = '${op}';`));
const vigentes = () =>
  Number(psql(`select count(*) from public.desbloqueos_historia where perfil_id = '${UID}' and revocado_en is null and caduca_en > now();`));

function reiniciar() {
  psql(`
    update public.pines_historia set intentos_fallidos = 0, bloqueado_hasta = null, desbloqueos_autorizados = 0, autorizado_hasta = null
     where perfil_id = '${UID}';
    update public.desbloqueos_historia set revocado_en = now() where perfil_id = '${UID}' and revocado_en is null;
    update public.codigos_recuperacion_totp set usado_en = null, intentos_fallidos = 0, bloqueado_hasta = null,
           canje_autorizado_id = null, canje_autorizado_hasta = null
     where perfil_id = '${UID}';
  `);
}

// -- solape real (R2.1) ---------------------------------------------------------------------
const PSQL_ARGS = ["exec", "-i", contenedor, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"];
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// psql asíncrono (no bloquea el bucle de eventos mientras hay peticiones en vuelo).
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

// Retiene sqlRetener en una transacción abierta (psql con la stdin sin cerrar), lanza la ráfaga,
// espera a ver las 3 peticiones en espera de un Lock y suelta. Si no ve el solape, FALLA (no
// concluyente): nunca da verde sin haber visto las tres en espera.
async function conBloqueador(nombre, sqlRetener, patronFuncion, lanzar) {
  const bloq = spawn(
    "docker",
    ["exec", "-i", "-e", "PGAPPNAME=t042-bloqueador", contenedor, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1"],
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
      "select count(*) from pg_stat_activity where application_name = 't042-bloqueador' and state = 'idle in transaction';",
      1,
      3000,
    );
    if (!ret.ok) throw new Parada(`${nombre} no concluyente: el bloqueador no retiene (${ret.valor}/1)`);
    const promesas = lanzar(); // sin await: la ráfaga queda en vuelo
    const espera = await esperarHasta(
      `select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%${patronFuncion}%' and pid <> pg_backend_pid();`,
      3,
      4000,
    );
    if (!espera.ok) {
      await soltar("rollback");
      await Promise.allSettled(promesas);
      throw new Parada(`${nombre} no concluyente: ${espera.valor}/3 en espera`);
    }
    await soltar("commit");
    const respuestas = await Promise.all(promesas);
    return { en_espera: espera.valor, respuestas };
  } finally {
    await soltar("rollback").catch(() => {});
    if (bloq.exitCode === null) bloq.kill();
  }
}

const fallos = [];
function exigir(condicion, mensaje) {
  console.log(`${condicion ? "OK   " : "FALLO"} ${mensaje}`);
  if (!condicion) fallos.push(mensaje);
}

const evidencia = { ticket: "T-042", usuario: UID, funciones: {}, extra: {}, concurrencia: {} };
const mismo = (a, b) => a.estado === b.estado && a.cuerpo === b.cuerpo;
const fila = (r) => {
  try {
    const x = JSON.parse(r.cuerpo);
    return Array.isArray(x) ? x[0] : x;
  } catch {
    return undefined;
  }
};

class Parada extends Error {}
function cuidarse() {
  // Cinco malas confirmadas seguidas bloquearían la cuenta y el guion dejaría de medir.
  const p = estadoPin();
  const c = estadoCanje();
  if (p.intentos >= 4 || c.intentos >= 4) throw new Parada(`intentos PIN ${p.intentos} / canje ${c.intentos}: el guion para antes de bloquear.`);
}

const comprobarPin = (pin, opciones = {}) => llamar(JWT_AAL2, "POST", "comprobar_pin_historia", { cuerpo: { p_pin: pin }, ...opciones });
const paso2Pin = (opciones = {}) => llamar(JWT_AAL2, "POST", "desbloquear_historia", { cuerpo: {}, ...opciones });
const comprobarCod = (cod, opciones = {}) => llamar(JWT_AAL1, "POST", "comprobar_codigo_recuperacion", { cuerpo: { p_codigo: cod }, ...opciones });
const paso2Cod = (opciones = {}) => llamar(JWT_AAL1, "POST", "canjear_codigo_recuperacion", { cuerpo: {}, ...opciones });

try {
  const formas = {
    S1: { descripcion: "POST normal", opciones: {} },
    S2: { descripcion: "POST con Accept: objeto singular", opciones: { extra: { Accept: "application/vnd.pgrst.object+json" } } },
    S3: { descripcion: "POST con Prefer: tx=rollback", opciones: { extra: { Prefer: "tx=rollback" } } },
    S4: { descripcion: "POST con Prefer: handling=strict, max-affected=0", opciones: { extra: { Prefer: "handling=strict, max-affected=0" } } },
  };

  const funciones = {
    pin: { comprobar: comprobarPin, bueno: PIN_BUENO, malo: PIN_MALO, estado: estadoPin, param: "p_pin", ruta: "comprobar_pin_historia", dejaAutorizacion: (e) => e.autorizadas >= 1 },
    canje: { comprobar: comprobarCod, bueno: COD_UNO, malo: COD_MALO, estado: estadoCanje, param: "p_codigo", ruta: "comprobar_codigo_recuperacion", dejaAutorizacion: (e) => e.autorizado === 1 },
  };

  for (const [fnombre, f] of Object.entries(funciones)) {
    evidencia.funciones[fnombre] = { formas: {} };
    for (const [nombre, forma] of Object.entries(formas)) {
      reiniciar();
      cuidarse();
      const antes = f.estado();
      const mala = await f.comprobar(f.malo, forma.opciones);
      const trasMala = f.estado();
      const buena = await f.comprobar(f.bueno, forma.opciones);
      const trasBuena = f.estado();
      evidencia.funciones[fnombre].formas[nombre] = { ...forma, mala, buena, antes, trasMala, trasBuena };
      // O1
      exigir(mismo(mala, buena), `O1 · ${fnombre} ${nombre} (${forma.descripcion}): el malo (${mala.estado} ${mala.cuerpo.slice(0, 60)}) y el bueno (${buena.estado} ${buena.cuerpo.slice(0, 60)}) responden igual`);
      if (nombre === "S1" || nombre === "S3") {
        // O2 (en S3 se comprueba además que PostgREST IGNORA tx=rollback y confirma)
        exigir(trasMala.intentos === antes.intentos + 1, `O2 · ${fnombre} ${nombre}: el malo confirma un intento fallido (${antes.intentos} → ${trasMala.intentos})`);
        exigir(f.dejaAutorizacion(trasBuena), `O2 · ${fnombre} ${nombre}: el bueno confirma una autorización (${JSON.stringify(trasBuena)})`);
        if (nombre === "S3") evidencia.extra[`tx_rollback_ignorado_${fnombre}`] = trasMala.intentos === antes.intentos + 1;
      }
    }

    // S5 · GET
    reiniciar();
    cuidarse();
    const antes = f.estado();
    const q = (s) => `?${f.param}=${encodeURIComponent(s)}`;
    const jwt = fnombre === "pin" ? JWT_AAL2 : JWT_AAL1;
    const mala = await llamar(jwt, "GET", f.ruta, { consulta: q(f.malo) });
    const buena = await llamar(jwt, "GET", f.ruta, { consulta: q(f.bueno) });
    const despues = f.estado();
    evidencia.funciones[fnombre].formas.S5 = { descripcion: `GET ?${f.param}=…`, mala, buena, antes, despues };
    exigir(mismo(mala, buena), `O1 · ${fnombre} S5 (GET): el malo (${mala.estado}) y el bueno (${buena.estado}) responden igual`);
    exigir(mala.estado >= 400 && mala.estado < 500 && buena.estado >= 400 && buena.estado < 500, `O3 · ${fnombre} S5: las dos dan un 4xx (${mala.estado}/${buena.estado})`);
    exigir(JSON.stringify(antes) === JSON.stringify(despues), `O3 · ${fnombre} S5: ningún contador cambia (${JSON.stringify(antes)} → ${JSON.stringify(despues)})`);
  }

  // O4 · las firmas de un paso ya no existen
  {
    const a = await llamar(JWT_AAL2, "POST", "desbloquear_historia", { cuerpo: { p_pin: "x" } });
    const b = await llamar(JWT_AAL1, "POST", "canjear_codigo_recuperacion", { cuerpo: { p_codigo: "x" } });
    evidencia.extra.o4 = { desbloquear: a, canjear: b };
    exigir(a.estado === 404 || a.cuerpo.includes("PGRST202"), `O4 · desbloquear_historia con p_pin no existe (${a.estado} ${a.cuerpo.slice(0, 80)})`);
    exigir(b.estado === 404 || b.cuerpo.includes("PGRST202"), `O4 · canjear_codigo_recuperacion con p_codigo no existe (${b.estado} ${b.cuerpo.slice(0, 80)})`);
  }

  // O5 · de extremo a extremo
  {
    reiniciar();
    cuidarse();
    await comprobarPin(PIN_BUENO);
    const p2ok = await paso2Pin();
    await comprobarPin(PIN_MALO);
    const p2mal = await paso2Pin();
    await comprobarCod(COD_UNO);
    const c2ok = await paso2Cod();
    const usadosTrasOk = usados();
    await comprobarCod(COD_MALO);
    const c2mal = await paso2Cod();
    evidencia.extra.o5 = { p2ok, p2mal, c2ok, c2mal, usadosTrasOk };
    exigir(p2ok.estado === 200 && fila(p2ok)?.motivo === "ok" && !!fila(p2ok)?.caduca_en, `O5 · PIN bueno y paso dos: ok con caduca_en (${p2ok.estado} ${fila(p2ok)?.motivo})`);
    exigir(p2mal.estado === 200 && fila(p2mal)?.motivo === "pin_incorrecto", `O5 · PIN malo y paso dos: pin_incorrecto (${fila(p2mal)?.motivo})`);
    exigir(c2ok.estado === 200 && fila(c2ok)?.motivo === "ok" && usadosTrasOk === 1, `O5 · código bueno y paso dos: ok y un código usado (${fila(c2ok)?.motivo}, usados ${usadosTrasOk})`);
    exigir(c2mal.estado === 200 && fila(c2mal)?.motivo === "codigo_invalido", `O5 · código malo y paso dos: codigo_invalido (${fila(c2mal)?.motivo})`);
  }

  // O6 · el ataque de R2.9 ya no deshace nada: el paso dos con objeto singular y filtro sobre la salida
  {
    reiniciar();
    cuidarse();
    const antesP = estadoPin();
    await comprobarPin(PIN_MALO);
    const ataqueP = await paso2Pin({ extra: { Accept: "application/vnd.pgrst.object+json" }, consulta: "?desbloqueado=is.true" });
    const trasP = estadoPin();
    const antesC = estadoCanje();
    await comprobarCod(COD_MALO);
    const ataqueC = await paso2Cod({ extra: { Accept: "application/vnd.pgrst.object+json" }, consulta: "?canjeado=is.true" });
    const trasC = estadoCanje();
    evidencia.extra.o6 = { ataqueP, ataqueC, antesP, trasP, antesC, trasC };
    exigir(ataqueP.estado === 406, `O6 · PIN: el paso dos con object+json y ?desbloqueado=is.true da 406 (${ataqueP.estado})`);
    exigir(trasP.intentos === antesP.intentos + 1, `O6 · PIN: el +1 del paso uno SOBREVIVE al 406 (${antesP.intentos} → ${trasP.intentos})`);
    exigir(ataqueC.estado === 406, `O6 · canje: el paso dos con object+json y ?canjeado=is.true da 406 (${ataqueC.estado})`);
    exigir(trasC.intentos === antesC.intentos + 1, `O6 · canje: el +1 del paso uno SOBREVIVE al 406 (${antesC.intentos} → ${trasC.intentos})`);
  }

  // O7 · el PIN nulo
  {
    reiniciar();
    cuidarse();
    const antes = estadoPin();
    const v0 = vigentes();
    const n = await llamar(JWT_AAL2, "POST", "comprobar_pin_historia", { cuerpo: { p_pin: null } });
    const p2 = await paso2Pin();
    const despues = estadoPin();
    evidencia.extra.o7 = { n, p2, antes, despues, vigentesAntes: v0, vigentesDespues: vigentes() };
    exigir(n.estado < 300, `O7 · comprobar_pin_historia con p_pin nulo responde sin error (${n.estado} ${n.cuerpo.slice(0, 60)})`);
    exigir(fila(p2)?.motivo === "pin_incorrecto", `O7 · el paso dos tras el PIN nulo da pin_incorrecto (${fila(p2)?.motivo})`);
    exigir(despues.intentos === antes.intentos + 1, `O7 · el PIN nulo suma un intento (${antes.intentos} → ${despues.intentos})`);
    exigir(vigentes() === v0, `O7 · desbloqueos_historia no gana ninguna fila vigente (${v0} → ${vigentes()})`);
  }

  // C1 · tres malos a la vez suben el contador exactamente +3
  {
    reiniciar();
    const antes = estadoPin();
    await Promise.all([comprobarPin(PIN_MALO), comprobarPin(PIN_MALO), comprobarPin(PIN_MALO)]);
    const despues = estadoPin();
    evidencia.concurrencia.c1 = { antes, despues, aud_fallidos: nAud("PIN_FALLIDO") };
    exigir(despues.intentos === antes.intentos + 3, `C1 · tres PIN malos a la vez suben el contador +3 (${antes.intentos} → ${despues.intentos})`);
  }

  // C2 · dos buenos y dos pasos dos a la vez
  {
    reiniciar();
    await comprobarPin(PIN_BUENO);
    await comprobarPin(PIN_BUENO);
    const [a, b] = await Promise.all([paso2Pin(), paso2Pin()]);
    const e = estadoPin();
    const v = vigentes();
    evidencia.concurrencia.c2 = { a, b, estado: e, vigentes: v };
    exigir(fila(a)?.motivo === "ok" && fila(b)?.motivo === "ok", `C2 · los dos pasos dos dan ok (${fila(a)?.motivo} / ${fila(b)?.motivo})`);
    exigir(e.autorizadas === 0, `C2 · quedan 0 autorizaciones (${e.autorizadas})`);
    exigir(v === 1, `C2 · queda exactamente un desbloqueo vigente (${v})`);
  }

  // C3 · un bueno y dos canjes a la vez
  {
    reiniciar();
    const tr0 = nAud("TOTP_REPUESTO");
    await comprobarCod(COD_UNO);
    const [a, b] = await Promise.all([paso2Cod(), paso2Cod()]);
    const motivos = [fila(a)?.motivo, fila(b)?.motivo].sort();
    evidencia.concurrencia.c3 = { a, b, usados: usados(), totp_repuesto: nAud("TOTP_REPUESTO") - tr0 };
    exigir(motivos[0] === "codigo_invalido" && motivos[1] === "ok", `C3 · exactamente un ok y un codigo_invalido (${motivos.join(", ")})`);
    exigir(usados() === 1, `C3 · un código con usado_en (${usados()})`);
    exigir(nAud("TOTP_REPUESTO") - tr0 === 1, `C3 · una fila TOTP_REPUESTO (${nAud("TOTP_REPUESTO") - tr0})`);
  }
  // C4 · tres PIN malos solapados desde intentos = 4: el for update los serializa (R2.1).
  {
    reiniciar();
    for (let i = 0; i < 4; i++) await comprobarPin(PIN_MALO);
    const avisos = () => Number(psql(`select count(*) from public.notificaciones where perfil_id = '${UID}' and tipo = 'pin_bloqueado';`));
    const base = { intentos: estadoPin().intentos, fallido: nAud("PIN_FALLIDO"), bloqueado: nAud("PIN_BLOQUEADO"), avisos: avisos() };
    exigir(base.intentos === 4, `C4 · preparación: el PIN está en intentos = 4 (${base.intentos})`);
    const r = await conBloqueador(
      "C4",
      `select 1 from public.pines_historia where perfil_id = '${UID}' for update;`,
      "comprobar_pin_historia",
      () => [comprobarPin(PIN_MALO), comprobarPin(PIN_MALO), comprobarPin(PIN_MALO)],
    );
    const final = {
      intentos: estadoPin().intentos,
      bloqueado: psql(`select (bloqueado_hasta is not null) from public.pines_historia where perfil_id = '${UID}';`) === "t",
      fallido: nAud("PIN_FALLIDO"),
      bloqueos: nAud("PIN_BLOQUEADO"),
      avisos: avisos(),
    };
    evidencia.concurrencia.c4 = { en_espera: r.en_espera, base, final, estados: r.respuestas.map((x) => x.estado) };
    exigir(r.en_espera === 3, `C4 · se vieron 3 peticiones en espera de un Lock (${r.en_espera})`);
    exigir(r.respuestas.every((x) => x.estado === 204), `C4 · las tres responden 204 (${r.respuestas.map((x) => x.estado).join(",")})`);
    exigir(final.intentos === 5 && final.bloqueado, `C4 · intentos = 5 y bloqueado_hasta no nulo (${final.intentos}, bloqueado ${final.bloqueado})`);
    exigir(final.fallido === base.fallido + 1, `C4 · PIN_FALLIDO = base + 1 (${base.fallido} → ${final.fallido})`);
    exigir(final.bloqueos === base.bloqueado + 1, `C4 · PIN_BLOQUEADO = base + 1 (${base.bloqueado} → ${final.bloqueos})`);
    exigir(final.avisos === base.avisos + 1, `C4 · avisos pin_bloqueado = base + 1 (${base.avisos} → ${final.avisos})`);
    evidencia.concurrencia.c4.veredicto = fallos.some((m) => m.startsWith("C4")) ? "FALLA" : "PASA";
    reiniciar();
  }

  // C5 · tres códigos malos solapados desde intentos = 4: candado de consejo + centinela (R2.1).
  {
    reiniciar();
    for (let i = 0; i < 4; i++) await comprobarCod(COD_MALO);
    const base = estadoCanje();
    exigir(base.intentos === 4, `C5 · preparación: la centinela está en intentos = 4 (${base.intentos})`);
    const idCent = psql(`select ${CENT};`);
    const r = await conBloqueador(
      "C5",
      `select pg_advisory_xact_lock(hashtextextended('codigos_recuperacion:' || '${UID}', 0));\nselect 1 from public.codigos_recuperacion_totp where id = '${idCent}' for update;`,
      "comprobar_codigo_recuperacion",
      () => [comprobarCod(COD_MALO), comprobarCod(COD_MALO), comprobarCod(COD_MALO)],
    );
    const final = {
      intentos: estadoCanje().intentos,
      bloqueado: psql(`select (bloqueado_hasta is not null) from public.codigos_recuperacion_totp where id = '${idCent}';`) === "t",
    };
    evidencia.concurrencia.c5 = { en_espera: r.en_espera, base, final, estados: r.respuestas.map((x) => x.estado) };
    exigir(r.en_espera === 3, `C5 · se vieron 3 peticiones en espera de un Lock (${r.en_espera})`);
    exigir(r.respuestas.every((x) => x.estado === 204), `C5 · las tres responden 204 (${r.respuestas.map((x) => x.estado).join(",")})`);
    exigir(final.intentos === 5 && final.bloqueado, `C5 · intentos = 5 y bloqueado_hasta no nulo (${final.intentos}, bloqueado ${final.bloqueado})`);
    evidencia.concurrencia.c5.veredicto = fallos.some((m) => m.startsWith("C5")) ? "FALLA" : "PASA";
    reiniciar();
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
  mkdirSync(path.join(raiz, "..", "tickets", "T-042"), { recursive: true });
  writeFileSync(path.join(raiz, "..", "tickets", "T-042", "oraculo-postgrest.json"), JSON.stringify(evidencia, null, 2) + "\n");
}

if (fallos.length > 0) {
  console.error(`\n${fallos.length} comprobación(es) fallida(s).`);
  process.exit(1);
}
console.log("\nt042-oraculo: completa.");
