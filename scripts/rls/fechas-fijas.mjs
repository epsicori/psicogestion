// T-049 · Lint de fechas fijas del banco de RLS.
//
// Un literal AAAA-MM-DD que ya es futuro hoy acaba siendo pasado, y una cita pasada no se puede
// reprogramar: el banco se rompe por la fecha en que se ejecuta, no por un cambio de código.
// Este lint marca todo literal >= hoy (fecha de Europe/Madrid) que no lleve, en su línea o en la
// anterior, `fecha-fija:` seguido de un motivo. Es monótono: un literal pasado nunca se vuelve rojo.
//
// Uso:  node scripts/rls/fechas-fijas.mjs [--hoy AAAA-MM-DD] [fichero.sql ...]
// Sin ficheros, recorre los .sql del directorio de este script (no del directorio de trabajo).
// Códigos de salida: 0 limpio · 1 hay literales futuros sin anotar · 2 uso incorrecto.
// Regla completa: scripts/rls/README.md, punto 10.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirRls = path.dirname(fileURLToPath(import.meta.url));

function uso(mensaje) {
  console.error(`fechas-fijas: ${mensaje}`);
  console.error("Uso: node scripts/rls/fechas-fijas.mjs [--hoy AAAA-MM-DD] [fichero.sql ...]");
  process.exit(2);
}

function fechaValida(anio, mes, dia) {
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

let hoy = null;
const ficheros = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--hoy") {
    const valor = args[i + 1];
    if (valor === undefined) uso("--hoy exige un valor AAAA-MM-DD");
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
    if (!m || !fechaValida(Number(m[1]), Number(m[2]), Number(m[3]))) {
      uso(`--hoy mal formado: ${valor}`);
    }
    hoy = valor;
    i++;
  } else if (args[i].startsWith("--")) {
    uso(`opción desconocida: ${args[i]}`);
  } else {
    ficheros.push(args[i]);
  }
}

if (hoy === null) {
  hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const objetivos =
  ficheros.length > 0
    ? ficheros
    : fs
        .readdirSync(dirRls)
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((f) => path.join(dirRls, f));

const reLiteral = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
const reAnotacion = /fecha-fija:\s*\S/;

const sinAnotar = [];
let anotados = 0;

for (const fichero of objetivos) {
  if (!fs.existsSync(fichero)) uso(`el fichero no existe: ${fichero}`);
  const lineas = fs.readFileSync(fichero, "utf8").split(/\r?\n/);
  const ruta = path.relative(process.cwd(), fichero).split(path.sep).join("/");
  lineas.forEach((linea, i) => {
    for (const m of linea.matchAll(reLiteral)) {
      if (!fechaValida(Number(m[1]), Number(m[2]), Number(m[3]))) continue;
      if (m[0] < hoy) continue;
      const anotado = reAnotacion.test(linea) || (i > 0 && reAnotacion.test(lineas[i - 1]));
      if (anotado) anotados++;
      else sinAnotar.push(`${ruta}:${i + 1}: ${m[0]}`);
    }
  });
}

if (sinAnotar.length > 0) {
  for (const s of sinAnotar) console.log(s);
  console.log(
    `fechas-fijas: ${sinAnotar.length} literal(es) futuro(s) sin anotar (hoy = ${hoy}). ` +
      "Muévelo a un ancla relativa o anótalo (README, punto 10).",
  );
  process.exit(1);
}
console.log(
  `fechas-fijas: ${objetivos.length} fichero(s), ${anotados} literal(es) futuro(s) anotado(s), ninguno sin anotar (hoy = ${hoy}).`,
);
