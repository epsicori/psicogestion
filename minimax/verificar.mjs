#!/usr/bin/env node
// Guardarrail de carril. Genérico: deduce a qué carril pertenece del nombre de la
// carpeta donde vive, así que este mismo fichero vale para cualquier carril que tenga
// al lado su `alcance.json`.
//
// No comprueba que la entrega esté bien hecha —eso lo hacen sus criterios de aceptación—:
// comprueba que quien la hizo **no se salió del alcance**. Es la única regla que no puede
// depender de que un agente se acuerde de cumplirla.
//
//   node minimax/verificar.mjs T-007a
//
// Devuelve 0 si todo lo tocado cabe en el alcance de la entrega; 1 si no.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CARRIL = path.basename(AQUI);
const RAIZ = path.resolve(AQUI, "..");
const ALCANCE = path.join(AQUI, "alcance.json");

const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;

function morir(mensaje) {
  console.error(`\n${rojo("error")}: ${mensaje}\n`);
  process.exit(1);
}

function git(...args) {
  // core.quotepath=false: sin esto git entrecomilla las rutas con acentos y el
  // patrón de zona prohibida no casaría con la ruta que hay que bloquear.
  return execFileSync("git", ["-c", "core.quotepath=false", ...args], {
    cwd: RAIZ,
    encoding: "utf8",
    // git avisa de finales de línea por cada fichero; aquí es ruido puro.
    stdio: ["ignore", "pipe", "ignore"],
  });
}

