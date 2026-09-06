#!/usr/bin/env node
// Encarga una entrega al carril de MiniMax por su API, con la clave de .env.local.
//
// POR QUÉ ESTE GUION NO ESCRIBE EN EL REPOSITORIO, y no es desconfianza gratuita:
// van tres vueltas con este carril y ninguna entregó algo integrable —la última empujó
// cuatro ramas a otro repositorio, con historia sin ancestro común—. Lo que devuelve la
// API se guarda en `minimax/respuestas/` y lo aplica una persona (o el carril de la
// fábrica) después de leerlo. La puerta se queda donde tiene que estar.
//
// Uso:
//   node minimax/encargar.mjs --probe          comprueba endpoint, modelo y clave
//   node minimax/encargar.mjs T-009b           encarga esa entrega
//
// La clave NUNCA se imprime, ni entera ni en trozos.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function leerClave() {
  const ruta = path.join(raiz, ".env.local");
  if (!existsSync(ruta)) {
    throw new Error("No hay .env.local: sin él no hay clave que usar.");
  }
  const linea = readFileSync(ruta, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("MINIMAX_API_KEY="));
  if (!linea) {
    throw new Error("No hay MINIMAX_API_KEY en .env.local.");
  }
  const clave = linea.slice("MINIMAX_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  if (!clave) throw new Error("MINIMAX_API_KEY está vacía.");
  return clave;
}

// Los dos dominios propios de MiniMax. Se prueban en orden y se usa el primero que
// responda: la cuenta puede ser internacional o continental y eso no se deduce de la
// clave sin decodificarla, que es justo lo que no se va a hacer aquí.
const ENDPOINTS = [
  "https://api.minimaxi.chat/v1/text/chatcompletion_v2",
  "https://api.minimax.chat/v1/text/chatcompletion_v2",
];

// Orden de preferencia. La lista existe porque no todas las cuentas tienen los mismos
// modelos, pero el modelo que acabe usándose SE ANOTA EN LA RESPUESTA: la primera versión
// de este guion redescubría en cada llamada y el sondeo dijo M1 mientras el encargo salió
// con Text-01, así que la calidad de lo entregado no se podía atribuir a nada. Se puede
// fijar a mano con MINIMAX_MODELO=<nombre>.
const MODELOS = process.env.MINIMAX_MODELO
  ? [process.env.MINIMAX_MODELO]
  : ["MiniMax-M2", "MiniMax-M1", "MiniMax-Text-01", "abab6.5s-chat"];

async function llamar(endpoint, modelo, clave, mensajes, maxTokens = 8192) {
  const respuesta = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clave}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelo,
      messages: mensajes,
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  });

  const texto = await respuesta.text();
  let cuerpo;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return { ok: false, detalle: `respuesta no-JSON (${respuesta.status}): ${texto.slice(0, 300)}` };
  }

  // MiniMax devuelve 200 con `base_resp.status_code` distinto de cero cuando falla, así
  // que el código HTTP por sí solo no dice si salió bien.
  const codigo = cuerpo?.base_resp?.status_code;
  if (!respuesta.ok || (codigo !== undefined && codigo !== 0)) {
    return {
      ok: false,
      detalle: `HTTP ${respuesta.status} · base_resp ${codigo ?? "-"}: ${cuerpo?.base_resp?.status_msg ?? texto.slice(0, 300)}`,
    };
  }

  const contenido = cuerpo?.choices?.[0]?.message?.content;
  if (!contenido) {
    return { ok: false, detalle: `sin contenido en la respuesta: ${texto.slice(0, 300)}` };
  }
  return { ok: true, contenido, modelo, endpoint };
}

async function descubrir(clave) {
  const fallos = [];
  for (const endpoint of ENDPOINTS) {
    for (const modelo of MODELOS) {
      const r = await llamar(endpoint, modelo, clave, [{ role: "user", content: "Responde solo: ok" }], 32);
      if (r.ok) return { endpoint, modelo };
      fallos.push(`${new URL(endpoint).host} · ${modelo} → ${r.detalle}`);
    }
  }
  throw new Error(`Ningún endpoint/modelo respondió:\n  ${fallos.join("\n  ")}`);
}

const argumentos = process.argv.slice(2);
const clave = leerClave();

if (argumentos[0] === "--probe") {
  const { endpoint, modelo } = await descubrir(clave);
  console.log(`OK · endpoint ${new URL(endpoint).host} · modelo ${modelo}`);
  process.exit(0);
}

const entrega = argumentos[0];
if (!entrega) {
  console.error("Falta la entrega. Uso: node minimax/encargar.mjs T-009b");
  process.exit(2);
}

const rutaEncargo = path.join(raiz, "minimax", "encargos", `${entrega}.md`);
if (!existsSync(rutaEncargo)) {
  console.error(`No existe ${path.relative(raiz, rutaEncargo)}. El encargo se escribe antes de mandarlo.`);
  process.exit(2);
}

const { endpoint, modelo } = await descubrir(clave);
console.log(`Encargando ${entrega} a ${modelo} (${new URL(endpoint).host})…`);

const resultado = await llamar(
  endpoint,
  modelo,
  clave,
  [
    {
      role: "system",
      content:
        "Eres el carril de interfaz de un proyecto real. Devuelves ficheros completos, " +
        "nunca fragmentos ni diffs. Cada fichero va en un bloque de código precedido por " +
        "una línea `=== RUTA: <ruta relativa> ===`. No inventes APIs, ficheros ni comandos: " +
        "si algo no está en el encargo, dilo en una sección FALTA al final en vez de " +
        "suponerlo. No escribes en el repositorio; tu respuesta la revisa una persona.",
    },
    { role: "user", content: readFileSync(rutaEncargo, "utf8") },
  ],
  16384,
);

if (!resultado.ok) {
  console.error(`Falló el encargo: ${resultado.detalle}`);
  process.exit(1);
}

const dirRespuestas = path.join(raiz, "minimax", "respuestas");
mkdirSync(dirRespuestas, { recursive: true });
const destino = path.join(dirRespuestas, `${entrega}.md`);
const cabecera =
  `<!-- ${entrega} · ${modelo} · ${new URL(endpoint).host} · ${new Date().toISOString()} -->\n\n`;
writeFileSync(destino, cabecera + resultado.contenido, "utf8");

console.log(`Respuesta guardada en ${path.relative(raiz, destino)} (${resultado.contenido.length} caracteres).`);
console.log("NO se ha escrito nada en el repositorio: la propuesta se revisa antes de aplicarla.");
