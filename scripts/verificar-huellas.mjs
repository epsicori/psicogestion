#!/usr/bin/env node
// T-005 · `npm run verificar:huellas` — cáscara de `public.verificar_cadena_huellas()`
// (supabase/migrations/20260829210000_cadena_de_huellas.sql). Toda la lógica de
// verificación vive en SQL y lee los bytes guardados; este guion solo la invoca, imprime
// el primer eslabón roto de cada cadena con su paciente y su fecha, y decide el código de
// salida.
//
// El enganche a la ejecución nocturna NO se hace aquí (T-009, .github/**, territorio de
// MiniMax): este comando, su bandera --json y su código de salida distinto de cero son
// exactamente lo que ese ticket tiene que enganchar (ver docs/state.md).

import { localizarContenedor } from "./psql.mjs";
import { execFileSync } from "node:child_process";

// Mismo patrón que lib/huella/sobre.ts (PATRON_UUID): un UUID en minúsculas,
// sin más. Se valida ANTES de interpolar nada en SQL ejecutado como
// superusuario (hallazgo MEDIA de la revisión con Opus del 30-08-2026: sin
// esta comprobación, --paciente se concatenaba tal cual en una consulta
// ejecutada por `postgres`, y un valor como `x' union select version() -- `
// llegaba intacto hasta el parser SQL).
const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsearArgumentos(argv) {
  let json = false;
  let paciente = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") {
      json = true;
    } else if (argv[i] === "--paciente") {
      // `--paciente` sin nada detrás (fin de argv, o el siguiente token es
      // otra bandera) es un error de uso, no «verifica todas las cadenas en
      // silencio» (hallazgo MEDIA de la revisión con Opus).
      const valor = argv[i + 1];
      if (valor === undefined || valor.startsWith("--")) {
        console.error("--paciente exige un UUID detrás (p. ej. --paciente 11111111-1111-4111-8111-111111111111).");
        process.exit(2);
      }
      if (!PATRON_UUID.test(valor)) {
        console.error(`--paciente no es un UUID válido: «${valor}»`);
        process.exit(2);
      }
      paciente = valor.toLowerCase();
      i++;
    } else {
      console.error(`Argumento no reconocido: ${argv[i]}`);
      process.exit(2);
    }
  }
  return { json, paciente };
}

const { json, paciente } = parsearArgumentos(process.argv.slice(2));
const contenedor = localizarContenedor();

// `paciente` ya pasó PATRON_UUID.test() arriba (o es null): interpolar aquí
// es seguro porque el valor solo puede contener [0-9a-f-], nunca una comilla
// ni nada que el parser SQL pueda reinterpretar.
const argumento = paciente ? `'${paciente}'::uuid` : "null::uuid";
const consulta =
  `select coalesce(jsonb_agg(t order by t.paciente_id, t.posicion_cadena), '[]'::jsonb)::text ` +
  `from public.verificar_cadena_huellas(${argumento}) t;`;

let salida;
try {
  salida = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      contenedor,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
      "-c",
      consulta,
    ],
    { encoding: "utf8" },
  );
} catch (e) {
  console.error("No se pudo ejecutar verificar_cadena_huellas():");
  console.error(e.message);
  process.exit(1);
}

const anomalias = JSON.parse(salida.trim() || "[]");

if (json) {
  console.log(JSON.stringify(anomalias, null, 2));
  process.exit(anomalias.length > 0 ? 1 : 0);
}

if (anomalias.length === 0) {
  console.log("verificar:huellas — cadena íntegra: cero anomalías.");
  process.exit(0);
}

// El primer eslabón roto de cada cadena (paciente): la posición mínima
// entre las anomalías de ese paciente.
const primeraPorPaciente = new Map();
for (const a of anomalias) {
  const actual = primeraPorPaciente.get(a.paciente_id);
  if (!actual || a.posicion_cadena < actual.posicion_cadena) {
    primeraPorPaciente.set(a.paciente_id, a);
  }
}

console.error(`verificar:huellas — ${anomalias.length} anomalía(s) en ${primeraPorPaciente.size} cadena(s):`);
for (const a of primeraPorPaciente.values()) {
  console.error(
    `  · paciente ${a.paciente_id} — primer eslabón roto: posición ${a.posicion_cadena} ` +
      `(versión ${a.version_id}, nota ${a.nota_id}, creada ${a.creada_en}) — ${a.motivo}`,
  );
}

process.exit(1);