// Glob mínimo: `**` cruza separadores, `*` no, `?` es un carácter. Nada más, porque nada
// más hace falta y un glob completo aquí sería una dependencia.
const BARRA = String.fromCharCode(92);
const ESPECIALES = ".+^${}()|[]";
function globARegExp(patron) {
  let re = "";
  for (let i = 0; i < patron.length; i++) {
    const c = patron[i];
    if (c === "*") {
      if (patron[i + 1] === "*") {
        re += ".*";
        i++;
        if (patron[i + 1] === "/") i++; // `dir/**/x` casa también con `dir/x`
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += (ESPECIALES.indexOf(c) >= 0 ? BARRA : "") + c;
    }
  }
  return new RegExp(`^${re}$`);
}

const casa = (ruta, patrones) => patrones.some((p) => globARegExp(p).test(ruta));

// --- entrada ---------------------------------------------------------------

// Un ticket es `T-018`; un corte de un ticket es `T-007a`. La letra va en minúscula
// siempre, para que `T-007A` y `T-007a` no acaben siendo dos claves distintas.
const bruto = (process.argv[2] || "").trim();
const partes = /^[Tt]-(\d{3})([A-Za-z]?)$/.exec(bruto);
if (!partes) {
  morir(`uso: node ${CARRIL}/verificar.mjs T-0XX[letra]   (por ejemplo, T-007a)`);
}
const ticket = `T-${partes[1]}${partes[2].toLowerCase()}`;

let alcance;
try {
  alcance = JSON.parse(readFileSync(ALCANCE, "utf8"));
} catch (e) {
  morir(`no se pudo leer ${CARRIL}/alcance.json: ${e.message}`);
}

const config = alcance.tickets[ticket];
if (!config) {
  morir(
    `la entrega ${ticket} no está en ${CARRIL}/alcance.json.\n` +
      `        Entregas del carril: ${Object.keys(alcance.tickets).join(", ")}`
  );
}

// Las excepciones levantan la zona prohibida para rutas concretas y solo en esta entrega.
// Se comprueban ANTES que `prohibido`, que si no gana siempre.
const excepciones = config.excepciones || [];
const permitidos = [...config.escritura, ...excepciones, ...alcance.comun];
const prohibidos = alcance.prohibido;

// --- qué se ha tocado ------------------------------------------------------

let base;
try {
  base = git("merge-base", "HEAD", "main").trim();
} catch {
  morir("no encuentro la rama `main`. ¿Estás dentro del repositorio y con `main` local?");
}

const tocados = new Set();
for (const linea of git("diff", "--name-only", base, "HEAD").split("\n")) {
  if (linea.trim()) tocados.add(linea.trim());
}
for (const linea of git("diff", "--name-only", "HEAD").split("\n")) {
  if (linea.trim()) tocados.add(linea.trim());
}
for (const linea of git("ls-files", "--others", "--exclude-standard").split("\n")) {
  if (linea.trim()) tocados.add(linea.trim());
}

const rutas = [...tocados].sort();

if (rutas.length === 0) {
  morir(`${ticket}: no has tocado ningún fichero. ¿Rama equivocada?`);
}

// --- comprobaciones --------------------------------------------------------

const problemas = [];

const exenta = (r) => casa(r, excepciones);
const enProhibido = rutas.filter((r) => !exenta(r) && casa(r, prohibidos));
const fueraDeAlcance = rutas.filter(
  (r) => !exenta(r) && !casa(r, prohibidos) && !casa(r, permitidos)
);

if (enProhibido.length) {
  problemas.push({
    titulo: `Ficheros en zona prohibida (${CARRIL}/LEEME.md §Fuera de límites)`,
    detalle:
      "Estas rutas no las toca este carril, en ninguna entrega. Son de otro carril\n" +
      "  o son el contrato, y hay trabajo en curso ahí.\n" +
      "  Revierte con: git checkout -- <ruta>   (o bórralas si son nuevas)",
    rutas: enProhibido,
  });
}

if (fueraDeAlcance.length) {
  problemas.push({
    titulo: `Ficheros fuera del alcance de ${ticket}`,
    detalle:
      "No están prohibidos, pero no son de esta entrega. Si de verdad hacen falta,\n" +
      `  eso es un hallazgo para ${CARRIL}/hallazgos/, no un cambio.`,
    rutas: fueraDeAlcance,
  });
}

// Dependencias: solo las que la entrega declara, y ancladas de versión.
if (rutas.includes("package.json")) {
  const antes = JSON.parse(git("show", `${base}:package.json`));
  const ahora = JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8"));

  const listar = (p) => ({ ...(p.dependencies || {}), ...(p.devDependencies || {}) });
  const dAntes = listar(antes);
  const dAhora = listar(ahora);

  const nuevas = Object.keys(dAhora).filter((n) => !(n in dAntes));
  const quitadas = Object.keys(dAntes).filter((n) => !(n in dAhora));
  const cambiadas = Object.keys(dAhora).filter(
    (n) => n in dAntes && dAntes[n] !== dAhora[n]
  );

  const noDeclaradas = nuevas.filter((n) => !config.dependencias.includes(n));
  if (noDeclaradas.length) {
    problemas.push({
      titulo: "Dependencias que esta entrega no permite",
      detalle: `${ticket} solo puede añadir: ${
        config.dependencias.length ? config.dependencias.join(", ") : "ninguna"
      }`,
      rutas: noDeclaradas.map((n) => `${n}@${dAhora[n]}`),
    });
  }

  const sinAnclar = nuevas.filter((n) => /^[\^~]/.test(dAhora[n]));
  if (sinAnclar.length) {
    problemas.push({
      titulo: "Dependencias sin anclar de versión",
      detalle: "Quita el `^` o el `~`: la versión se fija, no se deja flotar.",
      rutas: sinAnclar.map((n) => `${n}@${dAhora[n]}`),
    });
  }

  if (quitadas.length) {
    problemas.push({
      titulo: "Dependencias eliminadas",
      detalle: "Ninguna entrega del carril quita dependencias. Devuélvelas.",
      rutas: quitadas,
    });
  }

  if (cambiadas.length) {
    problemas.push({
      titulo: "Versiones de dependencias existentes modificadas",
      detalle: "Actualizar el stack no es de esta entrega. Es un hallazgo.",
      rutas: cambiadas.map((n) => `${n}: ${dAntes[n]} → ${dAhora[n]}`),
    });
  }
}

// El informe es obligatorio: sin evidencia no hay entrega (regla 3).
if (!rutas.includes(`${CARRIL}/informes/${ticket}.md`)) {
  problemas.push({
    titulo: "Falta el informe",
    detalle:
      `Escribe ${CARRIL}/informes/${ticket}.md partiendo de ${CARRIL}/informes/_plantilla.md,\n` +
      "  con la salida real de cada criterio pegada.",
    rutas: [],
  });
}

// --- salida ----------------------------------------------------------------

console.log(`\n${ticket} · ${config.titulo}   ${gris(`[carril ${CARRIL}]`)}`);
console.log(gris(`base: ${base.slice(0, 8)} · ${rutas.length} fichero(s) tocado(s)\n`));

for (const r of rutas) {
  const mal = !exenta(r) && (casa(r, prohibidos) || !casa(r, permitidos));
  console.log(`  ${mal ? rojo("✗") : verde("✓")} ${r}`);
}

if (problemas.length === 0) {
  console.log(
    `\n${verde("Alcance correcto.")} Los criterios de la entrega son otra cosa: compruébalos tú.\n`
  );
  process.exit(0);
}

console.log("");
for (const p of problemas) {
  console.log(rojo(`✗ ${p.titulo}`));
  console.log(`  ${p.detalle}`);
  for (const r of p.rutas) console.log(`    · ${r}`);
  console.log("");
}
console.log(
  rojo(`${problemas.length} problema(s) de alcance. Arréglalos antes de cerrar la entrega.\n`)
);
process.exit(1);
