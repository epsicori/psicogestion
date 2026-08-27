#!/usr/bin/env node
// Guardarrail del carril paralelo.
//
// No comprueba que el ticket esté bien hecho —eso lo hacen sus criterios de aceptación—:
// comprueba que quien lo hizo **no se salió del alcance**. Es la única regla que no puede
// depender de que un agente se acuerde de cumplirla.
//
//   node kimi/verificar.mjs T-018
//
// Devuelve 0 si todo lo tocado cabe en el alcance del ticket; 1 si no.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALCANCE = path.join(RAIZ, "kimi", "alcance.json");

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

const ticket = (process.argv[2] || "").toUpperCase();
if (!/^T-\d{3}$/.test(ticket)) {
  morir("uso: node kimi/verificar.mjs T-0XX   (por ejemplo, T-018)");
}

let alcance;
try {
  alcance = JSON.parse(readFileSync(ALCANCE, "utf8"));
} catch (e) {
  morir(`no se pudo leer kimi/alcance.json: ${e.message}`);
}

const config = alcance.tickets[ticket];
if (!config) {
  morir(
    `el ticket ${ticket} no está en kimi/alcance.json.\n` +
      `        Tickets del carril: ${Object.keys(alcance.tickets).join(", ")}`
  );
}

const permitidos = [...config.escritura, ...alcance.comun];
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

const enProhibido = rutas.filter((r) => casa(r, prohibidos));
const fueraDeAlcance = rutas.filter((r) => !casa(r, prohibidos) && !casa(r, permitidos));

if (enProhibido.length) {
  problemas.push({
    titulo: "Ficheros en zona prohibida (kimi/LEEME.md §Fuera de límites)",
    detalle:
      "Estas rutas no las toca nadie del carril paralelo, en ningún ticket.\n" +
      "  Revierte con: git checkout -- <ruta>   (o bórralas si son nuevas)",
    rutas: enProhibido,
  });
}

if (fueraDeAlcance.length) {
  problemas.push({
    titulo: `Ficheros fuera del alcance de ${ticket}`,
    detalle:
      "No están prohibidos, pero no son de este ticket. Si de verdad hacen falta,\n" +
      "  eso es un hallazgo para kimi/hallazgos/, no un cambio.",
    rutas: fueraDeAlcance,
  });
}

// Dependencias: solo las que el ticket declara, y ancladas de versión.
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
      titulo: "Dependencias que este ticket no permite",
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
      detalle: "Ningún ticket del carril quita dependencias. Devuélvelas.",
      rutas: quitadas,
    });
  }

  if (cambiadas.length) {
    problemas.push({
      titulo: "Versiones de dependencias existentes modificadas",
      detalle: "Actualizar el stack no es de este ticket. Es un hallazgo.",
      rutas: cambiadas.map((n) => `${n}: ${dAntes[n]} → ${dAhora[n]}`),
    });
  }
}

// El informe es obligatorio: sin evidencia no hay ticket (regla 3).
if (!rutas.includes(`kimi/informes/${ticket}.md`)) {
  problemas.push({
    titulo: "Falta el informe",
    detalle: `Escribe kimi/informes/${ticket}.md partiendo de kimi/informes/_plantilla.md,\n  con la salida real de cada criterio pegada.`,
    rutas: [],
  });
}

// --- salida ----------------------------------------------------------------

console.log(`\n${ticket} · ${config.titulo}`);
console.log(gris(`base: ${base.slice(0, 8)} · ${rutas.length} fichero(s) tocado(s)\n`));

for (const r of rutas) {
  const mal = casa(r, prohibidos) || !casa(r, permitidos);
  console.log(`  ${mal ? rojo("✗") : verde("✓")} ${r}`);
}

if (problemas.length === 0) {
  console.log(`\n${verde("Alcance correcto.")} Los criterios del ticket son otra cosa: compruébalos tú.\n`);
  process.exit(0);
}

console.log("");
for (const p of problemas) {
  console.log(rojo(`✗ ${p.titulo}`));
  console.log(`  ${p.detalle}`);
  for (const r of p.rutas) console.log(`    · ${r}`);
  console.log("");
}
console.log(rojo(`${problemas.length} problema(s) de alcance. Arréglalos antes de cerrar el ticket.\n`));
process.exit(1);
